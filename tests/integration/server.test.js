import { describe, it, expect, beforeEach } from 'vitest';
import { createServer } from '../../dist/server.js';
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
      // New SDK wraps the underlying server - serverInfo is on server.server
      expect(server.server._serverInfo.name).toBe('vcluster-yaml-mcp-server');
    });

    it('should have registered tools', () => {
      // New SDK uses _registeredTools
      expect(server._registeredTools).toBeDefined();
      expect(Object.keys(server._registeredTools).length).toBeGreaterThan(0);
    });

    it('should return a valid server instance', () => {
      expect(server).toBeDefined();
      expect(server.connect).toBeDefined();
      // New SDK uses registerTool instead of setRequestHandler
      expect(server.registerTool).toBeDefined();
    });
  });

  describe('Tool Definitions', () => {
    it('should define all expected tools', () => {
      // New SDK uses _registeredTools object
      const tools = server._registeredTools;
      const toolNames = Object.keys(tools);

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

    it('should have correct smart-query tool definition', () => {
      const tools = server._registeredTools;
      const smartQuery = tools['smart-query'];

      expect(smartQuery).toBeDefined();
      expect(smartQuery.description).toContain('UNIVERSAL SEARCH');
    });

    it('should allow optional file/content parameters for validation', () => {
      const tools = server._registeredTools;
      const validateConfig = tools['validate-config'];

      expect(validateConfig).toBeDefined();
      expect(validateConfig.description).toContain('VALIDATION ONLY');
    });

    it('should have extract-validation-rules tool', () => {
      const tools = server._registeredTools;
      const extractRules = tools['extract-validation-rules'];

      expect(extractRules).toBeDefined();
      expect(extractRules.description).toContain('AI ASSISTANT');
    });
  });
});
