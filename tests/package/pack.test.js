/**
 * npm pack tests - Verify package tarball creation
 * Tests real npm operations (not mocks)
 */

import { describe, it, expect, afterAll } from 'vitest';
import { packPackage, cleanup } from './helpers.js';

describe('npm pack - Package Creation', () => {
  let tarballPath;

  afterAll(async () => {
    // Cleanup: remove generated tarball
    await cleanup([], tarballPath ? [tarballPath] : []);
  });

  it('should successfully pack the vcluster-yaml-mcp-server package', async () => {
    const result = await packPackage();

    // Verify result contains expected fields
    expect(result.tarballName).toBeDefined();
    expect(result.tarballPath).toBeDefined();

    // Store for cleanup
    tarballPath = result.tarballPath;

    // Verify tarball was created (file exists)
    const { access } = await import('fs/promises');
    const tarballExists = await access(tarballPath)
      .then(() => true)
      .catch(() => false);

    expect(tarballExists).toBe(true);
  }, 30000);

  it('should produce a tarball with .tgz extension', async () => {
    const { tarballName, tarballPath: path } = await packPackage();

    // Verify .tgz extension
    expect(tarballName).toMatch(/\.tgz$/);

    // Verify tarball name contains package name
    expect(tarballName).toContain('vcluster-yaml-mcp-server');

    // Cleanup this test's tarball
    await cleanup([], [path]);
  }, 30000);
});
