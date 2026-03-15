import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleCreateConfig } from '../src/tool-handlers.ts';

// Mock elicitor that simulates server.server.elicitInput()
function createMockElicitor(response) {
  return vi.fn().mockResolvedValue(response);
}

function createMockGithubClient() {
  return {
    getTags: vi.fn().mockResolvedValue(['v0.24.0', 'v0.23.0', 'v0.22.0']),
    getBranches: vi.fn().mockResolvedValue(['main', 'release-0.24']),
    getFileContent: vi.fn().mockResolvedValue(JSON.stringify({
      type: 'object',
      properties: {
        controlPlane: { type: 'object', properties: {} },
        sync: { type: 'object', properties: {} }
      }
    })),
    getYamlContent: vi.fn().mockResolvedValue({}),
    getVClusterConfigs: vi.fn().mockResolvedValue({}),
    clearCache: vi.fn()
  };
}

describe('Elicitation in create-vcluster-config', () => {
  let mockGithub;

  beforeEach(() => {
    mockGithub = createMockGithubClient();
  });

  it('should not elicit when version is provided', async () => {
    const elicitor = createMockElicitor({ action: 'accept', content: {} });

    const result = await handleCreateConfig(
      { yaml_content: 'controlPlane: {}', version: 'v0.24.0' },
      mockGithub,
      elicitor
    );

    expect(elicitor).not.toHaveBeenCalled();
    expect(result.content[0].text).toBeDefined();
  });

  it('should elicit version when not provided and elicitor available', async () => {
    const elicitor = createMockElicitor({
      action: 'accept',
      content: { version: 'v0.24.0' }
    });

    const result = await handleCreateConfig(
      { yaml_content: 'controlPlane: {}' },
      mockGithub,
      elicitor
    );

    expect(elicitor).toHaveBeenCalledOnce();
    expect(elicitor).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('version'),
        requestedSchema: expect.objectContaining({
          type: 'object',
          properties: expect.objectContaining({
            version: expect.any(Object)
          })
        })
      })
    );
    // Should use elicited version for validation
    expect(mockGithub.getFileContent).toHaveBeenCalledWith(
      'chart/values.schema.json',
      'v0.24.0'
    );
  });

  it('should fall back to main when user declines elicitation', async () => {
    const elicitor = createMockElicitor({ action: 'decline' });

    const result = await handleCreateConfig(
      { yaml_content: 'controlPlane: {}' },
      mockGithub,
      elicitor
    );

    expect(mockGithub.getFileContent).toHaveBeenCalledWith(
      'chart/values.schema.json',
      'main'
    );
  });

  it('should fall back to main when user cancels elicitation', async () => {
    const elicitor = createMockElicitor({ action: 'cancel' });

    const result = await handleCreateConfig(
      { yaml_content: 'controlPlane: {}' },
      mockGithub,
      elicitor
    );

    expect(mockGithub.getFileContent).toHaveBeenCalledWith(
      'chart/values.schema.json',
      'main'
    );
  });

  it('should work without elicitor (backwards compatible)', async () => {
    const result = await handleCreateConfig(
      { yaml_content: 'controlPlane: {}' },
      mockGithub
    );

    expect(mockGithub.getFileContent).toHaveBeenCalledWith(
      'chart/values.schema.json',
      'main'
    );
    expect(result.content[0].text).toBeDefined();
  });

  it('should fetch available versions for elicitation schema', async () => {
    const elicitor = createMockElicitor({
      action: 'accept',
      content: { version: 'v0.23.0' }
    });

    await handleCreateConfig(
      { yaml_content: 'controlPlane: {}' },
      mockGithub,
      elicitor
    );

    expect(mockGithub.getTags).toHaveBeenCalledOnce();
  });
});
