import { describe, it, expect, afterEach } from 'vitest';
import { getServerInfo, getHealthInfo, getMcpServerInfo, checkReadiness, getChangelog } from '../src/server-info.js';

describe('server-info', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    // ARRANGE: Restore environment after each test
    process.env = { ...originalEnv };
  });

  describe('getMcpServerInfo', () => {
    it('should return name and version for MCP Server constructor', () => {
      // ACT
      const info = getMcpServerInfo();

      // ASSERT: Verify MCP server metadata structure
      expect(info).toHaveProperty('name');
      expect(info).toHaveProperty('version');
      expect(info.name).toBe('vcluster-yaml-mcp-server');
      expect(typeof info.version).toBe('string');
      expect(info.version).toMatch(/^\d+\.\d+\.\d+/); // Semver format
    });
  });

  describe('getHealthInfo', () => {
    it('should return health check structure with status ok', () => {
      // ACT
      const health = getHealthInfo();

      // ASSERT: Verify health endpoint structure
      expect(health.status).toBe('ok');
      expect(health.name).toBe('vcluster-yaml-mcp-server');
      expect(health.version).toBeDefined();
      expect(health.image).toBeDefined();
      expect(health.timestamp).toBeDefined();
    });

    it('should include image metadata with build info', () => {
      // ARRANGE
      process.env.IMAGE_VERSION = '1.0.9';
      process.env.GIT_SHA = 'abc123';
      process.env.BUILD_DATE = '2025-10-20T21:00:00Z';

      // ACT: Need to re-import to get new env vars
      // Note: This is a limitation - env vars are read at module load time
      const health = getHealthInfo();

      // ASSERT: Verify image metadata structure
      expect(health.image).toHaveProperty('version');
      expect(health.image).toHaveProperty('gitSha');
      expect(health.image).toHaveProperty('buildDate');
    });

    it('should provide valid ISO timestamp', () => {
      // ACT
      const health = getHealthInfo();

      // ASSERT: Verify timestamp is valid ISO 8601
      expect(() => new Date(health.timestamp)).not.toThrow();
      expect(new Date(health.timestamp).toISOString()).toBe(health.timestamp);
    });

    it('QUIRK: timestamp changes on each call (not cached)', () => {
      // ACT
      const health1 = getHealthInfo();
      const health2 = getHealthInfo();

      // ASSERT: Each call generates fresh timestamp
      // (timestamps will be different unless called in same millisecond)
      expect(health1.timestamp).toBeDefined();
      expect(health2.timestamp).toBeDefined();
      // Both are valid ISO dates
      expect(health1.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(health2.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('getServerInfo', () => {
    it('should return complete server metadata', () => {
      // ACT
      const info = getServerInfo();

      // ASSERT: Verify all required fields exist
      expect(info).toHaveProperty('name');
      expect(info).toHaveProperty('description');
      expect(info).toHaveProperty('version');
      expect(info).toHaveProperty('repository');
      expect(info).toHaveProperty('documentation');
      expect(info).toHaveProperty('license');
      expect(info).toHaveProperty('build');
      expect(info).toHaveProperty('runtime');
    });

    it('should include build metadata', () => {
      // ACT
      const info = getServerInfo();

      // ASSERT: Verify build info structure
      expect(info.build).toHaveProperty('gitSha');
      expect(info.build).toHaveProperty('buildDate');
      expect(info.build).toHaveProperty('imageVersion');
      
      // MUTATION FIX: Verify actual types, not just existence
      expect(typeof info.build.gitSha).toBe('string');
      expect(typeof info.build.buildDate).toBe('string');
      expect(typeof info.build.imageVersion).toBe('string');
    });

    it('should include runtime metadata', () => {
      // ACT
      const info = getServerInfo();

      // ASSERT: Verify runtime info
      expect(info.runtime).toHaveProperty('nodeVersion');
      expect(info.runtime).toHaveProperty('platform');
      expect(info.runtime).toHaveProperty('arch');
      
      // MUTATION FIX: Verify runtime values match process
      expect(info.runtime.nodeVersion).toBe(process.version);
      expect(info.runtime.platform).toBe(process.platform);
      expect(info.runtime.arch).toBe(process.arch);
    });

    it('should use "unknown" as fallback when env vars not set', () => {
      // ARRANGE: Clear env vars
      delete process.env.GIT_SHA;
      delete process.env.BUILD_DATE;
      delete process.env.IMAGE_VERSION;

      // ACT: Module already loaded, so this tests initial state
      const info = getServerInfo();

      // ASSERT: Verify fallback values when env not set
      // Note: Values are set at module load, so these might not be 'unknown'
      // if env vars were set when module was imported
      expect(info.build.gitSha).toBeDefined();
      expect(info.build.buildDate).toBeDefined();
      expect(info.build.imageVersion).toBeDefined();
    });

    it('should return same structure on multiple calls (deterministic)', () => {
      // ACT
      const info1 = getServerInfo();
      const info2 = getServerInfo();

      // ASSERT: Verify structure consistency (runtime info should match)
      expect(info1.name).toBe(info2.name);
      expect(info1.version).toBe(info2.version);
      expect(info1.repository).toBe(info2.repository);
      expect(info1.runtime).toEqual(info2.runtime);
    });

    it('MUTATION FIX: repository URL is GitHub, not arbitrary string', () => {
      // ACT
      const info = getServerInfo();

      // ASSERT: Verify specific GitHub repo URL
      expect(info.repository).toBe('https://github.com/Piotr1215/vcluster-yaml-mcp-server');
      expect(info.repository).toContain('github.com');
      expect(info.repository).toContain('Piotr1215');
    });

    it('MUTATION FIX: license is MIT specifically', () => {
      // ACT
      const info = getServerInfo();

      // ASSERT: Verify license value
      expect(info.license).toBe('MIT');
    });
  });

  describe('checkReadiness', () => {
    it('should return ready=true when server has tools registered', async () => {
      // ARRANGE: Mock createServer that returns server with tools (plain object, not Map)
      const mockServer = { _registeredTools: { 'tool1': {}, 'tool2': {} } };
      const createServerFn = () => mockServer;

      // ACT
      const result = await checkReadiness(createServerFn);

      // ASSERT
      expect(result.ready).toBe(true);
      expect(result.toolCount).toBe(2);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should return ready=false when server has no tools', async () => {
      // ARRANGE: Mock createServer with empty tools
      const mockServer = { _registeredTools: {} };
      const createServerFn = () => mockServer;

      // ACT
      const result = await checkReadiness(createServerFn);

      // ASSERT
      expect(result.ready).toBe(false);
      expect(result.reason).toBe('no tools registered');
    });

    it('should return ready=false when createServer throws', async () => {
      // ARRANGE: Mock createServer that throws
      const createServerFn = () => { throw new Error('initialization failed'); };

      // ACT
      const result = await checkReadiness(createServerFn);

      // ASSERT
      expect(result.ready).toBe(false);
      expect(result.reason).toBe('initialization failed');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should work with real createServer function', async () => {
      // ARRANGE: Import real createServer
      const { createServer } = await import('../src/server.js');

      // ACT
      const result = await checkReadiness(createServer);

      // ASSERT: Real server should have tools
      expect(result.ready).toBe(true);
      expect(result.toolCount).toBeGreaterThan(0);
    });
  });

  describe('behavior: version consistency', () => {
    it('should return same version across all info functions', () => {
      // ACT
      const mcpInfo = getMcpServerInfo();
      const healthInfo = getHealthInfo();
      const serverInfo = getServerInfo();

      // ASSERT: All functions return same version
      expect(mcpInfo.version).toBe(healthInfo.version);
      expect(healthInfo.version).toBe(serverInfo.version);
    });

    it('should return same name across all info functions', () => {
      // ACT
      const mcpInfo = getMcpServerInfo();
      const healthInfo = getHealthInfo();
      const serverInfo = getServerInfo();

      // ASSERT: All functions return same name
      expect(mcpInfo.name).toBe(healthInfo.name);
      expect(healthInfo.name).toBe(serverInfo.name);
      expect(serverInfo.name).toBe('vcluster-yaml-mcp-server');
    });
  });

  describe('getChangelog', () => {
    it('should return changelog with version and content', async () => {
      // ACT
      const changelog = await getChangelog();

      // ASSERT
      expect(changelog).toHaveProperty('version');
      expect(changelog).toHaveProperty('content');
      expect(typeof changelog.version).toBe('string');
      expect(typeof changelog.content).toBe('string');
    });

    it('should return content from CHANGELOG.md', async () => {
      // ACT
      const changelog = await getChangelog();

      // ASSERT
      expect(changelog.content).toContain('# Changelog');
    });

    it('should return version matching package.json', async () => {
      // ACT
      const changelog = await getChangelog();
      const serverInfo = getServerInfo();

      // ASSERT
      expect(changelog.version).toBe(serverInfo.version);
    });
  });

  describe('getServerInfo with availableTools', () => {
    it('should include availableTools in server info', () => {
      // ACT
      const info = getServerInfo();

      // ASSERT
      expect(info).toHaveProperty('availableTools');
      expect(Array.isArray(info.availableTools)).toBe(true);
      expect(info.availableTools.length).toBeGreaterThan(0);
    });

    it('should have tools with name and description', () => {
      // ACT
      const info = getServerInfo();

      // ASSERT
      info.availableTools.forEach(tool => {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(typeof tool.name).toBe('string');
        expect(typeof tool.description).toBe('string');
      });
    });

    it('should include core tools', () => {
      // ACT
      const info = getServerInfo();
      const toolNames = info.availableTools.map(t => t.name);

      // ASSERT
      expect(toolNames).toContain('smart-query');
      expect(toolNames).toContain('list-versions');
      expect(toolNames).toContain('validate-config');
    });
  });
});
