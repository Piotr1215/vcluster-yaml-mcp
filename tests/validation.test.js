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

  describe('Procedural Validation - Business Logic', () => {
    it('should fail when multiple backing stores are enabled', async () => {
      const config = `
controlPlane:
  backingStore:
    etcd:
      deploy:
        enabled: true
    database:
      embedded:
        enabled: true
`;
      
      const response = await handler({
        method: 'tools/call',
        params: {
          name: 'validate-config',
          arguments: { content: config }
        }
      });
      
      // Parse JSON response
      const result = JSON.parse(response.content[0].text);
      expect(result.layers.procedural.valid).toBe(false);
      expect(result.layers.procedural.errors.length).toBeGreaterThan(0);
      expect(result.severity.errors).toBeGreaterThan(0);
      expect(result.overall_status).toContain('FAILED');
    });

    it('should pass when only one backing store is enabled', async () => {
      const config = `
controlPlane:
  backingStore:
    etcd:
      deploy:
        enabled: true
    database:
      embedded:
        enabled: false
`;
      
      const response = await handler({
        method: 'tools/call',
        params: {
          name: 'validate-config',
          arguments: { content: config }
        }
      });
      
      const result = JSON.parse(response.content[0].text);
      // Should not have procedural violations for backing stores
      expect(result.layers.procedural.valid).toBe(true);
      expect(result.layers.procedural.errors.length).toBe(0);
    });

    it('should fail when multiple distros are enabled', async () => {
      const config = `
controlPlane:
  distro:
    k3s:
      enabled: true
    k8s:
      enabled: true
`;
      
      const response = await handler({
        method: 'tools/call',
        params: {
          name: 'validate-config',
          arguments: { content: config }
        }
      });
      
      const result = JSON.parse(response.content[0].text);
      expect(result.layers.procedural.valid).toBe(false);
      expect(result.layers.procedural.errors.length).toBeGreaterThan(0);
      expect(result.severity.errors).toBeGreaterThan(0);
    });

    it('should reject negative numeric values for specific fields', async () => {
      const config = `
controlPlane:
  coredns:
    deployment:
      replicas: -1
`;
      
      const response = await handler({
        method: 'tools/call',
        params: {
          name: 'validate-config',
          arguments: { content: config }
        }
      });
      
      const result = JSON.parse(response.content[0].text);
      expect(result.layers.procedural.valid).toBe(false);
      expect(result.layers.procedural.errors.length).toBeGreaterThan(0);
    });

    it('should reject port numbers outside valid range', async () => {
      const configTooHigh = `
controlPlane:
  service:
    spec:
      port: 70000
`;
      
      const responseTooHigh = await handler({
        method: 'tools/call',
        params: {
          name: 'validate-config',
          arguments: { content: configTooHigh }
        }
      });
      
      const resultHigh = JSON.parse(responseTooHigh.content[0].text);
      expect(resultHigh.layers.procedural.valid).toBe(false);
      expect(resultHigh.layers.procedural.errors.length).toBeGreaterThan(0);

      const configTooLow = `
controlPlane:
  service:
    spec:
      port: 0
`;
      
      const responseTooLow = await handler({
        method: 'tools/call',
        params: {
          name: 'validate-config',
          arguments: { content: configTooLow }
        }
      });
      
      const resultLow = JSON.parse(responseTooLow.content[0].text);
      expect(resultLow.layers.procedural.valid).toBe(false);
      expect(resultLow.layers.procedural.errors.length).toBeGreaterThan(0);
    });

    it('should accept valid port numbers', async () => {
      const config = `
controlPlane:
  service:
    spec:
      port: 8443
`;
      
      const response = await handler({
        method: 'tools/call',
        params: {
          name: 'validate-config',
          arguments: { content: config }
        }
      });
      
      const result = JSON.parse(response.content[0].text);
      expect(result.layers.procedural.valid).toBe(true);
      expect(result.layers.procedural.errors.length).toBe(0);
    });

    it('should enforce boolean type for enabled fields', async () => {
      const config = `
sync:
  toHost:
    namespaces:
      enabled: "yes"
`;
      
      const response = await handler({
        method: 'tools/call',
        params: {
          name: 'validate-config',
          arguments: { content: config }
        }
      });
      
      const result = JSON.parse(response.content[0].text);
      expect(result.layers.procedural.valid).toBe(false);
      expect(result.layers.procedural.errors.length).toBeGreaterThan(0);
    });

    it('should detect conflicting sync configurations', async () => {
      const config = `
sync:
  toHost:
    networkPolicies:
      enabled: true
    namespaces:
      enabled: true
`;
      
      const response = await handler({
        method: 'tools/call',
        params: {
          name: 'validate-config',
          arguments: { content: config }
        }
      });
      
      const result = JSON.parse(response.content[0].text);
      expect(result.layers.procedural.valid).toBe(false);
      expect(result.layers.procedural.errors.length).toBeGreaterThan(0);
    });

    it('should handle YAML syntax errors', async () => {
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
      expect(result.layers.syntax.valid).toBe(false);
      expect(result.layers.syntax.errors.length).toBeGreaterThan(0);
      expect(result.overall_status).toContain('FAILED');
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

  describe('Hybrid Validation - AI Rules Integration', () => {
    it('should include AI rules data structure when requested', async () => {
      const config = `
controlPlane:
  distro:
    k3s:
      enabled: true
`;
      
      const yamlWithComments = `
controlPlane:
  # Valid values: k3s, k0s, k8s
  distro:
    k3s:
      enabled: true
`;
      
      githubClient.getFileContent.mockResolvedValue(yamlWithComments);
      
      const response = await handler({
        method: 'tools/call',
        params: {
          name: 'validate-config',
          arguments: { 
            content: config,
            includeAiRules: true
          }
        }
      });
      
      // Response should be JSON with semantic layer populated
      const result = JSON.parse(response.content[0].text);
      expect(result.layers.semantic).toBeDefined();
      expect(result.layers.semantic.extracted).toBeGreaterThan(0);
      expect(result.layers.semantic.rules.length).toBeGreaterThan(0);
    });

    it('should always extract AI rules by default', async () => {
      const config = `
controlPlane:
  distro:
    k3s:
      enabled: true
`;

      const yamlWithComments = `
controlPlane:
  # Valid values: k3s, k0s, k8s
  distro:
    k3s:
      enabled: true
`;
      
      githubClient.getFileContent.mockResolvedValue(yamlWithComments);
      
      const response = await handler({
        method: 'tools/call',
        params: {
          name: 'validate-config',
          arguments: { content: config }
        }
      });
      
      // Semantic layer should have extracted rules (always extracted now)
      const result = JSON.parse(response.content[0].text);
      expect(result.layers.semantic).toBeDefined();
      expect(result.layers.semantic.extracted).toBeGreaterThan(0);
      expect(result.layers.semantic.rules.length).toBeGreaterThan(0);
    });

    it('should handle AI rules extraction error gracefully', async () => {
      const config = `
controlPlane:
  distro:
    k3s:
      enabled: true
`;
      
      // Mock failure
      githubClient.getFileContent.mockRejectedValue(new Error('File not found'));
      
      const response = await handler({
        method: 'tools/call',
        params: {
          name: 'validate-config',
          arguments: { 
            content: config,
            includeAiRules: true
          }
        }
      });
      
      // Should still return validation results in JSON format
      const result = JSON.parse(response.content[0].text);
      expect(result.layers.syntax).toBeDefined();
      expect(result.layers.procedural).toBeDefined();
      expect(result.layers.semantic).toBeDefined();
      // Semantic layer should be empty due to error
      expect(result.layers.semantic.extracted).toBe(0);
      expect(result.layers.semantic.rules.length).toBe(0);
    });
  });

  describe('Valid Configuration - Happy Path', () => {
    it('should pass completely valid configuration', async () => {
      const config = `
controlPlane:
  distro:
    k3s:
      enabled: true
  backingStore:
    etcd:
      deploy:
        enabled: true
        statefulSet:
          highAvailability:
            replicas: 3
  service:
    spec:
      port: 8443
sync:
  toHost:
    services:
      enabled: true
`;
      
      const response = await handler({
        method: 'tools/call',
        params: {
          name: 'validate-config',
          arguments: { content: config }
        }
      });
      
      const result = JSON.parse(response.content[0].text);
      // Should pass all validations
      expect(result.layers.syntax.valid).toBe(true);
      expect(result.layers.procedural.valid).toBe(true);
      expect(result.overall_status).toContain('PASSED');
      expect(result.severity.errors).toBe(0);
      // May have warnings from AI rules extraction
    });

    it('should generate configuration summary for valid config', async () => {
      const config = `
controlPlane:
  distro:
    k3s:
      enabled: true
  backingStore:
    etcd:
      deploy:
        enabled: true
        statefulSet:
          highAvailability:
            replicas: 5
`;
      
      const response = await handler({
        method: 'tools/call',
        params: {
          name: 'validate-config',
          arguments: { content: config }
        }
      });
      
      const result = JSON.parse(response.content[0].text);
      // Should have valid configuration with next steps
      expect(result.overall_status).toContain('PASSED');
      expect(result.next_steps).toBeDefined();
      expect(Array.isArray(result.next_steps)).toBe(true);
      // Check that configuration was properly parsed
      expect(result.layers.syntax.valid).toBe(true);
      expect(result.layers.procedural.valid).toBe(true);
    });
  });
});