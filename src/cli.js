#!/usr/bin/env node

/**
 * vCluster CLI - Standalone command-line interface
 * Provides query, validate, and list-versions commands
 * Wraps MCP server functionality with user-friendly CLI
 */

import { Command } from 'commander';
import { handleQuery, handleListVersions, handleValidate } from './cli-handlers.js';
import { formatOutput } from './formatters.js';
import { readContentSource } from './cli-utils.js';

const program = new Command();

program
  .name('vcluster-yaml')
  .description('vCluster YAML configuration CLI')
  .version('0.1.0');

// Query command
program
  .command('query <query>')
  .description('Search for vCluster configuration fields')
  .option('--file <file>', 'Configuration file to search', 'chart/values.yaml')
  .option('-s, --schema-version <version>', 'vCluster version or branch', 'main')
  .option('-f, --format <format>', 'Output format (json, yaml, table)', 'json')
  .addHelpText('after', `
Examples:
  $ vcluster-yaml query sync
  $ vcluster-yaml query sync --schema-version v0.24.0
  $ vcluster-yaml query "controlPlane.replicas" --format table
  `)
  .action(async (query, options) => {
    try {
      // Validate format option
      if (!['json', 'yaml', 'table'].includes(options.format)) {
        console.error(`Error: Invalid format "${options.format}". Must be one of: json, yaml, table`);
        process.exit(1);
      }

      // Add validation for empty query
      if (!query || query.trim() === '') {
        console.error(`Error: Query cannot be empty. Try 'vcluster-yaml query sync' or see examples with --help`);
        process.exit(1);
      }

      const result = await handleQuery(query, {
        file: options.file,
        version: options.schemaVersion
      });

      if (!result.success) {
        // Error case - output error message and exit with code 1
        if (options.format === 'json') {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.error(result.error);
        }
        process.exit(1);
      }

      const output = formatOutput(result, options.format, 'query');
      console.log(output);
      process.exit(0);
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

// List versions command
program
  .command('list-versions')
  .description('List available vCluster versions')
  .option('-f, --format <format>', 'Output format (json, yaml, table)', 'json')
  .action(async (options) => {
    try {
      // Validate format option
      if (!['json', 'yaml', 'table'].includes(options.format)) {
        console.error(`Error: Invalid format "${options.format}". Must be one of: json, yaml, table`);
        process.exit(1);
      }

      const result = await handleListVersions();

      if (!result.success) {
        if (options.format === 'json') {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.error(result.error);
        }
        process.exit(1);
      }

      const output = formatOutput(result, options.format, 'list-versions');
      console.log(output);
      process.exit(0);
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

// Validate command
program
  .command('validate [file]')
  .description('Validate vCluster configuration')
  .option('-s, --schema-version <version>', 'vCluster version for schema', 'main')
  .option('-f, --format <format>', 'Output format (json, yaml, table)', 'json')
  .addHelpText('after', `
Arguments:
  file                   YAML file to validate (use '-' for stdin, omit to read from stdin)

Examples:
  $ vcluster-yaml validate vcluster.yaml
  $ vcluster-yaml validate vcluster.yaml --schema-version v0.24.0
  $ cat vcluster.yaml | vcluster-yaml validate -
  $ vcluster-yaml validate - < vcluster.yaml
  $ vcluster-yaml validate vcluster.yaml --format table
  `)
  .action(async (file, options) => {
    try {
      // Validate format option
      if (!['json', 'yaml', 'table'].includes(options.format)) {
        console.error(`Error: Invalid format "${options.format}". Must be one of: json, yaml, table`);
        process.exit(1);
      }

      // Read content from file or stdin
      let content;
      try {
        const result = await readContentSource(file);
        content = result.content;
      } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
      }

      // Check for empty content
      if (!content || content.trim() === '') {
        console.error(`Error: No content to validate. Please provide a file path or pipe content via stdin.`);
        process.exit(1);
      }

      const result = await handleValidate(content, {
        version: options.schemaVersion
      });

      // For validation, always output the result (even if not successful)
      // The formatOutput will handle error cases appropriately
      const output = formatOutput(result, options.format, 'validate');
      console.log(output);

      // Exit with code 1 if validation failed OR if we couldn't load schema
      if (!result.success || !result.valid) {
        process.exit(1);
      }

      process.exit(0);
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

// Parse arguments
program.parse();
