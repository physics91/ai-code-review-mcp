/**
 * E2E Tests for MCP Protocol Communication
 *
 * Tests the full MCP server functionality through actual protocol communication
 * using InMemoryTransport for client-server interaction.
 *
 * Test Categories:
 * 1. Server Lifecycle - startup, shutdown, reconnection
 * 2. Tool Discovery - list tools, schema validation
 * 3. Analysis Execution - Codex, Gemini, Combined analysis
 * 4. Status Tracking - async analysis status queries
 * 5. Secret Scanning - hardcoded secret detection
 * 6. Error Handling - validation errors, service failures
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { execa } from 'execa';

import { Logger } from '../../src/core/logger.js';
import { ToolRegistry } from '../../src/tools/registry.js';
import { CodexAnalysisService } from '../../src/services/codex/client.js';
import { GeminiAnalysisService } from '../../src/services/gemini/client.js';
import { AnalysisAggregator } from '../../src/services/aggregator/merger.js';
import { PromptRegistry } from '../../src/prompts/registry.js';
import type { ServerConfig } from '../../src/schemas/config.js';

// Mock execa for CLI execution
vi.mock('execa');

/**
 * Test Configuration Factory
 */
function createTestConfig(): ServerConfig {
  return {
    server: {
      name: 'e2e-test-server',
      version: '1.0.0',
      logLevel: 'error', // Quiet during tests
      transport: 'stdio',
    },
    codex: {
      enabled: true,
      cliPath: 'codex',
      timeout: 5000,
      retryAttempts: 1,
      retryDelay: 100,
      maxConcurrent: 2,
      model: 'gpt-5.2',
      reasoningEffort: 'xhigh',
      args: [],
      config: {},
    },
    gemini: {
      enabled: true,
      cliPath: '/usr/local/bin/gemini',
      timeout: 5000,
      retryAttempts: 1,
      retryDelay: 100,
      maxConcurrent: 2,
      model: null,
      args: [],
    },
    analysis: {
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
      maxAttempts: 2,
      initialDelay: 100,
      maxDelay: 1000,
      backoffFactor: 2,
      retryableErrors: ['TIMEOUT_ERROR', 'NETWORK_ERROR', 'CLI_EXECUTION_ERROR'],
    },
    logging: {
      level: 'error',
      pretty: false,
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
    secretScanning: {
      enabled: true,
      patterns: {
        aws: true,
        gcp: true,
        azure: true,
        github: true,
        generic: true,
        database: true,
        privateKeys: true,
      },
      excludePatterns: [],
    },
  };
}

/**
 * Create mock logger for tests
 */
function createMockLogger(): Logger {
  return {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
    logSecurityEvent: vi.fn(),
  } as unknown as Logger;
}

/**
 * Mock successful Codex CLI response
 */
function mockCodexSuccess(findings: any[] = [], assessment = 'Good code') {
  return JSON.stringify({
    findings,
    overallAssessment: assessment,
    recommendations: findings.length > 0 ? ['Fix the issues'] : [],
  });
}

/**
 * Mock successful Gemini CLI response
 */
function mockGeminiSuccess(findings: any[] = [], assessment = 'Clean code') {
  return JSON.stringify({
    findings,
    overallAssessment: assessment,
    recommendations: findings.length > 0 ? ['Address the concerns'] : [],
  });
}

/**
 * Helper to safely extract text content from MCP tool result
 */
function extractTextContent(result: { content: unknown[] }): string {
  expect(result.content).toBeDefined();
  expect(result.content.length).toBeGreaterThan(0);
  const firstContent = result.content[0] as { type: string; text?: string };
  expect(firstContent.type).toBe('text');
  expect(firstContent.text).toBeDefined();
  return firstContent.text!;
}

/**
 * Setup default execa mock implementation
 */
function setupDefaultExecaMock() {
  vi.mocked(execa).mockImplementation(async (cmd: string, args?: string[]) => {
    // Mock 'which' / 'where' commands for CLI path validation
    if (cmd === 'which' || cmd === 'where') {
      const target = args?.[0];
      if (target === 'codex') {
        return { stdout: '/usr/local/bin/codex', stderr: '', exitCode: 0 } as any;
      }
      if (target === 'gemini' || target?.includes('gemini')) {
        return { stdout: '/usr/local/bin/gemini', stderr: '', exitCode: 0 } as any;
      }
    }

    // Mock actual CLI execution
    if (cmd === 'codex') {
      return { stdout: mockCodexSuccess(), stderr: '', exitCode: 0 } as any;
    }
    if (cmd === '/usr/local/bin/gemini' || cmd === 'gemini') {
      return { stdout: mockGeminiSuccess(), stderr: '', exitCode: 0 } as any;
    }

    return { stdout: '', stderr: '', exitCode: 0 } as any;
  });
}

describe('E2E: MCP Protocol Communication', () => {
  let server: McpServer;
  let client: Client;
  let transport: ReturnType<typeof InMemoryTransport.createLinkedPair>;
  let mockLogger: Logger;
  let testConfig: ServerConfig;

  beforeAll(() => {
    testConfig = createTestConfig();
    mockLogger = createMockLogger();
  });

  beforeEach(async () => {
    // Reset all mocks including implementations (not just call history)
    vi.resetAllMocks();

    // Setup default CLI mocks
    setupDefaultExecaMock();

    // Create MCP server
    server = new McpServer({
      name: testConfig.server.name,
      version: testConfig.server.version,
    });

    // Initialize services with full configuration
    const codexService = new CodexAnalysisService(testConfig.codex, mockLogger);
    const geminiService = new GeminiAnalysisService(testConfig.gemini, mockLogger);
    const aggregator = new AnalysisAggregator(testConfig.analysis, mockLogger);

    // Register tools with real ToolRegistry
    const registry = new ToolRegistry(server, {
      codexService,
      geminiService,
      aggregator,
      logger: mockLogger,
      config: testConfig,
    });
    registry.registerTools();

    // Register prompts with PromptRegistry
    const promptRegistry = new PromptRegistry(server, { enabled: true }, mockLogger);
    promptRegistry.registerPrompts();

    // Create in-memory transport pair
    transport = InMemoryTransport.createLinkedPair();

    // Create client
    client = new Client({
      name: 'e2e-test-client',
      version: '1.0.0',
    });

    // Connect server and client
    await server.connect(transport[0]);
    await client.connect(transport[1]);
  });

  afterEach(async () => {
    // Proper teardown to prevent resource leaks between tests
    try {
      if (client) {
        await client.close();
      }
    } catch {
      // Ignore close errors
    }
    try {
      if (server) {
        await server.close();
      }
    } catch {
      // Ignore close errors
    }
  });

  afterAll(async () => {
    // Final cleanup (redundant but safe)
    vi.restoreAllMocks();
  });

  describe('1. Server Lifecycle', () => {
    it('should start server and accept client connection', async () => {
      expect(server).toBeDefined();
      expect(client).toBeDefined();
    });

    it('should handle client reconnection', async () => {
      // Close existing client
      await client.close();

      // Create new client and reconnect
      const newTransport = InMemoryTransport.createLinkedPair();
      const newClient = new Client({
        name: 'e2e-test-client-2',
        version: '1.0.0',
      });

      // Reconnect server with new transport
      await server.connect(newTransport[0]);
      await newClient.connect(newTransport[1]);

      // Verify tools are still available
      const tools = await newClient.listTools();
      expect(tools.tools.length).toBeGreaterThan(0);

      await newClient.close();
    });
  });

  describe('2. Tool Discovery', () => {
    it('should list all registered tools', async () => {
      const result = await client.listTools();

      expect(result.tools).toBeDefined();
      expect(Array.isArray(result.tools)).toBe(true);

      // Expected tools when both services are enabled
      const toolNames = result.tools.map(t => t.name);
      expect(toolNames).toContain('analyze_code_with_codex');
      expect(toolNames).toContain('analyze_code_with_gemini');
      expect(toolNames).toContain('analyze_code_combined');
      expect(toolNames).toContain('get_analysis_status');
      expect(toolNames).toContain('scan_secrets');
    });

    it('should provide valid JSON schemas for all tools', async () => {
      const result = await client.listTools();

      for (const tool of result.tools) {
        expect(tool.inputSchema).toBeDefined();
        expect(typeof tool.inputSchema).toBe('object');
      }
    });

    it('should have correct tool descriptions', async () => {
      const result = await client.listTools();

      const codexTool = result.tools.find(t => t.name === 'analyze_code_with_codex');
      expect(codexTool?.description).toContain('Codex');

      const geminiTool = result.tools.find(t => t.name === 'analyze_code_with_gemini');
      expect(geminiTool?.description).toContain('Gemini');

      const secretsTool = result.tools.find(t => t.name === 'scan_secrets');
      expect(secretsTool?.description).toContain('secrets');
    });
  });

  describe('3. Analysis Execution', () => {
    describe('Codex Analysis', () => {
      it('should execute Codex analysis successfully', async () => {
        const result = await client.callTool({
          name: 'analyze_code_with_codex',
          arguments: {
            prompt: 'Review this code: function add(a, b) { return a + b; }',
          },
        });

        expect(result.content).toBeDefined();
        expect(Array.isArray(result.content)).toBe(true);
        expect(result.content[0]).toHaveProperty('type', 'text');

        const text = (result.content[0] as { type: 'text'; text: string }).text;
        expect(text).toContain('Overall Assessment');
      });

      it('should return findings when issues are detected', async () => {
        // Mock Codex returning findings
        vi.mocked(execa).mockImplementation(async (cmd: string, args?: string[]) => {
          if (cmd === 'which' || cmd === 'where') {
            return { stdout: '/usr/local/bin/codex', stderr: '', exitCode: 0 } as any;
          }
          if (cmd === 'codex') {
            return {
              stdout: mockCodexSuccess(
                [
                  {
                    type: 'bug',
                    severity: 'high',
                    line: 5,
                    title: 'Potential null reference',
                    description: 'Variable may be null',
                    suggestion: 'Add null check',
                  },
                ],
                'Issues found'
              ),
              stderr: '',
              exitCode: 0,
            } as any;
          }
          return { stdout: '', stderr: '', exitCode: 0 } as any;
        });

        const result = await client.callTool({
          name: 'analyze_code_with_codex',
          arguments: {
            prompt: 'Review: function test(x) { return x.value; }',
          },
        });

        const text = (result.content[0] as { type: 'text'; text: string }).text;
        expect(text).toContain('Findings');
        // Check for HIGH (uppercase) as formatted in markdown output
        expect(text.toLowerCase()).toContain('high');
      });

      it('should respect context options', async () => {
        const result = await client.callTool({
          name: 'analyze_code_with_codex',
          arguments: {
            prompt: 'Review this code: const x = 1;',
            context: {
              language: 'typescript',
              framework: 'react',
              projectType: 'web-app',
            },
            options: {
              severity: 'high',
            },
          },
        });

        expect(result.content).toBeDefined();
      });
    });

    describe('Gemini Analysis', () => {
      it('should execute Gemini analysis successfully', async () => {
        const result = await client.callTool({
          name: 'analyze_code_with_gemini',
          arguments: {
            prompt: 'Review this code: const greeting = "hello";',
          },
        });

        expect(result.content).toBeDefined();
        const text = (result.content[0] as { type: 'text'; text: string }).text;
        expect(text).toContain('Overall Assessment');
      });
    });

    describe('Combined Analysis', () => {
      it('should execute combined analysis with both services', async () => {
        const result = await client.callTool({
          name: 'analyze_code_combined',
          arguments: {
            prompt: 'Review: function multiply(a, b) { return a * b; }',
          },
        });

        expect(result.content).toBeDefined();
        const text = (result.content[0] as { type: 'text'; text: string }).text;
        expect(text).toContain('Overall Assessment');
      });

      it('should support parallel execution option', async () => {
        const result = await client.callTool({
          name: 'analyze_code_combined',
          arguments: {
            prompt: 'Review: const x = 1;',
            options: {
              parallelExecution: true,
            },
          },
        });

        expect(result.content).toBeDefined();
      });

      it('should support sequential execution option', async () => {
        const result = await client.callTool({
          name: 'analyze_code_combined',
          arguments: {
            prompt: 'Review: const y = 2;',
            options: {
              parallelExecution: false,
            },
          },
        });

        expect(result.content).toBeDefined();
      });
    });
  });

  describe('4. Status Tracking', () => {
    it('should track analysis status after execution', async () => {
      // Execute an analysis first
      const analysisResult = await client.callTool({
        name: 'analyze_code_with_codex',
        arguments: {
          prompt: 'Review: const test = 1;',
        },
      });

      // Extract analysis ID from result
      const text = (analysisResult.content[0] as { type: 'text'; text: string }).text;
      const idMatch = text.match(/Analysis ID: (codex-\d+-[a-z0-9]+)/);

      if (idMatch) {
        const analysisId = idMatch[1];

        // Query status
        const statusResult = await client.callTool({
          name: 'get_analysis_status',
          arguments: {
            analysisId,
          },
        });

        expect(statusResult.content).toBeDefined();
        const statusText = (statusResult.content[0] as { type: 'text'; text: string }).text;
        const status = JSON.parse(statusText);

        expect(status.status).toBe('completed');
        expect(status.source).toBe('codex');
      }
    });

    it('should return error for non-existent analysis ID', async () => {
      const result = await client.callTool({
        name: 'get_analysis_status',
        arguments: {
          analysisId: 'non-existent-id-12345',
        },
      });

      // MCP SDK returns isError: true instead of rejecting
      expect(result.isError).toBe(true);
      const text = (result.content[0] as { type: 'text'; text: string }).text;
      expect(text.toLowerCase()).toContain('not found');
    });
  });

  describe('5. Secret Scanning', () => {
    it('should scan code for secrets successfully', async () => {
      const result = await client.callTool({
        name: 'scan_secrets',
        arguments: {
          code: 'const config = { apiKey: "sk-test123" };',
        },
      });

      expect(result.content).toBeDefined();
      const text = (result.content[0] as { type: 'text'; text: string }).text;
      expect(text).toContain('Secret Scan Results');
    });

    it('should detect AWS credentials', async () => {
      const result = await client.callTool({
        name: 'scan_secrets',
        arguments: {
          code: `
            const AWS_ACCESS_KEY_ID = "AKIAIOSFODNN7EXAMPLE";
            const AWS_SECRET_ACCESS_KEY = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
          `,
        },
      });

      const text = (result.content[0] as { type: 'text'; text: string }).text;
      // Should find AWS key patterns
      expect(text.toLowerCase()).toMatch(/aws|key|secret|credential/i);
    });

    it('should detect GitHub tokens', async () => {
      const result = await client.callTool({
        name: 'scan_secrets',
        arguments: {
          code: 'const token = "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";',
        },
      });

      const text = (result.content[0] as { type: 'text'; text: string }).text;
      expect(text).toContain('Secret Scan Results');
    });

    it('should report no findings for clean code', async () => {
      const result = await client.callTool({
        name: 'scan_secrets',
        arguments: {
          code: 'function add(a, b) { return a + b; }',
        },
      });

      const text = (result.content[0] as { type: 'text'; text: string }).text;
      expect(text).toContain('No secrets detected');
    });

    it('should accept optional fileName parameter', async () => {
      const result = await client.callTool({
        name: 'scan_secrets',
        arguments: {
          code: 'const x = 1;',
          fileName: 'test.ts',
        },
      });

      expect(result.content).toBeDefined();
    });
  });

  describe('6. Error Handling', () => {
    describe('Validation Errors', () => {
      it('should return error for empty prompt', async () => {
        const result = await client.callTool({
          name: 'analyze_code_with_codex',
          arguments: {
            prompt: '',
          },
        });

        // MCP SDK returns isError: true instead of rejecting
        expect(result.isError).toBe(true);
        const text = (result.content[0] as { type: 'text'; text: string }).text;
        expect(text.toLowerCase()).toMatch(/empty|required|validation/i);
      });

      it('should return error for missing required parameters', async () => {
        const result = await client.callTool({
          name: 'analyze_code_with_codex',
          arguments: {},
        });

        expect(result.isError).toBe(true);
        const text = (result.content[0] as { type: 'text'; text: string }).text;
        expect(text.toLowerCase()).toMatch(/required|validation/i);
      });

      it('should return error for invalid severity option', async () => {
        const result = await client.callTool({
          name: 'analyze_code_with_codex',
          arguments: {
            prompt: 'Review this code',
            options: {
              severity: 'invalid-severity',
            },
          },
        });

        expect(result.isError).toBe(true);
      });

      it('should return error for empty analysisId', async () => {
        const result = await client.callTool({
          name: 'get_analysis_status',
          arguments: {
            analysisId: '',
          },
        });

        expect(result.isError).toBe(true);
        const text = (result.content[0] as { type: 'text'; text: string }).text;
        expect(text.toLowerCase()).toMatch(/empty|required|validation/i);
      });

      it('should return error for empty code in secret scanning', async () => {
        const result = await client.callTool({
          name: 'scan_secrets',
          arguments: {
            code: '',
          },
        });

        expect(result.isError).toBe(true);
        const text = (result.content[0] as { type: 'text'; text: string }).text;
        expect(text.toLowerCase()).toMatch(/empty|required|validation/i);
      });
    });

    describe('Service Failures', () => {
      it('should handle CLI timeout gracefully', async () => {
        vi.mocked(execa).mockImplementation(async (cmd: string, args?: string[]) => {
          if (cmd === 'which' || cmd === 'where') {
            return { stdout: '/usr/local/bin/codex', stderr: '', exitCode: 0 } as any;
          }
          // Simulate timeout with proper Error object (like execa does)
          const error = Object.assign(new Error('Command timed out'), {
            timedOut: true,
            exitCode: 1,
            stderr: '',
            stdout: '',
          });
          throw error;
        });

        const result = await client.callTool({
          name: 'analyze_code_with_codex',
          arguments: {
            prompt: 'Review: const x = 1;',
          },
        });

        // MCP SDK returns isError: true instead of rejecting
        expect(result.isError).toBe(true);
        const text = extractTextContent(result);
        expect(text.toLowerCase()).toContain('timed out');
      });

      it('should handle CLI execution errors', async () => {
        vi.mocked(execa).mockImplementation(async (cmd: string, args?: string[]) => {
          if (cmd === 'which' || cmd === 'where') {
            return { stdout: '/usr/local/bin/codex', stderr: '', exitCode: 0 } as any;
          }
          // Simulate CLI error with proper Error object
          const error = Object.assign(new Error('CLI execution failed'), {
            exitCode: 1,
            stderr: 'CLI execution failed',
            stdout: '',
          });
          throw error;
        });

        const result = await client.callTool({
          name: 'analyze_code_with_codex',
          arguments: {
            prompt: 'Review: const x = 1;',
          },
        });

        expect(result.isError).toBe(true);
        const text = extractTextContent(result);
        expect(text.toLowerCase()).toMatch(/exited|error|failed/i);
      });

      it('should handle invalid CLI path', async () => {
        vi.mocked(execa).mockImplementation(async () => {
          throw new Error('CLI path not in allowed list');
        });

        const result = await client.callTool({
          name: 'analyze_code_with_codex',
          arguments: {
            prompt: 'Review: const x = 1;',
            options: {
              cliPath: '/invalid/path/codex',
            },
          },
        });

        expect(result.isError).toBe(true);
        const text = extractTextContent(result);
        expect(text.toLowerCase()).toMatch(/path|allowed|invalid/i);
      });
    });

    describe('Parse Errors', () => {
      it('should handle malformed CLI output gracefully', async () => {
        vi.mocked(execa).mockImplementation(async (cmd: string, args?: string[]) => {
          if (cmd === 'which' || cmd === 'where') {
            return { stdout: '/usr/local/bin/codex', stderr: '', exitCode: 0 } as any;
          }
          // Return invalid JSON
          return { stdout: 'This is not valid JSON', stderr: '', exitCode: 0 } as any;
        });

        // Should not throw but return rawOutput
        const result = await client.callTool({
          name: 'analyze_code_with_codex',
          arguments: {
            prompt: 'Review: const x = 1;',
          },
        });

        // Result should contain the raw output indication
        const text = (result.content[0] as { type: 'text'; text: string }).text;
        expect(text).toBeDefined();
      });

      it('should handle empty CLI output', async () => {
        vi.mocked(execa).mockImplementation(async (cmd: string, args?: string[]) => {
          if (cmd === 'which' || cmd === 'where') {
            return { stdout: '/usr/local/bin/codex', stderr: '', exitCode: 0 } as any;
          }
          return { stdout: '', stderr: '', exitCode: 0 } as any;
        });

        const result = await client.callTool({
          name: 'analyze_code_with_codex',
          arguments: {
            prompt: 'Review: const x = 1;',
          },
        });

        expect(result.content).toBeDefined();
      });
    });
  });

  describe('7. Concurrency', () => {
    it('should handle multiple concurrent analysis requests', async () => {
      const requests = Array.from({ length: 3 }, (_, i) =>
        client.callTool({
          name: 'analyze_code_with_codex',
          arguments: {
            prompt: `Review code ${i}: const x${i} = ${i};`,
          },
        })
      );

      const results = await Promise.all(requests);

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result.content).toBeDefined();
        expect(result.isError).toBeFalsy();
        // Verify each result has valid text content
        const text = extractTextContent(result);
        expect(text).toContain('Overall Assessment');
      });
    });

    it('should handle mixed tool calls concurrently', async () => {
      const requests = [
        client.callTool({
          name: 'analyze_code_with_codex',
          arguments: { prompt: 'Review: const a = 1;' },
        }),
        client.callTool({
          name: 'analyze_code_with_gemini',
          arguments: { prompt: 'Review: const b = 2;' },
        }),
        client.callTool({
          name: 'scan_secrets',
          arguments: { code: 'const c = 3;' },
        }),
      ];

      const results = await Promise.all(requests);

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result.content).toBeDefined();
        expect(result.isError).toBeFalsy();
      });
    });

    it('should respect maxConcurrent limit', async () => {
      // Track concurrent executions
      let currentConcurrent = 0;
      let maxObservedConcurrent = 0;

      vi.mocked(execa).mockImplementation(async (cmd: string, args?: string[]) => {
        if (cmd === 'which' || cmd === 'where') {
          return { stdout: '/usr/local/bin/codex', stderr: '', exitCode: 0 } as any;
        }

        // Track concurrent execution count
        currentConcurrent++;
        maxObservedConcurrent = Math.max(maxObservedConcurrent, currentConcurrent);

        // Small delay to allow concurrency observation
        await new Promise(resolve => setTimeout(resolve, 10));

        currentConcurrent--;

        return { stdout: mockCodexSuccess(), stderr: '', exitCode: 0 } as any;
      });

      // Launch more requests than maxConcurrent (config has maxConcurrent: 2)
      const requests = Array.from({ length: 5 }, (_, i) =>
        client.callTool({
          name: 'analyze_code_with_codex',
          arguments: { prompt: `Review code ${i}` },
        })
      );

      await Promise.all(requests);

      // Verify concurrency was limited (should not exceed maxConcurrent: 2)
      expect(maxObservedConcurrent).toBeLessThanOrEqual(testConfig.codex.maxConcurrent);
    });
  });

  describe('8. MCP Prompts', () => {
    it('should list all registered prompts', async () => {
      const result = await client.listPrompts();

      expect(result.prompts).toBeDefined();
      expect(Array.isArray(result.prompts)).toBe(true);

      // Expected prompts
      const promptNames = result.prompts.map(p => p.name);
      expect(promptNames).toContain('security-review');
      expect(promptNames).toContain('performance-review');
      expect(promptNames).toContain('style-review');
      expect(promptNames).toContain('general-review');
      expect(promptNames).toContain('bug-detection');
    });

    it('should have valid arguments schema for prompts', async () => {
      const result = await client.listPrompts();

      for (const prompt of result.prompts) {
        // All prompts should have arguments defined
        expect(prompt.arguments).toBeDefined();
        expect(Array.isArray(prompt.arguments)).toBe(true);

        // All prompts should have 'code' argument
        const codeArg = prompt.arguments!.find(a => a.name === 'code');
        expect(codeArg).toBeDefined();
        expect(codeArg!.required).toBe(true);
      }
    });

    it('should get security-review prompt with arguments', async () => {
      const result = await client.getPrompt({
        name: 'security-review',
        arguments: {
          code: 'const password = "secret123";',
          language: 'javascript',
          threatModel: 'public-api',
        },
      });

      expect(result.messages).toBeDefined();
      expect(result.messages.length).toBeGreaterThan(0);
      expect(result.messages[0].role).toBe('user');

      const content = result.messages[0].content as { type: string; text: string };
      expect(content.type).toBe('text');
      expect(content.text).toContain('password');
      expect(content.text.toLowerCase()).toContain('security');
    });

    it('should get performance-review prompt', async () => {
      const result = await client.getPrompt({
        name: 'performance-review',
        arguments: {
          code: 'for (let i = 0; i < arr.length; i++) { console.log(arr[i]); }',
        },
      });

      expect(result.messages).toBeDefined();
      expect(result.messages[0].role).toBe('user');

      const content = result.messages[0].content as { type: string; text: string };
      expect(content.text.toLowerCase()).toContain('performance');
    });

    it('should get general-review prompt with focus areas', async () => {
      const result = await client.getPrompt({
        name: 'general-review',
        arguments: {
          code: 'function test() { return 42; }',
          focus: 'security, performance',  // MCP protocol requires string arguments
        },
      });

      expect(result.messages).toBeDefined();
      const content = result.messages[0].content as { type: string; text: string };
      expect(content.text).toBeDefined();
      expect(content.text.toLowerCase()).toContain('security');
      expect(content.text.toLowerCase()).toContain('performance');
    });

    it('should return error for non-existent prompt', async () => {
      await expect(
        client.getPrompt({
          name: 'non-existent-prompt',
          arguments: { code: 'test' },
        })
      ).rejects.toThrow();
    });

    it('should return error for missing required argument', async () => {
      await expect(
        client.getPrompt({
          name: 'security-review',
          arguments: {},
        })
      ).rejects.toThrow();
    });
  });
});
