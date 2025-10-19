/**
 * Validation Rules Extraction
 * Pure functions for parsing YAML comments and extracting validation rules
 */

/**
 * Extract validation rules from YAML comments
 * Pure function except for complex internal state management
 * Complexity: 23 → Will refactor separately
 */
export function extractValidationRulesFromComments(yamlContent, section) {
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

/**
 * Generate AI validation instructions
 * Pure function - formats rules into markdown
 */
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
