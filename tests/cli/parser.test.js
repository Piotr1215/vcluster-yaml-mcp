/**
 * Argument parsing tests
 * Tests that CLI correctly handles arguments, flags, and help text
 * Adapted from Phase 1 proof - Commander-only tests
 */

import { describe, it, expect } from 'vitest';
import { execa } from 'execa';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..', '..');
const CLI_PATH = join(projectRoot, 'src', 'cli.js');

describe('Argument Parsing - Commander', () => {
  it('should display help text when --help is passed', async () => {
    const { stdout, exitCode } = await execa('node', [CLI_PATH, '--help']);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('vcluster-yaml');
    expect(stdout).toContain('Commands:');
    expect(stdout).toContain('query');
    expect(stdout).toContain('list-versions');
    expect(stdout).toContain('validate');
  });

  it('should display command-specific help for query', async () => {
    const { stdout, exitCode } = await execa('node', [CLI_PATH, 'query', '--help']);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('Search for vCluster configuration fields');
    expect(stdout).toContain('--format');
    expect(stdout).toContain('--file');
    expect(stdout).toContain('--schema-version');
    expect(stdout).toContain('Examples:');
  });

  it('should display command-specific help for validate', async () => {
    const { stdout, exitCode } = await execa('node', [CLI_PATH, 'validate', '--help']);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('Validate vCluster configuration');
    expect(stdout).toContain('--format');
    expect(stdout).toContain('--schema-version');
    expect(stdout).toContain('Examples:');
  });

  it('should display command-specific help for list-versions', async () => {
    const { stdout, exitCode } = await execa('node', [CLI_PATH, 'list-versions', '--help']);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('List available vCluster versions');
    expect(stdout).toContain('--format');
  });

  it('should fail gracefully with missing required argument', async () => {
    try {
      await execa('node', [CLI_PATH, 'query']);
      expect.fail('Should have thrown an error');
    } catch (error) {
      expect(error.exitCode).toBe(1);
      expect(error.stderr).toContain("error: missing required argument 'query'");
    }
  });

  it('should fail gracefully with invalid command', async () => {
    try {
      await execa('node', [CLI_PATH, 'invalid-command']);
      expect.fail('Should have thrown an error');
    } catch (error) {
      expect(error.exitCode).toBe(1);
      expect(error.stderr).toContain("error: unknown command 'invalid-command'");
    }
  });

  it('should fail gracefully with missing validate content (no stdin)', async () => {
    try {
      // Without stdin, validate should fail with an error about no content
      await execa('node', [CLI_PATH, 'validate'], { input: '' });
      expect.fail('Should have thrown an error');
    } catch (error) {
      expect(error.exitCode).toBe(1);
      expect(error.stderr).toContain('No content to validate');
    }
  });

  it('should accept valid format options', async () => {
    // This test verifies that valid formats are accepted
    // We use list-versions since it doesn't require arguments and is fast
    const formats = ['json', 'yaml', 'table'];

    for (const format of formats) {
      const { exitCode } = await execa('node', [
        CLI_PATH,
        'list-versions',
        '--format',
        format
      ]);
      expect(exitCode).toBe(0);
    }
  }, 30000); // Longer timeout for multiple API calls

  it('should reject invalid format option', async () => {
    try {
      await execa('node', [
        CLI_PATH,
        'list-versions',
        '--format',
        'invalid-format'
      ]);
      expect.fail('Should have thrown an error');
    } catch (error) {
      expect(error.exitCode).toBe(1);
      expect(error.stderr).toContain('Invalid format');
    }
  });
});
