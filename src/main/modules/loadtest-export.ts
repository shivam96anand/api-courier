import { dialog, BrowserWindow } from 'electron';
import { promises as fs } from 'fs';
import { join } from 'path';
import { loadTestEngine } from './loadtest-engine';
import { LoadTestSummary, LoadSample, LoadTestConfig } from '../../shared/types';

interface ExportResult {
  ok: boolean;
  error?: string;
}

class LoadTestExporter {
  async exportCsv(runId: string): Promise<ExportResult> {
    try {
      const samples = loadTestEngine.getSamples(runId);
      const config = loadTestEngine.getRunConfig(runId);

      if (!samples || !config) {
        return { ok: false, error: 'Run not found or expired' };
      }

      // Show save dialog
      const result = await dialog.showSaveDialog({
        title: 'Export Load Test Results as CSV',
        defaultPath: `loadtest-${runId}.csv`,
        filters: [
          { name: 'CSV Files', extensions: ['csv'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });

      if (result.canceled || !result.filePath) {
        return { ok: false, error: 'Export cancelled' };
      }

      // Generate CSV content
      const csvContent = this.generateCsvContent(samples, config, runId);

      // Write file
      await fs.writeFile(result.filePath, csvContent, 'utf-8');

      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Export failed'
      };
    }
  }

  async exportPdf(runId: string, summary: LoadTestSummary): Promise<ExportResult> {
    try {
      const config = loadTestEngine.getRunConfig(runId);

      if (!config) {
        return { ok: false, error: 'Run not found or expired' };
      }

      // Show save dialog
      const result = await dialog.showSaveDialog({
        title: 'Export Load Test Summary as PDF',
        defaultPath: `loadtest-summary-${runId}.pdf`,
        filters: [
          { name: 'PDF Files', extensions: ['pdf'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });

      if (result.canceled || !result.filePath) {
        return { ok: false, error: 'Export cancelled' };
      }

      // Create offscreen window for PDF generation
      const offscreenWindow = new BrowserWindow({
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        }
      });

      // Generate HTML content
      const htmlContent = this.generatePdfHtml(summary, config, runId);

      // Load HTML content
      await offscreenWindow.loadURL(`data:text/html,${encodeURIComponent(htmlContent)}`);

      // Generate PDF
      const pdfBuffer = await offscreenWindow.webContents.printToPDF({
        printBackground: true,
      });

      // Clean up
      offscreenWindow.destroy();

      // Write PDF file
      await fs.writeFile(result.filePath, pdfBuffer);

      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'PDF export failed'
      };
    }
  }

  private generateCsvContent(samples: LoadSample[], config: LoadTestConfig, runId: string): string {
    const headers = [
      'runId',
      'timestamp_iso',
      'method',
      'url',
      'status',
      'duration_ms',
      'bytes',
      'error'
    ];

    const rows = samples.map(sample => {
      const timestamp = new Date(sample.t0).toISOString();
      const method = config.target.kind === 'adhoc' ? config.target.method : 'N/A';
      const url = config.target.kind === 'adhoc' ? config.target.url : 'Collection Request';
      const status = sample.status?.toString() || '';
      const durationMs = sample.durationMs.toString();
      const bytes = sample.bytes?.toString() || '';
      const error = sample.error ? `"${sample.error.replace(/"/g, '""')}"` : '';

      return [
        runId,
        timestamp,
        method,
        url,
        status,
        durationMs,
        bytes,
        error
      ].join(',');
    });

    return [headers.join(','), ...rows].join('\n');
  }

  private generatePdfHtml(summary: LoadTestSummary, config: LoadTestConfig, runId: string): string {
    const startTime = new Date(summary.startedAt).toLocaleString();
    const endTime = new Date(summary.finishedAt).toLocaleString();
    const targetDescription = config.target.kind === 'adhoc'
      ? `${config.target.method} ${config.target.url}`
      : `Collection Request (ID: ${config.target.requestId})`;

    const successRate = summary.completed > 0
      ? ((summary.success / summary.completed) * 100).toFixed(1)
      : '0.0';

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Load Test Summary - ${runId}</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            font-size: 12px;
            margin: 40px;
            line-height: 1.4;
            color: #333;
        }

        .header {
            text-align: center;
            margin-bottom: 40px;
            border-bottom: 2px solid #e0e0e0;
            padding-bottom: 20px;
        }

        .header h1 {
            margin: 0;
            color: #2c3e50;
            font-size: 24px;
            font-weight: 600;
        }

        .header p {
            margin: 5px 0;
            color: #7f8c8d;
            font-size: 11px;
        }

        .section {
            margin-bottom: 30px;
        }

        .section h2 {
            color: #34495e;
            font-size: 16px;
            margin-bottom: 15px;
            border-left: 4px solid #3498db;
            padding-left: 10px;
        }

        .metrics-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 20px;
        }

        .metric-card {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 6px;
            border: 1px solid #e9ecef;
        }

        .metric-label {
            font-weight: 600;
            color: #495057;
            margin-bottom: 5px;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .metric-value {
            font-size: 18px;
            font-weight: 700;
            color: #2c3e50;
        }

        .status-codes {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 6px;
            border: 1px solid #e9ecef;
        }

        .status-codes h3 {
            margin-top: 0;
            margin-bottom: 10px;
            font-size: 13px;
            color: #495057;
        }

        .status-list {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
            gap: 8px;
        }

        .status-item {
            display: flex;
            justify-content: space-between;
            padding: 4px 8px;
            background: white;
            border-radius: 4px;
            font-size: 11px;
        }

        .config-info {
            background: #e8f4fd;
            padding: 15px;
            border-radius: 6px;
            border: 1px solid #bee5eb;
        }

        .config-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 5px;
            font-size: 11px;
        }

        .config-label {
            font-weight: 600;
            color: #495057;
        }

        .config-value {
            color: #6c757d;
            font-family: 'Courier New', monospace;
        }

        .footer {
            margin-top: 40px;
            text-align: center;
            font-size: 10px;
            color: #adb5bd;
            border-top: 1px solid #e9ecef;
            padding-top: 15px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Load Test Summary Report</h1>
        <p>Run ID: ${runId}</p>
        <p>Generated on ${new Date().toLocaleString()}</p>
    </div>

    <div class="section">
        <h2>Test Configuration</h2>
        <div class="config-info">
            <div class="config-row">
                <span class="config-label">Target:</span>
                <span class="config-value">${targetDescription}</span>
            </div>
            <div class="config-row">
                <span class="config-label">Rate:</span>
                <span class="config-value">${config.rpm} requests/minute</span>
            </div>
            <div class="config-row">
                <span class="config-label">Duration:</span>
                <span class="config-value">${config.durationSec} seconds</span>
            </div>
            <div class="config-row">
                <span class="config-label">Started:</span>
                <span class="config-value">${startTime}</span>
            </div>
            <div class="config-row">
                <span class="config-label">Finished:</span>
                <span class="config-value">${endTime}</span>
            </div>
        </div>
    </div>

    <div class="section">
        <h2>Performance Metrics</h2>
        <div class="metrics-grid">
            <div class="metric-card">
                <div class="metric-label">Total Planned</div>
                <div class="metric-value">${summary.totalPlanned.toLocaleString()}</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Completed</div>
                <div class="metric-value">${summary.completed.toLocaleString()}</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Success Rate</div>
                <div class="metric-value">${successRate}%</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Throughput</div>
                <div class="metric-value">${summary.throughputRps.toFixed(1)} RPS</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Average Latency</div>
                <div class="metric-value">${summary.avgMs.toFixed(0)}ms</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">P95 Latency</div>
                <div class="metric-value">${summary.p95.toFixed(0)}ms</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">P99 Latency</div>
                <div class="metric-value">${summary.p99.toFixed(0)}ms</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Max Latency</div>
                <div class="metric-value">${summary.maxMs.toFixed(0)}ms</div>
            </div>
        </div>
    </div>

    <div class="section">
        <h2>Response Status Codes</h2>
        <div class="status-codes">
            <div class="status-list">
                ${Object.entries(summary.codeCounts)
                  .map(([code, count]) => `
                    <div class="status-item">
                        <span>${code}</span>
                        <span>${count.toLocaleString()}</span>
                    </div>
                  `).join('')}
            </div>
        </div>
    </div>

    <div class="footer">
        <p>Generated by API Courier Load Testing</p>
    </div>
</body>
</html>`;
  }
}

export const loadTestExporter = new LoadTestExporter();