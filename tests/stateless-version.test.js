/**
 * Test stateless version approach
 * Every tool accepts optional version parameter instead of relying on state
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createServer } from '../src/server.js';

/**
 * Helper to get tool list from McpServer
 */
function getTools(server) {
  return Object.entries(server._registeredTools).map(([name, tool]) => ({
    name,
    description: tool.description,
    inputSchema: tool.inputSchema
  }));
}

/**
 * Helper to call a tool handler
 */
async function callTool(server, toolName, args) {
  const tool = server._registeredTools[toolName];
  if (!tool) {
    throw new Error(`Tool not found: ${toolName}`);
  }
  return await tool.handler(args);
}

describe('Stateless Version Approach', () => {
  let server;

  beforeEach(() => {
    server = createServer();
  });

  describe('Tool Definitions', () => {
    it('should NOT have set-version tool', async () => {
      const tools = getTools(server);
      const toolNames = tools.map(t => t.name);
      expect(toolNames).not.toContain('set-version');
    });

    it('should NOT have get-current-version tool', async () => {
      const tools = getTools(server);
      const toolNames = tools.map(t => t.name);
      expect(toolNames).not.toContain('get-current-version');
    });

    it('should still have list-versions tool', async () => {
      const tools = getTools(server);
      const toolNames = tools.map(t => t.name);
      expect(toolNames).toContain('list-versions');
    });

    it('smart-query should accept version parameter', async () => {
      const tools = getTools(server);
      const smartQuery = tools.find(t => t.name === 'smart-query');
      expect(smartQuery.inputSchema.properties.version).toBeDefined();
      expect(smartQuery.inputSchema.properties.version.type).toBe('string');
    });

    it('validate-config should accept version parameter', async () => {
      const tools = getTools(server);
      const validateConfig = tools.find(t => t.name === 'validate-config');
      expect(validateConfig.inputSchema.properties.version).toBeDefined();
    });

    it('create-vcluster-config should accept version parameter', async () => {
      const tools = getTools(server);
      const createConfig = tools.find(t => t.name === 'create-vcluster-config');
      expect(createConfig.inputSchema.properties.version).toBeDefined();
    });
  });

  describe('Version Parameter Usage', () => {
    it('smart-query should use version parameter instead of global state', async () => {
      const response = await callTool(server, 'smart-query', {
        query: 'k0s',
        version: 'v0.24.0'
      });
      // Response should indicate v0.24.0
      expect(response.content[0].text).toContain('v0.24.0');
    });

    it('smart-query should default to main when no version provided', async () => {
      const response = await callTool(server, 'smart-query', {
        query: 'k3s'
      });
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
      const response = await callTool(server, 'validate-config', {
        content: yaml,
        version: 'v0.29.0'
      });
      const result = JSON.parse(response.content[0].text);
      expect(result.version).toBe('v0.29.0');
    });
  });

  describe('Parallel Version Queries', () => {
    it('should support parallel queries to different versions', async () => {
      // Run both queries
      const [response1, response2] = await Promise.all([
        callTool(server, 'smart-query', { query: 'k0s', version: 'v0.24.0' }),
        callTool(server, 'smart-query', { query: 'k0s', version: 'v0.29.0' })
      ]);

      // Both should complete with their respective versions
      expect(response1.content[0].text).toContain('v0.24.0');
      expect(response2.content[0].text).toContain('v0.29.0');
    });
  });

  describe('Response Format', () => {
    it('responses should always include version information', async () => {
      const response = await callTool(server, 'smart-query', {
        query: 'k3s',
        version: 'v0.24.0'
      });
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
      const response = await callTool(server, 'validate-config', {
        content: yaml,
        version: 'v0.24.0'
      });
      const result = JSON.parse(response.content[0].text);
      expect(result).toHaveProperty('version');
      expect(result.version).toBe('v0.24.0');
    });
  });

  describe('All Tools with Version Parameter', () => {
    const toolsWithVersion = [
      'smart-query',
      'validate-config',
      'create-vcluster-config',
      'extract-validation-rules'
    ];

    toolsWithVersion.forEach(toolName => {
      it(`${toolName} should have version parameter`, async () => {
        const tools = getTools(server);
        const tool = tools.find(t => t.name === toolName);
        expect(tool).toBeDefined();
        expect(tool.inputSchema.properties.version).toBeDefined();
        expect(tool.inputSchema.properties.version.type).toBe('string');
      });
    });
  });
});
