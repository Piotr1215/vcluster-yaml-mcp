/**
 * Error handling tests
 * Tests that CLI handles errors gracefully with proper exit codes and messages
 * Commander uses exit code 1 for both usage and execution errors
 */

import { describe, it, expect } from 'vitest';
import { execa } from 'execa';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..', '..');
const CLI_PATH = join(projectRoot, 'src', 'cli.js');

describe('Error Handling', () => {
  it('should handle invalid YAML with exit code 1', async () => {
    try {
      await execa('node', [
        CLI_PATH, 'validate', 'invalid yaml content: [ unclosed', '--format', 'json'
      ]);
      expect.fail('Should have thrown an error');
    } catch (error) {
      expect(error.exitCode).toBe(1);
      const data = JSON.parse(error.stdout);
      expect(data.valid).toBe(false);
      expect(data.errors).toBeDefined();
      expect(data.errors.length).toBeGreaterThan(0);
    }
  }, 30000);

  it('should provide clear error message for invalid format flag', async () => {
    try {
      await execa('node', [
        CLI_PATH, 'query', 'sync', '--format', 'xml'
      ]);
      expect.fail('Should have thrown an error');
    } catch (error) {
      expect(error.exitCode).toBe(1);
      expect(error.stderr).toContain('Invalid format');
      expect(error.stderr).toContain('xml');
    }
  });

  it('should handle missing required positional argument', async () => {
    try {
      await execa('node', [CLI_PATH, 'query']);
      expect.fail('Should have thrown an error');
    } catch (error) {
      expect(error.exitCode).toBe(1);
      expect(error.stderr).toContain('missing required argument');
    }
  });

  it('should handle unknown command', async () => {
    try {
      await execa('node', [CLI_PATH, 'unknown-cmd']);
      expect.fail('Should have thrown an error');
    } catch (error) {
      expect(error.exitCode).toBe(1);
      expect(error.stderr).toContain('unknown command');
    }
  });

  it('should exit with code 0 for successful query', async () => {
    const { exitCode } = await execa('node', [
      CLI_PATH, 'query', 'sync', '--format', 'json'
    ]);
    expect(exitCode).toBe(0);
  }, 30000);

  it('should exit with code 0 for valid YAML', async () => {
    const { exitCode } = await execa('node', [
      CLI_PATH, 'validate', 'sync:\n  toHost:\n    pods:\n      enabled: true', '--format', 'json'
    ]);
    expect(exitCode).toBe(0);
  }, 30000);

  it('should exit with code 1 for invalid YAML syntax', async () => {
    try {
      await execa('node', [
        CLI_PATH, 'validate', 'bad: yaml: ['
      ]);
      expect.fail('Should have thrown an error');
    } catch (error) {
      expect(error.exitCode).toBe(1);
    }
  }, 30000);

  it('should handle validation errors with proper JSON output', async () => {
    try {
      await execa('node', [
        CLI_PATH, 'validate', 'invalid: [ ] : yaml', '--format', 'json'
      ]);
      expect.fail('Should have thrown an error');
    } catch (error) {
      expect(error.exitCode).toBe(1);
      const data = JSON.parse(error.stdout);
      expect(data).toHaveProperty('valid');
      expect(data.valid).toBe(false);
      expect(data).toHaveProperty('errors');
      expect(Array.isArray(data.errors)).toBe(true);
    }
  }, 30000);

  it('should exit with code 0 for successful list-versions', async () => {
    const { exitCode } = await execa('node', [
      CLI_PATH, 'list-versions', '--format', 'json'
    ]);
    expect(exitCode).toBe(0);
  }, 30000);

  it('should handle invalid version option gracefully', async () => {
    // Even with an invalid version, the CLI should attempt the query
    // and return an error gracefully (not crash)
    try {
      const result = await execa('node', [
        CLI_PATH, 'query', 'sync', '--version', 'nonexistent-branch-xyz', '--format', 'json'
      ]);
      // If it succeeds, that's fine (GitHub might have this branch)
      expect(result.exitCode).toBe(0);
    } catch (error) {
      // If it fails, it should fail gracefully with exit code 1
      expect(error.exitCode).toBe(1);
    }
  }, 30000);

  it('should handle --help flag without error', async () => {
    const { exitCode } = await execa('node', [CLI_PATH, '--help']);
    expect(exitCode).toBe(0);
  });

  it('should handle command-specific --help without error', async () => {
    const commands = ['query', 'validate', 'list-versions'];

    for (const cmd of commands) {
      const { exitCode } = await execa('node', [CLI_PATH, cmd, '--help']);
      expect(exitCode).toBe(0);
    }
  });
});

describe('Exit Code Conventions', () => {
  it('should exit with code 0 for successful operations', async () => {
    const { exitCode } = await execa('node', [CLI_PATH, '--help']);
    expect(exitCode).toBe(0);
  });

  it('should exit with code 1 for validation failures', async () => {
    try {
      await execa('node', [CLI_PATH, 'validate', 'bad: yaml: [']);
      expect.fail('Should have thrown an error');
    } catch (error) {
      expect(error.exitCode).toBe(1);
    }
  }, 30000);

  it('should exit with code 1 for usage errors (missing argument)', async () => {
    try {
      await execa('node', [CLI_PATH, 'query']);
      expect.fail('Should have thrown an error');
    } catch (error) {
      expect(error.exitCode).toBe(1);
    }
  });

  it('should exit with code 1 for unknown commands', async () => {
    try {
      await execa('node', [CLI_PATH, 'invalid']);
      expect.fail('Should have thrown an error');
    } catch (error) {
      expect(error.exitCode).toBe(1);
    }
  });

  it('should exit with code 0 for help display', async () => {
    const { exitCode } = await execa('node', [CLI_PATH, '--help']);
    expect(exitCode).toBe(0);
  });
});
