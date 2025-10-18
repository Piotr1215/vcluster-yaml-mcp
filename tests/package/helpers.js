/**
 * Test helpers for package distribution tests
 * Real npm operations (not mocks) to verify installation and execution
 */

import { execa } from 'execa';
import { promises as fs } from 'fs';
import { randomBytes } from 'crypto';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..');
const TEST_INSTALLS_DIR = join(PROJECT_ROOT, 'test-installs');

/**
 * Create unique temporary directory for test isolation
 * @returns {Promise<string>} Path to created directory
 */
export async function createTestDir() {
  const uniqueId = randomBytes(8).toString('hex');
  const testDir = join(TEST_INSTALLS_DIR, `test-${uniqueId}`);
  await fs.mkdir(testDir, { recursive: true });
  return testDir;
}

/**
 * Pack the project package into tarball
 * @returns {Promise<{tarballName: string, tarballPath: string}>}
 */
export async function packPackage() {
  // Run npm pack in project root
  const packResult = await execa('npm', ['pack'], {
    cwd: PROJECT_ROOT,
  });

  const tarballName = packResult.stdout.trim();
  const tarballPath = join(PROJECT_ROOT, tarballName);

  return { tarballName, tarballPath };
}

/**
 * Install package locally in specified directory
 * @param {string} tarballPath - Path to package tarball
 * @param {string} installDir - Directory to install into
 * @returns {Promise<object>} Install result
 */
export async function installLocal(tarballPath, installDir) {
  // Initialize package.json in install directory
  await fs.writeFile(
    join(installDir, 'package.json'),
    JSON.stringify({ name: 'test-install', version: '1.0.0' }, null, 2)
  );

  // Install the tarball
  const installResult = await execa('npm', ['install', tarballPath], {
    cwd: installDir,
  });

  return installResult;
}

/**
 * Install package globally with custom prefix for test isolation
 * @param {string} tarballPath - Path to package tarball
 * @param {string} installDir - Directory to use as prefix
 * @returns {Promise<object>} Install result
 */
export async function installGlobal(tarballPath, installDir) {
  const installResult = await execa('npm', [
    'install',
    '--global',
    '--prefix', installDir,
    tarballPath
  ], {
    cwd: installDir,
  });

  return installResult;
}

/**
 * Execute command with error handling
 * @param {string} command - Command to execute
 * @param {string[]} args - Command arguments
 * @param {object} options - Execution options
 * @returns {Promise<object>} Execution result
 */
export async function executeCommand(command, args = [], options = {}) {
  return await execa(command, args, options);
}

/**
 * Clean up test resources
 * @param {string[]} testDirs - Directories to remove
 * @param {string[]} tarballs - Tarballs to remove
 */
export async function cleanup(testDirs = [], tarballs = []) {
  // Cleanup test directories
  for (const dir of testDirs) {
    try {
      await fs.rm(dir, { recursive: true, force: true });
    } catch (err) {
      // Ignore cleanup errors
    }
  }

  // Cleanup tarballs
  for (const tarball of tarballs) {
    try {
      await fs.unlink(tarball);
    } catch (err) {
      // Ignore cleanup errors
    }
  }
}
