# vCluster YAML MCP Server

Query and validate vCluster configurations from the official [loft-sh/vcluster](https://github.com/loft-sh/vcluster) repository.

## Quick Start

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

## Tools

- **smart-query** - Natural language search (e.g., "networking", "etcd")
- **query-config** - JQ expressions (e.g., `.controlPlane.distro`)
- **get-config-value** - Dot notation paths (e.g., `sync.toHost.namespaces`)
- **search-config** - Find keys/values with pattern matching
- **validate-config** - Comprehensive validation (YAML, schema, semantic rules)
- **list-versions** / **set-version** - Manage vCluster versions
- **list-configs** - Browse available config files

## Example Workflow

```
User: "I need a multi-tenant vCluster with namespace isolation"
AI → smart-query("namespace mappings") → learns structure
AI → generates YAML based on requirements
AI → validate-config(yaml) → ensures correctness
```

## Development

```bash
# Install dependencies
npm install

# Run MCP inspector for development
npx @modelcontextprotocol/inspector node src/index.js

# Run tests
npm test          # 80%+ coverage
```

## Local Development

```bash
# Clone the repository
git clone https://github.com/yourusername/vcluster-yaml-mcp-server.git
cd vcluster-yaml-mcp-server

# Install dependencies
npm install

# Run the MCP development server with inspector
npx @modelcontextprotocol/inspector node src/index.js

# The inspector will open at http://localhost:5173
# You can test all MCP tools interactively
```

## Deployment

### NPM Package
```bash
npm publish
```

### Claude Desktop
Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:
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