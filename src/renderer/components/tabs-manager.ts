import { EventBus } from '../utils/event-bus';
import { Request } from '../../shared/types';

export interface Tab {
  id: string;
  request: Request;
  isActive: boolean;
  isDirty: boolean;
}

export class TabsManager {
  private tabs: Tab[] = [];
  private activeTabId: string | null = null;

  constructor(private eventBus: EventBus) {}

  initialize(): void {
    this.setupEventListeners();
    this.renderTabs();
  }

  private setupEventListeners(): void {
    this.eventBus.on('request:selected', (request: Request) => {
      this.openTab(request);
    });

    this.eventBus.on('tab:close', (tabId: string) => {
      this.closeTab(tabId);
    });

    this.eventBus.on('tab:activate', (tabId: string) => {
      this.activateTab(tabId);
    });
  }

  openTab(request: Request): void {
    // Check if tab already exists
    let existingTab = this.tabs.find(tab => tab.request.id === request.id);
    
    if (existingTab) {
      // Update the request data and activate
      existingTab.request = request;
      this.activateTab(existingTab.id);
    } else {
      // Create new tab
      const tab: Tab = {
        id: `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        request: request,
        isActive: true,
        isDirty: false
      };

      // Deactivate all other tabs
      this.tabs.forEach(t => t.isActive = false);
      
      this.tabs.push(tab);
      this.activeTabId = tab.id;
      
      this.eventBus.emit('tab:opened', tab);
    }

    this.renderTabs();
    this.eventBus.emit('request:display', request);
  }

  closeTab(tabId: string): void {
    const tabIndex = this.tabs.findIndex(tab => tab.id === tabId);
    if (tabIndex === -1) return;

    const closingTab = this.tabs[tabIndex];
    const wasActive = closingTab.isActive;

    this.tabs.splice(tabIndex, 1);

    // If we closed the active tab, activate another one
    if (wasActive && this.tabs.length > 0) {
      // Activate the tab to the right, or the last tab if we closed the rightmost
      const newActiveIndex = Math.min(tabIndex, this.tabs.length - 1);
      this.activateTab(this.tabs[newActiveIndex].id);
    } else if (this.tabs.length === 0) {
      this.activeTabId = null;
      this.eventBus.emit('request:display', null);
    }

    this.renderTabs();
    this.eventBus.emit('tab:closed', tabId);
  }

  activateTab(tabId: string): void {
    const tab = this.tabs.find(t => t.id === tabId);
    if (!tab) return;

    // Deactivate all tabs
    this.tabs.forEach(t => t.isActive = false);
    
    // Activate the selected tab
    tab.isActive = true;
    this.activeTabId = tabId;

    this.renderTabs();
    this.eventBus.emit('request:display', tab.request);
  }

  markTabDirty(tabId: string, isDirty: boolean = true): void {
    const tab = this.tabs.find(t => t.id === tabId);
    if (tab) {
      tab.isDirty = isDirty;
      this.renderTabs();
    }
  }

  getActiveTab(): Tab | null {
    return this.tabs.find(tab => tab.isActive) || null;
  }

  getAllTabs(): Tab[] {
    return [...this.tabs];
  }

  private renderTabs(): void {
    const container = document.getElementById('requestTabs');
    const requestPanel = document.querySelector('.request-panel') as HTMLElement;
    
    if (!container) return;

    container.innerHTML = '';

    if (this.tabs.length === 0) {
      container.innerHTML = `
        <div class="no-tabs-message">
          <span>Select a request from the collection to open it in a tab</span>
        </div>
      `;
      
      // Hide the request panel content when no tabs
      if (requestPanel) {
        const panelHeader = requestPanel.querySelector('.panel-header') as HTMLElement;
        const panelContent = requestPanel.querySelector('.panel-content') as HTMLElement;
        
        if (panelHeader) panelHeader.style.display = 'none';
        if (panelContent) panelContent.style.display = 'none';
      }
      
      return;
    }

    // Show the request panel content when tabs exist
    if (requestPanel) {
      const panelHeader = requestPanel.querySelector('.panel-header') as HTMLElement;
      const panelContent = requestPanel.querySelector('.panel-content') as HTMLElement;
      
      if (panelHeader) panelHeader.style.display = '';
      if (panelContent) panelContent.style.display = '';
    }

    this.tabs.forEach(tab => {
      const tabElement = this.createTabElement(tab);
      container.appendChild(tabElement);
    });
  }

  private createTabElement(tab: Tab): HTMLElement {
    const div = document.createElement('div');
    div.className = `request-tab ${tab.isActive ? 'active' : ''}`;
    div.setAttribute('data-tab-id', tab.id);

    div.innerHTML = `
      <div class="tab-content">
        <span class="tab-method method-${tab.request.method.toLowerCase()}">${tab.request.method}</span>
        <span class="tab-name" title="${tab.request.name}">${tab.request.name}</span>
        ${tab.isDirty ? '<span class="tab-dirty">•</span>' : ''}
        <button class="tab-close" title="Close tab">×</button>
      </div>
    `;

    // Add event listeners
    const tabContent = div.querySelector('.tab-content') as HTMLElement;
    const closeBtn = div.querySelector('.tab-close') as HTMLElement;

    tabContent.addEventListener('click', (e) => {
      if (e.target !== closeBtn) {
        this.activateTab(tab.id);
      }
    });

    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeTab(tab.id);
    });

    return div;
  }
}
