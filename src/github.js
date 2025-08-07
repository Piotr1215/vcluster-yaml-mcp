import fetch from 'node-fetch';
import yaml from 'js-yaml';

const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com';
const REPO_OWNER = 'loft-sh';
const REPO_NAME = 'vcluster';

// Cache for fetched content (15 minute TTL)
const cache = new Map();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

class GitHubClient {
  constructor() {
    this.defaultBranch = 'main';
    this.currentRef = 'main'; // Can be branch or tag
  }

  // Get list of available tags (versions)
  async getTags() {
    const cacheKey = 'tags';
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      const response = await fetch(`${GITHUB_API_BASE}/repos/${REPO_OWNER}/${REPO_NAME}/tags`, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'vcluster-yaml-mcp-server'
        }
      });

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.statusText}`);
      }

      const tags = await response.json();
      const tagNames = tags.map(tag => tag.name);
      
      this.setCache(cacheKey, tagNames);
      return tagNames;
    } catch (error) {
      console.error('Error fetching tags:', error);
      return [];
    }
  }

  // Get list of branches
  async getBranches() {
    const cacheKey = 'branches';
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      const response = await fetch(`${GITHUB_API_BASE}/repos/${REPO_OWNER}/${REPO_NAME}/branches`, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'vcluster-yaml-mcp-server'
        }
      });

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.statusText}`);
      }

      const branches = await response.json();
      const branchNames = branches.map(branch => branch.name);
      
      this.setCache(cacheKey, branchNames);
      return branchNames;
    } catch (error) {
      console.error('Error fetching branches:', error);
      return ['main'];
    }
  }

  // Get file content from GitHub
  async getFileContent(path, ref = null) {
    const actualRef = ref || this.currentRef;
    const cacheKey = `file:${actualRef}:${path}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      const url = `${GITHUB_RAW_BASE}/${REPO_OWNER}/${REPO_NAME}/${actualRef}/${path}`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'vcluster-yaml-mcp-server'
        }
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
      throw new Error(`Failed to fetch ${path}: ${error.message}`);
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

  // List files in a directory
  async listFiles(path = '', ref = null) {
    const actualRef = ref || this.currentRef;
    const cacheKey = `dir:${actualRef}:${path}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      const url = `${GITHUB_API_BASE}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}?ref=${actualRef}`;
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'vcluster-yaml-mcp-server'
        }
      });

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.statusText}`);
      }

      const contents = await response.json();
      const files = contents
        .filter(item => item.type === 'file' && (item.name.endsWith('.yaml') || item.name.endsWith('.yml')))
        .map(item => ({
          name: item.name,
          path: item.path,
          size: item.size
        }));
      
      this.setCache(cacheKey, files);
      return files;
    } catch (error) {
      console.error('Error listing files:', error);
      return [];
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

  // Switch to a different ref (branch or tag)
  setRef(ref) {
    this.currentRef = ref;
    // Clear cache when switching refs
    this.clearCache();
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