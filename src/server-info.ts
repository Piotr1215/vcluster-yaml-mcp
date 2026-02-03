import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import type {
  ServerInfo,
  HealthInfo,
  ReadinessCheck,
  ChangelogInfo,
  ToolInfo
} from './types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface PackageJson {
  name: string;
  version: string;
  description: string;
}

const packageJson: PackageJson = JSON.parse(
  readFileSync(join(__dirname, '../package.json'), 'utf-8')
);

// Available tools (static list for changelog)
const availableTools: ToolInfo[] = [
  { name: 'list-versions', description: 'Discover available vCluster versions (tags and branches)' },
  { name: 'smart-query', description: 'Natural language search for vCluster configuration' },
  { name: 'create-vcluster-config', description: 'Generate and validate vCluster YAML configs' },
  { name: 'validate-config', description: 'Validate existing vCluster YAML against schema' },
  { name: 'extract-validation-rules', description: 'Extract semantic validation rules from values.yaml' }
];

// Build metadata from environment (injected by Docker/CI)
const buildInfo = {
  version: packageJson.version,
  gitSha: process.env['GIT_SHA'] ?? 'unknown',
  buildDate: process.env['BUILD_DATE'] ?? 'unknown',
  imageVersion: process.env['IMAGE_VERSION'] ?? packageJson.version
};

/**
 * Get complete server information including version, build info, and runtime details
 */
export function getServerInfo(): ServerInfo {
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
 */
export function getHealthInfo(): HealthInfo {
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

interface McpServerLike {
  _registeredTools?: Record<string, unknown>;
}

/**
 * Check if MCP server can be created and has tools registered
 */
export async function checkReadiness(createServerFn: () => unknown): Promise<ReadinessCheck> {
  const start = Date.now();
  try {
    const server = createServerFn() as McpServerLike;
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
      reason: error instanceof Error ? error.message : String(error),
      latencyMs: Date.now() - start
    };
  }
}

interface McpServerInfo {
  name: string;
  version: string;
}

/**
 * Get basic server metadata for MCP Server constructor
 */
export function getMcpServerInfo(): McpServerInfo {
  return {
    name: 'vcluster-yaml-mcp-server',
    version: packageJson.version
  };
}

interface McpServerOptions {
  capabilities: {
    tools: Record<string, unknown>;
    resources: Record<string, unknown>;
  };
  instructions: string;
}

/**
 * Get server options including instructions for MCP clients
 */
export function getMcpServerOptions(): McpServerOptions {
  return {
    capabilities: {
      tools: {},
      resources: {}
    },
    instructions: "vCluster configuration assistant. Call get-changelog on first use - if changes are within current week AND relevant to user's task, briefly mention. Use smart-query for configuration questions. Use create-vcluster-config when generating configs (auto-validates). Use list-versions to discover versions. Use validate-config for user YAML. Use extract-validation-rules for semantic constraints."
  };
}

const CHANGELOG_URL = 'https://raw.githubusercontent.com/Piotr1215/vcluster-yaml-mcp/main/CHANGELOG.md';

/**
 * Fetch changelog from GitHub
 */
export async function getChangelog(): Promise<ChangelogInfo> {
  try {
    const response = await fetch(CHANGELOG_URL);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const content = await response.text();
    return {
      version: packageJson.version,
      content
    };
  } catch (error) {
    return {
      version: packageJson.version,
      content: `Changelog unavailable: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}
