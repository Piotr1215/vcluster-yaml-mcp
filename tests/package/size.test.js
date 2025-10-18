/**
 * Package size tests - Verify package stays within size limits
 * Tests real package with all production dependencies
 */

import { describe, it, expect, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { packPackage, cleanup } from './helpers.js';

// Size limit in bytes: 50MB for full package approach
const SIZE_LIMIT = 50 * 1024 * 1024; // 52,428,800 bytes

// Track tarballs for cleanup
let tarballs = [];

afterEach(async () => {
  // Cleanup: remove all generated tarballs
  await cleanup([], tarballs);
  tarballs = [];
});

describe('Package Size Verification', () => {
  async function packAndMeasure() {
    const { tarballName, tarballPath } = await packPackage();
    tarballs.push(tarballPath);

    // Get tarball size
    const stats = await fs.stat(tarballPath);
    const sizeBytes = stats.size;
    const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);

    return {
      tarballName,
      tarballPath,
      sizeBytes,
      sizeMB,
    };
  }

  it('should be under 50MB (full package with all dependencies)', async () => {
    const result = await packAndMeasure();

    console.log(`Package tarball: ${result.tarballName} (${result.sizeMB} MB)`);
    console.log(`Size limit: 50 MB (${(SIZE_LIMIT / (1024 * 1024)).toFixed(2)} MB)`);

    expect(result.sizeBytes).toBeLessThan(SIZE_LIMIT);
  }, 30000);

  it('should report actual package size for monitoring', async () => {
    const result = await packAndMeasure();

    const sizeReport = {
      tarballName: result.tarballName,
      sizeBytes: result.sizeBytes,
      sizeMB: result.sizeMB,
      limit: SIZE_LIMIT,
      limitMB: (SIZE_LIMIT / (1024 * 1024)).toFixed(2),
      withinLimit: result.sizeBytes < SIZE_LIMIT,
    };

    console.log('Size report:', JSON.stringify(sizeReport, null, 2));

    // Verify within limit
    expect(sizeReport.withinLimit).toBe(true);
  }, 30000);
});
