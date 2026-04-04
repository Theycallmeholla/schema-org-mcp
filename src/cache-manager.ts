import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

interface CacheMetadata {
  fetchedAt: number;
  schemaVersion: string;
  itemCount: number;
}

interface CachedData {
  metadata: CacheMetadata;
  data: any;
}

export interface CacheConfig {
  cacheDir?: string;
  ttlMs?: number;
  cacheFileName?: string;
}

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const DEFAULT_CACHE_DIR = path.join(os.homedir(), '.cache', 'schema-org-mcp');
const DEFAULT_CACHE_FILE = 'schema-org-data.json';

export class CacheManager {
  private cacheDir: string;
  private cacheFilePath: string;
  private ttlMs: number;
  private memoryCache: CachedData | null = null;

  constructor(config: CacheConfig = {}) {
    this.cacheDir = config.cacheDir || DEFAULT_CACHE_DIR;
    this.cacheFilePath = path.join(this.cacheDir, config.cacheFileName || DEFAULT_CACHE_FILE);
    this.ttlMs = config.ttlMs || DEFAULT_TTL_MS;
  }

  /**
   * Get cached data from memory first, then disk
   */
  async get(): Promise<CachedData | null> {
    // Try memory cache first
    if (this.memoryCache && !this.isExpired(this.memoryCache.metadata.fetchedAt)) {
      return this.memoryCache;
    }

    // Try disk cache
    try {
      const diskData = await this.loadFromDisk();
      if (diskData) {
        this.memoryCache = diskData;
        return diskData;
      }
    } catch (error) {
      // Disk read failed, continue without cache
      console.error('Cache read error:', error);
    }

    return null;
  }

  /**
   * Get cached data even if expired (for fallback scenarios)
   */
  async getStale(): Promise<CachedData | null> {
    if (this.memoryCache) {
      return this.memoryCache;
    }

    try {
      return await this.loadFromDisk();
    } catch {
      return null;
    }
  }

  /**
   * Check if cache is fresh
   */
  async isFresh(): Promise<boolean> {
    const cached = await this.get();
    if (!cached) return false;
    return !this.isExpired(cached.metadata.fetchedAt);
  }

  /**
   * Check if cache needs refresh (expired but exists)
   */
  async needsRefresh(): Promise<boolean> {
    const cached = await this.getStale();
    if (!cached) return true;
    return this.isExpired(cached.metadata.fetchedAt);
  }

  /**
   * Save data to both memory and disk
   */
  async set(data: any, schemaVersion: string = 'latest'): Promise<void> {
    const itemCount = data['@graph']?.length || 0;

    const cachedData: CachedData = {
      metadata: {
        fetchedAt: Date.now(),
        schemaVersion,
        itemCount,
      },
      data,
    };

    // Save to memory
    this.memoryCache = cachedData;

    // Save to disk
    await this.saveToDisk(cachedData);
  }

  /**
   * Clear all caches
   */
  async clear(): Promise<void> {
    this.memoryCache = null;
    try {
      await fs.unlink(this.cacheFilePath);
    } catch {
      // File doesn't exist, that's fine
    }
  }

  /**
   * Get cache metadata without loading full data
   */
  async getMetadata(): Promise<CacheMetadata | null> {
    const cached = await this.getStale();
    return cached?.metadata || null;
  }

  /**
   * Check if a timestamp is expired based on TTL
   */
  private isExpired(fetchedAt: number): boolean {
    return Date.now() - fetchedAt > this.ttlMs;
  }

  /**
   * Load cached data from disk
   */
  private async loadFromDisk(): Promise<CachedData | null> {
    try {
      const content = await fs.readFile(this.cacheFilePath, 'utf-8');
      const parsed = JSON.parse(content) as CachedData;

      // Validate structure
      if (!parsed.metadata || !parsed.data) {
        console.error('Invalid cache structure, ignoring');
        return null;
      }

      return parsed;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // File doesn't exist yet
        return null;
      }
      throw error;
    }
  }

  /**
   * Save cached data to disk
   */
  private async saveToDisk(cachedData: CachedData): Promise<void> {
    try {
      // Ensure cache directory exists
      await fs.mkdir(this.cacheDir, { recursive: true });

      // Write atomically via temp file
      const tempPath = `${this.cacheFilePath}.tmp`;
      await fs.writeFile(tempPath, JSON.stringify(cachedData), 'utf-8');
      await fs.rename(tempPath, this.cacheFilePath);

      console.error(`Cache saved: ${cachedData.metadata.itemCount} items`);
    } catch (error) {
      console.error('Failed to save cache:', error);
      // Don't throw - caching failure shouldn't break the server
    }
  }

  /**
   * Get human-readable cache status
   */
  async getStatus(): Promise<{
    exists: boolean;
    fresh: boolean;
    ageMs: number | null;
    itemCount: number | null;
    path: string;
  }> {
    const metadata = await this.getMetadata();

    return {
      exists: metadata !== null,
      fresh: metadata ? !this.isExpired(metadata.fetchedAt) : false,
      ageMs: metadata ? Date.now() - metadata.fetchedAt : null,
      itemCount: metadata?.itemCount || null,
      path: this.cacheFilePath,
    };
  }
}
