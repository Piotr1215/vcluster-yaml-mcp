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

describe('Edge Case Tests - Data Structure Validation', () => {
  let server;
  let handler;

  beforeEach(() => {
    server = createServer();
    handler = server._requestHandlers.get('tools/call');
    vi.clearAllMocks();
  });

  describe('Wildcard Path Handling', () => {
    it('should return structured data for wildcard patterns in namespace mappings', async () => {
      const config = `
sync:
  toHost:
    namespaces:
      mappings:
        byName:
          "customer-*": "prefix-*"
          "feature-*": "dev-*"
`;

      githubClient.getFileContent.mockResolvedValueOnce('sync:\n  toHost:\n    namespaces:');

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
      expect(result.config_paths.some(p => p.includes('sync'))).toBe(true);
      expect(result.config_paths.some(p => p.includes('namespaces'))).toBe(true);
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

      githubClient.getFileContent.mockResolvedValue('controlPlane:\n  distro:\n    k3s:');

      const response = await handler({
        method: 'tools/call',
        params: {
          name: 'validate-config',
          arguments: { content: config }
        }
      });

      const result = JSON.parse(response.content[0].text);

      expect(result.syntax_valid).toBe(true);
      expect(result.config_paths.some(p => p.includes('controlPlane'))).toBe(true);
      expect(result.config_paths.some(p => p.includes('k3s'))).toBe(true);
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

      githubClient.getFileContent.mockResolvedValue('controlPlane:\n  volumes:');

      const response = await handler({
        method: 'tools/call',
        params: {
          name: 'validate-config',
          arguments: { content: config }
        }
      });

      const result = JSON.parse(response.content[0].text);

      expect(result.syntax_valid).toBe(true);
      expect(result.config_paths.some(p => p.includes('controlPlane'))).toBe(true);
      expect(result.config_paths.some(p => p.includes('volumes'))).toBe(true);
    });
  });

  describe('Deep Nested Path Matching', () => {
    it('should return paths for deeply nested configuration', async () => {
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

      githubClient.getFileContent.mockResolvedValue('controlPlane:\n  backingStore:');

      const response = await handler({
        method: 'tools/call',
        params: {
          name: 'validate-config',
          arguments: { content: config }
        }
      });

      const result = JSON.parse(response.content[0].text);

      expect(result.syntax_valid).toBe(true);
      expect(result.config_paths.some(p => p.includes('highAvailability'))).toBe(true);
      expect(result.config_paths.some(p => p.includes('persistence'))).toBe(true);
    });
  });

  describe('Path Normalization', () => {
    it('should correctly handle paths with special characters', async () => {
      const config = `
sync:
  toHost:
    configMaps:
      mappings:
        byName:
          "prometheus-config": "monitoring-prometheus"
          "grafana.ini": "monitoring-grafana-config"
`;

      githubClient.getFileContent.mockResolvedValue('sync:\n  toHost:');

      const response = await handler({
        method: 'tools/call',
        params: {
          name: 'validate-config',
          arguments: { content: config }
        }
      });

      const result = JSON.parse(response.content[0].text);

      expect(result.syntax_valid).toBe(true);
      expect(result.config_paths.some(p => p.includes('sync'))).toBe(true);
      expect(result.config_paths.some(p => p.includes('configMaps'))).toBe(true);
    });
  });

  describe('Output Structure Tests', () => {
    it('should return consistent data structure regardless of config complexity', async () => {
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

      githubClient.getFileContent.mockResolvedValue('controlPlane:\n  distro:');

      const response = await handler({
        method: 'tools/call',
        params: {
          name: 'validate-config',
          arguments: { content: config }
        }
      });

      const result = JSON.parse(response.content[0].text);

      expect(result).toHaveProperty('syntax_valid');
      expect(result).toHaveProperty('version');
      expect(result).toHaveProperty('config_paths');
      expect(result).toHaveProperty('validation_data');
      expect(result).toHaveProperty('instructions');
    });

    it('should extract comprehensive path list', async () => {
      const config = `
controlPlane:
  distro:
    k3s:
      enabled: true
`;

      githubClient.getFileContent.mockResolvedValue('controlPlane:\n  distro:\n    k3s:\n      enabled: true');

      const response = await handler({
        method: 'tools/call',
        params: {
          name: 'validate-config',
          arguments: { content: config }
        }
      });

      const result = JSON.parse(response.content[0].text);

      expect(result.config_paths).toBeDefined();
      expect(Array.isArray(result.config_paths)).toBe(true);
      expect(result.config_paths.length).toBeGreaterThan(0);

      const distroFields = result.config_paths.filter(p => p.includes('distro'));
      expect(distroFields.length).toBeGreaterThan(0);
    });
  });
});
