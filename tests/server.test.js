import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createServer } from '../src/server.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('VCluster YAML MCP Server', () => {
  let server;
  const testConfigPath = path.join(__dirname, '..', 'test-config');

  beforeEach(() => {
    server = createServer(testConfigPath);
  });

  describe('Server Creation', () => {
    it('should create server with correct metadata', () => {
      expect(server._serverInfo.name).toBe('vcluster-yaml-mcp-server');
      expect(server._serverInfo.version).toBe('0.1.0');
    });

    it('should have tools capability', () => {
      expect(server._options.capabilities.tools).toBeDefined();
    });

    it('should return a valid server instance', () => {
      expect(server).toBeDefined();
      expect(server.connect).toBeDefined();
      expect(server.setRequestHandler).toBeDefined();
    });
  });

  describe('Tool Definitions', () => {
    it('should define all expected tools', async () => {
      const handler = server._requestHandlers.get('tools/list');
      const response = await handler({ method: 'tools/list', params: {} });
      
      const toolNames = response.tools.map(t => t.name);
      expect(toolNames).toContain('list-configs');
      expect(toolNames).toContain('smart-query');
      expect(toolNames).toContain('query-config');
      expect(toolNames).toContain('get-config-value');
      expect(toolNames).toContain('validate-config');
      expect(toolNames).toContain('search-config');
    });

    it('should have correct smart-query tool definition', async () => {
      const handler = server._requestHandlers.get('tools/list');
      const response = await handler({ method: 'tools/list', params: {} });
      
      const smartQuery = response.tools.find(t => t.name === 'smart-query');
      expect(smartQuery).toBeDefined();
      expect(smartQuery.description).toContain('Smart search');
      expect(smartQuery.inputSchema.required).toEqual(['query']);
      expect(smartQuery.inputSchema.properties.query).toBeDefined();
      expect(smartQuery.inputSchema.properties.file).toBeDefined();
    });

    it('should allow optional file/content parameters for validation', async () => {
      const handler = server._requestHandlers.get('tools/list');
      const response = await handler({ method: 'tools/list', params: {} });
      
      const validateConfig = response.tools.find(t => t.name === 'validate-config');
      expect(validateConfig).toBeDefined();
      expect(validateConfig.inputSchema.required).toEqual([]);
      expect(validateConfig.inputSchema.properties.file).toBeDefined();
      expect(validateConfig.inputSchema.properties.content).toBeDefined();
    });
  });
});