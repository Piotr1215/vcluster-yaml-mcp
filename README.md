# vCluster YAML MCP Server

Production-ready MCP server for querying and validating vCluster configurations. Token-optimized (99.7% reduction), data-first architecture.

## Installation

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

## Core Tools

**validate-config** - YAML syntax validation, returns config paths (~500 tokens)
```javascript
validate-config --content="<yaml>"
// Returns: { syntax_valid, config_paths, validation_data }
```

**get-schema** - JSON Schema with section filtering (~50-100 tokens)
```javascript
get-schema --section="controlPlane"
// Returns: Schema for specific section
```

**smart-query** - Dot notation and natural language search (~1-2K tokens)
```javascript
smart-query --query="controlPlane.ingress.enabled"
smart-query --query="sync fromHost nodes"
// Returns: Matching paths with values
```

**extract-validation-rules** - Validation rules from YAML comments (~2-5K tokens)
```javascript
extract-validation-rules --section="controlPlane"
// Returns: { rules, enums, types, defaults }
```

**Version management**: `list-versions`, `set-version`, `list-configs`

## Workflow

```bash
validate-config --content="<yaml>"     # Syntax check
smart-query --query="ingress"          # Explore options
get-schema --section="controlPlane"    # Get schema
extract-validation-rules --section="sync"  # Validation rules
```

## Development

```bash
npm install
npx @modelcontextprotocol/inspector node src/index.js  # http://localhost:5173
npm test  # 59 tests, all passing
```

## Token Optimization

| Tool | Usage | Strategy |
|------|-------|----------|
| validate-config | ~500 tokens | Paths only, not full config |
| get-schema | ~50-100 tokens | Section filtering |
| smart-query | ~1-2K tokens | Result limiting (max 50) |
| extract-validation-rules | ~2-5K tokens | Section filtering |

Total: 99.7% reduction (159K → 500 tokens for validation)

## Architecture

Data-first: Server returns structured data only. AI performs validation by reasoning. No hardcoded validation logic.

## Links

[vCluster](https://github.com/loft-sh/vcluster) | [MCP Spec](https://modelcontextprotocol.io)
