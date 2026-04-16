/**
 * Collection Runner - Runs all requests in a collection/folder sequentially.
 */
import { ApiRequest, ApiResponse, Collection } from '../../shared/types';

export interface RunnerResult {
  request: ApiRequest;
  response: ApiResponse | null;
  error?: string;
  index: number;
}

export interface RunnerProgress {
  total: number;
  completed: number;
  current: string;
  results: RunnerResult[];
}

declare const window: Window & {
  restbro: {
    request: { send: (request: ApiRequest) => Promise<ApiResponse> };
    store: { get: () => Promise<any> };
  };
};

export class CollectionRunner {
  private isRunning = false;
  private cancelled = false;
  private dialog: HTMLElement | null = null;

  /**
   * Collect all requests from a folder (recursively).
   */
  static collectRequests(
    folderId: string,
    collections: Collection[]
  ): ApiRequest[] {
    const requests: ApiRequest[] = [];

    function walk(id: string) {
      const children = collections
        .filter((c) => c.parentId === id)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

      for (const child of children) {
        if (child.type === 'request' && child.request) {
          requests.push({ ...child.request, collectionId: child.id });
        } else if (child.type === 'folder') {
          walk(child.id);
        }
      }
    }

    walk(folderId);
    return requests;
  }

  /**
   * Run all requests sequentially and show results in a dialog.
   */
  async run(folderId: string, folderName: string): Promise<void> {
    if (this.isRunning) return;

    const state = await window.restbro.store.get();
    const requests = CollectionRunner.collectRequests(
      folderId,
      state.collections
    );

    if (requests.length === 0) {
      this.showNotification('No requests found in this folder', 'error');
      return;
    }

    this.isRunning = true;
    this.cancelled = false;

    this.showDialog(folderName, requests.length);

    const results: RunnerResult[] = [];

    for (let i = 0; i < requests.length; i++) {
      if (this.cancelled) break;

      const req = requests[i];
      this.updateProgress({
        total: requests.length,
        completed: i,
        current: `${req.method} ${req.name || req.url}`,
        results,
      });

      let response: ApiResponse | null = null;
      let error: string | undefined;

      try {
        response = await window.restbro.request.send(req);
      } catch (e: any) {
        error = e?.message || 'Request failed';
      }

      results.push({ request: req, response, error, index: i });
    }

    this.isRunning = false;

    this.updateProgress({
      total: requests.length,
      completed: this.cancelled ? results.length : requests.length,
      current: this.cancelled ? 'Cancelled' : 'Done',
      results,
    });

    this.showResults(results, requests.length);
  }

  cancel(): void {
    this.cancelled = true;
  }

  private showDialog(folderName: string, totalRequests: number): void {
    this.removeDialog();

    const overlay = document.createElement('div');
    overlay.className = 'runner-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'runner-dialog';

    dialog.innerHTML = `
      <div class="runner-header">
        <h3 class="runner-title">Running: ${this.escapeHtml(folderName)}</h3>
        <button class="runner-close-btn" title="Close">×</button>
      </div>
      <div class="runner-progress">
        <div class="runner-progress-bar"><div class="runner-progress-fill" style="width:0%"></div></div>
        <div class="runner-progress-text">0 / ${totalRequests}</div>
        <div class="runner-current-request"></div>
      </div>
      <div class="runner-results-container"></div>
      <div class="runner-footer">
        <button class="runner-cancel-btn">Cancel</button>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    this.dialog = overlay;

    dialog.querySelector('.runner-close-btn')?.addEventListener('click', () => {
      this.cancel();
      this.removeDialog();
    });

    dialog.querySelector('.runner-cancel-btn')?.addEventListener('click', () => {
      if (this.isRunning) {
        this.cancel();
      } else {
        this.removeDialog();
      }
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        this.cancel();
        this.removeDialog();
      }
    });
  }

  private updateProgress(progress: RunnerProgress): void {
    if (!this.dialog) return;

    const pct = progress.total > 0
      ? Math.round((progress.completed / progress.total) * 100)
      : 0;

    const fill = this.dialog.querySelector('.runner-progress-fill') as HTMLElement;
    const text = this.dialog.querySelector('.runner-progress-text');
    const current = this.dialog.querySelector('.runner-current-request');

    if (fill) fill.style.width = `${pct}%`;
    if (text) text.textContent = `${progress.completed} / ${progress.total}`;
    if (current) current.textContent = progress.current;
  }

  private showResults(results: RunnerResult[], total: number): void {
    if (!this.dialog) return;

    const container = this.dialog.querySelector('.runner-results-container');
    if (!container) return;

    const cancelBtn = this.dialog.querySelector('.runner-cancel-btn');
    if (cancelBtn) cancelBtn.textContent = 'Close';

    const passed = results.filter(
      (r) => r.response && r.response.status >= 200 && r.response.status < 400
    ).length;
    const failed = results.length - passed;

    const summary = document.createElement('div');
    summary.className = 'runner-summary';
    summary.innerHTML = `
      <span class="runner-stat runner-stat--pass">${passed} passed</span>
      <span class="runner-stat runner-stat--fail">${failed} failed</span>
      <span class="runner-stat runner-stat--total">${results.length} / ${total} run</span>
    `;

    const table = document.createElement('table');
    table.className = 'runner-results-table';
    table.innerHTML = `
      <thead>
        <tr>
          <th>#</th>
          <th>Name</th>
          <th>Method</th>
          <th>Status</th>
          <th>Time</th>
          <th>Size</th>
        </tr>
      </thead>
    `;

    const tbody = document.createElement('tbody');
    results.forEach((r) => {
      const row = document.createElement('tr');
      const status = r.response?.status ?? 0;
      const isSuccess = status >= 200 && status < 400;
      row.className = isSuccess ? 'runner-row--pass' : 'runner-row--fail';

      const nameText = this.escapeHtml(r.request.name || r.request.url || 'Unnamed');
      const statusText = r.error
        ? this.escapeHtml(r.error)
        : `${status} ${r.response?.statusText || ''}`;
      const time = r.response ? `${r.response.time}ms` : '-';
      const size = r.response ? this.formatBytes(r.response.size) : '-';

      row.innerHTML = `
        <td>${r.index + 1}</td>
        <td class="runner-cell-name">${nameText}</td>
        <td><span class="runner-method">${r.request.method}</span></td>
        <td class="${isSuccess ? 'runner-status-ok' : 'runner-status-err'}">${statusText}</td>
        <td>${time}</td>
        <td>${size}</td>
      `;

      if (r.response) {
        row.style.cursor = 'pointer';
        row.title = 'Click to view response';
        row.addEventListener('click', () => {
          document.dispatchEvent(
            new CustomEvent('response-received', {
              detail: {
                response: r.response,
                request: r.request,
                requestMode: 'rest',
              },
            })
          );
          this.removeDialog();
        });
      }

      tbody.appendChild(row);
    });
    table.appendChild(tbody);

    container.innerHTML = '';
    container.appendChild(summary);
    container.appendChild(table);
  }

  private removeDialog(): void {
    if (this.dialog) {
      this.dialog.remove();
      this.dialog = null;
    }
  }

  private showNotification(message: string, type: 'success' | 'error'): void {
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed; top: 20px; right: 20px;
      background: ${type === 'success' ? 'var(--success-color)' : 'var(--error-color)'};
      color: white; padding: 12px 16px; border-radius: 4px;
      z-index: 10001; font-size: 14px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    `;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
  }

  private escapeHtml(text: string): string {
    const el = document.createElement('span');
    el.textContent = text;
    return el.innerHTML;
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
}

export const collectionRunner = new CollectionRunner();
