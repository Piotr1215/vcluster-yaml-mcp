# vCluster YAML MCP Server

A Model Context Protocol (MCP) server that lets AI assistants query and validate [vCluster](https://github.com/loft-sh/vcluster) YAML configurations directly from GitHub.

## What Does It Do?

This MCP server provides AI assistants with tools to:
- Query vCluster configuration options and schemas
- Validate YAML configurations
- Search for specific settings using natural language
- Query any version with explicit version parameters (stateless)
- Extract validation rules from comments

**Key feature:** No local files needed. All data is fetched live from the vCluster GitHub repository.

## How It Works

The server uses the GitHub API to fetch vCluster YAML configurations, schemas, and documentation directly from the source:

1. **GitHub as Source of Truth**: Queries `github.com/loft-sh/vcluster` repository
2. **Stateless Version Queries**: Every tool accepts an optional `version` parameter (e.g., `v0.19.0`, `main`)
3. **Parallel Version Support**: Query multiple versions simultaneously without state conflicts
4. **Live Data**: Always fetches the latest configuration for the requested version
5. **Smart Caching**: 15-minute in-memory cache to avoid overloading GitHub API

```mermaid
graph LR
    A[Claude/AI] --> B[MCP Server]
    B --> C[GitHub API]
    C --> D[vCluster Repository]
    B --> E[Parse YAML/JSON]
    E --> F[Return Structured Data]
    F --> A
```

## Installation

### Option 1: Local (stdio)

Run the server locally via npx:

```json
{
  "mcpServers": {
    "vcluster-yaml": {
      "command": "npx",
      "args": ["-y", "vcluster-yaml-mcp-server"]
    }
  }
}
```

### Option 2: Remote (HTTP)

Use the public instance (always running latest version):

```json
{
  "mcpServers": {
    "vcluster-yaml": {
      "type": "http",
      "url": "https://vcluster-yaml.cloudrumble.net/mcp"
    }
  }
}
```

## Available Tools

### Version Discovery

**list-versions** - Browse all available vCluster versions
```javascript
// Returns tags (releases) and branches
// Example output: v0.19.0, v0.20.0, main, etc.
```

### Configuration Queries

All query tools accept an optional `version` parameter (defaults to "main"):

**smart-query** - Universal search using dot notation or natural language
```javascript
smart-query --query="controlPlane.ingress.enabled" --version="v0.19.0"
smart-query --query="namespace syncing" --version="main"
smart-query --query="etcd"  // Defaults to "main"
// Returns: Matching configuration paths and their values with version info
```

### Config Creation & Validation

All validation tools accept an optional `version` parameter (defaults to "main"):

**create-vcluster-config** - Create and validate configs in one step (PRIMARY TOOL)
```javascript
// Claude uses this when generating configs for you
// Ensures every generated config is validated before you see it
create-vcluster-config --yaml_content="<generated-yaml>" --description="Node sync config" --version="v0.24.0"

// Returns:
// ✅ Configuration validated successfully!
// Version: v0.24.0
// Section: sync
// Validation time: 45ms
//
// ### Configuration:
// [your YAML here]
```

**validate-config** - Validate existing YAML configs
```javascript
// Validate user-provided configs against specific version
validate-config --content="<your-yaml>" --version="v0.24.0"

// Validate files from GitHub
validate-config --file="chart/values.yaml" --version="main"

// Works with full configs or partial snippets (auto-detects section)
// Returns: { valid: true/false, errors: [...], section: "...", version: "...", elapsed_ms: <100 }
```

**extract-validation-rules** - Get validation rules from YAML comments
```javascript
extract-validation-rules --section="controlPlane" --version="v0.24.0"
// Returns: { rules, enums, dependencies, defaults }
// Extracts constraints like "Valid values: a, b, c"
```

## Usage Examples

### Interactive Config Creation (Primary Workflow)

Ask Claude:
> "Create a vCluster config with node sync enabled and etcd embedded"

Claude will:
1. Use `smart-query` or `extract-validation-rules` to research options
2. Generate the YAML configuration
3. **Automatically** call `create-vcluster-config` to validate
4. Return validated, ready-to-use configuration

**Why this works:** The `create-vcluster-config` tool forces Claude to validate every config it generates. You'll always get validated configs.

### Validate User-Provided Configuration

Ask Claude:
> "Is this ingress configuration valid for vCluster v0.24?"
> ```yaml
> ingress:
>   enabled: true
>   host: "my-vcluster.example.com"
> ```

Claude will:
1. Use `validate-config` with `--version="v0.24.0"` parameter
2. Report any validation errors with specific paths
3. Suggest fixes if needed

### Explore vCluster Options

Ask Claude:
> "What high availability options are available in vCluster v0.19.0?"

Claude will use:
- `smart-query` with `--version="v0.19.0"` to find HA-related settings
- No need to "switch" versions - query directly with version parameter

### Compare Versions

Ask Claude:
> "How did the sync.fromHost configuration change between v0.19.0 and v0.20.0?"

Claude will use:
- `smart-query` with `--version="v0.19.0"` for first version
- `smart-query` with `--version="v0.20.0"` for second version
- Can query both versions in parallel (stateless design)

## Token Optimization

This server is designed for efficient token usage:

| Tool | Tokens | Strategy |
|------|--------|----------|
| create-vcluster-config | ~300-600 | Validation + formatted response with emoji indicators |
| validate-config | ~200-500 | Fast validation (<100ms), precise errors only |
| smart-query | ~1-2K | Limits results to 50 matches |
| extract-validation-rules | ~2-5K | Section-specific filtering, cache for knowledge base |

## Architecture Philosophy

**Data-First, Not Logic-First**

The server returns structured data and lets the AI reason about validation. 
- Adapts automatically when vCluster changes
- Works across versions without updates
- Leverages AI's reasoning vs rigid code
- Reduces maintenance burden

## Development

```bash
# Install dependencies
npm install

# Run locally (stdio)
node src/index.js

# Test with MCP Inspector
npx @modelcontextprotocol/inspector node src/index.js
# Open http://localhost:5173

# Run tests
npm test 

# Run HTTP server locally
npm run start:http
# Server runs on http://localhost:3000
```

## Technical Details

- **SDK**: `@modelcontextprotocol/sdk` v1.20.1 (Streamable HTTP transport)
- **Node**: >=18
- **Transport**: Both stdio (local) and HTTP/SSE (remote)
- **Dependencies**: `js-yaml` for parsing, `node-jq` for querying, `node-fetch` for GitHub API

## Links

- [vCluster GitHub](https://github.com/loft-sh/vcluster)
- [Model Context Protocol](https://modelcontextprotocol.io)
- [MCP Specification](https://spec.modelcontextprotocol.io)

## License

MIT
