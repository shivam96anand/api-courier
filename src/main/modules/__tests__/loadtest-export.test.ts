import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('electron', async () => import('../../../__mocks__/electron'));

vi.mock('fs', () => ({
  promises: {
    writeFile: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../loadtest-engine', () => ({
  loadTestEngine: {
    getSamples: vi.fn(),
    getRunConfig: vi.fn(),
  },
}));

import { dialog } from 'electron';
import { promises as fs } from 'fs';
import { loadTestEngine } from '../loadtest-engine';
import { loadTestExporter } from '../loadtest-export';
import {
  LoadTestSummary,
  LoadTestConfig,
  LoadSample,
} from '../../../shared/types';

function createSamples(): LoadSample[] {
  return [
    { t0: 1700000000000, durationMs: 50, status: 200, bytes: 100 },
    { t0: 1700000001000, durationMs: 120, status: 200, bytes: 200 },
    { t0: 1700000002000, durationMs: 30, status: 500, error: 'Server error' },
  ];
}

function createConfig(): LoadTestConfig {
  return {
    rpm: 60,
    durationSec: 10,
    target: {
      kind: 'adhoc',
      method: 'GET',
      url: 'https://api.example.com/test',
    },
  };
}

function createSummary(): LoadTestSummary {
  return {
    runId: 'test-run-id',
    totalPlanned: 10,
    sent: 10,
    completed: 10,
    success: 8,
    error: 2,
    codeCounts: { '200': 8, '500': 2 },
    minMs: 20,
    maxMs: 200,
    avgMs: 80,
    p50: 70,
    p95: 180,
    p99: 195,
    throughputRps: 1.0,
    wallTimeMs: 10000,
    startedAt: 1700000000000,
    finishedAt: 1700000010000,
  };
}

describe('loadtest-export.ts', () => {
  const exporter = loadTestExporter;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('exportCsv', () => {
    it('returns error when run not found', async () => {
      vi.mocked(loadTestEngine.getSamples).mockReturnValue([]);
      vi.mocked(loadTestEngine.getRunConfig).mockReturnValue(null);

      const result = await exporter.exportCsv('unknown-run');
      expect(result.ok).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('returns error when dialog is cancelled', async () => {
      vi.mocked(loadTestEngine.getSamples).mockReturnValue(createSamples());
      vi.mocked(loadTestEngine.getRunConfig).mockReturnValue(createConfig());
      vi.mocked(dialog.showSaveDialog).mockResolvedValue({
        canceled: true,
        filePath: '',
      });

      const result = await exporter.exportCsv('test-run');
      expect(result.ok).toBe(false);
      expect(result.error).toContain('cancelled');
    });

    it('generates CSV and writes to file on success', async () => {
      vi.mocked(loadTestEngine.getSamples).mockReturnValue(createSamples());
      vi.mocked(loadTestEngine.getRunConfig).mockReturnValue(createConfig());
      vi.mocked(dialog.showSaveDialog).mockResolvedValue({
        canceled: false,
        filePath: '/tmp/test-export.csv',
      });
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await exporter.exportCsv('test-run');
      expect(result.ok).toBe(true);
      expect(fs.writeFile).toHaveBeenCalledWith(
        '/tmp/test-export.csv',
        expect.stringContaining(
          'runId,timestamp_iso,method,url,status,duration_ms,bytes,error'
        ),
        'utf-8'
      );
    });

    it('CSV content contains correct data rows', async () => {
      vi.mocked(loadTestEngine.getSamples).mockReturnValue(createSamples());
      vi.mocked(loadTestEngine.getRunConfig).mockReturnValue(createConfig());
      vi.mocked(dialog.showSaveDialog).mockResolvedValue({
        canceled: false,
        filePath: '/tmp/test.csv',
      });
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await exporter.exportCsv('test-run');

      const writtenContent = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
      const lines = writtenContent.split('\n');
      // Header + 3 data rows
      expect(lines.length).toBe(4);
      // First data row should contain method and url
      expect(lines[1]).toContain('GET');
      expect(lines[1]).toContain('https://api.example.com/test');
      expect(lines[1]).toContain('200');
      // Error row should contain escaped error string
      expect(lines[3]).toContain('Server error');
    });
  });

  describe('exportPdf', () => {
    it('returns error when run config not found', async () => {
      vi.mocked(loadTestEngine.getRunConfig).mockReturnValue(null);

      const result = await exporter.exportPdf('unknown-run', createSummary());
      expect(result.ok).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('returns error when dialog is cancelled', async () => {
      vi.mocked(loadTestEngine.getRunConfig).mockReturnValue(createConfig());
      vi.mocked(dialog.showSaveDialog).mockResolvedValue({
        canceled: true,
        filePath: '',
      });

      const result = await exporter.exportPdf('test-run', createSummary());
      expect(result.ok).toBe(false);
      expect(result.error).toContain('cancelled');
    });

    it('generates PDF using offscreen BrowserWindow', async () => {
      vi.mocked(loadTestEngine.getRunConfig).mockReturnValue(createConfig());
      vi.mocked(dialog.showSaveDialog).mockResolvedValue({
        canceled: false,
        filePath: '/tmp/test-summary.pdf',
      });
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await exporter.exportPdf('test-run', createSummary());
      expect(result.ok).toBe(true);

      // Verify file was written
      expect(fs.writeFile).toHaveBeenCalledWith(
        '/tmp/test-summary.pdf',
        expect.anything()
      );
    });
  });
});
