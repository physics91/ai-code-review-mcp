# Code Review MCP Server - Technical Specifications

## 1. Codex Service Specification

### 1.1 Service Interface

```typescript
// services/codex/client.ts

import { z } from 'zod';

/**
 * Codex Review Service
 * Handles code review using Codex MCP tool
 */
export class CodexReviewService {
  constructor(
    private config: CodexServiceConfig,
    private logger: Logger,
    private mcpClient: MCPToolClient
  ) {}

  /**
   * Perform code review using Codex
   * @param params - Review parameters
   * @returns Structured review result
   * @throws CodexReviewError if review fails
   */
  async reviewCode(params: CodeReviewParams): Promise<CodexReviewResult> {
    const startTime = Date.now();
    const reviewId = generateUUID();

    try {
      this.logger.info({ reviewId, params: sanitizeParams(params) }, 'Starting Codex review');

      // Validate input
      const validated = CodeReviewParamsSchema.parse(params);

      // Format prompt
      const prompt = this.formatReviewPrompt(validated);

      // Execute review with retry logic
      const response = await this.executeWithRetry(
        () => this.callCodexMCPTool(prompt),
        this.config.retryAttempts
      );

      // Parse and structure response
      const review = this.parseCodexResponse(response, reviewId);

      // Add metadata
      review.metadata.reviewDuration = Date.now() - startTime;

      this.logger.info(
        { reviewId, duration: review.metadata.reviewDuration, findings: review.findings.length },
        'Codex review completed'
      );

      return review;
    } catch (error) {
      this.logger.error({ reviewId, error }, 'Codex review failed');
      throw new CodexReviewError('Review failed', { cause: error, reviewId });
    }
  }

  /**
   * Format code review prompt for Codex
   * @private
   */
  private formatReviewPrompt(params: CodeReviewParams): string {
    const { code, language, context, options } = params;

    const focusAreas = context?.reviewFocus || ['all'];
    const includeExplanations = options?.includeExplanations ?? true;

    let prompt = `You are an expert code reviewer. Perform a comprehensive code review of the following ${language || 'code'}.

## Code to Review:
\`\`\`${language || 'plaintext'}
${code}
\`\`\`

`;

    if (context?.fileName) {
      prompt += `File: ${context.fileName}\n`;
    }

    if (context?.projectType) {
      prompt += `Project Type: ${context.projectType}\n`;
    }

    prompt += `
## Review Focus Areas:
${focusAreas.includes('all') ? '- All aspects (bugs, security, performance, style)' : focusAreas.map(area => `- ${area}`).join('\n')}

## Instructions:
1. Analyze the code for issues in the specified focus areas
2. Identify bugs, security vulnerabilities, performance issues, and style problems
3. Assign severity levels: critical, high, medium, low, info
4. Provide specific line numbers where applicable
5. ${includeExplanations ? 'Include detailed explanations for each finding' : 'Provide concise descriptions'}
6. Suggest concrete improvements

## Output Format:
Return a JSON object with the following structure:
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
}

Begin the review now.`;

    return prompt;
  }

  /**
   * Call Codex MCP tool with prompt only
   * @private
   */
  private async callCodexMCPTool(prompt: string): Promise<string> {
    const timeout = this.config.timeout;

    this.logger.debug({ promptLength: prompt.length }, 'Calling Codex MCP tool');

    try {
      // Use ONLY the prompt parameter as per requirements
      const result = await Promise.race([
        this.mcpClient.callTool('mcp__codex__codex', { prompt }),
        this.createTimeout(timeout)
      ]);

      if (typeof result !== 'string') {
        throw new Error('Invalid response type from Codex MCP tool');
      }

      return result;
    } catch (error) {
      if (error instanceof TimeoutError) {
        throw new CodexTimeoutError(`Codex review timed out after ${timeout}ms`);
      }
      throw new CodexExecutionError('Codex MCP tool execution failed', { cause: error });
    }
  }

  /**
   * Parse Codex response into structured format
   * @private
   */
  private parseCodexResponse(response: string, reviewId: string): CodexReviewResult {
    try {
      // Extract JSON from response (Codex might include markdown formatting)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in Codex response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate against schema
      const validated = CodexResponseSchema.parse(parsed);

      // Transform to internal format
      return {
        success: true,
        reviewId,
        timestamp: new Date().toISOString(),
        source: 'codex' as const,
        summary: this.calculateSummary(validated.findings),
        findings: validated.findings,
        overallAssessment: validated.overallAssessment,
        recommendations: validated.recommendations,
        metadata: {
          language: undefined,
          linesOfCode: 0,
          reviewDuration: 0
        }
      };
    } catch (error) {
      this.logger.error({ error, response: response.substring(0, 500) }, 'Failed to parse Codex response');
      throw new CodexParseError('Failed to parse Codex response', { cause: error });
    }
  }

  /**
   * Calculate summary statistics from findings
   * @private
   */
  private calculateSummary(findings: ReviewFinding[]): ReviewSummary {
    return {
      totalFindings: findings.length,
      critical: findings.filter(f => f.severity === 'critical').length,
      high: findings.filter(f => f.severity === 'high').length,
      medium: findings.filter(f => f.severity === 'medium').length,
      low: findings.filter(f => f.severity === 'low').length
    };
  }

  /**
   * Execute function with retry logic
   * @private
   */
  private async executeWithRetry<T>(
    fn: () => Promise<T>,
    maxAttempts: number
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        if (attempt < maxAttempts && this.isRetryable(error)) {
          const delay = this.calculateBackoff(attempt);
          this.logger.warn(
            { attempt, maxAttempts, delay, error: lastError.message },
            'Retrying Codex review'
          );
          await this.sleep(delay);
        } else {
          break;
        }
      }
    }

    throw lastError!;
  }

  /**
   * Check if error is retryable
   * @private
   */
  private isRetryable(error: unknown): boolean {
    if (error instanceof TimeoutError) return true;
    if (error instanceof CodexExecutionError) return true;
    return false;
  }

  /**
   * Calculate exponential backoff delay
   * @private
   */
  private calculateBackoff(attempt: number): number {
    const baseDelay = this.config.retryDelay || 1000;
    const maxDelay = 10000;
    return Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
  }

  /**
   * Create timeout promise
   * @private
   */
  private createTimeout(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new TimeoutError(`Operation timed out after ${ms}ms`)), ms);
    });
  }

  /**
   * Sleep utility
   * @private
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Configuration interface
export interface CodexServiceConfig {
  timeout: number;
  retryAttempts: number;
  retryDelay: number;
}

// Custom errors
export class CodexReviewError extends Error {
  constructor(message: string, public details?: any) {
    super(message);
    this.name = 'CodexReviewError';
  }
}

export class CodexTimeoutError extends CodexReviewError {
  constructor(message: string) {
    super(message);
    this.name = 'CodexTimeoutError';
  }
}

export class CodexExecutionError extends CodexReviewError {
  constructor(message: string, details?: any) {
    super(message, details);
    this.name = 'CodexExecutionError';
  }
}

export class CodexParseError extends CodexReviewError {
  constructor(message: string, details?: any) {
    super(message, details);
    this.name = 'CodexParseError';
  }
}

class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}
```

### 1.2 Codex Schemas

```typescript
// services/codex/types.ts

import { z } from 'zod';

export const CodexResponseSchema = z.object({
  findings: z.array(z.object({
    type: z.enum(['bug', 'security', 'performance', 'style', 'suggestion']),
    severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
    line: z.number().nullable(),
    title: z.string(),
    description: z.string(),
    suggestion: z.string().optional(),
    code: z.string().optional()
  })),
  overallAssessment: z.string(),
  recommendations: z.array(z.string()).optional()
});

export type CodexResponse = z.infer<typeof CodexResponseSchema>;
```

## 2. Gemini Service Specification

### 2.1 Service Interface

```typescript
// services/gemini/client.ts

import { execa } from 'execa';
import { z } from 'zod';

/**
 * Gemini Review Service
 * Handles code review using Gemini CLI
 */
export class GeminiReviewService {
  constructor(
    private config: GeminiServiceConfig,
    private logger: Logger
  ) {}

  /**
   * Perform code review using Gemini CLI
   * @param params - Review parameters
   * @returns Structured review result
   * @throws GeminiReviewError if review fails
   */
  async reviewCode(params: CodeReviewParams): Promise<GeminiReviewResult> {
    const startTime = Date.now();
    const reviewId = generateUUID();

    try {
      this.logger.info({ reviewId, params: sanitizeParams(params) }, 'Starting Gemini review');

      // Validate input
      const validated = CodeReviewParamsSchema.parse(params);

      // Format prompt
      const prompt = this.formatReviewPrompt(validated);

      // Execute CLI with retry logic
      const output = await this.executeWithRetry(
        () => this.executeGeminiCLI(prompt, validated),
        this.config.retryAttempts
      );

      // Parse and structure response
      const review = this.parseGeminiOutput(output, reviewId);

      // Add metadata
      review.metadata.reviewDuration = Date.now() - startTime;

      this.logger.info(
        { reviewId, duration: review.metadata.reviewDuration, findings: review.findings.length },
        'Gemini review completed'
      );

      return review;
    } catch (error) {
      this.logger.error({ reviewId, error }, 'Gemini review failed');
      throw new GeminiReviewError('Review failed', { cause: error, reviewId });
    }
  }

  /**
   * Format code review prompt for Gemini
   * @private
   */
  private formatReviewPrompt(params: CodeReviewParams): string {
    // Similar to Codex prompt formatting
    const { code, language, context, options } = params;

    const focusAreas = context?.reviewFocus || ['all'];
    const includeExplanations = options?.includeExplanations ?? true;

    return `You are an expert code reviewer. Perform a comprehensive code review of the following ${language || 'code'}.

## Code to Review:
\`\`\`${language || 'plaintext'}
${code}
\`\`\`

${context?.fileName ? `File: ${context.fileName}` : ''}
${context?.projectType ? `Project Type: ${context.projectType}` : ''}

## Review Focus Areas:
${focusAreas.includes('all') ? '- All aspects (bugs, security, performance, style)' : focusAreas.map(area => `- ${area}`).join('\n')}

## Instructions:
1. Analyze the code for issues in the specified focus areas
2. Identify bugs, security vulnerabilities, performance issues, and style problems
3. Assign severity levels: critical, high, medium, low, info
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
  }

  /**
   * Execute Gemini CLI command
   * @private
   */
  private async executeGeminiCLI(
    prompt: string,
    params: CodeReviewParams
  ): Promise<string> {
    const cliPath = params.options?.cliPath || this.config.cliPath;
    const timeout = this.config.timeout;

    // Validate CLI path
    this.validateCLIPath(cliPath);

    // Build CLI arguments
    const args = this.buildCLIArgs(prompt);

    this.logger.debug({ cliPath, args: args.length }, 'Executing Gemini CLI');

    try {
      // Execute CLI using execa (secure, no shell injection)
      const result = await execa(cliPath, args, {
        timeout,
        input: prompt,
        reject: true,
        all: true,
        env: {
          ...process.env,
          GEMINI_MODEL: this.config.model || undefined
        }
      });

      return result.stdout || result.all || '';
    } catch (error: any) {
      if (error.timedOut) {
        throw new GeminiTimeoutError(`Gemini CLI timed out after ${timeout}ms`);
      }

      if (error.exitCode !== undefined) {
        throw new GeminiCLIError(
          `Gemini CLI exited with code ${error.exitCode}`,
          {
            exitCode: error.exitCode,
            stderr: error.stderr,
            stdout: error.stdout
          }
        );
      }

      throw new GeminiExecutionError('Gemini CLI execution failed', { cause: error });
    }
  }

  /**
   * Validate CLI path against allowed paths
   * @private
   */
  private validateCLIPath(cliPath: string): void {
    // Security: Only allow whitelisted paths
    const allowedPaths = [
      '/usr/local/bin/gemini',
      '/opt/gemini/bin/gemini',
      process.env.GEMINI_CLI_PATH
    ].filter(Boolean);

    const isAllowed = allowedPaths.some(allowed => {
      try {
        return require('path').resolve(cliPath) === require('path').resolve(allowed!);
      } catch {
        return false;
      }
    });

    if (!isAllowed) {
      throw new GeminiSecurityError(`CLI path not in allowed list: ${cliPath}`);
    }
  }

  /**
   * Build CLI arguments
   * @private
   */
  private buildCLIArgs(prompt: string): string[] {
    const args: string[] = [];

    // Add configured arguments
    if (this.config.args) {
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
   * @private
   */
  private parseGeminiOutput(output: string, reviewId: string): GeminiReviewResult {
    try {
      // Clean output (remove ANSI codes, extra whitespace)
      const cleaned = this.cleanOutput(output);

      // Extract JSON from output
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in Gemini output');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate against schema
      const validated = GeminiResponseSchema.parse(parsed);

      // Transform to internal format
      return {
        success: true,
        reviewId,
        timestamp: new Date().toISOString(),
        source: 'gemini' as const,
        summary: this.calculateSummary(validated.findings),
        findings: validated.findings,
        overallAssessment: validated.overallAssessment,
        recommendations: validated.recommendations,
        metadata: {
          language: undefined,
          linesOfCode: 0,
          reviewDuration: 0
        }
      };
    } catch (error) {
      this.logger.error({ error, output: output.substring(0, 500) }, 'Failed to parse Gemini output');
      throw new GeminiParseError('Failed to parse Gemini output', { cause: error });
    }
  }

  /**
   * Clean CLI output (remove ANSI codes, etc.)
   * @private
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
   * @private
   */
  private calculateSummary(findings: ReviewFinding[]): ReviewSummary {
    return {
      totalFindings: findings.length,
      critical: findings.filter(f => f.severity === 'critical').length,
      high: findings.filter(f => f.severity === 'high').length,
      medium: findings.filter(f => f.severity === 'medium').length,
      low: findings.filter(f => f.severity === 'low').length
    };
  }

  /**
   * Execute function with retry logic
   * @private
   */
  private async executeWithRetry<T>(
    fn: () => Promise<T>,
    maxAttempts: number
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        if (attempt < maxAttempts && this.isRetryable(error)) {
          const delay = this.calculateBackoff(attempt);
          this.logger.warn(
            { attempt, maxAttempts, delay, error: lastError.message },
            'Retrying Gemini review'
          );
          await this.sleep(delay);
        } else {
          break;
        }
      }
    }

    throw lastError!;
  }

  /**
   * Check if error is retryable
   * @private
   */
  private isRetryable(error: unknown): boolean {
    if (error instanceof GeminiTimeoutError) return true;
    if (error instanceof GeminiCLIError) {
      // Retry on specific exit codes
      return [1, 2, 124].includes(error.details?.exitCode);
    }
    return false;
  }

  /**
   * Calculate exponential backoff delay
   * @private
   */
  private calculateBackoff(attempt: number): number {
    const baseDelay = this.config.retryDelay || 1000;
    const maxDelay = 10000;
    return Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
  }

  /**
   * Sleep utility
   * @private
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Configuration interface
export interface GeminiServiceConfig {
  cliPath: string;
  timeout: number;
  retryAttempts: number;
  retryDelay: number;
  model?: string;
  args?: string[];
}

// Custom errors
export class GeminiReviewError extends Error {
  constructor(message: string, public details?: any) {
    super(message);
    this.name = 'GeminiReviewError';
  }
}

export class GeminiTimeoutError extends GeminiReviewError {
  constructor(message: string) {
    super(message);
    this.name = 'GeminiTimeoutError';
  }
}

export class GeminiExecutionError extends GeminiReviewError {
  constructor(message: string, details?: any) {
    super(message, details);
    this.name = 'GeminiExecutionError';
  }
}

export class GeminiCLIError extends GeminiReviewError {
  constructor(message: string, details?: any) {
    super(message, details);
    this.name = 'GeminiCLIError';
  }
}

export class GeminiParseError extends GeminiReviewError {
  constructor(message: string, details?: any) {
    super(message, details);
    this.name = 'GeminiParseError';
  }
}

export class GeminiSecurityError extends GeminiReviewError {
  constructor(message: string) {
    super(message);
    this.name = 'GeminiSecurityError';
  }
}
```

### 2.2 Gemini Schemas

```typescript
// services/gemini/types.ts

import { z } from 'zod';

export const GeminiResponseSchema = z.object({
  findings: z.array(z.object({
    type: z.enum(['bug', 'security', 'performance', 'style', 'suggestion']),
    severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
    line: z.number().nullable(),
    title: z.string(),
    description: z.string(),
    suggestion: z.string().optional(),
    code: z.string().optional()
  })),
  overallAssessment: z.string(),
  recommendations: z.array(z.string()).optional()
});

export type GeminiResponse = z.infer<typeof GeminiResponseSchema>;
```

## 3. Review Aggregator Specification

### 3.1 Aggregator Interface

```typescript
// services/aggregator/merger.ts

import { z } from 'zod';

/**
 * Review Aggregator
 * Merges and deduplicates reviews from multiple sources
 */
export class ReviewAggregator {
  constructor(
    private config: AggregatorConfig,
    private logger: Logger
  ) {}

  /**
   * Merge reviews from multiple sources
   * @param reviews - Array of reviews to merge
   * @returns Aggregated review with deduplicated findings
   */
  mergeReviews(reviews: ReviewResult[]): AggregatedReview {
    const startTime = Date.now();

    this.logger.info({ reviewCount: reviews.length }, 'Merging reviews');

    // Collect all findings
    const allFindings = reviews.flatMap(review =>
      review.findings.map(finding => ({
        ...finding,
        source: review.source
      }))
    );

    // Deduplicate findings
    const deduplicated = this.config.deduplication?.enabled
      ? this.deduplicateFindings(allFindings)
      : allFindings.map(f => ({ ...f, sources: [f.source], confidence: 'medium' as const }));

    // Calculate summary
    const summary = this.calculateAggregatedSummary(deduplicated, reviews.length);

    // Generate overall assessment
    const overallAssessment = this.generateOverallAssessment(reviews, deduplicated);

    // Merge recommendations
    const recommendations = this.mergeRecommendations(reviews);

    const duration = Date.now() - startTime;

    this.logger.info(
      { duration, totalFindings: deduplicated.length, consensus: summary.consensus },
      'Reviews merged'
    );

    return {
      success: true,
      reviewId: generateUUID(),
      timestamp: new Date().toISOString(),
      source: 'combined',
      summary,
      findings: deduplicated.sort((a, b) => this.compareSeverity(a.severity, b.severity)),
      overallAssessment,
      recommendations,
      metadata: {
        language: reviews[0]?.metadata.language,
        linesOfCode: reviews[0]?.metadata.linesOfCode || 0,
        reviewDuration: duration,
        codexDuration: reviews.find(r => r.source === 'codex')?.metadata.reviewDuration,
        geminiDuration: reviews.find(r => r.source === 'gemini')?.metadata.reviewDuration
      }
    };
  }

  /**
   * Deduplicate findings by similarity matching
   * @private
   */
  private deduplicateFindings(findings: FindingWithSource[]): AggregatedFinding[] {
    const threshold = this.config.deduplication?.similarityThreshold || 0.8;
    const deduplicated: AggregatedFinding[] = [];
    const processed = new Set<number>();

    for (let i = 0; i < findings.length; i++) {
      if (processed.has(i)) continue;

      const current = findings[i];
      const sources = [current.source];
      const similarIndices: number[] = [];

      // Find similar findings
      for (let j = i + 1; j < findings.length; j++) {
        if (processed.has(j)) continue;

        const similarity = this.calculateSimilarity(current, findings[j]);
        if (similarity >= threshold) {
          sources.push(findings[j].source);
          similarIndices.push(j);
        }
      }

      // Mark similar findings as processed
      similarIndices.forEach(idx => processed.add(idx));

      // Determine confidence based on agreement
      const confidence = this.determineConfidence(sources.length, findings.length);

      // Use highest severity among duplicates
      const allSimilar = [current, ...similarIndices.map(idx => findings[idx])];
      const highestSeverity = this.getHighestSeverity(allSimilar.map(f => f.severity));

      deduplicated.push({
        ...current,
        severity: highestSeverity,
        sources: Array.from(new Set(sources)),
        confidence
      });
    }

    return deduplicated;
  }

  /**
   * Calculate similarity between two findings
   * @private
   */
  private calculateSimilarity(a: ReviewFinding, b: ReviewFinding): number {
    // Check if same line
    const sameLine = a.line !== null && b.line !== null && a.line === b.line;
    if (sameLine) {
      // Same line + same type = high similarity
      if (a.type === b.type) return 1.0;
      // Same line + different type = medium similarity
      return 0.7;
    }

    // Compare text similarity
    const titleSimilarity = this.textSimilarity(a.title, b.title);
    const descSimilarity = this.textSimilarity(a.description, b.description);

    // Weight title more heavily
    return titleSimilarity * 0.6 + descSimilarity * 0.4;
  }

  /**
   * Calculate text similarity using simple token overlap
   * @private
   */
  private textSimilarity(text1: string, text2: string): number {
    const tokens1 = new Set(text1.toLowerCase().split(/\W+/));
    const tokens2 = new Set(text2.toLowerCase().split(/\W+/));

    const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
    const union = new Set([...tokens1, ...tokens2]);

    return intersection.size / union.size;
  }

  /**
   * Determine confidence level based on reviewer agreement
   * @private
   */
  private determineConfidence(
    agreeCount: number,
    totalReviewers: number
  ): 'high' | 'medium' | 'low' {
    const agreement = agreeCount / totalReviewers;

    if (agreement >= 0.8) return 'high';
    if (agreement >= 0.5) return 'medium';
    return 'low';
  }

  /**
   * Get highest severity from list
   * @private
   */
  private getHighestSeverity(severities: Severity[]): Severity {
    const order: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];
    for (const sev of order) {
      if (severities.includes(sev)) return sev;
    }
    return 'info';
  }

  /**
   * Compare severities for sorting (higher severity first)
   * @private
   */
  private compareSeverity(a: Severity, b: Severity): number {
    const order: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];
    return order.indexOf(a) - order.indexOf(b);
  }

  /**
   * Calculate aggregated summary with consensus
   * @private
   */
  private calculateAggregatedSummary(
    findings: AggregatedFinding[],
    reviewerCount: number
  ): AggregatedSummary {
    const totalFindings = findings.length;
    const critical = findings.filter(f => f.severity === 'critical').length;
    const high = findings.filter(f => f.severity === 'high').length;
    const medium = findings.filter(f => f.severity === 'medium').length;
    const low = findings.filter(f => f.severity === 'low').length;

    // Calculate consensus (percentage of findings with high confidence)
    const highConfidence = findings.filter(f => f.confidence === 'high').length;
    const consensus = totalFindings > 0
      ? Math.round((highConfidence / totalFindings) * 100)
      : 100;

    return {
      totalFindings,
      critical,
      high,
      medium,
      low,
      consensus
    };
  }

  /**
   * Generate overall assessment from multiple reviews
   * @private
   */
  private generateOverallAssessment(
    reviews: ReviewResult[],
    findings: AggregatedFinding[]
  ): string {
    const assessments = reviews.map(r => r.overallAssessment).filter(Boolean);

    if (assessments.length === 0) {
      return 'No assessment available.';
    }

    const critical = findings.filter(f => f.severity === 'critical').length;
    const high = findings.filter(f => f.severity === 'high').length;

    let combined = `Combined review from ${reviews.length} reviewer(s): `;

    if (critical > 0) {
      combined += `Found ${critical} critical issue(s) that require immediate attention. `;
    }

    if (high > 0) {
      combined += `Found ${high} high-severity issue(s) that should be addressed. `;
    }

    if (critical === 0 && high === 0) {
      combined += `Code quality is good with only minor issues identified. `;
    }

    return combined;
  }

  /**
   * Merge recommendations from multiple reviews
   * @private
   */
  private mergeRecommendations(reviews: ReviewResult[]): string[] {
    const allRecommendations = reviews
      .flatMap(r => r.recommendations || [])
      .filter(Boolean);

    // Deduplicate recommendations by similarity
    const unique: string[] = [];
    const processed = new Set<number>();

    for (let i = 0; i < allRecommendations.length; i++) {
      if (processed.has(i)) continue;

      const current = allRecommendations[i];
      let isDuplicate = false;

      for (let j = 0; j < unique.length; j++) {
        if (this.textSimilarity(current, unique[j]) > 0.8) {
          isDuplicate = true;
          break;
        }
      }

      if (!isDuplicate) {
        unique.push(current);
      }

      processed.add(i);
    }

    return unique;
  }
}

// Configuration interface
export interface AggregatorConfig {
  deduplication?: {
    enabled: boolean;
    similarityThreshold: number;
  };
}

// Type definitions
interface FindingWithSource extends ReviewFinding {
  source: 'codex' | 'gemini';
}

interface AggregatedFinding extends ReviewFinding {
  sources: Array<'codex' | 'gemini'>;
  confidence: 'high' | 'medium' | 'low';
}

interface AggregatedSummary extends ReviewSummary {
  consensus: number;
}

type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
```

## 4. MCP Server Implementation

### 4.1 Server Entry Point

```typescript
// src/index.ts

#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ConfigManager } from './core/config.js';
import { Logger } from './core/logger.js';
import { ToolRegistry } from './tools/registry.js';
import { CodexReviewService } from './services/codex/client.js';
import { GeminiReviewService } from './services/gemini/client.js';
import { ReviewAggregator } from './services/aggregator/merger.js';

/**
 * Main entry point for Code Review MCP Server
 */
async function main() {
  // Load configuration
  const config = await ConfigManager.load();

  // Initialize logger
  const logger = Logger.create(config.logging);

  logger.info({ version: config.server.version }, 'Starting Code Review MCP Server');

  try {
    // Initialize services
    const codexService = config.codex.enabled
      ? new CodexReviewService(config.codex, logger, mcpToolClient)
      : null;

    const geminiService = config.gemini.enabled
      ? new GeminiReviewService(config.gemini, logger)
      : null;

    const aggregator = new ReviewAggregator(config.review, logger);

    // Create MCP server
    const server = new Server(
      {
        name: config.server.name,
        version: config.server.version
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    // Register tools
    const registry = new ToolRegistry(server, {
      codexService,
      geminiService,
      aggregator,
      config,
      logger
    });

    registry.registerTools();

    // Setup transport
    const transport = new StdioServerTransport();
    await server.connect(transport);

    logger.info('Code Review MCP Server started successfully');

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('Shutting down Code Review MCP Server');
      await server.close();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('Shutting down Code Review MCP Server');
      await server.close();
      process.exit(0);
    });

  } catch (error) {
    logger.error({ error }, 'Failed to start Code Review MCP Server');
    process.exit(1);
  }
}

// Start server
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
```

### 4.2 Tool Registry

```typescript
// src/tools/registry.ts

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { z } from 'zod';
import {
  CodexReviewInputSchema,
  GeminiReviewInputSchema,
  CombinedReviewInputSchema
} from '../schemas/tools.js';

/**
 * Tool Registry
 * Manages MCP tool registration and routing
 */
export class ToolRegistry {
  constructor(
    private server: Server,
    private dependencies: ToolDependencies
  ) {}

  /**
   * Register all tools with MCP server
   */
  registerTools(): void {
    this.registerCodexReviewTool();
    this.registerGeminiReviewTool();
    this.registerCombinedReviewTool();
    this.registerStatusTool();

    this.dependencies.logger.info('All tools registered successfully');
  }

  /**
   * Register Codex review tool
   * @private
   */
  private registerCodexReviewTool(): void {
    this.server.setRequestHandler(
      { method: 'tools/list' },
      async () => ({
        tools: [
          {
            name: 'review_code_with_codex',
            description: 'Perform comprehensive code review using Codex AI',
            inputSchema: zodToJsonSchema(CodexReviewInputSchema)
          }
        ]
      })
    );

    this.server.setRequestHandler(
      { method: 'tools/call', params: { name: 'review_code_with_codex' } },
      async (request) => {
        const { logger, codexService } = this.dependencies;

        try {
          // Validate input
          const params = CodexReviewInputSchema.parse(request.params.arguments);

          // Execute review
          const result = await codexService!.reviewCode(params);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2)
              }
            ]
          };
        } catch (error) {
          logger.error({ error }, 'Codex review failed');
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: error instanceof Error ? error.message : 'Unknown error'
                })
              }
            ],
            isError: true
          };
        }
      }
    );
  }

  /**
   * Register Gemini review tool
   * @private
   */
  private registerGeminiReviewTool(): void {
    // Similar implementation to Codex tool
  }

  /**
   * Register combined review tool
   * @private
   */
  private registerCombinedReviewTool(): void {
    // Implementation for combined review
  }

  /**
   * Register status check tool
   * @private
   */
  private registerStatusTool(): void {
    // Implementation for status checking
  }
}

interface ToolDependencies {
  codexService: CodexReviewService | null;
  geminiService: GeminiReviewService | null;
  aggregator: ReviewAggregator;
  config: ServerConfig;
  logger: Logger;
}

// Helper to convert Zod schema to JSON Schema
function zodToJsonSchema(schema: z.ZodType): any {
  // Implementation or use zod-to-json-schema library
  return {};
}
```

---

## Document Metadata

**Version:** 1.1.0
**Last Updated:** 2025-01-17
**Status:** Specification
**Companion Document:** ../reference/architecture.md
