#!/usr/bin/env bash
set -eo pipefail

# Extract version from different artifact types
# Usage: extract-version.sh <type> <file|tag>
# Types: npm (package.json), docker (image tag), github (git tag)

extract_npm_version() {
  local package_json="$1"
  node -p "require('$package_json').version"
}

extract_docker_tag() {
  local image_name="$1"
  # Extract version from Docker tag (e.g., name:1.2.3 -> 1.2.3)
  echo "$image_name" | grep -oP ':\K[0-9]+\.[0-9]+\.[0-9]+'
}

extract_github_tag() {
  local tag="$1"
  # Extract version from git tag (e.g., v1.2.3 -> 1.2.3)
  echo "$tag" | sed 's/^v//'
}

type="${1:-}"
file="${2:-}"

case "$type" in
  npm)
    extract_npm_version "$file"
    ;;
  docker)
    extract_docker_tag "$file"
    ;;
  github)
    extract_github_tag "$file"
    ;;
  *)
    echo "Usage: $0 {npm|docker|github} <file|tag>" >&2
    exit 1
    ;;
esac
