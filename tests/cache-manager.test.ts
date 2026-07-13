import { CacheManager } from '../src/cache-manager';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

describe('CacheManager', () => {
  let cacheDir: string;

  beforeEach(async () => {
    cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'schema-org-cache-test-'));
  });

  afterEach(async () => {
    await fs.rm(cacheDir, { recursive: true, force: true });
  });

  const sampleData = { '@graph': [{ '@id': 'schema:Thing' }] };

  test('get returns fresh data from disk', async () => {
    const writer = new CacheManager({ cacheDir });
    await writer.set(sampleData);

    // New instance = empty memory cache, forces disk read
    const reader = new CacheManager({ cacheDir });
    const cached = await reader.get();
    expect(cached).not.toBeNull();
    expect(cached!.data['@graph']).toHaveLength(1);
  });

  test('get returns null when disk cache is expired', async () => {
    const writer = new CacheManager({ cacheDir });
    await writer.set(sampleData);

    // Backdate the cache file past the TTL
    const cacheFile = path.join(cacheDir, 'schema-org-data.json');
    const content = JSON.parse(await fs.readFile(cacheFile, 'utf-8'));
    content.metadata.fetchedAt = Date.now() - 25 * 60 * 60 * 1000; // 25h ago
    await fs.writeFile(cacheFile, JSON.stringify(content), 'utf-8');

    const reader = new CacheManager({ cacheDir });
    expect(await reader.get()).toBeNull();
  });

  test('getStale returns expired data as fallback', async () => {
    const writer = new CacheManager({ cacheDir });
    await writer.set(sampleData);

    const cacheFile = path.join(cacheDir, 'schema-org-data.json');
    const content = JSON.parse(await fs.readFile(cacheFile, 'utf-8'));
    content.metadata.fetchedAt = Date.now() - 25 * 60 * 60 * 1000;
    await fs.writeFile(cacheFile, JSON.stringify(content), 'utf-8');

    const reader = new CacheManager({ cacheDir });
    const stale = await reader.getStale();
    expect(stale).not.toBeNull();
    expect(stale!.data['@graph']).toHaveLength(1);
  });

  test('needsRefresh is true for expired cache, false for fresh', async () => {
    const manager = new CacheManager({ cacheDir });
    expect(await manager.needsRefresh()).toBe(true); // no cache yet

    await manager.set(sampleData);
    expect(await manager.needsRefresh()).toBe(false);

    const shortTtl = new CacheManager({ cacheDir, ttlMs: 1 });
    await new Promise((r) => setTimeout(r, 5));
    expect(await shortTtl.needsRefresh()).toBe(true);
  });

  test('expired memory cache does not get revived by stale disk data', async () => {
    // Short TTL: data expires almost immediately
    const manager = new CacheManager({ cacheDir, ttlMs: 1 });
    await manager.set(sampleData);
    await new Promise((r) => setTimeout(r, 5));

    // Both memory and disk are expired — get() must miss so caller refetches
    expect(await manager.get()).toBeNull();
  });
});
