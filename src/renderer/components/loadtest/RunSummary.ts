interface LoadTestSummary {
  runId: string;
  totalPlanned: number;
  sent: number;
  completed: number;
  success: number;
  error: number;
  codeCounts: Record<string, number>;
  minMs: number;
  maxMs: number;
  avgMs: number;
  p50: number;
  p95: number;
  p99: number;
  throughputRps: number;
  wallTimeMs: number;
  startedAt: number;
  finishedAt: number;
}

export class RunSummary {
  private container: HTMLElement | null = null;
  private summary: LoadTestSummary | null = null;

  public onRunAgain: ((config: any) => void) | null = null;
  public onExportCsv: ((runId: string) => void) | null = null;
  public onExportPdf: ((runId: string, summary: LoadTestSummary) => void) | null = null;

  render(container: HTMLElement, summary: LoadTestSummary): void {
    this.container = container;
    this.summary = summary;

    const successRate = summary.completed > 0 ? ((summary.success / summary.completed) * 100).toFixed(1) : '0.0';
    const startTime = new Date(summary.startedAt).toLocaleString();
    const endTime = new Date(summary.finishedAt).toLocaleString();
    const duration = this.formatDuration(summary.wallTimeMs / 1000);

    container.innerHTML = `
      <div class="load-test-summary">
        <div class="summary-header">
          <div class="summary-info">
            <div class="info-row">
              <span class="info-label">Started:</span>
              <span class="info-value">${startTime}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Finished:</span>
              <span class="info-value">${endTime}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Duration:</span>
              <span class="info-value">${duration}</span>
            </div>
          </div>
          <div class="summary-actions">
            <button id="run-again-btn" class="btn btn-primary">Run Again</button>
            <button id="export-csv-btn" class="btn btn-secondary">Export CSV</button>
            <button id="export-pdf-btn" class="btn btn-secondary">Export PDF</button>
          </div>
        </div>

        <div class="metrics-section">
          <h3>Performance Metrics</h3>
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
          </div>

          <div class="metrics-grid">
            <div class="metric-card">
              <div class="metric-label">Min Latency</div>
              <div class="metric-value">${summary.minMs.toFixed(0)}ms</div>
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
          </div>

          <div class="metrics-grid">
            <div class="metric-card">
              <div class="metric-label">P50 Latency</div>
              <div class="metric-value">${summary.p50.toFixed(0)}ms</div>
            </div>
            <div class="metric-card">
              <div class="metric-label">Max Latency</div>
              <div class="metric-value">${summary.maxMs.toFixed(0)}ms</div>
            </div>
            <div class="metric-card">
              <div class="metric-label">Successful</div>
              <div class="metric-value">${summary.success.toLocaleString()}</div>
            </div>
            <div class="metric-card">
              <div class="metric-label">Errors</div>
              <div class="metric-value">${summary.error.toLocaleString()}</div>
            </div>
          </div>
        </div>

        <div class="status-codes-section">
          <h3>Response Status Codes</h3>
          <div class="status-codes-grid">
            ${this.renderStatusCodes(summary.codeCounts)}
          </div>
        </div>
      </div>
    `;

    this.setupEventListeners();
  }

  private renderStatusCodes(codeCounts: Record<string, number>): string {
    const entries = Object.entries(codeCounts).sort((a, b) => {
      // Sort by status code, but put 'error' at the end
      if (a[0] === 'error') return 1;
      if (b[0] === 'error') return -1;
      return parseInt(a[0]) - parseInt(b[0]);
    });

    return entries.map(([code, count]) => {
      const statusClass = this.getStatusClass(code);
      return `
        <div class="status-code-item ${statusClass}">
          <div class="status-code">${code}</div>
          <div class="status-count">${count.toLocaleString()}</div>
        </div>
      `;
    }).join('');
  }

  private getStatusClass(code: string): string {
    if (code === 'error') return 'status-error';

    const numCode = parseInt(code);
    if (numCode >= 200 && numCode < 300) return 'status-success';
    if (numCode >= 300 && numCode < 400) return 'status-redirect';
    if (numCode >= 400 && numCode < 500) return 'status-client-error';
    if (numCode >= 500) return 'status-server-error';
    return 'status-unknown';
  }

  private setupEventListeners(): void {
    if (!this.container) return;

    const runAgainBtn = this.container.querySelector('#run-again-btn');
    runAgainBtn?.addEventListener('click', () => {
      if (this.onRunAgain) {
        // We'll need to reconstruct the config from the summary
        // For now, we'll pass null and let the parent handle it
        this.onRunAgain(null);
      }
    });

    const exportCsvBtn = this.container.querySelector('#export-csv-btn');
    exportCsvBtn?.addEventListener('click', () => {
      if (this.onExportCsv && this.summary) {
        this.onExportCsv(this.summary.runId);
      }
    });

    const exportPdfBtn = this.container.querySelector('#export-pdf-btn');
    exportPdfBtn?.addEventListener('click', () => {
      if (this.onExportPdf && this.summary) {
        this.onExportPdf(this.summary.runId, this.summary);
      }
    });
  }

  private formatDuration(seconds: number): string {
    if (seconds < 60) {
      return `${Math.round(seconds)}s`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = Math.round(seconds % 60);
      return `${minutes}m ${remainingSeconds}s`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const remainingMinutes = Math.floor((seconds % 3600) / 60);
      return `${hours}h ${remainingMinutes}m`;
    }
  }
}