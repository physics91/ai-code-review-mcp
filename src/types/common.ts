/**
 * Common types for Code Review MCP Server
 */

export type ReviewSource = 'codex' | 'gemini' | 'combined';

export type FindingType = 'bug' | 'security' | 'performance' | 'style' | 'suggestion';

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type Confidence = 'high' | 'medium' | 'low';

export type ReviewFocus = 'security' | 'performance' | 'style' | 'bugs' | 'all';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface ReviewFinding {
  type: FindingType;
  severity: Severity;
  line: number | null;
  lineRange?: {
    start: number;
    end: number;
  };
  title: string;
  description: string;
  suggestion?: string;
  code?: string;
}

export interface ReviewSummary {
  totalFindings: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface ReviewMetadata {
  language?: string;
  linesOfCode: number;
  reviewDuration: number;
}

export interface CodeReviewParams {
  code: string;
  language?: string;
  context?: {
    fileName?: string;
    projectType?: string;
    reviewFocus?: ReviewFocus[];
  };
  options?: {
    timeout?: number;
    includeExplanations?: boolean;
    severity?: 'all' | 'high' | 'medium';
    cliPath?: string; // For Gemini
  };
}

export interface ReviewResult {
  success: boolean;
  reviewId: string;
  timestamp: string;
  source: ReviewSource;
  summary: ReviewSummary;
  findings: ReviewFinding[];
  overallAssessment: string;
  recommendations?: string[];
  metadata: ReviewMetadata;
}

export interface AggregatedFinding extends ReviewFinding {
  sources: ReviewSource[];
  confidence: Confidence;
}

export interface AggregatedReview extends Omit<ReviewResult, 'source' | 'summary' | 'findings'> {
  source: 'combined';
  summary: ReviewSummary & {
    consensus: number;
  };
  findings: AggregatedFinding[];
  individualReviews?: {
    codex?: ReviewResult;
    gemini?: ReviewResult;
  };
  metadata: ReviewMetadata & {
    codexDuration?: number;
    geminiDuration?: number;
  };
}

export class BaseError extends Error {
  public code: string;

  constructor(
    message: string,
    code: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}
