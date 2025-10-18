# Release Process

This project uses automated CI/CD workflows for releases to npm, Docker Hub, and GitHub Releases.

## Prerequisites

Before releasing, ensure:
- All tests pass: `npm test`
- Workflows are valid: `npm run lint:workflows` (requires [actionlint](https://github.com/rhysd/actionlint))
- Version is bumped in `package.json`
- Changes are committed and pushed

## Triggering a Release

### Option 1: GitHub UI
1. Go to **Actions** tab
2. Select **Release** workflow
3. Click **Run workflow**
4. Enter version (e.g., `1.0.0`)
5. Set `dry_run`:
   - `true` - Test build without publishing (safe, default)
   - `false` - Actual release (publishes to npm, Docker Hub, GitHub)

### Option 2: GitHub CLI
```bash
# Test release (dry-run) - safe to run anytime
gh workflow run release.yml \
  -f version=1.0.0 \
  -f dry_run=true

# Actual release - publishes artifacts
gh workflow run release.yml \
  -f version=1.0.0 \
  -f dry_run=false
```

## What Gets Released

The workflow builds and publishes to three targets in parallel:

1. **npm Package**: `vcluster-yaml-mcp-server@{version}`
   - Published to: https://www.npmjs.com/package/vcluster-yaml-mcp-server
   - Install: `npm install -g vcluster-yaml-mcp-server`

2. **Docker Image**: `piotrzan/vcluster-yaml-mcp-server:{version}`
   - Published to: https://hub.docker.com/r/piotrzan/vcluster-yaml-mcp-server
   - Tags: `{version}`, `latest`
   - Pull: `docker pull piotrzan/vcluster-yaml-mcp-server:1.0.0`

3. **GitHub Release**: `v{version}`
   - Created as draft release
   - Includes: npm package (`.tgz`), Docker image (`.tar`)
   - Manually publish draft after review

## Dry-Run Mode

Use `dry_run=true` to test the release process:
- Builds npm package (but doesn't publish)
- Builds Docker image (but doesn't push)
- Uploads artifacts to GitHub Actions
- **Does NOT** create GitHub Release
- **Does NOT** publish to npm or Docker Hub

**When to use dry-run:**
- Testing workflow changes
- Verifying build succeeds
- Validating artifact creation
- CI/CD troubleshooting

## Post-Release Steps

After a successful release (`dry_run=false`):

1. **Verify npm publish:**
   ```bash
   npm view vcluster-yaml-mcp-server@1.0.0
   ```

2. **Verify Docker image:**
   ```bash
   docker pull piotrzan/vcluster-yaml-mcp-server:1.0.0
   docker inspect piotrzan/vcluster-yaml-mcp-server:1.0.0
   ```

3. **Publish GitHub Release:**
   - Go to [Releases](https://github.com/Piotr1215/vcluster-yaml-mcp-server/releases)
   - Find draft release `v{version}`
   - Edit release notes (add changelog, breaking changes)
   - Click **Publish release**

## Secrets Configuration

The release workflow requires these GitHub secrets:

| Secret | Purpose | How to Get |
|--------|---------|------------|
| `NPM_TOKEN` | npm publish authentication | Create at https://www.npmjs.com/settings/tokens |
| `DOCKER_USERNAME` | Docker Hub login | Your Docker Hub username |
| `DOCKER_PASSWORD` | Docker Hub login | Docker Hub access token |
| `GITHUB_TOKEN` | GitHub Release creation | Automatically provided by GitHub Actions |

Configure secrets at: Repository Settings → Secrets and variables → Actions

## Troubleshooting

**Workflow validation fails:**
```bash
npm run lint:workflows
# Install actionlint if needed: https://github.com/rhysd/actionlint#installation
```

**Build fails:**
```bash
# Run tests locally first
npm test

# Check CI-specific tests
npm run test:ci
```

**Version mismatch errors:**
- Ensure `package.json` version matches workflow input version
- Run version consistency tests: `npm run test:ci`

**Docker build fails:**
```bash
# Test Docker build locally
npm run docker:build
```

## Release Timeline

Typical release duration: **5-6 minutes**
- npm build + test: 2-3 min
- Docker build: 3-5 min
- GitHub Release: 30 sec
- (Runs in parallel via matrix strategy)
