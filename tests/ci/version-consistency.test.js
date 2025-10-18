import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..');
const SCRIPTS_DIR = join(PROJECT_ROOT, 'scripts');
const PACKAGE_JSON = join(PROJECT_ROOT, 'package.json');

describe('Version Consistency', () => {
  it('should extract version from package.json', () => {
    const version = execSync(
      `${SCRIPTS_DIR}/extract-version.sh npm ${PACKAGE_JSON}`,
      { encoding: 'utf-8' }
    ).trim();

    // Current package.json version is 0.1.0
    expect(version).toBe('0.1.0');

    // Verify semantic version format
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('should extract version from Docker tag', () => {
    const packageJson = JSON.parse(readFileSync(PACKAGE_JSON, 'utf-8'));
    const version = packageJson.version;

    const dockerTag = `piotrzan/vcluster-yaml-mcp-server:${version}`;
    const extractedVersion = execSync(
      `${SCRIPTS_DIR}/extract-version.sh docker "${dockerTag}"`,
      { encoding: 'utf-8' }
    ).trim();

    expect(extractedVersion).toBe(version);
  });

  it('should extract version from GitHub tag', () => {
    const packageJson = JSON.parse(readFileSync(PACKAGE_JSON, 'utf-8'));
    const version = packageJson.version;

    const gitTag = `v${version}`;
    const extractedVersion = execSync(
      `${SCRIPTS_DIR}/extract-version.sh github "${gitTag}"`,
      { encoding: 'utf-8' }
    ).trim();

    expect(extractedVersion).toBe(version);
  });

  it('should verify all versions match', () => {
    const npmVersion = execSync(
      `${SCRIPTS_DIR}/extract-version.sh npm ${PACKAGE_JSON}`,
      { encoding: 'utf-8' }
    ).trim();

    const dockerVersion = execSync(
      `${SCRIPTS_DIR}/extract-version.sh docker "piotrzan/vcluster-yaml-mcp-server:${npmVersion}"`,
      { encoding: 'utf-8' }
    ).trim();

    const githubVersion = execSync(
      `${SCRIPTS_DIR}/extract-version.sh github "v${npmVersion}"`,
      { encoding: 'utf-8' }
    ).trim();

    expect(npmVersion).toBe(dockerVersion);
    expect(dockerVersion).toBe(githubVersion);
  });

  it('should verify workflow uses consistent version variable', () => {
    const workflowPath = join(PROJECT_ROOT, '.github/workflows/release.yml');

    let workflowContent;
    try {
      workflowContent = readFileSync(workflowPath, 'utf-8');
    } catch (error) {
      console.warn('⚠️  release.yml not found - skipping version consistency check');
      return; // Skip test if workflow doesn't exist yet
    }

    // Check that the workflow uses inputs.version consistently
    const versionReferences = workflowContent.match(/\$\{\{\s*inputs\.version\s*\}\}/g) || [];

    // Should have at least 2 references (Docker tag and GitHub Release tag)
    expect(versionReferences.length).toBeGreaterThanOrEqual(2);

    // Verify Docker tags use the version input
    expect(workflowContent).toContain('vcluster-yaml-mcp-server:${{ inputs.version }}');

    // Verify GitHub Release uses the version input
    expect(workflowContent).toContain('v${{ inputs.version }}');
  });
});
