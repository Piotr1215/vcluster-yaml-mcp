/**
 * Output formatters for CLI
 * Provides JSON, YAML, and table formatting for command outputs
 */

import yaml from 'js-yaml';
import Table from 'cli-table3';
import chalk from 'chalk';

/**
 * Format output as JSON
 * Always returns valid JSON that can be parsed with JSON.parse()
 */
export function formatJSON(data) {
  return JSON.stringify(data, null, 2);
}

/**
 * Format output as YAML
 * Always returns valid YAML that can be parsed with yaml.load()
 */
export function formatYAML(data) {
  return yaml.dump(data, {
    indent: 2,
    lineWidth: 120,
    noRefs: true
  });
}

/**
 * Format query results as a table
 * Returns formatted table with box-drawing characters and colored headers
 */
export function formatQueryTable(results, metadata) {
  // Handle empty results
  if (!results || results.length === 0) {
    return `No results found for query: "${metadata.query}"`;
  }

  const table = new Table({
    head: [
      chalk.cyan('Field'),
      chalk.cyan('Value'),
      chalk.cyan('Type'),
      chalk.cyan('Description')
    ],
    style: {
      head: [],
      border: []
    }
  });

  results.forEach(result => {
    table.push([
      result.field || result.path || '',
      formatValue(result.value),
      result.type || '',
      result.description || ''
    ]);
  });

  return table.toString();
}

/**
 * Format list-versions results as a table
 */
export function formatVersionsTable(versions) {
  if (!versions || versions.length === 0) {
    return 'No versions found';
  }

  const table = new Table({
    head: [chalk.cyan('Version')],
    style: {
      head: [],
      border: []
    }
  });

  versions.forEach(version => {
    table.push([version]);
  });

  return table.toString();
}

/**
 * Format validation results as a table
 */
export function formatValidationTable(data) {
  if (data.valid) {
    return chalk.green('✓ Configuration is valid');
  }

  let output = chalk.red('✗ Configuration has errors:\n');

  const table = new Table({
    head: [
      chalk.cyan('Path'),
      chalk.cyan('Error'),
      chalk.cyan('Type')
    ],
    style: {
      head: [],
      border: []
    }
  });

  data.errors.forEach(error => {
    table.push([
      error.path || 'root',
      error.message || '',
      error.type || ''
    ]);
  });

  output += table.toString();
  return output;
}

/**
 * Helper function to format values for table display
 * Truncates long values and handles different types
 */
function formatValue(value) {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'object') {
    const str = JSON.stringify(value);
    return str.length > 50 ? str.substring(0, 47) + '...' : str;
  }

  const str = String(value);
  return str.length > 50 ? str.substring(0, 47) + '...' : str;
}

/**
 * Main formatter function
 * Routes to appropriate formatter based on format option
 */
export function formatOutput(data, format, command) {
  switch (format) {
    case 'json':
      return formatJSON(data);

    case 'yaml':
      return formatYAML(data);

    case 'table':
      // Route to appropriate table formatter based on command/data shape
      if (command === 'query' || data.results !== undefined) {
        return formatQueryTable(data.results || [], data.metadata || {});
      } else if (command === 'list-versions' || data.versions !== undefined) {
        return formatVersionsTable(data.versions || []);
      } else if (command === 'validate' || data.valid !== undefined) {
        return formatValidationTable(data);
      } else {
        // Fallback: format entire data object as JSON in table
        return formatJSON(data);
      }

    default:
      throw new Error(`Unknown format: ${format}`);
  }
}
