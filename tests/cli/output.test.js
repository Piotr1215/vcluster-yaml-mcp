/**
 * Output format tests
 * Tests that output formats (JSON, YAML, table) are structurally valid
 * Uses REAL GitHub API data (not mocks)
 */

import { describe, it, expect } from 'vitest';
import { execa } from 'execa';
import yaml from 'js-yaml';
import stripAnsi from 'strip-ansi';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..', '..');
const CLI_PATH = join(projectRoot, 'src', 'cli.js');

/**
 * Validate that a string is valid JSON
 */
function validateJSON(str) {
  const parsed = JSON.parse(str);
  return parsed;
}

/**
 * Validate that a string is valid YAML
 */
function validateYAML(str) {
  const parsed = yaml.load(str);
  return parsed;
}

/**
 * Validate that a string contains table structure
 */
function validateTable(str) {
  const clean = stripAnsi(str);

  // Table should have box drawing characters
  expect(clean).toMatch(/[┌┬┐├┼┤└┴┘│─]/);

  // Should have at least one data row (not just header)
  const lines = clean.split('\n').filter(l => l.trim());
  expect(lines.length).toBeGreaterThan(3);

  return true;
}

describe('Output Format - JSON', () => {
  it('should output valid JSON for query command', async () => {
    const { stdout, exitCode } = await execa('node', [
      CLI_PATH, 'query', 'sync', '--format', 'json'
    ]);

    expect(exitCode).toBe(0);
    const data = validateJSON(stdout);
    expect(data).toHaveProperty('success');
    expect(data).toHaveProperty('results');
    expect(data).toHaveProperty('metadata');
    expect(Array.isArray(data.results)).toBe(true);
  }, 30000);

  it('should output valid JSON for list-versions command', async () => {
    const { stdout, exitCode } = await execa('node', [
      CLI_PATH, 'list-versions', '--format', 'json'
    ]);

    expect(exitCode).toBe(0);
    const data = validateJSON(stdout);
    expect(data).toHaveProperty('success');
    expect(data).toHaveProperty('versions');
    expect(Array.isArray(data.versions)).toBe(true);
    expect(data.versions).toContain('main');
  }, 30000);

  it('should output valid JSON for validate command (valid input)', async () => {
    const { stdout, exitCode } = await execa('node', [
      CLI_PATH, 'validate', 'sync:\n  toHost:\n    pods:\n      enabled: true', '--format', 'json'
    ]);

    expect(exitCode).toBe(0);
    const data = validateJSON(stdout);
    expect(data).toHaveProperty('success');
    expect(data).toHaveProperty('valid');
  }, 30000);

  it('should output valid JSON for query with empty results', async () => {
    const { stdout, exitCode } = await execa('node', [
      CLI_PATH, 'query', 'nonexistent-field-xyz123', '--format', 'json'
    ]);

    expect(exitCode).toBe(0);
    const data = validateJSON(stdout);
    expect(data.results).toHaveLength(0);
    expect(data.metadata.resultCount).toBe(0);
  }, 30000);
});

describe('Output Format - YAML', () => {
  it('should output valid YAML for query command', async () => {
    const { stdout, exitCode } = await execa('node', [
      CLI_PATH, 'query', 'sync', '--format', 'yaml'
    ]);

    expect(exitCode).toBe(0);
    const data = validateYAML(stdout);
    expect(data).toHaveProperty('success');
    expect(data).toHaveProperty('results');
    expect(data).toHaveProperty('metadata');
    expect(Array.isArray(data.results)).toBe(true);
  }, 30000);

  it('should output valid YAML for list-versions command', async () => {
    const { stdout, exitCode } = await execa('node', [
      CLI_PATH, 'list-versions', '--format', 'yaml'
    ]);

    expect(exitCode).toBe(0);
    const data = validateYAML(stdout);
    expect(data).toHaveProperty('success');
    expect(data).toHaveProperty('versions');
    expect(Array.isArray(data.versions)).toBe(true);
  }, 30000);

  it('should output valid YAML for validate command', async () => {
    const { stdout, exitCode } = await execa('node', [
      CLI_PATH, 'validate', 'sync:\n  toHost:\n    pods:\n      enabled: true', '--format', 'yaml'
    ]);

    expect(exitCode).toBe(0);
    const data = validateYAML(stdout);
    expect(data).toHaveProperty('success');
    expect(data).toHaveProperty('valid');
  }, 30000);
});

describe('Output Format - Table', () => {
  it('should output valid table for query command', async () => {
    const { stdout, exitCode } = await execa('node', [
      CLI_PATH, 'query', 'sync', '--format', 'table'
    ]);

    expect(exitCode).toBe(0);
    validateTable(stdout);

    // Should contain column headers
    const clean = stripAnsi(stdout);
    expect(clean).toContain('Field');
    expect(clean).toContain('Value');
    expect(clean).toContain('Type');
    expect(clean).toContain('Description');
  }, 30000);

  it('should output valid table for list-versions command', async () => {
    const { stdout, exitCode } = await execa('node', [
      CLI_PATH, 'list-versions', '--format', 'table'
    ]);

    expect(exitCode).toBe(0);
    validateTable(stdout);

    const clean = stripAnsi(stdout);
    expect(clean).toContain('Version');
    expect(clean).toContain('main');
  }, 30000);

  it('should handle empty results in table format', async () => {
    const { stdout, exitCode } = await execa('node', [
      CLI_PATH, 'query', 'nonexistent-field-xyz123', '--format', 'table'
    ]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('No results found');
  }, 30000);

  it('should output formatted table for validate command (valid)', async () => {
    const { stdout, exitCode } = await execa('node', [
      CLI_PATH, 'validate', 'sync:\n  toHost:\n    pods:\n      enabled: true', '--format', 'table'
    ]);

    expect(exitCode).toBe(0);
    const clean = stripAnsi(stdout);
    expect(clean).toContain('valid');
  }, 30000);

  it('should output formatted table for validate command (invalid)', async () => {
    try {
      await execa('node', [
        CLI_PATH, 'validate', 'invalid: yaml: [ unclosed', '--format', 'table'
      ]);
      expect.fail('Should have thrown an error');
    } catch (error) {
      expect(error.exitCode).toBe(1);
      const clean = stripAnsi(error.stdout);
      expect(clean).toContain('errors');
    }
  }, 30000);
});

describe('Format Consistency', () => {
  it('should return same data in different formats for query', async () => {
    const jsonResult = await execa('node', [
      CLI_PATH, 'query', 'controlPlane', '--format', 'json'
    ]);
    const yamlResult = await execa('node', [
      CLI_PATH, 'query', 'controlPlane', '--format', 'yaml'
    ]);

    const jsonData = JSON.parse(jsonResult.stdout);
    const yamlData = yaml.load(yamlResult.stdout);

    // Both should have same structure
    expect(jsonData.success).toBe(yamlData.success);
    expect(jsonData.results.length).toBe(yamlData.results.length);
    expect(jsonData.metadata.query).toBe(yamlData.metadata.query);
  }, 30000);
});
