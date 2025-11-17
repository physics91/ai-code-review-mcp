# CLI Path Auto-Detection Implementation

**Date**: 2025-11-17
**Status**: ✅ Complete
**Tests**: 60/60 Passing

## Overview

Implemented automatic CLI path detection for both Codex and Gemini CLIs across all platforms (Windows, macOS, Linux). The system automatically detects CLI installations without requiring manual configuration.

## Implementation Summary

### 1. Core CLI Detector (`src/core/cli-detector.ts`)

Created a comprehensive CLI path detection utility with the following features:

#### Detection Priority Order
1. **Environment Variables** (highest priority)
   - `CODEX_CLI_PATH`
   - `GEMINI_CLI_PATH`

2. **Config File Path** (if not 'auto')
   - Security validation for safe paths only

3. **Platform-Specific Default Paths**
   - macOS/Linux: `/usr/local/bin`, `/usr/bin`, `/opt`, `~/.local/bin`, Homebrew paths
   - Windows: `%APPDATA%\npm`, `C:\Program Files`, Google directories

4. **System PATH Search**
   - Unix: `which` command
   - Windows: `where` command

5. **Fallback**
   - Command name (assumes in PATH)

#### Key Functions

```typescript
export async function detectCodexCLIPath(
  configPath?: string,
  logger?: Logger
): Promise<CLIDetectionResult>

export async function detectGeminiCLIPath(
  configPath?: string,
  logger?: Logger
): Promise<CLIDetectionResult>

export async function detectCLIPath(
  cliName: 'codex' | 'gemini',
  configPath?: string,
  logger?: Logger
): Promise<CLIDetectionResult>
```

#### Detection Result

```typescript
interface CLIDetectionResult {
  path: string;              // Detected CLI path
  source: CLIDetectionSource; // 'env' | 'config' | 'detected' | 'which' | 'default'
  exists?: boolean;          // Whether the path exists on filesystem
  resolvedPath?: string;     // Resolved absolute path (for PATH executables)
}
```

### 2. Codex Client Update (`src/services/codex/client.ts`)

Enhanced `CodexReviewService` with:

- Added `detectedCLIPath` and `cliDetectionResult` properties
- Implemented `initializeCLIPath()` method for auto-detection
- Updated constructor to trigger detection when `cliPath === 'auto'`
- Updated `reviewCode()` to ensure CLI path is initialized before execution
- Added detected paths to security whitelist automatically
- Comprehensive logging of detection results

### 3. Gemini Client Update (`src/services/gemini/client.ts`)

Enhanced `GeminiReviewService` with:

- Same enhancements as Codex client
- Platform-specific Google directory paths (Windows)
- Consistent detection behavior across both services

### 4. Configuration Update (`config/default.json`)

Changed default CLI paths to enable auto-detection:

```json
{
  "codex": {
    "cliPath": "auto"  // Changed from "codex"
  },
  "gemini": {
    "cliPath": "auto"  // Changed from "/usr/local/bin/gemini"
  }
}
```

### 5. Comprehensive Test Suite (`tests/unit/core/cli-detector.test.ts`)

Created 26 comprehensive tests covering:

- Environment variable detection
- Config path usage
- Security validation
- Platform-specific path detection
- `which`/`where` fallback
- Default fallback behavior
- Priority order validation
- Error handling
- Platform-specific scenarios (macOS Homebrew, Windows NPM, etc.)

**Test Results**: ✅ All 26 tests passing

### 6. Documentation (`README.md`)

Added comprehensive documentation section covering:

- Detection priority order
- Configuration options (4 different approaches)
- Platform-specific paths
- Detection logs and debugging
- Environment variable usage
- Security considerations

## Platform-Specific Paths

### macOS / Linux

```
/usr/local/bin/{cli}
/usr/bin/{cli}
/opt/{cli}/bin/{cli}
~/.local/bin/{cli}
/opt/homebrew/bin/{cli}        # Homebrew (Apple Silicon)
/usr/local/opt/{cli}/bin/{cli} # Homebrew (Intel)
```

### Windows

```
%APPDATA%\npm\{cli}.cmd
C:\Program Files\{cli}\{cli}.exe
C:\Program Files (x86)\{cli}\{cli}.exe
C:\Program Files\Google\Gemini\gemini.exe  # Gemini only
```

## Usage Examples

### 1. Auto-Detection (Recommended)

```json
{
  "codex": { "cliPath": "auto" },
  "gemini": { "cliPath": "auto" }
}
```

### 2. Environment Variables

```bash
export CODEX_CLI_PATH="/custom/path/codex"
export GEMINI_CLI_PATH="/opt/google/gemini/gemini"
```

### 3. Explicit Path

```json
{
  "codex": { "cliPath": "/usr/local/bin/codex" },
  "gemini": { "cliPath": "/opt/gemini/bin/gemini" }
}
```

### 4. System PATH

```json
{
  "codex": { "cliPath": "codex" },
  "gemini": { "cliPath": "gemini" }
}
```

## Detection Logs

The server logs detailed information about CLI path detection:

```
[INFO] Codex CLI path detected {
  path: "/usr/local/bin/codex",
  source: "detected",
  exists: true,
  platform: "darwin"
}
```

Detection sources indicate where the path was found:
- `env` - Environment variable
- `config` - Configuration file
- `detected` - Auto-detected from platform paths
- `which` - Found via `which`/`where` command
- `default` - Fallback (may fail if not in PATH)

## Security Features

### Path Validation

Only safe paths are accepted from configuration:

- Simple command names: `codex`, `codex.cmd`, `gemini`, `gemini.cmd`
- System directories: `/usr/local/bin/`, `/usr/bin/`, `/opt/`
- Program Files: `C:\Program Files\`

Unsafe paths (e.g., `/tmp/`, `../../../`) are rejected and trigger fallback to auto-detection.

### Whitelist Management

- All detected paths are automatically added to the security whitelist
- Resolved paths (from `which`/`where`) are also whitelisted
- Prevents path manipulation attacks

## Testing

### Test Coverage

- **26 CLI detector tests**: All passing ✅
- **60 total tests**: All passing ✅
- Coverage includes:
  - Detection logic
  - Priority order
  - Security validation
  - Platform-specific behavior
  - Error handling

### Running Tests

```bash
# All tests
npm test

# CLI detector tests only
npm test tests/unit/core/cli-detector.test.ts
```

## Migration Guide

### For Existing Users

1. **No changes required** if using default configuration
2. **Optional**: Update `config.json` to use `"auto"` for automatic detection
3. **Optional**: Remove hardcoded CLI paths from environment variables

### For New Users

1. Install CLIs (Codex, Gemini)
2. Use default configuration with `"cliPath": "auto"`
3. Server automatically detects CLI locations
4. Override with environment variables if needed

## Benefits

✅ **Zero Configuration**: Works out of the box on all platforms
✅ **Cross-Platform**: Consistent behavior on Windows, macOS, Linux
✅ **Secure**: Validates paths and prevents malicious configurations
✅ **Flexible**: Multiple configuration options for different use cases
✅ **Debuggable**: Detailed logging of detection process
✅ **Tested**: Comprehensive test coverage (26 tests)
✅ **Documented**: Clear documentation and examples

## Files Modified

1. ✅ `src/core/cli-detector.ts` (new file, 474 lines)
2. ✅ `src/services/codex/client.ts` (enhanced)
3. ✅ `src/services/gemini/client.ts` (enhanced)
4. ✅ `config/default.json` (updated)
5. ✅ `tests/unit/core/cli-detector.test.ts` (new file, 542 lines)
6. ✅ `README.md` (enhanced with new section)

## Technical Details

### Detection Algorithm

```typescript
async function detectCLIPath(cliName: string): Promise<CLIDetectionResult> {
  // 1. Check environment variable
  if (process.env[`${cliName.toUpperCase()}_CLI_PATH`]) {
    return { path: envPath, source: 'env' };
  }

  // 2. Use config path if not 'auto'
  if (configPath && configPath !== 'auto' && isConfigPathSafe(configPath)) {
    return { path: configPath, source: 'config' };
  }

  // 3. Try platform-specific paths
  const defaultPaths = getDefaultCLIPaths(cliName);
  for (const path of defaultPaths) {
    if (existsSync(path)) {
      return { path, source: 'detected', exists: true };
    }
  }

  // 4. Try system PATH
  const pathResult = await findInPath(cliName);
  if (pathResult) {
    return { path: pathResult, source: 'which', exists: true };
  }

  // 5. Fallback
  return { path: cliName, source: 'default', exists: false };
}
```

### Platform Detection

```typescript
function getDefaultCLIPaths(cliName: string): string[] {
  const platform = process.platform;

  if (platform === 'win32') {
    return [
      `${process.env.APPDATA}\\npm\\${cliName}.cmd`,
      `C:\\Program Files\\${cliName}\\${cliName}.exe`,
      // ... more Windows paths
    ];
  } else {
    return [
      `/usr/local/bin/${cliName}`,
      `/usr/bin/${cliName}`,
      `/opt/${cliName}/bin/${cliName}`,
      // ... more Unix paths
    ];
  }
}
```

## Future Enhancements

Potential improvements for future versions:

1. **Cache Detection Results**: Cache successful detections to avoid repeated filesystem checks
2. **Custom Path Lists**: Allow users to specify additional search paths
3. **Version Detection**: Detect and log CLI versions
4. **Health Checks**: Verify CLIs are working by running `--version`
5. **Auto-Install**: Optionally install missing CLIs automatically
6. **Per-Request Override**: Allow per-request CLI path override (already supported in schema)

## Conclusion

The CLI path auto-detection implementation is **complete and production-ready**. It provides:

- ✅ Seamless cross-platform support
- ✅ Zero-configuration for most users
- ✅ Flexible configuration for advanced users
- ✅ Robust security validation
- ✅ Comprehensive test coverage
- ✅ Clear documentation

All 60 tests passing, including 26 new tests for CLI detection logic.
