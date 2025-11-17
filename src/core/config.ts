/**
 * Configuration management with validation
 */

import { cosmiconfig } from 'cosmiconfig';

import defaultConfig from '../../config/default.json' assert { type: 'json' };
import { ServerConfigSchema, type ServerConfig } from '../schemas/config.js';

import { ConfigurationError } from './error-handler.js';

export class ConfigManager {
  private static instance: ConfigManager | null = null;
  private config: ServerConfig;

  private constructor(config: ServerConfig) {
    this.config = config;
  }

  /**
   * Load configuration from multiple sources
   */
  static async load(): Promise<ServerConfig> {
    try {
      // Start with default config (cast to any first to avoid type issues with JSON import)
      let config: Partial<ServerConfig> = { ...(defaultConfig as any) };

      // Try to load from config file
      const explorer = cosmiconfig('code-review-mcp');
      const result = await explorer.search();

      if (result?.config) {
        config = this.mergeConfig(config, result.config);
      }

      // Override with environment variables
      config = this.applyEnvironmentOverrides(config);

      // Validate configuration
      const validated = ServerConfigSchema.parse(config);

      // Create singleton instance
      ConfigManager.instance = new ConfigManager(validated);

      return validated;
    } catch (error) {
      if (error instanceof Error) {
        throw new ConfigurationError('Failed to load configuration', { cause: error });
      }
      throw error;
    }
  }

  /**
   * Get current configuration
   */
  static get(): ServerConfig {
    if (!ConfigManager.instance) {
      throw new ConfigurationError('Configuration not initialized. Call ConfigManager.load() first');
    }
    return ConfigManager.instance.config;
  }

  /**
   * Merge two configuration objects
   */
  private static mergeConfig(base: Partial<ServerConfig>, override: Partial<ServerConfig>): Partial<ServerConfig> {
    const result: Partial<ServerConfig> = {};

    // Merge server
    if (base.server || override.server) {
      result.server = { ...base.server, ...override.server } as ServerConfig['server'];
    }

    // Merge codex
    if (base.codex || override.codex) {
      result.codex = { ...base.codex, ...override.codex } as ServerConfig['codex'];
    }

    // Merge gemini
    if (base.gemini || override.gemini) {
      result.gemini = { ...base.gemini, ...override.gemini } as ServerConfig['gemini'];
    }

    // Merge review
    if (base.review || override.review) {
      result.review = {
        ...base.review,
        ...override.review,
        deduplication: {
          ...base.review?.deduplication,
          ...override.review?.deduplication,
        },
      } as ServerConfig['review'];
    }

    // Merge retry
    if (base.retry || override.retry) {
      result.retry = { ...base.retry, ...override.retry } as ServerConfig['retry'];
    }

    // Merge logging
    if (base.logging || override.logging) {
      result.logging = {
        ...base.logging,
        ...override.logging,
        file: {
          ...base.logging?.file,
          ...override.logging?.file,
        },
      } as ServerConfig['logging'];
    }

    // Merge cache
    if (base.cache || override.cache) {
      result.cache = { ...base.cache, ...override.cache } as ServerConfig['cache'];
    }

    return result;
  }

  /**
   * Apply environment variable overrides
   */
  private static applyEnvironmentOverrides(config: Partial<ServerConfig>): Partial<ServerConfig> {
    const env = process.env;
    const result: Partial<ServerConfig> = { ...config };

    // Server overrides
    if (env.CODE_REVIEW_MCP_LOG_LEVEL && result.server) {
      result.server.logLevel = env.CODE_REVIEW_MCP_LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error';
      // Also update logging.level to maintain consistency
      if (result.logging) {
        result.logging.level = env.CODE_REVIEW_MCP_LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error';
      }
    }

    // Codex overrides
    if (result.codex) {
      if (env.CODEX_ENABLED !== undefined) {
        result.codex.enabled = env.CODEX_ENABLED === 'true';
      }
      if (env.CODEX_CLI_PATH) {
        result.codex.cliPath = env.CODEX_CLI_PATH;
      }
      if (env.CODEX_TIMEOUT) {
        result.codex.timeout = parseInt(env.CODEX_TIMEOUT, 10);
      }
      if (env.CODEX_RETRY_ATTEMPTS) {
        result.codex.retryAttempts = parseInt(env.CODEX_RETRY_ATTEMPTS, 10);
      }
      if (env.CODEX_MODEL) {
        result.codex.model = env.CODEX_MODEL;
      }
    }

    // Gemini overrides
    if (result.gemini) {
      if (env.GEMINI_ENABLED !== undefined) {
        result.gemini.enabled = env.GEMINI_ENABLED === 'true';
      }
      if (env.GEMINI_CLI_PATH) {
        result.gemini.cliPath = env.GEMINI_CLI_PATH;
      }
      if (env.GEMINI_TIMEOUT) {
        result.gemini.timeout = parseInt(env.GEMINI_TIMEOUT, 10);
      }
      if (env.GEMINI_MODEL) {
        result.gemini.model = env.GEMINI_MODEL;
      }
    }

    // Review overrides
    if (result.review) {
      if (env.REVIEW_MAX_CODE_LENGTH) {
        result.review.maxCodeLength = parseInt(env.REVIEW_MAX_CODE_LENGTH, 10);
      }
      if (env.REVIEW_INCLUDE_CONTEXT !== undefined) {
        result.review.includeContext = env.REVIEW_INCLUDE_CONTEXT === 'true';
      }
    }

    // Logging overrides
    if (result.logging) {
      if (env.LOG_LEVEL) {
        result.logging.level = env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error';
      }
      if (env.LOG_PRETTY !== undefined) {
        result.logging.pretty = env.LOG_PRETTY === 'true';
      }
    }

    // Cache overrides
    if (result.cache && env.ENABLE_CACHE !== undefined) {
      result.cache.enabled = env.ENABLE_CACHE === 'true';
    }

    return result;
  }

  /**
   * Update configuration at runtime (for testing)
   */
  static update(updates: Partial<ServerConfig>): void {
    if (!ConfigManager.instance) {
      throw new ConfigurationError('Configuration not initialized');
    }

    const merged = this.mergeConfig(ConfigManager.instance.config, updates);
    const validated = ServerConfigSchema.parse(merged);
    ConfigManager.instance.config = validated;
  }

  /**
   * Reset configuration (for testing)
   */
  static reset(): void {
    ConfigManager.instance = null;
  }
}
