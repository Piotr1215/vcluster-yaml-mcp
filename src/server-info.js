import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(
  readFileSync(join(__dirname, '../package.json'), 'utf-8')
);

// Available tools (static list for changelog)
const availableTools = [
  { name: 'list-versions', description: 'Discover available vCluster versions (tags and branches)' },
  { name: 'smart-query', description: 'Natural language search for vCluster configuration' },
  { name: 'create-vcluster-config', description: 'Generate and validate vCluster YAML configs' },
  { name: 'validate-config', description: 'Validate existing vCluster YAML against schema' },
  { name: 'extract-validation-rules', description: 'Extract semantic validation rules from values.yaml' }
];

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
    },
    availableTools
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
    instructions: "vCluster configuration assistant. Read server://changelog on first use. If changes are dated within the current week AND relevant to your current task, briefly mention and offer details. Otherwise adapt silently. Use smart-query for any configuration questions (natural language search). Use create-vcluster-config when generating configs - it auto-validates. Use list-versions first to discover available versions. Use validate-config for user-provided YAML. Use extract-validation-rules to understand semantic constraints."
  };
}

/**
 * Get changelog from CHANGELOG.md file
 * @returns {Object} Changelog with version and content
 */
export function getChangelog() {
  try {
    const content = readFileSync(join(__dirname, '../CHANGELOG.md'), 'utf-8');
    return {
      version: packageJson.version,
      content
    };
  } catch {
    return {
      version: packageJson.version,
      content: 'Changelog unavailable'
    };
  }
}
