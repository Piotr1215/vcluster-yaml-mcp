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

describe('Edge Case Tests for Path Filtering', () => {
  let server;
  let handler;

  beforeEach(() => {
    server = createServer();
    handler = server._requestHandlers.get('tools/call');
    vi.clearAllMocks();
  });

  describe('Wildcard Path Handling', () => {
    it('should handle wildcard patterns in namespace mappings', async () => {
      const config = `
sync:
  toHost:
    namespaces:
      mappings:
        byName:
          "customer-*": "prefix-*"
          "feature-*": "dev-*"
`;

      const yamlWithComments = `
sync:
  toHost:
    namespaces:
      # Namespace mappings support wildcards
      # Required: at least one mapping
      mappings:
        byName:
          # Wildcard patterns must be quoted
          # Valid pattern: "customer-*"
          # Pattern format: "source-*": "target-*"
`;

      githubClient.getFileContent.mockResolvedValue(yamlWithComments);
      
      const response = await handler({
        method: 'tools/call',
        params: {
          name: 'validate-config',
          arguments: { content: config }
        }
      });
      
      const result = JSON.parse(response.content[0].text);
      
      // Should still validate correctly with wildcards
      expect(result.layers.syntax.valid).toBe(true);
      expect(result.layers.procedural.valid).toBe(true);
      
      // Should include relevant semantic rules for namespace mappings
      const hasNamespaceMappingRules = result.layers.semantic.rules.some(rule =>
        rule.path && rule.path.includes('namespaces.mappings')
      );
      expect(hasNamespaceMappingRules).toBe(true);
    });
  });

  describe('Array Path Handling', () => {
    it('should handle arrays in extraArgs correctly', async () => {
      const config = `
controlPlane:
  distro:
    k3s:
      enabled: true
      extraArgs:
        - --disable-network-policy
        - --flannel-backend=none
        - --cluster-cidr=10.0.0.0/16
`;

      const yamlWithComments = `
controlPlane:
  distro:
    k3s:
      # Extra arguments passed to k3s
      # Required: Must be valid k3s flags
      extraArgs:
        # Each argument should start with --
        # Common args: --disable-network-policy, --flannel-backend
        # Valid values: --disable-network-policy, --flannel-backend=none
`;

      githubClient.getFileContent.mockResolvedValue(yamlWithComments);
      
      const response = await handler({
        method: 'tools/call',
        params: {
          name: 'validate-config',
          arguments: { content: config }
        }
      });
      
      const result = JSON.parse(response.content[0].text);
      
      // Should handle array paths correctly
      expect(result.layers.syntax.valid).toBe(true);
      expect(result.layers.procedural.valid).toBe(true);
      
      // Should include rules for extraArgs (parent path of array items)
      const hasExtraArgsRules = result.layers.semantic.rules.some(rule =>
        rule.path && rule.path.includes('extraArgs')
      );
      expect(hasExtraArgsRules).toBe(true);
    });

    it('should handle complex nested arrays', async () => {
      const config = `
controlPlane:
  volumes:
    - name: config
      configMap:
        name: vcluster-config
    - name: data
      persistentVolumeClaim:
        claimName: vcluster-data
`;

      const yamlWithComments = `
controlPlane:
  # Additional volumes for the control plane
  # Required: Volume definitions
  volumes:
    # Volume definitions follow Kubernetes spec
    # Each volume must have a unique name
    # Valid types: configMap, secret, persistentVolumeClaim
`;

      githubClient.getFileContent.mockResolvedValue(yamlWithComments);
      
      const response = await handler({
        method: 'tools/call',
        params: {
          name: 'validate-config',
          arguments: { content: config }
        }
      });
      
      const result = JSON.parse(response.content[0].text);
      
      // Should handle nested objects in arrays
      expect(result.layers.syntax.valid).toBe(true);
      
      // Should include volume-related rules
      const hasVolumeRules = result.layers.semantic.rules.some(rule =>
        rule.path && rule.path.includes('volumes')
      );
      expect(hasVolumeRules).toBe(true);
    });
  });

  describe('Deep Nested Path Matching', () => {
    it('should match deeply nested configuration paths', async () => {
      const config = `
controlPlane:
  backingStore:
    etcd:
      deploy:
        statefulSet:
          highAvailability:
            replicas: 3
            antiAffinity: true
          persistence:
            size: 10Gi
            storageClass: fast-ssd
`;

      const yamlWithComments = `
controlPlane:
  backingStore:
    etcd:
      deploy:
        statefulSet:
          highAvailability:
            # Minimum 3 replicas for HA
            replicas: 3
          persistence:
            # Size must be specified for etcd storage
`;

      githubClient.getFileContent.mockResolvedValue(yamlWithComments);
      
      const response = await handler({
        method: 'tools/call',
        params: {
          name: 'validate-config',
          arguments: { content: config }
        }
      });
      
      const result = JSON.parse(response.content[0].text);
      
      // Should include rules for deeply nested paths
      const hasDeepRules = result.layers.semantic.rules.some(rule =>
        rule.path && (
          rule.path.includes('highAvailability') ||
          rule.path.includes('persistence')
        )
      );
      expect(hasDeepRules).toBe(true);
    });
  });

  describe('Path Normalization', () => {
    it('should correctly normalize paths with special characters', async () => {
      const config = `
sync:
  toHost:
    configMaps:
      mappings:
        byName:
          "prometheus-config": "monitoring-prometheus"
          "grafana.ini": "monitoring-grafana-config"
`;

      const response = await handler({
        method: 'tools/call',
        params: {
          name: 'validate-config',
          arguments: { content: config, includeSemantic: false }
        }
      });
      
      const result = JSON.parse(response.content[0].text);
      
      // Should handle special characters in keys
      expect(result.layers.syntax.valid).toBe(true);
      expect(result.layers.procedural.valid).toBe(true);
    });
  });

  describe('Minimal Output Mode', () => {
    it('should return compact output when includeSemantic is false', async () => {
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
sync:
  toHost:
    services:
      enabled: true
    namespaces:
      enabled: true
    networkPolicies:
      enabled: false
`;

      const response = await handler({
        method: 'tools/call',
        params: {
          name: 'validate-config',
          arguments: { content: config, includeSemantic: false }
        }
      });
      
      const result = JSON.parse(response.content[0].text);
      const responseText = response.content[0].text;
      
      // Should have minimal semantic layer
      expect(result.layers.semantic.extracted).toBe(0);
      expect(result.layers.semantic.rules).toHaveLength(0);
      expect(result.layers.semantic.summary).toBe("Semantic validation disabled");
      
      // Response should be compact (less than 100 lines)
      const lineCount = responseText.split('\n').length;
      expect(lineCount).toBeLessThan(100);
    });

    it('should include filtered semantic rules by default', async () => {
      const config = `
controlPlane:
  distro:
    k3s:
      enabled: true
`;

      const yamlWithComments = `
controlPlane:
  # Control plane configuration
  # Required: Must specify a distro
  distro:
    # Distribution selection
    # Valid values: k3s, k0s, k8s
    k3s:
      # Enable k3s distro
      # Default: false
      enabled: true
# Many other unrelated comments and rules below...
sync:
  # Sync configuration with 50+ rules
  toHost:
    # Lots of rules here that should NOT be included
    # This section has many rules
    # But they should be filtered out
`;

      githubClient.getFileContent.mockResolvedValue(yamlWithComments);
      
      const response = await handler({
        method: 'tools/call',
        params: {
          name: 'validate-config',
          arguments: { content: config }  // includeSemantic defaults to true
        }
      });
      
      const result = JSON.parse(response.content[0].text);
      
      // Should include some semantic rules
      expect(result.layers.semantic.extracted).toBeGreaterThan(0);
      
      // Should have total available rules
      expect(result.layers.semantic.total_available).toBeGreaterThan(0);
      
      // Extracted should be less than or equal to total (could be all relevant for small config)
      expect(result.layers.semantic.extracted).toBeLessThanOrEqual(result.layers.semantic.total_available);
      
      // Should have meaningful summary
      expect(result.layers.semantic.summary).toContain("relevant to your configuration");
    });
  });
});