/**
 * Analysis Repository Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseManager } from '../../../src/storage/database.js';
import { AnalysisRepository } from '../../../src/storage/repositories/analysis.repository.js';
import * as fs from 'fs';
import { randomUUID } from 'crypto';

describe('AnalysisRepository', () => {
  let testDbPath: string;
  let testDir: string;
  let dbManager: DatabaseManager;
  let repository: AnalysisRepository;

  beforeEach(() => {
    // Use unique path for each test to avoid file locking issues on Windows
    testDir = `./test-data/analysis-test-${randomUUID()}`;
    testDbPath = `${testDir}/test.sqlite`;

    DatabaseManager.resetInstance();
    dbManager = DatabaseManager.initialize({ path: testDbPath });
    dbManager.runMigrations();
    repository = new AnalysisRepository(dbManager.getDb());
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

  describe('create', () => {
    it('should create an analysis record', () => {
      const analysis = repository.create({
        id: 'test-1',
        source: 'codex',
        promptHash: 'hash123',
      });

      expect(analysis.id).toBe('test-1');
      expect(analysis.source).toBe('codex');
      expect(analysis.status).toBe('pending');
      expect(analysis.promptHash).toBe('hash123');
    });

    it('should store context as JSON', () => {
      const context = { language: 'typescript', framework: 'react' };
      const analysis = repository.create({
        id: 'test-2',
        source: 'gemini',
        promptHash: 'hash456',
        context,
      });

      expect(analysis.contextJson).toBe(JSON.stringify(context));
    });

    it('should set expiration time when ttlMs provided', () => {
      const analysis = repository.create({
        id: 'test-3',
        source: 'combined',
        promptHash: 'hash789',
        ttlMs: 3600000, // 1 hour
      });

      expect(analysis.expiresAt).toBeDefined();
      const expiresAt = new Date(analysis.expiresAt!);
      expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('findById', () => {
    it('should find analysis by id', () => {
      repository.create({
        id: 'find-test',
        source: 'codex',
        promptHash: 'hash',
      });

      const found = repository.findById('find-test');
      expect(found).toBeDefined();
      expect(found?.id).toBe('find-test');
    });

    it('should return null for non-existent id', () => {
      const found = repository.findById('non-existent');
      expect(found).toBeNull();
    });
  });

  describe('updateStatus', () => {
    it('should update analysis status', () => {
      repository.create({
        id: 'status-test',
        source: 'codex',
        promptHash: 'hash',
      });

      const updated = repository.updateStatus('status-test', 'running');
      expect(updated?.status).toBe('running');
    });

    it('should set completedAt when status is completed', () => {
      repository.create({
        id: 'complete-test',
        source: 'codex',
        promptHash: 'hash',
      });

      const updated = repository.updateStatus('complete-test', 'completed');
      expect(updated?.completedAt).toBeDefined();
    });

    it('should set completedAt when status is failed', () => {
      repository.create({
        id: 'fail-test',
        source: 'codex',
        promptHash: 'hash',
      });

      const updated = repository.updateStatus('fail-test', 'failed');
      expect(updated?.completedAt).toBeDefined();
    });
  });

  describe('complete', () => {
    it('should complete analysis with result', () => {
      repository.create({
        id: 'complete-result-test',
        source: 'codex',
        promptHash: 'hash',
      });

      const result = { findings: ['issue1', 'issue2'], summary: 'Test summary' };
      const completed = repository.complete('complete-result-test', result);

      expect(completed?.status).toBe('completed');
      expect(completed?.resultJson).toBe(JSON.stringify(result));
      expect(completed?.completedAt).toBeDefined();
    });
  });

  describe('fail', () => {
    it('should fail analysis with error', () => {
      repository.create({
        id: 'error-test',
        source: 'codex',
        promptHash: 'hash',
      });

      const failed = repository.fail('error-test', 'CLI_ERROR', 'Command failed');

      expect(failed?.status).toBe('failed');
      expect(failed?.errorCode).toBe('CLI_ERROR');
      expect(failed?.errorMessage).toBe('Command failed');
    });
  });

  describe('find', () => {
    beforeEach(() => {
      repository.create({ id: 'find-1', source: 'codex', promptHash: 'h1' });
      repository.create({ id: 'find-2', source: 'gemini', promptHash: 'h2' });
      repository.create({ id: 'find-3', source: 'codex', promptHash: 'h3' });
      repository.updateStatus('find-2', 'completed');
    });

    it('should find all analyses', () => {
      const results = repository.find();
      expect(results).toHaveLength(3);
    });

    it('should filter by status', () => {
      const results = repository.find({ status: 'completed' });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('find-2');
    });

    it('should filter by source', () => {
      const results = repository.find({ source: 'codex' });
      expect(results).toHaveLength(2);
    });

    it('should apply limit', () => {
      const results = repository.find({ limit: 2 });
      expect(results).toHaveLength(2);
    });

    it('should apply offset', () => {
      const results = repository.find({ limit: 1, offset: 1 });
      expect(results).toHaveLength(1);
    });
  });

  describe('findActive', () => {
    it('should find pending and running analyses', () => {
      repository.create({ id: 'active-1', source: 'codex', promptHash: 'h1' });
      repository.create({ id: 'active-2', source: 'codex', promptHash: 'h2' });
      repository.updateStatus('active-2', 'running');
      repository.create({ id: 'active-3', source: 'codex', promptHash: 'h3' });
      repository.updateStatus('active-3', 'completed');

      const results = repository.findActive();
      expect(results).toHaveLength(2);
      expect(results.map(r => r.id)).toContain('active-1');
      expect(results.map(r => r.id)).toContain('active-2');
    });
  });

  describe('delete', () => {
    it('should delete analysis', () => {
      repository.create({ id: 'delete-test', source: 'codex', promptHash: 'h' });

      const deleted = repository.delete('delete-test');
      expect(deleted).toBe(true);

      const found = repository.findById('delete-test');
      expect(found).toBeNull();
    });

    it('should return false for non-existent id', () => {
      const deleted = repository.delete('non-existent');
      expect(deleted).toBe(false);
    });
  });

  describe('deleteExpired', () => {
    it('should delete expired analyses', () => {
      // Create expired analysis
      repository.create({
        id: 'expired-1',
        source: 'codex',
        promptHash: 'h1',
        ttlMs: -1000, // Already expired
      });

      // Create non-expired analysis
      repository.create({
        id: 'not-expired',
        source: 'codex',
        promptHash: 'h2',
        ttlMs: 3600000, // 1 hour in future
      });

      const deletedCount = repository.deleteExpired();
      expect(deletedCount).toBe(1);

      expect(repository.findById('expired-1')).toBeNull();
      expect(repository.findById('not-expired')).toBeDefined();
    });
  });

  describe('getResult', () => {
    it('should return parsed result', () => {
      repository.create({ id: 'result-test', source: 'codex', promptHash: 'h' });
      repository.complete('result-test', { findings: ['a', 'b'] });

      const result = repository.getResult('result-test');
      expect(result).toEqual({ findings: ['a', 'b'] });
    });

    it('should return null for no result', () => {
      repository.create({ id: 'no-result', source: 'codex', promptHash: 'h' });

      const result = repository.getResult('no-result');
      expect(result).toBeNull();
    });
  });

  describe('countByStatus', () => {
    it('should count analyses by status', () => {
      repository.create({ id: 'count-1', source: 'codex', promptHash: 'h1' });
      repository.create({ id: 'count-2', source: 'codex', promptHash: 'h2' });
      repository.updateStatus('count-2', 'running');
      repository.create({ id: 'count-3', source: 'codex', promptHash: 'h3' });
      repository.updateStatus('count-3', 'completed');

      const counts = repository.countByStatus();

      expect(counts.pending).toBe(1);
      expect(counts.running).toBe(1);
      expect(counts.completed).toBe(1);
      expect(counts.failed).toBe(0);
    });
  });

  describe('findByPromptHash', () => {
    it('should find completed analysis by prompt hash', () => {
      repository.create({ id: 'hash-1', source: 'codex', promptHash: 'unique-hash' });
      repository.complete('hash-1', { findings: [] });

      const found = repository.findByPromptHash('unique-hash', 'codex');
      expect(found).toBeDefined();
      expect(found?.id).toBe('hash-1');
    });

    it('should not find pending analysis', () => {
      repository.create({ id: 'hash-2', source: 'codex', promptHash: 'pending-hash' });

      const found = repository.findByPromptHash('pending-hash', 'codex');
      expect(found).toBeNull();
    });
  });
});
