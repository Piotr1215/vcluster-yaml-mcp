/**
 * Shared TypeScript type definitions for vcluster-yaml-mcp-server
 */

// Type definitions for vcluster-yaml-mcp-server

// ============================================================================
// MCP Response Types
// ============================================================================

export interface TextContent {
  type: 'text';
  text: string;
}

export interface McpToolResponse {
  [key: string]: unknown;
  content: TextContent[];
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
}

// ============================================================================
// Tool Handler Types
// ============================================================================

export interface ToolHandlerArgs {
  [key: string]: unknown;
}

export type ToolHandler<T extends ToolHandlerArgs = ToolHandlerArgs> = (
  args: T,
  githubClient: GitHubClientInterface
) => Promise<McpToolResponse>;

// ============================================================================
// GitHub Client Types
// ============================================================================

export interface CacheItem<T> {
  data: T;
  timestamp: number;
}

export interface GitHubClientInterface {
  getTags(): Promise<string[]>;
  getBranches(): Promise<string[]>;
  getFileContent(path: string, ref?: string): Promise<string>;
  getYamlContent(path: string, ref?: string | null): Promise<unknown>;
  getVClusterConfigs(ref?: string | null): Promise<Record<string, unknown>>;
  clearCache(): void;
}

// ============================================================================
// Validation Types
// ============================================================================

export interface ValidationError {
  path: string;
  message: string;
  keyword: string;
  params: Record<string, unknown>;
  context: string;
}

export interface ValidationResult {
  valid: boolean;
  syntax_valid?: boolean;
  syntax_error?: string;
  section?: string | null;
  version?: string;
  elapsed_ms: number;
  errors?: ValidationError[];
  summary?: string;
  error?: string;
  hint?: string;
  snippet_keys?: string[];
  available_sections?: string[];
  size_bytes?: number;
  max_size_bytes?: number;
  details?: string;
}

export interface ValidatorCacheStats {
  size: number;
  maxSize: number;
  version: string | null;
}

// ============================================================================
// Query/Search Types
// ============================================================================

export interface YamlInfoItem {
  path: string;
  key: string;
  value: unknown;
  isLeaf: boolean;
}

export interface QueryOptions {
  query: string;
  file?: string;
  version?: string;
}

export interface CreateConfigOptions {
  yaml_content: string;
  description?: string;
  version?: string;
}

export interface ValidateConfigOptions {
  file?: string;
  content?: string;
  version?: string;
}

export interface ExtractRulesOptions {
  file?: string;
  section?: string;
  version?: string;
}

// ============================================================================
// Validation Rules Types
// ============================================================================

export interface ValidationRule {
  path: string;
  instructions: string[];
  originalComments?: string[];
}

export interface ExtractedValidationRules {
  summary: string;
  rules: ValidationRule[];
  enums: Record<string, string[]>;
  dependencies: string[];
  defaults: Record<string, string>;
  instructions: string;
}

// ============================================================================
// Server Info Types
// ============================================================================

export interface ToolInfo {
  name: string;
  description: string;
}

export interface BuildInfo {
  gitSha: string;
  buildDate: string;
  imageVersion: string;
}

export interface RuntimeInfo {
  nodeVersion: string;
  platform: string;
  arch: string;
}

export interface ServerInfo {
  name: string;
  description: string;
  version: string;
  repository: string;
  documentation: string;
  license: string;
  build: BuildInfo;
  runtime: RuntimeInfo;
  availableTools: ToolInfo[];
}

export interface HealthInfo {
  status: 'ok' | 'error';
  name: string;
  version: string;
  image: {
    version: string;
    gitSha: string;
    buildDate: string;
  };
  timestamp: string;
}

export interface ReadinessCheck {
  ready: boolean;
  reason?: string;
  toolCount?: number;
  latencyMs: number;
}

export interface ChangelogInfo {
  version: string;
  content: string;
}

// ============================================================================
// CLI Types
// ============================================================================

export interface CliQueryOptions {
  file: string;
  version: string;
}

export interface CliValidateOptions {
  version: string;
}

export interface CliResult {
  success: boolean;
  error?: string;
  data?: unknown;
  valid?: boolean;
  results?: unknown[];
  versions?: string[];
  elapsed_ms?: number;
  metadata?: Record<string, unknown>;
  errors?: Array<{ path: string; message: string; type: string }>;
}

export type OutputFormat = 'json' | 'yaml' | 'table';
export type CommandType = 'query' | 'list-versions' | 'validate';
