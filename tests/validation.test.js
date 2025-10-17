import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createServer } from '../src/server.js';

// Mock GitHub client
vi.mock('../src/github.js', () => ({
  githubClient: {
    getFileContent: vi.fn(),
    getYamlContent: vi.fn(),
    getTags: vi.fn(() => ['v0.19.0', 'v0.18.0']),
    getBranches: vi.fn(() => ['main', 'develop']),
    setRef: vi.fn(),
    listFiles: vi.fn(() => [])
  }
}));

import { githubClient } from '../src/github.js';

describe('VCluster Validation Tests', () => {
  let server;
  let handler;

  beforeEach(() => {
    server = createServer();
    handler = server._requestHandlers.get('tools/call');
    vi.clearAllMocks();
  });

  describe('Data-Only Validation - Returns Structured Data', () => {
    it('should return structured data for valid config', async () => {
      const config = `
controlPlane:
  backingStore:
    etcd:
      deploy:
        enabled: true
`;

      githubClient.getFileContent.mockResolvedValue(`controlPlane:\n  backingStore:\n    etcd:\n      deploy:\n        enabled: true`);

      const response = await handler({
        method: 'tools/call',
        params: {
          name: 'validate-config',
          arguments: { content: config }
        }
      });

      const result = JSON.parse(response.content[0].text);
      expect(result.syntax_valid).toBe(true);
      expect(result.version).toBe('main');
      expect(result.config_paths).toBeDefined();
      expect(Array.isArray(result.config_paths)).toBe(true);
      expect(result.config_paths.some(p => p.includes('controlPlane'))).toBe(true);
    });

    it('should return syntax error for invalid YAML', async () => {
      const config = `
this is not valid yaml:
  - broken
  : syntax
`;

      const response = await handler({
        method: 'tools/call',
        params: {
          name: 'validate-config',
          arguments: { content: config }
        }
      });

      const result = JSON.parse(response.content[0].text);
      expect(result.syntax_valid).toBe(false);
      expect(result.syntax_error).toBeDefined();
      expect(result.instructions).toContain('Fix YAML syntax');
    });

    it('should include validation hints when available', async () => {
      const config = `
controlPlane:
  distro:
    k3s:
      enabled: true
`;

      githubClient.getFileContent.mockResolvedValue(`controlPlane:\n  distro:\n    # Only one distro can be enabled\n    k3s:\n      enabled: true`);

      const response = await handler({
        method: 'tools/call',
        params: {
          name: 'validate-config',
          arguments: { content: config }
        }
      });

      const result = JSON.parse(response.content[0].text);
      expect(result.syntax_valid).toBe(true);
      expect(result.validation_data).toBeDefined();
    });

    it('should handle file loading errors gracefully', async () => {
      const config = `
controlPlane:
  distro:
    k3s:
      enabled: true
`;

      githubClient.getFileContent.mockRejectedValue(new Error('File not found'));

      const response = await handler({
        method: 'tools/call',
        params: {
          name: 'validate-config',
          arguments: { content: config }
        }
      });

      const result = JSON.parse(response.content[0].text);
      expect(result.syntax_valid).toBe(true);
      expect(result.config_paths).toBeDefined();
    });

    it('should extract config paths correctly', async () => {
      const config = `
controlPlane:
  backingStore:
    database:
      external:
        enabled: true
        connector: my-database-connector
`;

      githubClient.getFileContent.mockResolvedValue('');

      const response = await handler({
        method: 'tools/call',
        params: {
          name: 'validate-config',
          arguments: { content: config }
        }
      });

      const result = JSON.parse(response.content[0].text);
      expect(result.syntax_valid).toBe(true);
      expect(result.config_paths).toContain('controlPlane');
      expect(result.config_paths).toContain('controlPlane.backingStore');
      expect(result.config_paths.some(p => p.includes('connector'))).toBe(true);
    });

    it('should return parsed user config paths', async () => {
      const config = `
controlPlane:
  backingStore:
    database:
      external:
        enabled: true
        connector: my-database-connector
`;

      githubClient.getFileContent.mockResolvedValue('');

      const response = await handler({
        method: 'tools/call',
        params: {
          name: 'validate-config',
          arguments: { content: config }
        }
      });

      const result = JSON.parse(response.content[0].text);
      expect(result.syntax_valid).toBe(true);
      expect(result.config_paths.some(p => p.includes('connector'))).toBe(true);
      expect(result.config_paths.some(p => p.includes('enabled'))).toBe(true);
    });
  });

  describe('Extract Validation Rules - Data Structure', () => {
    it('should extract enum values from comments', async () => {
      const yamlWithComments = `
# Valid values: k3s, k0s, k8s
distro: k3s
`;

      githubClient.getFileContent.mockResolvedValue(yamlWithComments);

      const response = await handler({
        method: 'tools/call',
        params: {
          name: 'extract-validation-rules',
          arguments: { file: 'test.yaml' }
        }
      });

      const rules = JSON.parse(response.content[0].text);

      expect(rules.enums).toBeDefined();
      expect(rules.enums.distro).toBeDefined();
      expect(Array.isArray(rules.enums.distro)).toBe(true);
      expect(rules.enums.distro).toEqual(['k3s', 'k0s', 'k8s']);
    });

    it('should extract defaults from comments', async () => {
      const yamlWithComments = `
namespace:
  # Default: false
  enabled: true
`;

      githubClient.getFileContent.mockResolvedValue(yamlWithComments);

      const response = await handler({
        method: 'tools/call',
        params: {
          name: 'extract-validation-rules',
          arguments: { file: 'test.yaml' }
        }
      });

      const rules = JSON.parse(response.content[0].text);

      expect(rules.defaults).toBeDefined();
      expect(rules.defaults['namespace.enabled']).toBe('false');
    });

    it('should extract dependencies from comments', async () => {
      const yamlWithComments = `
# Requires namespace.enabled to be true
mappings:
  byName:
    "app-*": "vcluster-app-*"
`;

      githubClient.getFileContent.mockResolvedValue(yamlWithComments);

      const response = await handler({
        method: 'tools/call',
        params: {
          name: 'extract-validation-rules',
          arguments: { file: 'test.yaml' }
        }
      });

      const rules = JSON.parse(response.content[0].text);

      expect(rules.dependencies).toBeDefined();
      expect(Array.isArray(rules.dependencies)).toBe(true);
      expect(rules.dependencies.length).toBeGreaterThan(0);
    });

    it('should filter rules by section when specified', async () => {
      const yamlWithComments = `
controlPlane:
  # Control plane rule
  # Must be configured
  distro: k3s

sync:
  # Sync rule
  # At least one sync type
  toHost:
    namespaces:
      enabled: true
`;

      githubClient.getFileContent.mockResolvedValue(yamlWithComments);

      const response = await handler({
        method: 'tools/call',
        params: {
          name: 'extract-validation-rules',
          arguments: { file: 'test.yaml', section: 'sync' }
        }
      });

      const rules = JSON.parse(response.content[0].text);

      // Should only have rules for sync section
      expect(rules.rules).toBeDefined();
      expect(rules.rules.every(r => r.path.startsWith('sync'))).toBe(true);
      expect(rules.rules.some(r => r.path.startsWith('controlPlane'))).toBe(false);
    });

    it('should return structured AI instructions', async () => {
      const yamlWithComments = `
# Valid values: k3s, k0s
# Default: k3s
distro: k3s
`;

      githubClient.getFileContent.mockResolvedValue(yamlWithComments);

      const response = await handler({
        method: 'tools/call',
        params: {
          name: 'extract-validation-rules',
          arguments: { file: 'test.yaml' }
        }
      });

      const rules = JSON.parse(response.content[0].text);

      // Check structure, not content
      expect(rules).toHaveProperty('summary');
      expect(rules).toHaveProperty('rules');
      expect(rules).toHaveProperty('enums');
      expect(rules).toHaveProperty('dependencies');
      expect(rules).toHaveProperty('defaults');
      expect(rules).toHaveProperty('instructions');

      expect(typeof rules.instructions).toBe('string');
      expect(rules.instructions.length).toBeGreaterThan(0);
    });
  });

});
