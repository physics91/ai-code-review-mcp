/**
 * Gemini Review Service
 * Handles code review using Gemini CLI
 *
 * CRITICAL FIX #5: Gemini CLI path whitelist derived from config
 * MAJOR FIX #6: Honor per-request timeout, severity, cliPath options
 * MAJOR FIX #14: Use Codex model config when specified
 */

import { resolve } from 'path';

import { execa } from 'execa';

import { detectGeminiCLIPath } from '../../core/cli-detector.js';
import {
  CLIExecutionError,
  TimeoutError,
  ParseError,
  SecurityError,
  GeminiReviewError,
  GeminiTimeoutError,
  GeminiParseError,
} from '../../core/error-handler.js';
import { type Logger } from '../../core/logger.js';
import { RetryManager } from '../../core/retry.js';
import { generateUUID, sanitizeParams, countLines, detectLanguage } from '../../core/utils.js';
import { GeminiResponseSchema, type GeminiResponse } from '../../schemas/responses.js';
import { CodeReviewParamsSchema, ReviewResultSchema, type CodeReviewParams, type ReviewResult } from '../../schemas/tools.js';

export interface GeminiServiceConfig {
  cliPath: string;
  timeout: number;
  retryAttempts: number;
  retryDelay: number;
  model?: string | null;
  args?: string[];
}

/**
 * Gemini Review Service
 * CRITICAL FIX #5: Whitelist now derived from config + environment
 */
export class GeminiReviewService {
  private retryManager: RetryManager;
  private allowedCLIPaths: string[];
  private detectedCLIPath: string | null = null;

  constructor(
    private config: GeminiServiceConfig,
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

    // CRITICAL FIX #5: Derive whitelist from config + environment
    // This allows per-request cliPath override if it matches allowed paths
    const basePaths = [
      config.cliPath, // Config CLI path
      process.env.GEMINI_CLI_PATH, // Environment variable
      '/usr/local/bin/gemini', // Common install location
      '/usr/bin/gemini', // System bin (Unix)
      '/opt/gemini/bin/gemini', // Alternative install location
      '/opt/homebrew/bin/gemini', // Homebrew (macOS Apple Silicon)
      'C:\\Program Files\\gemini\\gemini.exe', // Windows
      'C:\\Program Files (x86)\\gemini\\gemini.exe', // Windows (x86)
      'C:\\Program Files\\Google\\Gemini\\gemini.exe', // Windows Google dir
      'gemini', // System PATH
      'gemini.cmd', // Windows system PATH
    ].filter(Boolean) as string[];

    // Add dynamic Windows npm global path if on Windows
    if (process.platform === 'win32' && process.env.APPDATA) {
      basePaths.push(resolve(process.env.APPDATA, 'npm', 'gemini.cmd'));
    }

    this.allowedCLIPaths = basePaths;

    this.logger.debug({ allowedPaths: this.allowedCLIPaths }, 'Gemini CLI allowed paths');

    // Initialize CLI path detection if set to 'auto'
    if (config.cliPath === 'auto') {
      this.initializeCLIPath().catch((error) => {
        this.logger.warn({ error }, 'Failed to auto-detect Gemini CLI path, will use default');
      });
    }
  }

  /**
   * Initialize CLI path using auto-detection
   */
  private async initializeCLIPath(): Promise<void> {
    try {
      const result = await detectGeminiCLIPath(this.config.cliPath, this.logger);
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
        'Gemini CLI path detected'
      );
    } catch (error) {
      this.logger.error({ error }, 'Failed to detect Gemini CLI path');
      throw error;
    }
  }

  /**
   * Perform code review using Gemini CLI
   * MAJOR FIX #6: Honor per-request timeout, severity, cliPath options
   */
  async reviewCode(params: CodeReviewParams): Promise<ReviewResult> {
    const startTime = Date.now();
    const reviewId = generateUUID();

    try {
      this.logger.info({ reviewId, params: sanitizeParams(params) }, 'Starting Gemini review');

      // Validate input
      const validated = CodeReviewParamsSchema.parse(params);

      // MAJOR FIX #6: Use per-request timeout if specified
      const timeout = validated.options?.timeout ?? this.config.timeout;

      // Ensure CLI path is initialized (in case auto-detection is still in progress)
      if (this.config.cliPath === 'auto' && !this.detectedCLIPath) {
        await this.initializeCLIPath();
      }

      // Format prompt with severity filtering
      const prompt = this.formatReviewPrompt(validated);

      // Execute CLI with retry logic
      const output = await this.retryManager.execute(
        () => this.executeGeminiCLI(prompt, validated, timeout),
        'Gemini review'
      );

      // Parse and structure response
      const review = this.parseGeminiOutput(output, reviewId, validated);

      // MAJOR FIX #6: Apply severity filtering if requested
      if (validated.options?.severity && validated.options.severity !== 'all') {
        review.findings = this.filterFindingsBySeverity(review.findings, validated.options.severity);
        review.summary = this.calculateSummary(review.findings);
      }

      // Add metadata
      const language = validated.language || detectLanguage(validated.code, validated.context?.fileName);
      review.metadata.language = language;
      review.metadata.linesOfCode = countLines(validated.code);
      review.metadata.reviewDuration = Date.now() - startTime;

      this.logger.info(
        { reviewId, duration: review.metadata.reviewDuration, findings: review.findings.length },
        'Gemini review completed'
      );

      return review;
    } catch (error) {
      this.logger.error({ reviewId, error }, 'Gemini review failed');

      // Wrap in domain-specific error if not already
      if (error instanceof GeminiReviewError) {
        throw error;
      }

      if (error instanceof TimeoutError) {
        throw new GeminiTimeoutError(error.message, reviewId, { cause: error });
      }

      if (error instanceof ParseError) {
        throw new GeminiParseError(error.message, reviewId, { cause: error });
      }

      throw new GeminiReviewError(
        error instanceof Error ? error.message : 'Unknown error during Gemini review',
        reviewId,
        { cause: error }
      );
    }
  }

  /**
   * Format code review prompt for Gemini
   * MAJOR FIX #6: Include severity filtering in prompt
   */
  private formatReviewPrompt(params: CodeReviewParams): string {
    const { code, language, context, options } = params;

    const focusAreas = context?.reviewFocus || ['all'];
    const includeExplanations = options?.includeExplanations ?? true;
    const severityFilter = options?.severity ?? 'all';
    const detectedLanguage = language || detectLanguage(code, context?.fileName) || 'code';

    const prompt = `You are an expert code reviewer. Perform a comprehensive code review of the following ${detectedLanguage}.

## Code to Review:
\`\`\`${detectedLanguage}
${code}
\`\`\`

${context?.fileName ? `File: ${context.fileName}` : ''}
${context?.projectType ? `Project Type: ${context.projectType}` : ''}

## Review Focus Areas:
${focusAreas.includes('all') ? '- All aspects (bugs, security, performance, style)' : focusAreas.map((area) => `- ${area}`).join('\n')}

## Severity Filter:
${severityFilter === 'all' ? '- Report all severity levels' : severityFilter === 'high' ? '- Report only CRITICAL and HIGH severity issues' : '- Report only CRITICAL, HIGH, and MEDIUM severity issues'}

## Instructions:
1. Analyze the code for issues in the specified focus areas
2. Identify bugs, security vulnerabilities, performance issues, and style problems
3. Assign severity levels: critical, high, medium, low, info
${severityFilter !== 'all' ? `4. IMPORTANT: Only report issues that match the severity filter (${severityFilter})` : ''}
4. Provide specific line numbers where applicable
5. ${includeExplanations ? 'Include detailed explanations for each finding' : 'Provide concise descriptions'}
6. Suggest concrete improvements

## Output Format:
Return ONLY a valid JSON object (no markdown, no additional text) with this structure:
{
  "findings": [
    {
      "type": "bug|security|performance|style|suggestion",
      "severity": "critical|high|medium|low|info",
      "line": <number> or null,
      "title": "Brief title",
      "description": "Detailed description",
      "suggestion": "How to fix",
      "code": "Suggested code fix (if applicable)"
    }
  ],
  "overallAssessment": "Summary of code quality",
  "recommendations": ["General recommendations"]
}`;

    return prompt;
  }

  /**
   * Execute Gemini CLI command securely
   * MAJOR FIX #6: Honor per-request cliPath and timeout options
   */
  private async executeGeminiCLI(prompt: string, params: CodeReviewParams, timeout: number): Promise<string> {
    // MAJOR FIX #6: Use per-request cliPath if specified, otherwise use config
    const cliPath = params.options?.cliPath || this.config.cliPath;

    // Validate CLI path (security) - now async to resolve PATH
    await this.validateCLIPath(cliPath);

    // Build CLI arguments with model support
    const args = this.buildCLIArgs();

    this.logger.debug({ cliPath, argsCount: args.length, timeout }, 'Executing Gemini CLI');

    try {
      // Execute CLI using execa (secure, no shell injection)
      // reject: true ensures ANY non-zero exit code throws an error
      const result = await execa(cliPath, args, {
        timeout,
        input: prompt,
        reject: true, // Throw on ANY non-zero exit code
        all: true,
        env: {
          ...process.env,
          // MAJOR FIX #14: Use model config if specified
          GEMINI_MODEL: this.config.model || undefined,
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
        throw new TimeoutError(`Gemini CLI timed out after ${timeout}ms`);
      }

      // ANY non-zero exit code is now an error
      if (err.exitCode !== undefined && err.exitCode !== 0) {
        throw new CLIExecutionError(
          `Gemini CLI exited with code ${err.exitCode}`,
          {
            exitCode: err.exitCode,
            stderr: err.stderr,
            stdout: err.stdout,
          }
        );
      }

      throw new CLIExecutionError('Gemini CLI execution failed', { cause: error });
    }
  }

  /**
   * Validate CLI path against allowed paths
   * SECURITY: Prevents PATH manipulation attacks by resolving to absolute paths
   */
  private async validateCLIPath(cliPath: string): Promise<void> {
    try {
      // Special handling for system PATH executables
      if (cliPath === 'gemini' || cliPath === 'gemini.cmd') {
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
          if (allowed === 'gemini' || allowed === 'gemini.cmd') {
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
   * MAJOR FIX #14: Include model if specified
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

    // Add output format
    args.push('--format', 'json');

    return args;
  }

  /**
   * Parse Gemini CLI output into structured format
   */
  private parseGeminiOutput(
    output: string,
    reviewId: string,
    _params: CodeReviewParams
  ): ReviewResult {
    try {
      // Clean output (remove ANSI codes, etc.)
      const cleaned = this.cleanOutput(output);

      // Extract JSON from output
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        this.logger.warn({ output: cleaned.substring(0, 500) }, 'No JSON found in Gemini output');
        throw new ParseError('No JSON found in Gemini output');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate response against schema
      const validated = GeminiResponseSchema.parse(parsed);

      // Calculate summary
      const summary = this.calculateSummary(validated.findings);

      // Transform to internal format
      const result: ReviewResult = {
        success: true,
        reviewId,
        timestamp: new Date().toISOString(),
        source: 'gemini',
        summary,
        findings: validated.findings,
        overallAssessment: validated.overallAssessment,
        recommendations: validated.recommendations,
        metadata: {
          language: undefined,
          linesOfCode: 0,
          reviewDuration: 0,
        },
      };

      // Validate final result
      ReviewResultSchema.parse(result);

      return result;
    } catch (error) {
      this.logger.error({ error, output: output.substring(0, 500) }, 'Failed to parse Gemini output');

      if (error instanceof ParseError) {
        throw error;
      }

      throw new ParseError('Failed to parse Gemini output', { cause: error });
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
  private calculateSummary(findings: GeminiResponse['findings']) {
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
   * MAJOR FIX #6: Implement severity filtering
   */
  private filterFindingsBySeverity(
    findings: GeminiResponse['findings'],
    severity: 'high' | 'medium'
  ): GeminiResponse['findings'] {
    if (severity === 'high') {
      return findings.filter(f => f.severity === 'critical' || f.severity === 'high');
    } else if (severity === 'medium') {
      return findings.filter(f => f.severity === 'critical' || f.severity === 'high' || f.severity === 'medium');
    }
    return findings;
  }
}
