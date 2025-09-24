interface LoadTestProgressTick {
  runId: string;
  scheduled: number;
  sent: number;
  completed: number;
  inFlight: number;
  elapsedSec: number;
}

export class RunProgress {
  private container: HTMLElement | null = null;
  private config: any = null;
  private totalPlanned = 0;

  public onCancel: (() => void) | null = null;

  render(container: HTMLElement, config: any): void {
    this.container = container;
    this.config = config;
    this.totalPlanned = Math.floor((config.rpm * config.durationSec) / 60);

    const targetDescription = config.target.kind === 'adhoc'
      ? `${config.target.method} ${config.target.url}`
      : `Collection Request`;

    container.innerHTML = `
      <div class="load-test-progress">
        <div class="progress-header">
          <div class="test-info">
            <div class="info-row">
              <span class="info-label">Target:</span>
              <span class="info-value">${targetDescription}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Rate:</span>
              <span class="info-value">${config.rpm} requests/minute</span>
            </div>
            <div class="info-row">
              <span class="info-label">Duration:</span>
              <span class="info-value">${config.durationSec}s (${this.totalPlanned} total requests)</span>
            </div>
          </div>
          <button id="cancel-test-btn" class="btn btn-danger">Cancel Test</button>
        </div>

        <div class="progress-section">
          <div class="progress-bar-container">
            <div class="progress-label">
              <span>Progress</span>
              <span id="progress-percentage">0%</span>
            </div>
            <div class="progress-bar">
              <div id="progress-fill" class="progress-fill" style="width: 0%"></div>
            </div>
          </div>

          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-label">Scheduled</div>
              <div class="stat-value" id="stat-scheduled">0</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Sent</div>
              <div class="stat-value" id="stat-sent">0</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Completed</div>
              <div class="stat-value" id="stat-completed">0</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">In Flight</div>
              <div class="stat-value" id="stat-inflight">0</div>
            </div>
          </div>

          <div class="timing-info">
            <div class="timing-row">
              <span class="timing-label">Elapsed:</span>
              <span class="timing-value" id="elapsed-time">0s</span>
            </div>
            <div class="timing-row">
              <span class="timing-label">ETA:</span>
              <span class="timing-value" id="eta-time">Calculating...</span>
            </div>
            <div class="timing-row">
              <span class="timing-label">Current Rate:</span>
              <span class="timing-value" id="current-rate">0 RPS</span>
            </div>
          </div>
        </div>
      </div>
    `;

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    if (!this.container) return;

    const cancelBtn = this.container.querySelector('#cancel-test-btn');
    cancelBtn?.addEventListener('click', () => {
      if (this.onCancel) {
        this.onCancel();
      }
    });
  }

  updateProgress(progress: LoadTestProgressTick): void {
    if (!this.container) return;

    // Update progress bar
    const percentage = this.totalPlanned > 0 ? (progress.completed / this.totalPlanned) * 100 : 0;
    const progressFill = this.container.querySelector('#progress-fill') as HTMLElement;
    const progressPercentage = this.container.querySelector('#progress-percentage') as HTMLElement;

    progressFill.style.width = `${Math.min(percentage, 100)}%`;
    progressPercentage.textContent = `${Math.round(percentage)}%`;

    // Update stats
    this.updateStat('stat-scheduled', progress.scheduled);
    this.updateStat('stat-sent', progress.sent);
    this.updateStat('stat-completed', progress.completed);
    this.updateStat('stat-inflight', progress.inFlight);

    // Update timing
    this.updateElapsedTime(progress.elapsedSec);
    this.updateETA(progress);
    this.updateCurrentRate(progress);
  }

  private updateStat(statId: string, value: number): void {
    if (!this.container) return;

    const statElement = this.container.querySelector(`#${statId}`) as HTMLElement;
    if (statElement) {
      statElement.textContent = value.toLocaleString();
    }
  }

  private updateElapsedTime(elapsedSec: number): void {
    if (!this.container) return;

    const elapsedElement = this.container.querySelector('#elapsed-time') as HTMLElement;
    if (elapsedElement) {
      elapsedElement.textContent = this.formatDuration(elapsedSec);
    }
  }

  private updateETA(progress: LoadTestProgressTick): void {
    if (!this.container) return;

    const etaElement = this.container.querySelector('#eta-time') as HTMLElement;
    if (!etaElement) return;

    if (progress.completed === 0) {
      etaElement.textContent = 'Calculating...';
      return;
    }

    const remaining = this.totalPlanned - progress.completed;
    if (remaining <= 0) {
      etaElement.textContent = 'Complete';
      return;
    }

    const rate = progress.completed / progress.elapsedSec; // completions per second
    if (rate > 0) {
      const etaSeconds = remaining / rate;
      etaElement.textContent = this.formatDuration(etaSeconds);
    } else {
      etaElement.textContent = 'Calculating...';
    }
  }

  private updateCurrentRate(progress: LoadTestProgressTick): void {
    if (!this.container) return;

    const rateElement = this.container.querySelector('#current-rate') as HTMLElement;
    if (!rateElement) return;

    if (progress.elapsedSec > 0) {
      const rate = progress.completed / progress.elapsedSec;
      rateElement.textContent = `${rate.toFixed(1)} RPS`;
    } else {
      rateElement.textContent = '0 RPS';
    }
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