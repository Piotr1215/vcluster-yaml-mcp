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
          description: 'FAST VALIDATION: Checks YAML syntax and returns config paths. Use extract-validation-rules with section parameter for detailed validation rules. Optimized for token limits (<5K tokens).',
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
        },
        {
          name: 'get-schema',
          description: 'DATA ACCESS: Returns JSON Schema for vCluster. Use section parameter to avoid token limits! Examples: section="controlPlane", section="sync", section="networking". Without section, returns minified full schema.',
          inputSchema: {
            type: 'object',
            properties: {
              section: {
                type: 'string',
                description: 'Specific section path (e.g., "controlPlane", "sync.toHost", "networking") to reduce response size'
              },
              path: {
                type: 'string',
                description: 'Specific field path (e.g., "controlPlane.distro.k3s.enabled") for targeted schema'
              }
            },
            required: []
          }
        },
        {
          name: 'get-config-metadata',
          description: 'DATA ACCESS: Returns complete configuration metadata including field tree structure, YAML comments, default values, and comment patterns. Use this to understand the full context of configuration options and infer validation rules from comment metadata.',
          inputSchema: {
            type: 'object',
            properties: {
              file: {
                type: 'string',
                description: 'File path in GitHub repo (default: "chart/values.yaml")',
                default: 'chart/values.yaml'
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
                  text: `No matches found for "${args.query}" in ${fileName}.\n\n` +
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
                text: `Found ${results.length} result(s) for "${args.query}" in ${fileName} (${currentRef}):\n\n` +
                      limitedResults.join('\n') +
                      (hasMore ? `\n\n... and ${results.length - maxResults} more results (limited to ${maxResults})` : '')
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

        case 'get-schema': {
          try {
            const schemaContent = await githubClient.getFileContent('chart/values.schema.json', currentRef);
            const fullSchema = JSON.parse(schemaContent);

            // If no section specified, return just the top-level structure to avoid token overflow
            if (!args.section && !args.path) {
              const topLevel = {};
              if (fullSchema.properties) {
                for (const [key, value] of Object.entries(fullSchema.properties)) {
                  topLevel[key] = {
                    type: value.type,
                    description: value.description || '',
                    has_properties: !!value.properties
                  };
                }
              }
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    version: currentRef,
                    source: 'chart/values.schema.json',
                    note: 'Top-level schema only. Use section parameter for detailed schema (e.g., section="controlPlane")',
                    available_sections: Object.keys(fullSchema.properties || {}),
                    top_level_schema: topLevel
                  })
                }]
              };
            }

            // If section or path specified, extract that portion
            const targetPath = args.path || args.section;
            const pathParts = targetPath.split('.');
            let current = fullSchema;

            // Navigate to properties
            if (current.properties) {
              current = current.properties;
            }

            // Traverse path
            for (const part of pathParts) {
              if (current && current[part]) {
                current = current[part];
                if (current.properties) {
                  current = { type: current.type, properties: current.properties, required: current.required, description: current.description };
                }
              } else {
                return {
                  content: [{
                    type: 'text',
                    text: JSON.stringify({
                      version: currentRef,
                      error: `Path "${targetPath}" not found in schema`,
                      available_top_level: Object.keys(fullSchema.properties || {})
                    })
                  }]
                };
              }
            }

            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  version: currentRef,
                  source: 'chart/values.schema.json',
                  path: targetPath,
                  schema: current
                })
              }]
            };
          } catch (error) {
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  version: currentRef,
                  error: `Schema not available: ${error.message}`
                })
              }]
            };
          }
        }

        case 'get-config-metadata': {
          const fileName = args.file || 'chart/values.yaml';

          try {
            const content = await githubClient.getFileContent(fileName, currentRef);
            const metadata = extractConfigMetadata(content);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    version: currentRef,
                    source: fileName,
                    ...metadata
                  }, null, 2)
                }
              ]
            };
          } catch (error) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    version: currentRef,
                    source: fileName,
                    error: `Could not load metadata: ${error.message}`
                  }, null, 2)
                }
              ]
            };
          }
        }

        case 'validate-config': {
          let yamlData;

          try {
            if (args.content) {
              yamlData = yaml.load(args.content);
            } else if (args.file) {
              yamlData = await githubClient.getYamlContent(args.file, currentRef);
            } else {
              yamlData = await githubClient.getYamlContent('chart/values.yaml', currentRef);
            }
          } catch (yamlError) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    syntax_valid: false,
                    syntax_error: yamlError.message,
                    instructions: 'Fix YAML syntax before validation can proceed'
                  }, null, 2)
                }
              ]
            };
          }

          // Extract user's config paths (what they're trying to configure)
          function extractUserPaths(obj, path = '') {
            const paths = [];
            if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
              for (const [key, value] of Object.entries(obj)) {
                const currentPath = path ? `${path}.${key}` : key;
                paths.push(currentPath);
                if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                  paths.push(...extractUserPaths(value, currentPath));
                }
              }
            }
            return paths;
          }

          const userPaths = extractUserPaths(yamlData);

          const response = {
            syntax_valid: true,
            version: currentRef,
            config_paths: userPaths,
            validation_data: {
              schema_rules: null,
              field_rules: null
            },
            instructions: 'Use extract-validation-rules for detailed validation. This response is optimized to stay under token limits.'
          };

          // Try to get relevant validation rules for user's paths
          try {
            const valuesContent = await githubClient.getFileContent('chart/values.yaml', currentRef);

            // Extract section-specific rules based on user's config
            const topLevelSections = [...new Set(userPaths.map(p => p.split('.')[0]))];
            const relevantRules = {};

            for (const section of topLevelSections.slice(0, 3)) {  // Limit to 3 sections
              const rules = extractValidationRulesFromComments(valuesContent, section);
              if (rules.rules.length > 0) {
                relevantRules[section] = {
                  rule_count: rules.rules.length,
                  enums: rules.enums,
                  hint: `Use extract-validation-rules with section="${section}" for details`
                };
              }
            }

            response.validation_data.field_rules = relevantRules;
          } catch (error) {
            response.validation_data.field_rules = `Error: ${error.message}`;
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(response, null, 2)
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

  // Extract config metadata with comment patterns (NO interpretation)
  function extractConfigMetadata(yamlContent) {
    const lines = yamlContent.split('\n');
    const fields = {};
    const treeStructure = {};

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

        // Parse value type
        let parsedValue = value;
        let inferredType = 'unknown';

        if (value === 'true' || value === 'false') {
          inferredType = 'boolean';
          parsedValue = value === 'true';
        } else if (value === '""' || value === "''") {
          inferredType = 'string';
          parsedValue = '';
        } else if (value && !value.startsWith('{') && !value.startsWith('[')) {
          // Try to infer type from value
          if (/^-?\d+$/.test(value)) {
            inferredType = 'number';
            parsedValue = parseInt(value);
          } else if (/^-?\d+\.\d+$/.test(value)) {
            inferredType = 'number';
            parsedValue = parseFloat(value);
          } else if (value.startsWith('"') || value.startsWith("'")) {
            inferredType = 'string';
            parsedValue = value.slice(1, -1);
          } else if (value !== '') {
            inferredType = 'string';
            parsedValue = value;
          }
        } else if (!value || value === '') {
          inferredType = 'object';
          parsedValue = null;
        }

        // Extract comment patterns (NO interpretation!)
        const commentMetadata = {
          contains_description: false,
          contains_optional: false,
          contains_required: false,
          contains_deprecated: false,
          contains_examples: false,
          keywords: []
        };

        if (currentComments.length > 0) {
          const allComments = currentComments.join(' ').toLowerCase();

          // Pattern detection (deterministic, no inference)
          commentMetadata.contains_optional = /\boptional\b/.test(allComments);
          commentMetadata.contains_required = /\brequired\b/.test(allComments);
          commentMetadata.contains_deprecated = /\bdeprecated\b/.test(allComments);
          commentMetadata.contains_examples = /\bexample[s]?[:\s]/.test(allComments);
          commentMetadata.contains_description = currentComments.length > 0;

          // Extract keywords (simple word extraction, no interpretation)
          const words = allComments.match(/\b[a-z][a-z0-9-]*\b/g) || [];
          const importantWords = new Set();
          words.forEach(word => {
            if (word.length > 3 && !['this', 'that', 'with', 'from', 'have', 'will', 'been', 'what', 'when', 'where', 'which', 'their', 'there'].includes(word)) {
              importantWords.add(word);
            }
          });
          commentMetadata.keywords = Array.from(importantWords).slice(0, 10);
        }

        // Store field metadata
        fields[fullPath] = {
          path: fullPath,
          type: inferredType,
          defaultValue: parsedValue,
          yaml_comments: [...currentComments],
          comment_metadata: commentMetadata
        };

        // Build tree structure
        let treeCursor = treeStructure;
        for (let j = 0; j < currentPath.length - 1; j++) {
          const pathPart = currentPath[j];
          if (!treeCursor[pathPart]) {
            treeCursor[pathPart] = {};
          }
          treeCursor = treeCursor[pathPart];
        }

        if (inferredType === 'object') {
          treeCursor[key] = {};
        } else {
          treeCursor[key] = inferredType;
        }

        currentComments = [];
      }
    }

    return {
      fields: fields,
      tree_structure: treeStructure
    };
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

  return server;
}
