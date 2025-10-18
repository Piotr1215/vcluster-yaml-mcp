/**
 * CLI handlers that bridge CLI commands to underlying logic
 * Reuses githubClient and validation logic from server.js
 * Returns structured data for CLI formatters
 */

import yaml from 'js-yaml';
import { githubClient } from './github.js';
import { validateSnippet } from './snippet-validator.js';

// Helper function to get the type of a value
function getType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  if (typeof value === 'number') {
    return Number.isInteger(value) ? 'integer' : 'number';
  }
  return typeof value;
}

// Helper function to rank search results
function rankResult(item, searchTerm) {
  const pathLower = item.path.toLowerCase();
  const keyLower = item.key.toLowerCase();
  let score = 0;

  // Exact match
  if (pathLower === searchTerm || keyLower === searchTerm) {
    score += 100;
  }

  // Starts with search term
  if (pathLower.startsWith(searchTerm) || keyLower.startsWith(searchTerm)) {
    score += 50;
  }

  // Ends with search term
  if (pathLower.endsWith(searchTerm) || keyLower.endsWith(searchTerm)) {
    score += 40;
  }

  // Contains search term
  if (pathLower.includes(searchTerm) || keyLower.includes(searchTerm)) {
    score += 30;
  }

  // Prefer leaf nodes (actual values)
  if (item.isLeaf) {
    score += 10;
  }

  // Prefer shorter paths (more specific)
  const pathDepth = item.path.split('.').length;
  score -= pathDepth;

  return score;
}

/**
 * Handle query command
 * Searches for configuration fields in vCluster YAML
 */
export async function handleQuery(query, options) {
  const version = options.version || 'main';
  const fileName = options.file || 'chart/values.yaml';

  let yamlData;

  try {
    yamlData = await githubClient.getYamlContent(fileName, version);
  } catch (error) {
    return {
      success: false,
      error: `Could not load ${fileName} from GitHub (version: ${version}). Error: ${error.message}`,
      metadata: {
        query,
        file: fileName,
        version
      }
    };
  }

  const searchTerm = query.toLowerCase();
  const results = [];

  // Helper function to extract all paths and values
  function extractInfo(obj, path = '') {
    const info = [];
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      for (const [key, value] of Object.entries(obj)) {
        const currentPath = path ? `${path}.${key}` : key;

        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          info.push({ path: currentPath, key, value, isLeaf: false });
          info.push(...extractInfo(value, currentPath));
        } else {
          info.push({ path: currentPath, key, value, isLeaf: true });
        }
      }
    }
    return info;
  }

  const allInfo = extractInfo(yamlData);

  // Support dot notation queries
  const isDotNotation = searchTerm.includes('.');

  if (isDotNotation) {
    // Exact and partial dot notation matching
    for (const item of allInfo) {
      const pathLower = item.path.toLowerCase();

      if (pathLower === searchTerm ||
          pathLower.endsWith(searchTerm) ||
          pathLower.includes(searchTerm)) {
        results.push(item);
      }
    }
  } else {
    // Keyword-based search
    const keywords = searchTerm.split(/\s+/);

    for (const item of allInfo) {
      const pathLower = item.path.toLowerCase();
      const keyLower = item.key.toLowerCase();
      const valueStr = JSON.stringify(item.value).toLowerCase();

      const allKeywordsMatch = keywords.every(kw =>
        pathLower.includes(kw) || keyLower.includes(kw) || valueStr.includes(kw)
      );

      if (allKeywordsMatch) {
        results.push(item);
      }
    }
  }

  // Sort results by relevance
  results.sort((a, b) => {
    const scoreA = rankResult(a, searchTerm);
    const scoreB = rankResult(b, searchTerm);
    return scoreB - scoreA;
  });

  // Format results for CLI output
  const formattedResults = results.slice(0, 50).map(item => ({
    field: item.path,
    value: item.value,
    type: getType(item.value),
    path: item.path,
    description: '' // Could be enhanced with comments parsing
  }));

  return {
    success: true,
    results: formattedResults,
    metadata: {
      query,
      file: fileName,
      version,
      resultCount: formattedResults.length,
      totalMatches: results.length
    }
  };
}

/**
 * Handle list-versions command
 * Lists available vCluster versions from GitHub
 */
export async function handleListVersions() {
  try {
    const tags = await githubClient.getTags();

    // Only show versions starting with 'v'
    const versionTags = tags.filter(tag => tag.startsWith('v'));

    // Always include main branch
    const versions = ['main', ...versionTags];

    return {
      success: true,
      versions,
      metadata: {
        totalCount: versions.length,
        source: 'github'
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to fetch versions: ${error.message}`,
      versions: [],
      metadata: {
        totalCount: 0,
        source: 'github'
      }
    };
  }
}

/**
 * Handle validate command
 * Validates vCluster YAML configuration
 */
export async function handleValidate(content, options) {
  const version = options.version || 'main';

  // Validate YAML syntax first
  let yamlData;
  try {
    yamlData = yaml.load(content);
  } catch (error) {
    return {
      success: false,
      valid: false,
      errors: [
        {
          path: 'root',
          message: error.message,
          type: 'syntax'
        }
      ],
      metadata: {
        version,
        contentLength: content.length
      }
    };
  }

  // Fetch schema for validation
  try {
    const schemaContent = await githubClient.getFileContent('chart/values.schema.json', version);
    const fullSchema = JSON.parse(schemaContent);

    // Use snippet validator
    const result = validateSnippet(
      content,
      fullSchema,
      version
    );

    if (result.valid) {
      return {
        success: true,
        valid: true,
        errors: [],
        metadata: {
          version,
          contentLength: content.length
        }
      };
    } else {
      // Format errors for CLI
      const errors = result.errors.map(err => ({
        path: err.instancePath || err.dataPath || 'root',
        message: err.message || 'Validation error',
        type: err.keyword || 'validation'
      }));

      return {
        success: true,
        valid: false,
        errors,
        metadata: {
          version,
          contentLength: content.length
        }
      };
    }
  } catch (error) {
    return {
      success: false,
      valid: false,
      errors: [
        {
          path: 'root',
          message: `Failed to load schema: ${error.message}`,
          type: 'schema-error'
        }
      ],
      metadata: {
        version,
        contentLength: content.length
      }
    };
  }
}
