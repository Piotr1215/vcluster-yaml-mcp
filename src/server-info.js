import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load package.json once at module level
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(
  await readFile(join(__dirname, '../package.json'), 'utf-8')
);

// Build metadata from environment (injected by Docker/CI)
const buildInfo = {
  version: packageJson.version,
  gitSha: process.env.GIT_SHA || 'unknown',
  buildDate: process.env.BUILD_DATE || 'unknown',
  imageVersion: process.env.IMAGE_VERSION || packageJson.version
};

/**
 * Get complete server information including version, build info, and runtime details
 * @returns {Object} Server metadata object
 */
export function getServerInfo() {
  return {
    name: 'vcluster-yaml-mcp-server',
    description: packageJson.description,
    version: buildInfo.version,
    repository: 'https://github.com/Piotr1215/vcluster-yaml-mcp-server',
    documentation: 'https://github.com/Piotr1215/vcluster-yaml-mcp-server#readme',
    license: 'MIT',
    build: {
      gitSha: buildInfo.gitSha,
      buildDate: buildInfo.buildDate,
      imageVersion: buildInfo.imageVersion
    },
    runtime: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch
    }
  };
}

/**
 * Get simplified version info for health checks
 * @returns {Object} Health check metadata
 */
export function getHealthInfo() {
  return {
    status: 'ok',
    name: 'vcluster-yaml-mcp-server',
    version: packageJson.version,
    image: {
      version: buildInfo.imageVersion,
      gitSha: buildInfo.gitSha,
      buildDate: buildInfo.buildDate
    },
    timestamp: new Date().toISOString()
  };
}

/**
 * Check if MCP server can be created and has tools registered
 * @param {Function} createServerFn - Function that creates MCP server
 * @returns {Promise<Object>} Readiness check result
 */
export async function checkReadiness(createServerFn) {
  const start = Date.now();
  try {
    const server = createServerFn();
    // _registeredTools is a plain object (not Map) in MCP SDK
    const tools = server._registeredTools;
    const toolCount = tools ? Object.keys(tools).length : 0;
    if (toolCount === 0) {
      return {
        ready: false,
        reason: 'no tools registered',
        latencyMs: Date.now() - start
      };
    }
    return {
      ready: true,
      toolCount,
      latencyMs: Date.now() - start
    };
  } catch (error) {
    return {
      ready: false,
      reason: error.message,
      latencyMs: Date.now() - start
    };
  }
}

/**
 * Get basic server metadata for MCP Server constructor
 * @returns {Object} MCP server metadata
 */
export function getMcpServerInfo() {
  return {
    name: 'vcluster-yaml-mcp-server',
    version: packageJson.version
  };
}

/**
 * Get server options including instructions for MCP clients
 * @returns {Object} MCP server options
 */
export function getMcpServerOptions() {
  return {
    capabilities: {
      tools: {},
      resources: {}
    },
    instructions: "vCluster configuration assistant. Use smart-query for any configuration questions (natural language search). Use create-vcluster-config when generating configs - it auto-validates. Use list-versions first to discover available versions. Use validate-config for user-provided YAML. Use extract-validation-rules to understand semantic constraints."
  };
}
