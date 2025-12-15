/**
 * Prompt Repository Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseManager } from '../../../src/storage/database.js';
import { PromptRepository } from '../../../src/storage/repositories/prompt.repository.js';
import * as fs from 'fs';
import { randomUUID } from 'crypto';

describe('PromptRepository', () => {
  let testDbPath: string;
  let testDir: string;
  let dbManager: DatabaseManager;
  let repository: PromptRepository;

  beforeEach(() => {
    // Use unique path for each test to avoid file locking issues on Windows
    testDir = `./test-data/prompt-test-${randomUUID()}`;
    testDbPath = `${testDir}/test.sqlite`;

    DatabaseManager.resetInstance();
    dbManager = DatabaseManager.initialize({ path: testDbPath });
    dbManager.runMigrations();
    repository = new PromptRepository(dbManager.getDb());
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
    it('should create a prompt', () => {
      const prompt = repository.create({
        id: 'test-prompt',
        name: 'Test Prompt',
        template: 'Hello {{name}}',
      });

      expect(prompt.id).toBe('test-prompt');
      expect(prompt.name).toBe('Test Prompt');
      expect(prompt.template).toBe('Hello {{name}}');
      expect(prompt.isBuiltin).toBe(false);
    });

    it('should create builtin prompt', () => {
      const prompt = repository.create({
        id: 'builtin-1',
        name: 'Builtin Prompt',
        template: 'Template',
        isBuiltin: true,
      });

      expect(prompt.isBuiltin).toBe(true);
    });

    it('should store args schema as JSON', () => {
      const argsSchema = {
        code: { type: 'string', description: 'Code to review' },
        language: { type: 'string', required: true },
      };

      const prompt = repository.create({
        id: 'schema-prompt',
        name: 'Schema Prompt',
        template: 'Review {{code}}',
        argsSchema,
      });

      expect(prompt.argsSchemaJson).toBe(JSON.stringify(argsSchema));
    });
  });

  describe('findById', () => {
    it('should find prompt by id', () => {
      repository.create({
        id: 'find-id',
        name: 'Find Test',
        template: 'Template',
      });

      const found = repository.findById('find-id');

      expect(found).toBeDefined();
      expect(found?.id).toBe('find-id');
    });

    it('should return null for non-existent id', () => {
      const found = repository.findById('non-existent');
      expect(found).toBeNull();
    });
  });

  describe('findByName', () => {
    it('should find prompt by name', () => {
      repository.create({
        id: 'name-id',
        name: 'Unique Name',
        template: 'Template',
      });

      const found = repository.findByName('Unique Name');

      expect(found).toBeDefined();
      expect(found?.name).toBe('Unique Name');
    });
  });

  describe('update', () => {
    it('should update prompt properties', () => {
      repository.create({
        id: 'update-test',
        name: 'Original Name',
        template: 'Original Template',
      });

      const updated = repository.update('update-test', {
        name: 'Updated Name',
        template: 'Updated Template',
      });

      expect(updated?.name).toBe('Updated Name');
      expect(updated?.template).toBe('Updated Template');
    });

    it('should update only specified fields', () => {
      repository.create({
        id: 'partial-update',
        name: 'Name',
        description: 'Original Description',
        template: 'Template',
      });

      const updated = repository.update('partial-update', {
        description: 'New Description',
      });

      expect(updated?.name).toBe('Name');
      expect(updated?.description).toBe('New Description');
      expect(updated?.template).toBe('Template');
    });
  });

  describe('delete', () => {
    it('should delete prompt', () => {
      repository.create({
        id: 'delete-test',
        name: 'Delete Test',
        template: 'Template',
      });

      const deleted = repository.delete('delete-test');

      expect(deleted).toBe(true);
      expect(repository.findById('delete-test')).toBeNull();
    });

    it('should return false for non-existent id', () => {
      const deleted = repository.delete('non-existent');
      expect(deleted).toBe(false);
    });
  });

  describe('findAll', () => {
    it('should return all prompts', () => {
      repository.create({ id: 'all-1', name: 'Prompt 1', template: 'T1' });
      repository.create({ id: 'all-2', name: 'Prompt 2', template: 'T2' });
      repository.create({ id: 'all-3', name: 'Prompt 3', template: 'T3' });

      const prompts = repository.findAll();

      expect(prompts).toHaveLength(3);
    });
  });

  describe('findBuiltin', () => {
    it('should return only builtin prompts', () => {
      repository.create({ id: 'b-1', name: 'Builtin 1', template: 'T1', isBuiltin: true });
      repository.create({ id: 'b-2', name: 'Builtin 2', template: 'T2', isBuiltin: true });
      repository.create({ id: 'c-1', name: 'Custom 1', template: 'T3', isBuiltin: false });

      const builtins = repository.findBuiltin();

      expect(builtins).toHaveLength(2);
      expect(builtins.every(p => p.isBuiltin)).toBe(true);
    });
  });

  describe('findCustom', () => {
    it('should return only custom prompts', () => {
      repository.create({ id: 'b-1', name: 'Builtin 1', template: 'T1', isBuiltin: true });
      repository.create({ id: 'c-1', name: 'Custom 1', template: 'T2', isBuiltin: false });
      repository.create({ id: 'c-2', name: 'Custom 2', template: 'T3', isBuiltin: false });

      const customs = repository.findCustom();

      expect(customs).toHaveLength(2);
      expect(customs.every(p => !p.isBuiltin)).toBe(true);
    });
  });

  describe('exists', () => {
    it('should return true if prompt exists', () => {
      repository.create({ id: 'exists-test', name: 'Test', template: 'T' });

      expect(repository.exists('exists-test')).toBe(true);
    });

    it('should return false if prompt does not exist', () => {
      expect(repository.exists('non-existent')).toBe(false);
    });
  });

  describe('upsert', () => {
    it('should create if not exists', () => {
      const prompt = repository.upsert({
        id: 'upsert-new',
        name: 'New Prompt',
        template: 'Template',
      });

      expect(prompt.id).toBe('upsert-new');
    });

    it('should update if exists', () => {
      repository.create({
        id: 'upsert-existing',
        name: 'Original',
        template: 'Original Template',
      });

      const prompt = repository.upsert({
        id: 'upsert-existing',
        name: 'Updated',
        template: 'Updated Template',
      });

      expect(prompt.name).toBe('Updated');
      expect(prompt.template).toBe('Updated Template');
    });
  });

  describe('seedBuiltinPrompts', () => {
    it('should seed builtin prompts', () => {
      const builtins = [
        { id: 'security-review', name: 'Security Review', template: 'T1' },
        { id: 'performance-review', name: 'Performance Review', template: 'T2' },
      ];

      const seeded = repository.seedBuiltinPrompts(builtins);

      expect(seeded).toBe(2);
      expect(repository.findBuiltin()).toHaveLength(2);
    });

    it('should not re-seed existing prompts', () => {
      const builtins = [
        { id: 'security-review', name: 'Security Review', template: 'T1' },
      ];

      repository.seedBuiltinPrompts(builtins);
      const seededAgain = repository.seedBuiltinPrompts(builtins);

      expect(seededAgain).toBe(0);
      expect(repository.findBuiltin()).toHaveLength(1);
    });
  });

  describe('getArgsSchema', () => {
    it('should return parsed args schema', () => {
      const argsSchema = {
        code: { type: 'string', description: 'Code' },
      };

      repository.create({
        id: 'schema-test',
        name: 'Schema Test',
        template: 'Template',
        argsSchema,
      });

      const schema = repository.getArgsSchema('schema-test');

      expect(schema).toEqual(argsSchema);
    });

    it('should return null if no schema', () => {
      repository.create({
        id: 'no-schema',
        name: 'No Schema',
        template: 'Template',
      });

      const schema = repository.getArgsSchema('no-schema');

      expect(schema).toBeNull();
    });
  });

  describe('count', () => {
    it('should count prompts', () => {
      repository.create({ id: 'count-1', name: 'B1', template: 'T', isBuiltin: true });
      repository.create({ id: 'count-2', name: 'B2', template: 'T', isBuiltin: true });
      repository.create({ id: 'count-3', name: 'C1', template: 'T', isBuiltin: false });

      const counts = repository.count();

      expect(counts.total).toBe(3);
      expect(counts.builtin).toBe(2);
      expect(counts.custom).toBe(1);
    });
  });

  describe('clearCustom', () => {
    it('should clear only custom prompts', () => {
      repository.create({ id: 'b-1', name: 'Builtin', template: 'T', isBuiltin: true });
      repository.create({ id: 'c-1', name: 'Custom 1', template: 'T', isBuiltin: false });
      repository.create({ id: 'c-2', name: 'Custom 2', template: 'T', isBuiltin: false });

      const cleared = repository.clearCustom();

      expect(cleared).toBe(2);
      expect(repository.findAll()).toHaveLength(1);
      expect(repository.findById('b-1')).toBeDefined();
    });
  });
});
