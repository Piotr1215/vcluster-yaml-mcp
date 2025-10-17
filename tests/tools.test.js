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

  describe('list-versions tool', () => {
    it('should return main branch and versions starting with v', async () => {
      const request = {
        method: 'tools/call',
        params: {
          name: 'list-versions',
          arguments: {}
        }
      };

      const response = await toolHandler(request);
      const text = response.content[0].text;

      // Should include 'main' branch
      expect(text).toContain('- main');

      // Should include versions starting with 'v'
      expect(text).toMatch(/- v\d+\.\d+/);

      // Should NOT include other branches (no 'release' or 'develop' without 'v' prefix)
      const lines = text.split('\n').filter(line => line.startsWith('- '));
      const invalidVersions = lines.filter(line =>
        !line.includes('- main') && !line.match(/- v\d/)
      );
      expect(invalidVersions).toHaveLength(0);
    });
  });

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
      expect(response.content[0].text).toContain('result(s)');
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

  describe('query-config tool', () => {
    it('should query from file', async () => {
      const request = {
        method: 'tools/call',
        params: {
          name: 'query-config',
          arguments: {
            file: 'chart/values.yaml',
            query: '.controlPlane.distro'
          }
        }
      };

      const response = await toolHandler(request);
      expect(response.content[0].text).toContain('k8s');
    });

    it('should query from direct content', async () => {
      const yamlContent = `
controlPlane:
  distro: k8s
networking:
  serviceCIDR: "10.96.0.0/12"
`;
      const request = {
        method: 'tools/call',
        params: {
          name: 'query-config',
          arguments: {
            content: yamlContent,
            query: '.controlPlane.distro'
          }
        }
      };

      const response = await toolHandler(request);
      expect(response.content[0].text).toContain('k8s');
    });

    it('should handle raw output option', async () => {
      const request = {
        method: 'tools/call',
        params: {
          name: 'query-config',
          arguments: {
            file: 'chart/values.yaml',
            query: '.controlPlane.distro',
            raw: true
          }
        }
      };

      const response = await toolHandler(request);
      expect(response.content[0].text).toBeDefined();
    });

    it('should use default file when neither file nor content provided', async () => {
      const request = {
        method: 'tools/call',
        params: {
          name: 'query-config',
          arguments: {
            query: '.controlPlane.distro'
          }
        }
      };

      const response = await toolHandler(request);
      // Should work with default chart/values.yaml
      expect(response.content[0].text).toBeDefined();
      expect(response.isError).toBeFalsy();
    });
  });

  describe('get-config-value tool', () => {
    it('should get value from file using dot notation', async () => {
      const request = {
        method: 'tools/call',
        params: {
          name: 'get-config-value',
          arguments: {
            file: 'chart/values.yaml',
            path: 'controlPlane.distro'
          }
        }
      };

      const response = await toolHandler(request);
      expect(response.content[0].text).toContain('Value at controlPlane.distro');
      expect(response.content[0].text).toContain('k8s');
    });

    it('should get value from direct content', async () => {
      const yamlContent = `
storage:
  persistence: true
  size: 20Gi
`;
      const request = {
        method: 'tools/call',
        params: {
          name: 'get-config-value',
          arguments: {
            content: yamlContent,
            path: 'storage.size'
          }
        }
      };

      const response = await toolHandler(request);
      expect(response.content[0].text).toContain('20Gi');
    });

    it('should handle array indices', async () => {
      const yamlContent = `
items:
  - name: first
  - name: second
`;
      const request = {
        method: 'tools/call',
        params: {
          name: 'get-config-value',
          arguments: {
            content: yamlContent,
            path: 'items.1.name'
          }
        }
      };

      const response = await toolHandler(request);
      expect(response.content[0].text).toContain('second');
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

  describe('search-config tool', () => {
    it('should search in file', async () => {
      const request = {
        method: 'tools/call',
        params: {
          name: 'search-config',
          arguments: {
            file: 'chart/values.yaml',
            search: 'etcd'
          }
        }
      };

      const response = await toolHandler(request);
      expect(response.content[0].text.toLowerCase()).toContain('etcd');
    });

    it('should search in direct content', async () => {
      const yamlContent = `
database:
  type: postgresql
  host: localhost
`;
      const request = {
        method: 'tools/call',
        params: {
          name: 'search-config',
          arguments: {
            content: yamlContent,
            search: 'postgres'
          }
        }
      };

      const response = await toolHandler(request);
      expect(response.content[0].text).toContain('match');
    });

    it('should support keysOnly option', async () => {
      const request = {
        method: 'tools/call',
        params: {
          name: 'search-config',
          arguments: {
            file: 'chart/values.yaml',
            search: 'distro',
            keysOnly: true
          }
        }
      };

      const response = await toolHandler(request);
      expect(response.content[0].text).toContain('Key:');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid YAML content', async () => {
      const request = {
        method: 'tools/call',
        params: {
          name: 'query-config',
          arguments: {
            content: 'invalid:\n  - unbalanced bracket: [',
            query: '.test'
          }
        }
      };

      const response = await toolHandler(request);
      expect(response.content[0].text.toLowerCase()).toContain('error');
    });

    it('should handle non-existent file', async () => {
      const request = {
        method: 'tools/call',
        params: {
          name: 'query-config',
          arguments: {
            file: 'nonexistent.yaml',
            query: '.test'
          }
        }
      };

      const response = await toolHandler(request);
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Error');
    });

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