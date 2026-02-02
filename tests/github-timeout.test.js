import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('GitHub Client - Timeout Handling', () => {
  let githubClient;
  let originalFetch;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Save original fetch
    originalFetch = global.fetch;
    // Dynamic import after setting up mocks - import from dist
    const module = await import('../dist/github.js');
    githubClient = module.githubClient;
    githubClient.clearCache();
  });

  afterEach(() => {
    // Restore original fetch
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('getTags timeout', () => {
    it('should handle timeout gracefully and return empty array', async () => {
      global.fetch = vi.fn().mockImplementation(() =>
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
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const result = await githubClient.getTags();
      expect(result).toEqual([]);
    });
  });

  describe('getBranches timeout', () => {
    it('should handle timeout and return default branch', async () => {
      global.fetch = vi.fn().mockImplementation(() =>
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
      global.fetch = vi.fn().mockImplementation(() =>
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
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });

      await expect(
        githubClient.getFileContent('nonexistent.yaml', 'main')
      ).rejects.toThrow(/File not found/);
    });

    it('should handle other HTTP errors', async () => {
      global.fetch = vi.fn().mockResolvedValue({
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
