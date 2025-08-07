import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import yaml from 'js-yaml';
import jq from 'node-jq';
import { githubClient } from './github.js';

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

  // Current GitHub ref (branch or tag)
  let currentRef = 'main';

  // Tool definitions
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'list-versions',
          description: 'DISCOVERY: Find all available vCluster versions. Use this FIRST when exploring versions, checking for updates, or before switching versions. Returns GitHub tags (stable releases) and branches (development versions). Shows current version at the end.',
          inputSchema: {
            type: 'object',
            properties: {},
            required: []
          }
        },
        {
          name: 'set-version',
          description: 'VERSION CONTROL: Switch the context to a specific vCluster version or branch. CRITICAL: Do this BEFORE querying configurations to ensure you\'re looking at the right version! Use after list-versions to pick a specific release. Examples: "v0.19.0" for stable, "main" for latest development.',
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
          description: 'STATUS CHECK: See which vCluster version/branch is currently active. Use this to verify context before making queries or when unsure which version you\'re working with. Always shows the ref that subsequent queries will use.',
          inputSchema: {
            type: 'object',
            properties: {},
            required: []
          }
        },
        {
          name: 'list-configs',
          description: 'FILE EXPLORER: Browse available YAML configuration files in the vCluster repository. Use when you need to discover what config files exist or find examples. Default searches "config" directory but can explore any path. Returns file paths and sizes.',
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
          description: 'UNIVERSAL SEARCH: Your go-to tool for finding ANY vCluster configuration! Understands natural language, searches intelligently, and finds related settings. USE THIS FIRST for any config questions! Examples: "show me namespace settings", "how is etcd configured?", "what networking options exist?", "find service CIDR". Searches chart/values.yaml by default (the main config source).',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Natural language query (e.g., "namespace syncing", "high availability", "storage options")'
              },
              file: {
                type: 'string',
                description: 'Optional: specific file to search (default: "chart/values.yaml" - the main config)'
              }
            },
            required: ['query']
          }
        },
        {
          name: 'validate-config',
          description: 'VALIDATION ENGINE: Comprehensive validation of vCluster YAML configurations. Performs 3 layers of checks: 1) YAML syntax (catches parse errors), 2) Schema validation (types, required fields), 3) Procedural rules (structural conflicts, port ranges). Set includeAiRules=true to also extract semantic rules from comments for AI analysis. USE THIS to verify configs are correct before deployment!',
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
              },
              includeAiRules: {
                type: 'boolean',
                description: 'Extract and include AI validation rules from YAML comments (default: false)',
                default: false
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
          // Default to chart/values.yaml as it contains the main vcluster configuration
          const fileName = args.file || 'chart/values.yaml';
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
            // Default to chart/values.yaml
            yamlData = await githubClient.getYamlContent('chart/values.yaml', currentRef);
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

        case 'extract-validation-rules': {
          const fileName = args.file || 'chart/values.yaml';
          let content;
          
          try {
            content = await githubClient.getFileContent(fileName, currentRef);
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
          let yamlData;
          let schema;
          const validationResults = {
            yaml: { valid: true, errors: [] },
            schema: { valid: true, errors: [], warnings: [] },
            dependencies: { valid: true, errors: [], warnings: [] },
            semantic: { valid: true, errors: [], warnings: [] }
          };
          
          // Step 1: Validate YAML syntax
          try {
            if (args.content) {
              yamlData = yaml.load(args.content);
            } else if (args.file) {
              yamlData = await githubClient.getYamlContent(args.file, currentRef);
            } else {
              yamlData = await githubClient.getYamlContent('chart/values.yaml', currentRef);
            }
          } catch (yamlError) {
            validationResults.yaml.valid = false;
            validationResults.yaml.errors.push(`YAML syntax error: ${yamlError.message}`);
            
            return {
              content: [
                {
                  type: 'text',
                  text: `❌ YAML Validation Failed\n\nErrors:\n${validationResults.yaml.errors.join('\n')}`
                }
              ]
            };
          }
          
          // Step 2: Try to load and validate against schema
          try {
            const schemaContent = await githubClient.getFileContent('chart/values.schema.json', currentRef);
            schema = JSON.parse(schemaContent);
          } catch (error) {
            validationResults.schema.warnings.push('Schema file not found - cannot perform schema validation');
          }
          
          if (schema) {
            const schemaValidation = validateAgainstSchema(yamlData, schema);
            validationResults.schema.valid = schemaValidation.valid;
            validationResults.schema.errors = schemaValidation.errors;
            validationResults.schema.warnings = schemaValidation.warnings || [];
          }
          
          // Step 3: Validate procedural rules (deterministic checks)
          const proceduralValidation = validateProceduralRules(yamlData);
          validationResults.procedural = proceduralValidation;
          
          // Step 4: Extract AI validation rules if requested
          let aiRules = null;
          if (args.includeAiRules) {
            try {
              const valuesContent = await githubClient.getFileContent('chart/values.yaml', currentRef);
              aiRules = extractValidationRulesFromComments(valuesContent);
            } catch (error) {
              validationResults.aiRules = { error: `Could not extract AI rules: ${error.message}` };
            }
          }
          
          // Step 5: Generate comprehensive report
          let report = '# vCluster Configuration Validation Report\n\n';
          
          // YAML Validation
          report += '## 1. YAML Syntax\n';
          report += validationResults.yaml.valid ? '✅ Valid YAML syntax\n\n' : '❌ Invalid YAML\n\n';
          
          // Schema Validation
          report += '## 2. Schema Validation\n';
          if (!schema) {
            report += '⚠️ Schema validation skipped (no schema available)\n\n';
          } else if (validationResults.schema.valid) {
            report += '✅ Conforms to schema\n\n';
          } else {
            report += '❌ Schema violations found:\n';
            validationResults.schema.errors.forEach(err => report += `- ${err}\n`);
            report += '\n';
          }
          
          // Procedural Validation
          report += '## 3. Procedural Rules (Structure & Logic)\n';
          if (validationResults.procedural.valid) {
            report += '✅ All procedural rules satisfied\n\n';
          } else {
            report += '❌ Violations found:\n';
            validationResults.procedural.errors.forEach(err => report += `- ${err}\n`);
            report += '\n';
          }
          
          if (validationResults.procedural.warnings && validationResults.procedural.warnings.length > 0) {
            report += '⚠️ Warnings:\n';
            validationResults.procedural.warnings.forEach(warn => report += `- ${warn}\n`);
            report += '\n';
          }
          
          // AI Validation Rules (if requested)
          if (aiRules) {
            report += '## 4. AI Validation Instructions\n';
            report += 'The following validation rules were extracted from comments for AI analysis:\n\n';
            
            if (aiRules.rules && aiRules.rules.length > 0) {
              report += '### Rules to Check:\n';
              aiRules.rules.forEach(rule => {
                report += `**${rule.path}**:\n`;
                rule.instructions.forEach(inst => report += `  - ${inst}\n`);
              });
              report += '\n';
            }
            
            if (aiRules.enums) {
              report += '### Valid Values:\n';
              Object.entries(aiRules.enums).forEach(([field, values]) => {
                report += `- **${field}**: ${values.join(', ')}\n`;
              });
              report += '\n';
            }
            
            if (aiRules.dependencies) {
              report += '### Dependencies:\n';
              aiRules.dependencies.forEach(dep => report += `- ${dep}\n`);
              report += '\n';
            }
          }
          
          // Configuration Summary
          report += `## ${aiRules ? '5' : '4'}. Configuration Summary\n`;
          report += generateConfigSummary(yamlData);
          
          // Overall Status
          const overallValid = validationResults.yaml.valid && 
                              (validationResults.schema.valid || !schema) && 
                              validationResults.procedural.valid;
          
          report += '\n## Overall Status\n';
          report += overallValid ? '✅ **Configuration is valid and ready to use**' : '❌ **Configuration has errors that must be fixed**';
          
          return {
            content: [
              {
                type: 'text',
                text: report
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
  
  // Procedural validation - deterministic checks only
  function validateProceduralRules(config) {
    const errors = [];
    const warnings = [];
    
    // RULE 1: Only one backing store can be enabled (deterministic)
    if (config.controlPlane?.backingStore) {
      const backingStores = [];
      
      if (config.controlPlane.backingStore.database?.embedded?.enabled) {
        backingStores.push('database.embedded');
      }
      if (config.controlPlane.backingStore.database?.external?.enabled) {
        backingStores.push('database.external');
      }
      if (config.controlPlane.backingStore.etcd?.embedded?.enabled) {
        backingStores.push('etcd.embedded');
      }
      if (config.controlPlane.backingStore.etcd?.deploy?.enabled) {
        backingStores.push('etcd.deploy');
      }
      if (config.controlPlane.backingStore.etcd?.external?.enabled) {
        backingStores.push('etcd.external');
      }
      
      if (backingStores.length > 1) {
        errors.push(`Multiple backing stores enabled: ${backingStores.join(', ')}. Only one is allowed.`);
      }
    }
    
    // RULE 2: Only one distro can be enabled (deterministic)
    if (config.controlPlane?.distro) {
      const enabledDistros = Object.keys(config.controlPlane.distro)
        .filter(key => config.controlPlane.distro[key]?.enabled === true);
      
      if (enabledDistros.length > 1) {
        errors.push(`Multiple distros enabled: ${enabledDistros.join(', ')}. Only one is allowed.`);
      }
    }
    
    // RULE 3: Negative numbers validation (deterministic)
    function checkNegativeNumbers(obj, path = '') {
      if (obj && typeof obj === 'object') {
        for (const [key, value] of Object.entries(obj)) {
          const currentPath = path ? `${path}.${key}` : key;
          
          if (typeof value === 'number' && value < 0) {
            // Check if it's a field that shouldn't be negative
            if (key.toLowerCase().includes('replica') ||
                key.toLowerCase().includes('count') ||
                key.toLowerCase().includes('size') ||
                key.toLowerCase().includes('port') ||
                key.toLowerCase().includes('timeout')) {
              errors.push(`Invalid negative value at ${currentPath}: ${value}`);
            }
          } else if (typeof value === 'object' && value !== null) {
            checkNegativeNumbers(value, currentPath);
          }
        }
      }
    }
    checkNegativeNumbers(config);
    
    // RULE 4: Required field dependencies (deterministic)
    if (config.controlPlane?.backingStore?.database?.external?.enabled && 
        !config.controlPlane.backingStore.database.external.dataSource) {
      errors.push('External database enabled but dataSource is not configured');
    }
    
    if (config.controlPlane?.backingStore?.etcd?.external?.enabled && 
        !config.controlPlane.backingStore.etcd.external.endpoints) {
      errors.push('External etcd enabled but endpoints are not configured');
    }
    
    // RULE 5: Logical consistency checks (deterministic)
    if (config.sync?.toHost?.namespaces?.mappingsOnly === true && 
        (!config.sync?.toHost?.namespaces?.mappings || 
         Object.keys(config.sync.toHost.namespaces.mappings).length === 0)) {
      warnings.push('mappingsOnly is true but no namespace mappings are defined');
    }
    
    // RULE 6: Network policy conflicts (deterministic)
    if (config.sync?.toHost?.networkPolicies?.enabled === true && 
        config.sync?.toHost?.namespaces?.enabled === true) {
      errors.push('NetworkPolicies cannot be synced when namespace syncing is enabled');
    }
    
    // RULE 7: Type validation for boolean fields (deterministic)
    function checkBooleanFields(obj, path = '') {
      if (obj && typeof obj === 'object') {
        for (const [key, value] of Object.entries(obj)) {
          const currentPath = path ? `${path}.${key}` : key;
          
          if (key === 'enabled' && typeof value !== 'boolean' && value !== undefined) {
            errors.push(`Field '${currentPath}' should be boolean, got ${typeof value}`);
          } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            checkBooleanFields(value, currentPath);
          }
        }
      }
    }
    checkBooleanFields(config);
    
    // RULE 8: Port range validation (deterministic)
    function checkPortRanges(obj, path = '') {
      if (obj && typeof obj === 'object') {
        for (const [key, value] of Object.entries(obj)) {
          const currentPath = path ? `${path}.${key}` : key;
          
          if (key.toLowerCase().includes('port') && typeof value === 'number') {
            if (value < 1 || value > 65535) {
              errors.push(`Invalid port number at ${currentPath}: ${value} (must be 1-65535)`);
            }
          } else if (typeof value === 'object' && value !== null) {
            checkPortRanges(value, currentPath);
          }
        }
      }
    }
    checkPortRanges(config);
    
    return {
      valid: errors.length === 0,
      errors: errors,
      warnings: warnings
    };
  }
  
  // JSON Schema validation - purely structural/type checks
  function validateAgainstSchema(data, schema) {
    const errors = [];
    const warnings = [];
    
    // Recursive validation function for JSON schema
    function validateObject(obj, objSchema, path = '') {
      if (!obj || !objSchema) return;
      
      // Check required properties
      if (objSchema.required && Array.isArray(objSchema.required)) {
        for (const requiredProp of objSchema.required) {
          if (!(requiredProp in obj)) {
            errors.push(`Missing required property: ${path ? path + '.' : ''}${requiredProp}`);
          }
        }
      }
      
      // Validate each property
      if (objSchema.properties) {
        for (const [key, value] of Object.entries(obj)) {
          const propSchema = objSchema.properties[key];
          const currentPath = path ? `${path}.${key}` : key;
          
          if (!propSchema) continue;
          
          // Type validation
          if (propSchema.type) {
            const expectedType = Array.isArray(propSchema.type) ? propSchema.type : [propSchema.type];
            const actualType = Array.isArray(value) ? 'array' : typeof value;
            
            if (!expectedType.includes(actualType)) {
              errors.push(`Invalid type at ${currentPath}: expected ${expectedType.join(' or ')}, got ${actualType}`);
            }
          }
          
          // Numeric range validation from schema
          if (typeof value === 'number') {
            if (propSchema.minimum !== undefined && value < propSchema.minimum) {
              errors.push(`Value at ${currentPath} is below minimum (${value} < ${propSchema.minimum})`);
            }
            if (propSchema.maximum !== undefined && value > propSchema.maximum) {
              errors.push(`Value at ${currentPath} exceeds maximum (${value} > ${propSchema.maximum})`);
            }
          }
          
          // Enum validation from schema
          if (propSchema.enum && !propSchema.enum.includes(value)) {
            const suggestion = propSchema.enum.join(', ');
            errors.push(`Invalid value at ${currentPath}: "${value}" is not one of [${suggestion}]`);
          }
          
          // Pattern validation from schema
          if (propSchema.pattern && typeof value === 'string') {
            const regex = new RegExp(propSchema.pattern);
            if (!regex.test(value)) {
              errors.push(`Value at ${currentPath} doesn't match pattern: ${propSchema.pattern}`);
            }
          }
          
          // Recursive validation for nested objects
          if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            validateObject(value, propSchema, currentPath);
          }
          
          // Array validation
          if (Array.isArray(value) && propSchema.items) {
            value.forEach((item, index) => {
              if (typeof item === 'object' && item !== null) {
                validateObject(item, propSchema.items, `${currentPath}[${index}]`);
              }
            });
          }
        }
      }
    }
    
    // Run recursive validation if schema is provided
    if (schema) {
      validateObject(data, schema);
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
  
  // Generate configuration summary
  function generateConfigSummary(config) {
    const summary = [];
    
    // Distro
    if (config.controlPlane?.distro) {
      const enabled = Object.keys(config.controlPlane.distro)
        .find(key => config.controlPlane.distro[key]?.enabled);
      summary.push(`- **Distro**: ${enabled || 'default'}`);
    }
    
    // Backing store
    if (config.controlPlane?.backingStore) {
      if (config.controlPlane.backingStore.database?.embedded?.enabled) {
        summary.push('- **Storage**: Embedded database (SQLite)');
      } else if (config.controlPlane.backingStore.database?.external?.enabled) {
        summary.push('- **Storage**: External database');
      } else if (config.controlPlane.backingStore.etcd?.deploy?.enabled) {
        const replicas = config.controlPlane.backingStore.etcd.deploy.statefulSet?.highAvailability?.replicas || 1;
        summary.push(`- **Storage**: Deployed etcd (${replicas} replica${replicas > 1 ? 's' : ''})`);
      } else if (config.controlPlane.backingStore.etcd?.embedded?.enabled) {
        summary.push('- **Storage**: Embedded etcd');
      } else if (config.controlPlane.backingStore.etcd?.external?.enabled) {
        summary.push('- **Storage**: External etcd');
      }
    }
    
    // Sync configuration
    if (config.sync?.toHost) {
      const syncedResources = Object.keys(config.sync.toHost)
        .filter(key => config.sync.toHost[key]?.enabled)
        .map(key => key.replace(/([A-Z])/g, ' $1').trim());
      
      if (syncedResources.length > 0) {
        summary.push(`- **Synced to host**: ${syncedResources.join(', ')}`);
      }
    }
    
    if (config.sync?.fromHost) {
      const syncedResources = Object.keys(config.sync.fromHost)
        .filter(key => config.sync.fromHost[key]?.enabled)
        .map(key => key.replace(/([A-Z])/g, ' $1').trim());
      
      if (syncedResources.length > 0) {
        summary.push(`- **Synced from host**: ${syncedResources.join(', ')}`);
      }
    }
    
    // Namespace mappings
    if (config.sync?.toHost?.namespaces?.mappings?.byName) {
      const mappingCount = Object.keys(config.sync.toHost.namespaces.mappings.byName).length;
      summary.push(`- **Namespace mappings**: ${mappingCount} pattern${mappingCount > 1 ? 's' : ''}`);
      
      if (config.sync.toHost.namespaces.mappingsOnly) {
        summary.push('- **Strict mode**: Only mapped namespaces allowed');
      }
    }
    
    return summary.length > 0 ? summary.join('\n') : 'No configuration detected';
  }

  return server;
}