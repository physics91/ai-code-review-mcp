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

      expect(config.server.name).toBe('code-review-mcp');
      expect(config.codex.enabled).toBe(true);
      expect(config.gemini.enabled).toBe(true);
      expect(config.review.maxCodeLength).toBe(50000);
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

      expect(config.codex.timeout).toBeGreaterThan(0);
      expect(config.gemini.retryAttempts).toBeGreaterThanOrEqual(0);
      expect(config.review.deduplication.similarityThreshold).toBeGreaterThanOrEqual(0);
      expect(config.review.deduplication.similarityThreshold).toBeLessThanOrEqual(1);
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
});
