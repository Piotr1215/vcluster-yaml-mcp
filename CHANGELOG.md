# Changelog

## [1.3.2] - 2026-02-01

### Fixed
- `get-changelog` fetches from GitHub instead of local file
- CI: verify version exists in CHANGELOG before release

## [1.3.1] - 2026-02-01

### Added
- `get-server-info` tool (workaround for clients without resource support)
- `get-changelog` tool (workaround for clients without resource support)

### Fixed
- MCP instructions now reference tools instead of resources

## [1.3.0] - 2026-02-01

### Added
- `server://info` MCP resource (version, description, available tools)
- `server://changelog` MCP resource (reads CHANGELOG.md)
- CHANGELOG.md for release history

## [1.2.4] - 2026-02-01

### Added
- `/ready` endpoint for Kubernetes readiness probes

### Fixed
- Convert inputSchema from JSON Schema to Zod schemas
- CI: run tests before publishing
- CI: npm OIDC trusted publishing with sigstore provenance

## [1.2.0] - 2026-02-01

### Changed
- Migrate from deprecated `Server` to `McpServer` API

## [1.1.0] - 2026-01-10

### Changed
- Update MCP SDK to ^1.25.2

## [1.0.0] - 2025-12-01

### Added
- Initial release
- `smart-query` tool for natural language configuration search
- `list-versions` tool to discover available vCluster versions
- `create-vcluster-config` tool for generating validated configs
- `validate-config` tool for validating existing YAML
- `extract-validation-rules` tool for semantic constraints
