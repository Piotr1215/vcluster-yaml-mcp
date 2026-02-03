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
import type { McpToolResponse, GitHubClientInterface } from './types/index.js';

// Base handler type for the registry - uses 'any' for args since each handler
// has its own specific argument type. Type safety is enforced at the handler level.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ToolHandler = (args: any, githubClient: GitHubClientInterface) => Promise<McpToolResponse>;

/**
 * Tool registry - Strategy pattern instead of switch statement
 * Pure object mapping: tool name → handler function
 */
export const toolHandlers: Record<string, ToolHandler> = {
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
export async function executeToolHandler(
  toolName: string,
  args: Record<string, unknown>,
  githubClient: GitHubClientInterface
): Promise<McpToolResponse> {
  const handler = toolHandlers[toolName];

  if (!handler) {
    return buildErrorResponse(`Unknown tool: ${toolName}`);
  }

  try {
    return await handler(args, githubClient);
  } catch (error) {
    return buildErrorResponse(`Error executing ${toolName}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
