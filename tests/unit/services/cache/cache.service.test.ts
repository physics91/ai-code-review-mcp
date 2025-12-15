/**
 * Cache Service Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseManager } from '../../../../src/storage/database.js';
import { CacheRepository } from '../../../../src/storage/repositories/cache.repository.js';
import { CacheService } from '../../../../src/services/cache/cache.service.js';
import * as fs from 'fs';
import { randomUUID } from 'crypto';

describe('CacheService', () => {
  let testDbPath: string;
  let testDir: string;
  let dbManager: DatabaseManager;
  let repository: CacheRepository;
  let service: CacheService;

  beforeEach(() => {
    testDir = `./test-data/cache-service-test-${randomUUID()}`;
    testDbPath = `${testDir}/test.sqlite`;

    DatabaseManager.resetInstance();
    dbManager = DatabaseManager.initialize({ path: testDbPath });
    dbManager.runMigrations();
    repository = new CacheRepository(dbManager.getDb(), {
      maxSize: 100,
      defaultTtlMs: 3600000,
    });
    service = new CacheService(
      repository,
      { enabled: true, ttl: 3600000, maxSize: 100 }
    );
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

  describe('isEnabled', () => {
    it('should return true when enabled', () => {
      expect(service.isEnabled()).toBe(true);
    });

    it('should return false when disabled', () => {
      const disabledService = new CacheService(
        repository,
        { enabled: false, ttl: 3600000, maxSize: 100 }
      );
      expect(disabledService.isEnabled()).toBe(false);
    });
  });

  describe('getOrSet', () => {
    it('should execute function on cache miss', async () => {
      const fn = vi.fn().mockResolvedValue({ data: 'test' });

      const { result, fromCache } = await service.getOrSet(
        { prompt: 'test prompt', source: 'codex' },
        fn
      );

      expect(fn).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ data: 'test' });
      expect(fromCache).toBe(false);
    });

    it('should return cached result on cache hit', async () => {
      const fn = vi.fn().mockResolvedValue({ data: 'test' });
      const params = { prompt: 'test prompt', source: 'codex' as const };

      // First call - cache miss
      await service.getOrSet(params, fn);

      // Reset mock
      fn.mockClear();

      // Second call - cache hit
      const { result, fromCache } = await service.getOrSet(params, fn);

      expect(fn).not.toHaveBeenCalled();
      expect(result).toEqual({ data: 'test' });
      expect(fromCache).toBe(true);
    });

    it('should skip cache when disabled', async () => {
      const disabledService = new CacheService(
        repository,
        { enabled: false, ttl: 3600000, maxSize: 100 }
      );
      const fn = vi.fn().mockResolvedValue({ data: 'test' });
      const params = { prompt: 'test prompt', source: 'codex' as const };

      // First call
      await disabledService.getOrSet(params, fn);
      // Second call
      const { fromCache } = await disabledService.getOrSet(params, fn);

      expect(fn).toHaveBeenCalledTimes(2);
      expect(fromCache).toBe(false);
    });
  });

  describe('get and set', () => {
    it('should set and get value', () => {
      const params = { prompt: 'test', source: 'codex' as const };

      service.set(params, { data: 'cached' });
      const result = service.get<{ data: string }>(params);

      expect(result).toEqual({ data: 'cached' });
    });

    it('should return null for non-existent key', () => {
      const params = { prompt: 'non-existent', source: 'codex' as const };

      const result = service.get(params);

      expect(result).toBeNull();
    });
  });

  describe('has', () => {
    it('should return true for existing entry', () => {
      const params = { prompt: 'test', source: 'codex' as const };
      service.set(params, { data: 'test' });

      expect(service.has(params)).toBe(true);
    });

    it('should return false for non-existent entry', () => {
      const params = { prompt: 'non-existent', source: 'codex' as const };

      expect(service.has(params)).toBe(false);
    });
  });

  describe('invalidate', () => {
    it('should remove entry from cache', () => {
      const params = { prompt: 'test', source: 'codex' as const };
      service.set(params, { data: 'test' });

      const deleted = service.invalidate(params);

      expect(deleted).toBe(true);
      expect(service.has(params)).toBe(false);
    });

    it('should return false for non-existent entry', () => {
      const params = { prompt: 'non-existent', source: 'codex' as const };

      const deleted = service.invalidate(params);

      expect(deleted).toBe(false);
    });
  });

  describe('invalidateBySource', () => {
    it('should remove all entries for source', () => {
      service.set({ prompt: 'test1', source: 'codex' }, { data: 1 });
      service.set({ prompt: 'test2', source: 'codex' }, { data: 2 });
      service.set({ prompt: 'test3', source: 'gemini' }, { data: 3 });

      const cleared = service.invalidateBySource('codex');

      expect(cleared).toBe(2);
      expect(service.has({ prompt: 'test1', source: 'codex' })).toBe(false);
      expect(service.has({ prompt: 'test2', source: 'codex' })).toBe(false);
      expect(service.has({ prompt: 'test3', source: 'gemini' })).toBe(true);
    });
  });

  describe('clear', () => {
    it('should remove all entries', () => {
      service.set({ prompt: 'test1', source: 'codex' }, { data: 1 });
      service.set({ prompt: 'test2', source: 'gemini' }, { data: 2 });

      const cleared = service.clear();

      expect(cleared).toBe(2);
      expect(service.size()).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should track hits and misses', async () => {
      const params = { prompt: 'stats-test', source: 'codex' as const };
      const fn = vi.fn().mockResolvedValue({ data: 'test' });

      // Miss
      await service.getOrSet(params, fn);
      // Hit
      await service.getOrSet(params, fn);
      // Hit
      await service.getOrSet(params, fn);

      const stats = service.getStats();

      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(2 / 3, 2);
    });

    it('should return 0 hit rate when no requests', () => {
      const stats = service.getStats();

      expect(stats.hitRate).toBe(0);
    });
  });

  describe('resetStats', () => {
    it('should reset hit and miss counters', async () => {
      const params = { prompt: 'reset-test', source: 'codex' as const };
      const fn = vi.fn().mockResolvedValue({ data: 'test' });

      await service.getOrSet(params, fn);

      service.resetStats();
      const stats = service.getStats();

      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });
  });

  describe('size', () => {
    it('should return number of entries', () => {
      expect(service.size()).toBe(0);

      service.set({ prompt: 'test1', source: 'codex' }, { data: 1 });
      service.set({ prompt: 'test2', source: 'gemini' }, { data: 2 });

      expect(service.size()).toBe(2);
    });
  });
});
