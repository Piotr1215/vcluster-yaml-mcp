/**
 * Deterministic schema validation - validates user config against GitHub schema
 * NO hardcoded schema structures - everything is dynamic
 */

/**
 * Validate user config against vCluster JSON schema
 * @param {Object} userConfig - User's parsed YAML configuration
 * @param {Object} schema - JSON schema from GitHub (chart/values.schema.json)
 * @param {string} version - vCluster version being validated against
 * @returns {Object} Validation result
 */
export function validateConfigAgainstSchema(userConfig, schema, version) {
  const errors = [];
  const warnings = [];
  const contextErrors = [];

  // Extract all paths from user config
  const userPaths = extractAllPaths(userConfig);

  // Validate each path against the schema
  for (const { path, value } of userPaths) {
    const validation = validatePath(path, value, schema);

    if (!validation.valid) {
      errors.push({
        path,
        severity: 'error',
        error: validation.error,
        suggestion: validation.suggestion,
        correct_alternatives: validation.alternatives || []
      });
    }

    // If path is valid, check type and enum constraints
    if (validation.valid && validation.schemaNode) {
      const typeCheck = validateType(value, validation.schemaNode, path);
      if (!typeCheck.valid) {
        errors.push({
          path,
          severity: 'error',
          error: typeCheck.error,
          expected_type: typeCheck.expectedType,
          actual_type: typeCheck.actualType,
          fix: typeCheck.fix
        });
      }

      // Check enum constraints
      if (validation.schemaNode.enum) {
        const enumCheck = validateEnum(value, validation.schemaNode.enum, path);
        if (!enumCheck.valid) {
          errors.push({
            path,
            severity: 'error',
            error: enumCheck.error,
            allowed_values: validation.schemaNode.enum,
            actual_value: value
          });
        }
      }
    }
  }

  // Check for conflicting configurations
  const conflicts = detectConflicts(userConfig);
  contextErrors.push(...conflicts);

  // Check required fields
  const missing = checkRequiredFields(userConfig, schema);
  errors.push(...missing);

  const schema_valid = errors.length === 0;
  const deploy_safe = errors.length === 0 && contextErrors.length === 0;

  return {
    syntax_valid: true,
    schema_valid,
    deploy_safe,
    version,
    errors,
    warnings,
    context_errors: contextErrors,
    summary: generateSummary(errors, contextErrors, deploy_safe)
  };
}

/**
 * Extract all paths from user config with values
 */
function extractAllPaths(obj, prefix = '') {
  const paths = [];

  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const [key, value] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${key}` : key;
      paths.push({ path, value });

      // Recurse for nested objects
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        paths.push(...extractAllPaths(value, path));
      }
    }
  }

  return paths;
}

/**
 * Validate if a path exists in schema
 */
function validatePath(path, value, schema) {
  const parts = path.split('.');
  let current = schema.properties || schema;
  let schemaNode = null;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    if (!current || !current[part]) {
      // Path doesn't exist in schema
      return {
        valid: false,
        error: `Path does not exist in schema`,
        suggestion: `Path '${path}' not found in schema`,
        alternatives: findSimilarPaths(path, schema)
      };
    }

    schemaNode = current[part];

    // Navigate deeper
    if (schemaNode.properties) {
      current = schemaNode.properties;
    } else if (schemaNode.additionalProperties) {
      current = schemaNode.additionalProperties;
    } else if (i < parts.length - 1) {
      // Can't go deeper but we're not at the end
      if (typeof value === 'object' && value !== null) {
        return {
          valid: false,
          error: `Path '${parts.slice(0, i + 1).join('.')}' is a leaf node`,
          suggestion: `Remove nested properties under '${parts.slice(0, i + 1).join('.')}'`
        };
      }
    }
  }

  return {
    valid: true,
    schemaNode
  };
}

/**
 * Find similar paths in schema for suggestions
 */
function findSimilarPaths(targetPath, schema, maxSuggestions = 3) {
  const allPaths = extractSchemaPaths(schema);
  const targetParts = targetPath.toLowerCase().split('.');
  const targetLast = targetParts[targetParts.length - 1];

  const scored = allPaths.map(schemaPath => {
    const parts = schemaPath.toLowerCase().split('.');
    const last = parts[parts.length - 1];

    let score = 0;
    if (last === targetLast) score += 10;
    if (last.includes(targetLast) || targetLast.includes(last)) score += 5;

    // Shared prefix
    const sharedPrefix = getSharedPrefix(targetParts, parts);
    score += sharedPrefix * 2;

    return { path: schemaPath, score };
  });

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSuggestions)
    .map(s => s.path);
}

/**
 * Extract all paths from schema
 */
function extractSchemaPaths(schema, prefix = '') {
  const paths = [];
  const props = schema.properties || schema;

  if (props && typeof props === 'object') {
    for (const [key, value] of Object.entries(props)) {
      const path = prefix ? `${prefix}.${key}` : key;
      paths.push(path);

      if (value && value.properties) {
        paths.push(...extractSchemaPaths(value, path));
      }
    }
  }

  return paths;
}

/**
 * Get shared prefix length
 */
function getSharedPrefix(arr1, arr2) {
  let count = 0;
  const minLen = Math.min(arr1.length, arr2.length);

  for (let i = 0; i < minLen; i++) {
    if (arr1[i] === arr2[i]) count++;
    else break;
  }

  return count;
}

/**
 * Validate value type
 */
function validateType(value, schemaNode, path) {
  const expectedType = schemaNode.type;
  const actualType = getValueType(value);

  if (!expectedType) {
    return { valid: true };
  }

  const expectedTypes = Array.isArray(expectedType) ? expectedType : [expectedType];

  if (!expectedTypes.includes(actualType)) {
    if (value === null && expectedTypes.includes('null')) {
      return { valid: true };
    }

    return {
      valid: false,
      error: `Type mismatch`,
      expectedType: expectedTypes.join(' or '),
      actualType,
      fix: `Change value to type: ${expectedTypes.join(' or ')}`
    };
  }

  return { valid: true };
}

/**
 * Get JavaScript type
 */
function getValueType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'object') return 'object';
  return 'unknown';
}

/**
 * Validate enum constraints
 */
function validateEnum(value, allowedValues, path) {
  if (!allowedValues.includes(value)) {
    return {
      valid: false,
      error: `Value '${value}' not in allowed values: ${allowedValues.join(', ')}`
    };
  }

  return { valid: true };
}

/**
 * Detect conflicting configurations
 */
function detectConflicts(userConfig) {
  const conflicts = [];

  // Check multiple distros enabled
  if (userConfig.controlPlane?.distro) {
    const distros = userConfig.controlPlane.distro;
    const enabled = [];

    if (distros.k3s?.enabled === true) enabled.push('k3s');
    if (distros.k8s?.enabled === true) enabled.push('k8s');
    if (distros.k0s?.enabled === true) enabled.push('k0s');
    if (distros.eks?.enabled === true) enabled.push('eks');

    if (enabled.length > 1) {
      conflicts.push({
        issue: 'Multiple distros enabled',
        severity: 'error',
        conflicting_paths: enabled.map(d => `controlPlane.distro.${d}.enabled: true`),
        error: 'Only one distro can be enabled at a time',
        fix: `Set only one distro to enabled: true. Currently: ${enabled.join(', ')}`
      });
    }
  }

  return conflicts;
}

/**
 * Check required fields
 */
function checkRequiredFields(userConfig, schema) {
  const errors = [];
  const required = schema.required || [];

  for (const field of required) {
    if (!(field in userConfig)) {
      errors.push({
        path: field,
        severity: 'error',
        error: `Required field '${field}' is missing`,
        fix: `Add '${field}' to configuration`
      });
    }
  }

  return errors;
}

/**
 * Generate summary
 */
function generateSummary(errors, contextErrors, deploySafe) {
  const errorCount = errors.length;
  const contextErrorCount = contextErrors.length;
  const totalIssues = errorCount + contextErrorCount;

  if (deploySafe) {
    return {
      deploy_safe: true,
      message: 'Configuration is valid and safe to deploy',
      total_errors: 0
    };
  }

  return {
    deploy_safe: false,
    message: `Configuration contains ${totalIssues} error(s) and will fail deployment. Fix required before creating vCluster.`,
    total_errors: totalIssues,
    severity: 'error'
  };
}
