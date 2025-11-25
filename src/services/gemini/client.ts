/**
 * Gemini Analysis Service
 * Handles code analysis using Gemini CLI
 *
 * CRITICAL FIX #5: Gemini CLI path whitelist derived from config
 * MAJOR FIX #6: Honor per-request timeout, severity, cliPath options
 * MAJOR FIX #14: Use Codex model config when specified
 */

import { resolve } from 'path';

import { execa } from 'execa';

import { ContextAutoDetector } from '../../core/auto-detect.js';
import { detectGeminiCLIPath } from '../../core/cli-detector.js';
import { ContextManager, type ContextConfig } from '../../core/context-manager.js';
import {
  CLIExecutionError,
  TimeoutError,
  ParseError,
  SecurityError,
  GeminiAnalysisError,
  GeminiTimeoutError,
  GeminiParseError,
} from '../../core/error-handler.js';
import { type Logger } from '../../core/logger.js';
import { PromptTemplateEngine, DEFAULT_FORMAT_INSTRUCTIONS, type TemplateEngineConfig } from '../../core/prompt-template.js';
import { RetryManager } from '../../core/retry.js';
import { generateUUID, sanitizeParams } from '../../core/utils.js';
import { WarningSystem, type WarningConfig } from '../../core/warnings.js';
import type { AnalysisContext } from '../../schemas/context.js';
import { GeminiResponseSchema, type GeminiResponse } from '../../schemas/responses.js';
import { CodeAnalysisParamsSchema, AnalysisResultSchema, type CodeAnalysisParams, type AnalysisResult } from '../../schemas/tools.js';

export interface GeminiServiceConfig {
  cliPath: string;
  timeout: number;
  retryAttempts: number;
  retryDelay: number;
  model?: string | null;
  args?: string[];
  // Context system configuration
  context?: ContextConfig;
  prompts?: TemplateEngineConfig;
  warnings?: WarningConfig;
}

/**
 * Gemini Review Service
 * CRITICAL FIX #5: Whitelist now derived from config + environment
 */
export class GeminiAnalysisService {
  private retryManager: RetryManager;
  private allowedCLIPaths: string[];
  private detectedCLIPath: string | null = null;

  // Context system modules
  private contextManager: ContextManager;
  private autoDetector: ContextAutoDetector;
  private warningSystem: WarningSystem;
  private templateEngine: PromptTemplateEngine;

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

    // Initialize context system modules
    this.contextManager = new ContextManager({
      defaults: config.context?.defaults,
      presets: config.context?.presets,
      activePreset: config.context?.activePreset,
      allowEnvOverride: config.context?.allowEnvOverride ?? true,
      autoDetect: config.context?.autoDetect ?? true,
    });

    this.autoDetector = new ContextAutoDetector(logger);

    this.warningSystem = new WarningSystem({
      enabled: config.warnings?.enabled ?? true,
      showTips: config.warnings?.showTips ?? true,
      suppressions: config.warnings?.suppressions ?? [],
    });

    this.templateEngine = new PromptTemplateEngine({
      templates: config.prompts?.templates,
      defaultTemplate: config.prompts?.defaultTemplate ?? 'default',
      serviceTemplates: {
        codex: config.prompts?.serviceTemplates?.codex,
        gemini: config.prompts?.serviceTemplates?.gemini ?? 'default',
      },
    });

    this.logger.debug('Context system modules initialized for Gemini service');
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
  async analyzeCode(params: CodeAnalysisParams): Promise<AnalysisResult> {
    const startTime = Date.now();
    const analysisId = generateUUID();

    try {
      this.logger.info({ analysisId, params: sanitizeParams(params) }, 'Starting Gemini review');

      // Validate input
      const validated = CodeAnalysisParamsSchema.parse(params);

      // MAJOR FIX #6: Use per-request timeout if specified
      const timeout = validated.options?.timeout ?? this.config.timeout;

      // Ensure CLI path is initialized (in case auto-detection is still in progress)
      if (this.config.cliPath === 'auto' && !this.detectedCLIPath) {
        await this.initializeCLIPath();
      }

      // === Context System Integration ===
      const enableAutoDetect = validated.options?.autoDetect ?? true;
      const enableWarnings = validated.options?.warnOnMissingContext ?? true;

      // Step 1: Auto-detect context if enabled
      let detectedContext: Partial<AnalysisContext> | undefined;
      if (enableAutoDetect) {
        const detection = await this.autoDetector.detect({
          code: validated.prompt,
          fileName: validated.context?.fileName,
          workingDirectory: process.cwd(),
        });
        detectedContext = detection.context;
        this.logger.debug({ detectedContext, sources: detection.sources }, 'Auto-detected context');
      }

      // Step 2: Resolve final context (priority: defaults -> preset -> detected -> request)
      // Copy preset from options to context if provided (options.preset takes precedence)
      const contextWithPreset: AnalysisContext = {
        ...validated.context,
        preset: validated.options?.preset || validated.context?.preset,
      };
      const resolvedContext = this.contextManager.resolve(contextWithPreset, detectedContext);
      this.logger.debug({ resolvedContext, preset: contextWithPreset.preset }, 'Resolved analysis context');

      // Step 3: Generate warnings for missing context
      const warnings = enableWarnings ? this.warningSystem.checkContext(resolvedContext) : [];
      if (warnings.length > 0) {
        this.logger.debug({ warnings: warnings.map(w => w.code) }, 'Context warnings generated');
      }

      // Step 4: Select and render prompt template
      const templateId = validated.options?.template || this.templateEngine.getTemplateForService('gemini');
      const prompt = this.templateEngine.render(templateId, {
        prompt: validated.prompt,
        context: resolvedContext,
        formatInstructions: DEFAULT_FORMAT_INSTRUCTIONS,
      });

      this.logger.debug({ templateId, promptLength: prompt.length }, 'Prompt rendered from template');

      // Execute CLI with retry logic
      const output = await this.retryManager.execute(
        () => this.executeGeminiCLI(prompt, validated, timeout),
        'Gemini review'
      );

      // Parse and structure response
      const review = this.parseGeminiOutput(output, analysisId);

      // MAJOR FIX #6: Apply severity filtering if requested
      if (validated.options?.severity && validated.options.severity !== 'all') {
        review.findings = this.filterFindingsBySeverity(review.findings, validated.options.severity);
        review.summary = this.calculateSummary(review.findings);
      }

      // Add metadata including context information
      review.metadata.analysisDuration = Date.now() - startTime;
      review.metadata.resolvedContext = {
        threatModel: resolvedContext.threatModel,
        platform: resolvedContext.platform,
        projectType: resolvedContext.projectType,
        language: resolvedContext.language,
        framework: resolvedContext.framework,
        scope: resolvedContext.scope,
        fileName: resolvedContext.fileName,
      };
      review.metadata.warnings = this.warningSystem.formatWarningsAsJson(warnings);
      review.metadata.templateUsed = templateId;
      review.metadata.autoDetected = enableAutoDetect;

      this.logger.info(
        {
          analysisId,
          duration: review.metadata.analysisDuration,
          findings: review.findings.length,
          warnings: warnings.length,
          context: resolvedContext.language || 'unknown',
        },
        'Gemini review completed'
      );

      return review;
    } catch (error) {
      this.logger.error({ analysisId, error }, 'Gemini review failed');

      // Wrap in domain-specific error if not already
      if (error instanceof GeminiAnalysisError) {
        throw error;
      }

      if (error instanceof TimeoutError) {
        throw new GeminiTimeoutError(error.message, analysisId, { cause: error });
      }

      if (error instanceof ParseError) {
        throw new GeminiParseError(error.message, analysisId, { cause: error });
      }

      throw new GeminiAnalysisError(
        error instanceof Error ? error.message : 'Unknown error during Gemini review',
        analysisId,
        { cause: error }
      );
    }
  }


  /**
   * Execute Gemini CLI command securely
   * MAJOR FIX #6: Honor per-request cliPath and timeout options
   */
  private async executeGeminiCLI(prompt: string, params: CodeAnalysisParams, timeout: number): Promise<string> {
    // MAJOR FIX #6: Use per-request cliPath if specified, otherwise use config
    const cliPath = params.options?.cliPath || this.config.cliPath;

    // Validate CLI path (security) - now async to resolve PATH
    await this.validateCLIPath(cliPath);

    // Build CLI arguments with model support
    const args = this.buildCLIArgs();

    this.logger.debug({ cliPath, argsCount: args.length, timeout }, 'Executing Gemini CLI');

    try {
      // Execute CLI using execa (secure, no shell injection)
      // Pass prompt via stdin to avoid Windows CMD newline issues
      const result = await execa(cliPath, args, {
        timeout: timeout === 0 ? undefined : timeout, // 0 = unlimited (no timeout)
        reject: true, // Throw on ANY non-zero exit code
        all: true,
        input: prompt, // Send prompt via stdin
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
    args.push('--output-format', 'json');

    return args;
  }

  /**
   * Parse Gemini CLI output into structured format
   */
  private parseGeminiOutput(
    output: string,
    analysisId: string
  ): AnalysisResult {
    try {
      // Clean output (remove ANSI codes, etc.)
      const cleaned = this.cleanOutput(output);

      // Extract JSON from output
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        this.logger.warn({ output: cleaned.substring(0, 500) }, 'No JSON found in Gemini output');
        throw new ParseError('No JSON found in Gemini output');
      }

      let parsed = JSON.parse(jsonMatch[0]);

      // Gemini CLI wraps response in {"response": "...", "stats": {...}}
      // Extract the actual review JSON from the response field
      if (parsed.response && typeof parsed.response === 'string') {
        // Remove markdown code blocks (```json ... ```)
        const responseText = parsed.response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        parsed = JSON.parse(responseText);
      }

      // Validate response against schema
      const validated = GeminiResponseSchema.parse(parsed);

      // Calculate summary
      const summary = this.calculateSummary(validated.findings);

      // Transform to internal format
      const result: AnalysisResult = {
        success: true,
        analysisId,
        timestamp: new Date().toISOString(),
        source: 'gemini',
        summary,
        findings: validated.findings,
        overallAssessment: validated.overallAssessment,
        recommendations: validated.recommendations,
        metadata: {
          analysisDuration: 0,
        },
      };

      // Validate final result
      AnalysisResultSchema.parse(result);

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
