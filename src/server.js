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
          description: 'VALIDATION ENGINE: Comprehensive validation returning rich JSON for AI ingestion. Returns 4 layers: 1) Syntax validation, 2) Schema validation, 3) Procedural rules (enums, ranges, types), 4) Semantic rules (FILTERED to only paths in your config). Response includes severity levels (ERROR/WARNING/INFO), next steps, and configuration summary. Set includeSemantic=false for minimal output.',
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
              includeSemantic: {
                type: 'boolean',
                description: 'Include semantic validation rules (default: true). Set to false for compact output without semantic rules.'
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
          let aiRules = null;
          
          // Initialize unified validation response
          const validationResponse = {
            layers: {
              syntax: { valid: true, errors: [] },
              schema: { valid: true, errors: [], warnings: [] },
              procedural: { valid: true, errors: [], warnings: [], info: [] },
              semantic: { extracted: 0, rules: [], enums: {}, dependencies: [] }
            },
            severity: {
              errors: 0,
              warnings: 0,
              info: 0
            },
            overall_status: 'PASSED',
            next_steps: []
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
            validationResponse.layers.syntax.valid = false;
            validationResponse.layers.syntax.errors.push(`YAML syntax error: ${yamlError.message}`);
            validationResponse.severity.errors++;
            validationResponse.overall_status = 'FAILED - YAML syntax error';
            validationResponse.next_steps.push('Fix YAML syntax before proceeding');
            
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(validationResponse, null, 2)
                }
              ]
            };
          }
          
          // Step 2: Try to load and validate against schema
          try {
            const schemaContent = await githubClient.getFileContent('chart/values.schema.json', currentRef);
            schema = JSON.parse(schemaContent);
          } catch (error) {
            validationResponse.layers.schema.warnings.push('Schema file not found - cannot perform schema validation');
            validationResponse.severity.warnings++;
          }
          
          if (schema) {
            const schemaValidation = validateAgainstSchema(yamlData, schema);
            validationResponse.layers.schema.valid = schemaValidation.valid;
            validationResponse.layers.schema.errors = schemaValidation.errors;
            validationResponse.layers.schema.warnings = schemaValidation.warnings || [];
            validationResponse.severity.errors += schemaValidation.errors.length;
            validationResponse.severity.warnings += schemaValidation.warnings.length;
            
            // Add next steps for schema errors
            schemaValidation.errors.forEach(err => {
              validationResponse.next_steps.push(`Fix schema violation: ${err}`);
            });
          }
          
          // Step 3: Validate procedural rules (deterministic checks)
          const proceduralValidation = validateProceduralRules(yamlData);
          validationResponse.layers.procedural = proceduralValidation;
          validationResponse.severity.errors += proceduralValidation.errors.length;
          validationResponse.severity.warnings += proceduralValidation.warnings.length;
          validationResponse.severity.info += (proceduralValidation.info || []).length;
          
          // Add next steps for procedural errors
          proceduralValidation.errors.forEach(err => {
            validationResponse.next_steps.push(`Fix: ${err}`);
          });
          proceduralValidation.warnings.forEach(warn => {
            validationResponse.next_steps.push(`Review: ${warn}`);
          });
          
          // Step 4: Extract AI validation rules - but only for paths in user's config
          const includeSemantic = args.includeSemantic !== false; // Default true for backwards compatibility
          
          if (includeSemantic) {
            try {
              const valuesContent = await githubClient.getFileContent('chart/values.yaml', currentRef);
              const allRules = extractValidationRulesFromComments(valuesContent);
              
              // Get all paths from user's config
              const userPaths = extractPathsFromYaml(yamlData);
              
              // Filter rules to only those relevant to user's config
              const relevantRules = allRules.rules.filter(rule => {
                // Normalize rule path for comparison
                const rulePath = rule.path;
                const normalizedRulePath = normalizePath(rulePath);
                
                // Check if rule path matches any user path
                return userPaths.some(userPath => {
                  const normalizedUserPath = normalizePath(userPath);
                  
                  // Match if paths are related (parent, child, or same)
                  // Check both normalized and original paths
                  return userPath.startsWith(rulePath) || 
                         rulePath.startsWith(userPath) ||
                         userPath === rulePath ||
                         normalizedUserPath.startsWith(normalizedRulePath) ||
                         normalizedRulePath.startsWith(normalizedUserPath) ||
                         normalizedUserPath === normalizedRulePath;
                });
              });
              
              // Filter enums to only relevant paths
              const relevantEnums = {};
              Object.keys(allRules.enums).forEach(path => {
                const normalizedEnumPath = normalizePath(path);
                if (userPaths.some(userPath => {
                  const normalizedUserPath = normalizePath(userPath);
                  return userPath.startsWith(path) || 
                         path.startsWith(userPath) ||
                         normalizedUserPath.startsWith(normalizedEnumPath) ||
                         normalizedEnumPath.startsWith(normalizedUserPath);
                })) {
                  relevantEnums[path] = allRules.enums[path];
                }
              });
              
              validationResponse.layers.semantic = {
                extracted: relevantRules.length,
                total_available: allRules.rules.length,
                rules: relevantRules,
                enums: relevantEnums,
                dependencies: allRules.dependencies.filter(dep => 
                  userPaths.some(path => dep.includes(path))),
                summary: `${relevantRules.length} of ${allRules.rules.length} rules relevant to your configuration`
              };
              
              // Add info about available AI rules
              if (relevantRules.length > 0) {
                validationResponse.severity.info++;
                validationResponse.next_steps.push(`Consider: ${relevantRules.length} semantic rules relevant to your configuration`);
              }
            } catch (error) {
              validationResponse.layers.semantic.error = `Could not extract AI rules: ${error.message}`;
            }
          } else {
            // Minimal semantic layer when disabled
            validationResponse.layers.semantic = {
              extracted: 0,
              rules: [],
              enums: {},
              dependencies: [],
              summary: "Semantic validation disabled"
            };
          }
          
          // Determine overall status
          if (validationResponse.severity.errors > 0) {
            validationResponse.overall_status = `FAILED - ${validationResponse.severity.errors} error(s) must be fixed`;
          } else if (validationResponse.severity.warnings > 0) {
            validationResponse.overall_status = `PASSED with ${validationResponse.severity.warnings} warning(s)`;
          } else {
            validationResponse.overall_status = 'PASSED - Configuration is valid';
          }
          
          // Add configuration summary to response
          const configSummary = generateConfigSummary(yamlData);
          validationResponse.configuration_summary = configSummary;
          
          // Return the unified validation response as structured JSON
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(validationResponse, null, 2)
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

  // Normalize paths by removing array indices and wildcards
  function normalizePath(path) {
    return path
      .replace(/\[\d+\]/g, '')           // Remove array indices: "foo[0]" -> "foo"
      .replace(/\["[^"]+"\]/g, '')        // Remove bracket notation: '["key"]' -> ''
      .replace(/\.\*[^.]*/g, '')          // Remove wildcard segments: ".customer-*" -> ""
      .replace(/\.$/, '');                // Remove trailing dots
  }

  // Extract all paths from a YAML object
  function extractPathsFromYaml(obj, prefix = '') {
    const paths = new Set(); // Use Set to avoid duplicates
    
    function traverse(current, currentPath) {
      if (!current || typeof current !== 'object') {
        return;
      }
      
      // Add the current path
      if (currentPath) {
        paths.add(currentPath);
        // Also add normalized version for matching
        const normalized = normalizePath(currentPath);
        if (normalized !== currentPath) {
          paths.add(normalized);
        }
      }
      
      if (Array.isArray(current)) {
        // For arrays, add both the array path and indexed paths
        current.forEach((item, index) => {
          const indexPath = `${currentPath}[${index}]`;
          paths.add(indexPath);
          if (item && typeof item === 'object') {
            traverse(item, indexPath);
          }
        });
        // Also add the non-indexed path for array matching
        paths.add(currentPath);
      } else {
        Object.keys(current).forEach(key => {
          const newPath = currentPath ? `${currentPath}.${key}` : key;
          
          if (current[key] && typeof current[key] === 'object') {
            traverse(current[key], newPath);
          } else {
            // Add leaf paths
            paths.add(newPath);
          }
        });
      }
    }
    
    traverse(obj, prefix);
    return Array.from(paths);
  }

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
    const info = [];
    
    // Define known enum values for deterministic validation
    const VALID_ENUMS = {
      podSecurityStandard: ['privileged', 'baseline', 'restricted'],
      priority: ['low', 'medium', 'high', 'critical'],
      serviceMesh: ['istio', 'linkerd', 'cilium'],
      ingressController: ['nginx', 'traefik', 'haproxy', 'istio']
    };
    
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
          
          // Check for boolean fields
          if (key === 'enabled' && value !== undefined) {
            if (typeof value !== 'boolean') {
              // Special check for common mistakes
              if (value === 'auto' || value === 'true' || value === 'false' || value === 'yes' || value === 'no') {
                errors.push(`Field '${currentPath}' must be boolean, got string "${value}". Use true/false without quotes.`);
              } else {
                errors.push(`Field '${currentPath}' must be boolean, got ${typeof value}: ${JSON.stringify(value)}`);
              }
            }
          }
          
          // Check for pro field specifically (common error from testing)
          if (key === 'pro' && value !== undefined && typeof value !== 'boolean') {
            errors.push(`Field '${currentPath}' must be boolean, got ${typeof value}. The 'pro' field enables/disables pro features.`);
          }
          
          // Recurse into nested objects
          if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            checkBooleanFields(value, currentPath);
          }
        }
      }
    }
    checkBooleanFields(config);
    
    // RULE 8: Enum validation for known fields
    function checkEnumValues(obj, path = '') {
      if (obj && typeof obj === 'object') {
        for (const [key, value] of Object.entries(obj)) {
          const currentPath = path ? `${path}.${key}` : key;
          
          // Check if this key has known valid values
          if (VALID_ENUMS[key] && value !== undefined && value !== null) {
            if (!VALID_ENUMS[key].includes(value)) {
              errors.push(`Invalid value for '${currentPath}': "${value}". Must be one of: ${VALID_ENUMS[key].join(', ')}`);
            }
          }
          
          // Check policies.podSecurityStandard specifically
          if (currentPath === 'policies.podSecurityStandard' && value !== undefined) {
            if (!VALID_ENUMS.podSecurityStandard.includes(value)) {
              errors.push(`Invalid podSecurityStandard: "${value}". Must be one of: ${VALID_ENUMS.podSecurityStandard.join(', ')}`);
            }
          }
          
          // Recurse into nested objects
          if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            checkEnumValues(value, currentPath);
          }
        }
      }
    }
    checkEnumValues(config);
    
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
    
    // RULE 9: HA recommendations (warnings, not errors)
    const etcdReplicas = config.controlPlane?.backingStore?.etcd?.deploy?.statefulSet?.highAvailability?.replicas;
    if (etcdReplicas !== undefined) {
      if (etcdReplicas > 1 && etcdReplicas < 3) {
        warnings.push(`etcd has ${etcdReplicas} replicas. For true HA, use at least 3 replicas.`);
      } else if (etcdReplicas > 1 && etcdReplicas % 2 === 0) {
        warnings.push(`etcd has ${etcdReplicas} replicas (even number). Odd numbers (3, 5, 7) are recommended for consensus.`);
      }
    }
    
    // RULE 10: Check for deprecated or suboptimal configurations
    if (config.controlPlane?.distro?.k3s?.image) {
      info.push('Consider using controlPlane.distro.k3s.enabled instead of specifying image directly');
    }
    
    return {
      valid: errors.length === 0,
      errors: errors,
      warnings: warnings,
      info: info
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
  
  // Generate configuration summary as structured data
  function generateConfigSummary(config) {
    const summary = {
      distro: null,
      storage: null,
      syncToHost: [],
      syncFromHost: [],
      namespaces: {
        mappings: 0,
        strictMode: false
      },
      networking: {},
      highAvailability: false
    };
    
    // Distro
    if (config.controlPlane?.distro) {
      const enabled = Object.keys(config.controlPlane.distro)
        .find(key => config.controlPlane.distro[key]?.enabled);
      summary.distro = enabled || 'default';
    }
    
    // Backing store
    if (config.controlPlane?.backingStore) {
      if (config.controlPlane.backingStore.database?.embedded?.enabled) {
        summary.storage = { type: 'database', mode: 'embedded', details: 'SQLite' };
      } else if (config.controlPlane.backingStore.database?.external?.enabled) {
        summary.storage = { type: 'database', mode: 'external' };
      } else if (config.controlPlane.backingStore.etcd?.deploy?.enabled) {
        const replicas = config.controlPlane.backingStore.etcd.deploy.statefulSet?.highAvailability?.replicas || 1;
        summary.storage = { type: 'etcd', mode: 'deployed', replicas: replicas };
        summary.highAvailability = replicas >= 3;
      } else if (config.controlPlane.backingStore.etcd?.embedded?.enabled) {
        summary.storage = { type: 'etcd', mode: 'embedded' };
      } else if (config.controlPlane.backingStore.etcd?.external?.enabled) {
        summary.storage = { type: 'etcd', mode: 'external' };
      }
    }
    
    // Sync configuration
    if (config.sync?.toHost) {
      summary.syncToHost = Object.keys(config.sync.toHost)
        .filter(key => config.sync.toHost[key]?.enabled);
    }
    
    if (config.sync?.fromHost) {
      summary.syncFromHost = Object.keys(config.sync.fromHost)
        .filter(key => config.sync.fromHost[key]?.enabled || config.sync.fromHost[key]?.enabled === 'auto');
    }
    
    // Namespace mappings
    if (config.sync?.toHost?.namespaces?.mappings?.byName) {
      summary.namespaces.mappings = Object.keys(config.sync.toHost.namespaces.mappings.byName).length;
      summary.namespaces.strictMode = config.sync.toHost.namespaces.mappingsOnly || false;
    }
    
    // Networking
    if (config.networking?.advanced) {
      summary.networking = {
        serviceCIDR: config.networking.advanced.serviceCIDR,
        podCIDR: config.networking.advanced.podCIDR,
        clusterDomain: config.networking.advanced.clusterDomain
      };
    }
    
    return summary;
  }

  return server;
}