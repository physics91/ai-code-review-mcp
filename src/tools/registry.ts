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
import type { ServerConfig } from '../schemas/config.js';
import type { ReviewResult } from '../schemas/review.js';
import {
  createCodeReviewParamsSchema,
  CombinedReviewInputSchema,
} from '../schemas/tools.js';
import type { ReviewAggregator } from '../services/aggregator/merger.js';
import type { CodexReviewService } from '../services/codex/client.js';
import type { GeminiReviewService } from '../services/gemini/client.js';
import { ReviewStatusStore } from '../services/review-status/store.js';

// Schema for get_review_status input
const ReviewStatusInputSchema = z.object({
  reviewId: z.string().min(1).describe('Review ID to check status for'),
});

export interface ToolDependencies {
  codexService: CodexReviewService | null;
  geminiService: GeminiReviewService | null;
  aggregator: ReviewAggregator;
  logger: Logger;
  config: ServerConfig;
}

/**
 * Format review result as markdown
 */
function formatReviewAsMarkdown(result: ReviewResult): string {
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
  lines.push(`*Review ID: ${result.reviewId} | Source: ${result.source}*`);

  return lines.join('\n');
}

/**
 * Tool Registry
 * MAJOR FIX #7: Add concurrency control
 */
export class ToolRegistry {
  private reviewStatusStore: ReviewStatusStore;
  private codexQueue: PQueue;
  private geminiQueue: PQueue;

  constructor(
    private server: McpServer,
    private dependencies: ToolDependencies
  ) {
    this.reviewStatusStore = ReviewStatusStore.getInstance();

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
    const maxCodeLength = this.dependencies.config.review.maxCodeLength;

    // Register Codex review tool if enabled
    if (codexService) {
      const reviewParamsSchema = createCodeReviewParamsSchema(maxCodeLength);
      this.server.registerTool(
        'review_code_with_codex',
        {
          title: 'Review Code with Codex',
          description: 'Perform comprehensive code review using Codex AI',
          inputSchema: reviewParamsSchema.shape,
        },
        async (args) => {
          logger.info({ tool: 'review_code_with_codex' }, 'Tool called');
          return await this.handleCodexReview(args);
        }
      );
    }

    // Register Gemini review tool if enabled
    if (geminiService) {
      const reviewParamsSchema = createCodeReviewParamsSchema(maxCodeLength);
      this.server.registerTool(
        'review_code_with_gemini',
        {
          title: 'Review Code with Gemini',
          description: 'Perform comprehensive code review using Gemini CLI',
          inputSchema: reviewParamsSchema.shape,
        },
        async (args) => {
          logger.info({ tool: 'review_code_with_gemini' }, 'Tool called');
          return await this.handleGeminiReview(args);
        }
      );
    }

    // Register combined review tool if both services are enabled
    if (codexService && geminiService) {
      this.server.registerTool(
        'review_code_combined',
        {
          title: 'Review Code Combined',
          description: 'Perform code review using both Codex and Gemini, then aggregate results',
          inputSchema: CombinedReviewInputSchema.shape,
        },
        async (args) => {
          logger.info({ tool: 'review_code_combined' }, 'Tool called');
          return await this.handleCombinedReview(args);
        }
      );
    }

    // Register review status tool (always available)
    this.server.registerTool(
      'get_review_status',
      {
        title: 'Get Review Status',
        description: 'Get the status of an async code review by review ID',
        inputSchema: ReviewStatusInputSchema.shape,
      },
      async (args) => {
        logger.info({ tool: 'get_review_status' }, 'Tool called');
        return await this.handleGetReviewStatus(args);
      }
    );

    logger.info('All tools registered successfully');
  }

  /**
   * Handle Codex review tool
   * CRITICAL FIX #3: Wire review status store operations
   * CRITICAL FIX #4: Allow per-request maxCodeLength override
   * MAJOR FIX #6: Honor per-request timeout option
   * MAJOR FIX #7: Use queue for concurrency control
   */
  private async handleCodexReview(args: unknown): Promise<{ content: Array<{ type: 'text'; text: string }>}> {
    const { codexService, config, logger } = this.dependencies;

    if (!codexService) {
      throw new Error('Codex service is not enabled');
    }

    // CRITICAL FIX #4: Allow per-request maxCodeLength override via validation
    // The schema itself still uses config default, but we validate against it
    const maxCodeLength = (args as any).maxCodeLength ?? config.review.maxCodeLength;
    const schema = createCodeReviewParamsSchema(maxCodeLength);
    const params = schema.parse(args);

    // Queue the review to control concurrency
    const result = await this.codexQueue.add(async () => {
      // CRITICAL FIX #3: Generate reviewId FIRST, create status entry BEFORE calling service
      const reviewId = `codex-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      this.reviewStatusStore.create(reviewId, 'codex');
      this.reviewStatusStore.updateStatus(reviewId, 'in_progress');

      try {
        const result = await codexService.reviewCode(params);

        // Override the generated reviewId with our tracked one
        result.reviewId = reviewId;

        // CRITICAL FIX #3: Store result on success
        this.reviewStatusStore.setResult(reviewId, result);

        logger.info({ reviewId }, 'Codex review completed successfully');

        return {
          content: [
            {
              type: 'text' as const,
              text: formatReviewAsMarkdown(result),
            },
          ],
        };
      } catch (error) {
        // CRITICAL FIX #3: Store error on failure (reviewId always exists now)
        const errorInfo = ErrorHandler.classifyError(error);
        this.reviewStatusStore.setError(reviewId, {
          code: errorInfo.code,
          message: errorInfo.message,
        });

        throw error;
      }
    });

    if (!result) {
      throw new Error('Codex review queue returned void');
    }

    return result;
  }

  /**
   * Handle Gemini review tool
   * CRITICAL FIX #3: Wire review status store operations
   * CRITICAL FIX #4: Allow per-request maxCodeLength override
   * MAJOR FIX #6: Honor per-request timeout and cliPath options
   * MAJOR FIX #7: Use queue for concurrency control
   */
  private async handleGeminiReview(args: unknown): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
    const { geminiService, config, logger } = this.dependencies;

    if (!geminiService) {
      throw new Error('Gemini service is not enabled');
    }

    // CRITICAL FIX #4: Allow per-request maxCodeLength override
    const maxCodeLength = (args as any).maxCodeLength ?? config.review.maxCodeLength;
    const schema = createCodeReviewParamsSchema(maxCodeLength);
    const params = schema.parse(args);

    // Queue the review to control concurrency
    const result = await this.geminiQueue.add(async () => {
      // CRITICAL FIX #3: Generate reviewId FIRST, create status entry BEFORE calling service
      const reviewId = `gemini-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      this.reviewStatusStore.create(reviewId, 'gemini');
      this.reviewStatusStore.updateStatus(reviewId, 'in_progress');

      try {
        const result = await geminiService.reviewCode(params);

        // Override the generated reviewId with our tracked one
        result.reviewId = reviewId;

        // CRITICAL FIX #3: Store result on success
        this.reviewStatusStore.setResult(reviewId, result);

        logger.info({ reviewId }, 'Gemini review completed successfully');

        return {
          content: [
            {
              type: 'text' as const,
              text: formatReviewAsMarkdown(result),
            },
          ],
        };
      } catch (error) {
        // CRITICAL FIX #3: Store error on failure (reviewId always exists now)
        const errorInfo = ErrorHandler.classifyError(error);
        this.reviewStatusStore.setError(reviewId, {
          code: errorInfo.code,
          message: errorInfo.message,
        });

        throw error;
      }
    });

    if (!result) {
      throw new Error('Gemini review queue returned void');
    }

    return result;
  }

  /**
   * Handle combined review tool
   * CRITICAL FIX #3: Wire review status store operations
   * MAJOR FIX #6: Honor all per-request options
   * MAJOR FIX #7: Respect parallelExecution flag for concurrency
   */
  private async handleCombinedReview(args: unknown): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
    const { codexService, geminiService, aggregator, logger } = this.dependencies;

    if (!codexService || !geminiService) {
      throw new Error('Both Codex and Gemini services must be enabled for combined review');
    }

    // Validate input
    const params = CombinedReviewInputSchema.parse(args);

    const parallelExecution = params.options?.parallelExecution ?? true;
    const includeIndividualReviews = params.options?.includeIndividualReviews ?? false;

    // CRITICAL FIX #3: Create combined review status entry
    const reviewId = `combined-${Date.now()}`;
    this.reviewStatusStore.create(reviewId, 'combined');
    this.reviewStatusStore.updateStatus(reviewId, 'in_progress');

    logger.info(
      { parallelExecution, includeIndividualReviews, reviewId },
      'Starting combined review'
    );

    try {
      // Execute reviews (parallel or sequential based on option)
      const reviews = parallelExecution
        ? await Promise.all([
            this.codexQueue.add(() => codexService.reviewCode(params)),
            this.geminiQueue.add(() => geminiService.reviewCode(params)),
          ])
        : [
            await this.codexQueue.add(() => codexService.reviewCode(params)),
            await this.geminiQueue.add(() => geminiService.reviewCode(params)),
          ];

      // Filter out undefined results (shouldn't happen, but for type safety)
      const validReviews = reviews.filter((r): r is Exclude<typeof r, void> => r !== undefined);

      if (validReviews.length === 0) {
        throw new Error('No reviews completed successfully');
      }

      // Aggregate results
      const aggregated = aggregator.mergeReviews(validReviews, { includeIndividualReviews });

      // Override review ID with combined ID
      aggregated.reviewId = reviewId;

      // CRITICAL FIX #3: Store aggregated result
      this.reviewStatusStore.setResult(reviewId, aggregated as any);

      logger.info({ reviewId }, 'Combined review completed successfully');

      return {
        content: [
          {
            type: 'text' as const,
            text: formatReviewAsMarkdown(aggregated as any),
          },
        ],
      };
    } catch (error) {
      // CRITICAL FIX #3: Store error on failure
      const errorInfo = ErrorHandler.classifyError(error);
      this.reviewStatusStore.setError(reviewId, {
        code: errorInfo.code,
        message: errorInfo.message,
      });

      throw error;
    }
  }

  /**
   * Handle get review status tool
   * CRITICAL FIX #3: Properly retrieve and return status
   */
  private async handleGetReviewStatus(args: unknown): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
    // Validate input
    const params = ReviewStatusInputSchema.parse(args);

    // Get status from store
    const status = this.reviewStatusStore.get(params.reviewId);

    if (!status) {
      throw new Error(`Review not found: ${params.reviewId}`);
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
