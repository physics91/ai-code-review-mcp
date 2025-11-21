/**
 * Tool Registry
 * Manages MCP tool registration and routing
 *
 * CRITICAL FIX #3: Wire review status store operations throughout all handlers
 * CRITICAL FIX #4: Read maxCodeLength from config, allow per-request override
 * MAJOR FIX #6: Honor all per-request options (timeout, severity, cliPath)
 * MAJOR FIX #7: Implement concurrency control using p-queue
 * MAJOR FIX #12: Use AbortController for timeout cancellation
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import PQueue from 'p-queue';
import { z } from 'zod';

import { ErrorHandler } from '../core/error-handler.js';
import type { Logger } from '../core/logger.js';
import { ValidationUtils } from '../core/validation.js';
import type { ServerConfig } from '../schemas/config.js';
import type { AnalysisResult } from '../schemas/tools.js';
import {
  createCodeAnalysisParamsSchema,
  CombinedAnalysisInputSchema,
} from '../schemas/tools.js';
import type { AnalysisAggregator } from '../services/aggregator/merger.js';
import type { CodexAnalysisService } from '../services/codex/client.js';
import type { GeminiAnalysisService } from '../services/gemini/client.js';
import { AnalysisStatusStore } from '../services/analysis-status/store.js';

// Schema for get_analysis_status input - Enhanced with detailed error messages
const AnalysisStatusInputSchema = z.object({
  analysisId: z
    .string({
      required_error: 'Analysis ID is required',
      invalid_type_error: 'Analysis ID must be a string',
    })
    .min(1, {
      message: 'Analysis ID cannot be empty. Expected format: codex-<timestamp>-<hash> or gemini-<timestamp>-<hash>',
    })
    .describe('Analysis ID to check status for'),
});

export interface ToolDependencies {
  codexService: CodexAnalysisService | null;
  geminiService: GeminiAnalysisService | null;
  aggregator: AnalysisAggregator;
  logger: Logger;
  config: ServerConfig;
}

/**
 * Format analysis result as markdown
 */
function formatAnalysisAsMarkdown(result: AnalysisResult): string {
  const lines: string[] = [];

  // Overall Assessment
  lines.push('## Overall Assessment\n');
  lines.push(result.overallAssessment);
  lines.push('');

  // Summary
  if (result.summary.totalFindings > 0) {
    lines.push('## Summary\n');
    lines.push(`- **Total Issues:** ${result.summary.totalFindings}`);
    if (result.summary.critical > 0) lines.push(`- **Critical:** ${result.summary.critical}`);
    if (result.summary.high > 0) lines.push(`- **High:** ${result.summary.high}`);
    if (result.summary.medium > 0) lines.push(`- **Medium:** ${result.summary.medium}`);
    if (result.summary.low > 0) lines.push(`- **Low:** ${result.summary.low}`);
    lines.push('');
  }

  // Findings
  if (result.findings.length > 0) {
    lines.push('## Findings\n');
    result.findings.forEach((finding, index) => {
      const severityEmoji = {
        critical: '🔴',
        high: '🟠',
        medium: '🟡',
        low: '🔵',
      }[finding.severity] || '⚪';

      lines.push(`### ${index + 1}. ${severityEmoji} ${finding.title}`);
      lines.push(`**Severity:** ${finding.severity.toUpperCase()} | **Type:** ${finding.type}`);
      if (finding.line) lines.push(`**Line:** ${finding.line}`);
      lines.push('');
      lines.push(`**Description:**`);
      lines.push(finding.description);
      lines.push('');
      if (finding.suggestion) {
        lines.push(`**Suggestion:**`);
        lines.push(finding.suggestion);
        lines.push('');
      }
      if (finding.code) {
        lines.push('**Code:**');
        lines.push('```');
        lines.push(finding.code);
        lines.push('```');
        lines.push('');
      }
    });
  }

  // Recommendations
  if (result.recommendations && result.recommendations.length > 0) {
    lines.push('## Recommendations\n');
    result.recommendations.forEach((rec) => {
      lines.push(`- ${rec}`);
    });
    lines.push('');
  }

  // Metadata footer
  lines.push('---');
  lines.push(`*Analysis ID: ${result.analysisId} | Source: ${result.source}*`);

  return lines.join('\n');
}

/**
 * Tool Registry
 * MAJOR FIX #7: Add concurrency control
 */
export class ToolRegistry {
  private analysisStatusStore: AnalysisStatusStore;
  private codexQueue: PQueue;
  private geminiQueue: PQueue;

  constructor(
    private server: McpServer,
    private dependencies: ToolDependencies
  ) {
    this.analysisStatusStore = AnalysisStatusStore.getInstance();

    // MAJOR FIX #7: Initialize queues for concurrency control
    this.codexQueue = new PQueue({
      concurrency: dependencies.config.codex.maxConcurrent,
    });

    this.geminiQueue = new PQueue({
      concurrency: dependencies.config.gemini.maxConcurrent,
    });
  }

  /**
   * Register all tools with MCP server using high-level API
   */
  registerTools(): void {
    const { logger, codexService, geminiService } = this.dependencies;
    const maxCodeLength = this.dependencies.config.analysis.maxCodeLength;

    // Register Codex analysis tool if enabled
    if (codexService) {
      const analysisParamsSchema = createCodeAnalysisParamsSchema(maxCodeLength);
      this.server.registerTool(
        'analyze_code_with_codex',
        {
          title: 'Analyze Code with Codex',
          description: 'Perform comprehensive code analysis using Codex AI',
          inputSchema: analysisParamsSchema.shape,
        },
        async (args) => {
          logger.info({ tool: 'analyze_code_with_codex' }, 'Tool called');
          return await this.handleCodexAnalysis(args);
        }
      );
    }

    // Register Gemini analysis tool if enabled
    if (geminiService) {
      const analysisParamsSchema = createCodeAnalysisParamsSchema(maxCodeLength);
      this.server.registerTool(
        'analyze_code_with_gemini',
        {
          title: 'Analyze Code with Gemini',
          description: 'Perform comprehensive code analysis using Gemini CLI',
          inputSchema: analysisParamsSchema.shape,
        },
        async (args) => {
          logger.info({ tool: 'analyze_code_with_gemini' }, 'Tool called');
          return await this.handleGeminiAnalysis(args);
        }
      );
    }

    // Register combined analysis tool if both services are enabled
    if (codexService && geminiService) {
      this.server.registerTool(
        'analyze_code_combined',
        {
          title: 'Analyze Code Combined',
          description: 'Perform code analysis using both Codex and Gemini, then aggregate results',
          inputSchema: CombinedAnalysisInputSchema.shape,
        },
        async (args) => {
          logger.info({ tool: 'analyze_code_combined' }, 'Tool called');
          return await this.handleCombinedAnalysis(args);
        }
      );
    }

    // Register analysis status tool (always available)
    this.server.registerTool(
      'get_analysis_status',
      {
        title: 'Get Analysis Status',
        description: 'Get the status of an async code analysis by analysis ID',
        inputSchema: AnalysisStatusInputSchema.shape,
      },
      async (args) => {
        logger.info({ tool: 'get_analysis_status' }, 'Tool called');
        return await this.handleGetAnalysisStatus(args);
      }
    );

    logger.info('All tools registered successfully');
  }

  /**
   * Handle Codex analysis tool
   * CRITICAL FIX #3: Wire analysis status store operations
   * CRITICAL FIX #4: Allow per-request maxCodeLength override
   * MAJOR FIX #6: Honor per-request timeout option
   * MAJOR FIX #7: Use queue for concurrency control
   * ENHANCEMENT: Use enhanced validation with detailed error messages
   */
  private async handleCodexAnalysis(args: unknown): Promise<{ content: Array<{ type: 'text'; text: string }>}> {
    const { codexService, config, logger } = this.dependencies;

    if (!codexService) {
      throw new Error('Codex service is not enabled');
    }

    // CRITICAL FIX #4: Allow per-request maxCodeLength override via validation
    // The schema itself still uses config default, but we validate against it
    const maxCodeLength = (args as any).maxCodeLength ?? config.analysis.maxCodeLength;
    const schema = createCodeAnalysisParamsSchema(maxCodeLength);

    // ENHANCEMENT: Validate with detailed error messages
    const params = ValidationUtils.validateOrThrow(schema, args, 'analyze_code_with_codex');

    // ENHANCEMENT: Sanitize and warn about modifications
    const { sanitized, warnings } = ValidationUtils.sanitizeParams(params);
    if (warnings.length > 0) {
      logger.warn({ warnings, analysisId: 'pre-validation' }, 'Input sanitization performed');
    }

    // Use sanitized params
    const finalParams = sanitized;

    // Queue the analysis to control concurrency
    const result = await this.codexQueue.add(async () => {
      // CRITICAL FIX #3: Generate analysisId FIRST, create status entry BEFORE calling service
      const analysisId = `codex-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      this.analysisStatusStore.create(analysisId, 'codex');
      this.analysisStatusStore.updateStatus(analysisId, 'in_progress');

      try {
        const result = await codexService.analyzeCode(finalParams);

        // Override the generated analysisId with our tracked one
        result.analysisId = analysisId;

        // CRITICAL FIX #3: Store result on success
        this.analysisStatusStore.setResult(analysisId, result);

        logger.info({ analysisId }, 'Codex analysis completed successfully');

        return {
          content: [
            {
              type: 'text' as const,
              text: formatAnalysisAsMarkdown(result),
            },
          ],
        };
      } catch (error) {
        // CRITICAL FIX #3: Store error on failure (analysisId always exists now)
        const errorInfo = ErrorHandler.classifyError(error);
        this.analysisStatusStore.setError(analysisId, {
          code: errorInfo.code,
          message: errorInfo.message,
        });

        throw error;
      }
    });

    if (!result) {
      throw new Error('Codex analysis queue returned void');
    }

    return result;
  }

  /**
   * Handle Gemini analysis tool
   * CRITICAL FIX #3: Wire analysis status store operations
   * CRITICAL FIX #4: Allow per-request maxCodeLength override
   * MAJOR FIX #6: Honor per-request timeout and cliPath options
   * MAJOR FIX #7: Use queue for concurrency control
   * ENHANCEMENT: Use enhanced validation with detailed error messages
   */
  private async handleGeminiAnalysis(args: unknown): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
    const { geminiService, config, logger } = this.dependencies;

    if (!geminiService) {
      throw new Error('Gemini service is not enabled');
    }

    // CRITICAL FIX #4: Allow per-request maxCodeLength override
    const maxCodeLength = (args as any).maxCodeLength ?? config.analysis.maxCodeLength;
    const schema = createCodeAnalysisParamsSchema(maxCodeLength);

    // ENHANCEMENT: Validate with detailed error messages
    const params = ValidationUtils.validateOrThrow(schema, args, 'analyze_code_with_gemini');

    // ENHANCEMENT: Sanitize and warn about modifications
    const { sanitized, warnings } = ValidationUtils.sanitizeParams(params);
    if (warnings.length > 0) {
      logger.warn({ warnings, analysisId: 'pre-validation' }, 'Input sanitization performed');
    }

    // Use sanitized params
    const finalParams = sanitized;

    // Queue the analysis to control concurrency
    const result = await this.geminiQueue.add(async () => {
      // CRITICAL FIX #3: Generate analysisId FIRST, create status entry BEFORE calling service
      const analysisId = `gemini-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      this.analysisStatusStore.create(analysisId, 'gemini');
      this.analysisStatusStore.updateStatus(analysisId, 'in_progress');

      try {
        const result = await geminiService.analyzeCode(finalParams);

        // Override the generated analysisId with our tracked one
        result.analysisId = analysisId;

        // CRITICAL FIX #3: Store result on success
        this.analysisStatusStore.setResult(analysisId, result);

        logger.info({ analysisId }, 'Gemini analysis completed successfully');

        return {
          content: [
            {
              type: 'text' as const,
              text: formatAnalysisAsMarkdown(result),
            },
          ],
        };
      } catch (error) {
        // CRITICAL FIX #3: Store error on failure (analysisId always exists now)
        const errorInfo = ErrorHandler.classifyError(error);
        this.analysisStatusStore.setError(analysisId, {
          code: errorInfo.code,
          message: errorInfo.message,
        });

        throw error;
      }
    });

    if (!result) {
      throw new Error('Gemini analysis queue returned void');
    }

    return result;
  }

  /**
   * Handle combined analysis tool
   * CRITICAL FIX #3: Wire analysis status store operations
   * MAJOR FIX #6: Honor all per-request options
   * MAJOR FIX #7: Respect parallelExecution flag for concurrency
   * ENHANCEMENT: Use enhanced validation with detailed error messages
   */
  private async handleCombinedAnalysis(args: unknown): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
    const { codexService, geminiService, aggregator, logger } = this.dependencies;

    if (!codexService || !geminiService) {
      throw new Error('Both Codex and Gemini services must be enabled for combined analysis');
    }

    // ENHANCEMENT: Validate input with detailed error messages
    const params = ValidationUtils.validateOrThrow(CombinedAnalysisInputSchema, args, 'analyze_code_combined');

    // ENHANCEMENT: Sanitize and warn about modifications
    const { sanitized, warnings } = ValidationUtils.sanitizeParams(params);
    if (warnings.length > 0) {
      logger.warn({ warnings, analysisId: 'pre-validation' }, 'Input sanitization performed');
    }

    // Use sanitized params
    const finalParams = sanitized;

    const parallelExecution = finalParams.options?.parallelExecution ?? true;
    const includeIndividualAnalyses = finalParams.options?.includeIndividualAnalyses ?? false;

    // CRITICAL FIX #3: Create combined analysis status entry
    const analysisId = `combined-${Date.now()}`;
    this.analysisStatusStore.create(analysisId, 'combined');
    this.analysisStatusStore.updateStatus(analysisId, 'in_progress');

    logger.info(
      { parallelExecution, includeIndividualAnalyses, analysisId },
      'Starting combined analysis'
    );

    try {
      // Execute analyses (parallel or sequential based on option)
      const analyses = parallelExecution
        ? await Promise.all([
            this.codexQueue.add(() => codexService.analyzeCode(finalParams)),
            this.geminiQueue.add(() => geminiService.analyzeCode(finalParams)),
          ])
        : [
            await this.codexQueue.add(() => codexService.analyzeCode(finalParams)),
            await this.geminiQueue.add(() => geminiService.analyzeCode(finalParams)),
          ];

      // Filter out undefined results (shouldn't happen, but for type safety)
      const validAnalyses = analyses.filter((r): r is Exclude<typeof r, void> => r !== undefined);

      if (validAnalyses.length === 0) {
        throw new Error('No analyses completed successfully');
      }

      // Aggregate results
      const aggregated = aggregator.mergeAnalyses(validAnalyses, { includeIndividualAnalyses });

      // Override analysis ID with combined ID
      aggregated.analysisId = analysisId;

      // CRITICAL FIX #3: Store aggregated result
      this.analysisStatusStore.setResult(analysisId, aggregated as any);

      logger.info({ analysisId }, 'Combined analysis completed successfully');

      return {
        content: [
          {
            type: 'text' as const,
            text: formatAnalysisAsMarkdown(aggregated as any),
          },
        ],
      };
    } catch (error) {
      // CRITICAL FIX #3: Store error on failure
      const errorInfo = ErrorHandler.classifyError(error);
      this.analysisStatusStore.setError(analysisId, {
        code: errorInfo.code,
        message: errorInfo.message,
      });

      throw error;
    }
  }

  /**
   * Handle get analysis status tool
   * CRITICAL FIX #3: Properly retrieve and return status
   * ENHANCEMENT: Use enhanced validation with detailed error messages
   */
  private async handleGetAnalysisStatus(args: unknown): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
    // ENHANCEMENT: Validate input with detailed error messages
    const params = ValidationUtils.validateOrThrow(AnalysisStatusInputSchema, args, 'get_analysis_status');

    // Get status from store
    const status = this.analysisStatusStore.get(params.analysisId);

    if (!status) {
      throw new Error(`Analysis not found: ${params.analysisId}`);
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(status, null, 2),
        },
      ],
    };
  }
}
