#!/usr/bin/env node

/**
 * AI Code Agent MCP Server
 * Entry point for the MCP server
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { ConfigManager } from './core/config.js';
import { Logger } from './core/logger.js';
import { AnalysisAggregator } from './services/aggregator/merger.js';
import { CodexAnalysisService } from './services/codex/client.js';
import { GeminiAnalysisService } from './services/gemini/client.js';
import { ToolRegistry } from './tools/registry.js';

/**
 * Main entry point
 */
async function main() {
  let logger: Logger | undefined;

  try {
    // Load configuration
    const config = await ConfigManager.load();

    // Use server.logLevel (priority) or logging.level for logger initialization
    logger = Logger.create({
      level: config.server.logLevel || config.logging.level,
      pretty: config.logging.pretty,
      file: config.logging.file,
    });

    logger.info({ version: config.server.version }, 'Starting AI Code Agent MCP Server');

    // Create MCP server using high-level API (automatically handles capabilities)
    const server = new McpServer({
      name: config.server.name,
      version: config.server.version,
    });

    // Initialize services
    const codexService = config.codex.enabled
      ? new CodexAnalysisService(config.codex, logger)
      : null;

    const geminiService = config.gemini.enabled
      ? new GeminiAnalysisService(config.gemini, logger)
      : null;

    const aggregator = new AnalysisAggregator(config.analysis, logger);

    // Register tools
    const registry = new ToolRegistry(server, {
      codexService,
      geminiService,
      aggregator,
      logger,
      config,
    });

    registry.registerTools();

    // Setup transport
    const transport = new StdioServerTransport();
    await server.connect(transport);

    logger.info('Code Review MCP Server started successfully');

    // Handle graceful shutdown
    const shutdown = async () => {
      logger?.info('Shutting down Code Review MCP Server');
      await server.close();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (error) {
    if (logger) {
      logger.error({ error }, 'Failed to start Code Review MCP Server');
    } else {
      console.error('Fatal error:', error);
    }
    process.exit(1);
  }
}

// Start server
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
