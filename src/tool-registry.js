/**
 * Tool Registry (Strategy Pattern)
 * Maps tool names to handler functions
 * Complexity: 1 (just a lookup, no conditionals)
 */

import {
  handleCreateConfig,
  handleListVersions,
  handleSmartQuery,
  handleExtractRules,
  handleValidateConfig,
  buildErrorResponse
} from './tool-handlers.js';

/**
 * Tool registry - Strategy pattern instead of switch statement
 * Pure object mapping: tool name → handler function
 */
export const toolHandlers = {
  'create-vcluster-config': handleCreateConfig,
  'list-versions': handleListVersions,
  'smart-query': handleSmartQuery,
  'extract-validation-rules': handleExtractRules,
  'validate-config': handleValidateConfig
};

/**
 * Execute tool handler
 * Complexity: 2 (single if statement)
 * Pure function except for handler execution
 */
export async function executeToolHandler(toolName, args, githubClient) {
  const handler = toolHandlers[toolName];

  if (!handler) {
    return buildErrorResponse(`Unknown tool: ${toolName}`);
  }

  try {
    return await handler(args, githubClient);
  } catch (error) {
    return buildErrorResponse(`Error executing ${toolName}: ${error.message}`);
  }
}
