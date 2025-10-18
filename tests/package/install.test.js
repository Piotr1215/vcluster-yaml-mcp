/**
 * Installation tests - Verify package installs correctly
 * Tests local and global installation with real npm operations
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { createTestDir, packPackage, installLocal, installGlobal, cleanup } from './helpers.js';

// Track resources for cleanup
let testDirs = [];
let tarballs = [];

beforeEach(async () => {
  // Reset tracking arrays
  testDirs = [];
  tarballs = [];
});

afterEach(async () => {
  // Cleanup all test resources
  await cleanup(testDirs, tarballs);
});

describe('Package Installation', () => {
  it('should install package locally via npm install', async () => {
    const testDir = await createTestDir();
    testDirs.push(testDir);

    const { tarballPath } = await packPackage();
    tarballs.push(tarballPath);

    const result = await installLocal(tarballPath, testDir);

    // Verify successful installation
    expect(result.exitCode).toBe(0);

    // Verify node_modules was created
    const nodeModulesExists = await fs.access(join(testDir, 'node_modules'))
      .then(() => true)
      .catch(() => false);

    expect(nodeModulesExists).toBe(true);
  }, 60000);

  it('should create bin symlinks for vcluster-yaml (CLI)', async () => {
    const testDir = await createTestDir();
    testDirs.push(testDir);

    const { tarballPath } = await packPackage();
    tarballs.push(tarballPath);

    await installLocal(tarballPath, testDir);

    // Check for CLI bin symlink
    const cliBinPath = join(testDir, 'node_modules', '.bin', 'vcluster-yaml');

    const cliBinExists = await fs.access(cliBinPath)
      .then(() => true)
      .catch(() => false);

    expect(cliBinExists).toBe(true);
  }, 60000);

  it('should create bin symlinks for vcluster-yaml-mcp (MCP server)', async () => {
    const testDir = await createTestDir();
    testDirs.push(testDir);

    const { tarballPath } = await packPackage();
    tarballs.push(tarballPath);

    await installLocal(tarballPath, testDir);

    // Check for MCP bin symlink
    const mcpBinPath = join(testDir, 'node_modules', '.bin', 'vcluster-yaml-mcp');

    const mcpBinExists = await fs.access(mcpBinPath)
      .then(() => true)
      .catch(() => false);

    expect(mcpBinExists).toBe(true);
  }, 60000);

  it('should create both bin symlinks for full package', async () => {
    const testDir = await createTestDir();
    testDirs.push(testDir);

    const { tarballPath } = await packPackage();
    tarballs.push(tarballPath);

    await installLocal(tarballPath, testDir);

    // Check for both bin symlinks
    const cliBinPath = join(testDir, 'node_modules', '.bin', 'vcluster-yaml');
    const mcpBinPath = join(testDir, 'node_modules', '.bin', 'vcluster-yaml-mcp');

    const cliBinExists = await fs.access(cliBinPath)
      .then(() => true)
      .catch(() => false);

    const mcpBinExists = await fs.access(mcpBinPath)
      .then(() => true)
      .catch(() => false);

    expect(cliBinExists).toBe(true);
    expect(mcpBinExists).toBe(true);
  }, 60000);

  it('should install package globally with custom prefix', async () => {
    const testDir = await createTestDir();
    testDirs.push(testDir);

    const { tarballPath } = await packPackage();
    tarballs.push(tarballPath);

    const result = await installGlobal(tarballPath, testDir);

    // Verify successful installation
    expect(result.exitCode).toBe(0);

    // Verify binaries were installed in prefix/bin
    const cliBinPath = join(testDir, 'bin', 'vcluster-yaml');
    const mcpBinPath = join(testDir, 'bin', 'vcluster-yaml-mcp');

    const cliBinExists = await fs.access(cliBinPath)
      .then(() => true)
      .catch(() => false);

    const mcpBinExists = await fs.access(mcpBinPath)
      .then(() => true)
      .catch(() => false);

    expect(cliBinExists).toBe(true);
    expect(mcpBinExists).toBe(true);
  }, 60000);
});
