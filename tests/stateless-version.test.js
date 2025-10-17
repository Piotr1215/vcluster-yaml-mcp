/**
 * Test stateless version approach
 * Every tool accepts optional version parameter instead of relying on state
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createServer } from '../src/server.js';

describe('Stateless Version Approach', () => {
  let server;
  let toolHandler;

  beforeEach(() => {
    server = createServer();
    toolHandler = server._requestHandlers.get('tools/call');
  });

  describe('Tool Definitions', () => {
    let listToolsHandler;

    beforeEach(() => {
      listToolsHandler = server._requestHandlers.get('tools/list');
    });

    it('should NOT have set-version tool', async () => {
      const tools = await listToolsHandler({ method: 'tools/list' });
      const toolNames = tools.tools.map(t => t.name);
      expect(toolNames).not.toContain('set-version');
    });

    it('should NOT have get-current-version tool', async () => {
      const tools = await listToolsHandler({ method: 'tools/list' });
      const toolNames = tools.tools.map(t => t.name);
      expect(toolNames).not.toContain('get-current-version');
    });

    it('should still have list-versions tool', async () => {
      const tools = await listToolsHandler({ method: 'tools/list' });
      const toolNames = tools.tools.map(t => t.name);
      expect(toolNames).toContain('list-versions');
    });

    it('smart-query should accept version parameter', async () => {
      const tools = await listToolsHandler({ method: 'tools/list' });
      const smartQuery = tools.tools.find(t => t.name === 'smart-query');
      expect(smartQuery.inputSchema.properties.version).toBeDefined();
      expect(smartQuery.inputSchema.properties.version.type).toBe('string');
    });

    it('validate-config should accept version parameter', async () => {
      const tools = await listToolsHandler({ method: 'tools/list' });
      const validateConfig = tools.tools.find(t => t.name === 'validate-config');
      expect(validateConfig.inputSchema.properties.version).toBeDefined();
    });

    it('create-vcluster-config should accept version parameter', async () => {
      const tools = await listToolsHandler({ method: 'tools/list' });
      const createConfig = tools.tools.find(t => t.name === 'create-vcluster-config');
      expect(createConfig.inputSchema.properties.version).toBeDefined();
    });
  });

  describe('Version Parameter Usage', () => {
    it('smart-query should use version parameter instead of global state', async () => {
      const request = {
        method: 'tools/call',
        params: {
          name: 'smart-query',
          arguments: {
            query: 'k0s',
            version: 'v0.24.0'
          }
        }
      };

      const response = await toolHandler(request);
      // Response should indicate v0.24.0
      expect(response.content[0].text).toContain('v0.24.0');
    });

    it('smart-query should default to main when no version provided', async () => {
      const request = {
        method: 'tools/call',
        params: {
          name: 'smart-query',
          arguments: {
            query: 'k3s'
          }
        }
      };

      const response = await toolHandler(request);
      // Should use main by default
      expect(response.content[0].text).toContain('main');
    });

    it('validate-config should validate against specified version', async () => {
      const yaml = `
controlPlane:
  distro:
    k3s:
      enabled: true
`;
      const request = {
        method: 'tools/call',
        params: {
          name: 'validate-config',
          arguments: {
            content: yaml,
            version: 'v0.29.0'
          }
        }
      };

      const response = await toolHandler(request);
      const result = JSON.parse(response.content[0].text);
      expect(result.version).toBe('v0.29.0');
    });
  });

  describe('Parallel Version Queries', () => {
    it('should support parallel queries to different versions', async () => {
      const request1 = {
        method: 'tools/call',
        params: {
          name: 'smart-query',
          arguments: {
            query: 'k0s',
            version: 'v0.24.0'
          }
        }
      };

      const request2 = {
        method: 'tools/call',
        params: {
          name: 'smart-query',
          arguments: {
            query: 'k0s',
            version: 'v0.29.0'
          }
        }
      };

      // Run both queries
      const [response1, response2] = await Promise.all([
        toolHandler(request1),
        toolHandler(request2)
      ]);

      // Both should complete with their respective versions
      expect(response1.content[0].text).toContain('v0.24.0');
      expect(response2.content[0].text).toContain('v0.29.0');
    });
  });

  describe('Response Format', () => {
    it('responses should always include version information', async () => {
      const request = {
        method: 'tools/call',
        params: {
          name: 'smart-query',
          arguments: {
            query: 'k3s',
            version: 'v0.24.0'
          }
        }
      };

      const response = await toolHandler(request);
      // Response should clearly show which version was queried
      expect(response.content[0].text).toMatch(/v0\.24\.0/);
    });

    it('validate-config should return version in result object', async () => {
      const yaml = `
controlPlane:
  distro:
    k3s:
      enabled: true
`;
      const request = {
        method: 'tools/call',
        params: {
          name: 'validate-config',
          arguments: {
            content: yaml,
            version: 'v0.24.0'
          }
        }
      };

      const response = await toolHandler(request);
      const result = JSON.parse(response.content[0].text);
      expect(result).toHaveProperty('version');
      expect(result.version).toBe('v0.24.0');
    });
  });

  describe('All Tools with Version Parameter', () => {
    let listToolsHandler;

    const toolsWithVersion = [
      'smart-query',
      'validate-config',
      'create-vcluster-config',
      'extract-validation-rules'
    ];

    beforeEach(() => {
      listToolsHandler = server._requestHandlers.get('tools/list');
    });

    toolsWithVersion.forEach(toolName => {
      it(`${toolName} should have version parameter`, async () => {
        const tools = await listToolsHandler({ method: 'tools/list' });
        const tool = tools.tools.find(t => t.name === toolName);
        expect(tool).toBeDefined();
        expect(tool.inputSchema.properties.version).toBeDefined();
        expect(tool.inputSchema.properties.version.type).toBe('string');
      });
    });
  });
});
