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
 */
export function createCodeReviewParamsSchema(maxPromptLength: number = 100000) {
  return z.object({
    prompt: z.string().min(1).max(maxPromptLength).describe('Prompt for code review (can include code, instructions, context, etc.)'),
    options: z
      .object({
        timeout: z.number().min(1000).max(300000).default(60000),
        severity: z.enum(['all', 'high', 'medium']).default('all'),
        cliPath: z.string().optional(),
      })
      .optional(),
  });
}

// Default schema with 100000 max length
export const CodeReviewParamsSchema = createCodeReviewParamsSchema(100000);

export const CombinedReviewInputSchema = z.object({
  prompt: z.string().min(1).max(100000).describe('Prompt for code review'),
  options: z
    .object({
      timeout: z.number().min(1000).max(300000).default(120000),
      severity: z.enum(['all', 'high', 'medium']).default('all'),
      parallelExecution: z.boolean().default(true),
      includeIndividualReviews: z.boolean().default(false),
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
