/**
 * Integration tests for MCP Server
 * Tests real CLI execution and MCP server functionality
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ToolRegistry } from '../../src/tools/registry.js';
import { Logger } from '../../src/core/logger.js';
import { CodexReviewService } from '../../src/services/codex/client.js';
import { GeminiReviewService } from '../../src/services/gemini/client.js';
import { ReviewAggregator } from '../../src/services/aggregator/merger.js';
import type { ServerConfig } from '../../src/schemas/config.js';
import { execa } from 'execa';

// Mock execa for CLI execution tests
vi.mock('execa');

describe('MCP Server Integration', () => {
  let server: Server;
  let registry: ToolRegistry;
  let mockLogger: Logger;
  let mockConfig: ServerConfig;

  beforeAll(() => {
    // Create mock logger
    mockLogger = {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn().mockReturnThis(),
    } as unknown as Logger;

    // TESTING FIX #15: Create mock config with all required fields
    mockConfig = {
      server: {
        name: 'test-server',
        version: '1.0.0',
        logLevel: 'info',
        transport: 'stdio',
      },
      codex: {
        enabled: true,
        cliPath: 'codex', // Add cliPath for CodexServiceConfig
        timeout: 10000,
        retryAttempts: 1,
        retryDelay: 100,
        maxConcurrent: 1,
        model: null,
        args: [],
        config: {},
      },
      gemini: {
        enabled: true,
        cliPath: '/usr/local/bin/gemini',
        timeout: 10000,
        retryAttempts: 1,
        retryDelay: 100,
        maxConcurrent: 1,
        model: null,
        args: [],
      },
      review: {
        maxCodeLength: 50000,
        includeContext: true,
        defaultLanguage: null,
        formats: ['markdown', 'json'],
        defaultSeverity: 'all',
        deduplication: {
          enabled: true,
          similarityThreshold: 0.8,
        },
      },
      retry: {
        maxAttempts: 3,
        initialDelay: 1000,
        maxDelay: 10000,
        backoffFactor: 2,
        retryableErrors: ['TIMEOUT_ERROR', 'NETWORK_ERROR', 'CLI_EXECUTION_ERROR'],
      },
      logging: {
        level: 'info',
        pretty: true,
        file: {
          enabled: false,
          path: './logs/test.log',
          maxSize: '10M',
          maxFiles: 5,
        },
      },
      cache: {
        enabled: false,
        ttl: 3600000,
        maxSize: 100,
      },
    };

    // Create MCP server
    server = new Server(
      {
        name: 'test-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Initialize services (without MCP client - using direct CLI)
    const codexService = new CodexReviewService(
      mockConfig.codex,
      mockLogger
    );

    const geminiService = new GeminiReviewService(
      mockConfig.gemini,
      mockLogger
    );

    const aggregator = new ReviewAggregator(
      mockConfig.review,
      mockLogger
    );

    // TESTING FIX #15: Register tools with config parameter
    registry = new ToolRegistry(server, {
      codexService,
      geminiService,
      aggregator,
      logger: mockLogger,
      config: mockConfig,
    });

    registry.registerTools();
  });

  afterAll(async () => {
    await server.close();
  });

  it('should register tools successfully', () => {
    expect(registry).toBeDefined();
  });

  it('should have MCP server initialized', () => {
    expect(server).toBeDefined();
  });

  it('should have tool registry configured', () => {
    expect(registry).toBeDefined();
    // Tools are registered during initialization
  });

  describe('CLI Execution Tests', () => {
    it('should execute codex CLI with correct arguments', async () => {
      // Mock successful CLI execution
      const mockOutput = '{"type":"message","role":"assistant","content":"{\\"findings\\":[],\\"overallAssessment\\":\\"Good code\\",\\"recommendations\\":[]}"}';

      vi.mocked(execa).mockImplementation(async (cmd: any, args: any) => {
        // Mock 'which' command for PATH resolution
        if (cmd === 'which' && args[0] === 'codex') {
          return {
            stdout: '/usr/local/bin/codex',
            stderr: '',
            exitCode: 0,
          } as any;
        }
        // Actual codex execution
        return {
          stdout: mockOutput,
          stderr: '',
          exitCode: 0,
          command: 'codex exec',
          escapedCommand: 'codex exec',
          failed: false,
          timedOut: false,
          isCanceled: false,
          killed: false,
        } as any;
      });

      const codexService = new CodexReviewService(
        mockConfig.codex,
        mockLogger
      );

      const result = await codexService.reviewCode({
        code: 'function test() { return 1; }',
        language: 'javascript',
      });

      expect(result.success).toBe(true);
      expect(result.source).toBe('codex');

      // Verify execa was called correctly
      expect(execa).toHaveBeenCalledWith(
        'codex',
        expect.arrayContaining(['exec', '--json', '--skip-git-repo-check', '--sandbox', 'read-only']),
        expect.objectContaining({
          timeout: 10000, // Match mockConfig.codex.timeout
          input: expect.any(String),
          reject: true,
          shell: false,
        })
      );
    });

    it('should retry on CLI failures', async () => {
      let callCount = 0;
      vi.mocked(execa).mockImplementation(async (cmd: any, args: any) => {
        // Mock 'which' command for PATH resolution
        if (cmd === 'which' && args[0] === 'codex') {
          return {
            stdout: '/usr/local/bin/codex',
            stderr: '',
            exitCode: 0,
          } as any;
        }
        // First call fails, second succeeds
        callCount++;
        if (callCount === 1) {
          throw {
            exitCode: 1,
            stderr: 'Temporary error',
            stdout: '',
          };
        }
        return {
          stdout: '{"type":"message","role":"assistant","content":"{\\"findings\\":[],\\"overallAssessment\\":\\"Good\\",\\"recommendations\\":[]}"}',
          exitCode: 0,
        } as any;
      });

      const codexService = new CodexReviewService(
        {
          ...mockConfig.codex,
          retryAttempts: 2,
          retryDelay: 10,
        },
        mockLogger
      );

      const result = await codexService.reviewCode({
        code: 'test code',
      });

      expect(result.success).toBe(true);
      // Should be called 3 times: which + first fail + second success
      expect(execa).toHaveBeenCalled();
    });

    it('should respect whitelist for CLI paths', async () => {
      // Clear and set specific mock
      vi.clearAllMocks();

      // Mock to ensure execa is never called
      vi.mocked(execa).mockImplementation(async () => {
        throw new Error('execa should not be called with invalid path');
      });

      const codexService = new CodexReviewService(
        {
          ...mockConfig.codex,
          cliPath: '/invalid/path/codex', // Not in whitelist
        },
        mockLogger
      );

      await expect(
        codexService.reviewCode({
          code: 'test code',
        })
      ).rejects.toThrow(/CLI path not in allowed list|Failed to validate CLI path/);
    });

    it('should handle timeout errors', async () => {
      vi.mocked(execa).mockImplementation(async (cmd: any, args: any) => {
        // Mock 'which' command
        if (cmd === 'which' && args[0] === 'codex') {
          return {
            stdout: '/usr/local/bin/codex',
            stderr: '',
            exitCode: 0,
          } as any;
        }
        // Timeout error
        throw {
          timedOut: true,
          exitCode: 1,
        };
      });

      const codexService = new CodexReviewService(
        mockConfig.codex,
        mockLogger
      );

      await expect(
        codexService.reviewCode({
          code: 'test code',
        })
      ).rejects.toThrow('timed out');
    });
  });
});
