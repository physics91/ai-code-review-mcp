# Codex CLI Migration Guide

## Overview

This document describes the migration from **MCP tool-based execution** to **direct CLI execution** for the Codex service. This change brings consistency with the Gemini service and simplifies the architecture.

## What Changed

### Before (MCP Tool Approach)
```typescript
// Used MCP client to call mcp__codex__codex tool
const mcpClient = new MCPToolClientImpl(logger, codexServerCommand);
await mcpClient.connect();
const result = await mcpClient.callTool('mcp__codex__codex', { prompt });
```

### After (Direct CLI Approach)
```typescript
// Direct execution of codex CLI
const result = await execa('codex', ['exec', '--json', ...args], {
  input: prompt,
  timeout: 60000,
  shell: false,
});
```

## Migration Details

### 1. Service Layer Changes

#### File: `src/services/codex/client.ts`

**Changes:**
- Removed `MCPToolClient` dependency
- Added `execa` for CLI execution
- Implemented CLI path validation (whitelist)
- Added JSONL output parsing (Codex CLI outputs event stream)
- Added security measures (shell injection prevention)

**New Interface:**
```typescript
export interface CodexServiceConfig {
  cliPath: string;        // CLI executable path (default: 'codex')
  timeout: number;        // Execution timeout
  retryAttempts: number;  // Number of retries
  retryDelay: number;     // Delay between retries
  model?: string | null;  // Model to use (e.g., 'claude-opus-4')
  args?: string[];        // Additional CLI arguments
}
```

**Key Methods:**
- `executeCodexCLI()`: Executes `codex exec` command with stdin input
- `validateCLIPath()`: Validates CLI path against whitelist
- `buildCLIArgs()`: Constructs CLI arguments including model, JSON output, sandbox mode
- `parseCodexOutput()`: Parses JSONL output from Codex CLI

### 2. Configuration Changes

#### File: `src/schemas/config.ts`

**Before:**
```json
{
  "codex": {
    "enabled": true,
    "timeout": 60000,
    "retryAttempts": 3,
    "retryDelay": 1000,
    "maxConcurrent": 1,
    "model": null,
    "config": {}
  }
}
```

**After:**
```json
{
  "codex": {
    "enabled": true,
    "cliPath": "codex",
    "timeout": 60000,
    "retryAttempts": 3,
    "retryDelay": 1000,
    "maxConcurrent": 1,
    "model": null,
    "args": []
  }
}
```

**Changes:**
- Removed `config` object (MCP-specific)
- Added `cliPath` string (CLI executable path)
- Added `args` array (custom CLI arguments)

#### Environment Variables

New environment variables:
- `CODEX_CLI_PATH`: Override CLI path (default: 'codex')
- `CODEX_MODEL`: Override model (default: null)
- `CODEX_TIMEOUT`: Override timeout (default: 60000)
- `CODEX_RETRY_ATTEMPTS`: Override retry attempts (default: 3)

### 3. Entry Point Simplification

#### File: `src/index.ts`

**Removed:**
- `MCPToolClientImpl` class (180+ lines)
- MCP client connection logic
- Codex MCP server configuration

**Simplified:**
```typescript
// Before
const mcpToolClient = new MCPToolClientImpl(logger, codexServerCommand);
await mcpToolClient.connect();
const codexService = new CodexReviewService(config.codex, logger, mcpToolClient);

// After
const codexService = new CodexReviewService(config.codex, logger);
```

### 4. Test Updates

#### File: `tests/unit/services/codex/client.test.ts`

**Changes:**
- Removed MCP client mocks
- Added `execa` mocks
- Updated tests to verify CLI execution
- Added JSONL parsing tests
- Added CLI argument validation tests

**Example Test:**
```typescript
it('should execute codex CLI with correct arguments', async () => {
  await service.reviewCode({ code: 'test code' });

  expect(execa).toHaveBeenCalledWith(
    'codex',
    expect.arrayContaining(['exec', '--json', '--skip-git-repo-check', '--sandbox', 'read-only']),
    expect.objectContaining({
      timeout: 10000,
      input: expect.any(String),
      reject: true,
      shell: false,
    })
  );
});
```

## Codex CLI Usage

### Command Format
```bash
codex exec [OPTIONS] [PROMPT]
```

### Key Options Used
- `--json`: Output events as JSONL (one JSON object per line)
- `--skip-git-repo-check`: Allow running outside git repositories
- `--sandbox read-only`: Use read-only sandbox for safety
- `--model <MODEL>`: Specify model (e.g., 'claude-opus-4')
- `stdin`: Prompt is provided via stdin

### Example Execution
```bash
echo "Review this code: function() { return null.value; }" | codex exec --json --skip-git-repo-check --sandbox read-only
```

### Output Format (JSONL)
```json
{"type":"message","role":"user","content":"Review this code..."}
{"type":"message","role":"assistant","content":"{\"findings\":[...],\"overallAssessment\":\"...\",\"recommendations\":[...]}"}
{"type":"done"}
```

## CLI Path Whitelist

For security, only these paths are allowed:

1. `config.codex.cliPath` (from config)
2. `process.env.CODEX_CLI_PATH` (environment variable)
3. `/usr/local/bin/codex` (Unix common location)
4. `/opt/codex/bin/codex` (Unix alternative location)
5. `C:\Program Files\codex\codex.exe` (Windows)
6. `C:\Program Files (x86)\codex\codex.exe` (Windows x86)
7. `C:\Users\<user>\AppData\Roaming\npm\codex.cmd` (Windows npm global)
8. `codex` (System PATH)

## Error Handling

### CLI Execution Errors
- **Exit Code 1+**: Wrapped as `CLIExecutionError`
- **Timeout**: Wrapped as `TimeoutError`
- **Parse Error**: Wrapped as `ParseError`
- All wrapped as domain-specific `CodexReviewError` at service layer

### Security Errors
- **Invalid CLI Path**: Throws `SecurityError` and logs security event
- **Shell Injection**: Prevented by `execa` with `shell: false`

## Breaking Changes

### For Users
1. **No MCP Server Required**: No need to configure `CODEX_MCP_SERVER_COMMAND`
2. **New Config Format**: Update `config/default.json` or `.code-review-mcprc`
3. **CLI Must Be Installed**: Codex CLI must be in PATH or specified via `cliPath`

### For Developers
1. **Service Constructor**: No longer requires `MCPToolClient` parameter
2. **Interface Changes**: `CodexServiceConfig` interface updated
3. **No MCP Dependencies**: Removed MCP SDK dependency for Codex

## Upgrade Steps

### 1. Update Configuration
```json
{
  "codex": {
    "enabled": true,
    "cliPath": "codex",
    "timeout": 60000,
    "retryAttempts": 3,
    "retryDelay": 1000,
    "maxConcurrent": 1,
    "model": null,
    "args": []
  }
}
```

### 2. Remove MCP Server Configuration
Remove `CODEX_MCP_SERVER_COMMAND` from environment variables.

### 3. Verify Codex CLI Installation
```bash
# Check if codex is installed
codex --version

# Test execution
echo "Hello" | codex exec --json
```

### 4. Update Code (if extending)
```typescript
// Before
const codexService = new CodexReviewService(config.codex, logger, mcpClient);

// After
const codexService = new CodexReviewService(config.codex, logger);
```

## Benefits

### 1. Consistency
- Both Codex and Gemini now use direct CLI execution
- Unified error handling and retry logic
- Similar configuration structure

### 2. Simplicity
- Removed 180+ lines of MCP client code
- No external MCP server process required
- Easier to debug and maintain

### 3. Security
- CLI path whitelist prevents arbitrary execution
- Shell injection prevention with `execa`
- Read-only sandbox mode by default

### 4. Performance
- Direct execution (no MCP overhead)
- Streaming JSONL output
- Configurable timeouts per request

## Rollback Plan

If issues arise, revert these commits:
1. `src/services/codex/client.ts` - Restore MCP tool approach
2. `src/schemas/config.ts` - Restore old config schema
3. `config/default.json` - Restore old config format
4. `src/index.ts` - Restore MCPToolClientImpl
5. `tests/unit/services/codex/client.test.ts` - Restore MCP mocks

## Testing

### Unit Tests
```bash
npm test -- tests/unit/services/codex/client.test.ts
```

### Integration Tests
```bash
# Set environment
export CODEX_CLI_PATH=codex
export CODEX_MODEL=claude-opus-4

# Run integration tests
npm run test:integration
```

### Manual Testing
```bash
# Start MCP server
npm run build && node dist/index.js

# Test with MCP Inspector
npx @modelcontextprotocol/inspector node dist/index.js
```

## Troubleshooting

### CLI Not Found
```
Error: Codex CLI path not in allowed list: /path/to/codex
```

**Solution:** Add path to whitelist or use environment variable:
```bash
export CODEX_CLI_PATH=/path/to/codex
```

### Parse Error
```
Error: No JSON found in Codex output
```

**Solution:** Verify Codex CLI is outputting JSONL format:
```bash
echo "test" | codex exec --json
```

### Timeout Error
```
Error: Codex CLI timed out after 60000ms
```

**Solution:** Increase timeout in config:
```json
{
  "codex": {
    "timeout": 120000
  }
}
```

## Future Improvements

1. **Streaming Output**: Parse JSONL events in real-time
2. **Progress Tracking**: Show intermediate status updates
3. **Custom Schemas**: Support `--output-schema` for structured output
4. **Caching**: Cache CLI results for identical prompts
5. **Parallel Execution**: Support concurrent reviews with rate limiting

## References

- [Codex CLI Documentation](https://github.com/anthropics/codex)
- [execa Documentation](https://github.com/sindresorhus/execa)
- [MCP SDK Documentation](https://github.com/modelcontextprotocol/sdk)

## Support

For issues or questions:
1. Check troubleshooting section above
2. Review Codex CLI logs
3. Enable debug logging: `LOG_LEVEL=debug`
4. Open GitHub issue with logs and reproduction steps

---

**Migration Date:** 2025-11-17
**Version:** 1.1.0
**Author:** Code Review MCP Team
