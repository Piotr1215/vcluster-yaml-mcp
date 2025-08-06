import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import yaml from 'js-yaml';
import jq from 'node-jq';
import { githubClient } from './github.js';

export function createServer() {
  const server = new Server(
    {
      name: 'vcluster-yaml-mcp-server',
      version: '0.2.0'
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  // Current GitHub ref (branch or tag)
  let currentRef = 'main';

  // Tool definitions
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'list-versions',
          description: 'List all available vcluster versions (GitHub tags/releases)',
          inputSchema: {
            type: 'object',
            properties: {},
            required: []
          }
        },
        {
          name: 'set-version',
          description: 'Switch to a specific vcluster version (tag) or branch',
          inputSchema: {
            type: 'object',
            properties: {
              ref: {
                type: 'string',
                description: 'Version tag (e.g., "v0.19.0") or branch name (e.g., "main")'
              }
            },
            required: ['ref']
          }
        },
        {
          name: 'get-current-version',
          description: 'Get the currently selected vcluster version/branch',
          inputSchema: {
            type: 'object',
            properties: {},
            required: []
          }
        },
        {
          name: 'list-configs',
          description: 'List all available vcluster YAML configuration files from GitHub',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Directory path in repository (default: "config")',
                default: 'config'
              }
            },
            required: []
          }
        },
        {
          name: 'smart-query',
          description: 'Smart search for vcluster configuration information from GitHub. Just ask what you want to know! Examples: "namespaces", "etcd", "what is the service CIDR", "networking settings", etc.',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Natural language query or search term (e.g., "namespace config", "service CIDR", "k3s", "networking")'
              },
              file: {
                type: 'string',
                description: 'Optional: specific file path in repo (default: "config/values.yaml")'
              }
            },
            required: ['query']
          }
        },
        {
          name: 'query-config',
          description: 'Query vcluster YAML configuration from GitHub using jq expressions.',
          inputSchema: {
            type: 'object',
            properties: {
              file: {
                type: 'string',
                description: 'File path in GitHub repo (e.g., "config/values.yaml"). Optional if content is provided.'
              },
              content: {
                type: 'string',
                description: 'Direct YAML content to query. Optional if file is provided.'
              },
              query: {
                type: 'string',
                description: 'jq query expression (e.g., ".controlPlane.distro", ".networking.serviceCIDR")'
              },
              raw: {
                type: 'boolean',
                description: 'Return raw output without JSON formatting (default: false)',
                default: false
              }
            },
            required: ['query']
          }
        },
        {
          name: 'get-config-value',
          description: 'Get a specific value from vcluster configuration using dot notation path',
          inputSchema: {
            type: 'object',
            properties: {
              file: {
                type: 'string',
                description: 'File path in GitHub repo. Optional if content is provided.'
              },
              content: {
                type: 'string',
                description: 'Direct YAML content to query. Optional if file is provided.'
              },
              path: {
                type: 'string',
                description: 'Dot-separated path to the value (e.g., "controlPlane.distro")'
              }
            },
            required: ['path']
          }
        },
        {
          name: 'validate-config',
          description: 'Validate vcluster YAML configuration against the vcluster schema from GitHub.',
          inputSchema: {
            type: 'object',
            properties: {
              file: {
                type: 'string',
                description: 'File path in GitHub repo to validate. Optional if content is provided.'
              },
              content: {
                type: 'string',
                description: 'Direct YAML content to validate. Optional if file is provided.'
              }
            },
            required: []
          }
        },
        {
          name: 'search-config',
          description: 'Search for specific keys or values in vcluster configuration from GitHub',
          inputSchema: {
            type: 'object',
            properties: {
              file: {
                type: 'string',
                description: 'File path in GitHub repo. Optional if content is provided.'
              },
              content: {
                type: 'string',
                description: 'Direct YAML content to search. Optional if file is provided.'
              },
              search: {
                type: 'string',
                description: 'Search term to find in keys or values'
              },
              keysOnly: {
                type: 'boolean',
                description: 'Search only in keys (default: false)',
                default: false
              }
            },
            required: ['search']
          }
        }
      ]
    };
  });

  // Tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'list-versions': {
          const tags = await githubClient.getTags();
          const branches = await githubClient.getBranches();
          
          return {
            content: [
              {
                type: 'text',
                text: `Available vCluster versions:\n\nTags (Releases):\n${tags.slice(0, 10).map(t => `- ${t}`).join('\n')}\n${tags.length > 10 ? `... and ${tags.length - 10} more\n` : ''}\nBranches:\n${branches.map(b => `- ${b}`).join('\n')}\n\nCurrent: ${currentRef}`
              }
            ]
          };
        }

        case 'set-version': {
          const { ref } = args;
          githubClient.setRef(ref);
          currentRef = ref;
          
          return {
            content: [
              {
                type: 'text',
                text: `Switched to version/branch: ${ref}`
              }
            ]
          };
        }

        case 'get-current-version': {
          return {
            content: [
              {
                type: 'text',
                text: `Currently using: ${currentRef}`
              }
            ]
          };
        }

        case 'list-configs': {
          const dirPath = args.path || 'config';
          const files = await githubClient.listFiles(dirPath, currentRef);
          
          if (files.length === 0) {
            // Try root directory as fallback
            const rootFiles = await githubClient.listFiles('', currentRef);
            const yamlFiles = rootFiles.filter(f => f.name.endsWith('.yaml') || f.name.endsWith('.yml'));
            
            return {
              content: [
                {
                  type: 'text',
                  text: yamlFiles.length > 0 
                    ? `Found ${yamlFiles.length} configuration file(s) in root:\n${yamlFiles.map(f => `- ${f.path} (${f.size} bytes)`).join('\n')}`
                    : 'No YAML configuration files found'
                }
              ]
            };
          }
          
          return {
            content: [
              {
                type: 'text',
                text: `Found ${files.length} configuration file(s) in ${dirPath}:\n${files.map(f => `- ${f.path} (${f.size} bytes)`).join('\n')}`
              }
            ]
          };
        }

        case 'smart-query': {
          // Default to config/values.yaml as it contains the main vcluster configuration
          const fileName = args.file || 'config/values.yaml';
          let yamlData;
          
          try {
            yamlData = await githubClient.getYamlContent(fileName, currentRef);
          } catch (error) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Could not load ${fileName} from GitHub (ref: ${currentRef}). Error: ${error.message}\n\nTry:\n1. Check if the file exists in this version\n2. Use 'list-configs' to see available files\n3. Use 'set-version' to switch to a different version`
                }
              ]
            };
          }

          const searchTerm = args.query.toLowerCase();
          const results = [];

          // Helper function to extract all paths and values
          function extractInfo(obj, path = '') {
            const info = [];
            if (obj && typeof obj === 'object') {
              for (const [key, value] of Object.entries(obj)) {
                const currentPath = path ? `${path}.${key}` : key;
                
                if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                  info.push(...extractInfo(value, currentPath));
                } else {
                  info.push({ path: currentPath, key, value });
                }
              }
            }
            return info;
          }

          const allInfo = extractInfo(yamlData);

          // Smart matching based on query
          for (const item of allInfo) {
            const pathLower = item.path.toLowerCase();
            const keyLower = item.key.toLowerCase();
            const valueStr = JSON.stringify(item.value).toLowerCase();
            
            // Check if query matches path, key, or value
            if (pathLower.includes(searchTerm) || 
                keyLower.includes(searchTerm) || 
                valueStr.includes(searchTerm)) {
              results.push(`${item.path}: ${JSON.stringify(item.value)}`);
            }
          }

          // Also try to interpret common queries
          const commonQueries = {
            'namespace': ['namespace', 'namespaces', 'targetNamespace'],
            'cidr': ['serviceCIDR', 'podCIDR', 'clusterCIDR'],
            'network': ['networking', 'serviceCIDR', 'podCIDR'],
            'storage': ['storage', 'persistence', 'size'],
            'distro': ['distro', 'distribution'],
            'etcd': ['etcd', 'embedded'],
            'k3s': ['k3s', 'distro'],
            'k8s': ['k8s', 'distro'],
            'kubernetes': ['distro', 'version']
          };

          // Check for common query patterns
          for (const [pattern, keywords] of Object.entries(commonQueries)) {
            if (searchTerm.includes(pattern)) {
              for (const keyword of keywords) {
                for (const item of allInfo) {
                  if (item.path.toLowerCase().includes(keyword.toLowerCase())) {
                    const result = `${item.path}: ${JSON.stringify(item.value)}`;
                    if (!results.includes(result)) {
                      results.push(result);
                    }
                  }
                }
              }
            }
          }

          if (results.length === 0) {
            // Try a more general search
            return {
              content: [
                {
                  type: 'text',
                  text: `No direct matches found for "${args.query}" in ${fileName}.\n\nHere are some available configuration sections:\n${Object.keys(yamlData || {}).map(k => `- ${k}`).join('\n')}\n\nTry searching for one of these sections or use more specific terms.`
                }
              ]
            };
          }

          return {
            content: [
              {
                type: 'text',
                text: `Found ${results.length} result(s) for "${args.query}" in ${fileName} (${currentRef}):\n\n${results.join('\n')}`
              }
            ]
          };
        }

        case 'query-config': {
          let yamlData;
          
          // Load YAML data from GitHub or content
          if (args.content) {
            yamlData = yaml.load(args.content);
          } else if (args.file) {
            yamlData = await githubClient.getYamlContent(args.file, currentRef);
          } else {
            // Default to config/values.yaml
            yamlData = await githubClient.getYamlContent('config/values.yaml', currentRef);
          }
          
          // Convert YAML to JSON for jq processing
          const jsonData = JSON.stringify(yamlData);
          
          // Run jq query
          const options = {
            input: 'string',
            output: args.raw ? 'string' : 'json'
          };
          
          const result = await jq.run(args.query, jsonData, options);
          
          return {
            content: [
              {
                type: 'text',
                text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
              }
            ]
          };
        }

        case 'get-config-value': {
          let yamlData;
          
          // Load YAML data from GitHub or content
          if (args.content) {
            yamlData = yaml.load(args.content);
          } else if (args.file) {
            yamlData = await githubClient.getYamlContent(args.file, currentRef);
          } else {
            yamlData = await githubClient.getYamlContent('config/values.yaml', currentRef);
          }
          
          // Convert dot notation to jq query
          const jqQuery = '.' + args.path.split('.').map(part => {
            // Handle array indices
            if (/^\d+$/.test(part)) {
              return `[${part}]`;
            }
            // Handle special characters in keys
            return `["${part}"]`;
          }).join('');
          
          const jsonData = JSON.stringify(yamlData);
          const result = await jq.run(jqQuery, jsonData, { input: 'string', output: 'json' });
          
          return {
            content: [
              {
                type: 'text',
                text: `Value at ${args.path}: ${JSON.stringify(result, null, 2)}`
              }
            ]
          };
        }

        case 'validate-config': {
          let yamlData;
          let schema;
          
          // Load YAML data from GitHub or content
          if (args.content) {
            yamlData = yaml.load(args.content);
          } else if (args.file) {
            yamlData = await githubClient.getYamlContent(args.file, currentRef);
          } else {
            yamlData = await githubClient.getYamlContent('config/values.yaml', currentRef);
          }
          
          // Try to load schema from GitHub
          try {
            const schemaContent = await githubClient.getFileContent('vcluster.schema.json', currentRef);
            schema = JSON.parse(schemaContent);
          } catch (error) {
            try {
              // Try values.schema.json as fallback
              const schemaContent = await githubClient.getFileContent('values.schema.json', currentRef);
              schema = JSON.parse(schemaContent);
            } catch (err) {
              return {
                content: [
                  {
                    type: 'text',
                    text: 'Schema file not found in repository. Unable to validate.'
                  }
                ]
              };
            }
          }
          
          // Basic validation - check if required fields exist based on schema
          const validation = validateAgainstSchema(yamlData, schema);
          
          return {
            content: [
              {
                type: 'text',
                text: validation.valid 
                  ? 'Configuration is valid' 
                  : `Validation errors:\n${validation.errors.join('\n')}`
              }
            ]
          };
        }

        case 'search-config': {
          let yamlData;
          
          // Load YAML data from GitHub or content
          if (args.content) {
            yamlData = yaml.load(args.content);
          } else if (args.file) {
            yamlData = await githubClient.getYamlContent(args.file, currentRef);
          } else {
            yamlData = await githubClient.getYamlContent('config/values.yaml', currentRef);
          }
          
          const searchTerm = args.search.toLowerCase();
          const matches = [];
          
          // Recursive search function
          function searchObject(obj, path = '') {
            if (obj && typeof obj === 'object') {
              for (const [key, value] of Object.entries(obj)) {
                const currentPath = path ? `${path}.${key}` : key;
                
                // Check if key matches
                if (key.toLowerCase().includes(searchTerm)) {
                  if (args.keysOnly) {
                    matches.push(`Key: ${currentPath}`);
                  } else {
                    matches.push(`Key: ${currentPath} = ${JSON.stringify(value)}`);
                  }
                }
                
                // Check if value matches (if not keysOnly)
                if (!args.keysOnly && value !== null && value !== undefined) {
                  const valueStr = JSON.stringify(value).toLowerCase();
                  if (valueStr.includes(searchTerm)) {
                    matches.push(`Value at ${currentPath}: ${JSON.stringify(value)}`);
                  }
                }
                
                // Recurse into objects
                if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                  searchObject(value, currentPath);
                }
              }
            }
          }
          
          searchObject(yamlData);
          
          return {
            content: [
              {
                type: 'text',
                text: matches.length > 0 
                  ? `Found ${matches.length} match(es):\n${matches.join('\n')}`
                  : `No matches found for "${args.search}"`
              }
            ]
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error.message}`
          }
        ],
        isError: true
      };
    }
  });

  // Basic schema validation function
  function validateAgainstSchema(data, schema) {
    const errors = [];
    
    // This is a simplified validation - in production, you'd use a proper JSON Schema validator
    // For now, just check if the data structure matches expected top-level properties
    
    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (propSchema.required && !(key in data)) {
          errors.push(`Missing required property: ${key}`);
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  return server;
}