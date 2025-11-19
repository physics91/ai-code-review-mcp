# Local MCP Development Setup for Claude Code

## Setup Instructions

This project includes a `.mcp.json` configuration file for local development with Claude Code on Windows.

### Method 1: Using Claude Code CLI (Recommended)

```bash
# Navigate to project directory
cd E:\ai-dev\code-review-mcp

# Build the project first
npm run build

# Add the local MCP server (project-scoped)
claude mcp add --transport stdio code-review-mcp-local -- node E:\ai-dev\code-review-mcp\dist\index.js
```

### Method 2: Manual .mcp.json Configuration

The `.mcp.json` file is already created in the project root:

```json
{
  "mcpServers": {
    "code-review-mcp-local": {
      "type": "stdio",
      "command": "node",
      "args": ["E:\\ai-dev\\code-review-mcp\\dist\\index.js"],
      "env": {
        "NODE_ENV": "development"
      }
    }
  }
}
```

Claude Code will automatically detect this file when you work in this directory.

## Development Workflow

1. Make changes to the source code
2. Build the project:
   ```bash
   npm run build
   ```
3. Restart Claude Code or reload the MCP server
4. Test using the MCP tools in Claude Code

## Viewing Debug Logs

Console.log output from the MCP server will appear in:
- **Windows**: `%USERPROFILE%\AppData\Local\claude-cli-nodejs\Cache\{project-name}\code-review-mcp-local\`

Or check the MCP server logs directly by running:
```bash
node dist/index.js
```

## Available MCP Tools

- `review_code_with_codex` - Review code using Codex CLI
- `review_code_with_gemini` - Review code using Gemini CLI
- `review_code_combined` - Review code using both CLIs and aggregate results
- `get_review_status` - Get status of an async review

## Testing Changes

After building, you can test the MCP server directly:
```bash
# Test that the server starts
node dist/index.js

# The server should output available tools and wait for stdin
```
