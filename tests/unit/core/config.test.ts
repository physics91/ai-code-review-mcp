/**
 * Unit tests for ConfigManager
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConfigManager } from '../../../src/core/config.js';

describe('ConfigManager', () => {
  beforeEach(() => {
    ConfigManager.reset();
  });

  afterEach(() => {
    // Clean up environment variables
    delete process.env.CODE_REVIEW_MCP_LOG_LEVEL;
    delete process.env.CODEX_ENABLED;
    delete process.env.GEMINI_CLI_PATH;
    ConfigManager.reset();
  });

  describe('load', () => {
    it('should load default configuration', async () => {
      const config = await ConfigManager.load();

      expect(config.server.name).toBe('ai-code-agent-mcp');
      expect(config.codex.enabled).toBe(true);
      expect(config.gemini.enabled).toBe(true);
      expect(config.analysis.maxCodeLength).toBe(50000);
    });

    it('should apply environment variable overrides', async () => {
      process.env.CODE_REVIEW_MCP_LOG_LEVEL = 'debug';
      process.env.CODEX_ENABLED = 'false';
      process.env.GEMINI_CLI_PATH = '/custom/path/gemini';

      const config = await ConfigManager.load();

      expect(config.server.logLevel).toBe('debug');
      expect(config.codex.enabled).toBe(false);
      expect(config.gemini.cliPath).toBe('/custom/path/gemini');
    });

    it('should validate configuration schema', async () => {
      const config = await ConfigManager.load();

      expect(config.codex.timeout).toBeGreaterThanOrEqual(0); // 0 = unlimited
      expect(config.gemini.retryAttempts).toBeGreaterThanOrEqual(0);
      expect(config.analysis.deduplication.similarityThreshold).toBeGreaterThanOrEqual(0);
      expect(config.analysis.deduplication.similarityThreshold).toBeLessThanOrEqual(1);
    });
  });

  describe('get', () => {
    it('should return loaded configuration', async () => {
      const loaded = await ConfigManager.load();
      const retrieved = ConfigManager.get();

      expect(retrieved).toEqual(loaded);
    });

    it('should throw error if not initialized', () => {
      expect(() => ConfigManager.get()).toThrow();
    });
  });

  describe('Codex Configuration Schema - New Options', () => {
    it('should have search option with default true', async () => {
      const config = await ConfigManager.load();

      // Test that search option exists and defaults to true
      expect(config.codex).toHaveProperty('search');
      expect(config.codex.search).toBe(true);
    });

    it('should have reasoningEffort option with default xhigh', async () => {
      const config = await ConfigManager.load();

      // Test that reasoningEffort option exists and defaults to 'xhigh'
      expect(config.codex).toHaveProperty('reasoningEffort');
      expect(config.codex.reasoningEffort).toBe('xhigh');
    });

    it('should have model default as gpt-5.2', async () => {
      const config = await ConfigManager.load();

      // Test that model defaults to 'gpt-5.2' (from config/default.json)
      expect(config.codex.model).toBe('gpt-5.2');
    });

    it('should accept valid reasoningEffort values', async () => {
      // Test that valid enum values are accepted
      process.env.CODEX_REASONING_EFFORT = 'minimal';
      let config = await ConfigManager.load();
      expect(config.codex.reasoningEffort).toBe('minimal');
      ConfigManager.reset();

      process.env.CODEX_REASONING_EFFORT = 'low';
      config = await ConfigManager.load();
      expect(config.codex.reasoningEffort).toBe('low');
      ConfigManager.reset();

      process.env.CODEX_REASONING_EFFORT = 'medium';
      config = await ConfigManager.load();
      expect(config.codex.reasoningEffort).toBe('medium');
      ConfigManager.reset();

      process.env.CODEX_REASONING_EFFORT = 'high';
      config = await ConfigManager.load();
      expect(config.codex.reasoningEffort).toBe('high');

      // Clean up
      delete process.env.CODEX_REASONING_EFFORT;
    });

    it('should apply environment variable override for search', async () => {
      process.env.CODEX_SEARCH = 'true';
      const config = await ConfigManager.load();

      expect(config.codex.search).toBe(true);

      // Clean up
      delete process.env.CODEX_SEARCH;
    });

    it('should apply environment variable override for reasoningEffort', async () => {
      process.env.CODEX_REASONING_EFFORT = 'medium';
      const config = await ConfigManager.load();

      expect(config.codex.reasoningEffort).toBe('medium');

      // Clean up
      delete process.env.CODEX_REASONING_EFFORT;
    });

    it('should validate all configuration options together', async () => {
      process.env.CODEX_SEARCH = 'true';
      process.env.CODEX_REASONING_EFFORT = 'low';
      process.env.CODEX_MODEL = 'gpt-5';

      const config = await ConfigManager.load();

      expect(config.codex.search).toBe(true);
      expect(config.codex.reasoningEffort).toBe('low');
      expect(config.codex.model).toBe('gpt-5');

      // Clean up
      delete process.env.CODEX_SEARCH;
      delete process.env.CODEX_REASONING_EFFORT;
      delete process.env.CODEX_MODEL;
    });
  });
});
