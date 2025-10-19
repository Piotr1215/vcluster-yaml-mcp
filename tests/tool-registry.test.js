import { describe, it, expect, vi } from 'vitest';
import { toolHandlers, executeToolHandler } from '../src/tool-registry.js';

describe('Tool Registry', () => {
  describe('toolHandlers', () => {
    it('should have all required tool handlers', () => {
      expect(toolHandlers).toHaveProperty('create-vcluster-config');
      expect(toolHandlers).toHaveProperty('list-versions');
      expect(toolHandlers).toHaveProperty('smart-query');
      expect(toolHandlers).toHaveProperty('extract-validation-rules');
      expect(toolHandlers).toHaveProperty('validate-config');
    });

    it('should map to functions', () => {
      Object.values(toolHandlers).forEach(handler => {
        expect(typeof handler).toBe('function');
      });
    });
  });

  describe('executeToolHandler', () => {
    it('should execute known tool handler', async () => {
      const mockGithubClient = {
        getTags: vi.fn().mockResolvedValue(['v0.20.0', 'v0.19.0'])
      };

      const response = await executeToolHandler('list-versions', {}, mockGithubClient);

      expect(response.isError).toBe(false);
      expect(response.content[0].text).toContain('main');
      expect(mockGithubClient.getTags).toHaveBeenCalled();
    });

    it('should return error for unknown tool', async () => {
      const mockGithubClient = {};

      const response = await executeToolHandler('unknown-tool', {}, mockGithubClient);

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Unknown tool');
    });

    it('should handle handler errors gracefully', async () => {
      const mockGithubClient = {
        getTags: vi.fn().mockRejectedValue(new Error('Network error'))
      };

      const response = await executeToolHandler('list-versions', {}, mockGithubClient);

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Error executing');
      expect(response.content[0].text).toContain('Network error');
    });

    it('should pass args to handler', async () => {
      const mockGithubClient = {
        getYamlContent: vi.fn().mockResolvedValue({ test: 'data' })
      };

      await executeToolHandler(
        'smart-query',
        { query: 'test', version: 'v0.20.0', file: 'custom.yaml' },
        mockGithubClient
      );

      expect(mockGithubClient.getYamlContent).toHaveBeenCalledWith('custom.yaml', 'v0.20.0');
    });
  });
});
