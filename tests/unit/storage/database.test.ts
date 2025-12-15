/**
 * Database Manager Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseManager } from '../../../src/storage/database.js';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

describe('DatabaseManager', () => {
  let testDbPath: string;
  let testDir: string;

  beforeEach(() => {
    // Use unique path for each test to avoid file locking issues on Windows
    testDir = `./test-data/db-test-${randomUUID()}`;
    testDbPath = `${testDir}/test.sqlite`;

    // Reset singleton before each test
    DatabaseManager.resetInstance();
  });

  afterEach(() => {
    // Clean up after tests
    try {
      DatabaseManager.resetInstance();
    } catch {
      // Ignore errors during cleanup
    }

    // Give some time for file handles to be released on Windows
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

  describe('getInstance', () => {
    it('should create a singleton instance', () => {
      const instance1 = DatabaseManager.getInstance({ path: testDbPath });
      const instance2 = DatabaseManager.getInstance({ path: testDbPath });

      expect(instance1).toBe(instance2);
    });

    it('should create data directory if not exists', () => {
      const dir = path.dirname(testDbPath);
      expect(fs.existsSync(dir)).toBe(false);

      DatabaseManager.getInstance({ path: testDbPath });

      expect(fs.existsSync(dir)).toBe(true);
    });
  });

  describe('initialize', () => {
    it('should initialize database with WAL mode', () => {
      const dbManager = DatabaseManager.initialize({
        path: testDbPath,
        enableWAL: true,
      });

      const sqlite = dbManager.getSqlite();
      const result = sqlite.pragma('journal_mode') as { journal_mode: string }[];
      expect(result[0].journal_mode).toBe('wal');
    });

    it('should set busy timeout', () => {
      const dbManager = DatabaseManager.initialize({
        path: testDbPath,
        busyTimeout: 10000,
      });

      const sqlite = dbManager.getSqlite();
      // better-sqlite3 returns pragma results in different formats depending on version
      const result = sqlite.pragma('busy_timeout');
      // Handle array of objects or object with timeout property
      let timeout: number;
      if (Array.isArray(result)) {
        const first = result[0] as Record<string, number>;
        timeout = first?.busy_timeout ?? first?.timeout ?? (first as unknown as number);
      } else if (typeof result === 'object' && result !== null) {
        timeout = (result as Record<string, number>).timeout ?? (result as Record<string, number>).busy_timeout;
      } else {
        timeout = result as number;
      }
      expect(timeout).toBe(10000);
    });
  });

  describe('runMigrations', () => {
    it('should create all tables', () => {
      const dbManager = DatabaseManager.initialize({ path: testDbPath });
      dbManager.runMigrations();

      const sqlite = dbManager.getSqlite();

      // Check tables exist
      const tables = sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all() as { name: string }[];

      const tableNames = tables.map(t => t.name);
      expect(tableNames).toContain('analyses');
      expect(tableNames).toContain('cache');
      expect(tableNames).toContain('prompts');
      expect(tableNames).toContain('settings');
    });

    it('should create indexes', () => {
      const dbManager = DatabaseManager.initialize({ path: testDbPath });
      dbManager.runMigrations();

      const sqlite = dbManager.getSqlite();

      const indexes = sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'")
        .all() as { name: string }[];

      const indexNames = indexes.map(i => i.name);
      expect(indexNames).toContain('idx_analyses_status');
      expect(indexNames).toContain('idx_analyses_source');
      expect(indexNames).toContain('idx_cache_expires_at');
    });

    it('should be idempotent (can run multiple times)', () => {
      const dbManager = DatabaseManager.initialize({ path: testDbPath });

      // Run migrations twice
      dbManager.runMigrations();
      expect(() => dbManager.runMigrations()).not.toThrow();
    });
  });

  describe('healthCheck', () => {
    it('should return true for healthy database', () => {
      const dbManager = DatabaseManager.initialize({ path: testDbPath });

      expect(dbManager.healthCheck()).toBe(true);
    });
  });

  describe('getStats', () => {
    it('should return database statistics', () => {
      const dbManager = DatabaseManager.initialize({ path: testDbPath });
      dbManager.runMigrations();

      const stats = dbManager.getStats();

      expect(stats).toHaveProperty('analysesCount');
      expect(stats).toHaveProperty('cacheCount');
      expect(stats).toHaveProperty('promptsCount');
      expect(stats).toHaveProperty('dbSizeBytes');
      expect(stats.analysesCount).toBe(0);
      expect(stats.cacheCount).toBe(0);
      expect(stats.promptsCount).toBe(0);
    });
  });

  describe('close', () => {
    it('should close database and reset singleton', () => {
      const dbManager = DatabaseManager.initialize({ path: testDbPath });
      dbManager.close();

      // Getting new instance should create a new connection
      const newInstance = DatabaseManager.getInstance({ path: testDbPath });
      expect(newInstance).not.toBe(dbManager);
    });
  });

  describe('getDb', () => {
    it('should return Drizzle database instance', () => {
      const dbManager = DatabaseManager.initialize({ path: testDbPath });
      const db = dbManager.getDb();

      expect(db).toBeDefined();
      expect(typeof db.select).toBe('function');
      expect(typeof db.insert).toBe('function');
    });
  });
});
