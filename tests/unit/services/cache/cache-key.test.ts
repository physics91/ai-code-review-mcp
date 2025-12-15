/**
 * Cache Key Generator Tests
 */

import { describe, it, expect } from 'vitest';
import {
  generateCacheKey,
  generateShortCacheKey,
  generatePromptHash,
} from '../../../../src/services/cache/cache-key.js';

describe('Cache Key Generator', () => {
  describe('generateCacheKey', () => {
    it('should generate consistent keys for same params', () => {
      const params = {
        prompt: 'Review this code',
        source: 'codex' as const,
      };

      const key1 = generateCacheKey(params);
      const key2 = generateCacheKey(params);

      expect(key1).toBe(key2);
    });

    it('should generate different keys for different prompts', () => {
      const params1 = {
        prompt: 'Review this code',
        source: 'codex' as const,
      };

      const params2 = {
        prompt: 'Different prompt',
        source: 'codex' as const,
      };

      const key1 = generateCacheKey(params1);
      const key2 = generateCacheKey(params2);

      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different sources', () => {
      const params1 = {
        prompt: 'Review this code',
        source: 'codex' as const,
      };

      const params2 = {
        prompt: 'Review this code',
        source: 'gemini' as const,
      };

      const key1 = generateCacheKey(params1);
      const key2 = generateCacheKey(params2);

      expect(key1).not.toBe(key2);
    });

    it('should include context in key generation', () => {
      const params1 = {
        prompt: 'Review this code',
        source: 'codex' as const,
        context: { language: 'typescript' },
      };

      const params2 = {
        prompt: 'Review this code',
        source: 'codex' as const,
        context: { language: 'javascript' },
      };

      const key1 = generateCacheKey(params1);
      const key2 = generateCacheKey(params2);

      expect(key1).not.toBe(key2);
    });

    it('should normalize context for consistent hashing', () => {
      const params1 = {
        prompt: 'Review this code',
        source: 'codex' as const,
        context: { language: 'TypeScript' },
      };

      const params2 = {
        prompt: 'Review this code',
        source: 'codex' as const,
        context: { language: 'typescript' },
      };

      const key1 = generateCacheKey(params1);
      const key2 = generateCacheKey(params2);

      expect(key1).toBe(key2);
    });

    it('should sort focus array for consistent hashing', () => {
      const params1 = {
        prompt: 'Review this code',
        source: 'codex' as const,
        context: { focus: ['security', 'performance'] },
      };

      const params2 = {
        prompt: 'Review this code',
        source: 'codex' as const,
        context: { focus: ['performance', 'security'] },
      };

      const key1 = generateCacheKey(params1);
      const key2 = generateCacheKey(params2);

      expect(key1).toBe(key2);
    });

    it('should generate SHA-256 hash (64 characters)', () => {
      const params = {
        prompt: 'Review this code',
        source: 'codex' as const,
      };

      const key = generateCacheKey(params);

      expect(key).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('generateShortCacheKey', () => {
    it('should return first 16 characters of hash', () => {
      const params = {
        prompt: 'Review this code',
        source: 'codex' as const,
      };

      const fullKey = generateCacheKey(params);
      const shortKey = generateShortCacheKey(params);

      expect(shortKey).toBe(fullKey.substring(0, 16));
      expect(shortKey.length).toBe(16);
    });
  });

  describe('generatePromptHash', () => {
    it('should generate consistent hash for same prompt', () => {
      const hash1 = generatePromptHash('Review this code');
      const hash2 = generatePromptHash('Review this code');

      expect(hash1).toBe(hash2);
    });

    it('should generate different hash for different prompts', () => {
      const hash1 = generatePromptHash('Review this code');
      const hash2 = generatePromptHash('Different prompt');

      expect(hash1).not.toBe(hash2);
    });

    it('should return 32 character hash', () => {
      const hash = generatePromptHash('Review this code');

      expect(hash.length).toBe(32);
      expect(hash).toMatch(/^[a-f0-9]{32}$/);
    });
  });
});
