/**
 * Codex Review Service
 * Handles code review using Codex CLI
 *
 * Migrated from MCP tool to direct CLI execution for consistency with Gemini service
 */

import { resolve } from 'path';

import { execa } from 'execa';

import { detectCodexCLIPath } from '../../core/cli-detector.js';
import {
  CLIExecutionError,
  TimeoutError,
  ParseError,
  SecurityError,
  CodexReviewError,
  CodexTimeoutError,
  CodexParseError,
} from '../../core/error-handler.js';
import { type Logger } from '../../core/logger.js';
import { RetryManager } from '../../core/retry.js';
import { generateUUID, sanitizeParams } from '../../core/utils.js';
import { CodexResponseSchema, type CodexResponse } from '../../schemas/responses.js';
import { CodeReviewParamsSchema, ReviewResultSchema, type CodeReviewParams, type ReviewResult } from '../../schemas/tools.js';

export interface CodexServiceConfig {
  cliPath: string;
  timeout: number;
  retryAttempts: number;
  retryDelay: number;
  model?: string | null;
  args?: string[];
}

/**
 * Codex Review Service
 * Uses direct CLI execution instead of MCP tool
 */
export class CodexReviewService {
  private retryManager: RetryManager;
  private allowedCLIPaths: string[];
  private detectedCLIPath: string | null = null;

  constructor(
    private config: CodexServiceConfig,
    private logger: Logger
  ) {
    this.retryManager = new RetryManager(
      {
        maxAttempts: config.retryAttempts,
        initialDelay: config.retryDelay,
        maxDelay: 10000,
        backoffFactor: 2,
      },
      logger
    );

    // Security-hardened whitelist: Only add config.cliPath if it's a known safe pattern
    // Don't blindly trust config - only allow well-known paths or relative names
    const isConfigPathSafe = config.cliPath === 'codex' ||
                             config.cliPath === 'codex.cmd' ||
                             config.cliPath === 'auto' ||
                             config.cliPath?.startsWith('/usr/local/bin/') ||
                             config.cliPath?.startsWith('/usr/bin/') ||
                             config.cliPath?.startsWith('/opt/codex/') ||
                             config.cliPath?.startsWith('/opt/homebrew/') ||
                             config.cliPath?.startsWith('C:\\Program Files\\codex\\') ||
                             config.cliPath?.startsWith('C:\\Program Files (x86)\\codex\\');

    const basePaths = [
      ...(isConfigPathSafe ? [config.cliPath] : []),
      process.env.CODEX_CLI_PATH, // Environment variable
      '/usr/local/bin/codex', // Common install location (Unix)
      '/usr/bin/codex', // System bin (Unix)
      '/opt/codex/bin/codex', // Alternative install location (Unix)
      '/opt/homebrew/bin/codex', // Homebrew (macOS Apple Silicon)
      'C:\\Program Files\\codex\\codex.exe', // Windows
      'C:\\Program Files (x86)\\codex\\codex.exe', // Windows (x86)
      'codex', // System PATH
      'codex.cmd', // Windows system PATH
    ].filter(Boolean) as string[];

    // Add dynamic Windows npm global path if on Windows
    if (process.platform === 'win32' && process.env.APPDATA) {
      basePaths.push(resolve(process.env.APPDATA, 'npm', 'codex.cmd'));
    }

    this.allowedCLIPaths = basePaths;

    this.logger.debug({ allowedPaths: this.allowedCLIPaths }, 'Codex CLI allowed paths');

    // Initialize CLI path detection if set to 'auto'
    if (config.cliPath === 'auto') {
      this.initializeCLIPath().catch((error) => {
        this.logger.warn({ error }, 'Failed to auto-detect Codex CLI path, will use default');
      });
    }
  }

  /**
   * Initialize CLI path using auto-detection
   */
  private async initializeCLIPath(): Promise<void> {
    try {
      const result = await detectCodexCLIPath(this.config.cliPath, this.logger);
      this.detectedCLIPath = result.path;

      // Update config with detected path
      this.config.cliPath = result.path;

      // Add detected path to whitelist if not already present
      if (!this.allowedCLIPaths.includes(result.path)) {
        this.allowedCLIPaths.push(result.path);
      }

      // If resolved path is different, add it too
      if (result.resolvedPath && !this.allowedCLIPaths.includes(result.resolvedPath)) {
        this.allowedCLIPaths.push(result.resolvedPath);
      }

      this.logger.info(
        {
          path: result.path,
          source: result.source,
          exists: result.exists,
          platform: process.platform,
        },
        'Codex CLI path detected'
      );
    } catch (error) {
      this.logger.error({ error }, 'Failed to detect Codex CLI path');
      throw error;
    }
  }

  /**
   * Perform code review using Codex CLI
   */
  async reviewCode(params: CodeReviewParams): Promise<ReviewResult> {
    const startTime = Date.now();
    const reviewId = generateUUID();

    try {
      this.logger.info({ reviewId, params: sanitizeParams(params) }, 'Starting Codex review');

      // Validate input
      const validated = CodeReviewParamsSchema.parse(params);

      // Use per-request timeout if specified
      const timeout = validated.options?.timeout ?? this.config.timeout;

      // Ensure CLI path is initialized (in case auto-detection is still in progress)
      if (this.config.cliPath === 'auto' && !this.detectedCLIPath) {
        await this.initializeCLIPath();
      }

      // Validate CLI path BEFORE retry logic (security check shouldn't be retried)
      const cliPath = validated.options?.cliPath || this.config.cliPath;
      await this.validateCLIPath(cliPath);

      // Wrap user prompt with JSON format instruction
      // Put JSON instruction FIRST to ensure Codex doesn't ignore it
      const prompt = `IMPORTANT: You MUST respond with ONLY valid JSON in this exact structure (no additional text, no explanations):
{
  "findings": [{"type": "bug|security|performance|style", "severity": "critical|high|medium|low", "line": number, "title": "string", "description": "string", "suggestion": "string"}],
  "overallAssessment": "string",
  "recommendations": ["string"]
}

Review this code:
${validated.prompt}`;

      // Execute CLI with retry logic
      const output = await this.retryManager.execute(
        () => this.executeCodexCLI(prompt, timeout, cliPath),
        'Codex review'
      );

      // Parse and structure response
      const review = this.parseCodexOutput(output, reviewId);

      // Apply severity filtering if requested
      if (validated.options?.severity && validated.options.severity !== 'all') {
        review.findings = this.filterFindingsBySeverity(review.findings, validated.options.severity);
        review.summary = this.calculateSummary(review.findings);
      }

      // Add metadata
      review.metadata.reviewDuration = Date.now() - startTime;

      this.logger.info(
        { reviewId, duration: review.metadata.reviewDuration, findings: review.findings.length },
        'Codex review completed'
      );

      return review;
    } catch (error) {
      this.logger.error({ reviewId, error }, 'Codex review failed');

      // Wrap in domain-specific error if not already
      if (error instanceof CodexReviewError) {
        throw error;
      }

      // Re-throw SecurityError without wrapping (important for validation)
      if (error instanceof SecurityError) {
        throw error;
      }

      if (error instanceof TimeoutError) {
        throw new CodexTimeoutError(error.message, reviewId, { cause: error });
      }

      if (error instanceof ParseError) {
        throw new CodexParseError(error.message, reviewId, { cause: error });
      }

      throw new CodexReviewError(
        error instanceof Error ? error.message : 'Unknown error during Codex review',
        reviewId,
        { cause: error }
      );
    }
  }


  /**
   * Execute Codex CLI command securely
   * @param cliPath - Pre-validated CLI path (validation done before retry logic)
   */
  private async executeCodexCLI(prompt: string, timeout: number, cliPath: string): Promise<string> {
    // Build CLI arguments
    const args = this.buildCLIArgs();

    this.logger.debug({ cliPath, argsCount: args.length, timeout }, 'Executing Codex CLI');

    try {
      // Execute CLI using execa (secure, no shell injection)
      // Pass prompt via stdin to avoid Windows CMD newline issues
      const result = await execa(cliPath, ['e', ...args], {
        timeout,
        reject: true, // Throw on ANY non-zero exit code
        all: true,
        input: prompt, // Send prompt via stdin
        env: {
          ...process.env,
          // Use model config if specified
          CODEX_MODEL: this.config.model || undefined,
        },
        // Security: Don't use shell
        shell: false,
      });

      return result.stdout || result.all || '';
    } catch (error: unknown) {
      const err = error as {
        timedOut?: boolean;
        exitCode?: number;
        stderr?: string;
        stdout?: string;
        failed?: boolean;
      };

      if (err.timedOut) {
        throw new TimeoutError(`Codex CLI timed out after ${timeout}ms`);
      }

      // ANY non-zero exit code is now an error
      if (err.exitCode !== undefined && err.exitCode !== 0) {
        throw new CLIExecutionError(
          `Codex CLI exited with code ${err.exitCode}`,
          {
            exitCode: err.exitCode,
            stderr: err.stderr,
            stdout: err.stdout,
          }
        );
      }

      throw new CLIExecutionError('Codex CLI execution failed', { cause: error });
    }
  }

  /**
   * Validate CLI path against allowed paths
   * SECURITY: Prevents PATH manipulation attacks by resolving to absolute paths
   */
  private async validateCLIPath(cliPath: string): Promise<void> {
    try {
      // Special handling for system PATH executables
      if (cliPath === 'codex' || cliPath === 'codex.cmd') {
        // Check if in whitelist first
        if (!this.allowedCLIPaths.includes(cliPath)) {
          this.logger.logSecurityEvent('System PATH executable not in whitelist', {
            cliPath,
            allowed: this.allowedCLIPaths
          });
          throw new SecurityError(`CLI path not in allowed list: ${cliPath}`);
        }

        // On non-Windows systems, try to resolve actual path for extra security
        if (process.platform !== 'win32') {
          try {
            const { stdout } = await execa('which', [cliPath], {
              shell: false,
              timeout: 5000,
            });
            const resolvedPath = stdout.trim();

            // Verify the resolved path is also in our whitelist or is a known good path
            const resolvedAllowed = this.allowedCLIPaths.some((allowed) => {
              try {
                const resolvedAllowed = resolve(allowed);
                return resolvedAllowed === resolvedPath || allowed === cliPath;
              } catch {
                return false;
              }
            });

            if (!resolvedAllowed) {
              this.logger.logSecurityEvent('System PATH resolved to non-whitelisted path', {
                cliPath,
                resolvedPath,
                allowed: this.allowedCLIPaths
              });
              throw new SecurityError(`Resolved CLI path not in allowed list: ${resolvedPath}`);
            }
          } catch (whichError) {
            // Re-throw SecurityError
            if (whichError instanceof SecurityError) {
              throw whichError;
            }
            // 'which' failed but cliPath is in whitelist, allow it
            this.logger.debug({ cliPath, error: whichError }, 'Could not resolve PATH executable, but in whitelist');
          }
        }

        // Passed all checks
        return;
      }

      // For absolute/relative paths, resolve to absolute path
      const resolved = resolve(cliPath);

      // Check against whitelist
      const isAllowed = this.allowedCLIPaths.some((allowed) => {
        try {
          // Allow system PATH executables
          if (allowed === 'codex' || allowed === 'codex.cmd') {
            return false; // Already handled above
          }
          return resolve(allowed) === resolved;
        } catch {
          return false;
        }
      });

      if (!isAllowed) {
        this.logger.logSecurityEvent('Invalid CLI path attempted', {
          cliPath,
          resolved,
          allowed: this.allowedCLIPaths
        });
        throw new SecurityError(`CLI path not in allowed list: ${cliPath}`);
      }
    } catch (error) {
      if (error instanceof SecurityError) {
        throw error;
      }
      throw new SecurityError('Failed to validate CLI path');
    }
  }

  /**
   * Build CLI arguments
   */
  private buildCLIArgs(): string[] {
    const args: string[] = [];

    // Add configured arguments
    if (this.config.args && this.config.args.length > 0) {
      args.push(...this.config.args);
    }

    // Add model if specified
    if (this.config.model) {
      args.push('--model', this.config.model);
    }

    // Add JSON output flag
    args.push('--json');

    // Skip git repo check for code review
    args.push('--skip-git-repo-check');

    // Use read-only sandbox for safety
    args.push('--sandbox', 'read-only');

    return args;
  }

  /**
   * Parse Codex CLI output into structured format
   */
  private parseCodexOutput(
    output: string,
    reviewId: string
  ): ReviewResult {
    try {
      // Clean output (remove ANSI codes, etc.)
      const cleaned = this.cleanOutput(output);

      // Codex exec with --json outputs JSONL (one event per line)
      // We need to find the final assistant message
      const lines = cleaned.split('\n').filter(line => line.trim());

      let parsed: any = null;

      // Parse JSONL output
      for (const line of lines) {
        try {
          const event = JSON.parse(line);

          // Look for item.completed events with agent_message (contains JSON response)
          if (event.type === 'item.completed' && event.item) {
            if (event.item.type === 'agent_message') {
              // Parse the JSON text immediately to avoid double-parsing issues
              parsed = JSON.parse(event.item.text || '{}');
            }
          }
          // Fallback: old format (message with role)
          else if (event.type === 'message' && event.role === 'assistant') {
            parsed = JSON.parse(event.content || '{}');
          }
        } catch {
          // Skip non-JSON lines or malformed events
          continue;
        }
      }

      if (!parsed) {
        // Fallback: try to extract JSON from entire output
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          this.logger.warn({ output: cleaned.substring(0, 500) }, 'No JSON found in Codex output');
          throw new ParseError('No JSON found in Codex output');
        }
        parsed = JSON.parse(jsonMatch[0]);
      }

      // Validate response against schema
      const validated = CodexResponseSchema.parse(parsed);

      // Calculate summary
      const summary = this.calculateSummary(validated.findings);

      // Transform to internal format
      const result: ReviewResult = {
        success: true,
        reviewId,
        timestamp: new Date().toISOString(),
        source: 'codex',
        summary,
        findings: validated.findings,
        overallAssessment: validated.overallAssessment,
        recommendations: validated.recommendations,
        metadata: {
          reviewDuration: 0,
        },
      };

      // Validate final result
      ReviewResultSchema.parse(result);

      return result;
    } catch (error) {
      this.logger.error({ error, output: output.substring(0, 500) }, 'Failed to parse Codex output');

      if (error instanceof ParseError) {
        throw error;
      }

      throw new ParseError('Failed to parse Codex output', { cause: error });
    }
  }

  /**
   * Clean CLI output (remove ANSI codes, etc.)
   */
  private cleanOutput(output: string): string {
    // Remove ANSI escape codes
    let cleaned = output.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');

    // Remove null bytes
    cleaned = cleaned.replace(/\0/g, '');

    // Trim whitespace
    cleaned = cleaned.trim();

    return cleaned;
  }

  /**
   * Calculate summary statistics from findings
   */
  private calculateSummary(findings: CodexResponse['findings']) {
    return {
      totalFindings: findings.length,
      critical: findings.filter((f) => f.severity === 'critical').length,
      high: findings.filter((f) => f.severity === 'high').length,
      medium: findings.filter((f) => f.severity === 'medium').length,
      low: findings.filter((f) => f.severity === 'low').length,
    };
  }

  /**
   * Filter findings by severity
   */
  private filterFindingsBySeverity(
    findings: CodexResponse['findings'],
    severity: 'high' | 'medium'
  ): CodexResponse['findings'] {
    if (severity === 'high') {
      return findings.filter(f => f.severity === 'critical' || f.severity === 'high');
    } else if (severity === 'medium') {
      return findings.filter(f => f.severity === 'critical' || f.severity === 'high' || f.severity === 'medium');
    }
    return findings;
  }
}
