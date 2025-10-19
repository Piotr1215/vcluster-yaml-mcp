import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { githubClient } from './github.js';
import { executeToolHandler } from './tool-registry.js';

export function createServer() {
  const server = new Server(
    {
      name: 'vcluster-yaml-mcp-server',
      version: '0.1.0'
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  // Tool definitions
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'list-versions',
          description: 'DISCOVERY: Find all available vCluster versions. Returns GitHub tags (stable releases) and branches (development versions). Use this to discover what versions are available before querying specific versions.',
          inputSchema: {
            type: 'object',
            properties: {},
            required: []
          }
        },
        {
          name: 'smart-query',
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
          }
        },
        {
          name: 'create-vcluster-config',
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
          }
        },
        {
          name: 'validate-config',
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
          }
        },
        {
          name: 'extract-validation-rules',
          description: 'AI ASSISTANT: Extract validation rules, constraints, and best practices directly from values.yaml comments. Returns structured rules for AI to understand complex relationships and semantic validations that procedural code cannot handle. USE THIS when you need to understand the "why" behind configurations or validate semantic correctness beyond syntax.',
          inputSchema: {
            type: 'object',
            properties: {
              file: {
                type: 'string',
                description: 'File path in GitHub repo (default: "chart/values.yaml")',
                default: 'chart/values.yaml'
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
          }
        }
      ]
    };
  });

  // Tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return executeToolHandler(name, args, githubClient);
  });

  return server;
}
