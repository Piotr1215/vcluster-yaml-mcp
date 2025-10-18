# vCluster YAML CLI Documentation

The `vcluster-yaml` CLI provides standalone access to vCluster configuration querying and validation without requiring MCP infrastructure setup.

## Installation

The package provides multiple installation methods to suit different workflows:

### Option 1: Install globally via npm

```bash
npm install -g vcluster-yaml-mcp-server

# After installation, use the vcluster-yaml command
vcluster-yaml query sync --format table
```

### Option 2: Use directly with npx (no installation)

```bash
# Syntax: npx -y <package-name> <binary-name> <command> [options]
npx -y vcluster-yaml-mcp-server vcluster-yaml query sync --format table
```

> **Note:** When using npx, you must specify `vcluster-yaml` after the package name since the package contains multiple binaries.

### Option 3: Install locally in a project

```bash
# Add to your project
npm install vcluster-yaml-mcp-server

# Use via npx within the project
npx vcluster-yaml query sync --format table

# Or access the binary directly
./node_modules/.bin/vcluster-yaml query sync
```

### Option 4: Install from GitHub (latest development version)

```bash
npm install -g github:Piotr1215/vcluster-yaml-mcp-server

# Use the vcluster-yaml command
vcluster-yaml list-versions
```

### Option 5: Run locally from repository (development)

```bash
# Clone the repository
git clone https://github.com/Piotr1215/vcluster-yaml-mcp-server.git
cd vcluster-yaml-mcp-server

# Install dependencies
npm install

# Run CLI directly with node
node src/cli.js query sync --format table
node src/cli.js list-versions
node src/cli.js validate "sync:\n  enabled: true"

# Or link locally to test as if globally installed
npm link
vcluster-yaml query sync --format table
```

## CLI Commands

### Query Configuration

Search for vCluster configuration fields:

```bash
# Search for sync-related configurations
vcluster-yaml query sync

# Search with specific version
vcluster-yaml query "controlPlane" --version v0.24.0

# Search in a specific file
vcluster-yaml query etcd --file chart/values.yaml

# Output as table (default: json)
vcluster-yaml query replicas --format table

# Output as YAML
vcluster-yaml query "high availability" --format yaml
```

**Example Output (JSON):**
```json
{
  "success": true,
  "results": [
    {
      "field": "sync.toHost.pods.enabled",
      "value": true,
      "type": "boolean",
      "path": "sync.toHost.pods.enabled"
    }
  ],
  "metadata": {
    "query": "sync",
    "file": "chart/values.yaml",
    "version": "main",
    "resultCount": 12
  }
}
```

**Example Output (Table):**
```
┌──────────────────────────────┬───────┬─────────┬─────────────┐
│ Field                        │ Value │ Type    │ Description │
├──────────────────────────────┼───────┼─────────┼─────────────┤
│ sync.toHost.pods.enabled     │ true  │ boolean │             │
│ sync.fromHost.nodes.enabled  │ false │ boolean │             │
└──────────────────────────────┴───────┴─────────┴─────────────┘
```

### List Versions

List all available vCluster versions:

```bash
# List all versions (JSON)
vcluster-yaml list-versions

# List as table
vcluster-yaml list-versions --format table

# List as YAML
vcluster-yaml list-versions --format yaml
```

**Example Output (Table):**
```
┌──────────────────┐
│ Version          │
├──────────────────┤
│ main             │
│ v0.24.0          │
│ v0.23.0          │
│ v0.22.0          │
└──────────────────┘
```

### Validate Configuration

Validate vCluster YAML configurations:

```bash
# Validate YAML content
vcluster-yaml validate "sync:\n  toHost:\n    pods:\n      enabled: true"

# Validate with specific version
vcluster-yaml validate "controlPlane:\n  replicas: 3" --version v0.24.0

# Output as table
vcluster-yaml validate "invalid: yaml: [" --format table
```

**Example Output (Valid):**
```json
{
  "success": true,
  "valid": true,
  "errors": [],
  "metadata": {
    "version": "main",
    "contentLength": 47
  }
}
```

**Example Output (Invalid - Table):**
```
✗ Configuration has errors:
┌──────┬──────────────────────────────┬────────┐
│ Path │ Error                        │ Type   │
├──────┼──────────────────────────────┼────────┤
│ root │ YAML syntax error: unclosed  │ syntax │
└──────┴──────────────────────────────┴────────┘
```

## CLI Options

**Global Options:**
- `-f, --format <format>` - Output format: `json`, `yaml`, or `table` (default: `json`)
- `-h, --help` - Show help
- `--version` - Show version number

**Query Options:**
- `--file <file>` - Configuration file to search (default: `chart/values.yaml`)
- `--version <version>` - vCluster version or branch (default: `main`)

**Validate Options:**
- `--version <version>` - vCluster version for schema validation (default: `main`)

## Exit Codes

The CLI follows standard POSIX exit code conventions:
- `0` - Success
- `1` - Execution error (e.g., invalid YAML, validation failure, network error)

## Use Cases

### Quick Configuration Lookup

```bash
# Fast way to check a specific setting without AI
vcluster-yaml query "sync.toHost.pods" --format table
```

### CI/CD Validation

```bash
# Validate vCluster config in CI pipeline
vcluster-yaml validate "$(cat vcluster.yaml)" --version v0.24.0
if [ $? -ne 0 ]; then
  echo "Configuration validation failed"
  exit 1
fi
```

### Version Compatibility Check

```bash
# Check if config works across versions
vcluster-yaml validate "$(cat vcluster.yaml)" --version v0.23.0
vcluster-yaml validate "$(cat vcluster.yaml)" --version v0.24.0
```

### Script Integration

```bash
# Use jq to process JSON output
vcluster-yaml query replicas --format json | jq '.results[].value'
```
