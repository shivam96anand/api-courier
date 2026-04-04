/**
 * cURL Tool Tab Manager
 * Provides a user-friendly interface for executing cURL commands,
 * viewing parsed breakdowns, and visualizing responses.
 */

interface CurlHistoryEntry {
  id: string;
  command: string;
  timestamp: number;
  method: string;
  url: string;
  status?: number;
}

export class CurlToolManager {
  private container: HTMLElement;
  private history: CurlHistoryEntry[] = [];
  private activeRequestId: string | null = null;
  private isExecuting = false;
  private selectedHistoryId: string | null = null;

  constructor() {
    this.container = document.getElementById('curl-tool-tab')!;
  }

  initialize(): void {
    this.render();
    this.setupEventListeners();
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="curl-tool">
        <div class="curl-tool__sidebar">
          <div class="curl-tool__sidebar-header">
            <h3>History</h3>
            <button class="curl-tool__clear-btn" id="curl-clear-history" title="Clear History">Clear</button>
          </div>
          <div class="curl-tool__history" id="curl-history-list">
            <div class="curl-tool__empty-history">No history yet</div>
          </div>
        </div>
        <div class="curl-tool__main">
          <div class="curl-tool__input-area">
            <div class="curl-tool__input-header">
              <h3>cURL Command</h3>
              <div class="curl-tool__input-actions">
                <button class="curl-tool__action-btn" id="curl-paste-btn" title="Paste from clipboard">Paste</button>
                <button class="curl-tool__action-btn" id="curl-clear-btn" title="Clear input">Clear</button>
                <button class="curl-tool__action-btn curl-tool__action-btn--examples" id="curl-examples-btn" title="Load example">Examples</button>
              </div>
            </div>
            <div class="curl-tool__editor-wrapper">
              <textarea
                id="curl-tool-input"
                class="curl-tool__input"
                spellcheck="false"
                placeholder="Paste your cURL command here...&#10;&#10;Example:&#10;curl -X GET https://jsonplaceholder.typicode.com/posts/1 \\&#10;  -H 'Accept: application/json'"
              ></textarea>
            </div>
            <div class="curl-tool__controls">
              <button class="curl-tool__send-btn" id="curl-execute-btn">
                <svg class="curl-tool__send-icon" viewBox="0 0 24 24" width="16" height="16">
                  <polygon points="5,3 19,12 5,21"/>
                </svg>
                Execute
              </button>
              <button class="curl-tool__cancel-btn" id="curl-cancel-btn" style="display:none;">Cancel</button>
            </div>
          </div>

          <div class="curl-tool__parsed" id="curl-parsed-section" style="display:none;">
            <div class="curl-tool__parsed-header">
              <h3>Parsed Breakdown</h3>
              <button class="curl-tool__toggle-btn" id="curl-toggle-parsed">Hide</button>
            </div>
            <div class="curl-tool__parsed-body" id="curl-parsed-body">
              <div class="curl-tool__parsed-row">
                <span class="curl-tool__parsed-label">Method</span>
                <span class="curl-tool__parsed-value" id="curl-parsed-method"></span>
              </div>
              <div class="curl-tool__parsed-row">
                <span class="curl-tool__parsed-label">URL</span>
                <span class="curl-tool__parsed-value curl-tool__parsed-url" id="curl-parsed-url"></span>
              </div>
              <div class="curl-tool__parsed-row" id="curl-parsed-headers-row" style="display:none;">
                <span class="curl-tool__parsed-label">Headers</span>
                <div class="curl-tool__parsed-headers" id="curl-parsed-headers"></div>
              </div>
              <div class="curl-tool__parsed-row" id="curl-parsed-body-row" style="display:none;">
                <span class="curl-tool__parsed-label">Body</span>
                <pre class="curl-tool__parsed-body-content" id="curl-parsed-body-content"></pre>
              </div>
              <div class="curl-tool__parsed-row" id="curl-parsed-flags-row" style="display:none;">
                <span class="curl-tool__parsed-label">Flags</span>
                <span class="curl-tool__parsed-value" id="curl-parsed-flags"></span>
              </div>
            </div>
          </div>

          <div class="curl-tool__response" id="curl-response-section" style="display:none;">
            <div class="curl-tool__response-header">
              <div class="curl-tool__response-tabs">
                <button class="curl-tool__resp-tab active" data-resp-tab="body">Body</button>
                <button class="curl-tool__resp-tab" data-resp-tab="headers">Headers</button>
              </div>
              <div class="curl-tool__response-meta" id="curl-response-meta">
                <span class="curl-tool__meta-chip curl-tool__meta-chip--status" id="curl-meta-status"></span>
                <span class="curl-tool__meta-chip curl-tool__meta-chip--time" id="curl-meta-time"></span>
                <span class="curl-tool__meta-chip curl-tool__meta-chip--size" id="curl-meta-size"></span>
              </div>
              <div class="curl-tool__response-actions">
                <button class="curl-tool__action-btn" id="curl-copy-response">Copy</button>
              </div>
            </div>
            <div class="curl-tool__resp-content" id="curl-resp-body" data-resp-content="body">
              <pre class="curl-tool__response-body" id="curl-response-body-content"></pre>
            </div>
            <div class="curl-tool__resp-content" id="curl-resp-headers" data-resp-content="headers" style="display:none;">
              <div class="curl-tool__response-headers-table" id="curl-response-headers-content"></div>
            </div>
          </div>

          <div class="curl-tool__loading" id="curl-loading" style="display:none;">
            <div class="curl-tool__spinner"></div>
            <span>Executing request...</span>
          </div>

          <div class="curl-tool__error" id="curl-error-section" style="display:none;">
            <div class="curl-tool__error-content" id="curl-error-content"></div>
          </div>
        </div>
      </div>
    `;
  }

  private setupEventListeners(): void {
    // Execute button
    this.container.querySelector('#curl-execute-btn')?.addEventListener('click', () => this.execute());

    // Cancel button
    this.container.querySelector('#curl-cancel-btn')?.addEventListener('click', () => this.cancel());

    // Paste button
    this.container.querySelector('#curl-paste-btn')?.addEventListener('click', () => this.pasteFromClipboard());

    // Clear button
    this.container.querySelector('#curl-clear-btn')?.addEventListener('click', () => this.clearInput());

    // Clear history
    this.container.querySelector('#curl-clear-history')?.addEventListener('click', () => this.clearHistory());

    // Examples button
    this.container.querySelector('#curl-examples-btn')?.addEventListener('click', () => this.loadExample());

    // Toggle parsed section
    this.container.querySelector('#curl-toggle-parsed')?.addEventListener('click', () => this.toggleParsed());

    // Copy response
    this.container.querySelector('#curl-copy-response')?.addEventListener('click', () => this.copyResponse());

    // Response tabs
    this.container.querySelectorAll('.curl-tool__resp-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        const target = (e.currentTarget as HTMLElement).dataset.respTab;
        if (target) this.switchResponseTab(target);
      });
    });

    // Keyboard shortcut: Ctrl/Cmd+Enter to execute
    const input = this.container.querySelector('#curl-tool-input') as HTMLTextAreaElement;
    input?.addEventListener('keydown', (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        this.execute();
      }
    });
  }

  private async execute(): Promise<void> {
    const input = this.container.querySelector('#curl-tool-input') as HTMLTextAreaElement;
    const raw = input?.value?.trim();
    if (!raw || this.isExecuting) return;

    const requestId = `curl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.activeRequestId = requestId;
    this.isExecuting = true;

    this.showLoading(true);
    this.hideError();
    this.hideResponse();

    try {
      const result = await window.apiCourier.curl.execute({ id: requestId, rawCommand: raw });

      if (this.activeRequestId !== requestId) return; // cancelled

      // Show parsed breakdown
      this.showParsed(result.parsed);

      if (result.error) {
        this.showError(result.error);
      } else {
        this.showResponse(result);
      }

      // Add to history
      this.addToHistory({
        id: requestId,
        command: raw,
        timestamp: Date.now(),
        method: result.parsed?.method || 'GET',
        url: result.parsed?.url || '',
        status: result.status,
      });
    } catch (err: any) {
      this.showError(err.message || 'Failed to execute cURL command');
    } finally {
      this.isExecuting = false;
      this.activeRequestId = null;
      this.showLoading(false);
    }
  }

  private async cancel(): Promise<void> {
    if (this.activeRequestId) {
      await window.apiCourier.curl.cancel(this.activeRequestId);
      this.activeRequestId = null;
      this.isExecuting = false;
      this.showLoading(false);
    }
  }

  private async pasteFromClipboard(): Promise<void> {
    try {
      const text = await navigator.clipboard.readText();
      const input = this.container.querySelector('#curl-tool-input') as HTMLTextAreaElement;
      if (input) input.value = text;
    } catch { /* clipboard access denied */ }
  }

  private clearInput(): void {
    const input = this.container.querySelector('#curl-tool-input') as HTMLTextAreaElement;
    if (input) input.value = '';
    this.hideResponse();
    this.hideParsed();
    this.hideError();
  }

  private loadExample(): void {
    const examples = [
      `curl -X GET https://jsonplaceholder.typicode.com/posts/1 \\\n  -H 'Accept: application/json'`,
      `curl -X POST https://jsonplaceholder.typicode.com/posts \\\n  -H 'Content-Type: application/json' \\\n  -d '{"title":"foo","body":"bar","userId":1}'`,
      `curl -X PUT https://jsonplaceholder.typicode.com/posts/1 \\\n  -H 'Content-Type: application/json' \\\n  -d '{"id":1,"title":"updated","body":"updated body","userId":1}'`,
      `curl -X DELETE https://jsonplaceholder.typicode.com/posts/1`,
      `curl -X GET https://jsonplaceholder.typicode.com/posts \\\n  -H 'Accept: application/json' \\\n  -H 'Cache-Control: no-cache'`,
    ];
    const idx = Math.floor(Math.random() * examples.length);
    const input = this.container.querySelector('#curl-tool-input') as HTMLTextAreaElement;
    if (input) input.value = examples[idx];
  }

  private showParsed(parsed: any): void {
    if (!parsed) return;
    const section = this.container.querySelector('#curl-parsed-section') as HTMLElement;
    section.style.display = '';

    const methodEl = this.container.querySelector('#curl-parsed-method') as HTMLElement;
    methodEl.textContent = parsed.method;
    methodEl.className = `curl-tool__parsed-value curl-tool__method-badge curl-tool__method-badge--${parsed.method.toLowerCase()}`;

    (this.container.querySelector('#curl-parsed-url') as HTMLElement).textContent = parsed.url;

    // Headers
    const headersRow = this.container.querySelector('#curl-parsed-headers-row') as HTMLElement;
    const headersDiv = this.container.querySelector('#curl-parsed-headers') as HTMLElement;
    const headerEntries = Object.entries(parsed.headers || {});
    if (headerEntries.length > 0) {
      headersRow.style.display = '';
      headersDiv.innerHTML = headerEntries
        .map(([k, v]) => `<div class="curl-tool__header-pair"><span class="curl-tool__header-key">${this.escapeHtml(k)}</span><span class="curl-tool__header-val">${this.escapeHtml(String(v))}</span></div>`)
        .join('');
    } else {
      headersRow.style.display = 'none';
    }

    // Body
    const bodyRow = this.container.querySelector('#curl-parsed-body-row') as HTMLElement;
    const bodyContent = this.container.querySelector('#curl-parsed-body-content') as HTMLElement;
    if (parsed.body) {
      bodyRow.style.display = '';
      bodyContent.textContent = this.tryFormatJson(parsed.body);
    } else {
      bodyRow.style.display = 'none';
    }

    // Flags
    const flagsRow = this.container.querySelector('#curl-parsed-flags-row') as HTMLElement;
    const flagsEl = this.container.querySelector('#curl-parsed-flags') as HTMLElement;
    if (parsed.flags?.length > 0) {
      flagsRow.style.display = '';
      flagsEl.innerHTML = parsed.flags.map((f: string) =>
        `<span class="curl-tool__flag-chip">${this.escapeHtml(f)}</span>`
      ).join(' ');
    } else {
      flagsRow.style.display = 'none';
    }
  }

  private hideParsed(): void {
    const section = this.container.querySelector('#curl-parsed-section') as HTMLElement;
    if (section) section.style.display = 'none';
  }

  private toggleParsed(): void {
    const body = this.container.querySelector('#curl-parsed-body') as HTMLElement;
    const btn = this.container.querySelector('#curl-toggle-parsed') as HTMLElement;
    if (body.style.display === 'none') {
      body.style.display = '';
      btn.textContent = 'Hide';
    } else {
      body.style.display = 'none';
      btn.textContent = 'Show';
    }
  }

  private showResponse(result: any): void {
    const section = this.container.querySelector('#curl-response-section') as HTMLElement;
    section.style.display = '';

    // Meta chips
    const statusEl = this.container.querySelector('#curl-meta-status') as HTMLElement;
    statusEl.textContent = `${result.status} ${result.statusText}`;
    statusEl.className = `curl-tool__meta-chip curl-tool__meta-chip--status ${this.getStatusClass(result.status)}`;

    (this.container.querySelector('#curl-meta-time') as HTMLElement).textContent = `${result.time}ms`;
    (this.container.querySelector('#curl-meta-size') as HTMLElement).textContent = this.formatSize(result.size);

    // Body
    const bodyEl = this.container.querySelector('#curl-response-body-content') as HTMLElement;
    bodyEl.textContent = this.tryFormatJson(result.body);

    // Headers
    const headersEl = this.container.querySelector('#curl-response-headers-content') as HTMLElement;
    const headerEntries = Object.entries(result.headers || {});
    if (headerEntries.length > 0) {
      headersEl.innerHTML = `
        <table class="curl-tool__headers-table">
          <thead><tr><th>Header</th><th>Value</th></tr></thead>
          <tbody>
            ${headerEntries.map(([k, v]) => `<tr><td>${this.escapeHtml(k)}</td><td>${this.escapeHtml(String(v))}</td></tr>`).join('')}
          </tbody>
        </table>
      `;
    } else {
      headersEl.innerHTML = '<div class="curl-tool__empty-state">No response headers</div>';
    }

    // Ensure body tab is active
    this.switchResponseTab('body');
  }

  private hideResponse(): void {
    const section = this.container.querySelector('#curl-response-section') as HTMLElement;
    if (section) section.style.display = 'none';
  }

  private switchResponseTab(tab: string): void {
    this.container.querySelectorAll('.curl-tool__resp-tab').forEach(t => t.classList.remove('active'));
    this.container.querySelector(`.curl-tool__resp-tab[data-resp-tab="${tab}"]`)?.classList.add('active');

    this.container.querySelectorAll('.curl-tool__resp-content').forEach(c => {
      (c as HTMLElement).style.display = 'none';
    });
    const target = this.container.querySelector(`[data-resp-content="${tab}"]`) as HTMLElement;
    if (target) target.style.display = '';
  }

  private showLoading(show: boolean): void {
    const loading = this.container.querySelector('#curl-loading') as HTMLElement;
    const executeBtn = this.container.querySelector('#curl-execute-btn') as HTMLElement;
    const cancelBtn = this.container.querySelector('#curl-cancel-btn') as HTMLElement;
    if (loading) loading.style.display = show ? '' : 'none';
    if (executeBtn) executeBtn.style.display = show ? 'none' : '';
    if (cancelBtn) cancelBtn.style.display = show ? '' : 'none';
  }

  private showError(message: string): void {
    const section = this.container.querySelector('#curl-error-section') as HTMLElement;
    const content = this.container.querySelector('#curl-error-content') as HTMLElement;
    section.style.display = '';
    content.textContent = message;
  }

  private hideError(): void {
    const section = this.container.querySelector('#curl-error-section') as HTMLElement;
    if (section) section.style.display = 'none';
  }

  private addToHistory(entry: CurlHistoryEntry): void {
    this.history.unshift(entry);
    if (this.history.length > 50) this.history.pop();
    this.selectedHistoryId = entry.id;
    this.renderHistory();
  }

  private clearHistory(): void {
    this.history = [];
    this.selectedHistoryId = null;
    this.renderHistory();
  }

  private renderHistory(): void {
    const list = this.container.querySelector('#curl-history-list') as HTMLElement;
    if (this.history.length === 0) {
      list.innerHTML = '<div class="curl-tool__empty-history">No history yet</div>';
      return;
    }
    list.innerHTML = this.history.map(entry => `
      <div class="curl-tool__history-item${entry.id === this.selectedHistoryId ? ' active' : ''}" data-history-id="${entry.id}">
        <div class="curl-tool__history-top">
          <span class="curl-tool__method-badge curl-tool__method-badge--${entry.method.toLowerCase()}">${entry.method}</span>
          ${entry.status ? `<span class="curl-tool__history-status ${this.getStatusClass(entry.status)}">${entry.status}</span>` : ''}
        </div>
        <div class="curl-tool__history-url" title="${this.escapeHtml(entry.url)}">${this.escapeHtml(this.truncateUrl(entry.url))}</div>
        <div class="curl-tool__history-time">${this.formatTime(entry.timestamp)}</div>
      </div>
    `).join('');

    // Click to restore
    list.querySelectorAll('.curl-tool__history-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = (item as HTMLElement).dataset.historyId;
        const entry = this.history.find(h => h.id === id);
        if (entry) {
          const input = this.container.querySelector('#curl-tool-input') as HTMLTextAreaElement;
          if (input) input.value = entry.command;
          this.selectedHistoryId = entry.id;
          // Update active class without full re-render
          list.querySelectorAll('.curl-tool__history-item').forEach(el =>
            el.classList.toggle('active', (el as HTMLElement).dataset.historyId === entry.id)
          );
        }
      });
    });
  }

  private async copyResponse(): Promise<void> {
    const bodyEl = this.container.querySelector('#curl-response-body-content') as HTMLElement;
    if (bodyEl?.textContent) {
      try {
        await navigator.clipboard.writeText(bodyEl.textContent);
      } catch { /* clipboard denied */ }
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────

  private tryFormatJson(text: string): string {
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      return text;
    }
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private getStatusClass(status: number): string {
    if (status >= 200 && status < 300) return 'curl-tool__status--success';
    if (status >= 300 && status < 400) return 'curl-tool__status--redirect';
    if (status >= 400 && status < 500) return 'curl-tool__status--client-error';
    if (status >= 500) return 'curl-tool__status--server-error';
    return 'curl-tool__status--error';
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  private formatTime(timestamp: number): string {
    const d = new Date(timestamp);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  private truncateUrl(url: string): string {
    try {
      const u = new URL(url);
      const path = u.pathname + u.search;
      if (path.length > 40) return u.host + path.slice(0, 37) + '...';
      return u.host + path;
    } catch {
      return url.length > 50 ? url.slice(0, 47) + '...' : url;
    }
  }
}
