import { ApiResponse } from '../../../shared/types';
import { ResponseTabsConfig } from '../../types/response-types';

export class ResponseTabs {
  private tabsContainer: HTMLElement | null = null;
  private activeTab: string = 'body';
  private onTabChangeCallback: ((tab: string) => void) | null = null;

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

    // Left section: tabs
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

    // Center section: meta chips
    const metaGroup = document.createElement('div');
    metaGroup.className = 'response-toolbar__meta';
    metaGroup.id = 'response-meta';
    metaGroup.innerHTML = `
      <span class="meta-chip meta-chip--status" id="meta-status">---</span>
      <span class="meta-divider">&middot;</span>
      <span class="meta-chip meta-chip--time" id="meta-time">---</span>
      <span class="meta-divider">&middot;</span>
      <span class="meta-chip meta-chip--size" id="meta-size">---</span>
      <span class="meta-chip meta-chip--soap-fault" id="meta-soap-fault" style="display:none;">SOAP Fault</span>
    `;

    // Right section: timestamp
    const timestampEl = document.createElement('span');
    timestampEl.className = 'response-toolbar__timestamp';
    timestampEl.id = 'response-timestamp';

    this.tabsContainer.appendChild(tabGroup);
    this.tabsContainer.appendChild(metaGroup);
    this.tabsContainer.appendChild(timestampEl);
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
    );
    if (cookiesTab && response.headers) {
      const cookieCount = this.countCookies(response.headers);
      cookiesTab.setAttribute('data-count', cookieCount.toString());
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

  public getActiveTab(): string {
    return this.activeTab;
  }

  public setActiveTab(tab: string): void {
    this.selectTab(tab);
  }

  public clear(): void {
    this.selectTab('body');

    const statusEl = document.getElementById('meta-status');
    const timeEl = document.getElementById('meta-time');
    const sizeEl = document.getElementById('meta-size');
    const timestampEl = document.getElementById('response-timestamp');
    const soapFaultEl = document.getElementById('meta-soap-fault');

    if (statusEl) statusEl.textContent = '---';
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
  }
}
