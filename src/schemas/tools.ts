/**
 * Zod schemas for tool inputs and outputs
 */

import { z } from 'zod';

// Common schemas
export const ReviewFocusSchema = z.enum(['security', 'performance', 'style', 'bugs', 'all']);

export const FindingTypeSchema = z.enum(['bug', 'security', 'performance', 'style', 'suggestion']);

export const SeveritySchema = z.enum(['critical', 'high', 'medium', 'low', 'info']);

export const ReviewFindingSchema = z.object({
  type: FindingTypeSchema,
  severity: SeveritySchema,
  line: z.number().nullable(),
  lineRange: z
    .object({
      start: z.number(),
      end: z.number(),
    })
    .optional(),
  title: z.string(),
  description: z.string(),
  suggestion: z.string().optional(),
  code: z.string().optional(),
});

export const ReviewSummarySchema = z.object({
  totalFindings: z.number(),
  critical: z.number(),
  high: z.number(),
  medium: z.number(),
  low: z.number(),
});

export const ReviewMetadataSchema = z.object({
  language: z.string().optional(),
  linesOfCode: z.number().optional(),
  reviewDuration: z.number(),
});

/**
 * Create Code Review Params Schema with configurable max prompt length
 * Simplified to accept a single prompt parameter instead of structured code/context
 * Enhanced with detailed error messages for better UX
 */
export function createCodeReviewParamsSchema(maxPromptLength: number = 100000) {
  return z.object({
    prompt: z
      .string({
        required_error: 'Prompt is required',
        invalid_type_error: 'Prompt must be a string',
      })
      .min(1, {
        message: 'Prompt cannot be empty - please provide code or instructions to review',
      })
      .max(maxPromptLength, {
        message: `Prompt exceeds maximum length of ${maxPromptLength} characters. Consider splitting into smaller reviews or use a more concise prompt.`,
      })
      .describe('Prompt for code review (can include code, instructions, context, etc.)'),
    options: z
      .object({
        timeout: z
          .number({
            invalid_type_error: 'Timeout must be a number (milliseconds)',
          })
          .min(1000, {
            message: 'Timeout must be at least 1000ms (1 second) to allow sufficient execution time',
          })
          .max(300000, {
            message: 'Timeout cannot exceed 300000ms (5 minutes) to prevent resource exhaustion',
          })
          .default(60000),
        severity: z
          .enum(['all', 'high', 'medium'], {
            errorMap: () => ({
              message: "Severity must be one of: 'all' (all findings), 'high' (critical + high), or 'medium' (critical + high + medium)",
            }),
          })
          .default('all'),
        cliPath: z
          .string({
            invalid_type_error: 'CLI path must be a string',
          })
          .min(1, {
            message: 'CLI path cannot be empty if provided',
          })
          .optional()
          .describe('Custom CLI executable path (must be whitelisted for security)'),
      })
      .optional(),
  });
}

// Default schema with 100000 max length
export const CodeReviewParamsSchema = createCodeReviewParamsSchema(100000);

export const CombinedReviewInputSchema = z.object({
  prompt: z
    .string({
      required_error: 'Prompt is required',
      invalid_type_error: 'Prompt must be a string',
    })
    .min(1, {
      message: 'Prompt cannot be empty - please provide code or instructions to review',
    })
    .max(100000, {
      message: 'Prompt exceeds maximum length of 100000 characters. Consider splitting into smaller reviews.',
    })
    .describe('Prompt for code review'),
  options: z
    .object({
      timeout: z
        .number({
          invalid_type_error: 'Timeout must be a number (milliseconds)',
        })
        .min(1000, {
          message: 'Timeout must be at least 1000ms (1 second)',
        })
        .max(300000, {
          message: 'Timeout cannot exceed 300000ms (5 minutes)',
        })
        .default(120000),
      severity: z
        .enum(['all', 'high', 'medium'], {
          errorMap: () => ({
            message: "Severity must be one of: 'all', 'high', or 'medium'",
          }),
        })
        .default('all'),
      parallelExecution: z
        .boolean({
          invalid_type_error: 'parallelExecution must be a boolean (true or false)',
        })
        .default(true)
        .describe('Run Codex and Gemini reviews in parallel (true) or sequentially (false)'),
      includeIndividualReviews: z
        .boolean({
          invalid_type_error: 'includeIndividualReviews must be a boolean (true or false)',
        })
        .default(false)
        .describe('Include individual review results from Codex and Gemini in the combined output'),
    })
    .optional(),
});

// Output schemas
export const ReviewResultSchema = z.object({
  success: z.boolean(),
  reviewId: z.string(),
  timestamp: z.string(),
  source: z.enum(['codex', 'gemini', 'combined']),
  summary: ReviewSummarySchema,
  findings: z.array(ReviewFindingSchema),
  overallAssessment: z.string(),
  recommendations: z.array(z.string()).optional(),
  metadata: ReviewMetadataSchema,
});

export const AggregatedFindingSchema = ReviewFindingSchema.extend({
  sources: z.array(z.enum(['codex', 'gemini'])),
  confidence: z.enum(['high', 'medium', 'low']),
});

export const AggregatedReviewSchema = z.object({
  success: z.boolean(),
  reviewId: z.string(),
  timestamp: z.string(),
  source: z.literal('combined'),
  summary: ReviewSummarySchema.extend({
    consensus: z.number().min(0).max(100),
  }),
  findings: z.array(AggregatedFindingSchema),
  overallAssessment: z.string(),
  recommendations: z.array(z.string()).optional(),
  individualReviews: z
    .object({
      codex: ReviewResultSchema.optional(),
      gemini: ReviewResultSchema.optional(),
    })
    .optional(),
  metadata: ReviewMetadataSchema.extend({
    codexDuration: z.number().optional(),
    geminiDuration: z.number().optional(),
  }),
});

// Type exports
export type CodeReviewParams = z.infer<typeof CodeReviewParamsSchema>;
export type CombinedReviewInput = z.infer<typeof CombinedReviewInputSchema>;
export type ReviewResult = z.infer<typeof ReviewResultSchema>;
export type AggregatedReview = z.infer<typeof AggregatedReviewSchema>;
export type ReviewFinding = z.infer<typeof ReviewFindingSchema>;
export type AggregatedFinding = z.infer<typeof AggregatedFindingSchema>;
