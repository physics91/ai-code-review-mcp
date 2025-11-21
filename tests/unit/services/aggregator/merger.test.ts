/**
 * Unit tests for AnalysisAggregator
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnalysisAggregator } from '../../../../src/services/aggregator/merger.js';
import { Logger } from '../../../../src/core/logger.js';
import type { AnalysisResult } from '../../../../src/schemas/tools.js';

describe('AnalysisAggregator', () => {
  let aggregator: AnalysisAggregator;
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as unknown as Logger;

    aggregator = new AnalysisAggregator(
      {
        deduplication: {
          enabled: true,
          similarityThreshold: 0.8,
        },
      },
      mockLogger
    );
  });

  describe('mergeAnalyses', () => {
    it('should merge analyses from multiple sources', () => {
      const codexAnalysis: AnalysisResult = {
        success: true,
        analysisId: '1',
        timestamp: new Date().toISOString(),
        source: 'codex',
        summary: { totalFindings: 1, critical: 0, high: 1, medium: 0, low: 0 },
        findings: [
          {
            type: 'bug',
            severity: 'high',
            line: 10,
            title: 'Null pointer',
            description: 'Variable might be null',
          },
        ],
        overallAssessment: 'Has issues',
        metadata: { linesOfCode: 10, analysisDuration: 100 },
      };

      const geminiAnalysis: AnalysisResult = {
        success: true,
        analysisId: '2',
        timestamp: new Date().toISOString(),
        source: 'gemini',
        summary: { totalFindings: 1, critical: 0, high: 0, medium: 1, low: 0 },
        findings: [
          {
            type: 'performance',
            severity: 'medium',
            line: 20,
            title: 'Inefficient loop',
            description: 'Could be optimized',
          },
        ],
        overallAssessment: 'Some issues',
        metadata: { linesOfCode: 10, analysisDuration: 150 },
      };

      const result = aggregator.mergeAnalyses([codexAnalysis, geminiAnalysis]);

      expect(result.success).toBe(true);
      expect(result.source).toBe('combined');
      expect(result.findings).toHaveLength(2);
      expect(result.summary.totalFindings).toBe(2);
      expect(result.summary.high).toBe(1);
      expect(result.summary.medium).toBe(1);
    });

    it('should deduplicate identical findings', () => {
      const finding = {
        type: 'bug' as const,
        severity: 'high' as const,
        line: 10,
        title: 'Null pointer exception',
        description: 'Variable might be null',
      };

      const codexAnalysis: AnalysisResult = {
        success: true,
        analysisId: '1',
        timestamp: new Date().toISOString(),
        source: 'codex',
        summary: { totalFindings: 1, critical: 0, high: 1, medium: 0, low: 0 },
        findings: [finding],
        overallAssessment: 'Has issues',
        metadata: { linesOfCode: 10, analysisDuration: 100 },
      };

      const geminiAnalysis: AnalysisResult = {
        success: true,
        analysisId: '2',
        timestamp: new Date().toISOString(),
        source: 'gemini',
        summary: { totalFindings: 1, critical: 0, high: 1, medium: 0, low: 0 },
        findings: [finding],
        overallAssessment: 'Has issues',
        metadata: { linesOfCode: 10, analysisDuration: 150 },
      };

      const result = aggregator.mergeAnalyses([codexAnalysis, geminiAnalysis]);

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].sources).toContain('codex');
      expect(result.findings[0].sources).toContain('gemini');
      expect(result.findings[0].confidence).toBe('high');
    });

    it('should calculate consensus correctly', () => {
      const codexAnalysis: AnalysisResult = {
        success: true,
        analysisId: '1',
        timestamp: new Date().toISOString(),
        source: 'codex',
        summary: { totalFindings: 2, critical: 0, high: 2, medium: 0, low: 0 },
        findings: [
          {
            type: 'bug',
            severity: 'high',
            line: 10,
            title: 'Bug 1',
            description: 'Description',
          },
          {
            type: 'bug',
            severity: 'high',
            line: 20,
            title: 'Bug 2',
            description: 'Description',
          },
        ],
        overallAssessment: 'Has issues',
        metadata: { linesOfCode: 10, analysisDuration: 100 },
      };

      const geminiAnalysis: AnalysisResult = {
        success: true,
        analysisId: '2',
        timestamp: new Date().toISOString(),
        source: 'gemini',
        summary: { totalFindings: 1, critical: 0, high: 1, medium: 0, low: 0 },
        findings: [
          {
            type: 'bug',
            severity: 'high',
            line: 10,
            title: 'Bug 1',
            description: 'Description',
          },
        ],
        overallAssessment: 'Has issues',
        metadata: { linesOfCode: 10, analysisDuration: 150 },
      };

      const result = aggregator.mergeAnalyses([codexAnalysis, geminiAnalysis]);

      // One finding agreed upon by both (high confidence)
      // One finding only from Codex (low confidence)
      const highConfidenceCount = result.findings.filter((f) => f.confidence === 'high').length;
      expect(highConfidenceCount).toBe(1);
      expect(result.summary.consensus).toBeGreaterThan(0);
    });

    it('should sort findings by severity', () => {
      const codexAnalysis: AnalysisResult = {
        success: true,
        analysisId: '1',
        timestamp: new Date().toISOString(),
        source: 'codex',
        summary: { totalFindings: 3, critical: 1, high: 1, medium: 0, low: 1 },
        findings: [
          { type: 'style', severity: 'low', line: 1, title: 'Low', description: 'Low' },
          { type: 'bug', severity: 'critical', line: 2, title: 'Critical', description: 'Critical' },
          { type: 'security', severity: 'high', line: 3, title: 'High', description: 'High' },
        ],
        overallAssessment: 'Mixed',
        metadata: { linesOfCode: 10, analysisDuration: 100 },
      };

      const result = aggregator.mergeAnalyses([codexAnalysis]);

      expect(result.findings[0].severity).toBe('critical');
      expect(result.findings[1].severity).toBe('high');
      expect(result.findings[2].severity).toBe('low');
    });

    it('should merge recommendations', () => {
      const codexAnalysis: AnalysisResult = {
        success: true,
        analysisId: '1',
        timestamp: new Date().toISOString(),
        source: 'codex',
        summary: { totalFindings: 0, critical: 0, high: 0, medium: 0, low: 0 },
        findings: [],
        overallAssessment: 'Good',
        recommendations: ['Use const instead of var', 'Add error handling'],
        metadata: { linesOfCode: 10, analysisDuration: 100 },
      };

      const geminiAnalysis: AnalysisResult = {
        success: true,
        analysisId: '2',
        timestamp: new Date().toISOString(),
        source: 'gemini',
        summary: { totalFindings: 0, critical: 0, high: 0, medium: 0, low: 0 },
        findings: [],
        overallAssessment: 'Good',
        recommendations: ['Add error handling', 'Use TypeScript'],
        metadata: { linesOfCode: 10, analysisDuration: 150 },
      };

      const result = aggregator.mergeAnalyses([codexAnalysis, geminiAnalysis]);

      expect(result.recommendations).toBeDefined();
      expect(result.recommendations!.length).toBeGreaterThan(0);
      // Should deduplicate 'Add error handling'
    });
  });
});
