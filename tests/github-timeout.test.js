import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fetch from 'node-fetch';

// Mock node-fetch
vi.mock('node-fetch');

describe('GitHub Client - Timeout Handling', () => {
  let githubClient;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Dynamic import after mocking
    const module = await import('../src/github.js');
    githubClient = module.githubClient;
    githubClient.clearCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getTags timeout', () => {
    it('should handle timeout gracefully and return empty array', async () => {
      fetch.mockImplementation(() => 
        new Promise((_, reject) => {
          const error = new Error('Aborted');
          error.name = 'AbortError';
          reject(error);
        })
      );

      const result = await githubClient.getTags();
      expect(result).toEqual([]);
    });

    it('should handle network errors gracefully', async () => {
      fetch.mockRejectedValue(new Error('Network error'));

      const result = await githubClient.getTags();
      expect(result).toEqual([]);
    });
  });

  describe('getBranches timeout', () => {
    it('should handle timeout and return default branch', async () => {
      fetch.mockImplementation(() => 
        new Promise((_, reject) => {
          const error = new Error('Aborted');
          error.name = 'AbortError';
          reject(error);
        })
      );

      const result = await githubClient.getBranches();
      expect(result).toEqual(['main']);
    });
  });

  describe('getFileContent timeout', () => {
    it('should throw timeout error with helpful message', async () => {
      fetch.mockImplementation(() => 
        new Promise((_, reject) => {
          const error = new Error('Aborted');
          error.name = 'AbortError';
          reject(error);
        })
      );

      await expect(
        githubClient.getFileContent('chart/values.yaml', 'main')
      ).rejects.toThrow(/Timeout.*30s/);
    });

    it('should handle 404 errors', async () => {
      fetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });

      await expect(
        githubClient.getFileContent('nonexistent.yaml', 'main')
      ).rejects.toThrow(/File not found/);
    });

    it('should handle other HTTP errors', async () => {
      fetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      await expect(
        githubClient.getFileContent('chart/values.yaml', 'main')
      ).rejects.toThrow(/GitHub error/);
    });
  });
});
