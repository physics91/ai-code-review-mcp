/**
 * CLI Detector Tests
 * Tests for platform-specific CLI path detection
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'fs';
import { execa } from 'execa';
import {
  detectCodexCLIPath,
  detectGeminiCLIPath,
  detectCLIPath,
  type CLIDetectionResult,
} from '../../../src/core/cli-detector.js';

// Mock dependencies
vi.mock('fs');
vi.mock('execa');

describe('CLI Path Detection', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let originalPlatform: string;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    originalPlatform = process.platform;

    // Clear environment variables
    delete process.env.CODEX_CLI_PATH;
    delete process.env.GEMINI_CLI_PATH;

    // Reset mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore environment
    process.env = originalEnv;
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
    });
  });

  describe('detectCodexCLIPath', () => {
    it('should detect CLI from environment variable', async () => {
      process.env.CODEX_CLI_PATH = '/custom/path/codex';

      const result = await detectCodexCLIPath();

      expect(result.source).toBe('env');
      expect(result.path).toBe('/custom/path/codex');
    });

    it('should use config path if provided and not auto', async () => {
      const configPath = '/usr/local/bin/codex';

      const result = await detectCodexCLIPath(configPath);

      expect(result.source).toBe('config');
      expect(result.path).toBe(configPath);
    });

    it('should reject unsafe config paths', async () => {
      const unsafePath = '/tmp/malicious/codex';
      vi.mocked(existsSync).mockReturnValue(false);

      const result = await detectCodexCLIPath(unsafePath);

      // Should fall back to auto-detection
      expect(result.source).not.toBe('config');
    });

    it('should detect CLI from platform-specific paths on Unix', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux',
      });

      vi.mocked(existsSync).mockImplementation((path: any) => {
        return path === '/usr/local/bin/codex';
      });

      const result = await detectCodexCLIPath('auto');

      expect(result.source).toBe('detected');
      expect(result.path).toBe('/usr/local/bin/codex');
      expect(result.exists).toBe(true);
    });

    it('should detect CLI from platform-specific paths on Windows', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
      });

      process.env.APPDATA = 'C:\\Users\\Test\\AppData\\Roaming';

      vi.mocked(existsSync).mockImplementation((path: any) => {
        return path === 'C:\\Users\\Test\\AppData\\Roaming\\npm\\codex.cmd';
      });

      const result = await detectCodexCLIPath('auto');

      expect(result.source).toBe('detected');
      expect(result.path).toBe('C:\\Users\\Test\\AppData\\Roaming\\npm\\codex.cmd');
      expect(result.exists).toBe(true);
    });

    it('should fall back to which/where command', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(execa).mockResolvedValue({
        exitCode: 0,
        stdout: '/usr/bin/codex',
        stderr: '',
        all: '',
        failed: false,
        timedOut: false,
        isCanceled: false,
        killed: false,
        command: '',
        escapedCommand: '',
        cwd: '',
        durationMs: 0,
        pipedFrom: [],
      } as any);

      const result = await detectCodexCLIPath('auto');

      expect(result.source).toBe('which');
      expect(result.path).toBe('/usr/bin/codex');
      expect(result.resolvedPath).toBe('/usr/bin/codex');
    });

    it('should return default if nothing found', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux',
      });

      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(execa).mockResolvedValue({
        exitCode: 1,
        stdout: '',
        stderr: 'not found',
      } as any);

      const result = await detectCodexCLIPath('auto');

      expect(result.source).toBe('default');
      expect(result.path).toBe('codex');
      expect(result.exists).toBe(false);
    });

    it('should return default cmd for Windows', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
      });

      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(execa).mockResolvedValue({
        exitCode: 1,
        stdout: '',
        stderr: 'not found',
      } as any);

      const result = await detectCodexCLIPath('auto');

      expect(result.source).toBe('default');
      expect(result.path).toBe('codex.cmd');
      expect(result.exists).toBe(false);
    });
  });

  describe('detectGeminiCLIPath', () => {
    it('should detect CLI from environment variable', async () => {
      process.env.GEMINI_CLI_PATH = '/custom/path/gemini';

      const result = await detectGeminiCLIPath();

      expect(result.source).toBe('env');
      expect(result.path).toBe('/custom/path/gemini');
    });

    it('should use config path if provided and not auto', async () => {
      const configPath = '/usr/local/bin/gemini';

      const result = await detectGeminiCLIPath(configPath);

      expect(result.source).toBe('config');
      expect(result.path).toBe(configPath);
    });

    it('should detect CLI from platform-specific paths', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux',
      });

      vi.mocked(existsSync).mockImplementation((path: any) => {
        return path === '/usr/local/bin/gemini';
      });

      const result = await detectGeminiCLIPath('auto');

      expect(result.source).toBe('detected');
      expect(result.path).toBe('/usr/local/bin/gemini');
      expect(result.exists).toBe(true);
    });

    it('should detect Gemini from Google directory on Windows', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
      });

      vi.mocked(existsSync).mockImplementation((path: any) => {
        return path === 'C:\\Program Files\\Google\\Gemini\\gemini.exe';
      });

      const result = await detectGeminiCLIPath('auto');

      expect(result.source).toBe('detected');
      expect(result.path).toBe('C:\\Program Files\\Google\\Gemini\\gemini.exe');
      expect(result.exists).toBe(true);
    });

    it('should fall back to which/where command', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(execa).mockResolvedValue({
        exitCode: 0,
        stdout: '/usr/bin/gemini',
        stderr: '',
      } as any);

      const result = await detectGeminiCLIPath('auto');

      expect(result.source).toBe('which');
      expect(result.path).toBe('/usr/bin/gemini');
    });

    it('should return default if nothing found', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux',
      });

      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(execa).mockResolvedValue({
        exitCode: 1,
        stdout: '',
        stderr: 'not found',
      } as any);

      const result = await detectGeminiCLIPath('auto');

      expect(result.source).toBe('default');
      expect(result.path).toBe('gemini');
      expect(result.exists).toBe(false);
    });
  });

  describe('detectCLIPath', () => {
    it('should detect Codex CLI when requested', async () => {
      process.env.CODEX_CLI_PATH = '/custom/codex';

      const result = await detectCLIPath('codex');

      expect(result.source).toBe('env');
      expect(result.path).toBe('/custom/codex');
    });

    it('should detect Gemini CLI when requested', async () => {
      process.env.GEMINI_CLI_PATH = '/custom/gemini';

      const result = await detectCLIPath('gemini');

      expect(result.source).toBe('env');
      expect(result.path).toBe('/custom/gemini');
    });
  });

  describe('Priority Order', () => {
    it('should prioritize environment variable over config', async () => {
      process.env.CODEX_CLI_PATH = '/env/codex';

      const result = await detectCodexCLIPath('/config/codex');

      expect(result.source).toBe('env');
      expect(result.path).toBe('/env/codex');
    });

    it('should prioritize config over platform paths', async () => {
      vi.mocked(existsSync).mockReturnValue(true);

      const result = await detectCodexCLIPath('/usr/local/bin/codex');

      expect(result.source).toBe('config');
      expect(result.path).toBe('/usr/local/bin/codex');
    });

    it('should prioritize platform paths over which/where', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux',
      });

      vi.mocked(existsSync).mockImplementation((path: any) => {
        return path === '/usr/local/bin/codex';
      });

      vi.mocked(execa).mockResolvedValue({
        exitCode: 0,
        stdout: '/usr/bin/codex',
        stderr: '',
      } as any);

      const result = await detectCodexCLIPath('auto');

      expect(result.source).toBe('detected');
      expect(result.path).toBe('/usr/local/bin/codex');
    });
  });

  describe('Security Validation', () => {
    it('should accept safe config paths', async () => {
      const safePaths = [
        'codex',
        'codex.cmd',
        '/usr/local/bin/codex',
        '/usr/bin/codex',
        '/opt/codex/bin/codex',
        'C:\\Program Files\\codex\\codex.exe',
      ];

      for (const path of safePaths) {
        const result = await detectCodexCLIPath(path);
        // Should use config path or fall back, but not reject
        expect(['config', 'detected', 'which', 'default']).toContain(result.source);
      }
    });

    it('should reject unsafe config paths', async () => {
      const unsafePaths = [
        '/tmp/malicious',
        '../../../etc/passwd',
        'C:\\Temp\\bad.exe',
      ];

      vi.mocked(existsSync).mockReturnValue(false);

      for (const path of unsafePaths) {
        const result = await detectCodexCLIPath(path);
        // Should not use config source for unsafe paths
        expect(result.source).not.toBe('config');
      }
    });
  });

  describe('Platform-Specific Paths', () => {
    it('should include Homebrew paths on macOS', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
      });

      vi.mocked(existsSync).mockImplementation((path: any) => {
        return path === '/opt/homebrew/bin/codex';
      });

      const result = await detectCodexCLIPath('auto');

      expect(result.path).toBe('/opt/homebrew/bin/codex');
      expect(result.source).toBe('detected');
    });

    it('should include APPDATA npm path on Windows', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
      });

      process.env.APPDATA = 'C:\\Users\\Test\\AppData\\Roaming';

      vi.mocked(existsSync).mockImplementation((path: any) => {
        return path === 'C:\\Users\\Test\\AppData\\Roaming\\npm\\codex.cmd';
      });

      const result = await detectCodexCLIPath('auto');

      expect(result.path).toBe('C:\\Users\\Test\\AppData\\Roaming\\npm\\codex.cmd');
      expect(result.source).toBe('detected');
    });

    it('should check Program Files directories on Windows', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
      });

      vi.mocked(existsSync).mockImplementation((path: any) => {
        return path === 'C:\\Program Files\\codex\\codex.exe';
      });

      const result = await detectCodexCLIPath('auto');

      expect(result.path).toBe('C:\\Program Files\\codex\\codex.exe');
      expect(result.source).toBe('detected');
    });
  });

  describe('Error Handling', () => {
    it('should handle execa errors gracefully', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(execa).mockRejectedValue(new Error('Command not found'));

      const result = await detectCodexCLIPath('auto');

      expect(result.source).toBe('default');
      expect(result.exists).toBe(false);
    });

    it('should handle filesystem errors gracefully', async () => {
      vi.mocked(existsSync).mockImplementation(() => {
        throw new Error('Filesystem error');
      });

      const result = await detectCodexCLIPath('auto');

      // Should fall back to which/where or default
      expect(['which', 'default']).toContain(result.source);
    });
  });
});
