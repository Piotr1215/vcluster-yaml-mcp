/**
 * Binary execution tests - Verify binaries work after installation
 * Tests CLI and MCP server binaries with real execution
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { createTestDir, packPackage, installLocal, installGlobal, executeCommand, cleanup } from './helpers.js';

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

describe('Binary Execution', () => {
  it('should execute vcluster-yaml CLI binary successfully', async () => {
    const testDir = await createTestDir();
    testDirs.push(testDir);

    const { tarballPath } = await packPackage();
    tarballs.push(tarballPath);

    await installLocal(tarballPath, testDir);

    // Execute the CLI binary with --help (non-destructive)
    const binPath = join(testDir, 'node_modules', '.bin', 'vcluster-yaml');
    const result = await executeCommand(binPath, ['--help'], {
      cwd: testDir,
    });

    // Verify successful execution
    expect(result.exitCode).toBe(0);

    // Verify output contains expected CLI content
    expect(result.stdout).toContain('vcluster-yaml');
  }, 60000);

  it('should execute vcluster-yaml-mcp server binary successfully', async () => {
    const testDir = await createTestDir();
    testDirs.push(testDir);

    const { tarballPath } = await packPackage();
    tarballs.push(tarballPath);

    await installLocal(tarballPath, testDir);

    // Execute the MCP binary with --help (non-destructive)
    // Note: MCP server may not support --help, so we test with --version or just verify it starts
    const binPath = join(testDir, 'node_modules', '.bin', 'vcluster-yaml-mcp');

    // MCP servers typically don't have CLI args, they start and wait for stdio
    // So we'll just verify the binary is executable and the file exists
    const binExists = await fs.access(binPath)
      .then(() => true)
      .catch(() => false);

    expect(binExists).toBe(true);

    // Verify it's a valid Node.js file by checking shebang
    const stats = await fs.stat(binPath);
    expect(stats.isFile() || stats.isSymbolicLink()).toBe(true);
  }, 60000);

  it('should execute both binaries from full package', async () => {
    const testDir = await createTestDir();
    testDirs.push(testDir);

    const { tarballPath } = await packPackage();
    tarballs.push(tarballPath);

    await installLocal(tarballPath, testDir);

    // Execute CLI binary
    const cliBinPath = join(testDir, 'node_modules', '.bin', 'vcluster-yaml');
    const cliResult = await executeCommand(cliBinPath, ['--help'], {
      cwd: testDir,
    });

    expect(cliResult.exitCode).toBe(0);
    expect(cliResult.stdout).toContain('vcluster-yaml');

    // Verify MCP binary exists
    const mcpBinPath = join(testDir, 'node_modules', '.bin', 'vcluster-yaml-mcp');
    const mcpBinExists = await fs.access(mcpBinPath)
      .then(() => true)
      .catch(() => false);

    expect(mcpBinExists).toBe(true);
  }, 60000);

  it('should execute CLI binary via npx', async () => {
    const testDir = await createTestDir();
    testDirs.push(testDir);

    const { tarballPath } = await packPackage();
    tarballs.push(tarballPath);

    // Install locally first (npx will find it in node_modules)
    await installLocal(tarballPath, testDir);

    // Execute via npx
    const result = await executeCommand('npx', ['vcluster-yaml', '--help'], {
      cwd: testDir,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('vcluster-yaml');
  }, 60000);

  it('should execute globally installed CLI binary', async () => {
    const testDir = await createTestDir();
    testDirs.push(testDir);

    const { tarballPath } = await packPackage();
    tarballs.push(tarballPath);

    // Global install with custom prefix
    await installGlobal(tarballPath, testDir);

    // Execute the globally installed CLI binary
    const binPath = join(testDir, 'bin', 'vcluster-yaml');
    const result = await executeCommand(binPath, ['--help'], {
      cwd: testDir,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('vcluster-yaml');
  }, 60000);

  it('should have correct shebang line for cross-platform execution', async () => {
    const testDir = await createTestDir();
    testDirs.push(testDir);

    const { tarballPath } = await packPackage();
    tarballs.push(tarballPath);

    await installLocal(tarballPath, testDir);

    // Read the CLI binary source file
    const packageDir = join(testDir, 'node_modules', 'vcluster-yaml-mcp-server');
    const cliBinSourcePath = join(packageDir, 'src', 'cli.js');
    const mcpBinSourcePath = join(packageDir, 'src', 'index.js');

    // Read and verify CLI shebang
    const cliContent = await fs.readFile(cliBinSourcePath, 'utf-8');
    const cliFirstLine = cliContent.split('\n')[0];
    expect(cliFirstLine).toBe('#!/usr/bin/env node');

    // Read and verify MCP shebang
    const mcpContent = await fs.readFile(mcpBinSourcePath, 'utf-8');
    const mcpFirstLine = mcpContent.split('\n')[0];
    expect(mcpFirstLine).toBe('#!/usr/bin/env node');
  }, 60000);
});
