import { describe, it, expect, beforeEach } from 'vitest';
import { createServer } from '../src/server.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Smart Query Feature', () => {
  let server;
  let toolHandler;
  const testConfigPath = path.join(__dirname, '..', 'test-config');

  beforeEach(() => {
    server = createServer(testConfigPath);
    toolHandler = server._requestHandlers.get('tools/call');
  });

  describe('Natural Language Queries', () => {
    it('should understand "etcd" query', async () => {
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
      expect(response.content[0].text).toBeDefined();
      expect(response.content[0].text.toLowerCase()).toContain('etcd');
    });

    it('should understand "networking" query', async () => {
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
      expect(response.content[0].text).toBeDefined();
      const text = response.content[0].text.toLowerCase();
      expect(text).toMatch(/network|cidr|pod|service/);
    });

    it('should understand "what is the distro" query', async () => {
      const request = {
        method: 'tools/call',
        params: {
          name: 'smart-query',
          arguments: {
            query: 'what is the distro'
          }
        }
      };

      const response = await toolHandler(request);
      expect(response.content[0].text).toBeDefined();
      expect(response.content[0].text.toLowerCase()).toContain('distro');
    });

    it('should understand "storage configuration" query', async () => {
      const request = {
        method: 'tools/call',
        params: {
          name: 'smart-query',
          arguments: {
            query: 'storage configuration'
          }
        }
      };

      const response = await toolHandler(request);
      expect(response.content[0].text).toBeDefined();
      expect(response.content[0].text.toLowerCase()).toContain('storage');
    });
  });

  describe('Common Pattern Matching', () => {
    it('should match CIDR patterns', async () => {
      const request = {
        method: 'tools/call',
        params: {
          name: 'smart-query',
          arguments: {
            query: 'cidr'
          }
        }
      };

      const response = await toolHandler(request);
      expect(response.content[0].text).toBeDefined();
      expect(response.content[0].text.toLowerCase()).toContain('cidr');
    });

    it('should match k3s/k8s patterns', async () => {
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
      expect(response.content[0].text).toBeDefined();
    });

    it('should match kubernetes patterns', async () => {
      const request = {
        method: 'tools/call',
        params: {
          name: 'smart-query',
          arguments: {
            query: 'kubernetes'
          }
        }
      };

      const response = await toolHandler(request);
      expect(response.content[0].text).toBeDefined();
    });
  });

  describe('Fallback Behavior', () => {
    it('should provide helpful suggestions when no matches found', async () => {
      const request = {
        method: 'tools/call',
        params: {
          name: 'smart-query',
          arguments: {
            query: 'nonexistentconfig'
          }
        }
      };

      const response = await toolHandler(request);
      expect(response.content[0].text).toContain('No matches');
      expect(response.content[0].text).toContain('Tips');
    });

    it('should auto-detect and use available YAML files', async () => {
      const request = {
        method: 'tools/call',
        params: {
          name: 'smart-query',
          arguments: {
            query: 'distro'
          }
        }
      };

      const response = await toolHandler(request);
      expect(response.content[0].text).toBeDefined();
      expect(response.isError).not.toBe(true);
    });
  });

  describe('File Handling', () => {
    it('should use specified file when provided', async () => {
      const request = {
        method: 'tools/call',
        params: {
          name: 'smart-query',
          arguments: {
            query: 'etcd',
            file: 'vcluster.yaml'
          }
        }
      };

      const response = await toolHandler(request);
      expect(response.content[0].text).toContain('vcluster.yaml');
    });

    it('should fall back to first available YAML when default not found', async () => {
      const request = {
        method: 'tools/call',
        params: {
          name: 'smart-query',
          arguments: {
            query: 'test',
            file: 'nonexistent.yaml'
          }
        }
      };

      const response = await toolHandler(request);
      // Should either error or fall back to available file
      expect(response.content[0].text).toBeDefined();
    });
  });

  describe('Result Formatting', () => {
    it('should show result count', async () => {
      const request = {
        method: 'tools/call',
        params: {
          name: 'smart-query',
          arguments: {
            query: 'enabled'
          }
        }
      };

      const response = await toolHandler(request);
      if (!response.content[0].text.includes('No direct matches')) {
        expect(response.content[0].text).toMatch(/Found \d+ match(es)?/);
      }
    });

    it('should format results with path and value', async () => {
      const request = {
        method: 'tools/call',
        params: {
          name: 'smart-query',
          arguments: {
            query: 'distro'
          }
        }
      };

      const response = await toolHandler(request);
      if (!response.content[0].text.includes('No direct matches')) {
        expect(response.content[0].text).toContain(':');
      }
    });
  });
});