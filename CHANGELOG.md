# Changelog

## [1.5.0] - 2026-03-15

### Added
- MCP elicitation support (Claude Code 2.1.76+)
  - `create-vcluster-config`: prompts user to pick version from GitHub tags when omitted
  - `validate-config`: prompts user for YAML content when called without input
  - Clients without elicitation support silently fall back to defaults

### Updated
- @modelcontextprotocol/sdk 1.25.2 -> 1.26.0
- ajv 8.17.1 -> 8.18.0
- hono 4.11.7 -> 4.12.7
- tar 7.5.3 -> 7.5.11
- rollup 4.46.2 -> 4.59.0

### Fixed
- Validation error tests updated for upstream vCluster schema changes

## [1.4.4] - 2026-02-22

### Fixed
- Coverage config now targets `.ts` source files (was `.js` since TypeScript migration)
- Docker image now reports correct version in `get-server-info`
- Release workflow passes `IMAGE_VERSION`, `GIT_SHA`, `BUILD_DATE` build args to Docker

## [1.4.3] - 2026-02-22

### Added
- `mcp_method` and `tool_name` labels on `mcp_requests_total` Prometheus counter
- Console logs now include MCP method and tool name

## [1.4.2] - 2026-02-03

### Added
- Multi-keyword ranking for natural language queries
- Paths matching more keywords surface first in results

## [1.4.1] - 2026-02-03

### Fixed
- Smart-query NLP now handles full sentence queries with stop words
- Changed keyword matching from AND to OR logic for natural language support

## [1.4.0] - 2026-02-03

### Changed
- Migrate entire codebase from JavaScript to TypeScript
- Multi-stage Docker build for TypeScript compilation
- Strict type checking enabled (`strict: true`, `noUncheckedIndexedAccess: true`)

### Fixed
- Test helpers use `--ignore-scripts` for npm pack/install operations

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
