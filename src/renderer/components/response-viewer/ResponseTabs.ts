import { ApiResponse } from '../../../shared/types';
import { ResponseTabsConfig } from '../../types/response-types';

export class ResponseTabs {
  private tabsContainer: HTMLElement | null = null;
  private activeTab: string = 'body';
  private onTabChangeCallback: ((tab: string) => void) | null = null;

  constructor(container: HTMLElement, private config: ResponseTabsConfig) {
    this.createTabsContainer(container);
    this.createTabs();
  }

  private createTabsContainer(container: HTMLElement): void {
    // Find existing tabs or create new ones
    this.tabsContainer = container.querySelector('.response-tabs');
    if (!this.tabsContainer) {
      this.tabsContainer = document.createElement('div');
      this.tabsContainer.className = 'response-tabs';
      container.prepend(this.tabsContainer);
    }
  }

  private createTabs(): void {
    if (!this.tabsContainer) return;

    const tabs = ['body', 'headers', 'meta'];
    
    // Clear existing tabs
    this.tabsContainer.innerHTML = '';
    
    tabs.forEach(tab => {
      const tabElement = document.createElement('button');
      tabElement.className = `tab ${tab === this.activeTab ? 'active' : ''}`;
      tabElement.dataset.section = tab;
      tabElement.textContent = this.getTabLabel(tab);
      tabElement.addEventListener('click', () => this.selectTab(tab));
      this.tabsContainer!.appendChild(tabElement);
    });
  }

  private getTabLabel(tab: string): string {
    const labels: Record<string, string> = {
      body: 'Body',
      headers: 'Headers',
      meta: 'Meta'
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

    // Remove active class from current tab
    const currentActive = this.tabsContainer.querySelector('.tab.active');
    currentActive?.classList.remove('active');
    
    // Add active class to new tab
    const newActive = this.tabsContainer.querySelector(`[data-section="${tab}"]`);
    newActive?.classList.add('active');
    
    this.activeTab = tab;
  }

  public updateTabs(response: ApiResponse): void {
    // Update tab badges with response info if needed
    this.updateTabBadges(response);
  }

  private updateTabBadges(response: ApiResponse): void {
    if (!this.tabsContainer) return;

    const bodyTab = this.tabsContainer.querySelector('[data-section="body"]');
    if (bodyTab && response.body) {
      const formatBadge = this.detectResponseFormat(response);
      bodyTab.setAttribute('data-format', formatBadge);
    }

    const headersTab = this.tabsContainer.querySelector('[data-section="headers"]');
    if (headersTab && response.headers) {
      const headerCount = Object.keys(response.headers).length;
      headersTab.setAttribute('data-count', headerCount.toString());
    }
  }

  private detectResponseFormat(response: ApiResponse): string {
    const contentType = response.headers['content-type'] || '';
    if (contentType.includes('application/json')) return 'JSON';
    if (contentType.includes('text/xml')) return 'XML';
    if (contentType.includes('text/html')) return 'HTML';
    return 'TEXT';
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
  }

  public destroy(): void {
    this.tabsContainer?.remove();
    this.onTabChangeCallback = null;
  }
}