import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { readdir, access } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..');
const WORKFLOWS_DIR = join(PROJECT_ROOT, '.github/workflows');

describe('Workflow Syntax Validation', () => {
  it('should have at least one workflow file', async () => {
    const files = await readdir(WORKFLOWS_DIR);
    const workflowFiles = files.filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));
    expect(workflowFiles.length).toBeGreaterThan(0);
  });

  it('should validate release.yml with actionlint', async () => {
    const workflowPath = join(WORKFLOWS_DIR, 'release.yml');

    // Check if workflow file exists first
    try {
      await access(workflowPath);
    } catch (error) {
      throw new Error(`release.yml not found at ${workflowPath}`);
    }

    // Check if actionlint is installed
    try {
      execSync('which actionlint', { encoding: 'utf-8', stdio: 'pipe' });
    } catch (error) {
      console.warn('⚠️  actionlint not installed - skipping workflow validation');
      console.warn('   Install: https://github.com/rhysd/actionlint#installation');
      return; // Skip test if actionlint not available
    }

    // Validate workflow with actionlint
    try {
      execSync(`actionlint ${workflowPath}`, {
        encoding: 'utf-8',
        stdio: 'pipe'
      });
      // If actionlint exits with 0, validation passed
      expect(true).toBe(true);
    } catch (error) {
      // If actionlint found issues, it exits with non-zero
      throw new Error(`Workflow validation failed:\n${error.stderr || error.stdout || error.message}`);
    }
  });

  it('should validate test.yml with actionlint', async () => {
    const workflowPath = join(WORKFLOWS_DIR, 'test.yml');

    // Check if workflow file exists
    try {
      await access(workflowPath);
    } catch (error) {
      throw new Error(`test.yml not found at ${workflowPath}`);
    }

    // Check if actionlint is installed
    try {
      execSync('which actionlint', { encoding: 'utf-8', stdio: 'pipe' });
    } catch (error) {
      console.warn('⚠️  actionlint not installed - skipping workflow validation');
      return; // Skip test if actionlint not available
    }

    // Validate workflow with actionlint
    try {
      execSync(`actionlint ${workflowPath}`, {
        encoding: 'utf-8',
        stdio: 'pipe'
      });
      expect(true).toBe(true);
    } catch (error) {
      throw new Error(`Workflow validation failed:\n${error.stderr || error.stdout || error.message}`);
    }
  });
});
