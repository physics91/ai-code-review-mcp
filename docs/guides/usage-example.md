# CLI Auto-Detection Usage Examples

## Quick Start

The server automatically detects CLI paths on all platforms. No configuration needed!

## Example 1: Using Default Auto-Detection

**config/default.json:**
```json
{
  "codex": {
    "enabled": true,
    "cliPath": "auto"
  },
  "gemini": {
    "enabled": true,
    "cliPath": "auto"
  }
}
```

**Server Log:**
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

[INFO] MCP server listening on stdio
```

## Example 2: Using Environment Variables

**Terminal:**
```bash
export CODEX_CLI_PATH="/custom/path/codex"
export GEMINI_CLI_PATH="/opt/google/gemini/gemini"

node dist/index.js
```

**Server Log:**
```
[INFO] Codex CLI path detected {
  path: "/custom/path/codex",
  source: "env",
  exists: true
}

[INFO] Gemini CLI path detected {
  path: "/opt/google/gemini/gemini",
  source: "env",
  exists: true
}
```

## Example 3: macOS Homebrew Installation

**Installation:**
```bash
brew install codex
brew install gemini-cli
```

**config/default.json:**
```json
{
  "codex": { "cliPath": "auto" },
  "gemini": { "cliPath": "auto" }
}
```

**Server Log (Apple Silicon):**
```
[INFO] Codex CLI path detected {
  path: "/opt/homebrew/bin/codex",
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

## Example 4: Windows NPM Global Installation

**Installation:**
```powershell
npm install -g @anthropic-ai/codex
npm install -g @google/gemini-cli
```

**config/default.json:**
```json
{
  "codex": { "cliPath": "auto" },
  "gemini": { "cliPath": "auto" }
}
```

**Server Log:**
```
[INFO] Codex CLI path detected {
  path: "C:\\Users\\YourName\\AppData\\Roaming\\npm\\codex.cmd",
  source: "detected",
  exists: true,
  platform: "win32"
}

[INFO] Gemini CLI path detected {
  path: "C:\\Users\\YourName\\AppData\\Roaming\\npm\\gemini.cmd",
  source: "detected",
  exists: true,
  platform: "win32"
}
```

## Example 5: Linux System Installation

**Installation:**
```bash
sudo apt install codex
sudo apt install gemini-cli
```

**config/default.json:**
```json
{
  "codex": { "cliPath": "auto" },
  "gemini": { "cliPath": "auto" }
}
```

**Server Log:**
```
[INFO] Codex CLI path detected {
  path: "/usr/bin/codex",
  source: "detected",
  exists: true,
  platform: "linux"
}

[INFO] Gemini CLI path detected {
  path: "/usr/bin/gemini",
  source: "detected",
  exists: true,
  platform: "linux"
}
```

## Example 6: Using System PATH

**Installation:**
```bash
# Add to PATH
export PATH="$PATH:/custom/cli/directory"

# Or link to standard location
ln -s /custom/cli/directory/codex /usr/local/bin/codex
```

**config/default.json:**
```json
{
  "codex": { "cliPath": "codex" },
  "gemini": { "cliPath": "gemini" }
}
```

**Server Log:**
```
[INFO] Codex CLI path detected {
  path: "/custom/cli/directory/codex",
  source: "which",
  exists: true,
  resolvedPath: "/custom/cli/directory/codex"
}
```

## Example 7: Mixed Configuration

**config/default.json:**
```json
{
  "codex": {
    "cliPath": "auto"  // Auto-detect Codex
  },
  "gemini": {
    "cliPath": "/opt/google/gemini/gemini"  // Explicit path for Gemini
  }
}
```

**Server Log:**
```
[INFO] Codex CLI path detected {
  path: "/usr/local/bin/codex",
  source: "detected",
  platform: "linux"
}

[INFO] Gemini CLI path detected {
  path: "/opt/google/gemini/gemini",
  source: "config"
}
```

## Example 8: Claude Desktop Configuration

**claude_desktop_config.json:**
```json
{
  "mcpServers": {
    "code-review": {
      "command": "node",
      "args": ["/path/to/code-review-mcp/dist/index.js"],
      "env": {
        "CODE_REVIEW_MCP_LOG_LEVEL": "info"
      }
    }
  }
}
```

**Note:** No `CODEX_CLI_PATH` or `GEMINI_CLI_PATH` needed! Auto-detection handles it.

## Example 9: Debugging Detection Issues

**Enable debug logging:**
```json
{
  "logging": {
    "level": "debug",
    "pretty": true
  },
  "codex": {
    "cliPath": "auto"
  }
}
```

**Debug Log Output:**
```
[DEBUG] Codex CLI allowed paths [
  "auto",
  "/usr/local/bin/codex",
  "/usr/bin/codex",
  "/opt/codex/bin/codex",
  "codex"
]

[DEBUG] Checking path: /usr/local/bin/codex
[DEBUG] Path exists: true

[INFO] Codex CLI path detected {
  path: "/usr/local/bin/codex",
  source: "detected",
  exists: true
}
```

## Example 10: Fallback Behavior

**When CLI is not found:**
```json
{
  "codex": { "cliPath": "auto" }
}
```

**Server Log:**
```
[WARN] Codex CLI not found, using default command (will fail if not in PATH) {
  path: "codex",
  source: "default",
  exists: false
}

[ERROR] Codex review failed: Command not found: codex
```

**Solution:**
```bash
# Option 1: Install CLI
npm install -g @anthropic-ai/codex

# Option 2: Set environment variable
export CODEX_CLI_PATH="/path/to/codex"

# Option 3: Add to PATH
export PATH="$PATH:/path/to/cli/directory"
```

## Testing CLI Detection

**Test detection manually:**
```bash
# Build the project
npm run build

# Run with debug logging
NODE_ENV=development CODE_REVIEW_MCP_LOG_LEVEL=debug node dist/index.js
```

**Check detected paths:**
- Look for `Codex CLI path detected` log message
- Look for `Gemini CLI path detected` log message
- Verify `source` field indicates correct detection method
- Verify `exists: true` for successful detection

## Common Scenarios

### Scenario 1: Corporate Environment with Custom Installation

```bash
# Set environment variables in .bashrc or .zshrc
export CODEX_CLI_PATH="/opt/company/tools/codex"
export GEMINI_CLI_PATH="/opt/company/tools/gemini"
```

### Scenario 2: Development vs Production

**development.json:**
```json
{
  "codex": { "cliPath": "/Users/dev/custom/codex" }
}
```

**production.json:**
```json
{
  "codex": { "cliPath": "auto" }
}
```

### Scenario 3: Docker Container

**Dockerfile:**
```dockerfile
FROM node:20

# Install CLIs
RUN npm install -g @anthropic-ai/codex
RUN npm install -g @google/gemini-cli

# Copy application
COPY . /app
WORKDIR /app

# Auto-detection will find CLIs in /usr/local/bin
CMD ["node", "dist/index.js"]
```

**config.json:**
```json
{
  "codex": { "cliPath": "auto" },
  "gemini": { "cliPath": "auto" }
}
```

## Best Practices

1. **Use "auto" for most cases**: Let the server detect CLI paths automatically
2. **Use environment variables for custom paths**: Override detection when needed
3. **Use explicit paths in Docker**: Ensure predictable behavior in containers
4. **Enable debug logging for troubleshooting**: See exactly what's being detected
5. **Test detection on target platform**: Verify detection works before deployment

## Troubleshooting

### CLI Not Detected

**Problem:** `source: "default", exists: false`

**Solutions:**
1. Install CLI: `npm install -g @anthropic-ai/codex`
2. Set environment variable: `export CODEX_CLI_PATH=/path/to/cli`
3. Add to PATH: `export PATH="$PATH:/cli/directory"`
4. Use explicit config: `"cliPath": "/absolute/path/to/cli"`

### Wrong CLI Detected

**Problem:** Detects old version or wrong installation

**Solution:** Override with environment variable or explicit path
```bash
export CODEX_CLI_PATH="/path/to/correct/codex"
```

### Permission Denied

**Problem:** CLI found but not executable

**Solution:** Fix permissions
```bash
chmod +x /path/to/cli
```

## Summary

The CLI auto-detection system provides:

[x] **Zero Configuration**: Works out of the box
[x] **Cross-Platform**: Windows, macOS, Linux
[x] **Flexible**: Multiple configuration options
[x] **Debuggable**: Clear logging and error messages
[x] **Secure**: Path validation and whitelisting
[x] **Reliable**: Falls back gracefully when CLIs not found

For most users, simply setting `"cliPath": "auto"` is sufficient!
