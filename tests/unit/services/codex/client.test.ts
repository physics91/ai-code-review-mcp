/**
 * Unit tests for CodexReviewService
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CodexReviewService } from '../../../../src/services/codex/client.js';
import { Logger } from '../../../../src/core/logger.js';
import { CLIExecutionError, ParseError } from '../../../../src/core/error-handler.js';
import { execa } from 'execa';

// Mock execa
vi.mock('execa');

describe('CodexReviewService', () => {
  let service: CodexReviewService;
  let mockLogger: Logger;

  beforeEach(() => {
    // Mock logger
    mockLogger = {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      logSecurityEvent: vi.fn(),
    } as unknown as Logger;

    // Mock 'which' command to always succeed for default 'codex' path
    vi.mocked(execa).mockImplementation(async (cmd: string, args: any) => {
      if (cmd === 'which' || cmd === 'where') {
        return {
          stdout: '/usr/local/bin/codex',
          stderr: '',
          exitCode: 0,
        } as any;
      }
      // Default mock for actual codex execution
      return {
        stdout: '{"type":"message","role":"assistant","content":"{\\"findings\\":[],\\"overallAssessment\\":\\"Good\\",\\"recommendations\\":[]}"}',
        stderr: '',
        exitCode: 0,
      } as any;
    });

    service = new CodexReviewService(
      {
        cliPath: 'codex',
        timeout: 10000,
        retryAttempts: 1,
        retryDelay: 100,
        args: [],
      },
      mockLogger
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('reviewCode', () => {
    it('should successfully review code', async () => {
      // Mock Codex CLI JSONL output
      const mockOutput = [
        '{"type":"message","role":"assistant","content":"{\\"findings\\":[{\\"type\\":\\"bug\\",\\"severity\\":\\"high\\",\\"line\\":10,\\"title\\":\\"Null pointer exception\\",\\"description\\":\\"Variable might be null\\",\\"suggestion\\":\\"Add null check\\"}],\\"overallAssessment\\":\\"Code has some issues\\",\\"recommendations\\":[\\"Add error handling\\"]}"}',
      ].join('\n');

      vi.mocked(execa).mockResolvedValue({
        stdout: mockOutput,
        stderr: '',
        exitCode: 0,
        command: 'codex exec',
        escapedCommand: 'codex exec',
        failed: false,
        timedOut: false,
        isCanceled: false,
        killed: false,
      } as any);

      const result = await service.reviewCode({
        code: 'function test() { return null.value; }',
        language: 'javascript',
      });

      expect(result.success).toBe(true);
      expect(result.source).toBe('codex');
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].type).toBe('bug');
      expect(result.summary.totalFindings).toBe(1);
      expect(result.summary.high).toBe(1);
    });

    it('should validate input parameters', async () => {
      await expect(
        service.reviewCode({
          code: '', // Invalid: empty code
        })
      ).rejects.toThrow();
    });

    it('should handle CLI execution errors', async () => {
      vi.mocked(execa).mockRejectedValue({
        exitCode: 1,
        stderr: 'CLI error',
        stdout: '',
      });

      await expect(
        service.reviewCode({
          code: 'test code',
        })
      ).rejects.toThrow('Codex CLI exited with code 1');
    });

    it('should handle timeout errors', async () => {
      vi.mocked(execa).mockRejectedValue({
        timedOut: true,
        exitCode: 1,
      });

      await expect(
        service.reviewCode({
          code: 'test code',
        })
      ).rejects.toThrow('Codex CLI timed out after');
    });

    it('should handle parse errors for invalid JSON', async () => {
      vi.mocked(execa).mockResolvedValue({
        stdout: 'This is not JSON',
        stderr: '',
        exitCode: 0,
      } as any);

      await expect(
        service.reviewCode({
          code: 'test code',
        })
      ).rejects.toThrow('No JSON found in Codex output');
    });

    it('should extract JSON from JSONL output', async () => {
      const mockOutput = [
        '{"type":"message","role":"assistant","content":"{\\"findings\\":[],\\"overallAssessment\\":\\"Good code\\",\\"recommendations\\":[]}"}',
      ].join('\n');

      vi.mocked(execa).mockResolvedValue({
        stdout: mockOutput,
        exitCode: 0,
      } as any);

      const result = await service.reviewCode({
        code: 'test code',
      });

      expect(result.success).toBe(true);
      expect(result.findings).toHaveLength(0);
    });

    it('should include metadata in response', async () => {
      const mockOutput = '{"type":"message","role":"assistant","content":"{\\"findings\\":[],\\"overallAssessment\\":\\"Good code\\",\\"recommendations\\":[]}"}';

      vi.mocked(execa).mockResolvedValue({
        stdout: mockOutput,
        exitCode: 0,
      } as any);

      const result = await service.reviewCode({
        code: 'const x = 1;\nconst y = 2;',
        language: 'javascript',
      });

      expect(result.metadata.linesOfCode).toBe(2);
      expect(result.metadata.language).toBe('javascript');
      expect(result.metadata.reviewDuration).toBeGreaterThanOrEqual(0);
    });

    it('should calculate summary correctly', async () => {
      const findings = [
        { type: 'bug', severity: 'critical', line: 1, title: 'Critical', description: 'Desc' },
        { type: 'security', severity: 'high', line: 2, title: 'High', description: 'Desc' },
        { type: 'performance', severity: 'medium', line: 3, title: 'Medium', description: 'Desc' },
        { type: 'style', severity: 'low', line: 4, title: 'Low', description: 'Desc' },
      ];

      const mockOutput = JSON.stringify({
        type: 'message',
        role: 'assistant',
        content: JSON.stringify({
          findings,
          overallAssessment: 'Mixed',
          recommendations: [],
        }),
      });

      vi.mocked(execa).mockResolvedValue({
        stdout: mockOutput,
        exitCode: 0,
      } as any);

      const result = await service.reviewCode({
        code: 'test code',
      });

      expect(result.summary.totalFindings).toBe(4);
      expect(result.summary.critical).toBe(1);
      expect(result.summary.high).toBe(1);
      expect(result.summary.medium).toBe(1);
      expect(result.summary.low).toBe(1);
    });

    it('should execute codex CLI with correct arguments', async () => {
      const mockOutput = '{"type":"message","role":"assistant","content":"{\\"findings\\":[],\\"overallAssessment\\":\\"Good\\",\\"recommendations\\":[]}"}';

      vi.mocked(execa).mockResolvedValue({
        stdout: mockOutput,
        exitCode: 0,
      } as any);

      await service.reviewCode({
        code: 'test code',
      });

      // Verify execa was called with correct arguments
      expect(execa).toHaveBeenCalledWith(
        'codex',
        expect.arrayContaining(['exec', '--json', '--skip-git-repo-check', '--sandbox', 'read-only']),
        expect.objectContaining({
          timeout: 10000,
          input: expect.any(String),
          reject: true,
          shell: false,
        })
      );
    });

    it('should use custom model if specified', async () => {
      const serviceWithModel = new CodexReviewService(
        {
          cliPath: 'codex',
          timeout: 10000,
          retryAttempts: 1,
          retryDelay: 100,
          model: 'claude-opus-4',
          args: [],
        },
        mockLogger
      );

      const mockOutput = '{"type":"message","role":"assistant","content":"{\\"findings\\":[],\\"overallAssessment\\":\\"Good\\",\\"recommendations\\":[]}"}';

      vi.mocked(execa).mockResolvedValue({
        stdout: mockOutput,
        exitCode: 0,
      } as any);

      await serviceWithModel.reviewCode({
        code: 'test code',
      });

      expect(execa).toHaveBeenCalledWith(
        'codex',
        expect.arrayContaining(['--model', 'claude-opus-4']),
        expect.any(Object)
      );
    });

    it('should filter findings by severity', async () => {
      const findings = [
        { type: 'bug', severity: 'critical', line: 1, title: 'Critical', description: 'Desc', suggestion: 'Fix' },
        { type: 'security', severity: 'high', line: 2, title: 'High', description: 'Desc', suggestion: 'Fix' },
        { type: 'performance', severity: 'medium', line: 3, title: 'Medium', description: 'Desc', suggestion: 'Fix' },
        { type: 'style', severity: 'low', line: 4, title: 'Low', description: 'Desc', suggestion: 'Fix' },
      ];

      const mockOutput = JSON.stringify({
        type: 'message',
        role: 'assistant',
        content: JSON.stringify({
          findings,
          overallAssessment: 'Mixed',
          recommendations: [],
        }),
      });

      vi.mocked(execa).mockResolvedValue({
        stdout: mockOutput,
        exitCode: 0,
      } as any);

      const result = await service.reviewCode({
        code: 'test code',
        options: {
          severity: 'high',
        },
      });

      expect(result.findings).toHaveLength(2);
      expect(result.findings.every(f => f.severity === 'critical' || f.severity === 'high')).toBe(true);
    });
  });

  describe('CLI Path Validation', () => {
    it('should accept whitelisted absolute paths', async () => {
      const whitelistedService = new CodexReviewService(
        {
          cliPath: '/usr/local/bin/codex',
          timeout: 10000,
          retryAttempts: 1,
          retryDelay: 100,
          args: [],
        },
        mockLogger
      );

      const mockOutput = '{"type":"message","role":"assistant","content":"{\\"findings\\":[],\\"overallAssessment\\":\\"Good\\",\\"recommendations\\":[]}"}';

      vi.mocked(execa).mockResolvedValue({
        stdout: mockOutput,
        exitCode: 0,
      } as any);

      const result = await whitelistedService.reviewCode({
        code: 'test code',
      });

      expect(result.success).toBe(true);
    });

    it('should reject non-whitelisted paths', async () => {
      // Clear beforeEach mock and set specific mock for this test
      vi.clearAllMocks();

      // Mock to simulate execution attempt (should never reach here if validation works)
      vi.mocked(execa).mockImplementation(async (cmd: any) => {
        // For any command, throw error
        throw new Error('execa should not be called with invalid path');
      });

      const invalidService = new CodexReviewService(
        {
          cliPath: '/suspicious/path/codex', // Not in whitelist
          timeout: 10000,
          retryAttempts: 0, // No retry to simplify
          retryDelay: 100,
          args: [],
        },
        mockLogger
      );

      await expect(
        invalidService.reviewCode({
          code: 'test code',
        })
      ).rejects.toThrow(/CLI path not in allowed list/);
    });

    it('should allow system PATH executable "codex"', async () => {
      // Mock 'which' command to return a valid path
      vi.mocked(execa).mockImplementation(async (cmd: string, args: any) => {
        if (cmd === 'which' && args[0] === 'codex') {
          return {
            stdout: '/usr/local/bin/codex',
            stderr: '',
            exitCode: 0,
          } as any;
        }
        // Actual codex execution
        return {
          stdout: '{"type":"message","role":"assistant","content":"{\\"findings\\":[],\\"overallAssessment\\":\\"Good\\",\\"recommendations\\":[]}"}',
          exitCode: 0,
        } as any;
      });

      const result = await service.reviewCode({
        code: 'test code',
      });

      expect(result.success).toBe(true);
    });

    it('should prevent PATH manipulation attacks', async () => {
      // This test only applies to non-Windows platforms where 'which' is used
      if (process.platform === 'win32') {
        // On Windows, skip this test as 'which' validation is not performed
        return;
      }

      // Clear and set specific mock
      vi.clearAllMocks();

      // Mock 'which' to return a path not in whitelist
      vi.mocked(execa).mockImplementation(async (cmd: string, args: any) => {
        if (cmd === 'which' && args?.[0] === 'codex') {
          return {
            stdout: '/malicious/codex', // Not in whitelist
            stderr: '',
            exitCode: 0,
          } as any;
        }
        // Should not reach codex execution
        throw new Error('Should not reach codex execution');
      });

      // Create new service instance with the mocked 'which'
      const testService = new CodexReviewService(
        {
          cliPath: 'codex', // Will use 'which' to resolve
          timeout: 10000,
          retryAttempts: 0,
          retryDelay: 100,
          args: [],
        },
        mockLogger
      );

      await expect(
        testService.reviewCode({
          code: 'test code',
        })
      ).rejects.toThrow(/Resolved CLI path not in allowed list/);
    });

    it('should handle per-request cliPath override', async () => {
      const mockOutput = '{"type":"message","role":"assistant","content":"{\\"findings\\":[],\\"overallAssessment\\":\\"Good\\",\\"recommendations\\":[]}"}';

      vi.mocked(execa).mockResolvedValue({
        stdout: mockOutput,
        exitCode: 0,
      } as any);

      // Per-request override with whitelisted path
      const result = await service.reviewCode({
        code: 'test code',
        options: {
          cliPath: '/usr/local/bin/codex',
        },
      });

      expect(result.success).toBe(true);
    });

    it('should reject per-request cliPath not in whitelist', async () => {
      // Clear and set specific mock
      vi.clearAllMocks();

      // Mock to ensure execa is never called
      vi.mocked(execa).mockImplementation(async () => {
        throw new Error('execa should not be called');
      });

      await expect(
        service.reviewCode({
          code: 'test code',
          options: {
            cliPath: '/evil/path/codex', // Not in whitelist
          },
        })
      ).rejects.toThrow(/CLI path not in allowed list/);
    });
  });
});
