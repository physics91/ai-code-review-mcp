/**
 * Cache Repository Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseManager } from '../../../src/storage/database.js';
import { CacheRepository } from '../../../src/storage/repositories/cache.repository.js';
import * as fs from 'fs';
import { randomUUID } from 'crypto';

describe('CacheRepository', () => {
  let testDbPath: string;
  let testDir: string;
  let dbManager: DatabaseManager;
  let repository: CacheRepository;

  beforeEach(() => {
    // Use unique path for each test to avoid file locking issues on Windows
    testDir = `./test-data/cache-test-${randomUUID()}`;
    testDbPath = `${testDir}/test.sqlite`;

    DatabaseManager.resetInstance();
    dbManager = DatabaseManager.initialize({ path: testDbPath });
    dbManager.runMigrations();
    repository = new CacheRepository(dbManager.getDb(), {
      maxSize: 10,
      defaultTtlMs: 3600000,
      touchIntervalMs: 0,
    });
  });

  afterEach(() => {
    try {
      DatabaseManager.resetInstance();
    } catch {
      // Ignore errors during cleanup
    }

    setTimeout(() => {
      try {
        if (fs.existsSync(testDir)) {
          fs.rmSync(testDir, { recursive: true, force: true });
        }
      } catch {
        // Ignore cleanup errors
      }
    }, 100);
  });

  describe('set', () => {
    it('should create cache entry', () => {
      const entry = repository.set('key-1', 'codex', { findings: ['a'] });

      expect(entry.cacheKey).toBe('key-1');
      expect(entry.source).toBe('codex');
      expect(entry.hitCount).toBe(0);
    });

    it('should update existing entry', () => {
      repository.set('key-2', 'codex', { findings: ['a'] });
      const updated = repository.set('key-2', 'codex', { findings: ['b'] });

      expect(JSON.parse(updated.resultJson)).toEqual({ findings: ['b'] });
    });

    it('should set expiration time', () => {
      const entry = repository.set('key-3', 'gemini', { data: 'test' }, 1000);

      expect(entry.expiresAt).toBeDefined();
      const expiresAt = new Date(entry.expiresAt);
      expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('get', () => {
    it('should retrieve cached entry', () => {
      repository.set('get-key', 'codex', { value: 42 });

      const entry = repository.get('get-key');

      expect(entry).toBeDefined();
      expect(JSON.parse(entry!.resultJson)).toEqual({ value: 42 });
    });

    it('should increment hit count on access', () => {
      repository.set('hit-key', 'codex', { data: 'test' });

      repository.get('hit-key'); // 1st access - hitCount becomes 1
      repository.get('hit-key'); // 2nd access - hitCount becomes 2

      // Get returns the entry BEFORE incrementing, then increments
      // So after 2 gets, the DB has hitCount=2, next get returns entry with hitCount=2
      const entry = repository.get('hit-key'); // 3rd access - returns hitCount=2, then increments to 3

      // The returned entry shows the value at read time
      expect(entry?.hitCount).toBeGreaterThanOrEqual(2);
    });

    it('should return null for non-existent key', () => {
      const entry = repository.get('non-existent');
      expect(entry).toBeNull();
    });

    it('should return null and delete expired entry', () => {
      repository.set('expired-key', 'codex', { data: 'test' }, -1000); // Already expired

      const entry = repository.get('expired-key');

      expect(entry).toBeNull();
      expect(repository.has('expired-key')).toBe(false);
    });
  });

  describe('has', () => {
    it('should return true for existing non-expired entry', () => {
      repository.set('has-key', 'codex', { data: 'test' });
      expect(repository.has('has-key')).toBe(true);
    });

    it('should return false for non-existent key', () => {
      expect(repository.has('missing')).toBe(false);
    });

    it('should return false for expired entry', () => {
      repository.set('expired', 'codex', { data: 'test' }, -1000);
      expect(repository.has('expired')).toBe(false);
    });
  });

  describe('delete', () => {
    it('should delete cache entry', () => {
      repository.set('delete-key', 'codex', { data: 'test' });

      const deleted = repository.delete('delete-key');

      expect(deleted).toBe(true);
      expect(repository.has('delete-key')).toBe(false);
    });

    it('should return false for non-existent key', () => {
      const deleted = repository.delete('non-existent');
      expect(deleted).toBe(false);
    });
  });

  describe('size', () => {
    it('should return number of entries', () => {
      expect(repository.size()).toBe(0);

      repository.set('size-1', 'codex', { data: 1 });
      repository.set('size-2', 'gemini', { data: 2 });

      expect(repository.size()).toBe(2);
    });
  });

  describe('clear', () => {
    it('should clear all entries', () => {
      repository.set('clear-1', 'codex', { data: 1 });
      repository.set('clear-2', 'gemini', { data: 2 });

      const cleared = repository.clear();

      expect(cleared).toBe(2);
      expect(repository.size()).toBe(0);
    });
  });

  describe('clearBySource', () => {
    it('should clear entries by source', () => {
      repository.set('source-1', 'codex', { data: 1 });
      repository.set('source-2', 'codex', { data: 2 });
      repository.set('source-3', 'gemini', { data: 3 });

      const cleared = repository.clearBySource('codex');

      expect(cleared).toBe(2);
      expect(repository.size()).toBe(1);
      expect(repository.has('source-3')).toBe(true);
    });
  });

  describe('deleteExpired', () => {
    it('should delete expired entries', () => {
      repository.set('expired-1', 'codex', { data: 1 }, -1000);
      repository.set('valid-1', 'codex', { data: 2 }, 3600000);

      const deleted = repository.deleteExpired();

      expect(deleted).toBe(1);
      expect(repository.size()).toBe(1);
    });
  });

  describe('LRU eviction', () => {
    it('should evict least recently accessed entries when at capacity', () => {
      // Fill cache to capacity (maxSize = 10)
      for (let i = 0; i < 10; i++) {
        repository.set(`lru-${i}`, 'codex', { data: i });
      }

      // Access some entries to make them "recently used"
      repository.get('lru-5');
      repository.get('lru-6');
      repository.get('lru-7');

      // Add more entries, triggering eviction
      repository.set('lru-new', 'codex', { data: 'new' });

      // Should have evicted oldest entries (lru-0, lru-1, etc.)
      expect(repository.size()).toBeLessThanOrEqual(10);
      // Recently accessed entries should still exist
      expect(repository.has('lru-5')).toBe(true);
      expect(repository.has('lru-6')).toBe(true);
      expect(repository.has('lru-7')).toBe(true);
      expect(repository.has('lru-new')).toBe(true);
    });
  });

  describe('getResult', () => {
    it('should return parsed result', () => {
      repository.set('result-key', 'codex', { findings: ['a', 'b'] });

      const result = repository.getResult<{ findings: string[] }>('result-key');

      expect(result).toEqual({ findings: ['a', 'b'] });
    });

    it('should return null for non-existent key', () => {
      const result = repository.getResult('missing');
      expect(result).toBeNull();
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', () => {
      repository.set('stats-1', 'codex', { data: 1 });
      repository.set('stats-2', 'gemini', { data: 2 });
      repository.get('stats-1'); // Increment hit count

      const stats = repository.getStats();

      expect(stats.totalEntries).toBe(2);
      expect(stats.totalHits).toBe(1);
      expect(stats.bySource.codex).toBe(1);
      expect(stats.bySource.gemini).toBe(1);
      expect(stats.oldestEntry).toBeDefined();
      expect(stats.newestEntry).toBeDefined();
    });
  });
});
