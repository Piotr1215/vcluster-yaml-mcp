import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import yaml from 'js-yaml';
import jq from 'node-jq';
import { githubClient } from './github.js';
import { validateSnippet } from './snippet-validator.js';

// Helper function to get the type of a value
function getType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  if (typeof value === 'number') {
    return Number.isInteger(value) ? 'integer' : 'number';
  }
  return typeof value; // 'string', 'boolean'
}

// Helper function to format values for display
function formatValue(value, path, indent = 0) {
  const spaces = '  '.repeat(indent);

  // Primitives (string, number, boolean, null)
  if (value === null) return 'null';
  if (typeof value !== 'object') return String(value);

  // Arrays
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    if (value.length <= 5 && value.every(v => typeof v !== 'object')) {
      // Small array of primitives - inline
      return JSON.stringify(value);
    }
    // Multi-line array
    return '\n' + value.map(v =>
      `${spaces}  - ${formatValue(v, path, indent + 1)}`
    ).join('\n');
  }

  // Objects
  const keys = Object.keys(value);
  if (keys.length === 0) return '{}';

  // Small object (≤5 fields) - show all fields
  if (keys.length <= 5) {
    return '\n' + keys.map(key =>
      `${spaces}  ${key}: ${formatValue(value[key], `${path}.${key}`, indent + 1)}`
    ).join('\n');
  }

  // Large object - show structure only
  return `\n${spaces}  {object with ${keys.length} fields}`;
}

// Helper function to get field hints for common field names
function getFieldHint(fieldName) {
  // Common field patterns and their hints
  const hints = {
    'resources': 'Resource limits and requests',
    'replicas': 'Number of replicas for HA',
    'affinity': 'Pod affinity rules',
    'tolerations': 'Pod toleration settings',
    'nodeSelector': 'Node selection constraints',
    'image': 'Container image configuration',
    'enabled': 'Enable/disable this feature',
    'annotations': 'Kubernetes annotations',
    'labels': 'Kubernetes labels',
    'ingress': 'Ingress configuration',
    'service': 'Service configuration',
    'storage': 'Storage configuration',
    'persistence': 'Persistent volume settings',
    'sync': 'Resource sync configuration',
    'networking': 'Network settings'
  };

  return hints[fieldName] || '';
}

// Helper function to find related configs for a given item
function findRelatedConfigs(item, allInfo) {
  const related = [];
  const pathParts = item.path.split('.');
  const lastKey = pathParts[pathParts.length - 1];
  const parentPath = pathParts.slice(0, -1).join('.');

  // Strategy 1: Find sibling fields (same parent path)
  const siblings = allInfo.filter(info => {
    const infoParent = info.path.split('.').slice(0, -1).join('.');
    return infoParent === parentPath &&
           info.path !== item.path &&
           typeof info.value === 'object' &&
           !Array.isArray(info.value);
  });

  // Add up to 2 sibling configs
  siblings.slice(0, 2).forEach(sibling => {
    const siblingKey = sibling.path.split('.').pop();
    related.push({
      path: sibling.path,
      hint: getFieldHint(siblingKey)
    });
  });

  // Strategy 2: Find same key name elsewhere (commonly configured together)
  if (related.length < 3) {
    const sameKeyElsewhere = allInfo.filter(info => {
      const infoKey = info.path.split('.').pop();
      return infoKey === lastKey &&
             info.path !== item.path &&
             !info.path.startsWith(item.path) && // Not a child
             typeof info.value === 'object' &&
             !Array.isArray(info.value);
    });

    // Add up to 1 same-key config from different section
    sameKeyElsewhere.slice(0, 1).forEach(same => {
      const section = same.path.split('.')[0];
      related.push({
        path: same.path,
        hint: `${lastKey} in ${section} section`
      });
    });
  }

  return related.slice(0, 3); // Max 3 related configs
}

// Helper function to format a single match result
function formatMatch(item, index, total, allInfo) {
  const separator = '━'.repeat(60);
  let output = [];

  if (index > 0) output.push(''); // Blank line between matches
  output.push(separator);
  output.push('');
  output.push(`MATCH: ${item.path}`);
  output.push(`TYPE:  ${getType(item.value)}`);

  // For primitives and simple values
  if (typeof item.value !== 'object' || item.value === null) {
    output.push(`VALUE: ${item.value}`);
    return output.join('\n');
  }

  // For arrays
  if (Array.isArray(item.value)) {
    if (item.value.length === 0) {
      output.push('VALUE: []');
    } else {
      output.push(`VALUE: ${formatValue(item.value, item.path)}`);
    }
    return output.join('\n');
  }

  // For objects - show fields
  const keys = Object.keys(item.value);
  output.push('');

  if (keys.length <= 10) {
    // Show all fields for small objects
    output.push('FIELDS:');
    keys.forEach(key => {
      const fieldValue = item.value[key];
      const fieldType = getType(fieldValue);
      output.push(`  ${key} <${fieldType}>`);
      if (typeof fieldValue !== 'object' || fieldValue === null) {
        output.push(`    value: ${fieldValue}`);
      } else if (Array.isArray(fieldValue)) {
        output.push(`    value: [${fieldValue.length} items]`);
      } else {
        output.push(`    value: {object with ${Object.keys(fieldValue).length} fields}`);
      }
      output.push('');
    });
  } else {
    // Show first 5 fields for large objects
    output.push(`FIELDS (${keys.length} total):`);
    keys.slice(0, 5).forEach(key => {
      const fieldType = getType(item.value[key]);
      output.push(`  ${key} <${fieldType}>`);
    });
    output.push('');
    output.push(`  ... ${keys.length - 5} more fields`);
    output.push('');
    output.push(`NOTE: Use query "${item.path}.fieldName" to see nested details`);
  }

  // Add related configs for objects
  if (typeof item.value === 'object' && !Array.isArray(item.value)) {
    const related = findRelatedConfigs(item, allInfo);
    if (related.length > 0) {
      output.push('');
      output.push('RELATED CONFIGS:');
      related.forEach(r => {
        output.push(`  • ${r.path}${r.hint ? ' - ' + r.hint : ''}`);
      });
    }
  }

  return output.join('\n');
}

// Helper function to rank search results by relevance
function rankResult(item, query) {
  let score = 0;
  const pathLower = item.path.toLowerCase();
  const keyLower = item.key.toLowerCase();
  const queryLower = query.toLowerCase();

  // Exact key match (highest priority)
  if (keyLower === queryLower) score += 100;

  // Exact path match
  if (pathLower === queryLower) score += 80;

  // Path ends with query
  if (pathLower.endsWith('.' + queryLower)) score += 50;

  // Key contains query
  if (keyLower.includes(queryLower)) score += 30;

  // Path contains query
  if (pathLower.includes(queryLower)) score += 10;

  // Prefer leaf values over objects
  if (item.isLeaf) score += 20;

  // Prefer shorter paths (less nesting = more relevant)
  const depth = item.path.split('.').length;
  score -= depth;

  return score;
}

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

    try {
      switch (name) {
        case 'create-vcluster-config': {
          const { yaml_content, description, version } = args;
          const targetVersion = version || 'main';

          // Fetch schema for validation
          try {
            const schemaContent = await githubClient.getFileContent('chart/values.schema.json', targetVersion);
            const fullSchema = JSON.parse(schemaContent);

            // Validate the config
            const validationResult = validateSnippet(
              yaml_content,
              fullSchema,
              targetVersion,
              null  // Auto-detect section
            );

            // Format response based on validation result
            let response = '';

            if (description) {
              response += `## ${description}\n\n`;
            }

            if (validationResult.valid) {
              response += `✅ **Configuration validated successfully!**\n\n`;
              response += `Version: ${targetVersion}\n`;
              if (validationResult.section) {
                response += `Section: ${validationResult.section}\n`;
              }
              response += `Validation time: ${validationResult.elapsed_ms}ms\n\n`;
              response += `### Configuration:\n\`\`\`yaml\n${yaml_content}\n\`\`\`\n`;
            } else {
              response += `❌ **Validation failed**\n\n`;
              if (validationResult.syntax_valid === false) {
                response += `**Syntax Error:**\n${validationResult.syntax_error}\n\n`;
              } else if (validationResult.errors && validationResult.errors.length > 0) {
                response += `**Validation Errors:**\n`;
                validationResult.errors.forEach((err, idx) => {
                  response += `${idx + 1}. **${err.path}**: ${err.message}\n`;
                });
                response += `\n`;
              } else if (validationResult.error) {
                response += `**Error:** ${validationResult.error}\n\n`;
                if (validationResult.hint) {
                  response += `**Hint:** ${validationResult.hint}\n\n`;
                }
              }
              response += `### Provided Configuration:\n\`\`\`yaml\n${yaml_content}\n\`\`\`\n`;
            }

            return {
              content: [
                {
                  type: 'text',
                  text: response
                }
              ],
              isError: !validationResult.valid
            };
          } catch (error) {
            return {
              content: [
                {
                  type: 'text',
                  text: `❌ **Failed to validate configuration**\n\nError: ${error.message}\n\n### Provided Configuration:\n\`\`\`yaml\n${yaml_content}\n\`\`\``
                }
              ],
              isError: true
            };
          }
        }

        case 'list-versions': {
          const tags = await githubClient.getTags();

          // Only show versions starting with 'v'
          const versionTags = tags.filter(tag => tag.startsWith('v'));

          // Always include main branch
          const versions = ['main', ...versionTags];

          return {
            content: [
              {
                type: 'text',
                text: `Available vCluster versions:\n\n${versions.slice(0, 20).map(v => `- ${v}`).join('\n')}\n${versions.length > 20 ? `... and ${versions.length - 20} more\n` : ''}`
              }
            ]
          };
        }

        case 'smart-query': {
          const version = args.version || 'main';
          const fileName = args.file || 'chart/values.yaml';
          let yamlData;

          try {
            yamlData = await githubClient.getYamlContent(fileName, version);
          } catch (error) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Could not load ${fileName} from GitHub (version: ${version}). Error: ${error.message}\n\nTry:\n1. Check if the file exists in this version\n2. Try querying chart/values.yaml (default config file)\n3. Try a different version`
                }
              ]
            };
          }

          const searchTerm = args.query.toLowerCase();
          const results = [];
          const suggestions = new Set();

          // Helper function to extract all paths and values
          function extractInfo(obj, path = '') {
            const info = [];
            if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
              for (const [key, value] of Object.entries(obj)) {
                const currentPath = path ? `${path}.${key}` : key;

                if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                  info.push({ path: currentPath, key, value, isLeaf: false });
                  info.push(...extractInfo(value, currentPath));
                } else {
                  info.push({ path: currentPath, key, value, isLeaf: true });
                }
              }
            }
            return info;
          }

          const allInfo = extractInfo(yamlData);

          // Support dot notation queries (e.g., "controlPlane.ingress.enabled")
          const isDotNotation = searchTerm.includes('.');

          if (isDotNotation) {
            // Exact and partial dot notation matching
            for (const item of allInfo) {
              const pathLower = item.path.toLowerCase();

              // Exact match
              if (pathLower === searchTerm) {
                results.push(item);
              }
              // Ends with query (partial match)
              else if (pathLower.endsWith(searchTerm)) {
                results.push(item);
              }
              // Contains query
              else if (pathLower.includes(searchTerm)) {
                results.push(item);
                suggestions.add(item.path.split('.')[0]); // Suggest top-level
              }
            }
          } else {
            // Keyword-based search
            const keywords = searchTerm.split(/\s+/);

            for (const item of allInfo) {
              const pathLower = item.path.toLowerCase();
              const keyLower = item.key.toLowerCase();
              const valueStr = JSON.stringify(item.value).toLowerCase();

              // Check if ALL keywords match (AND logic for multi-word)
              const allKeywordsMatch = keywords.every(kw =>
                pathLower.includes(kw) || keyLower.includes(kw) || valueStr.includes(kw)
              );

              if (allKeywordsMatch) {
                results.push(item);
                suggestions.add(item.path.split('.')[0]);
              }
            }
          }

          // Sort results by relevance
          results.sort((a, b) => {
            const scoreA = rankResult(a, searchTerm);
            const scoreB = rankResult(b, searchTerm);
            return scoreB - scoreA; // Descending order
          });

          // Limit results to avoid token overflow
          const maxResults = 50;
          const limitedResults = results.slice(0, maxResults);
          const hasMore = results.length > maxResults;

          if (limitedResults.length === 0) {
            // Find similar paths
            const similarPaths = allInfo
              .filter(item => {
                const pathParts = item.path.toLowerCase().split('.');
                return pathParts.some(part => part.includes(searchTerm) || searchTerm.includes(part));
              })
              .slice(0, 5)
              .map(item => item.path);

            return {
              content: [
                {
                  type: 'text',
                  text: `No matches found for "${args.query}" in ${fileName} (${version}).\n\n` +
                        (similarPaths.length > 0
                          ? `Similar paths:\n${similarPaths.map(p => `  - ${p}`).join('\n')}\n\n`
                          : '') +
                        `Tips:\n` +
                        `  - Use dot notation: "controlPlane.ingress.enabled"\n` +
                        `  - Try broader terms: "${searchTerm.split('.')[0] || searchTerm.split(/\s+/)[0]}"\n` +
                        `  - Use extract-validation-rules for section details\n\n` +
                        `Top-level sections:\n${Object.keys(yamlData || {}).map(k => `  - ${k}`).join('\n')}`
                }
              ]
            };
          }

          // Format all results
          const formattedResults = limitedResults.map((item, idx) =>
            formatMatch(item, idx, limitedResults.length, allInfo)
          );

          return {
            content: [
              {
                type: 'text',
                text: `Found ${results.length} match${results.length === 1 ? '' : 'es'} for "${args.query}" in ${fileName} (${version})\n\n` +
                      formattedResults.join('\n') +
                      (hasMore ? `\n\n... showing ${maxResults} of ${results.length} total matches` : '')
              }
            ]
          };
        }

        case 'query-config': {
          const version = args.version || 'main';
          let yamlData;

          // Load YAML data from GitHub or content
          if (args.content) {
            yamlData = yaml.load(args.content);
          } else if (args.file) {
            yamlData = await githubClient.getYamlContent(args.file, version);
          } else {
            // Default to chart/values.yaml
            yamlData = await githubClient.getYamlContent('chart/values.yaml', version);
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
          const version = args.version || 'main';
          let yamlData;

          // Load YAML data from GitHub or content
          if (args.content) {
            yamlData = yaml.load(args.content);
          } else if (args.file) {
            yamlData = await githubClient.getYamlContent(args.file, version);
          } else {
            yamlData = await githubClient.getYamlContent('config/values.yaml', version);
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

        case 'extract-validation-rules': {
          const version = args.version || 'main';
          const fileName = args.file || 'chart/values.yaml';
          let content;

          try {
            content = await githubClient.getFileContent(fileName, version);
          } catch (error) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Error loading ${fileName}: ${error.message}`
                }
              ]
            };
          }

          const rules = extractValidationRulesFromComments(content, args.section);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(rules, null, 2)
              }
            ]
          };
        }

        case 'validate-config': {
          const version = args.version || 'main';
          let yamlContent;

          // Get YAML content
          try {
            if (args.content) {
              yamlContent = args.content;
            } else if (args.file) {
              yamlContent = await githubClient.getFileContent(args.file, version);
            } else {
              yamlContent = await githubClient.getFileContent('chart/values.yaml', version);
            }
          } catch (error) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    valid: false,
                    error: `Failed to load YAML: ${error.message}`
                  }, null, 2)
                }
              ]
            };
          }

          // Fetch schema for validation
          try {
            const schemaContent = await githubClient.getFileContent('chart/values.schema.json', version);
            const fullSchema = JSON.parse(schemaContent);

            // Use snippet validator for validation
            const result = validateSnippet(
              yamlContent,
              fullSchema,
              version,
              null  // Let it auto-detect section
            );

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2)
                }
              ]
            };
          } catch (error) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    valid: false,
                    error: `Validation failed: ${error.message}`,
                    version
                  }, null, 2)
                }
              ]
            };
          }
        }

        case 'search-config': {
          const version = args.version || 'main';
          let yamlData;

          // Load YAML data from GitHub or content
          if (args.content) {
            yamlData = yaml.load(args.content);
          } else if (args.file) {
            yamlData = await githubClient.getYamlContent(args.file, version);
          } else {
            yamlData = await githubClient.getYamlContent('config/values.yaml', version);
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

  // Extract validation rules from YAML comments for AI validation
  function extractValidationRulesFromComments(yamlContent, section) {
    const lines = yamlContent.split('\n');
    const rules = [];
    const enums = {};
    const dependencies = [];
    const defaults = {};
    
    let currentPath = [];
    let currentComments = [];
    let indentStack = [0];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      
      // Skip empty lines
      if (!trimmedLine) {
        currentComments = [];
        continue;
      }
      
      // Collect comments
      if (trimmedLine.startsWith('#')) {
        const comment = trimmedLine.substring(1).trim();
        if (comment && !comment.startsWith('#')) {
          currentComments.push(comment);
        }
        continue;
      }
      
      // Parse YAML structure
      const indent = line.search(/\S/);
      const keyMatch = line.match(/^(\s*)([a-zA-Z0-9_-]+):\s*(.*)?$/);
      
      if (keyMatch) {
        const key = keyMatch[2];
        const value = keyMatch[3];
        
        // Update path based on indentation
        while (indentStack.length > 1 && indent <= indentStack[indentStack.length - 1]) {
          indentStack.pop();
          currentPath.pop();
        }
        
        if (indent > indentStack[indentStack.length - 1]) {
          indentStack.push(indent);
        } else if (indent < indentStack[indentStack.length - 1]) {
          while (indentStack.length > 1 && indent < indentStack[indentStack.length - 1]) {
            indentStack.pop();
            currentPath.pop();
          }
        } else {
          currentPath.pop();
        }
        
        currentPath.push(key);
        const fullPath = currentPath.join('.');
        
        // Filter by section if specified
        if (section && !fullPath.startsWith(section)) {
          currentComments = [];
          continue;
        }
        
        // Extract validation instructions from comments
        if (currentComments.length > 0) {
          const instructions = [];
          
          for (const comment of currentComments) {
            // Extract enum values (e.g., "Valid values: a, b, c")
            const enumMatch = comment.match(/(?:valid values?|options?|choices?|possible values?):\s*(.+)/i);
            if (enumMatch) {
              const values = enumMatch[1].split(/[,;]/).map(v => v.trim()).filter(v => v);
              enums[fullPath] = values;
              instructions.push(`Valid values: ${values.join(', ')}`);
            }
            
            // Extract required dependencies
            if (comment.match(/requires?|depends on|needs?/i)) {
              dependencies.push(`${fullPath}: ${comment}`);
              instructions.push(comment);
            }
            
            // Extract defaults
            const defaultMatch = comment.match(/default(?:s)?\s*(?:is|:)?\s*(.+)/i);
            if (defaultMatch) {
              defaults[fullPath] = defaultMatch[1].trim();
            }
            
            // Extract validation rules
            if (comment.match(/must|should|cannot|only|at least|minimum|maximum|required/i)) {
              instructions.push(comment);
            }
            
            // Extract warnings
            if (comment.match(/warning|note|important|deprecated/i)) {
              instructions.push(`⚠️ ${comment}`);
            }
          }
          
          if (instructions.length > 0) {
            rules.push({
              path: fullPath,
              instructions: instructions,
              originalComments: currentComments
            });
          }
        }
        
        currentComments = [];
      }
    }
    
    // Generate AI validation instructions
    const aiInstructions = {
      summary: `Extracted ${rules.length} validation rules from YAML comments`,
      rules: rules,
      enums: enums,
      dependencies: dependencies,
      defaults: defaults,
      instructions: generateAiValidationInstructions(rules, enums, dependencies)
    };
    
    return aiInstructions;
  }
  
  function generateAiValidationInstructions(rules, enums, dependencies) {
    let instructions = '### AI Validation Instructions\n\n';
    instructions += 'Please validate the configuration using these rules extracted from comments:\n\n';
    
    if (rules.length > 0) {
      instructions += '#### Field-Specific Rules:\n';
      rules.forEach(rule => {
        instructions += `- **${rule.path}**:\n`;
        rule.instructions.forEach(inst => {
          instructions += `  - ${inst}\n`;
        });
      });
      instructions += '\n';
    }
    
    if (Object.keys(enums).length > 0) {
      instructions += '#### Enumeration Constraints:\n';
      instructions += 'Ensure these fields only contain the specified values:\n';
      Object.entries(enums).forEach(([field, values]) => {
        instructions += `- ${field}: [${values.join(', ')}]\n`;
      });
      instructions += '\n';
    }
    
    if (dependencies.length > 0) {
      instructions += '#### Dependencies to Check:\n';
      dependencies.forEach(dep => {
        instructions += `- ${dep}\n`;
      });
      instructions += '\n';
    }
    
    instructions += '#### Validation Approach:\n';
    instructions += '1. Check if all enumeration constraints are satisfied\n';
    instructions += '2. Verify all dependency requirements are met\n';
    instructions += '3. Validate against the specific rules for each field\n';
    instructions += '4. Flag any deprecated fields or configurations\n';
    instructions += '5. Provide helpful suggestions for fixing any issues found\n';
    
    return instructions;
  }

  return server;
}
