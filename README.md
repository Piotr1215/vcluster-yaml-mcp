# vCluster YAML MCP Server

An MCP (Model Context Protocol) server for querying vCluster YAML configuration files using jq expressions.

## Features

- List available vCluster configuration files
- Query YAML configs using jq expressions
- Get specific values using dot notation
- Search for keys and values
- Validate configurations against schema

## Installation

```bash
npm install
```

## Usage

```bash
# Start with default config path
npm start

# Or specify custom config path
node src/index.js /path/to/vcluster/configs
```

## Available Tools

### list-configs
Lists all available YAML configuration files in the config directory.

### query-config
Query vCluster YAML configuration using jq expressions.

Example:
```json
{
  "file": "vcluster.yaml",
  "query": ".controlPlane.distro"
}
```

### get-config-value
Get a specific value using dot notation.

Example:
```json
{
  "file": "vcluster.yaml",
  "path": "controlPlane.distro"
}
```

### search-config
Search for keys or values in the configuration.

Example:
```json
{
  "file": "vcluster.yaml",
  "search": "service",
  "keysOnly": false
}
```

### validate-config
Validate a configuration file against the vcluster schema.

Example:
```json
{
  "file": "vcluster.yaml"
}
```

## MCP Configuration

Add to your MCP settings:

```json
{
  "mcpServers": {
    "vcluster-yaml": {
      "command": "node",
      "args": ["/path/to/vcluster-yaml-mcp-server/src/index.js", "/path/to/configs"]
    }
  }
}
```