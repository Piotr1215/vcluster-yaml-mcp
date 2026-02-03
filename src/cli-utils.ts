/**
 * CLI utility functions
 * Provides helpers for stdin reading and file operations
 */

import { readFile } from 'fs/promises';
import { stdin } from 'process';

export interface ContentSource {
  content: string;
  source: string;
}

/**
 * Read content from stdin
 * Used for piping content to CLI commands
 */
export async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';

    stdin.setEncoding('utf8');
    stdin.on('data', (chunk: string) => data += chunk);
    stdin.on('end', () => resolve(data));
    stdin.on('error', reject);
  });
}

/**
 * Read content from a file or stdin based on the file argument
 */
export async function readContentSource(file?: string): Promise<ContentSource> {
  // Read from stdin if no file provided or file is '-'
  if (!file || file === '-') {
    // If no file argument provided (not even '-'), check if we're in interactive mode
    // In interactive mode (TTY), we should not wait for stdin
    if (!file) {
      // stdin.isTTY is true when running in interactive terminal
      // stdin.isTTY is false/undefined when piping or redirecting
      const isInteractive = stdin.isTTY === true;

      if (isInteractive) {
        throw new Error(
          'No input provided. Please specify a file or pipe content via stdin.\n' +
          'Examples:\n' +
          '  vcluster-yaml validate my-config.yaml\n' +
          '  cat my-config.yaml | vcluster-yaml validate -\n' +
          '  vcluster-yaml validate --help'
        );
      }
    }

    const content = await readStdin();
    return { content, source: 'stdin' };
  }

  // Read from file
  try {
    const content = await readFile(file, 'utf-8');
    return { content, source: file };
  } catch (error) {
    throw new Error(`Cannot read file '${file}': ${error instanceof Error ? error.message : String(error)}`);
  }
}
