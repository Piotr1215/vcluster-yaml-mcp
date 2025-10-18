/**
 * Snippet Validator - AJV-based validation for partial YAML configs
 * Enables deterministic validation of vCluster config snippets without requiring full documents
 */

import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import yaml from 'js-yaml';

/**
 * Validator cache to avoid recompiling schemas
 * Maps schema section paths to compiled AJV validators
 */
class ValidatorCache {
  constructor(maxSize = 20) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.currentVersion = null;
  }

  /**
   * Get cached validator or return null
   */
  get(sectionPath, version) {
    if (this.currentVersion !== version) {
      this.clear();
      this.currentVersion = version;
      return null;
    }

    const key = `${version}:${sectionPath}`;
    return this.cache.get(key) || null;
  }

  /**
   * Set validator in cache
   */
  set(sectionPath, version, validator) {
    const key = `${version}:${sectionPath}`;

    // Evict oldest entry if cache is full
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, validator);
  }

  /**
   * Clear cache (e.g., on version change)
   */
  clear() {
    this.cache.clear();
  }

  /**
   * Get cache stats
   */
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      version: this.currentVersion
    };
  }
}

// Global validator cache instance
const validatorCache = new ValidatorCache(20);

/**
 * Detect which schema section a snippet belongs to
 * @param {Object} parsedSnippet - Parsed YAML snippet
 * @param {Object} fullSchema - Full vCluster JSON schema
 * @returns {string|null} Schema section path (e.g., "controlPlane", "sync.toHost")
 */
export function detectSchemaSection(parsedSnippet, fullSchema) {
  if (!parsedSnippet || typeof parsedSnippet !== 'object') {
    return null;
  }

  const topLevelKeys = Object.keys(parsedSnippet);
  if (topLevelKeys.length === 0) {
    return null;
  }

  // First, check if top-level keys are valid schema sections
  const schemaProps = fullSchema.properties || {};
  const validTopLevelSections = Object.keys(schemaProps);

  // Find matching top-level sections
  const matchingSections = topLevelKeys.filter(key =>
    validTopLevelSections.includes(key)
  );

  if (matchingSections.length > 0) {
    // If multiple sections found, return the first one (user can provide hint)
    return matchingSections[0];
  }

  // If no top-level match, check if keys might be nested properties
  // Look for potential parent sections by checking if keys exist in sub-properties
  for (const section of validTopLevelSections) {
    const sectionSchema = schemaProps[section];
    if (sectionSchema && sectionSchema.properties) {
      const hasMatch = topLevelKeys.some(key =>
        key in sectionSchema.properties
      );

      if (hasMatch) {
        // Check if ALL keys are in this section
        const allMatch = topLevelKeys.every(key =>
          key in sectionSchema.properties
        );

        if (allMatch) {
          return section;
        }
      }
    }
  }

  // Couldn't detect section automatically
  return null;
}

/**
 * Extract sub-schema for a specific section
 * @param {Object} fullSchema - Full vCluster JSON schema
 * @param {string} sectionPath - Dot-notation path (e.g., "controlPlane", "sync.toHost")
 * @returns {Object|null} Isolated sub-schema for that section
 */
export function extractSubSchema(fullSchema, sectionPath) {
  if (!sectionPath) {
    return null;
  }

  const pathParts = sectionPath.split('.');
  let current = fullSchema.properties || fullSchema;

  // Navigate to the target schema node
  for (let i = 0; i < pathParts.length; i++) {
    const part = pathParts[i];

    if (!current || !current[part]) {
      return null;
    }

    current = current[part];

    // If there are more parts to traverse, move into properties
    if (i < pathParts.length - 1) {
      if (current.properties) {
        current = current.properties;
      } else {
        // Can't go deeper
        return null;
      }
    }
  }

  // Return the schema node we found
  return current;
}

/**
 * Create AJV instance configured for vCluster validation
 * @returns {Ajv} Configured AJV instance
 */
function createAjvInstance() {
  const ajv = new Ajv({
    allErrors: true,      // Return all errors, not just first
    strict: false,        // Allow unknown keywords
    validateFormats: true // Validate format constraints
  });

  addFormats(ajv);        // Add format validators (email, uri, etc.)

  return ajv;
}

/**
 * Validate YAML snippet against vCluster schema
 * @param {string} snippetYaml - YAML snippet string
 * @param {Object} fullSchema - Full vCluster JSON schema
 * @param {string} version - vCluster version
 * @param {string|null} sectionHint - Optional hint for schema section
 * @returns {Object} Validation result with errors
 */
export function validateSnippet(snippetYaml, fullSchema, version, sectionHint = null) {
  const startTime = Date.now();
  const MAX_YAML_SIZE = 1024 * 1024; // 1MB

  // Check YAML size limit
  if (snippetYaml.length > MAX_YAML_SIZE) {
    return {
      valid: false,
      error: 'YAML exceeds 1MB limit',
      size_bytes: snippetYaml.length,
      max_size_bytes: MAX_YAML_SIZE,
      elapsed_ms: Date.now() - startTime
    };
  }

  // Parse YAML
  let parsedSnippet;
  try {
    parsedSnippet = yaml.load(snippetYaml);
  } catch (yamlError) {
    return {
      valid: false,
      syntax_valid: false,
      syntax_error: yamlError.message,
      elapsed_ms: Date.now() - startTime
    };
  }

  if (!parsedSnippet || typeof parsedSnippet !== 'object') {
    return {
      valid: false,
      error: 'Snippet must be a valid YAML object',
      elapsed_ms: Date.now() - startTime
    };
  }

  // Detect if this is a full document or a snippet
  const topLevelKeys = Object.keys(parsedSnippet);
  const schemaProps = fullSchema.properties || {};
  const validTopLevelSections = Object.keys(schemaProps);

  // Find all matching top-level sections
  const matchingSections = topLevelKeys.filter(key =>
    validTopLevelSections.includes(key)
  );

  // Determine if this is a full document or single section snippet
  const isFullDocument = matchingSections.length > 1;
  const isSingleSectionAtRoot = matchingSections.length === 1;

  let section = sectionHint;
  let validationSchema;
  let cacheKey;

  if (isFullDocument) {
    // Multiple top-level sections = validate as full document
    section = '__full_document__';
    cacheKey = `__full__:${version}`;

    // Build schema with only the sections present in the snippet
    const snippetSchema = {
      type: 'object',
      properties: {},
      additionalProperties: false,
      $defs: fullSchema.$defs || fullSchema.definitions
    };

    for (const key of matchingSections) {
      snippetSchema.properties[key] = schemaProps[key];
    }

    validationSchema = snippetSchema;
  } else {
    // Single section or nested snippet
    if (!section) {
      section = detectSchemaSection(parsedSnippet, fullSchema);
    }

    if (!section) {
      return {
        valid: false,
        error: 'Could not detect schema section. Please provide a "section" hint.',
        hint: 'Available sections: ' + validTopLevelSections.join(', '),
        snippet_keys: topLevelKeys,
        elapsed_ms: Date.now() - startTime
      };
    }

    cacheKey = `${section}:${version}`;

    // Extract sub-schema
    const subSchema = extractSubSchema(fullSchema, section);

    if (!subSchema) {
      return {
        valid: false,
        error: `Section "${section}" not found in schema`,
        available_sections: validTopLevelSections,
        elapsed_ms: Date.now() - startTime
      };
    }

    // Create schema wrapper for validation
    const hasSectionKey = topLevelKeys.includes(section);

    if (hasSectionKey) {
      // Snippet includes the section key (e.g., "controlPlane: {...}")
      validationSchema = {
        type: 'object',
        properties: {
          [section]: subSchema
        },
        additionalProperties: false,
        $defs: fullSchema.$defs || fullSchema.definitions
      };
    } else {
      // Snippet is the content of the section
      if (subSchema.$ref) {
        validationSchema = {
          ...subSchema,
          $defs: fullSchema.$defs || fullSchema.definitions
        };
      } else {
        validationSchema = subSchema;
      }
    }
  }

  // Check cache
  let validate = validatorCache.get(cacheKey, version);

  if (!validate) {
    // Compile schema
    const ajv = createAjvInstance();
    try {
      validate = ajv.compile(validationSchema);
      validatorCache.set(cacheKey, version, validate);
    } catch (compileError) {
      return {
        valid: false,
        error: 'Schema compilation error',
        details: compileError.message,
        elapsed_ms: Date.now() - startTime
      };
    }
  }

  // Validate snippet
  const valid = validate(parsedSnippet);

  const result = {
    valid,
    syntax_valid: true,
    section,
    version,
    elapsed_ms: Date.now() - startTime
  };

  if (!valid && validate.errors) {
    // Format errors with snippet context
    result.errors = validate.errors.map(err => {
      const errorPath = err.instancePath ? `${section}${err.instancePath}` : section;
      return {
        path: errorPath,
        message: err.message,
        keyword: err.keyword,
        params: err.params,
        context: `in ${errorPath}`
      };
    });

    // Add summary
    result.summary = `Found ${result.errors.length} validation error(s) in section "${section}"`;
  }

  return result;
}

/**
 * Get validator cache stats (for monitoring/debugging)
 * @returns {Object} Cache statistics
 */
export function getCacheStats() {
  return validatorCache.getStats();
}

/**
 * Clear validator cache (useful for testing or version switches)
 */
export function clearCache() {
  validatorCache.clear();
}
