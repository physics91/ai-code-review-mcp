/**
 * Zod schemas for configuration
 */

import { z } from 'zod';

export const ServerConfigSchema = z.object({
  server: z.object({
    name: z.string().default('code-review-mcp'),
    version: z.string().default('1.0.4'),
    logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    transport: z.enum(['stdio', 'http']).default('stdio'),
  }),

  codex: z.object({
    enabled: z.boolean().default(true),
    cliPath: z.string().default('codex'),
    timeout: z.number().min(1000).max(300000).default(60000),
    retryAttempts: z.number().min(0).max(10).default(3),
    retryDelay: z.number().min(0).default(1000),
    maxConcurrent: z.number().min(1).max(10).default(1),
    model: z.string().nullable().default(null),
    args: z.array(z.string()).default([]),
  }),

  gemini: z.object({
    enabled: z.boolean().default(true),
    cliPath: z.string().default('/usr/local/bin/gemini'),
    timeout: z.number().min(1000).max(300000).default(60000),
    retryAttempts: z.number().min(0).max(10).default(3),
    retryDelay: z.number().min(0).default(1000),
    maxConcurrent: z.number().min(1).max(10).default(1),
    model: z.string().nullable().default(null),
    args: z.array(z.string()).default([]),
  }),

  review: z.object({
    maxCodeLength: z.number().min(100).max(1000000).default(50000),
    includeContext: z.boolean().default(true),
    defaultLanguage: z.string().nullable().default(null),
    formats: z.array(z.enum(['markdown', 'json', 'html'])).default(['markdown', 'json']),
    defaultSeverity: z.enum(['all', 'high', 'medium']).default('all'),
    deduplication: z.object({
      enabled: z.boolean().default(true),
      similarityThreshold: z.number().min(0).max(1).default(0.8),
    }),
  }),

  retry: z.object({
    maxAttempts: z.number().min(0).max(10).default(3),
    initialDelay: z.number().min(0).default(1000),
    maxDelay: z.number().min(0).default(10000),
    backoffFactor: z.number().min(1).default(2),
    retryableErrors: z.array(z.string()).default(['TIMEOUT_ERROR', 'NETWORK_ERROR', 'CLI_EXECUTION_ERROR']),
  }),

  logging: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    pretty: z.boolean().default(true),
    file: z.object({
      enabled: z.boolean().default(false),
      path: z.string().default('./logs/code-review-mcp.log'),
      maxSize: z.string().default('10M'),
      maxFiles: z.number().default(5),
    }),
  }),

  cache: z.object({
    enabled: z.boolean().default(false),
    ttl: z.number().min(0).default(3600000),
    maxSize: z.number().min(0).default(100),
  }),
});

export type ServerConfig = z.infer<typeof ServerConfigSchema>;
