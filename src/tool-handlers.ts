/**
 * Pure tool handler functions
 * Each handler is a pure function: input → output (no side effects except I/O)
 * Easy to test in isolation
 */

import { validateSnippet } from './snippet-validator.js';
import { extractValidationRulesFromComments } from './validation-rules.js';
import type {
  McpToolResponse,
  GitHubClientInterface,
  ValidationResult,
  YamlInfoItem,
  CreateConfigOptions,
  QueryOptions,
  ValidateConfigOptions,
  ExtractRulesOptions
} from './types/index.js';

// ============================================================================
// RESPONSE BUILDERS (Pure Functions)
// ============================================================================

/**
 * Build success response
 * Pure function: same input → same output
 */
export function buildSuccessResponse(text: string): McpToolResponse {
  return {
    content: [{ type: 'text', text }],
    isError: false
  };
}

/**
 * Build error response
 * Pure function: same input → same output
 */
export function buildErrorResponse(text: string): McpToolResponse {
  return {
    content: [{ type: 'text', text }],
    isError: true
  };
}

// ============================================================================
// FORMATTING (Pure Functions)
// ============================================================================

interface FormatValidationOptions {
  yaml_content: string;
  description?: string;
  version: string;
}

/**
 * Format validation result to markdown
 * Pure function - no side effects
 */
export function formatValidationResult(
  result: ValidationResult,
  { yaml_content, description, version }: FormatValidationOptions
): string {
  let response = '';

  if (description) {
    response += `## ${description}\n\n`;
  }

  if (result.valid) {
    response += `✅ **Configuration validated successfully!**\n\n`;
    response += `Version: ${version}\n`;
    if (result.section) {
      response += `Section: ${result.section}\n`;
    }
    response += `Validation time: ${result.elapsed_ms}ms\n\n`;
    response += `### Configuration:\n\`\`\`yaml\n${yaml_content}\n\`\`\`\n`;
  } else {
    response += `❌ **Validation failed**\n\n`;

    if (result.syntax_valid === false) {
      response += `**Syntax Error:**\n${result.syntax_error}\n\n`;
    } else if (result.errors && result.errors.length > 0) {
      response += `**Validation Errors:**\n`;
      result.errors.forEach((err, idx) => {
        response += `${idx + 1}. **${err.path}**: ${err.message}\n`;
      });
      response += `\n`;
    } else if (result.error) {
      response += `**Error:** ${result.error}\n\n`;
      if (result.hint) {
        response += `**Hint:** ${result.hint}\n\n`;
      }
    }
    response += `### Provided Configuration:\n\`\`\`yaml\n${yaml_content}\n\`\`\`\n`;
  }

  return response;
}

/**
 * Format versions list
 * Pure function
 */
export function formatVersionsList(versions: string[]): string {
  const display = versions.slice(0, 20);
  const more = versions.length > 20 ? `... and ${versions.length - 20} more\n` : '';

  return `Available vCluster versions:\n\n${display.map(v => `- ${v}`).join('\n')}\n${more}`;
}

interface FormatQueryOptions {
  query: string;
  fileName: string;
  version: string;
  maxResults: number;
}

/**
 * Format query results
 * Pure function
 */
export function formatQueryResults(
  results: YamlInfoItem[],
  { query, fileName, version, maxResults }: FormatQueryOptions
): string {
  const limitedResults = results.slice(0, maxResults);
  const hasMore = results.length > maxResults;

  const formattedResults = limitedResults.map((item, idx) =>
    formatMatch(item, idx, limitedResults.length)
  );

  return `Found ${results.length} match${results.length === 1 ? '' : 'es'} for "${query}" in ${fileName} (${version})\n\n` +
         formattedResults.join('\n') +
         (hasMore ? `\n\n... showing ${maxResults} of ${results.length} total matches` : '');
}

/**
 * Format single match
 * Pure function
 */
function formatMatch(item: YamlInfoItem, idx: number, total: number): string {
  const prefix = `**[${idx + 1}/${total}]** \`${item.path}\``;

  if (item.isLeaf) {
    const valueStr = JSON.stringify(item.value, null, 2);
    return `${prefix}\n\`\`\`\n${valueStr}\n\`\`\`\n`;
  } else {
    const keys = Object.keys((item.value as Record<string, unknown>) ?? {});
    return `${prefix}\n  Contains: ${keys.join(', ')}\n`;
  }
}

interface FormatNoMatchesOptions {
  query: string;
  fileName: string;
  version: string;
  similarPaths: string[];
  yamlData: Record<string, unknown> | null;
}

/**
 * Format no-match message
 * Pure function
 */
export function formatNoMatches({
  query,
  fileName,
  version,
  similarPaths,
  yamlData
}: FormatNoMatchesOptions): string {
  return `No matches found for "${query}" in ${fileName} (${version}).\n\n` +
         (similarPaths.length > 0 ? `Similar paths:\n${similarPaths.map(p => `  - ${p}`).join('\n')}\n\n` : '') +
         `Tips:\n` +
         `  - Use dot notation: "controlPlane.ingress.enabled"\n` +
         `  - Try broader terms: "${query.split('.')[0] ?? query.split(/\s+/)[0] ?? query}"\n` +
         `  - Use extract-validation-rules for section details\n\n` +
         `Top-level sections:\n${Object.keys(yamlData ?? {}).map(k => `  - ${k}`).join('\n')}`;
}

// ============================================================================
// TOOL HANDLERS (Each is a pure async function)
// ============================================================================

interface JsonSchema {
  [key: string]: unknown;
}

/**
 * Handle: create-vcluster-config
 * Pure function except for I/O (githubClient)
 */
export async function handleCreateConfig(
  args: CreateConfigOptions,
  githubClient: GitHubClientInterface
): Promise<McpToolResponse> {
  const { yaml_content, description, version = 'main' } = args;

  const schemaContent = await githubClient.getFileContent('chart/values.schema.json', version);
  const fullSchema = JSON.parse(schemaContent) as JsonSchema;

  const validationResult = validateSnippet(
    yaml_content,
    fullSchema,
    version,
    null  // Auto-detect section
  );

  const formattedResponse = formatValidationResult(validationResult, {
    yaml_content,
    description,
    version
  });

  return {
    content: [{ type: 'text', text: formattedResponse }],
    isError: !validationResult.valid
  };
}

/**
 * Handle: list-versions
 * Pure function except for I/O
 */
export async function handleListVersions(
  _args: Record<string, unknown>,
  githubClient: GitHubClientInterface
): Promise<McpToolResponse> {
  const tags = await githubClient.getTags();
  const versionTags = tags.filter(tag => tag.startsWith('v'));
  const versions = ['main', ...versionTags];

  const formatted = formatVersionsList(versions);
  return buildSuccessResponse(formatted);
}

/**
 * Handle: smart-query
 * Pure function except for I/O
 * CRITICAL: Must never fail - always return helpful results or fallback
 */
export async function handleSmartQuery(
  args: QueryOptions,
  githubClient: GitHubClientInterface
): Promise<McpToolResponse> {
  const { query, version = 'main', file = 'chart/values.yaml' } = args;

  try {
    const yamlData = await githubClient.getYamlContent(file, version) as Record<string, unknown>;
    const searchTerm = query.toLowerCase();

    // Extract all paths (pure function)
    const allInfo = extractYamlInfo(yamlData);

    // Search (pure function)
    const results = searchYaml(allInfo, searchTerm);

    // Handle no matches
    if (results.length === 0) {
      const similarPaths = findSimilarPaths(allInfo, searchTerm);
      const formatted = formatNoMatches({ query, fileName: file, version, similarPaths, yamlData });
      return buildSuccessResponse(formatted);
    }

    // Sort by relevance (pure function)
    const sorted = sortByRelevance(results, searchTerm);

    // Format results
    const formatted = formatQueryResults(sorted, {
      query,
      fileName: file,
      version,
      maxResults: 50
    });

    return buildSuccessResponse(formatted);
  } catch (error) {
    // Graceful fallback - always provide helpful message
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorMsg = errorMessage.includes('Timeout')
      ? `⏱️ Request timed out while fetching ${file} (version: ${version}).\n\n**Suggestions:**\n- Try a different version (e.g., "v0.29.1")\n- The file might be temporarily unavailable\n- Check if the file path is correct`
      : `❌ Error searching for "${query}" in ${file} (version: ${version}):\n${errorMessage}\n\n**Suggestions:**\n- Try "list-versions" to see available versions\n- Verify the file path is correct`;

    return buildSuccessResponse(errorMsg);
  }
}

/**
 * Handle: extract-validation-rules
 * Pure function except for I/O
 */
export async function handleExtractRules(
  args: ExtractRulesOptions,
  githubClient: GitHubClientInterface
): Promise<McpToolResponse> {
  const { version = 'main', file = 'chart/values.yaml', section } = args;

  try {
    const content = await githubClient.getFileContent(file, version);
    const rules = extractValidationRulesFromComments(content, section);

    // Remove originalComments to reduce response size
    const optimizedRules = {
      ...rules,
      rules: rules.rules.map(r => ({
        path: r.path,
        instructions: r.instructions
      }))
    };

    // No pretty-printing to reduce size
    return buildSuccessResponse(JSON.stringify(optimizedRules));
  } catch (error) {
    return buildErrorResponse(`Failed to extract validation rules: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Handle: validate-config
 * Pure function except for I/O
 */
export async function handleValidateConfig(
  args: ValidateConfigOptions,
  githubClient: GitHubClientInterface
): Promise<McpToolResponse> {
  const { version = 'main', content, file } = args;

  // Get YAML content
  let yamlContent: string;
  if (content) {
    yamlContent = content;
  } else if (file) {
    yamlContent = await githubClient.getFileContent(file, version);
  } else {
    yamlContent = await githubClient.getFileContent('chart/values.yaml', version);
  }

  // Get schema
  const schemaContent = await githubClient.getFileContent('chart/values.schema.json', version);
  const schema = JSON.parse(schemaContent) as JsonSchema;

  // Validate (pure function)
  const result = validateSnippet(yamlContent, schema, version, null);

  return buildSuccessResponse(JSON.stringify(result, null, 2));
}

// ============================================================================
// QUERY HELPERS (Pure Functions)
// ============================================================================

/**
 * Extract all paths and values from YAML
 * Pure function
 */
export function extractYamlInfo(obj: unknown, path: string = ''): YamlInfoItem[] {
  const info: YamlInfoItem[] = [];

  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    const record = obj as Record<string, unknown>;
    for (const [key, value] of Object.entries(record)) {
      const currentPath = path ? `${path}.${key}` : key;

      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        info.push({ path: currentPath, key, value, isLeaf: false });
        info.push(...extractYamlInfo(value, currentPath));
      } else {
        info.push({ path: currentPath, key, value, isLeaf: true });
      }
    }
  }

  return info;
}

/**
 * Search YAML info for query
 * Pure function
 */
export function searchYaml(allInfo: YamlInfoItem[], searchTerm: string): YamlInfoItem[] {
  const results: YamlInfoItem[] = [];
  const isDotNotation = searchTerm.includes('.');

  if (isDotNotation) {
    // Exact and partial dot notation matching
    for (const item of allInfo) {
      const pathLower = item.path.toLowerCase();

      if (pathLower === searchTerm) {
        results.push(item);
      } else if (pathLower.endsWith(searchTerm)) {
        results.push(item);
      } else if (pathLower.includes(searchTerm)) {
        results.push(item);
      }
    }
  } else {
    // Keyword-based search with stop word filtering
    const stopWords = new Set([
      'how', 'to', 'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
      'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought',
      'used', 'for', 'from', 'with', 'about', 'against', 'between', 'into', 'through',
      'during', 'before', 'after', 'above', 'below', 'up', 'down', 'in', 'out', 'on',
      'off', 'over', 'under', 'again', 'further', 'then', 'once', 'here', 'there',
      'when', 'where', 'why', 'what', 'which', 'who', 'whom', 'this', 'that', 'these',
      'those', 'am', 'and', 'but', 'if', 'or', 'because', 'as', 'until', 'while',
      'of', 'at', 'by', 'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves',
      'you', 'your', 'yours', 'yourself', 'yourselves', 'he', 'him', 'his', 'himself',
      'she', 'her', 'hers', 'herself', 'it', 'its', 'itself', 'they', 'them', 'their',
      'theirs', 'themselves', 'each', 'few', 'more', 'most', 'other', 'some', 'such',
      'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 's', 't',
      'just', 'don', 'now', 'get', 'set', 'use', 'using', 'configure', 'configuration'
    ]);

    // Filter out stop words and short words
    const allWords = searchTerm.split(/\s+/);
    const keywords = allWords.filter(kw => kw.length > 2 && !stopWords.has(kw));

    // If all words were stop words, fall back to original (but filter very short ones)
    const effectiveKeywords = keywords.length > 0 ? keywords : allWords.filter(w => w.length > 2);

    for (const item of allInfo) {
      const pathLower = item.path.toLowerCase();
      const keyLower = item.key.toLowerCase();
      const valueStr = JSON.stringify(item.value).toLowerCase();

      // Match if ANY meaningful keyword matches (more lenient for natural language)
      const anyKeywordMatch = effectiveKeywords.some(kw =>
        pathLower.includes(kw) || keyLower.includes(kw) || valueStr.includes(kw)
      );

      if (anyKeywordMatch) {
        results.push(item);
      }
    }
  }

  return results;
}

/**
 * Find similar paths
 * Pure function
 */
export function findSimilarPaths(allInfo: YamlInfoItem[], searchTerm: string): string[] {
  return allInfo
    .filter(item => {
      const pathParts = item.path.toLowerCase().split('.');
      return pathParts.some(part => part.includes(searchTerm) || searchTerm.includes(part));
    })
    .slice(0, 5)
    .map(item => item.path);
}

/**
 * Sort results by relevance
 * Pure function
 */
export function sortByRelevance(results: YamlInfoItem[], searchTerm: string): YamlInfoItem[] {
  return [...results].sort((a, b) => {
    const scoreA = rankResult(a, searchTerm);
    const scoreB = rankResult(b, searchTerm);
    return scoreB - scoreA;
  });
}

/**
 * Rank search result
 * Pure function
 */
function rankResult(item: YamlInfoItem, searchTerm: string): number {
  let score = 0;
  const pathLower = item.path.toLowerCase();
  const keyLower = item.key.toLowerCase();

  // Exact path match (highest priority)
  if (pathLower === searchTerm) score += 100;

  // Exact key match
  if (keyLower === searchTerm) score += 50;

  // Path contains exact term
  if (pathLower.includes(searchTerm)) score += 20;

  // Key contains term
  if (keyLower.includes(searchTerm)) score += 10;

  // Leaf nodes are more relevant
  if (item.isLeaf) score += 5;

  return score;
}
