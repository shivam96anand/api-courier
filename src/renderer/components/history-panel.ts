/**
 * Modal listing recent request history. Listens for `open-history` events
 * and is fed by HistoryManager via a `request-history-data` event response.
 *
 * Click a row \u2192 dispatches `open-request-from-history` with the stored
 * request, which existing flows pick up to open in a new tab.
 */
import { HistoryItem } from '../../shared/types';
import { HistoryManager } from './history-manager';

export class HistoryPanel {
  private overlay: HTMLElement | null = null;
  private historyManager: HistoryManager;

  constructor(historyManager: HistoryManager) {
    this.historyManager = historyManager;
  }

  initialize(): void {
    document.addEventListener('open-history', () => this.open());
  }

  private open(): void {
    this.dispose();
    const items = this.historyManager.getHistory();

    const overlay = document.createElement('div');
    overlay.className = 'history-panel-overlay';
    overlay.innerHTML = `
      <div class="history-panel" role="dialog" aria-label="Request history">
        <div class="history-panel__header">
          <span class="history-panel__title">Request history <span class="history-panel__count">${items.length}</span></span>
          <input
            type="text"
            class="history-panel__search"
            placeholder="Filter by URL or method"
            aria-label="Filter history"
          />
          <select class="history-panel__status-filter" aria-label="Filter by status code">
            <option value="">All statuses</option>
            <option value="2xx">2xx Success</option>
            <option value="3xx">3xx Redirect</option>
            <option value="4xx">4xx Client error</option>
            <option value="5xx">5xx Server error</option>
            <option value="error">Network error</option>
          </select>
          <button class="history-panel__clear" type="button">Delete history</button>
          <button class="history-panel__close" aria-label="Close history">\u00D7</button>
        </div>
        <div class="history-panel__body">
          ${items.length === 0 ? this.renderEmpty() : this.renderList(items)}
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    this.overlay = overlay;

    overlay
      .querySelector('.history-panel__close')
      ?.addEventListener('click', () => this.dispose());
    overlay
      .querySelector('.history-panel__clear')
      ?.addEventListener('click', () => {
        this.historyManager.clearHistory();
        this.dispose();
        document.dispatchEvent(
          new CustomEvent('show-toast', {
            detail: { type: 'info', message: 'History cleared.' },
          })
        );
      });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.dispose();
    });
    document.addEventListener('keydown', this.handleKeydown);

    const search = overlay.querySelector(
      '.history-panel__search'
    ) as HTMLInputElement | null;
    const statusFilter = overlay.querySelector(
      '.history-panel__status-filter'
    ) as HTMLSelectElement | null;
    const body = overlay.querySelector('.history-panel__body') as HTMLElement;

    const applyFilters = (): void => {
      const term = (search?.value || '').toLowerCase().trim();
      const statusBucket = statusFilter?.value || '';
      const filtered = items.filter((it) => {
        if (term) {
          const matchesText =
            it.request.url.toLowerCase().includes(term) ||
            it.request.method.toLowerCase().includes(term);
          if (!matchesText) return false;
        }
        if (statusBucket) {
          const s = it.response?.status;
          if (statusBucket === 'error') {
            if (typeof s === 'number') return false;
          } else if (typeof s !== 'number') {
            return false;
          } else {
            const bucketStart = parseInt(statusBucket[0], 10) * 100;
            if (s < bucketStart || s >= bucketStart + 100) return false;
          }
        }
        return true;
      });
      body.innerHTML =
        filtered.length === 0 ? this.renderEmpty() : this.renderList(filtered);
      this.bindRowClicks(body, filtered);
    };

    search?.addEventListener('input', applyFilters);
    statusFilter?.addEventListener('change', applyFilters);
    this.bindRowClicks(body, items);
  }

  private bindRowClicks(body: HTMLElement, items: HistoryItem[]): void {
    body.querySelectorAll<HTMLElement>('.history-row').forEach((row) => {
      row.addEventListener('click', () => {
        const id = row.dataset.historyId;
        const item = items.find((i) => i.id === id);
        if (!item) return;
        document.dispatchEvent(
          new CustomEvent('open-request-from-history', {
            detail: { request: item.request, response: item.response },
          })
        );
        this.dispose();
      });
    });
  }

  private renderEmpty(): string {
    return `<div class="history-panel__empty">No history yet. Send a request to get started.</div>`;
  }

  private renderList(items: HistoryItem[]): string {
    return items
      .map((item) => {
        const ts =
          item.timestamp instanceof Date
            ? item.timestamp
            : new Date(item.timestamp);
        const status = item.response.status ?? '\u2013';
        const statusClass =
          typeof item.response.status === 'number'
            ? item.response.status >= 500
              ? 'is-error'
              : item.response.status >= 400
                ? 'is-warn'
                : 'is-ok'
            : '';
        return `
        <div class="history-row" data-history-id="${item.id}" tabindex="0" role="button">
          <span class="history-row__method method-${item.request.method.toLowerCase()}">${item.request.method}</span>
          <span class="history-row__url" title="${this.escapeAttr(item.request.url)}">${this.escapeText(item.request.url || '\u2013')}</span>
          <span class="history-row__status ${statusClass}">${status}</span>
          <span class="history-row__time">${ts.toLocaleTimeString()}</span>
        </div>
      `;
      })
      .join('');
  }

  private escapeText(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  private escapeAttr(s: string): string {
    return this.escapeText(s).replace(/"/g, '&quot;');
  }

  private handleKeydown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') this.dispose();
  };

  private dispose(): void {
    document.removeEventListener('keydown', this.handleKeydown);
    this.overlay?.remove();
    this.overlay = null;
  }
}
