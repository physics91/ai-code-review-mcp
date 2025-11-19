# Code Review MCP Server - Implementation Guide

## Table of Contents

- [Overview](#overview)
- [Implementation Phases](#implementation-phases)
  - [Phase 1: Core MVP (Week 1-2)](#phase-1-core-mvp-week-1-2)
  - [Phase 2: Gemini Integration (Week 3)](#phase-2-gemini-integration-week-3)
  - [Phase 3: Review Aggregation (Week 4)](#phase-3-review-aggregation-week-4)
  - [Phase 4: Production Hardening (Week 5-6)](#phase-4-production-hardening-week-5-6)
  - [Phase 5: Documentation and Deployment (Week 7)](#phase-5-documentation-and-deployment-week-7)
- [Best Practices](#best-practices)
- [Deployment Checklist](#deployment-checklist)
- [Monitoring in Production](#monitoring-in-production)
- [Troubleshooting Common Issues](#troubleshooting-common-issues)
- [Appendix: File Structure Summary](#appendix-file-structure-summary)

---

## Overview

This document provides a step-by-step guide to implementing the Code Review MCP Server based on the architecture and specifications provided in [architecture.md](../reference/architecture.md) and [SPECIFICATIONS.md](../reference/SPECIFICATIONS.md).

## Implementation Phases

### Phase 1: Core MVP (Week 1-2)

#### 1.1 Project Setup

```bash
# Initialize project
npm init
npm install dependencies (see package.json)

# Setup TypeScript
npm install -D typescript @types/node
npx tsc --init

# Setup build tools
npm install -D tsup tsx

# Setup testing
npm install -D vitest @vitest/coverage-v8
```

#### 1.2 Core Infrastructure

**Priority Order:**

1. **Configuration Management** (`src/core/config.ts`)
   - Implement ConfigManager class
   - Add Zod schema validation
   - Support environment variable overrides
   - Load from config files (cosmiconfig)

2. **Logging System** (`src/core/logger.ts`)
   - Implement Logger class using Pino
   - Add structured logging
   - Support log levels
   - Implement log sanitization for sensitive data

3. **Error Handling** (`src/core/error-handler.ts`)
   - Create custom error classes
   - Implement error classification
   - Add error logging
   - Create user-friendly error messages

#### 1.3 Codex Service Implementation

**Files to Create:**
- `src/services/codex/client.ts`
- `src/services/codex/types.ts`
- `src/services/codex/parser.ts`

**Implementation Steps:**

```typescript
// Step 1: Define types and schemas
// src/services/codex/types.ts
import { z } from 'zod';

export const CodeReviewParamsSchema = z.object({
  code: z.string().min(1).max(50000),
  language: z.string().optional(),
  // ... (see ../reference/SPECIFICATIONS.md)
});

// Step 2: Implement Codex client
// src/services/codex/client.ts
export class CodexReviewService {
  async reviewCode(params: CodeReviewParams): Promise<CodexReviewResult> {
    // 1. Validate input
    // 2. Format prompt
    // 3. Call mcp__codex__codex with ONLY prompt parameter
    // 4. Parse response
    // 5. Return structured result
  }

  private formatReviewPrompt(params: CodeReviewParams): string {
    // Create detailed prompt for code review
    // Include focus areas, context, instructions
  }

  private async callCodexMCPTool(prompt: string): Promise<string> {
    // Use mcp__codex__codex tool with ONLY prompt parameter
    // Implement timeout handling
    // Handle errors
  }

  private parseCodexResponse(response: string): CodexReviewResult {
    // Extract JSON from response
    // Validate with Zod schema
    // Transform to internal format
  }
}
```

#### 1.4 MCP Server Setup

**Files to Create:**
- `src/index.ts` (entry point)
- `src/server.ts` (MCP server configuration)
- `src/tools/registry.ts` (tool registration)
- `src/tools/codex-review.ts` (Codex review tool)

**Implementation Steps:**

```typescript
// Step 1: Create server entry point
// src/index.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

async function main() {
  // 1. Load configuration
  const config = await ConfigManager.load();

  // 2. Initialize logger
  const logger = Logger.create(config.logging);

  // 3. Initialize services
  const codexService = new CodexReviewService(config.codex, logger);

  // 4. Create MCP server
  const server = new Server({
    name: config.server.name,
    version: config.server.version
  }, {
    capabilities: { tools: {} }
  });

  // 5. Register tools
  const registry = new ToolRegistry(server, { codexService, logger });
  registry.registerTools();

  // 6. Setup transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info('Server started');
}

// Step 2: Implement tool registry
// src/tools/registry.ts
export class ToolRegistry {
  registerTools(): void {
    // Register review_code_with_codex
    this.server.setRequestHandler(
      { method: 'tools/list' },
      async () => ({
        tools: [{
          name: 'review_code_with_codex',
          description: 'Perform code review using Codex',
          inputSchema: zodToJsonSchema(CodexReviewInputSchema)
        }]
      })
    );

    this.server.setRequestHandler(
      { method: 'tools/call', params: { name: 'review_code_with_codex' } },
      async (request) => {
        const params = CodexReviewInputSchema.parse(request.params.arguments);
        const result = await this.codexService.reviewCode(params);
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }]
        };
      }
    );
  }
}
```

#### 1.5 Testing Phase 1

**Test Files to Create:**
- `tests/unit/services/codex/client.test.ts`
- `tests/unit/core/config.test.ts`
- `tests/unit/core/logger.test.ts`
- `tests/integration/tools/codex-review.test.ts`

**Test Scenarios:**

```typescript
// tests/unit/services/codex/client.test.ts
import { describe, it, expect, vi } from 'vitest';

describe('CodexReviewService', () => {
  it('should validate input parameters', async () => {
    // Test Zod schema validation
  });

  it('should format review prompt correctly', () => {
    // Test prompt formatting
  });

  it('should call Codex MCP tool with only prompt parameter', async () => {
    // Mock MCP tool call
    // Verify only prompt is passed
  });

  it('should parse Codex response', () => {
    // Test JSON extraction and parsing
  });

  it('should retry on retryable errors', async () => {
    // Test retry logic
  });

  it('should timeout after configured duration', async () => {
    // Test timeout handling
  });
});
```

### Phase 2: Gemini Integration (Week 3)

#### 2.1 Gemini Service Implementation

**Files to Create:**
- `src/services/gemini/client.ts`
- `src/services/gemini/executor.ts`
- `src/services/gemini/types.ts`

**Implementation Steps:**

```typescript
// Step 1: Implement CLI executor
// src/services/gemini/executor.ts
import { execa } from 'execa';

export class GeminiCLIExecutor {
  async execute(prompt: string, options: ExecutionOptions): Promise<string> {
    // 1. Validate CLI path (security)
    this.validateCLIPath(options.cliPath);

    // 2. Build CLI arguments
    const args = this.buildArgs(options);

    // 3. Execute CLI using execa (no shell injection)
    const result = await execa(options.cliPath, args, {
      timeout: options.timeout,
      input: prompt,
      reject: true
    });

    return result.stdout;
  }

  private validateCLIPath(cliPath: string): void {
    // Whitelist validation for security
  }
}

// Step 2: Implement Gemini service
// src/services/gemini/client.ts
export class GeminiReviewService {
  async reviewCode(params: CodeReviewParams): Promise<GeminiReviewResult> {
    // 1. Validate input
    // 2. Format prompt (similar to Codex)
    // 3. Execute CLI
    // 4. Parse output
    // 5. Return structured result
  }

  private async executeGeminiCLI(prompt: string): Promise<string> {
    // Use GeminiCLIExecutor
    // Handle CLI-specific errors
  }

  private parseGeminiOutput(output: string): GeminiReviewResult {
    // Clean output (remove ANSI codes)
    // Extract JSON
    // Validate and transform
  }
}
```

#### 2.2 Register Gemini Tool

**Update Files:**
- `src/tools/registry.ts` (add Gemini tool)
- `src/tools/gemini-review.ts` (new tool)

#### 2.3 Testing Phase 2

**Test Files:**
- `tests/unit/services/gemini/client.test.ts`
- `tests/unit/services/gemini/executor.test.ts`
- `tests/integration/tools/gemini-review.test.ts`

**Mock CLI for Testing:**

```typescript
// tests/mocks/gemini-cli.ts
import { vi } from 'vitest';

export const mockGeminiCLI = vi.fn((prompt: string) => {
  return JSON.stringify({
    findings: [
      {
        type: 'bug',
        severity: 'high',
        line: 10,
        title: 'Test finding',
        description: 'Test description'
      }
    ],
    overallAssessment: 'Test assessment'
  });
});
```

### Phase 3: Review Aggregation (Week 4)

#### 3.1 Aggregator Implementation

**Files to Create:**
- `src/services/aggregator/merger.ts`
- `src/services/aggregator/formatter.ts`
- `src/services/aggregator/types.ts`

**Implementation Steps:**

```typescript
// Step 1: Implement deduplication algorithm
// src/services/aggregator/merger.ts
export class ReviewAggregator {
  mergeReviews(reviews: ReviewResult[]): AggregatedReview {
    // 1. Collect all findings
    const allFindings = reviews.flatMap(r =>
      r.findings.map(f => ({ ...f, source: r.source }))
    );

    // 2. Deduplicate using similarity matching
    const deduplicated = this.deduplicateFindings(allFindings);

    // 3. Calculate consensus metrics
    const summary = this.calculateSummary(deduplicated);

    // 4. Generate overall assessment
    const assessment = this.generateAssessment(reviews, deduplicated);

    return { summary, findings: deduplicated, assessment };
  }

  private deduplicateFindings(findings: Finding[]): AggregatedFinding[] {
    // Similarity matching algorithm
    // - Compare by line number
    // - Compare by text similarity
    // - Merge similar findings
    // - Assign confidence based on agreement
  }

  private calculateSimilarity(a: Finding, b: Finding): number {
    // Implement Jaccard similarity or similar algorithm
  }
}
```

#### 3.2 Combined Review Tool

**Files to Create:**
- `src/tools/combined-review.ts`

**Implementation:**

```typescript
// src/tools/combined-review.ts
export class CombinedReviewTool {
  async execute(params: CombinedReviewInput): Promise<CombinedReviewOutput> {
    const { parallelExecution = true } = params.options || {};

    // Execute reviews (parallel or sequential)
    const reviews = parallelExecution
      ? await Promise.all([
          this.codexService.reviewCode(params),
          this.geminiService.reviewCode(params)
        ])
      : [
          await this.codexService.reviewCode(params),
          await this.geminiService.reviewCode(params)
        ];

    // Aggregate results
    const aggregated = this.aggregator.mergeReviews(reviews);

    // Format output
    return this.formatCombinedOutput(aggregated, reviews);
  }
}
```

#### 3.3 Testing Phase 3

**Test Scenarios:**
- Test deduplication algorithm with various finding combinations
- Test parallel vs sequential execution
- Test consensus calculation
- Test edge cases (no findings, all findings identical, etc.)

### Phase 4: Production Hardening (Week 5-6)

#### 4.1 Enhanced Logging

```typescript
// src/core/logger.ts - Enhanced version
export class Logger {
  // Add performance metrics
  logPerformance(metric: string, duration: number): void {
    this.logger.info({ metric, duration }, 'Performance metric');
  }

  // Add security audit logging
  logSecurityEvent(event: SecurityEvent): void {
    this.logger.warn({ event }, 'Security event');
  }

  // Add structured error logging
  logError(error: Error, context: any): void {
    this.logger.error({
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      },
      context: this.sanitize(context)
    }, 'Error occurred');
  }
}
```

#### 4.2 Rate Limiting

```typescript
// src/core/rate-limiter.ts
import PQueue from 'p-queue';

export class RateLimiter {
  private queue: PQueue;

  constructor(config: RateLimitConfig) {
    this.queue = new PQueue({
      concurrency: config.maxConcurrent,
      interval: config.interval,
      intervalCap: config.intervalCap
    });
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    return this.queue.add(fn);
  }
}
```

#### 4.3 Caching Layer

```typescript
// src/core/cache.ts
export class ReviewCache {
  private cache: Map<string, CacheEntry>;

  async get(key: string): Promise<ReviewResult | null> {
    const entry = this.cache.get(key);
    if (!entry || this.isExpired(entry)) {
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: ReviewResult): Promise<void> {
    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });
  }

  private generateKey(params: CodeReviewParams): string {
    // Hash code + context for cache key
    return createHash('sha256')
      .update(JSON.stringify(params))
      .digest('hex');
  }
}
```

#### 4.4 Security Audit

**Security Checklist:**

- [ ] Input validation on all parameters
- [ ] CLI path whitelist enforcement
- [ ] No shell injection vulnerabilities
- [ ] Sensitive data sanitization in logs
- [ ] Maximum payload size enforcement
- [ ] Timeout enforcement on all operations
- [ ] Error messages don't leak sensitive info
- [ ] Dependencies are up-to-date
- [ ] No hardcoded credentials

#### 4.5 Performance Testing

**Load Test Scenarios:**

```typescript
// tests/performance/load-test.ts
import { describe, it } from 'vitest';

describe('Load Testing', () => {
  it('should handle 100 concurrent reviews', async () => {
    const reviews = Array(100).fill(null).map((_, i) =>
      reviewCode({ code: generateTestCode(i) })
    );

    const results = await Promise.all(reviews);

    // Assert all succeeded
    // Assert performance targets met
  });

  it('should maintain performance under sustained load', async () => {
    // Run reviews for 5 minutes
    // Monitor memory usage
    // Check for memory leaks
  });
});
```

### Phase 5: Documentation and Deployment (Week 7)

#### 5.1 Documentation

**Documents to Create:**
- API documentation
- Configuration guide
- Troubleshooting guide
- Migration guide (for updates)
- Contributing guide

#### 5.2 Deployment Preparation

**Create:**
- Docker configuration
- CI/CD pipeline (GitHub Actions)
- Release scripts
- Changelog automation

```dockerfile
# Dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY dist ./dist
COPY config ./config

CMD ["node", "dist/index.js"]
```

```yaml
# .github/workflows/ci.yml
name: CI

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 20
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm test
      - run: npm run build
```

#### 5.3 Publishing

```bash
# Build for production
npm run build

# Test installation locally
npm link
code-review-mcp

# Publish to NPM
npm publish
```

## Best Practices

### 1. Error Handling

Always use try-catch with specific error types:

```typescript
try {
  const result = await service.reviewCode(params);
} catch (error) {
  if (error instanceof ValidationError) {
    // Handle validation error
  } else if (error instanceof TimeoutError) {
    // Handle timeout
  } else {
    // Handle unknown error
  }
}
```

### 2. Logging

Use structured logging with context:

```typescript
logger.info(
  {
    reviewId,
    source: 'codex',
    duration: 1234,
    findings: 5
  },
  'Review completed'
);
```

### 3. Configuration

Always validate configuration:

```typescript
const config = ServerConfigSchema.parse(rawConfig);
```

### 4. Testing

Follow the testing pyramid:
- 80% unit tests
- 15% integration tests
- 5% e2e tests

### 5. Type Safety

Leverage TypeScript:

```typescript
// Use discriminated unions for review sources
type ReviewResult =
  | { source: 'codex'; findings: CodexFinding[] }
  | { source: 'gemini'; findings: GeminiFinding[] };

// Use const assertions
const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low'] as const;
type Severity = typeof SEVERITY_ORDER[number];
```

## Deployment Checklist

- [ ] All tests passing
- [ ] TypeScript builds without errors
- [ ] ESLint passes with no warnings
- [ ] Code coverage >80%
- [ ] Documentation complete
- [ ] Configuration examples provided
- [ ] Security audit completed
- [ ] Performance testing completed
- [ ] Docker image tested
- [ ] Claude Desktop integration tested
- [ ] README updated with latest features
- [ ] Changelog updated
- [ ] Version bumped
- [ ] Git tags created

## Monitoring in Production

### Metrics to Track

```typescript
// Example metrics collection
interface Metrics {
  reviews: {
    total: number;
    bySource: Record<'codex' | 'gemini' | 'combined', number>;
    byStatus: Record<'success' | 'error', number>;
  };
  performance: {
    averageDuration: number;
    p95Duration: number;
    p99Duration: number;
  };
  errors: {
    total: number;
    byType: Record<string, number>;
  };
  cache: {
    hits: number;
    misses: number;
    hitRate: number;
  };
}
```

### Health Checks

```typescript
// Implement health check endpoint
async function healthCheck(): Promise<HealthStatus> {
  return {
    status: 'healthy',
    services: {
      codex: await checkCodexService(),
      gemini: await checkGeminiCLI()
    },
    uptime: process.uptime(),
    version: config.server.version
  };
}
```

## Troubleshooting Common Issues

### Issue: High Memory Usage

**Diagnosis:**
```bash
node --inspect dist/index.js
# Use Chrome DevTools to analyze memory
```

**Solutions:**
1. Enable garbage collection: `node --expose-gc dist/index.js`
2. Reduce cache size
3. Limit concurrent reviews

### Issue: Slow Reviews

**Diagnosis:**
```typescript
// Add timing logs
const start = Date.now();
const result = await reviewCode(params);
logger.info({ duration: Date.now() - start }, 'Review completed');
```

**Solutions:**
1. Enable parallel execution
2. Increase timeout for complex code
3. Cache frequently reviewed code

### Issue: CLI Execution Failures

**Diagnosis:**
```bash
# Test CLI directly
/path/to/gemini --version
echo "test prompt" | /path/to/gemini
```

**Solutions:**
1. Verify CLI path in configuration
2. Check CLI permissions
3. Test CLI with sample input

## Appendix: File Structure Summary

```
code-review-mcp/
+-- src/
|   +-- index.ts                          # Entry point
|   +-- server.ts                         # MCP server setup
|   +-- tools/
|   |   +-- registry.ts                   # Tool registration
|   |   +-- codex-review.ts               # Codex tool
|   |   +-- gemini-review.ts              # Gemini tool
|   |   +-- combined-review.ts            # Combined tool
|   +-- services/
|   |   +-- codex/
|   |   |   +-- client.ts                 # Codex service
|   |   |   +-- parser.ts                 # Response parser
|   |   |   +-- types.ts                  # Types
|   |   +-- gemini/
|   |   |   +-- client.ts                 # Gemini service
|   |   |   +-- executor.ts               # CLI executor
|   |   |   +-- types.ts                  # Types
|   |   +-- aggregator/
|   |       +-- merger.ts                 # Review merger
|   |       +-- formatter.ts              # Formatters
|   |       +-- types.ts                  # Types
|   +-- core/
|   |   +-- config.ts                     # Configuration
|   |   +-- logger.ts                     # Logging
|   |   +-- error-handler.ts              # Errors
|   |   +-- retry.ts                      # Retry logic
|   |   +-- cache.ts                      # Caching
|   |   +-- rate-limiter.ts               # Rate limiting
|   +-- schemas/
|   |   +-- tools.ts                      # Tool schemas
|   |   +-- config.ts                     # Config schemas
|   |   +-- responses.ts                  # Response schemas
|   +-- types/
|       +-- common.ts                     # Common types
|       +-- index.ts                      # Type exports
+-- tests/
|   +-- unit/
|   +-- integration/
|   +-- e2e/
|   +-- performance/
+-- config/
|   +-- default.json
|   +-- schema.json
+-- docs/
|   +-- API.md
|   +-- CONFIGURATION.md
|   +-- TROUBLESHOOTING.md
+-- .github/
|   +-- workflows/
|       +-- ci.yml
+-- package.json
+-- tsconfig.json
+-- tsup.config.ts
+-- .env.example
+-- .eslintrc.json
+-- .prettierrc.json
+-- Dockerfile
+-- README.md
+-- ../reference/architecture.md
+-- ../reference/SPECIFICATIONS.md
+-- ../guides/implementation-guide.md (this file)
```

---

**Version:** 1.0.1
**Last Updated:** 2025-01-17
**Author:** Technical Architecture Team
