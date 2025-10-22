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
 * Get basic server metadata for MCP Server constructor
 * @returns {Object} MCP server metadata
 */
export function getMcpServerInfo() {
  return {
    name: 'vcluster-yaml-mcp-server',
    version: packageJson.version
  };
}
