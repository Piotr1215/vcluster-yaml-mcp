import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { promises as fs } from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import jq from 'node-jq';

export function createServer(configPath) {
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

  // Helper function to load YAML files
  async function loadYamlFile(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return yaml.load(content);
    } catch (error) {
      throw new Error(`Failed to load YAML file: ${error.message}`);
    }
  }

  // Helper function to list available YAML files
  async function listYamlFiles() {
    try {
      const files = await fs.readdir(configPath);
      return files.filter(file => file.endsWith('.yaml') || file.endsWith('.yml'));
    } catch (error) {
      throw new Error(`Failed to list YAML files: ${error.message}`);
    }
  }

  // Helper function to load schema
  async function loadSchema() {
    try {
      const schemaPath = path.join(configPath, 'vcluster.schema.json');
      const content = await fs.readFile(schemaPath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      // Schema is optional, return null if not found
      return null;
    }
  }

  // Tool definitions
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'list-configs',
          description: 'List all available vcluster YAML configuration files',
          inputSchema: {
            type: 'object',
            properties: {},
            required: []
          }
        },
        {
          name: 'query-config',
          description: 'Query vcluster YAML configuration using jq expressions',
          inputSchema: {
            type: 'object',
            properties: {
              file: {
                type: 'string',
                description: 'Name of the YAML file to query (e.g., "vcluster.yaml")'
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
            required: ['file', 'query']
          }
        },
        {
          name: 'get-config-value',
          description: 'Get a specific value from vcluster configuration using dot notation',
          inputSchema: {
            type: 'object',
            properties: {
              file: {
                type: 'string',
                description: 'Name of the YAML file to query'
              },
              path: {
                type: 'string',
                description: 'Dot-separated path to the value (e.g., "controlPlane.distro")'
              }
            },
            required: ['file', 'path']
          }
        },
        {
          name: 'validate-config',
          description: 'Validate a vcluster configuration against the schema',
          inputSchema: {
            type: 'object',
            properties: {
              file: {
                type: 'string',
                description: 'Name of the YAML file to validate'
              }
            },
            required: ['file']
          }
        },
        {
          name: 'search-config',
          description: 'Search for keys or values in vcluster configuration',
          inputSchema: {
            type: 'object',
            properties: {
              file: {
                type: 'string',
                description: 'Name of the YAML file to search'
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
            required: ['file', 'search']
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
        case 'list-configs': {
          const files = await listYamlFiles();
          return {
            content: [
              {
                type: 'text',
                text: files.length > 0 
                  ? `Found ${files.length} configuration file(s):\n${files.map(f => `- ${f}`).join('\n')}`
                  : 'No YAML configuration files found'
              }
            ]
          };
        }

        case 'query-config': {
          const filePath = path.join(configPath, args.file);
          const yamlData = await loadYamlFile(filePath);
          
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
          const filePath = path.join(configPath, args.file);
          const yamlData = await loadYamlFile(filePath);
          
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
          const filePath = path.join(configPath, args.file);
          const yamlData = await loadYamlFile(filePath);
          const schema = await loadSchema();
          
          if (!schema) {
            return {
              content: [
                {
                  type: 'text',
                  text: 'Schema file not found. Unable to validate.'
                }
              ]
            };
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
          const filePath = path.join(configPath, args.file);
          const yamlData = await loadYamlFile(filePath);
          
          const searchTerm = args.search.toLowerCase();
          const matches = [];
          
          // Recursive search function
          function searchObject(obj, path = '') {
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