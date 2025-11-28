/**
 * Unit tests for GeminiAnalysisService
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GeminiAnalysisService } from '../../../../src/services/gemini/client.js';
import { Logger } from '../../../../src/core/logger.js';
import { execa } from 'execa';

// Mock execa
vi.mock('execa');

describe('GeminiAnalysisService', () => {
  let service: GeminiAnalysisService;
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

    // Mock 'which' command to always succeed for default 'gemini' path
    vi.mocked(execa).mockImplementation(async (cmd: string, args: any) => {
      if (cmd === 'which' || cmd === 'where') {
        return {
          stdout: '/usr/local/bin/gemini',
          stderr: '',
          exitCode: 0,
        } as any;
      }
      // Default mock for actual gemini execution
      return {
        stdout: JSON.stringify({
          response: JSON.stringify({
            findings: [],
            overallAssessment: 'Good',
            recommendations: [],
          }),
          stats: { session: { duration: 1000 } },
          error: null,
        }),
        stderr: '',
        exitCode: 0,
      } as any;
    });

    service = new GeminiAnalysisService(
      {
        cliPath: 'gemini',
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

  describe('parseGeminiOutput', () => {
    describe('Gemini wrapper format', () => {
      it('should parse standard Gemini wrapper with JSON response', async () => {
        const mockOutput = JSON.stringify({
          response: JSON.stringify({
            findings: [
              {
                type: 'bug',
                severity: 'high',
                line: 10,
                title: 'Null pointer exception',
                description: 'Variable might be null',
                suggestion: 'Add null check',
              },
            ],
            overallAssessment: 'Code has some issues',
            recommendations: ['Add error handling'],
          }),
          stats: { session: { duration: 1234 } },
          error: null,
        });

        vi.mocked(execa).mockResolvedValue({
          stdout: mockOutput,
          stderr: '',
          exitCode: 0,
        } as any);

        const result = await service.analyzeCode({
          prompt: 'Review this code: function test() { return null.value; }',
        });

        expect(result.success).toBe(true);
        expect(result.source).toBe('gemini');
        expect(result.findings).toHaveLength(1);
        expect(result.findings[0].type).toBe('bug');
        expect(result.summary.totalFindings).toBe(1);
        expect(result.summary.high).toBe(1);
      });

      it('should parse Gemini wrapper with response as object', async () => {
        // Some versions might return response as already-parsed object
        const mockOutput = JSON.stringify({
          response: {
            findings: [
              {
                type: 'security',
                severity: 'critical',
                line: 5,
                title: 'SQL Injection',
                description: 'User input not sanitized',
              },
            ],
            overallAssessment: 'Critical security issue found',
            recommendations: ['Use parameterized queries'],
          },
          stats: { session: { duration: 500 } },
          error: null,
        });

        vi.mocked(execa).mockResolvedValue({
          stdout: mockOutput,
          stderr: '',
          exitCode: 0,
        } as any);

        const result = await service.analyzeCode({
          prompt: 'Review this code',
        });

        expect(result.success).toBe(true);
        expect(result.findings).toHaveLength(1);
        expect(result.findings[0].severity).toBe('critical');
      });

      it('should handle Gemini wrapper with error field', async () => {
        const mockOutput = JSON.stringify({
          response: null,
          stats: null,
          error: 'Model quota exceeded',
        });

        vi.mocked(execa).mockResolvedValue({
          stdout: mockOutput,
          stderr: '',
          exitCode: 0,
        } as any);

        await expect(
          service.analyzeCode({
            prompt: 'Review this code',
          })
        ).rejects.toThrow('Gemini CLI error: Model quota exceeded');
      });

      it('should handle Gemini wrapper with null response', async () => {
        const mockOutput = JSON.stringify({
          response: null,
          stats: { session: { duration: 0 } },
          error: null,
        });

        vi.mocked(execa).mockResolvedValue({
          stdout: mockOutput,
          stderr: '',
          exitCode: 0,
        } as any);

        await expect(
          service.analyzeCode({
            prompt: 'Review this code',
          })
        ).rejects.toThrow('Gemini response is null');
      });
    });

    describe('Markdown code blocks', () => {
      it('should parse response with ```json code block', async () => {
        const mockOutput = JSON.stringify({
          response: '```json\n{"findings":[],"overallAssessment":"Good code","recommendations":[]}\n```',
          stats: { session: { duration: 100 } },
          error: null,
        });

        vi.mocked(execa).mockResolvedValue({
          stdout: mockOutput,
          stderr: '',
          exitCode: 0,
        } as any);

        const result = await service.analyzeCode({
          prompt: 'Review this code',
        });

        expect(result.success).toBe(true);
        expect(result.findings).toHaveLength(0);
        expect(result.overallAssessment).toBe('Good code');
      });

      it('should parse response with ``` code block (no json tag)', async () => {
        const mockOutput = JSON.stringify({
          response: '```\n{"findings":[],"overallAssessment":"Clean","recommendations":[]}\n```',
          stats: { session: { duration: 100 } },
          error: null,
        });

        vi.mocked(execa).mockResolvedValue({
          stdout: mockOutput,
          stderr: '',
          exitCode: 0,
        } as any);

        const result = await service.analyzeCode({
          prompt: 'Review this code',
        });

        expect(result.success).toBe(true);
        expect(result.overallAssessment).toBe('Clean');
      });

      it('should handle mixed text and JSON in response', async () => {
        const mockOutput = JSON.stringify({
          response: 'Here is the analysis:\n\n```json\n{"findings":[],"overallAssessment":"Good","recommendations":[]}\n```\n\nLet me know if you have questions.',
          stats: { session: { duration: 100 } },
          error: null,
        });

        vi.mocked(execa).mockResolvedValue({
          stdout: mockOutput,
          stderr: '',
          exitCode: 0,
        } as any);

        const result = await service.analyzeCode({
          prompt: 'Review this code',
        });

        expect(result.success).toBe(true);
      });
    });

    describe('Direct JSON format', () => {
      it('should parse direct JSON output (without wrapper)', async () => {
        const mockOutput = JSON.stringify({
          findings: [
            {
              type: 'performance',
              severity: 'medium',
              line: 20,
              title: 'Inefficient loop',
              description: 'O(n^2) complexity',
            },
          ],
          overallAssessment: 'Performance issues detected',
          recommendations: ['Use a Set for lookups'],
        });

        vi.mocked(execa).mockResolvedValue({
          stdout: mockOutput,
          stderr: '',
          exitCode: 0,
        } as any);

        const result = await service.analyzeCode({
          prompt: 'Review this code',
        });

        expect(result.success).toBe(true);
        expect(result.findings).toHaveLength(1);
        expect(result.findings[0].type).toBe('performance');
      });
    });

    describe('Error handling', () => {
      it('should throw ParseError for invalid JSON', async () => {
        vi.mocked(execa).mockResolvedValue({
          stdout: 'This is not JSON at all',
          stderr: '',
          exitCode: 0,
        } as any);

        await expect(
          service.analyzeCode({
            prompt: 'Review this code',
          })
        ).rejects.toThrow('No JSON found in Gemini output');
      });

      it('should throw ParseError for empty output', async () => {
        vi.mocked(execa).mockResolvedValue({
          stdout: '',
          stderr: '',
          exitCode: 0,
        } as any);

        await expect(
          service.analyzeCode({
            prompt: 'Review this code',
          })
        ).rejects.toThrow();
      });

      it('should throw ParseError for malformed JSON in response', async () => {
        const mockOutput = JSON.stringify({
          response: '{"findings": [invalid json here}',
          stats: { session: { duration: 100 } },
          error: null,
        });

        vi.mocked(execa).mockResolvedValue({
          stdout: mockOutput,
          stderr: '',
          exitCode: 0,
        } as any);

        await expect(
          service.analyzeCode({
            prompt: 'Review this code',
          })
        ).rejects.toThrow();
      });

      it('should validate input parameters', async () => {
        await expect(
          service.analyzeCode({
            prompt: '', // Invalid: empty prompt
          })
        ).rejects.toThrow();
      });

      it('should handle CLI timeout errors', async () => {
        vi.mocked(execa).mockRejectedValue({
          timedOut: true,
          exitCode: 1,
        });

        await expect(
          service.analyzeCode({
            prompt: 'Review this code: test code',
          })
        ).rejects.toThrow('Gemini CLI timed out after');
      });

      it('should handle CLI execution errors', async () => {
        vi.mocked(execa).mockRejectedValue({
          exitCode: 1,
          stderr: 'CLI error',
          stdout: '',
        });

        await expect(
          service.analyzeCode({
            prompt: 'Review this code: test code',
          })
        ).rejects.toThrow('Gemini CLI exited with code 1');
      });
    });

    describe('Summary calculation', () => {
      it('should calculate summary correctly', async () => {
        const findings = [
          { type: 'bug', severity: 'critical', line: 1, title: 'Critical', description: 'Desc' },
          { type: 'security', severity: 'high', line: 2, title: 'High', description: 'Desc' },
          { type: 'performance', severity: 'medium', line: 3, title: 'Medium', description: 'Desc' },
          { type: 'style', severity: 'low', line: 4, title: 'Low', description: 'Desc' },
        ];

        const mockOutput = JSON.stringify({
          response: JSON.stringify({
            findings,
            overallAssessment: 'Mixed',
            recommendations: [],
          }),
          stats: { session: { duration: 100 } },
          error: null,
        });

        vi.mocked(execa).mockResolvedValue({
          stdout: mockOutput,
          exitCode: 0,
        } as any);

        const result = await service.analyzeCode({
          prompt: 'Review this code: test code',
        });

        expect(result.summary.totalFindings).toBe(4);
        expect(result.summary.critical).toBe(1);
        expect(result.summary.high).toBe(1);
        expect(result.summary.medium).toBe(1);
        expect(result.summary.low).toBe(1);
      });
    });

    describe('Severity filtering', () => {
      it('should filter findings by high severity', async () => {
        const findings = [
          { type: 'bug', severity: 'critical', line: 1, title: 'Critical', description: 'Desc' },
          { type: 'security', severity: 'high', line: 2, title: 'High', description: 'Desc' },
          { type: 'performance', severity: 'medium', line: 3, title: 'Medium', description: 'Desc' },
          { type: 'style', severity: 'low', line: 4, title: 'Low', description: 'Desc' },
        ];

        const mockOutput = JSON.stringify({
          response: JSON.stringify({
            findings,
            overallAssessment: 'Mixed',
            recommendations: [],
          }),
          stats: { session: { duration: 100 } },
          error: null,
        });

        vi.mocked(execa).mockResolvedValue({
          stdout: mockOutput,
          exitCode: 0,
        } as any);

        const result = await service.analyzeCode({
          prompt: 'Review this code: test code',
          options: {
            severity: 'high',
          },
        });

        expect(result.findings).toHaveLength(2);
        expect(result.findings.every(f => f.severity === 'critical' || f.severity === 'high')).toBe(true);
      });
    });

    describe('JSONL format (future compatibility)', () => {
      it('should parse JSONL format with response in one line', async () => {
        const mockOutput = [
          '{"type": "status", "message": "Processing..."}',
          JSON.stringify({
            response: JSON.stringify({
              findings: [],
              overallAssessment: 'Good',
              recommendations: [],
            }),
            stats: { session: { duration: 100 } },
            error: null,
          }),
        ].join('\n');

        vi.mocked(execa).mockResolvedValue({
          stdout: mockOutput,
          stderr: '',
          exitCode: 0,
        } as any);

        const result = await service.analyzeCode({
          prompt: 'Review this code',
        });

        expect(result.success).toBe(true);
      });
    });
  });

  describe('CLI Path Validation', () => {
    it('should accept whitelisted paths', async () => {
      const whitelistedService = new GeminiAnalysisService(
        {
          cliPath: '/usr/local/bin/gemini',
          timeout: 10000,
          retryAttempts: 1,
          retryDelay: 100,
          args: [],
        },
        mockLogger
      );

      const mockOutput = JSON.stringify({
        response: JSON.stringify({
          findings: [],
          overallAssessment: 'Good',
          recommendations: [],
        }),
        stats: { session: { duration: 100 } },
        error: null,
      });

      vi.mocked(execa).mockResolvedValue({
        stdout: mockOutput,
        exitCode: 0,
      } as any);

      const result = await whitelistedService.analyzeCode({
        prompt: 'Review this code: test code',
      });

      expect(result.success).toBe(true);
    });

    it('should reject non-whitelisted paths', async () => {
      // Clear beforeEach mock and set specific mock for this test
      vi.clearAllMocks();

      // Mock to simulate execution attempt (should never reach here if validation works)
      vi.mocked(execa).mockImplementation(async () => {
        throw new Error('execa should not be called with invalid path');
      });

      const invalidService = new GeminiAnalysisService(
        {
          cliPath: '/suspicious/path/gemini', // Not in whitelist
          timeout: 10000,
          retryAttempts: 0, // No retry to simplify
          retryDelay: 100,
          args: [],
        },
        mockLogger
      );

      await expect(
        invalidService.analyzeCode({
          prompt: 'Review this code: test code',
        })
      ).rejects.toThrow(/CLI path not in allowed list/);
    });
  });
});
