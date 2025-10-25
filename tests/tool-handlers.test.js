import { describe, it, expect, vi } from 'vitest';
import {
  buildSuccessResponse,
  buildErrorResponse,
  formatValidationResult,
  formatVersionsList,
  formatQueryResults,
  formatNoMatches,
  handleCreateConfig,
  handleListVersions,
  handleSmartQuery,
  handleExtractRules,
  handleValidateConfig,
  extractYamlInfo,
  searchYaml,
  findSimilarPaths,
  sortByRelevance
} from '../src/tool-handlers.js';

describe('Response Builders', () => {
  describe('buildSuccessResponse', () => {
    it('should build success response with text', () => {
      const result = buildSuccessResponse('Test message');

      expect(result).toEqual({
        content: [{ type: 'text', text: 'Test message' }],
        isError: false
      });
    });
  });

  describe('buildErrorResponse', () => {
    it('should build error response with text', () => {
      const result = buildErrorResponse('Error message');

      expect(result).toEqual({
        content: [{ type: 'text', text: 'Error message' }],
        isError: true
      });
    });
  });
});

describe('Formatting Functions', () => {
  describe('formatValidationResult', () => {
    it('should format valid result', () => {
      const result = {
        valid: true,
        section: 'controlPlane',
        elapsed_ms: 42
      };
      const params = {
        yaml_content: 'test: true',
        description: 'Test Config',
        version: 'main'
      };

      const formatted = formatValidationResult(result, params);

      expect(formatted).toContain('✅');
      expect(formatted).toContain('Configuration validated successfully');
      expect(formatted).toContain('Test Config');
      expect(formatted).toContain('Version: main');
      expect(formatted).toContain('Section: controlPlane');
      expect(formatted).toContain('42ms');
    });

    it('should format invalid result with syntax error', () => {
      const result = {
        valid: false,
        syntax_valid: false,
        syntax_error: 'Unexpected token'
      };
      const params = {
        yaml_content: 'bad: yaml:',
        version: 'main'
      };

      const formatted = formatValidationResult(result, params);

      expect(formatted).toContain('❌');
      expect(formatted).toContain('Validation failed');
      expect(formatted).toContain('Syntax Error');
      expect(formatted).toContain('Unexpected token');
    });

    it('should format invalid result with validation errors', () => {
      const result = {
        valid: false,
        errors: [
          { path: 'controlPlane.enabled', message: 'must be boolean' }
        ]
      };
      const params = {
        yaml_content: 'controlPlane:\n  enabled: "yes"',
        version: 'main'
      };

      const formatted = formatValidationResult(result, params);

      expect(formatted).toContain('❌');
      expect(formatted).toContain('Validation Errors');
      expect(formatted).toContain('controlPlane.enabled');
      expect(formatted).toContain('must be boolean');
    });
  });

  describe('formatVersionsList', () => {
    it('should format short list', () => {
      const versions = ['main', 'v0.20.0', 'v0.19.0'];
      const formatted = formatVersionsList(versions);

      expect(formatted).toContain('Available vCluster versions');
      expect(formatted).toContain('- main');
      expect(formatted).toContain('- v0.20.0');
      expect(formatted).toContain('- v0.19.0');
    });

    it('should truncate long list', () => {
      const versions = Array.from({ length: 25 }, (_, i) => `v0.${i}.0`);
      const formatted = formatVersionsList(versions);

      expect(formatted).toContain('... and 5 more');
    });
  });

  describe('formatQueryResults', () => {
    it('should format results with matches', () => {
      const results = [
        { path: 'controlPlane.enabled', key: 'enabled', value: true, isLeaf: true },
        { path: 'sync.enabled', key: 'enabled', value: false, isLeaf: true }
      ];

      const formatted = formatQueryResults(results, {
        query: 'enabled',
        fileName: 'values.yaml',
        version: 'main',
        maxResults: 50
      });

      expect(formatted).toContain('Found 2 matches');
      expect(formatted).toContain('controlPlane.enabled');
      expect(formatted).toContain('sync.enabled');
    });

    it('should show truncation message when results exceed max', () => {
      const results = Array.from({ length: 60 }, (_, i) => ({
        path: `field${i}`,
        key: `field${i}`,
        value: i,
        isLeaf: true
      }));

      const formatted = formatQueryResults(results, {
        query: 'field',
        fileName: 'values.yaml',
        version: 'main',
        maxResults: 50
      });

      expect(formatted).toContain('Found 60 matches');
      expect(formatted).toContain('showing 50 of 60 total matches');
    });
  });

  describe('formatNoMatches', () => {
    it('should format no matches message with suggestions', () => {
      const formatted = formatNoMatches({
        query: 'nonexistent',
        fileName: 'values.yaml',
        version: 'main',
        similarPaths: ['controlPlane.enabled', 'sync.enabled'],
        yamlData: { controlPlane: {}, sync: {} }
      });

      expect(formatted).toContain('No matches found for "nonexistent"');
      expect(formatted).toContain('Similar paths:');
      expect(formatted).toContain('controlPlane.enabled');
      expect(formatted).toContain('sync.enabled');
      expect(formatted).toContain('Top-level sections:');
      expect(formatted).toContain('controlPlane');
      expect(formatted).toContain('sync');
    });
  });
});

describe('YAML Query Helpers', () => {
  describe('extractYamlInfo', () => {
    it('should extract all paths from nested object', () => {
      const yaml = {
        controlPlane: {
          enabled: true,
          replicas: 3
        },
        sync: {
          enabled: false
        }
      };

      const info = extractYamlInfo(yaml);

      expect(info).toContainEqual({
        path: 'controlPlane',
        key: 'controlPlane',
        value: { enabled: true, replicas: 3 },
        isLeaf: false
      });
      expect(info).toContainEqual({
        path: 'controlPlane.enabled',
        key: 'enabled',
        value: true,
        isLeaf: true
      });
      expect(info).toContainEqual({
        path: 'controlPlane.replicas',
        key: 'replicas',
        value: 3,
        isLeaf: true
      });
    });
  });

  describe('searchYaml', () => {
    const allInfo = [
      { path: 'controlPlane.enabled', key: 'enabled', value: true, isLeaf: true },
      { path: 'sync.enabled', key: 'enabled', value: false, isLeaf: true },
      { path: 'controlPlane.replicas', key: 'replicas', value: 3, isLeaf: true }
    ];

    it('should find exact dot notation matches', () => {
      const results = searchYaml(allInfo, 'controlplane.enabled');

      expect(results).toHaveLength(1);
      expect(results[0].path).toBe('controlPlane.enabled');
    });

    it('should find keyword matches', () => {
      const results = searchYaml(allInfo, 'enabled');

      expect(results.length).toBeGreaterThanOrEqual(2);
      expect(results.some(r => r.path === 'controlPlane.enabled')).toBe(true);
      expect(results.some(r => r.path === 'sync.enabled')).toBe(true);
    });

    it('should match multiple keywords with AND logic', () => {
      const results = searchYaml(allInfo, 'controlplane enabled');

      expect(results.some(r => r.path === 'controlPlane.enabled')).toBe(true);
      expect(results.every(r => r.path.includes('controlPlane'))).toBe(true);
    });
  });

  describe('findSimilarPaths', () => {
    const allInfo = [
      { path: 'controlPlane.enabled', key: 'enabled', value: true, isLeaf: true },
      { path: 'sync.enabled', key: 'enabled', value: false, isLeaf: true },
      { path: 'networking.enabled', key: 'enabled', value: true, isLeaf: true }
    ];

    it('should find similar paths', () => {
      const similar = findSimilarPaths(allInfo, 'enable');

      expect(similar.length).toBeGreaterThan(0);
      expect(similar.length).toBeLessThanOrEqual(5);
    });
  });

  describe('sortByRelevance', () => {
    it('should rank exact path matches highest', () => {
      const results = [
        { path: 'controlPlane.enabled', key: 'enabled', value: true, isLeaf: true },
        { path: 'enabled', key: 'enabled', value: false, isLeaf: true },
        { path: 'sync.enabled', key: 'enabled', value: true, isLeaf: true }
      ];

      const sorted = sortByRelevance(results, 'enabled');

      expect(sorted[0].path).toBe('enabled');
    });
  });
});

describe('Tool Handlers', () => {
  describe('handleListVersions', () => {
    it('should return formatted versions list', async () => {
      const mockGithubClient = {
        getTags: vi.fn().mockResolvedValue(['v0.20.0', 'v0.19.0', 'config-v1.0.0'])
      };

      const response = await handleListVersions({}, mockGithubClient);

      expect(response.isError).toBe(false);
      expect(response.content[0].text).toContain('main');
      expect(response.content[0].text).toContain('v0.20.0');
      expect(response.content[0].text).toContain('v0.19.0');
      expect(response.content[0].text).not.toContain('config-v1.0.0');
    });
  });

  describe('handleSmartQuery', () => {
    it('should search yaml content and return results', async () => {
      const mockGithubClient = {
        getYamlContent: vi.fn().mockResolvedValue({
          controlPlane: { enabled: true },
          sync: { enabled: false }
        })
      };

      const response = await handleSmartQuery(
        { query: 'enabled', version: 'main', file: 'values.yaml' },
        mockGithubClient
      );

      expect(response.isError).toBe(false);
      expect(response.content[0].text).toContain('match');
      expect(mockGithubClient.getYamlContent).toHaveBeenCalledWith('values.yaml', 'main');
    });

    it('should return no matches message when nothing found', async () => {
      const mockGithubClient = {
        getYamlContent: vi.fn().mockResolvedValue({
          controlPlane: { enabled: true }
        })
      };

      const response = await handleSmartQuery(
        { query: 'nonexistent', version: 'main' },
        mockGithubClient
      );

      expect(response.isError).toBe(false);
      expect(response.content[0].text).toContain('No matches found');
    });
  });

  describe('handleCreateConfig', () => {
    it('should validate and format valid config', async () => {
      const mockGithubClient = {
        getFileContent: vi.fn().mockResolvedValue(JSON.stringify({
          type: 'object',
          properties: {
            controlPlane: {
              type: 'object',
              properties: {
                enabled: { type: 'boolean' }
              }
            }
          }
        }))
      };

      const response = await handleCreateConfig(
        {
          yaml_content: 'controlPlane:\n  enabled: true',
          description: 'Test config',
          version: 'main'
        },
        mockGithubClient
      );

      expect(response.content[0].text).toContain('✅');
      expect(response.isError).toBe(false);
    });
  });

  describe('handleValidateConfig', () => {
    it('should validate provided content', async () => {
      const mockGithubClient = {
        getFileContent: vi.fn().mockResolvedValue(JSON.stringify({
          type: 'object',
          properties: {}
        }))
      };

      const response = await handleValidateConfig(
        {
          content: 'enabled: true',
          version: 'main'
        },
        mockGithubClient
      );

      expect(response.isError).toBe(false);
      const result = JSON.parse(response.content[0].text);
      expect(result).toHaveProperty('valid');
    });
  });

  describe('handleExtractRules', () => {
    it('should extract validation rules from comments', async () => {
      const yamlWithComments = `# Valid values: k3s, k8s, k0s
distro: k3s`;

      const mockGithubClient = {
        getFileContent: vi.fn().mockResolvedValue(yamlWithComments)
      };

      const response = await handleExtractRules(
        { version: 'main', file: 'values.yaml' },
        mockGithubClient
      );

      expect(response.isError).toBe(false);
      const rules = JSON.parse(response.content[0].text);
      expect(rules).toHaveProperty('rules');
      expect(rules).toHaveProperty('enums');
    });
  });
});

describe('Error Handling', () => {
  describe('handleSmartQuery error cases', () => {
    it('should handle timeout errors gracefully', async () => {
      const mockGithubClient = {
        getYamlContent: vi.fn().mockRejectedValue(new Error('Timeout: fetching chart/values.yaml took longer than 30s'))
      };

      const response = await handleSmartQuery(
        { query: 'test', version: 'main' },
        mockGithubClient
      );

      expect(response.isError).toBe(false);
      expect(response.content[0].text).toContain('⏱️');
      expect(response.content[0].text).toContain('timed out');
      expect(response.content[0].text).toContain('Suggestions');
    });

    it('should handle generic errors gracefully', async () => {
      const mockGithubClient = {
        getYamlContent: vi.fn().mockRejectedValue(new Error('Network failure'))
      };

      const response = await handleSmartQuery(
        { query: 'test', version: 'main' },
        mockGithubClient
      );

      expect(response.isError).toBe(false);
      expect(response.content[0].text).toContain('❌');
      expect(response.content[0].text).toContain('Error searching');
      expect(response.content[0].text).toContain('Network failure');
    });
  });

  describe('handleExtractRules error cases', () => {
    it('should handle fetch errors gracefully', async () => {
      const mockGithubClient = {
        getFileContent: vi.fn().mockRejectedValue(new Error('File not found'))
      };

      const response = await handleExtractRules(
        { version: 'main' },
        mockGithubClient
      );

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Failed to extract validation rules');
      expect(response.content[0].text).toContain('File not found');
    });

    it('should handle timeout errors', async () => {
      const mockGithubClient = {
        getFileContent: vi.fn().mockRejectedValue(new Error('Timeout: fetching chart/values.yaml took longer than 30s'))
      };

      const response = await handleExtractRules(
        { version: 'main' },
        mockGithubClient
      );

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Timeout');
    });
  });
});
