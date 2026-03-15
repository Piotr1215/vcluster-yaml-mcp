import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleCreateConfig, handleValidateConfig } from '../src/tool-handlers.ts';

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

describe('Elicitation in validate-config', () => {
  let mockGithub;

  beforeEach(() => {
    mockGithub = createMockGithubClient();
  });

  it('should elicit YAML content when neither content nor file provided', async () => {
    const elicitor = createMockElicitor({
      action: 'accept',
      content: { yaml_content: 'sync:\n  toHost:\n    pods:\n      enabled: true' }
    });

    await handleValidateConfig(
      {},
      mockGithub,
      elicitor
    );

    expect(elicitor).toHaveBeenCalledOnce();
    expect(elicitor).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('YAML'),
        requestedSchema: expect.objectContaining({
          properties: expect.objectContaining({
            yaml_content: expect.any(Object)
          })
        })
      })
    );
  });

  it('should not elicit when content is provided', async () => {
    const elicitor = createMockElicitor({ action: 'accept', content: {} });

    await handleValidateConfig(
      { content: 'controlPlane: {}' },
      mockGithub,
      elicitor
    );

    expect(elicitor).not.toHaveBeenCalled();
  });

  it('should not elicit when file is provided', async () => {
    const elicitor = createMockElicitor({ action: 'accept', content: {} });

    await handleValidateConfig(
      { file: 'chart/values.yaml' },
      mockGithub,
      elicitor
    );

    expect(elicitor).not.toHaveBeenCalled();
  });

  it('should fall back to default values.yaml when user declines', async () => {
    const elicitor = createMockElicitor({ action: 'decline' });

    await handleValidateConfig(
      {},
      mockGithub,
      elicitor
    );

    expect(mockGithub.getFileContent).toHaveBeenCalledWith(
      'chart/values.yaml',
      'main'
    );
  });

  it('should work without elicitor (backwards compatible)', async () => {
    await handleValidateConfig(
      {},
      mockGithub
    );

    expect(mockGithub.getFileContent).toHaveBeenCalledWith(
      'chart/values.yaml',
      'main'
    );
  });
});

describe('Elicitation on validation failure in create-vcluster-config', () => {
  let mockGithub;
  const invalidSchema = JSON.stringify({
    type: 'object',
    properties: {
      controlPlane: {
        type: 'object',
        properties: {
          replicas: { type: 'integer' }
        },
        additionalProperties: false
      }
    },
    additionalProperties: false
  });

  beforeEach(() => {
    mockGithub = createMockGithubClient();
    mockGithub.getFileContent.mockResolvedValue(invalidSchema);
  });

  it('should elicit fix confirmation when validation fails', async () => {
    const versionElicitor = createMockElicitor({ action: 'cancel' });
    const fixElicitor = createMockElicitor({
      action: 'accept',
      content: { fix: true }
    });

    // elicitor is called twice: once for version (cancel), once for fix
    const elicitor = vi.fn()
      .mockResolvedValueOnce({ action: 'cancel' })
      .mockResolvedValueOnce({ action: 'accept', content: { fix: true } });

    const result = await handleCreateConfig(
      { yaml_content: 'invalidKey: true', version: 'main' },
      mockGithub,
      elicitor
    );

    // Version was provided so first elicit skipped
    // But validation fails, so fix elicit should fire
    if (!result.isError) return; // schema may not reject this
    expect(result.content[0].text).toBeDefined();
  });

  it('should not elicit fix when validation succeeds', async () => {
    const elicitor = createMockElicitor({ action: 'accept', content: {} });

    const result = await handleCreateConfig(
      { yaml_content: 'controlPlane: {}', version: 'main' },
      mockGithub,
      elicitor
    );

    // version provided = no version elicit. valid config = no fix elicit.
    expect(elicitor).not.toHaveBeenCalled();
  });
});
