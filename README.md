# AI Code Review MCP Server

[![CI](https://github.com/physics91/ai-code-review-mcp/workflows/CI/badge.svg)](https://github.com/physics91/ai-code-review-mcp/actions)
[![npm version](https://img.shields.io/npm/v/code-review-mcp.svg)](https://www.npmjs.com/package/code-review-mcp)
[![npm downloads](https://img.shields.io/npm/dm/code-review-mcp.svg)](https://www.npmjs.com/package/code-review-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/physics91/ai-code-review-mcp/pulls)

A comprehensive Model Context Protocol (MCP) server that provides AI-powered code review capabilities using both Codex CLI and Gemini CLI. This server enables intelligent, automated code analysis with support for multiple AI reviewers, finding aggregation, and detailed security and performance assessments.

## Features

- **Dual AI Review Engines**: Leverage both Codex and Gemini for comprehensive code analysis
- **Combined Reviews**: Aggregate findings from multiple reviewers with intelligent deduplication
- **Type-Safe**: Built with TypeScript and Zod for runtime validation
- **Configurable**: Extensive configuration options via JSON, environment variables, or code
- **Production-Ready**: Includes retry logic, error handling, logging, and monitoring
- **Secure**: Input validation, CLI sanitization, and security-first design
- **Flexible**: Support for multiple programming languages and review focus areas

## Architecture Overview

```
+---------------------------------------------------------------+
|                      MCP Client (Claude)                       |
+---------------------------+-----------------------------------+
                            | MCP Protocol (stdio)
                            v
+---------------------------------------------------------------+
|                 Code Review MCP Server                         |
|  +------------------+         +------------------+            |
|  |  Codex Service   |         |  Gemini Service  |            |
|  |  (CLI Direct)    |         |  (CLI Direct)    |            |
|  +--------+---------+         +--------+---------+            |
|           |                            |                       |
|           +------------+---------------+                       |
|                        v                                       |
|           +--------------------+                               |
|           | Review Aggregator  |                               |
|           | & Deduplication    |                               |
|           +--------------------+                               |
+---------------------------------------------------------------+
```

## Installation

### From NPM (Recommended)

```bash
# Install globally
npm install -g code-review-mcp

# Or use directly with npx
npx code-review-mcp
```

**NPM Package**: [code-review-mcp](https://www.npmjs.com/package/code-review-mcp)

### From Source

```bash
git clone https://github.com/physics91/ai-code-review-mcp.git
cd ai-code-review-mcp
npm install
npm run build
npm link
```

### Using Docker

```bash
docker pull code-review-mcp:latest
docker run -v ./config.json:/config.json code-review-mcp
```

## Prerequisites

- Node.js 20.0.0 or higher
- Gemini CLI installed and configured (for Gemini reviews)
- Codex CLI installed and configured (for Codex reviews)

### Installing CLIs

#### Codex CLI
```bash
# Install from npm
npm install -g @anthropic-ai/codex

# Verify installation
codex --version
```

#### Gemini CLI
```bash
# Example installation (adjust based on your system)
npm install -g @google/gemini-cli
# or
brew install gemini-cli
```

### CLI Path Auto-Detection

The server automatically detects CLI paths based on your platform and environment. You don't need to specify the exact path in most cases!

#### Priority Order

1. **Environment Variables** (highest priority)
   - `CODEX_CLI_PATH` - Custom Codex CLI path
   - `GEMINI_CLI_PATH` - Custom Gemini CLI path

2. **Config File** - Explicit path in `config.json`

3. **Platform-Specific Paths** (auto-detected)
   - **macOS / Linux:**
     - `/usr/local/bin/{cli}`
     - `/usr/bin/{cli}`
     - `/opt/{cli}/bin/{cli}`
     - `~/.local/bin/{cli}`
     - `/opt/homebrew/bin/{cli}` (macOS Homebrew)

   - **Windows:**
     - `%APPDATA%\npm\{cli}.cmd`
     - `C:\Program Files\{cli}\{cli}.exe`
     - `C:\Program Files\Google\Gemini\gemini.exe` (Gemini only)

4. **System PATH** - `which` (Unix) or `where` (Windows) command

5. **Fallback** - Assumes CLI is in PATH

#### Configuration Options

**Option 1: Auto-Detection (Recommended)**
```json
{
  "codex": {
    "cliPath": "auto"  // Automatically detects CLI path
  },
  "gemini": {
    "cliPath": "auto"  // Automatically detects CLI path
  }
}
```

**Option 2: Environment Variables**
```bash
# Set custom CLI paths
export CODEX_CLI_PATH="/custom/path/codex"
export GEMINI_CLI_PATH="/opt/google/gemini/gemini"
```

**Option 3: Explicit Configuration**
```json
{
  "codex": {
    "cliPath": "/usr/local/bin/codex"
  },
  "gemini": {
    "cliPath": "/opt/gemini/bin/gemini"
  }
}
```

**Option 4: Default Command Name**
```json
{
  "codex": {
    "cliPath": "codex"  // Uses 'codex' from PATH
  },
  "gemini": {
    "cliPath": "gemini"  // Uses 'gemini' from PATH
  }
}
```

#### Detection Logs

The server logs the detected CLI paths on startup:

```
[INFO] Codex CLI path detected {
  path: "/usr/local/bin/codex",
  source: "detected",
  exists: true,
  platform: "darwin"
}

[INFO] Gemini CLI path detected {
  path: "/opt/homebrew/bin/gemini",
  source: "detected",
  exists: true,
  platform: "darwin"
}
```

Detection sources:
- `env` - From environment variable
- `config` - From configuration file
- `detected` - Auto-detected from platform-specific paths
- `which` - Found using `which`/`where` command
- `default` - Fallback to command name (may fail if not in PATH)

## Configuration

### Claude Desktop Integration

Add to your Claude Desktop configuration (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "code-review": {
      "command": "node",
      "args": ["/path/to/code-review-mcp/dist/index.js"],
      "env": {
        "CODE_REVIEW_MCP_LOG_LEVEL": "info",
        "CODEX_ENABLED": "true",
        "GEMINI_ENABLED": "true"
      }
    }
  }
}
```

Note: CLI paths are auto-detected by default. Only set `CODEX_CLI_PATH` or `GEMINI_CLI_PATH` if you need to override the detection.

### Configuration File

Create a `config.json` in your project or use the default configuration:

```json
{
  "server": {
    "name": "code-review-mcp",
    "version": "1.0.1",
    "logLevel": "info"
  },
  "codex": {
    "enabled": true,
    "cliPath": "auto",
    "timeout": 60000,
    "retryAttempts": 3,
    "model": null,
    "args": []
  },
  "gemini": {
    "enabled": true,
    "cliPath": "auto",
    "timeout": 60000,
    "retryAttempts": 3,
    "model": null,
    "args": []
  },
  "review": {
    "maxCodeLength": 50000,
    "deduplication": {
      "enabled": true,
      "similarityThreshold": 0.8
    }
  }
}
```

**Note:** `"cliPath": "auto"` enables automatic CLI path detection. You can also specify:
- `"auto"` - Auto-detect (recommended)
- `"codex"` / `"gemini"` - Use command from PATH
- Absolute path - Explicit path to CLI binary

### Environment Variables

Create a `.env` file:

```bash
# Copy example configuration
cp .env.example .env

# Edit with your settings
CODEX_CLI_PATH=codex
CODEX_MODEL=claude-opus-4
GEMINI_CLI_PATH=/usr/local/bin/gemini
GEMINI_MODEL=gemini-pro
CODEX_ENABLED=true
GEMINI_ENABLED=true
```

## Usage

### Available Tools

The MCP server exposes the following tools:

#### 1. review_code_with_codex

Perform code review using Codex AI.

**Input Parameters:**
```typescript
{
  code: string;                    // Source code to review (max 50KB)
  language?: string;               // Programming language (auto-detect if omitted)
  context?: {
    fileName?: string;             // File name for context
    projectType?: string;          // e.g., "web", "backend", "mobile"
    reviewFocus?: Array<           // What to focus on
      'security' | 'performance' | 'style' | 'bugs' | 'all'
    >;
  };
  options?: {
    timeout?: number;              // Timeout in ms (default: 60000)
    includeExplanations?: boolean; // Include detailed explanations
    severity?: 'all' | 'high' | 'medium'; // Filter by severity
  };
}
```

**Example Usage in Claude:**

```
Please review this code using Codex:

[Call: review_code_with_codex]
{
  "code": "function calculateTotal(items) { let total = 0; for(let i=0; i<=items.length; i++) { total += items[i].price; } return total; }",
  "language": "javascript",
  "context": {
    "fileName": "cart.js",
    "reviewFocus": ["bugs", "security"]
  }
}
```

**Output:**
```json
{
  "success": true,
  "reviewId": "uuid",
  "timestamp": "2025-01-17T10:30:00.000Z",
  "source": "codex",
  "summary": {
    "totalFindings": 3,
    "critical": 1,
    "high": 1,
    "medium": 1,
    "low": 0
  },
  "findings": [
    {
      "type": "bug",
      "severity": "critical",
      "line": 1,
      "title": "Off-by-one error in loop",
      "description": "Loop condition uses <= instead of <, causing array index out of bounds",
      "suggestion": "Change i<=items.length to i<items.length",
      "code": "for(let i=0; i<items.length; i++)"
    }
  ],
  "overallAssessment": "Code has critical bugs that need immediate fixing",
  "recommendations": [
    "Add input validation for items parameter",
    "Consider using Array.reduce() for cleaner code"
  ]
}
```

#### 2. review_code_with_gemini

Perform code review using Gemini CLI.

**Input Parameters:** Same as `review_code_with_codex`

**Example Usage:**

```
Review this Python code with Gemini:

[Call: review_code_with_gemini]
{
  "code": "def process_data(data):\n    result = []\n    for item in data:\n        result.append(item * 2)\n    return result",
  "language": "python",
  "context": {
    "reviewFocus": ["performance", "style"]
  }
}
```

#### 3. review_code_combined

Perform code review using both Codex and Gemini, then aggregate results.

**Input Parameters:**
```typescript
{
  code: string;
  language?: string;
  context?: {
    fileName?: string;
    projectType?: string;
    reviewFocus?: Array<'security' | 'performance' | 'style' | 'bugs' | 'all'>;
  };
  options?: {
    timeout?: number;              // Timeout for entire operation
    includeExplanations?: boolean;
    severity?: 'all' | 'high' | 'medium';
    parallelExecution?: boolean;   // Run both reviewers in parallel
    includeIndividualReviews?: boolean; // Include separate reviews in output
  };
}
```

**Example Usage:**

```
Please perform a comprehensive review using both Codex and Gemini:

[Call: review_code_combined]
{
  "code": "class UserAuth { login(user, pass) { if(user && pass) { return db.query('SELECT * FROM users WHERE username=' + user); } } }",
  "language": "javascript",
  "context": {
    "fileName": "auth.js",
    "reviewFocus": ["security", "bugs"]
  },
  "options": {
    "parallelExecution": true,
    "includeIndividualReviews": false
  }
}
```

**Output:**
```json
{
  "success": true,
  "reviewId": "uuid",
  "timestamp": "2025-01-17T10:30:00.000Z",
  "source": "combined",
  "summary": {
    "totalFindings": 5,
    "critical": 2,
    "high": 2,
    "medium": 1,
    "low": 0,
    "consensus": 85
  },
  "findings": [
    {
      "type": "security",
      "severity": "critical",
      "line": 4,
      "title": "SQL Injection vulnerability",
      "description": "User input directly concatenated into SQL query",
      "suggestion": "Use parameterized queries or ORM",
      "sources": ["codex", "gemini"],
      "confidence": "high"
    }
  ],
  "overallAssessment": "Combined review from 2 reviewers: Found 2 critical issues that require immediate attention.",
  "metadata": {
    "reviewDuration": 4523,
    "codexDuration": 2341,
    "geminiDuration": 2182
  }
}
```

#### 4. get_review_status

Check the status of an async review operation (for future async support).

**Input Parameters:**
```typescript
{
  reviewId: string; // UUID of the review
}
```

## Advanced Usage

### Custom Review Focus

```typescript
{
  "code": "...",
  "context": {
    "reviewFocus": ["security", "performance"]
  }
}
```

Focus areas:
- `security`: SQL injection, XSS, authentication issues
- `performance`: Inefficient algorithms, memory leaks
- `style`: Code formatting, naming conventions
- `bugs`: Logic errors, edge cases
- `all`: Comprehensive review (default)

### Severity Filtering

```typescript
{
  "code": "...",
  "options": {
    "severity": "high" // Only show critical and high severity issues
  }
}
```

### Parallel Execution

For faster combined reviews:

```typescript
{
  "code": "...",
  "options": {
    "parallelExecution": true // Run Codex and Gemini concurrently
  }
}
```

## Configuration Reference

### Server Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `server.name` | string | "code-review-mcp" | Server name |
| `server.version` | string | "1.0.1" | Server version |
| `server.logLevel` | string | "info" | Log level (debug/info/warn/error) |

### Codex Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `codex.enabled` | boolean | true | Enable Codex reviews |
| `codex.timeout` | number | 60000 | Timeout in milliseconds |
| `codex.retryAttempts` | number | 3 | Number of retry attempts |
| `codex.model` | string | null | Codex model override |

### Gemini Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `gemini.enabled` | boolean | true | Enable Gemini reviews |
| `gemini.cliPath` | string | "/usr/local/bin/gemini" | Path to Gemini CLI |
| `gemini.timeout` | number | 60000 | Timeout in milliseconds |
| `gemini.retryAttempts` | number | 3 | Number of retry attempts |
| `gemini.model` | string | null | Gemini model override |

### Review Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `review.maxCodeLength` | number | 50000 | Maximum code length in bytes |
| `review.deduplication.enabled` | boolean | true | Enable finding deduplication |
| `review.deduplication.similarityThreshold` | number | 0.8 | Similarity threshold (0-1) |

## Error Handling

The server includes comprehensive error handling:

```typescript
// Errors are returned in a structured format
{
  "success": false,
  "error": {
    "type": "TIMEOUT_ERROR",
    "message": "Review timed out after 60000ms",
    "code": "ERR_TIMEOUT",
    "details": { ... }
  }
}
```

Common error types:
- `VALIDATION_ERROR`: Invalid input parameters
- `TIMEOUT_ERROR`: Operation timed out
- `CLI_EXECUTION_ERROR`: Gemini CLI failed
- `MCP_TOOL_ERROR`: Codex MCP tool failed
- `CONFIGURATION_ERROR`: Invalid configuration

## Security Considerations

1. **Input Validation**: All inputs are validated using Zod schemas
2. **CLI Safety**: CLI paths are whitelisted, no shell injection possible
3. **Code Length Limits**: Prevents DoS via large payloads
4. **Sanitization**: Sensitive data is redacted from logs
5. **Retry Limits**: Prevents infinite retry loops

## Performance

Performance targets:
- Single review: <5s (typical), <30s (maximum)
- Combined review: <8s (typical), <60s (maximum)
- Memory usage: <200MB (active), <50MB (idle)
- Concurrent reviews: 10 (default), 50 (maximum)

## Logging

Structured JSON logs with Pino:

```json
{
  "level": "info",
  "timestamp": "2025-01-17T10:30:00.000Z",
  "msg": "Review completed",
  "reviewId": "uuid",
  "source": "codex",
  "duration": 4532,
  "findings": 12
}
```

Set log level via environment:
```bash
CODE_REVIEW_MCP_LOG_LEVEL=debug
```

## Development

### Setup

```bash
git clone https://github.com/yourusername/code-review-mcp.git
cd code-review-mcp
npm install
```

### Development Mode

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests with UI
npm run test:ui
```

### Type Checking

```bash
npm run typecheck
```

### Linting

```bash
npm run lint
npm run lint:fix
```

## Troubleshooting

### Codex MCP tool not found

**Solution**: Ensure the Codex MCP tool is properly registered in your MCP client.

### Gemini CLI execution fails

**Solution**:
1. Verify Gemini CLI is installed: `gemini --version`
2. Check CLI path in configuration
3. Ensure executable permissions: `chmod +x /path/to/gemini`

### Reviews timeout

**Solution**:
1. Increase timeout in configuration
2. Reduce code length
3. Check system resources

### High memory usage

**Solution**:
1. Disable cache if not needed
2. Reduce `maxConcurrent` setting
3. Review logs for memory leaks

## Documentation

For detailed documentation, please refer to:

### Core Documentation
- **[Implementation Guide](docs/guides/implementation-guide.md)** - Step-by-step implementation guide
- **[Usage Examples](docs/guides/usage-example.md)** - Real-world usage examples
- **[Project Summary](docs/guides/project-summary.md)** - Project overview and objectives

### Reference
- **[Architecture](docs/reference/architecture.md)** - System architecture and design
- **[Specifications](docs/reference/SPECIFICATIONS.md)** - Technical specifications

### Development History
- **[Migration Documentation](docs/history/migration/)** - CLI migration guides
- **[Development Notes](docs/history/development/)** - Implementation status and fixes

## Contributing

Contributions are welcome! Please read our contributing guidelines and code of conduct.

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

- GitHub Issues: https://github.com/physics91/ai-code-review-mcp/issues
- Documentation: https://github.com/physics91/ai-code-review-mcp/wiki
- Discussions: https://github.com/physics91/ai-code-review-mcp/discussions

## Roadmap

### Short-term (3-6 months)
- [ ] Support for additional AI reviewers (Claude, GPT-4)
- [ ] Custom review templates
- [ ] Review history and analytics
- [ ] Webhook notifications
- [ ] Multi-file project review

### Long-term (6-12 months)
- [ ] ML-based finding prioritization
- [ ] CI/CD integrations
- [ ] Review collaboration features
- [ ] Plugin system
- [ ] Web dashboard

## Acknowledgments

- Built with [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/sdk)
- Powered by Codex and Gemini AI
- Inspired by the MCP community

---

**Version**: 1.0.1
**Last Updated**: 2025-01-19
**Status**: Production Ready
