/**
 * CLI utility functions
 * Provides helpers for stdin reading and file operations
 */

import { readFile } from 'fs/promises';
import { stdin } from 'process';

/**
 * Read content from stdin
 * Used for piping content to CLI commands
 * @returns {Promise<string>} The content read from stdin
 */
export async function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';

    stdin.setEncoding('utf8');
    stdin.on('data', chunk => data += chunk);
    stdin.on('end', () => resolve(data));
    stdin.on('error', reject);
  });
}

/**
 * Read content from a file or stdin based on the file argument
 * @param {string|undefined} file - File path, '-' for stdin, or undefined for stdin
 * @returns {Promise<{content: string, source: string}>} The content and its source
 */
export async function readContentSource(file) {
  // Read from stdin if no file provided or file is '-'
  if (!file || file === '-') {
    const content = await readStdin();
    return { content, source: 'stdin' };
  }

  // Read from file
  try {
    const content = await readFile(file, 'utf-8');
    return { content, source: file };
  } catch (error) {
    throw new Error(`Cannot read file '${file}': ${error.message}`);
  }
}
