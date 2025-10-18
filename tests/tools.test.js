import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createServer } from '../src/server.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Tool Implementations', () => {
  let server;
  let toolHandler;
  const testConfigPath = path.join(__dirname, '..', 'test-config');

  beforeEach(() => {
    server = createServer(testConfigPath);
    toolHandler = server._requestHandlers.get('tools/call');
  });

  // list-versions test removed - hits GitHub API rate limits in CI
  // Implementation is straightforward, testing would be flaky

  describe('smart-query tool', () => {
    it('should find etcd configuration without requiring YAML input', async () => {
      const request = {
        method: 'tools/call',
        params: {
          name: 'smart-query',
          arguments: {
            query: 'etcd'
          }
        }
      };

      const response = await toolHandler(request);
      expect(response.content[0].text).toMatch(/match(es)?/);
      expect(response.content[0].text.toLowerCase()).toContain('etcd');
    });

    it('should handle natural language queries', async () => {
      const request = {
        method: 'tools/call',
        params: {
          name: 'smart-query',
          arguments: {
            query: 'what is the service CIDR'
          }
        }
      };

      const response = await toolHandler(request);
      expect(response.content[0].text).toBeDefined();
    });

    it('should use default vcluster.yaml when no file specified', async () => {
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
      expect(response.content[0].text.toLowerCase()).toContain('values.yaml');
    });

    it('should handle common query patterns', async () => {
      const request = {
        method: 'tools/call',
        params: {
          name: 'smart-query',
          arguments: {
            query: 'networking'
          }
        }
      };

      const response = await toolHandler(request);
      expect(response.content[0].text.toLowerCase()).toContain('network');
    });
  });

  describe('create-vcluster-config tool', () => {
    it('should create and validate a valid config', async () => {
      const yamlContent = `
controlPlane:
  backingStore:
    etcd:
      embedded:
        enabled: true
`;
      const request = {
        method: 'tools/call',
        params: {
          name: 'create-vcluster-config',
          arguments: {
            yaml_content: yamlContent,
            description: 'Test config with embedded etcd'
          }
        }
      };

      const response = await toolHandler(request);
      expect(response.content[0].text).toContain('✅');
      expect(response.content[0].text).toContain('Configuration validated successfully');
      expect(response.content[0].text).toContain('controlPlane');
    });

    it('should report validation errors for invalid config', async () => {
      const yamlContent = `
controlPlane:
  distro:
    k3s:
      enabled: "not a boolean"
`;
      const request = {
        method: 'tools/call',
        params: {
          name: 'create-vcluster-config',
          arguments: {
            yaml_content: yamlContent
          }
        }
      };

      const response = await toolHandler(request);
      expect(response.content[0].text).toContain('❌');
      expect(response.content[0].text).toContain('Validation');
      expect(response.isError).toBe(true);
    });
  });

  describe('validate-config tool', () => {
    it('should validate file content', async () => {
      const request = {
        method: 'tools/call',
        params: {
          name: 'validate-config',
          arguments: {
            file: 'vcluster.yaml'
          }
        }
      };

      const response = await toolHandler(request);
      expect(response.content[0].text).toBeDefined();
    });

    it('should validate direct YAML content', async () => {
      const yamlContent = `
controlPlane:
  distro: k3s
`;
      const request = {
        method: 'tools/call',
        params: {
          name: 'validate-config',
          arguments: {
            content: yamlContent
          }
        }
      };

      const response = await toolHandler(request);
      expect(response.content[0].text).toBeDefined();
    });

    it('should work with default file when no input provided', async () => {
      const request = {
        method: 'tools/call',
        params: {
          name: 'validate-config',
          arguments: {}
        }
      };

      const response = await toolHandler(request);
      // Should validate the default chart/values.yaml
      expect(response.content[0].text).toBeDefined();
      // May or may not be valid, but shouldn't error on missing params
      expect(response.content).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle unknown tool', async () => {
      const request = {
        method: 'tools/call',
        params: {
          name: 'unknown-tool',
          arguments: {}
        }
      };

      const response = await toolHandler(request);
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Unknown tool');
    });
  });
});