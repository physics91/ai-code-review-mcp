# AI Code Agent MCP - Development Guide

## Project Overview

AI-powered code analysis MCP server using Codex and Gemini CLI tools with context-aware analysis capabilities.

## Prerequisites

- Node.js >= 20.0.0
- npm or yarn
- Codex CLI (`codex`) - OpenAI's code assistant
- Gemini CLI (`gemini`) - Google's AI assistant

## Build

### Full Build
```bash
npm run build
```
Uses `tsup` to build ESM output to `dist/` directory.

### Development Mode (with hot reload)
```bash
npm run watch
```

### Run without build (using tsx)
```bash
npm run dev
```

### Clean Build
```bash
npm run clean && npm run build
```

## Type Checking

```bash
npm run typecheck
```
Runs `tsc --noEmit` to check types without emitting files.

## Testing

### Run All Tests
```bash
npm run test
```

### Watch Mode (auto-rerun on changes)
```bash
npm run test:watch
```

### With Coverage Report
```bash
npm run test:coverage
```

### With UI Dashboard
```bash
npm run test:ui
```

### Test File Location
Tests are located in `__tests__` directories next to source files:
```
src/
├── core/
│   ├── __tests__/
│   │   └── validation.test.ts
│   └── *.ts
```

## Linting & Formatting

### Lint Check
```bash
npm run lint
```

### Lint with Auto-fix
```bash
npm run lint:fix
```

### Format Check
```bash
npm run format:check
```

### Format with Auto-fix
```bash
npm run format
```

## Project Structure

```
src/
├── index.ts              # MCP server entry point
├── core/                 # Core utilities
│   ├── config.ts         # Configuration management
│   ├── logger.ts         # Pino logger
│   ├── validation.ts     # Input validation with Zod
│   ├── error-handler.ts  # Error classification
│   ├── context-manager.ts # Context resolution with presets
│   ├── auto-detect.ts    # Language/framework auto-detection
│   ├── prompt-template.ts # Prompt rendering with threat model guidelines
│   ├── warnings.ts       # Context warning system
│   └── retry.ts          # Retry logic with backoff
├── schemas/              # Zod schemas
│   ├── config.ts         # Server configuration schema
│   ├── context.ts        # Analysis context schema
│   ├── tools.ts          # Tool input/output schemas
│   └── responses.ts      # CLI response schemas
├── services/             # External service integrations
│   ├── codex/client.ts   # Codex CLI wrapper
│   ├── gemini/client.ts  # Gemini CLI wrapper
│   ├── aggregator/       # Result merging and deduplication
│   ├── scanner/          # Secret scanning
│   └── analysis-status/  # Async analysis tracking
├── tools/                # MCP tool definitions
│   └── registry.ts       # Tool registration and handlers
└── types/                # TypeScript type definitions
```

## Configuration

Configuration file: `config/default.json`

Key sections:
- `codex` / `gemini`: CLI tool settings (timeout, retries, model)
- `context`: Analysis context presets and defaults
- `prompts`: Prompt template configuration
- `warnings`: Context warning settings
- `secretScanning`: Secret detection patterns

## MCP Tools

Available tools when server is running:
- `analyze_code_with_codex` - Analyze code using Codex CLI
- `analyze_code_with_gemini` - Analyze code using Gemini CLI
- `analyze_code_combined` - Use both and aggregate results
- `scan_secrets` - Scan for hardcoded secrets
- `get_analysis_status` - Check async analysis status

## Context-Aware Analysis

Use presets for appropriate severity assessment:
```json
{
  "options": {
    "preset": "cli-tool"
  }
}
```

Available presets:
- `cli-tool` - Local CLI tools (reduces security severity)
- `mcp-server` - MCP servers
- `react-web` - React web applications
- `nodejs-api` - Node.js API services
- `library` - Reusable libraries

## Quick Start for Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm run test

# Type check
npm run typecheck

# Full CI check
npm run typecheck && npm run lint && npm run test
```

## Debugging

Enable debug logging:
```bash
LOG_LEVEL=debug npm run dev
```

Or set in `config/default.json`:
```json
{
  "server": {
    "logLevel": "debug"
  }
}
```
