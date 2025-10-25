import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createServer } from '../../src/server.js';
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
      expect(server._serverInfo.version).toBe('1.0.5');
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
      expect(toolNames).toContain('list-versions');
      expect(toolNames).toContain('smart-query');
      expect(toolNames).toContain('validate-config');
      expect(toolNames).toContain('extract-validation-rules');
      expect(toolNames).toContain('create-vcluster-config');
      // Removed: set-version, get-current-version (stateless), list-configs, get-config-metadata, get-schema (confusing/overlapping)
      expect(toolNames).not.toContain('set-version');
      expect(toolNames).not.toContain('get-current-version');
      expect(toolNames).not.toContain('list-configs');
      expect(toolNames).not.toContain('get-config-metadata');
      expect(toolNames).not.toContain('get-schema');
    });

    it('should have correct smart-query tool definition', async () => {
      const handler = server._requestHandlers.get('tools/list');
      const response = await handler({ method: 'tools/list', params: {} });
      
      const smartQuery = response.tools.find(t => t.name === 'smart-query');
      expect(smartQuery).toBeDefined();
      expect(smartQuery.description).toContain('UNIVERSAL SEARCH');
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
      // includeAiRules removed - validation always includes all layers now
    });

    it('should have extract-validation-rules tool', async () => {
      const handler = server._requestHandlers.get('tools/list');
      const response = await handler({ method: 'tools/list', params: {} });
      
      const extractRules = response.tools.find(t => t.name === 'extract-validation-rules');
      expect(extractRules).toBeDefined();
      expect(extractRules.description).toContain('AI ASSISTANT');
      expect(extractRules.inputSchema.properties.file).toBeDefined();
      expect(extractRules.inputSchema.properties.section).toBeDefined();
    });
  });
});