/**
 * Small dropdown rendered next to the response timestamp.
 *
 * Shows previous responses for the active request (queried synchronously
 * from HistoryManager via the `request-previous-responses` event). Each row
 * has a "Compare" button which opens the JSON Compare tab pre-populated
 * with the current response (left) vs the chosen previous response (right).
 */
import { ApiResponse, HistoryItem } from '../../../shared/types';

export class PreviousResponsesDropdown {
  private button: HTMLButtonElement | null = null;
  private menu: HTMLElement | null = null;
  private currentRequestId: string | null = null;
  private currentResponse: ApiResponse | null = null;
  private outsideHandler = (e: MouseEvent): void => {
    if (!this.menu) return;
    const target = e.target as Node | null;
    if (this.menu.contains(target as Node)) return;
    if (this.button?.contains(target as Node)) return;
    this.close();
  };
  private keyHandler = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') this.close();
  };

  mount(host: HTMLElement): void {
    if (this.button) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'response-history-dropdown-btn';
    btn.title = 'Previous responses';
    btn.setAttribute('aria-label', 'Previous responses');
    btn.setAttribute('aria-haspopup', 'true');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = '\u25BE';
    btn.style.display = 'none';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggle();
    });
    host.appendChild(btn);
    this.button = btn;
  }

  setContext(requestId: string | null, response: ApiResponse | null): void {
    this.currentRequestId = requestId;
    this.currentResponse = response;
    if (!this.button) return;
    if (requestId && response) {
      this.button.style.display = '';
    } else {
      this.button.style.display = 'none';
      this.close();
    }
  }

  private toggle(): void {
    if (this.menu) {
      this.close();
    } else {
      this.open();
    }
  }

  private open(): void {
    if (!this.button || !this.currentRequestId || !this.currentResponse) return;

    const items: HistoryItem[] = [];
    document.dispatchEvent(
      new CustomEvent('request-previous-responses', {
        detail: { requestId: this.currentRequestId, items },
      })
    );

    // Exclude the current response (matched by timestamp) so the dropdown
    // only shows *previous* responses.
    const previous = items.filter(
      (it) => it.response?.timestamp !== this.currentResponse?.timestamp
    );

    const menu = document.createElement('div');
    menu.className = 'response-history-dropdown-menu';
    menu.setAttribute('role', 'menu');

    if (previous.length === 0) {
      menu.innerHTML = `<div class="response-history-dropdown-empty">No previous responses for this request.</div>`;
    } else {
      menu.innerHTML = previous
        .map((it, idx) => this.renderRow(it, idx))
        .join('');
    }

    document.body.appendChild(menu);
    this.menu = menu;
    this.position();

    menu
      .querySelectorAll<HTMLButtonElement>('.response-history-row__compare')
      .forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const idx = Number(btn.dataset.idx);
          const item = previous[idx];
          if (item) this.openCompare(item);
        });
      });

    this.button.setAttribute('aria-expanded', 'true');
    setTimeout(() => {
      document.addEventListener('mousedown', this.outsideHandler);
      document.addEventListener('keydown', this.keyHandler);
    }, 0);
  }

  private close(): void {
    this.menu?.remove();
    this.menu = null;
    this.button?.setAttribute('aria-expanded', 'false');
    document.removeEventListener('mousedown', this.outsideHandler);
    document.removeEventListener('keydown', this.keyHandler);
  }

  private position(): void {
    if (!this.menu || !this.button) return;
    const rect = this.button.getBoundingClientRect();
    const menuWidth = 320;
    const left = Math.min(
      window.innerWidth - menuWidth - 8,
      Math.max(8, rect.right - menuWidth)
    );
    this.menu.style.top = `${rect.bottom + 4}px`;
    this.menu.style.left = `${left}px`;
    this.menu.style.width = `${menuWidth}px`;
  }

  private renderRow(item: HistoryItem, idx: number): string {
    const ts =
      item.timestamp instanceof Date
        ? item.timestamp
        : new Date(item.timestamp);
    const status = item.response?.status ?? '\u2013';
    const statusClass =
      typeof item.response?.status === 'number'
        ? item.response.status >= 500
          ? 'is-error'
          : item.response.status >= 400
            ? 'is-warn'
            : 'is-ok'
        : '';
    const time = item.response?.time != null ? `${item.response.time}ms` : '';
    return `
      <div class="response-history-row" role="menuitem">
        <div class="response-history-row__meta">
          <span class="response-history-row__status ${statusClass}">${status}</span>
          <span class="response-history-row__time">${time}</span>
          <span class="response-history-row__ts">${ts.toLocaleString()}</span>
        </div>
        <button type="button" class="response-history-row__compare" data-idx="${idx}">Compare</button>
      </div>
    `;
  }

  private openCompare(previous: HistoryItem): void {
    const left = this.currentResponse?.body || '';
    const right = previous.response?.body || '';

    // Guard: if either side has no body (e.g. very old history item where the
    // body wasn't persisted) surface a friendly toast instead of opening an
    // empty Compare tab.
    if (!left.trim() || !right.trim()) {
      document.dispatchEvent(
        new CustomEvent('show-toast', {
          detail: {
            type: 'info',
            message: !right.trim()
              ? 'This previous response has no body to compare. Re-send the request to capture a fresh snapshot.'
              : 'The current response has no body to compare yet.',
          },
        })
      );
      this.close();
      return;
    }

    const ts =
      previous.timestamp instanceof Date
        ? previous.timestamp
        : new Date(previous.timestamp);

    const payload = {
      left,
      right,
      leftLabel: 'Current response',
      rightLabel: `Previous (${ts.toLocaleString()})`,
    };

    // Buffer the payload globally so it survives the lazy React mount.
    // Root cause of "Compare doesn't work the first time": the JSON Compare
    // tab is dynamically imported on first activation. Dispatching the
    // CustomEvent before the listener mounts dropped the payload silently.
    // The tab consumes & clears `__pendingJsonComparePayload` on mount.
    (window as unknown as Record<string, unknown>).__pendingJsonComparePayload =
      payload;

    // Switch to the JSON Compare tab first so it can begin lazy-loading.
    const tabBtn = document.querySelector<HTMLElement>(
      '.nav-tab[data-tab="json-compare"]'
    );
    tabBtn?.click();

    // Also dispatch the event for the case where the tab is already mounted.
    document.dispatchEvent(
      new CustomEvent('json-compare-load', { detail: payload })
    );

    this.close();
  }

  destroy(): void {
    this.close();
    this.button?.remove();
    this.button = null;
  }
}
