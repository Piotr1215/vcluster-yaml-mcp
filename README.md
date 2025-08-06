# vCluster YAML MCP Server

MCP server for querying vcluster YAML configurations with smart natural language search and jq expressions.

## Features

- **Smart Query**: Natural language search without requiring YAML files
- **Flexible Input**: Work with files or direct YAML content  
- **JQ Support**: Advanced queries using jq expressions
- **Validation**: Validate configurations against vcluster schema
- **Search**: Find specific keys or values in configurations

## Installation

```bash
npm install
```

## Configuration

### Option 1: Use with Claude Desktop

Add to your Claude Desktop configuration (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "vcluster-yaml": {
      "command": "node",
      "args": [
        "/path/to/vcluster-yaml-mcp-server/src/index.js",
        "/path/to/your/vcluster/configs"
      ]
    }
  }
}
```

### Option 2: Default Configuration

The server defaults to using the `test-config` directory in the project. Place your vcluster YAML files there.

### Option 3: Direct Content

All tools support direct YAML content without needing files:

```yaml
# You can pass YAML directly to the tools
controlPlane:
  distro: k3s
```

## Tools

### 1. smart-query
Natural language search for vcluster configuration. No YAML needed!
- Examples: "etcd", "what is the service CIDR", "networking settings"
- Automatically searches default vcluster.yaml or finds available configs

### 2. query-config
Query using jq expressions
- Supports both file and direct content input
- Example: `.controlPlane.distro`, `.networking.serviceCIDR`

### 3. get-config-value
Get specific values using dot notation
- Example path: `controlPlane.distro`, `networking.serviceCIDR`

### 4. validate-config
Validate configuration against vcluster schema
- Works with files or direct YAML content

### 5. search-config
Search for keys or values in configuration
- Option to search only keys with `keysOnly: true`

### 6. list-configs
List all available YAML files in configured directory

## Usage Examples

### With Files

```json
{
  "tool": "smart-query",
  "arguments": {
    "query": "what is the networking configuration"
  }
}
```

### With Direct Content

```json
{
  "tool": "validate-config",
  "arguments": {
    "content": "controlPlane:\n  distro: k3s\nnetworking:\n  serviceCIDR: 10.96.0.0/12"
  }
}
```

### Query with JQ

```json
{
  "tool": "query-config",
  "arguments": {
    "file": "vcluster.yaml",
    "query": ".controlPlane | keys"
  }
}
```

## Testing

```bash
npm test                # Run tests
npm run test:coverage   # Run with coverage (93%+ coverage!)
npm run test:watch      # Run tests in watch mode
```

## Directory Structure

```
vcluster-yaml-mcp-server/
├── src/
│   ├── index.js        # Entry point
│   └── server.js       # Main server implementation
├── test-config/        # Default config directory
│   ├── vcluster.yaml   # Sample vcluster configuration
│   └── vcluster.schema.json  # Schema for validation
├── tests/              # Comprehensive test suite
│   ├── server.test.js
│   ├── tools.test.js
│   └── smart-query.test.js
└── package.json
```

## Troubleshooting

If you see "No vcluster configuration files found":

1. **Create the config directory**: The server looks for YAML files in the configured directory
2. **Add vcluster YAML files**: Place your `vcluster.yaml` files in the directory  
3. **Use direct content**: Pass YAML content directly to tools without needing files
4. **Check the path**: Ensure the MCP configuration points to the correct directory

## Example vCluster Configuration

```yaml
controlPlane:
  distro: k3s
  backingStore:
    etcd:
      embedded:
        enabled: true

networking:
  serviceCIDR: 10.96.0.0/12
  podCIDR: 10.244.0.0/16

storage:
  persistence: true
  size: 10Gi
```