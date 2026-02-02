import yaml from 'js-yaml';
import type { CacheItem, GitHubClientInterface } from './types/index.js';

const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com';
const REPO_OWNER = 'loft-sh';
const REPO_NAME = 'vcluster';

// Cache for fetched content (15 minute TTL)
const cache = new Map<string, CacheItem<unknown>>();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

// Fetch timeout configuration
const FETCH_TIMEOUT_MS = 30000; // 30 seconds - generous for large files

interface FetchWithTimeout {
  signal: AbortSignal;
  cleanup: () => void;
}

// Helper to create fetch with timeout
function createFetchWithTimeout(timeoutMs: number = FETCH_TIMEOUT_MS): FetchWithTimeout {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timeoutId)
  };
}

class GitHubClient implements GitHubClientInterface {
  private defaultBranch: string = 'main';

  // Get list of available tags (versions)
  async getTags(): Promise<string[]> {
    const cacheKey = 'tags';
    const cached = this.getFromCache<string[]>(cacheKey);
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

      const tags = await response.json() as Array<{ name: string }>;
      const tagNames = tags.map(tag => tag.name);

      this.setCache(cacheKey, tagNames);
      return tagNames;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
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
  async getBranches(): Promise<string[]> {
    const cacheKey = 'branches';
    const cached = this.getFromCache<string[]>(cacheKey);
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

      const branches = await response.json() as Array<{ name: string }>;
      const branchNames = branches.map(branch => branch.name);

      this.setCache(cacheKey, branchNames);
      return branchNames;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
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
  async getFileContent(path: string, ref: string = 'main'): Promise<string> {
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
    const cached = this.getFromCache<string>(cacheKey);
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
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Timeout: fetching ${path} took longer than 30s`);
      }
      throw new Error(`Failed to fetch ${path}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      cleanup();
    }
  }

  // Get parsed YAML content
  async getYamlContent(path: string, ref: string | null = null): Promise<unknown> {
    const content = await this.getFileContent(path, ref ?? this.defaultBranch);
    try {
      return yaml.load(content);
    } catch (error) {
      throw new Error(`Failed to parse YAML from ${path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Get vcluster configuration files
  async getVClusterConfigs(ref: string | null = null): Promise<Record<string, unknown>> {
    const configs: Record<string, unknown> = {};

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
          const content = await this.getFileContent(path, ref ?? this.defaultBranch);
          configs[path] = JSON.parse(content);
        }
      } catch (error) {
        // File might not exist in this version, skip it
        console.debug(`Skipping ${path}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return configs;
  }

  // Cache helpers
  private getFromCache<T>(key: string): T | null {
    const item = cache.get(key) as CacheItem<T> | undefined;
    if (!item) return null;

    if (Date.now() - item.timestamp > CACHE_TTL) {
      cache.delete(key);
      return null;
    }

    return item.data;
  }

  private setCache<T>(key: string, data: T): void {
    cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  clearCache(): void {
    cache.clear();
  }
}

export const githubClient = new GitHubClient();
