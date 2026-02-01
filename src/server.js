import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { githubClient } from './github.js';
import {
  handleCreateConfig,
  handleListVersions,
  handleSmartQuery,
  handleExtractRules,
  handleValidateConfig
} from './tool-handlers.js';
import { getMcpServerInfo, getMcpServerOptions, getServerInfo } from './server-info.js';

export function createServer() {
  const serverInfo = getMcpServerInfo();
  const serverOptions = getMcpServerOptions();

  const server = new McpServer(serverInfo, serverOptions);

  // Register: list-versions
  server.registerTool(
    'list-versions',
    {
      description: 'DISCOVERY: Find all available vCluster versions. Returns GitHub tags (stable releases) and branches (development versions). Use this to discover what versions are available before querying specific versions.',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      },
      annotations: {
        readOnlyHint: true
      }
    },
    async () => {
      const result = await handleListVersions({}, githubClient);
      return result;
    }
  );

  // Register: smart-query
  server.registerTool(
    'smart-query',
    {
      description: 'UNIVERSAL SEARCH: Your go-to tool for finding ANY vCluster configuration! Understands natural language, searches intelligently, and finds related settings. USE THIS FIRST for any config questions! Examples: "show me namespace settings", "how is etcd configured?", "what networking options exist?", "find service CIDR". Searches chart/values.yaml by default.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Natural language query (e.g., "namespace syncing", "high availability", "storage options")'
          },
          file: {
            type: 'string',
            description: 'Optional: specific file to search (default: "chart/values.yaml")'
          },
          version: {
            type: 'string',
            description: 'Version tag or branch (e.g., "v0.24.0", "main"). Defaults to "main".'
          }
        },
        required: ['query']
      },
      annotations: {
        readOnlyHint: true
      }
    },
    async ({ query, file, version }) => {
      const result = await handleSmartQuery({ query, file, version }, githubClient);
      return result;
    }
  );

  // Register: create-vcluster-config
  server.registerTool(
    'create-vcluster-config',
    {
      description: 'CONFIG CREATION WORKFLOW: Use this when generating vCluster configurations for users. This tool REQUIRES you to provide the YAML you created and automatically validates it before returning to the user. Returns validation result + formatted config. This ensures every config you create is validated.',
      inputSchema: {
        type: 'object',
        properties: {
          yaml_content: {
            type: 'string',
            description: 'The vCluster YAML configuration you generated (required)'
          },
          description: {
            type: 'string',
            description: 'Brief description of what this config does (optional, helpful for user)'
          },
          version: {
            type: 'string',
            description: 'Version tag or branch (e.g., "v0.24.0", "main"). Defaults to "main".'
          }
        },
        required: ['yaml_content']
      },
      annotations: {
        readOnlyHint: false
      }
    },
    async ({ yaml_content, description, version }) => {
      const result = await handleCreateConfig({ yaml_content, description, version }, githubClient);
      return result;
    }
  );

  // Register: validate-config
  server.registerTool(
    'validate-config',
    {
      description: 'VALIDATION ONLY: Validates existing vCluster YAML (full config or partial snippet) against the schema. Use create-vcluster-config for configs you generate. Use this to validate user-provided configs or files from GitHub.',
      inputSchema: {
        type: 'object',
        properties: {
          file: {
            type: 'string',
            description: 'File path in GitHub repo to validate. Optional if content is provided.'
          },
          content: {
            type: 'string',
            description: 'YAML content to validate (full config or partial snippet)'
          },
          version: {
            type: 'string',
            description: 'Version tag or branch (e.g., "v0.24.0", "main"). Defaults to "main".'
          }
        },
        required: []
      },
      annotations: {
        readOnlyHint: true
      }
    },
    async ({ file, content, version }) => {
      const result = await handleValidateConfig({ file, content, version }, githubClient);
      return result;
    }
  );

  // Register: extract-validation-rules
  server.registerTool(
    'extract-validation-rules',
    {
      description: 'AI ASSISTANT: Extract validation rules, constraints, and best practices directly from values.yaml comments. Returns structured rules for AI to understand complex relationships and semantic validations that procedural code cannot handle. USE THIS when you need to understand the "why" behind configurations or validate semantic correctness beyond syntax.',
      inputSchema: {
        type: 'object',
        properties: {
          file: {
            type: 'string',
            description: 'File path in GitHub repo (default: "chart/values.yaml")'
          },
          section: {
            type: 'string',
            description: 'Focus on specific section (e.g., "controlPlane", "sync", "networking")'
          },
          version: {
            type: 'string',
            description: 'Version tag or branch (e.g., "v0.24.0", "main"). Defaults to "main".'
          }
        },
        required: []
      },
      annotations: {
        readOnlyHint: true
      }
    },
    async ({ file, section, version }) => {
      const result = await handleExtractRules({ file, section, version }, githubClient);
      return result;
    }
  );

  // Register resource: server://info
  server.registerResource(
    'server-info',
    'server://info',
    {
      description: 'Version, build info, and metadata about this MCP server',
      mimeType: 'application/json'
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(getServerInfo(), null, 2)
        }
      ]
    })
  );

  return server;
}
