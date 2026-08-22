import { ApiResponse } from '../../../shared/types';
import { ResponseTabsConfig } from '../../types/response-types';
import { PreviousResponsesDropdown } from './PreviousResponsesDropdown';

export class ResponseTabs {
  private tabsContainer: HTMLElement | null = null;
  private actionsGroup: HTMLElement | null = null;
  private searchButton: HTMLElement | null = null;
  private exportButton: HTMLElement | null = null;
  private activeTab: string = 'body';
  private onTabChangeCallback: ((tab: string) => void) | null = null;
  private onSearchCallback: (() => void) | null = null;
  private onCopyCallback: (() => void) | null = null;
  private onExportCallback: (() => void) | null = null;
  private prevResponsesDropdown: PreviousResponsesDropdown =
    new PreviousResponsesDropdown();

  constructor(
    container: HTMLElement,
    private config: ResponseTabsConfig
  ) {
    this.createTabsContainer(container);
    this.createTabs();
  }

  private createTabsContainer(container: HTMLElement): void {
    this.tabsContainer = container.querySelector('.response-toolbar');
    if (!this.tabsContainer) {
      this.tabsContainer = document.createElement('div');
      this.tabsContainer.className = 'response-toolbar';
      container.prepend(this.tabsContainer);
    }
  }

  private createTabs(): void {
    if (!this.tabsContainer) return;

    this.tabsContainer.innerHTML = '';

    // ── Top row: meta chips (status, time, size) + timestamp pinned right ──
    const metaRow = document.createElement('div');
    metaRow.className = 'response-toolbar__meta-row';

    const metaGroup = document.createElement('div');
    metaGroup.className = 'response-toolbar__meta';
    metaGroup.id = 'response-meta';
    metaGroup.innerHTML = `
      <span class="meta-chip meta-chip--status" id="meta-status">---</span>
      <span class="meta-chip meta-chip--time" id="meta-time">---</span>
      <span class="meta-chip meta-chip--size" id="meta-size">---</span>
      <span class="meta-chip meta-chip--soap-fault" id="meta-soap-fault" style="display:none;">SOAP Fault</span>
    `;

    const timestampWrap = document.createElement('span');
    timestampWrap.className = 'response-toolbar__timestamp-wrap';
    const timestampEl = document.createElement('span');
    timestampEl.className = 'response-toolbar__timestamp';
    timestampEl.id = 'response-timestamp';
    timestampWrap.appendChild(timestampEl);
    this.prevResponsesDropdown.mount(timestampWrap);

    metaRow.appendChild(metaGroup);
    metaRow.appendChild(timestampWrap);

    // ── Bottom row: tabs ──
    const tabRow = document.createElement('div');
    tabRow.className = 'response-toolbar__tab-row';

    const tabGroup = document.createElement('div');
    tabGroup.className = 'response-toolbar__tabs';

    const tabs = ['body', 'headers', 'cookies'];
    tabs.forEach((tab) => {
      const tabEl = document.createElement('button');
      tabEl.className = `response-toolbar__tab ${tab === this.activeTab ? 'active' : ''}`;
      tabEl.dataset.section = tab;
      tabEl.textContent = this.getTabLabel(tab);
      tabEl.addEventListener('click', () => this.selectTab(tab));
      tabGroup.appendChild(tabEl);
    });

    tabRow.appendChild(tabGroup);

    // ── Right side: quick search / copy / export icon actions ──
    // Search & Export apply to JSON bodies; Copy works for any response.
    // Hidden until a response is displayed (toggled via updateActionButtons).
    const actionsGroup = document.createElement('div');
    actionsGroup.className = 'response-toolbar__actions';
    actionsGroup.style.display = 'none';

    const searchBtn = this.createActionIcon(
      'response-search-icon',
      'Search response',
      '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>'
    );
    searchBtn.addEventListener('click', () => this.onSearchCallback?.());

    const copyBtn = this.createActionIcon(
      'response-copy-icon',
      'Copy response',
      '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'
    );
    copyBtn.addEventListener('click', () => this.onCopyCallback?.());

    const exportBtn = this.createActionIcon(
      'response-export-icon',
      'Export JSON',
      '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'
    );
    exportBtn.addEventListener('click', () => this.onExportCallback?.());

    actionsGroup.appendChild(searchBtn);
    actionsGroup.appendChild(copyBtn);
    actionsGroup.appendChild(exportBtn);
    tabRow.appendChild(actionsGroup);
    this.actionsGroup = actionsGroup;
    this.searchButton = searchBtn;
    this.exportButton = exportBtn;

    this.tabsContainer.appendChild(metaRow);
    this.tabsContainer.appendChild(tabRow);
  }

  private createActionIcon(
    id: string,
    label: string,
    paths: string
  ): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = id;
    btn.className = 'response-toolbar__action';
    btn.title = label;
    btn.setAttribute('aria-label', label);
    btn.innerHTML = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
    return btn;
  }

  /**
   * Update the previous-responses dropdown context. Called by ResponseManager
   * when a response is displayed (or cleared) so the dropdown knows which
   * request to query history for and which body to use as the "left" pane in
   * a Compare action.
   */
  public setPrevResponsesContext(
    requestId: string | null,
    response: ApiResponse | null
  ): void {
    this.prevResponsesDropdown.setContext(requestId, response);
  }

  private getTabLabel(tab: string): string {
    const labels: Record<string, string> = {
      body: 'Body',
      headers: 'Headers',
      cookies: 'Cookies',
    };
    return labels[tab] || tab;
  }

  private selectTab(tab: string): void {
    if (this.activeTab === tab) return;
    this.updateActiveTab(tab);
    this.onTabChangeCallback?.(tab);
  }

  private updateActiveTab(tab: string): void {
    if (!this.tabsContainer) return;
    const currentActive = this.tabsContainer.querySelector(
      '.response-toolbar__tab.active'
    );
    currentActive?.classList.remove('active');
    const newActive = this.tabsContainer.querySelector(
      `[data-section="${tab}"]`
    );
    newActive?.classList.add('active');
    this.activeTab = tab;
  }

  public updateTabs(response: ApiResponse): void {
    this.updateTabBadges(response);
  }

  private updateTabBadges(response: ApiResponse): void {
    if (!this.tabsContainer) return;

    const headersTab = this.tabsContainer.querySelector(
      '[data-section="headers"]'
    );
    if (headersTab && response.headers) {
      const headerCount = Object.keys(response.headers).length;
      headersTab.setAttribute('data-count', headerCount.toString());
    }

    const cookiesTab = this.tabsContainer.querySelector(
      '[data-section="cookies"]'
    ) as HTMLElement | null;
    if (cookiesTab && response.headers) {
      const cookieCount = this.countCookies(response.headers);
      cookiesTab.setAttribute('data-count', cookieCount.toString());
      // Hide the Cookies tab entirely when there are no cookies. The empty
      // "No cookies in response" placeholder for every API call was noisy.
      cookiesTab.style.display = cookieCount > 0 ? '' : 'none';
      // If the active tab was Cookies and it just disappeared, fall back.
      if (cookieCount === 0 && this.activeTab === 'cookies') {
        this.selectTab('body');
        this.onTabChangeCallback?.('body');
      }
    }
  }

  private countCookies(headers: Record<string, string>): number {
    let count = 0;
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === 'set-cookie') {
        count += value.split(/,(?=\s*\w+=)/).length;
      }
    }
    return count;
  }

  public onTabChange(callback: (tab: string) => void): void {
    this.onTabChangeCallback = callback;
  }

  public onSearch(callback: () => void): void {
    this.onSearchCallback = callback;
  }

  public onCopy(callback: () => void): void {
    this.onCopyCallback = callback;
  }

  public onExport(callback: () => void): void {
    this.onExportCallback = callback;
  }

  /**
   * Show / hide the quick copy & export icon actions in the tab row. Copy is
   * shown whenever a response exists, Search for any Monaco-backed body
   * (JSON or XML), and Export only for JSON.
   */
  public updateActionButtons(
    hasResponse: boolean,
    isJson: boolean,
    isXml: boolean = false
  ): void {
    if (this.actionsGroup) {
      this.actionsGroup.style.display = hasResponse ? 'flex' : 'none';
    }
    if (this.searchButton) {
      this.searchButton.style.display =
        hasResponse && (isJson || isXml) ? '' : 'none';
    }
    if (this.exportButton) {
      this.exportButton.style.display = hasResponse && isJson ? '' : 'none';
    }
  }

  public getActiveTab(): string {
    return this.activeTab;
  }

  public setActiveTab(tab: string): void {
    this.selectTab(tab);
  }

  public clear(): void {
    this.selectTab('body');
    this.updateActionButtons(false, false);

    const statusEl = document.getElementById('meta-status');
    const timeEl = document.getElementById('meta-time');
    const sizeEl = document.getElementById('meta-size');
    const timestampEl = document.getElementById('response-timestamp');
    const soapFaultEl = document.getElementById('meta-soap-fault');

    if (statusEl) {
      statusEl.textContent = '---';
      statusEl.title = '';
    }
    if (timeEl) timeEl.textContent = '---';
    if (sizeEl) sizeEl.textContent = '---';
    if (soapFaultEl) soapFaultEl.style.display = 'none';
    if (timestampEl) timestampEl.textContent = '';

    if (this.tabsContainer) {
      this.tabsContainer.classList.remove(
        'status-2xx',
        'status-3xx',
        'status-4xx',
        'status-5xx'
      );
    }

    // Reset chip modifiers
    statusEl?.classList.remove(
      'meta-chip--success',
      'meta-chip--warning',
      'meta-chip--error'
    );
  }

  public destroy(): void {
    this.tabsContainer?.remove();
    this.onTabChangeCallback = null;
    this.onSearchCallback = null;
    this.onCopyCallback = null;
    this.onExportCallback = null;
  }
}
