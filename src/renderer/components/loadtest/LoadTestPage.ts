import { LoadTestForm } from './LoadTestForm';
import { RunProgress } from './RunProgress';
import { RunSummary } from './RunSummary';

interface LoadTestProgressTick {
  runId: string;
  scheduled: number;
  sent: number;
  completed: number;
  inFlight: number;
  elapsedSec: number;
}

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

type LoadTestState = 'form' | 'running' | 'summary';

export class LoadTestPage {
  private container: HTMLElement;
  private state: LoadTestState = 'form';
  private form: LoadTestForm;
  private progress: RunProgress;
  private summary: RunSummary;

  private currentRunId: string | null = null;
  private progressCleanup: (() => void) | null = null;
  private summaryCleanup: (() => void) | null = null;

  constructor() {
    this.container = document.getElementById('load-testing-tab')!;
    this.form = new LoadTestForm();
    this.progress = new RunProgress();
    this.summary = new RunSummary();

    this.setupEventListeners();
  }

  async initialize(): Promise<void> {
    await this.renderForm();
    this.setupIpcListeners();
  }

  private setupEventListeners(): void {
    this.form.onStart = (config) => this.startLoadTest(config);
    this.progress.onCancel = () => this.cancelLoadTest();
    this.summary.onRunAgain = (config) => this.runAgain(config);
    this.summary.onExportCsv = (runId) => this.exportCsv(runId);
    this.summary.onExportPdf = (runId, summary) => this.exportPdf(runId, summary);
  }

  private setupIpcListeners(): void {
    this.progressCleanup = window.apiCourier.loadtest.onProgress((progress: LoadTestProgressTick) => {
      if (progress.runId === this.currentRunId) {
        this.progress.updateProgress(progress);
      }
    });

    this.summaryCleanup = window.apiCourier.loadtest.onSummary((summary: LoadTestSummary) => {
      if (summary.runId === this.currentRunId) {
        this.showSummary(summary);
      }
    });
  }

  private async startLoadTest(config: any): Promise<void> {
    try {
      const result = await window.apiCourier.loadtest.start(config);
      this.currentRunId = result.runId;
      this.showProgress(config);
    } catch (error) {
      console.error('Failed to start load test:', error);
      this.showError(error instanceof Error ? error.message : 'Failed to start load test');
    }
  }

  private async cancelLoadTest(): Promise<void> {
    if (!this.currentRunId) return;

    try {
      await window.apiCourier.loadtest.cancel(this.currentRunId);
    } catch (error) {
      console.error('Failed to cancel load test:', error);
    }
  }

  private async exportCsv(runId: string): Promise<void> {
    try {
      const result = await window.apiCourier.loadtest.exportCsv(runId);
      if (!result.ok) {
        this.showError(result.error || 'Export failed');
      }
    } catch (error) {
      console.error('Failed to export CSV:', error);
      this.showError('Failed to export CSV');
    }
  }

  private async exportPdf(runId: string, summary: LoadTestSummary): Promise<void> {
    try {
      const result = await window.apiCourier.loadtest.exportPdf(runId, summary);
      if (!result.ok) {
        this.showError(result.error || 'Export failed');
      }
    } catch (error) {
      console.error('Failed to export PDF:', error);
      this.showError('Failed to export PDF');
    }
  }

  private async renderForm(): Promise<void> {
    this.state = 'form';
    this.container.innerHTML = `
      <div class="load-test-container">
        <div class="load-test-header">
          <h2>Load Testing</h2>
          <p>Performance test your APIs with configurable load patterns</p>
        </div>
        <div id="load-test-form-container"></div>
      </div>
    `;

    const formContainer = this.container.querySelector('#load-test-form-container')!;
    await this.form.render(formContainer as HTMLElement);
  }

  private showProgress(config: any): void {
    this.state = 'running';
    this.container.innerHTML = `
      <div class="load-test-container">
        <div class="load-test-header">
          <h2>Load Test Running</h2>
          <p>Test in progress...</p>
        </div>
        <div id="load-test-progress-container"></div>
      </div>
    `;

    const progressContainer = this.container.querySelector('#load-test-progress-container')!;
    this.progress.render(progressContainer as HTMLElement, config);
  }

  private showSummary(summary: LoadTestSummary): void {
    this.state = 'summary';
    this.container.innerHTML = `
      <div class="load-test-container">
        <div class="load-test-header">
          <h2>Load Test Complete</h2>
          <p>Test finished - view results below</p>
        </div>
        <div id="load-test-summary-container"></div>
      </div>
    `;

    const summaryContainer = this.container.querySelector('#load-test-summary-container')!;
    this.summary.render(summaryContainer as HTMLElement, summary);
  }

  private async runAgain(config: any): Promise<void> {
    await this.renderForm();
    this.form.prefillConfig(config);
  }

  private showError(message: string): void {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'load-test-error';
    errorDiv.innerHTML = `
      <div class="error-message">
        <span class="error-icon">⚠️</span>
        <span class="error-text">${message}</span>
      </div>
    `;

    this.container.prepend(errorDiv);

    setTimeout(() => {
      errorDiv.remove();
    }, 5000);
  }

  destroy(): void {
    if (this.progressCleanup) {
      this.progressCleanup();
    }
    if (this.summaryCleanup) {
      this.summaryCleanup();
    }
  }
}