# Code Review MCP Server - System Architecture

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
   - 1.1 [System Context Diagram](#11-system-context-diagram)
   - 1.2 [High-Level Component Architecture](#12-high-level-component-architecture)
2. [Component Design](#2-component-design)
   - 2.1 [MCP Server Core](#21-mcp-server-core-serverts)
   - 2.2 [Tool Registry](#22-tool-registry-toolsregistryts)
   - 2.3 [Codex Service](#23-codex-service-servicescodex)
   - 2.4 [Gemini Service](#24-gemini-service-servicesgemini)
   - 2.5 [Review Aggregator](#25-review-aggregator-servicesaggregator)
   - 2.6 [Configuration Manager](#26-configuration-manager-coreconfigts)
   - 2.7 [Error Handler](#27-error-handler-coreerror-handlerts)
   - 2.8 [Logger](#28-logger-coreloggerts)
3. [API/Tool Specifications](#3-apitool-specifications)
   - 3.1 [Tool: review_code_with_codex](#31-tool-review_code_with_codex)
   - 3.2 [Tool: review_code_with_gemini](#32-tool-review_code_with_gemini)
   - 3.3 [Tool: review_code_combined](#33-tool-review_code_combined)
   - 3.4 [Tool: get_review_status](#34-tool-get_review_status)
4. [Data Flow Descriptions](#4-data-flow-descriptions)
   - 4.1 [Single Review Flow](#41-single-review-flow-codex-example)
   - 4.2 [Combined Review Flow](#42-combined-review-flow)
   - 4.3 [Error Handling Flow](#43-error-handling-flow)
5. [Technology Stack Decisions](#5-technology-stack-decisions)
   - 5.1 [Core Technologies](#51-core-technologies)
   - 5.2 [Development Tools](#52-development-tools)
   - 5.3 [Dependencies Analysis](#53-dependencies-analysis)
6. [Security Considerations](#6-security-considerations)
   - 6.1 [Input Validation](#61-input-validation)
   - 6.2 [CLI Execution Security](#62-cli-execution-security)
   - 6.3 [Configuration Security](#63-configuration-security)
   - 6.4 [MCP Tool Security](#64-mcp-tool-security)
   - 6.5 [Data Privacy](#65-data-privacy)
   - 6.6 [Dependency Security](#66-dependency-security)
7. [Configuration Structure](#7-configuration-structure)
   - 7.1 [Configuration File](#71-configuration-file-configdefaultjson)
   - 7.2 [Environment Variables](#72-environment-variables)
   - 7.3 [Configuration Schema](#73-configuration-schema-zod)
8. [Implementation Roadmap](#8-implementation-roadmap)
9. [Performance Considerations](#9-performance-considerations)
   - 9.1 [Performance Targets](#91-performance-targets)
   - 9.2 [Optimization Strategies](#92-optimization-strategies)
10. [Monitoring and Observability](#10-monitoring-and-observability)
    - 10.1 [Metrics to Track](#101-metrics-to-track)
    - 10.2 [Logging Strategy](#102-logging-strategy)
11. [Testing Strategy](#11-testing-strategy)
    - 11.1 [Test Pyramid](#111-test-pyramid)
    - 11.2 [Test Coverage Targets](#112-test-coverage-targets)
    - 11.3 [Test Scenarios](#113-test-scenarios)
12. [Deployment and Operations](#12-deployment-and-operations)
    - 12.1 [Installation Methods](#121-installation-methods)
    - 12.2 [MCP Configuration](#122-mcp-configuration)
    - 12.3 [Health Checks](#123-health-checks)
    - 12.4 [Troubleshooting Guide](#124-troubleshooting-guide)
13. [Future Enhancements](#13-future-enhancements)
    - 13.1 [Planned Features](#131-planned-features)
    - 13.2 [Scalability Considerations](#132-scalability-considerations)

---

## 1. Architecture Overview

### 1.1 System Context Diagram
```
+------------------------------------------------------------------+
|                         MCP Client                                |
|                    (Claude Desktop/CLI)                           |
+------------------------+-----------------------------------------+
                         | MCP Protocol (stdio)
                         v
+------------------------------------------------------------------+
|                  Code Review MCP Server                           |
|  +------------------------------------------------------------+  |
|  |              Tool Registry & Router                        |  |
|  +---------+------------------------------+------------------+  |
|            |                               |                      |
|  +---------v---------+         +----------v----------+          |
|  |  Codex Service    |         |  Gemini Service     |          |
|  |  - MCP Integration|         |  - CLI Integration  |          |
|  |  - Response Parse |         |  - Process Mgmt     |          |
|  +---------+---------+         +----------+----------+          |
|            |                               |                      |
|  +---------v--------------------------------v----------+         |
|  |         Review Aggregation & Formatting              |         |
|  +---------+--------------------------------------------+         |
|            |                                                       |
|  +---------v---------+  +--------------+  +--------------+      |
|  | Config Manager    |  | Error Handler|  | Logger       |      |
|  +-------------------+  +--------------+  +--------------+      |
+--------------------------------------------------------------------+
                         |                   |
            +------------v-----+  +---------v----------+
            |  Codex MCP Tool  |  |  Gemini CLI        |
            |  (Internal)      |  |  (External Process)|
            +------------------+  +--------------------+
```

### 1.2 High-Level Component Architecture
```
code-review-mcp/
+-- src/
|   +-- index.ts                    # MCP Server entry point
|   +-- server.ts                   # MCP Server configuration
|   +-- tools/
|   |   +-- registry.ts             # Tool registration
|   |   +-- codex-review.ts         # Codex review tool
|   |   +-- gemini-review.ts        # Gemini review tool
|   |   +-- combined-review.ts      # Dual review tool
|   +-- services/
|   |   +-- codex/
|   |   |   +-- client.ts           # Codex MCP client wrapper
|   |   |   +-- parser.ts           # Response parser
|   |   |   +-- types.ts            # Type definitions
|   |   +-- gemini/
|   |   |   +-- client.ts           # Gemini CLI wrapper
|   |   |   +-- executor.ts         # Process executor
|   |   |   +-- types.ts            # Type definitions
|   |   +-- aggregator/
|   |       +-- formatter.ts        # Response formatting
|   |       +-- merger.ts           # Review merging logic
|   |       +-- types.ts            # Type definitions
|   +-- core/
|   |   +-- config.ts               # Configuration management
|   |   +-- logger.ts               # Logging system
|   |   +-- error-handler.ts        # Error handling
|   |   +-- retry.ts                # Retry logic
|   +-- schemas/
|   |   +-- tools.ts                # Zod tool schemas
|   |   +-- config.ts               # Zod config schemas
|   |   +-- responses.ts            # Zod response schemas
|   +-- types/
|       +-- common.ts               # Common types
|       +-- index.ts                # Type exports
+-- config/
|   +-- default.json                # Default configuration
|   +-- schema.json                 # Config validation schema
+-- tests/
|   +-- unit/
|   +-- integration/
|   +-- e2e/
+-- package.json
+-- tsconfig.json
+-- README.md
```

## 2. Component Design

### 2.1 MCP Server Core (server.ts)

**Responsibilities:**
- Initialize MCP server with stdio transport
- Register all code review tools
- Handle tool execution requests
- Manage server lifecycle

**Key Interfaces:**
```typescript
interface MCPServer {
  initialize(): Promise<void>;
  registerTools(): void;
  handleToolCall(name: string, args: unknown): Promise<ToolResponse>;
  shutdown(): Promise<void>;
}
```

### 2.2 Tool Registry (tools/registry.ts)

**Responsibilities:**
- Centralized tool registration
- Tool metadata management
- Input validation using Zod schemas
- Route tool calls to appropriate services

**Registered Tools:**
1. `review_code_with_codex` - Codex-based code review
2. `review_code_with_gemini` - Gemini-based code review
3. `review_code_combined` - Dual review with both engines
4. `get_review_status` - Check review progress (for async reviews)

### 2.3 Codex Service (services/codex/)

**Responsibilities:**
- Wrap mcp__codex__codex tool invocation
- Format prompts for code review
- Parse and structure Codex responses
- Handle Codex-specific errors

**Key Methods:**
```typescript
class CodexReviewService {
  async reviewCode(params: CodeReviewParams): Promise<CodexReviewResult>;
  private formatPrompt(code: string, context: ReviewContext): string;
  private parseResponse(response: string): StructuredReview;
}
```

### 2.4 Gemini Service (services/gemini/)

**Responsibilities:**
- Execute Gemini CLI commands via child_process
- Manage CLI process lifecycle
- Stream/buffer CLI output
- Handle Gemini-specific errors and retries

**Key Methods:**
```typescript
class GeminiReviewService {
  async reviewCode(params: CodeReviewParams): Promise<GeminiReviewResult>;
  private executeCLI(prompt: string, options: CLIOptions): Promise<string>;
  private parseOutput(output: string): StructuredReview;
}
```

### 2.5 Review Aggregator (services/aggregator/)

**Responsibilities:**
- Merge reviews from multiple sources
- Deduplicate findings
- Prioritize issues by severity
- Format final output

**Key Methods:**
```typescript
class ReviewAggregator {
  mergeReviews(reviews: Review[]): AggregatedReview;
  formatOutput(review: AggregatedReview, format: OutputFormat): string;
  deduplicateFindings(findings: Finding[]): Finding[];
}
```

### 2.6 Configuration Manager (core/config.ts)

**Responsibilities:**
- Load configuration from multiple sources (env, file, defaults)
- Validate configuration against schema
- Provide type-safe config access
- Support runtime config updates

**Configuration Structure:**
```typescript
interface ServerConfig {
  codex: {
    enabled: boolean;
    timeout: number;
    model?: string;
    retryAttempts: number;
  };
  gemini: {
    enabled: boolean;
    cliPath: string;
    timeout: number;
    model?: string;
    retryAttempts: number;
  };
  server: {
    name: string;
    version: string;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
  };
  review: {
    maxCodeLength: number;
    includeContext: boolean;
    formats: OutputFormat[];
  };
}
```

### 2.7 Error Handler (core/error-handler.ts)

**Responsibilities:**
- Centralized error handling
- Error classification and mapping
- User-friendly error messages
- Error logging and monitoring

**Error Types:**
```typescript
enum ErrorType {
  VALIDATION_ERROR = 'validation_error',
  CLI_EXECUTION_ERROR = 'cli_execution_error',
  MCP_TOOL_ERROR = 'mcp_tool_error',
  TIMEOUT_ERROR = 'timeout_error',
  CONFIGURATION_ERROR = 'configuration_error',
  NETWORK_ERROR = 'network_error'
}
```

### 2.8 Logger (core/logger.ts)

**Responsibilities:**
- Structured logging with Winston/Pino
- Log levels and filtering
- Log rotation and persistence
- Performance metrics logging

## 3. API/Tool Specifications

### 3.1 Tool: review_code_with_codex

**Purpose:** Perform code review using Codex CLI via MCP

**Input Schema:**
```typescript
import { z } from 'zod';

const CodexReviewInputSchema = z.object({
  code: z.string().min(1).max(50000).describe('Source code to review'),
  language: z.string().optional().describe('Programming language (auto-detect if not provided)'),
  context: z.object({
    fileName: z.string().optional(),
    projectType: z.string().optional(),
    reviewFocus: z.array(z.enum(['security', 'performance', 'style', 'bugs', 'all'])).default(['all'])
  }).optional(),
  options: z.object({
    timeout: z.number().min(1000).max(300000).default(60000),
    includeExplanations: z.boolean().default(true),
    severity: z.enum(['all', 'high', 'medium']).default('all')
  }).optional()
});

type CodexReviewInput = z.infer<typeof CodexReviewInputSchema>;
```

**Output Schema:**
```typescript
const ReviewFindingSchema = z.object({
  type: z.enum(['bug', 'security', 'performance', 'style', 'suggestion']),
  severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
  line: z.number().optional(),
  lineRange: z.object({ start: z.number(), end: z.number() }).optional(),
  title: z.string(),
  description: z.string(),
  suggestion: z.string().optional(),
  code: z.string().optional()
});

const CodexReviewOutputSchema = z.object({
  success: z.boolean(),
  reviewId: z.string(),
  timestamp: z.string(),
  source: z.literal('codex'),
  summary: z.object({
    totalFindings: z.number(),
    critical: z.number(),
    high: z.number(),
    medium: z.number(),
    low: z.number()
  }),
  findings: z.array(ReviewFindingSchema),
  overallAssessment: z.string(),
  recommendations: z.array(z.string()).optional(),
  metadata: z.object({
    language: z.string().optional(),
    linesOfCode: z.number(),
    reviewDuration: z.number()
  })
});

type CodexReviewOutput = z.infer<typeof CodexReviewOutputSchema>;
```

### 3.2 Tool: review_code_with_gemini

**Purpose:** Perform code review using Gemini CLI

**Input Schema:**
```typescript
const GeminiReviewInputSchema = z.object({
  code: z.string().min(1).max(50000),
  language: z.string().optional(),
  context: z.object({
    fileName: z.string().optional(),
    projectType: z.string().optional(),
    reviewFocus: z.array(z.enum(['security', 'performance', 'style', 'bugs', 'all'])).default(['all'])
  }).optional(),
  options: z.object({
    timeout: z.number().min(1000).max(300000).default(60000),
    includeExplanations: z.boolean().default(true),
    severity: z.enum(['all', 'high', 'medium']).default('all'),
    cliPath: z.string().optional() // Override default CLI path
  }).optional()
});

type GeminiReviewInput = z.infer<typeof GeminiReviewInputSchema>;
```

**Output Schema:**
```typescript
const GeminiReviewOutputSchema = z.object({
  success: z.boolean(),
  reviewId: z.string(),
  timestamp: z.string(),
  source: z.literal('gemini'),
  summary: z.object({
    totalFindings: z.number(),
    critical: z.number(),
    high: z.number(),
    medium: z.number(),
    low: z.number()
  }),
  findings: z.array(ReviewFindingSchema),
  overallAssessment: z.string(),
  recommendations: z.array(z.string()).optional(),
  metadata: z.object({
    language: z.string().optional(),
    linesOfCode: z.number(),
    reviewDuration: z.number()
  })
});

type GeminiReviewOutput = z.infer<typeof GeminiReviewOutputSchema>;
```

### 3.3 Tool: review_code_combined

**Purpose:** Perform code review using both Codex and Gemini, then aggregate results

**Input Schema:**
```typescript
const CombinedReviewInputSchema = z.object({
  code: z.string().min(1).max(50000),
  language: z.string().optional(),
  context: z.object({
    fileName: z.string().optional(),
    projectType: z.string().optional(),
    reviewFocus: z.array(z.enum(['security', 'performance', 'style', 'bugs', 'all'])).default(['all'])
  }).optional(),
  options: z.object({
    timeout: z.number().min(1000).max(300000).default(120000),
    includeExplanations: z.boolean().default(true),
    severity: z.enum(['all', 'high', 'medium']).default('all'),
    parallelExecution: z.boolean().default(true),
    includeIndividualReviews: z.boolean().default(false)
  }).optional()
});

type CombinedReviewInput = z.infer<typeof CombinedReviewInputSchema>;
```

**Output Schema:**
```typescript
const CombinedReviewOutputSchema = z.object({
  success: z.boolean(),
  reviewId: z.string(),
  timestamp: z.string(),
  source: z.literal('combined'),
  summary: z.object({
    totalFindings: z.number(),
    critical: z.number(),
    high: z.number(),
    medium: z.number(),
    low: z.number(),
    consensus: z.number().describe('Percentage of findings agreed upon by both reviewers')
  }),
  findings: z.array(ReviewFindingSchema.extend({
    sources: z.array(z.enum(['codex', 'gemini'])).describe('Which reviewers found this issue'),
    confidence: z.enum(['high', 'medium', 'low']).describe('Confidence based on agreement')
  })),
  overallAssessment: z.string(),
  recommendations: z.array(z.string()).optional(),
  individualReviews: z.object({
    codex: CodexReviewOutputSchema.optional(),
    gemini: GeminiReviewOutputSchema.optional()
  }).optional(),
  metadata: z.object({
    language: z.string().optional(),
    linesOfCode: z.number(),
    reviewDuration: z.number(),
    codexDuration: z.number().optional(),
    geminiDuration: z.number().optional()
  })
});

type CombinedReviewOutput = z.infer<typeof CombinedReviewOutputSchema>;
```

### 3.4 Tool: get_review_status

**Purpose:** Check status of async review operations

**Input Schema:**
```typescript
const ReviewStatusInputSchema = z.object({
  reviewId: z.string().uuid()
});

type ReviewStatusInput = z.infer<typeof ReviewStatusInputSchema>;
```

**Output Schema:**
```typescript
const ReviewStatusOutputSchema = z.object({
  reviewId: z.string(),
  status: z.enum(['pending', 'in_progress', 'completed', 'failed']),
  progress: z.number().min(0).max(100).optional(),
  source: z.enum(['codex', 'gemini', 'combined']),
  startedAt: z.string(),
  completedAt: z.string().optional(),
  error: z.string().optional()
});

type ReviewStatusOutput = z.infer<typeof ReviewStatusOutputSchema>;
```

## 4. Data Flow Descriptions

### 4.1 Single Review Flow (Codex Example)

```
+---------+     +----------+     +-----------+     +----------+     +--------+
| Client  |---->| MCP      |---->| Tool      |---->| Codex    |---->| MCP    |
|         |     | Server   |     | Registry  |     | Service  |     | Tool   |
+---------+     +----------+     +-----------+     +----------+     +--------+
    |                                                     |
    |                                                     v
    |                                              +----------+
    |                                              | Format   |
    |                                              | Prompt   |
    |                                              +----------+
    |                                                     |
    |                                                     v
    |                                              +----------+
    |                                              | Parse    |
    |                                              | Response |
    |                                              +----------+
    |                                                     |
    v                                                     v
+---------+     +----------+     +-----------+     +----------+
| Review  |<----| Format   |<----| Aggregate |<----| Review   |
| Result  |     | Output   |     | Service   |     | Result   |
+---------+     +----------+     +-----------+     +----------+
```

**Step-by-Step:**
1. Client sends MCP tool call: `review_code_with_codex`
2. MCP Server validates input using Zod schema
3. Tool Registry routes to Codex Service
4. Codex Service formats code review prompt
5. Codex Service calls `mcp__codex__codex` with prompt parameter only
6. Codex MCP tool executes and returns response
7. Codex Service parses response into structured format
8. Aggregator formats output according to schema
9. MCP Server returns formatted result to client

### 4.2 Combined Review Flow

```
+---------+     +----------+     +-----------+
| Client  |---->| MCP      |---->| Combined  |
|         |     | Server   |     | Review    |
+---------+     +----------+     | Tool      |
    |                             +-----+-----+
    |                                   |
    |                          +--------+--------+
    |                          |                 |
    |                          v                 v
    |                    +----------+      +----------+
    |                    | Codex    |      | Gemini   |
    |                    | Service  |      | Service  |
    |                    +-----+----+      +----+-----+
    |                          |                |
    |                          |  (Parallel)    |
    |                          |                |
    |                          v                v
    |                    +----------+      +----------+
    |                    | Codex    |      | Gemini   |
    |                    | Review   |      | Review   |
    |                    +-----+----+      +----+-----+
    |                          |                |
    |                          +--------+-------+
    |                                   |
    |                                   v
    |                          +-----------------+
    |                          | Review          |
    |                          | Aggregator      |
    |                          | - Merge         |
    |                          | - Deduplicate   |
    |                          | - Prioritize    |
    |                          +--------+--------+
    |                                   |
    v                                   v
+---------+     +----------+     +----------+
| Combined|<----| Format   |<----| Aggregated|
| Result  |     | Output   |     | Review    |
+---------+     +----------+     +----------+
```

**Step-by-Step:**
1. Client sends MCP tool call: `review_code_combined`
2. MCP Server validates input
3. Combined Review Tool initiates parallel execution (if enabled)
4. Codex Service and Gemini Service execute concurrently
5. Both services return structured reviews
6. Review Aggregator merges results:
   - Deduplicates findings by similarity matching
   - Assigns confidence based on agreement
   - Prioritizes by severity
   - Generates consensus metrics
7. Formatter creates final output
8. MCP Server returns combined result

### 4.3 Error Handling Flow

```
+----------+
| Tool     |
| Execution|
+----+-----+
     |
     v
+----------+     Yes    +----------+
| Error?   |----------->| Classify |
+----+-----+            | Error    |
     | No               +----+-----+
     |                       |
     v                       v
+----------+          +----------+     Yes    +----------+
| Return   |          |Retryable?|----------->| Retry    |
| Success  |          +----+-----+            | Logic    |
+----------+               | No               +----+-----+
                           |                       |
                           v                       |
                      +----------+                 |
                      | Log Error|<----------------+
                      +----+-----+
                           |
                           v
                      +----------+
                      | Format   |
                      | Error    |
                      | Response |
                      +----+-----+
                           |
                           v
                      +----------+
                      | Return   |
                      | to Client|
                      +----------+
```

## 5. Technology Stack Decisions

### 5.1 Core Technologies

| Component | Technology | Justification |
|-----------|------------|---------------|
| Runtime | Node.js 20+ | LTS version, excellent async support, MCP SDK compatibility |
| Language | TypeScript 5.3+ | Type safety, better IDE support, reduced runtime errors |
| MCP SDK | @modelcontextprotocol/sdk | Official MCP implementation, well-maintained |
| Schema Validation | Zod 3.22+ | Type-safe schemas, excellent TypeScript integration |
| Logging | Pino | High performance, structured logging, low overhead |
| Configuration | cosmiconfig | Flexible config loading, multiple format support |
| Process Management | execa | Modern child_process wrapper, better error handling |
| Testing | Vitest + MSW | Fast, modern testing framework, API mocking |

### 5.2 Development Tools

| Tool | Purpose | Justification |
|------|---------|---------------|
| ESLint | Code quality | Industry standard, customizable rules |
| Prettier | Code formatting | Consistent code style, zero configuration |
| tsx | TypeScript execution | Fast development iteration |
| tsup | Build tool | Fast bundling, ESM/CJS support |
| Changesets | Version management | Automated changelog, semantic versioning |

### 5.3 Dependencies Analysis

**Production Dependencies:**
```json
{
  "@modelcontextprotocol/sdk": "^1.0.4",
  "zod": "^3.22.4",
  "pino": "^8.17.2",
  "pino-pretty": "^10.3.1",
  "execa": "^8.0.1",
  "cosmiconfig": "^9.0.0",
  "uuid": "^9.0.1",
  "p-retry": "^6.1.0",
  "p-queue": "^8.0.1"
}
```

**Development Dependencies:**
```json
{
  "typescript": "^5.3.3",
  "vitest": "^1.1.0",
  "@types/node": "^20.10.6",
  "tsx": "^4.7.0",
  "tsup": "^8.0.1",
  "eslint": "^8.56.0",
  "prettier": "^3.1.1",
  "msw": "^2.0.11"
}
```

## 6. Security Considerations

### 6.1 Input Validation

**Threat:** Malicious code injection via review input
**Mitigation:**
- Strict Zod schema validation on all inputs
- Maximum code length limits (50KB default)
- Sanitize file paths to prevent directory traversal
- Content-type validation for language detection

**Implementation:**
```typescript
const sanitizeInput = (code: string): string => {
  // Remove null bytes
  code = code.replace(/\0/g, '');

  // Limit length
  if (code.length > MAX_CODE_LENGTH) {
    throw new ValidationError('Code exceeds maximum length');
  }

  return code;
};
```

### 6.2 CLI Execution Security

**Threat:** Command injection via Gemini CLI
**Mitigation:**
- Never use shell: true in child_process
- Whitelist allowed CLI arguments
- Validate CLI path against allowed directories
- Use execa for safe command execution
- Timeout enforcement to prevent hanging processes

**Implementation:**
```typescript
const ALLOWED_CLI_PATHS = [
  '/usr/local/bin/gemini',
  '/opt/gemini/bin/gemini',
  process.env.GEMINI_CLI_PATH
].filter(Boolean);

const validateCLIPath = (path: string): void => {
  const resolved = resolve(path);
  if (!ALLOWED_CLI_PATHS.some(allowed => resolved === resolve(allowed))) {
    throw new SecurityError('CLI path not in allowed list');
  }
};
```

### 6.3 Configuration Security

**Threat:** Exposure of sensitive configuration
**Mitigation:**
- Never log full configuration
- Support environment variable overrides
- Encrypt sensitive values in config files
- Use system keychain for API keys when possible
- Validate configuration against schema

**Implementation:**
```typescript
const SENSITIVE_KEYS = ['apiKey', 'token', 'secret', 'password'];

const sanitizeConfig = (config: any): any => {
  const sanitized = { ...config };
  for (const key of SENSITIVE_KEYS) {
    if (key in sanitized) {
      sanitized[key] = '***REDACTED***';
    }
  }
  return sanitized;
};
```

### 6.4 MCP Tool Security

**Threat:** Unauthorized access to Codex MCP tool
**Mitigation:**
- Respect MCP tool permissions
- Handle tool errors gracefully
- Never expose raw MCP responses
- Rate limiting on tool calls
- Audit logging of all tool invocations

### 6.5 Data Privacy

**Threat:** Code leakage through logs or errors
**Mitigation:**
- Never log full code snippets
- Truncate code in error messages
- Support local-only operation mode
- Clear sensitive data from memory after use
- Optional disk caching with encryption

### 6.6 Dependency Security

**Threat:** Vulnerable dependencies
**Mitigation:**
- Regular dependency audits (npm audit)
- Automated security updates (Dependabot)
- Pin dependency versions
- Use package lock files
- Minimal dependency footprint

## 7. Configuration Structure

### 7.1 Configuration File (config/default.json)

```json
{
  "server": {
    "name": "code-review-mcp",
    "version": "1.1.0",
    "logLevel": "info",
    "transport": "stdio"
  },
  "codex": {
    "enabled": true,
    "timeout": 60000,
    "retryAttempts": 3,
    "retryDelay": 1000,
    "maxConcurrent": 1,
    "model": null,
    "config": {}
  },
  "gemini": {
    "enabled": true,
    "cliPath": "/usr/local/bin/gemini",
    "timeout": 60000,
    "retryAttempts": 3,
    "retryDelay": 1000,
    "maxConcurrent": 1,
    "model": null,
    "args": []
  },
  "review": {
    "maxCodeLength": 50000,
    "includeContext": true,
    "defaultLanguage": null,
    "formats": ["markdown", "json"],
    "defaultSeverity": "all",
    "deduplication": {
      "enabled": true,
      "similarityThreshold": 0.8
    }
  },
  "retry": {
    "maxAttempts": 3,
    "initialDelay": 1000,
    "maxDelay": 10000,
    "backoffFactor": 2,
    "retryableErrors": [
      "TIMEOUT_ERROR",
      "NETWORK_ERROR",
      "CLI_EXECUTION_ERROR"
    ]
  },
  "logging": {
    "level": "info",
    "pretty": true,
    "file": {
      "enabled": false,
      "path": "./logs/code-review-mcp.log",
      "maxSize": "10M",
      "maxFiles": 5
    }
  },
  "cache": {
    "enabled": false,
    "ttl": 3600000,
    "maxSize": 100
  }
}
```

### 7.2 Environment Variables

```bash
# Server Configuration
CODE_REVIEW_MCP_LOG_LEVEL=info
CODE_REVIEW_MCP_LOG_PRETTY=true

# Codex Configuration
CODEX_ENABLED=true
CODEX_TIMEOUT=60000
CODEX_RETRY_ATTEMPTS=3

# Gemini Configuration
GEMINI_ENABLED=true
GEMINI_CLI_PATH=/usr/local/bin/gemini
GEMINI_TIMEOUT=60000
GEMINI_RETRY_ATTEMPTS=3
GEMINI_MODEL=gemini-pro

# Review Configuration
REVIEW_MAX_CODE_LENGTH=50000
REVIEW_INCLUDE_CONTEXT=true

# Feature Flags
ENABLE_CACHE=false
ENABLE_METRICS=false
```

### 7.3 Configuration Schema (Zod)

```typescript
import { z } from 'zod';

export const ServerConfigSchema = z.object({
  server: z.object({
    name: z.string(),
    version: z.string(),
    logLevel: z.enum(['debug', 'info', 'warn', 'error']),
    transport: z.enum(['stdio', 'http'])
  }),

  codex: z.object({
    enabled: z.boolean(),
    timeout: z.number().min(1000).max(300000),
    retryAttempts: z.number().min(0).max(10),
    retryDelay: z.number().min(0),
    maxConcurrent: z.number().min(1).max(10),
    model: z.string().nullable(),
    config: z.record(z.any())
  }),

  gemini: z.object({
    enabled: z.boolean(),
    cliPath: z.string(),
    timeout: z.number().min(1000).max(300000),
    retryAttempts: z.number().min(0).max(10),
    retryDelay: z.number().min(0),
    maxConcurrent: z.number().min(1).max(10),
    model: z.string().nullable(),
    args: z.array(z.string())
  }),

  review: z.object({
    maxCodeLength: z.number().min(100).max(1000000),
    includeContext: z.boolean(),
    defaultLanguage: z.string().nullable(),
    formats: z.array(z.enum(['markdown', 'json', 'html'])),
    defaultSeverity: z.enum(['all', 'high', 'medium']),
    deduplication: z.object({
      enabled: z.boolean(),
      similarityThreshold: z.number().min(0).max(1)
    })
  }),

  retry: z.object({
    maxAttempts: z.number().min(0).max(10),
    initialDelay: z.number().min(0),
    maxDelay: z.number().min(0),
    backoffFactor: z.number().min(1),
    retryableErrors: z.array(z.string())
  }),

  logging: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']),
    pretty: z.boolean(),
    file: z.object({
      enabled: z.boolean(),
      path: z.string(),
      maxSize: z.string(),
      maxFiles: z.number()
    })
  }),

  cache: z.object({
    enabled: z.boolean(),
    ttl: z.number().min(0),
    maxSize: z.number().min(0)
  })
});

export type ServerConfig = z.infer<typeof ServerConfigSchema>;
```

## 8. Implementation Roadmap

### Phase 1: Core MVP (Week 1-2)
**Objective:** Basic MCP server with Codex integration

**Deliverables:**
- [ ] MCP server setup with stdio transport
- [ ] Codex service integration
- [ ] Basic tool: `review_code_with_codex`
- [ ] Input/output validation with Zod
- [ ] Basic error handling
- [ ] Configuration management
- [ ] Unit tests for core components

**Success Criteria:**
- Server starts and registers tools
- Can perform code review via Codex
- Returns structured JSON responses
- Handles basic errors gracefully

### Phase 2: Gemini Integration (Week 3)
**Objective:** Add Gemini CLI support

**Deliverables:**
- [ ] Gemini CLI wrapper
- [ ] Process execution management
- [ ] Tool: `review_code_with_gemini`
- [ ] CLI output parsing
- [ ] Retry logic for CLI failures
- [ ] Integration tests

**Success Criteria:**
- Can execute Gemini CLI commands
- Parse and structure Gemini output
- Handle CLI errors and timeouts
- Consistent output format with Codex

### Phase 3: Review Aggregation (Week 4)
**Objective:** Combine and deduplicate reviews

**Deliverables:**
- [ ] Review aggregation service
- [ ] Finding deduplication algorithm
- [ ] Tool: `review_code_combined`
- [ ] Consensus calculation
- [ ] Parallel execution support
- [ ] Performance optimization

**Success Criteria:**
- Can run both reviewers in parallel
- Merges findings intelligently
- Calculates consensus metrics
- Performance: <2x single review time

### Phase 4: Production Hardening (Week 5-6)
**Objective:** Production-ready features

**Deliverables:**
- [ ] Comprehensive logging
- [ ] Metrics and monitoring
- [ ] Rate limiting
- [ ] Caching layer
- [ ] Security audit
- [ ] Performance testing
- [ ] Documentation
- [ ] Example usage

**Success Criteria:**
- Passes security audit
- Handles 100+ concurrent reviews
- <100ms overhead per review
- 99.9% uptime in testing

### Phase 5: Advanced Features (Week 7+)
**Objective:** Enhanced capabilities

**Deliverables:**
- [ ] Async review support with status tracking
- [ ] Custom prompt templates
- [ ] Review history and analytics
- [ ] Webhook notifications
- [ ] Multi-file review support
- [ ] Plugin system for custom reviewers

## 9. Performance Considerations

### 9.1 Performance Targets

| Metric | Target | Maximum |
|--------|--------|---------|
| Single review latency | <5s | <30s |
| Combined review latency | <8s | <60s |
| Server startup time | <1s | <3s |
| Memory usage (idle) | <50MB | <100MB |
| Memory usage (active) | <200MB | <500MB |
| Concurrent reviews | 10 | 50 |

### 9.2 Optimization Strategies

**1. Parallel Execution:**
- Run Codex and Gemini reviews concurrently
- Use Promise.all() for parallel operations
- Implement timeout racing

**2. Caching:**
- Cache review results by code hash
- TTL-based cache invalidation
- LRU eviction policy

**3. Resource Management:**
- Connection pooling for MCP tools
- Process pooling for CLI execution
- Memory-efficient streaming for large files

**4. Code Optimization:**
- Lazy loading of services
- Efficient parsing algorithms
- Minimize object allocations

## 10. Monitoring and Observability

### 10.1 Metrics to Track

**Performance Metrics:**
- Review duration (p50, p95, p99)
- Tool execution time
- Queue depth
- Error rate by type

**Business Metrics:**
- Total reviews conducted
- Reviews by source (Codex/Gemini/Combined)
- Finding distribution by severity
- Cache hit rate

**System Metrics:**
- CPU usage
- Memory usage
- Process count
- Disk I/O

### 10.2 Logging Strategy

**Log Levels:**
- DEBUG: Internal state, function calls
- INFO: Review requests, completions
- WARN: Retries, degraded performance
- ERROR: Failures, exceptions

**Structured Logging Format:**
```json
{
  "timestamp": "2025-01-17T10:30:45.123Z",
  "level": "info",
  "msg": "Review completed",
  "reviewId": "uuid",
  "source": "codex",
  "duration": 4532,
  "findings": 12,
  "severity": {
    "critical": 2,
    "high": 5,
    "medium": 3,
    "low": 2
  }
}
```

## 11. Testing Strategy

### 11.1 Test Pyramid

```
        +-------------+
        |   E2E (5%)  |
        +-------------+
      +-----------------+
      | Integration(15%)|
      +-----------------+
    +---------------------+
    |   Unit Tests (80%)  |
    +---------------------+
```

### 11.2 Test Coverage Targets

| Component | Target Coverage | Critical Paths |
|-----------|-----------------|----------------|
| Core services | 90% | 100% |
| Tool handlers | 85% | 100% |
| Utilities | 80% | N/A |
| Configuration | 75% | 100% |

### 11.3 Test Scenarios

**Unit Tests:**
- Schema validation (valid/invalid inputs)
- Error classification and handling
- Response parsing and formatting
- Configuration loading and validation

**Integration Tests:**
- Codex MCP tool integration
- Gemini CLI execution
- Review aggregation logic
- End-to-end tool execution

**E2E Tests:**
- Full review workflows
- Error recovery scenarios
- Performance under load
- Configuration edge cases

## 12. Deployment and Operations

### 12.1 Installation Methods

**NPM Package:**
```bash
npm install -g code-review-mcp
code-review-mcp start
```

**Docker Container:**
```bash
docker run -v ./config.json:/config.json code-review-mcp
```

**From Source:**
```bash
git clone https://github.com/org/code-review-mcp
cd code-review-mcp
npm install
npm run build
npm start
```

### 12.2 MCP Configuration

**Claude Desktop (config.json):**
```json
{
  "mcpServers": {
    "code-review": {
      "command": "node",
      "args": ["/path/to/code-review-mcp/dist/index.js"],
      "env": {
        "GEMINI_CLI_PATH": "/usr/local/bin/gemini",
        "CODE_REVIEW_MCP_LOG_LEVEL": "info"
      }
    }
  }
}
```

### 12.3 Health Checks

**Health Endpoint (if HTTP transport):**
```typescript
GET /health
Response:
{
  "status": "healthy",
  "services": {
    "codex": "available",
    "gemini": "available"
  },
  "uptime": 3600,
  "version": "1.1.0"
}
```

### 12.4 Troubleshooting Guide

**Common Issues:**

1. **Codex MCP tool not found**
   - Verify MCP tool is registered
   - Check MCP SDK version compatibility
   - Review server logs for initialization errors

2. **Gemini CLI execution fails**
   - Verify CLI path in configuration
   - Check CLI permissions (executable bit)
   - Test CLI manually: `gemini --version`

3. **Reviews timeout**
   - Increase timeout in configuration
   - Check system resources (CPU/memory)
   - Review code length limits

4. **High memory usage**
   - Disable cache if not needed
   - Reduce maxConcurrent setting
   - Check for memory leaks in logs

## 13. Future Enhancements

### 13.1 Planned Features

**Short-term (3-6 months):**
- Support for additional AI reviewers (Claude, GPT-4)
- Custom review templates and prompts
- Review history and trend analysis
- Webhook notifications for review completion
- Multi-file project review

**Long-term (6-12 months):**
- Machine learning-based finding prioritization
- Integration with CI/CD systems
- Review collaboration features
- Custom plugin system
- Web dashboard for review management

### 13.2 Scalability Considerations

**Horizontal Scaling:**
- Stateless server design
- Load balancer support
- Distributed caching (Redis)
- Message queue integration (RabbitMQ)

**Vertical Scaling:**
- Multi-threading for CPU-intensive tasks
- Memory pooling and optimization
- Database indexing strategies
- CDN for static assets

---

## Document Metadata

**Version:** 1.1.0
**Last Updated:** 2025-01-17
**Status:** Specification
**Authors:** Technical Architecture Team
**Review Status:** Pending Review
