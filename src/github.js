import fetch from 'node-fetch';
import yaml from 'js-yaml';

const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com';
const REPO_OWNER = 'loft-sh';
const REPO_NAME = 'vcluster';

// Cache for fetched content (15 minute TTL)
const cache = new Map();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

// Fetch timeout configuration
const FETCH_TIMEOUT_MS = 30000; // 30 seconds - generous for large files

// Helper to create fetch with timeout
function createFetchWithTimeout(timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timeoutId)
  };
}

class GitHubClient {
  constructor() {
    this.defaultBranch = 'main';
  }

  // Get list of available tags (versions)
  async getTags() {
    const cacheKey = 'tags';
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    const { signal, cleanup } = createFetchWithTimeout();

    try {
      const response = await fetch(`${GITHUB_API_BASE}/repos/${REPO_OWNER}/${REPO_NAME}/tags`, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'vcluster-yaml-mcp-server'
        },
        signal
      });

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.statusText}`);
      }

      const tags = await response.json();
      const tagNames = tags.map(tag => tag.name);

      this.setCache(cacheKey, tagNames);
      return tagNames;
    } catch (error) {
      if (error.name === 'AbortError') {
        console.error('Request timeout: fetching tags took longer than 30s');
        return [];
      }
      console.error('Error fetching tags:', error);
      return [];
    } finally {
      cleanup();
    }
  }

  // Get list of branches
  async getBranches() {
    const cacheKey = 'branches';
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    const { signal, cleanup } = createFetchWithTimeout();

    try {
      const response = await fetch(`${GITHUB_API_BASE}/repos/${REPO_OWNER}/${REPO_NAME}/branches`, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'vcluster-yaml-mcp-server'
        },
        signal
      });

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.statusText}`);
      }

      const branches = await response.json();
      const branchNames = branches.map(branch => branch.name);

      this.setCache(cacheKey, branchNames);
      return branchNames;
    } catch (error) {
      if (error.name === 'AbortError') {
        console.error('Request timeout: fetching branches took longer than 30s');
        return ['main'];
      }
      console.error('Error fetching branches:', error);
      return ['main'];
    } finally {
      cleanup();
    }
  }

  // Get file content from GitHub
  async getFileContent(path, ref = 'main') {
    // Validate path - prevent path traversal
    if (path.includes('..') || path.startsWith('/')) {
      throw new Error('Invalid path: path traversal not allowed');
    }

    // Validate ref format (branch, tag, or commit SHA)
    if (!/^[\w.\/-]+$/.test(ref)) {
      throw new Error('Invalid ref format');
    }

    const actualRef = ref;
    const cacheKey = `file:${actualRef}:${path}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    const { signal, cleanup } = createFetchWithTimeout();

    try {
      const url = `${GITHUB_RAW_BASE}/${REPO_OWNER}/${REPO_NAME}/${actualRef}/${path}`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'vcluster-yaml-mcp-server'
        },
        signal
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`File not found: ${path} (ref: ${actualRef})`);
        }
        throw new Error(`GitHub error: ${response.statusText}`);
      }

      const content = await response.text();
      this.setCache(cacheKey, content);
      return content;
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error(`Timeout: fetching ${path} took longer than 30s`);
      }
      throw new Error(`Failed to fetch ${path}: ${error.message}`);
    } finally {
      cleanup();
    }
  }

  // Get parsed YAML content
  async getYamlContent(path, ref = null) {
    const content = await this.getFileContent(path, ref);
    try {
      return yaml.load(content);
    } catch (error) {
      throw new Error(`Failed to parse YAML from ${path}: ${error.message}`);
    }
  }

  // Get vcluster configuration files
  async getVClusterConfigs(ref = null) {
    const configs = {};
    
    // Known vcluster config files
    const configPaths = [
      'chart/values.yaml',
      'chart/values.schema.json',
      'config/values.yaml',
      'values.schema.json'
    ];

    for (const path of configPaths) {
      try {
        if (path.endsWith('.yaml') || path.endsWith('.yml')) {
          configs[path] = await this.getYamlContent(path, ref);
        } else if (path.endsWith('.json')) {
          const content = await this.getFileContent(path, ref);
          configs[path] = JSON.parse(content);
        }
      } catch (error) {
        // File might not exist in this version, skip it
        console.debug(`Skipping ${path}: ${error.message}`);
      }
    }

    return configs;
  }

  // Cache helpers
  getFromCache(key) {
    const item = cache.get(key);
    if (!item) return null;
    
    if (Date.now() - item.timestamp > CACHE_TTL) {
      cache.delete(key);
      return null;
    }
    
    return item.data;
  }

  setCache(key, data) {
    cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  clearCache() {
    cache.clear();
  }
}

export const githubClient = new GitHubClient();