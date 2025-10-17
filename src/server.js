import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import yaml from 'js-yaml';
import jq from 'node-jq';
import { githubClient } from './github.js';
import { validateSnippet } from './snippet-validator.js';

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
                results.unshift(`${item.path}: ${JSON.stringify(item.value)}`);
              }
              // Ends with query (partial match)
              else if (pathLower.endsWith(searchTerm)) {
                results.push(`${item.path}: ${JSON.stringify(item.value)}`);
              }
              // Contains query
              else if (pathLower.includes(searchTerm)) {
                results.push(`${item.path}: ${JSON.stringify(item.value)}`);
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
                results.push(`${item.path}: ${JSON.stringify(item.value)}`);
                suggestions.add(item.path.split('.')[0]);
              }
            }
          }

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

          return {
            content: [
              {
                type: 'text',
                text: `Found ${results.length} result(s) for "${args.query}" in ${fileName} (${version}):\n\n` +
                      limitedResults.join('\n') +
                      (hasMore ? `\n\n... and ${results.length - maxResults} more results (limited to ${maxResults})` : '')
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
