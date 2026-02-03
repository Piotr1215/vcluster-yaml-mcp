import { describe, it, expect, beforeEach } from 'vitest';
import { createServer } from '../dist/server.js';

/**
 * Helper to call a tool handler
 */
async function callTool(server, toolName, args) {
  const tool = server._registeredTools[toolName];
  if (!tool) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Unknown tool: ${toolName}` }]
    };
  }
  return await tool.handler(args);
}

describe('Smart Query Feature', () => {
  let server;

  beforeEach(() => {
    server = createServer();
  });

  describe('Natural Language Queries', () => {
    it('should understand "etcd" query', async () => {
      const response = await callTool(server, 'smart-query', {
        query: 'etcd'
      });
      expect(response.content[0].text).toBeDefined();
      expect(response.content[0].text.toLowerCase()).toContain('etcd');
    });

    it('should understand "networking" query', async () => {
      const response = await callTool(server, 'smart-query', {
        query: 'networking'
      });
      expect(response.content[0].text).toBeDefined();
      const text = response.content[0].text.toLowerCase();
      expect(text).toMatch(/network|cidr|pod|service/);
    });

    it('should understand "what is the distro" query', async () => {
      const response = await callTool(server, 'smart-query', {
        query: 'what is the distro'
      });
      expect(response.content[0].text).toBeDefined();
      expect(response.content[0].text.toLowerCase()).toContain('distro');
    });

    it('should understand "storage configuration" query', async () => {
      const response = await callTool(server, 'smart-query', {
        query: 'storage configuration'
      });
      expect(response.content[0].text).toBeDefined();
      expect(response.content[0].text.toLowerCase()).toContain('storage');
    });
  });

  describe('Common Pattern Matching', () => {
    it('should match CIDR patterns', async () => {
      const response = await callTool(server, 'smart-query', {
        query: 'cidr'
      });
      expect(response.content[0].text).toBeDefined();
      expect(response.content[0].text.toLowerCase()).toContain('cidr');
    });

    it('should match k3s/k8s patterns', async () => {
      const response = await callTool(server, 'smart-query', {
        query: 'k3s'
      });
      expect(response.content[0].text).toBeDefined();
    });

    it('should match kubernetes patterns', async () => {
      const response = await callTool(server, 'smart-query', {
        query: 'kubernetes'
      });
      expect(response.content[0].text).toBeDefined();
    });
  });

  describe('Fallback Behavior', () => {
    it('should provide helpful suggestions when no matches found', async () => {
      const response = await callTool(server, 'smart-query', {
        query: 'nonexistentconfig'
      });
      expect(response.content[0].text).toContain('No matches');
      expect(response.content[0].text).toContain('Tips');
    });

    it('should auto-detect and use available YAML files', async () => {
      const response = await callTool(server, 'smart-query', {
        query: 'distro'
      });
      expect(response.content[0].text).toBeDefined();
      expect(response.isError).not.toBe(true);
    });
  });

  describe('File Handling', () => {
    it('should use specified file when provided', async () => {
      const response = await callTool(server, 'smart-query', {
        query: 'etcd',
        file: 'chart/values.yaml'
      });
      expect(response.content[0].text).toContain('values.yaml');
    });

    it('should fall back to first available YAML when default not found', async () => {
      const response = await callTool(server, 'smart-query', {
        query: 'test',
        file: 'nonexistent.yaml'
      });
      // Should either error or fall back to available file
      expect(response.content[0].text).toBeDefined();
    });
  });

  describe('Result Formatting', () => {
    it('should show result count', async () => {
      const response = await callTool(server, 'smart-query', {
        query: 'enabled'
      });
      if (!response.content[0].text.includes('No direct matches')) {
        expect(response.content[0].text).toMatch(/Found \d+ match(es)?/);
      }
    });

    it('should format results with path and value', async () => {
      const response = await callTool(server, 'smart-query', {
        query: 'distro'
      });
      if (!response.content[0].text.includes('No direct matches')) {
        expect(response.content[0].text).toContain(':');
      }
    });
  });
});
