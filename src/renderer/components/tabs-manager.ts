import { RequestTab, ApiRequest, ApiResponse } from '../../shared/types';

export class TabsManager {
  private tabs: RequestTab[] = [];
  private activeTabId?: string;

  initialize(): void {
    this.setupTabEvents();
    this.setupEventListeners();
    this.renderTabs();
  }

  private setupTabEvents(): void {
    const tabList = document.getElementById('request-tab-list');
    if (!tabList) return;

    // Left click events
    tabList.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;

      // Handle close button clicks first (highest priority)
      if (target.classList.contains('tab-close')) {
        const tabId = target.dataset.tabId;
        if (tabId) {
          this.closeTab(tabId);
        }
        return; // Don't proceed with tab switching if close button was clicked
      }

      // Find the closest parent element with 'request-tab' class
      const tabElement = target.closest('.request-tab') as HTMLElement;
      if (tabElement) {
        const tabId = tabElement.dataset.tabId;

        if (tabId === 'new') {
          this.createNewTab();
        } else if (tabId) {
          this.switchToTab(tabId);
        }
      }
    });

    // Right click context menu
    tabList.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const target = e.target as HTMLElement;
      const tabElement = target.closest('.request-tab') as HTMLElement;

      if (tabElement) {
        const tabId = tabElement.dataset.tabId;
        // Only show context menu for actual tabs, not the "New Request" button
        if (tabId && tabId !== 'new') {
          this.showTabContextMenu(e, tabId);
        }
      }
    });
  }

  private setupEventListeners(): void {
    // Listen for request updates to save them to the active tab
    document.addEventListener('request-updated', (e: Event) => {
      const customEvent = e as CustomEvent;
      const updatedRequest = customEvent.detail.request;
      if (this.activeTabId && updatedRequest) {
        this.updateActiveTab({ request: updatedRequest }, true); // Mark as modified for user changes
      }
    });

    // Listen for responses to save them to the active tab
    document.addEventListener('response-received', (e: Event) => {
      const customEvent = e as CustomEvent;
      const response = customEvent.detail.response;
      if (this.activeTabId && response) {
        this.updateActiveTab({ response }, false); // Don't mark as modified for responses
      }
    });

    // Listen for request deletions to close corresponding tabs
    document.addEventListener('request-deleted', (e: Event) => {
      const customEvent = e as CustomEvent;
      const requestId = customEvent.detail.requestId;
      if (requestId) {
        this.closeTabsByRequestId(requestId);
      }
    });

    // Listen for collection renames to update tab names
    document.addEventListener('collection-renamed', (e: Event) => {
      const customEvent = e as CustomEvent;
      const collection = customEvent.detail.collection;
      const newName = customEvent.detail.newName;

      if (collection && collection.type === 'request' && collection.request) {
        this.updateTabNameForRequest(collection.request.id, newName);
      }
    });
  }

  private createNewTab(): void {
    const tabNumber = this.tabs.length + 1;
    const newRequest: ApiRequest = {
      id: this.generateId(),
      name: `Untitled Request ${tabNumber}`,
      method: 'GET',
      url: '',
      params: {},
      headers: {},
    };

    const newTab: RequestTab = {
      id: this.generateId(),
      name: newRequest.name,
      request: newRequest,
      isModified: false,
    };

    this.tabs.push(newTab);
    this.activeTabId = newTab.id;
    this.renderTabs();
    this.notifyTabChange();
    this.saveState();
  }

  private switchToTab(tabId: string): void {
    this.activeTabId = tabId;
    this.renderTabs();
    this.notifyTabChange();
    this.saveState();
  }

  private closeTab(tabId: string): void {
    const tabIndex = this.tabs.findIndex(tab => tab.id === tabId);
    if (tabIndex === -1) return;

    const tab = this.tabs[tabIndex];

    // Save to history if the tab has both request and response
    if (tab.response) {
      const event = new CustomEvent('tab-closed-with-response', {
        detail: {
          request: tab.request,
          response: tab.response
        }
      });
      document.dispatchEvent(event);
    }

    this.tabs.splice(tabIndex, 1);

    if (this.activeTabId === tabId) {
      if (this.tabs.length > 0) {
        const newActiveIndex = Math.min(tabIndex, this.tabs.length - 1);
        this.activeTabId = this.tabs[newActiveIndex].id;
      } else {
        this.activeTabId = undefined;
      }
    }

    this.renderTabs();
    this.notifyTabChange();
    this.saveState();
  }

  private renderTabs(): void {
    const tabList = document.getElementById('request-tab-list');
    if (!tabList) return;

    tabList.innerHTML = '';

    // Add "New Request" button first (fixed position on left)
    const newTabButton = document.createElement('button');
    newTabButton.className = 'request-tab new-tab-button';
    newTabButton.dataset.tabId = 'new';
    newTabButton.textContent = '+ New Request';
    newTabButton.title = 'Create new request';
    tabList.appendChild(newTabButton);

    // Render existing tabs after the "New Request" button (to the right)
    this.tabs.forEach(tab => {
      const tabElement = document.createElement('button');
      tabElement.className = `request-tab ${tab.id === this.activeTabId ? 'active' : ''}`;
      tabElement.dataset.tabId = tab.id;

      const nameSpan = document.createElement('span');
      nameSpan.textContent = tab.name + (tab.isModified ? ' •' : '');
      nameSpan.className = 'tab-name';

      const closeButton = document.createElement('span');
      closeButton.className = 'tab-close';
      closeButton.dataset.tabId = tab.id;
      closeButton.textContent = '×';
      closeButton.title = 'Close tab';

      tabElement.appendChild(nameSpan);
      tabElement.appendChild(closeButton);
      tabList.appendChild(tabElement);
    });
  }

  private notifyTabChange(): void {
    const activeTab = this.getActiveTab();
    const event = new CustomEvent('tab-changed', {
      detail: { activeTab }
    });
    document.dispatchEvent(event);
  }

  private generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }

  setTabs(tabs: RequestTab[], activeTabId?: string): void {
    this.tabs = tabs;
    this.activeTabId = activeTabId;
    this.renderTabs();
    this.notifyTabChange();
  }

  getTabs(): RequestTab[] {
    return this.tabs;
  }

  getActiveTab(): RequestTab | undefined {
    return this.tabs.find(tab => tab.id === this.activeTabId);
  }

  getActiveTabId(): string | undefined {
    return this.activeTabId;
  }

  updateActiveTab(updates: Partial<RequestTab>, markAsModified: boolean = true): void {
    if (!this.activeTabId) return;

    const tabIndex = this.tabs.findIndex(tab => tab.id === this.activeTabId);
    if (tabIndex !== -1) {
      const currentTab = this.tabs[tabIndex];
      this.tabs[tabIndex] = {
        ...currentTab,
        ...updates,
        isModified: markAsModified ? true : currentTab.isModified
      };
      this.renderTabs();
      this.saveState();
    }
  }

  private saveState(): void {
    // Trigger a state save by dispatching an event
    const event = new CustomEvent('tabs-changed', {
      detail: {
        tabs: this.tabs,
        activeTabId: this.activeTabId
      }
    });
    document.dispatchEvent(event);
  }

  openRequestInTab(request: ApiRequest, collectionId?: string): void {
    // Check if request is already open in a tab
    const existingTab = this.tabs.find(tab => tab.request.id === request.id);

    if (existingTab) {
      // Switch to existing tab
      this.activeTabId = existingTab.id;
      this.renderTabs();
      this.notifyTabChange();
      this.saveState();
    } else {
      // Create new tab for this request
      const newTab: RequestTab = {
        id: this.generateId(),
        name: request.name,
        request: { ...request }, // Clone the request
        isModified: false,
        collectionId: collectionId, // Store the collection ID
      };

      this.tabs.push(newTab);
      this.activeTabId = newTab.id;
      this.renderTabs();
      this.notifyTabChange();
      this.saveState();
    }
  }

  openRequestInTabWithResponse(request: ApiRequest, response: ApiResponse, collectionId?: string): void {
    // Check if request is already open in a tab
    const existingTab = this.tabs.find(tab => tab.request.id === request.id);

    if (existingTab) {
      // Switch to existing tab and update with response
      this.activeTabId = existingTab.id;
      this.updateActiveTab({ response }, false); // Don't mark as modified since this is restored data
      this.renderTabs();
      this.notifyTabChange();
      this.saveState();
    } else {
      // Create new tab for this request with response
      const newTab: RequestTab = {
        id: this.generateId(),
        name: request.name,
        request: { ...request }, // Clone the request
        response: { ...response }, // Clone the response
        isModified: false,
        collectionId: collectionId, // Store the collection ID
      };

      this.tabs.push(newTab);
      this.activeTabId = newTab.id;
      this.renderTabs();
      this.notifyTabChange();
      this.saveState();
    }
  }

  closeTabsByRequestId(requestId: string): void {
    // Find all tabs with this request ID
    const tabsToClose = this.tabs.filter(tab => tab.request.id === requestId);

    if (tabsToClose.length === 0) return;

    // Remove all matching tabs
    this.tabs = this.tabs.filter(tab => tab.request.id !== requestId);

    // If the active tab was one of the closed tabs, update the active tab
    const wasActiveTabClosed = tabsToClose.some(tab => tab.id === this.activeTabId);
    if (wasActiveTabClosed) {
      if (this.tabs.length > 0) {
        this.activeTabId = this.tabs[0].id;
      } else {
        this.activeTabId = undefined;
      }
    }

    this.renderTabs();
    this.notifyTabChange();
    this.saveState();
  }

  private showTabContextMenu(event: MouseEvent, tabId: string): void {
    const tab = this.tabs.find(t => t.id === tabId);
    if (!tab) return;

    const menu = document.createElement('div');
    menu.className = 'tab-context-menu';
    menu.style.position = 'fixed';
    menu.style.left = event.clientX + 'px';
    menu.style.top = event.clientY + 'px';
    menu.style.backgroundColor = 'var(--bg-tertiary)';
    menu.style.border = '1px solid var(--border-color)';
    menu.style.borderRadius = '6px';
    menu.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
    menu.style.zIndex = '10000';
    menu.style.minWidth = '180px';
    menu.style.overflow = 'hidden';
    menu.style.backdropFilter = 'blur(8px)';

    const menuOptions = [
      {
        label: '🔄 Duplicate Tab',
        action: () => this.duplicateTab(tabId),
        description: 'Create a copy of this tab'
      },
      {
        label: '📋 Copy Request URL',
        action: () => this.copyRequestUrl(tabId),
        description: 'Copy the request URL to clipboard'
      },
      {
        label: '---',
        action: null,
        description: ''
      },
      {
        label: '❌ Close Tab',
        action: () => this.closeTab(tabId),
        description: 'Close this tab'
      },
      {
        label: '🗑️ Close All Tabs',
        action: () => this.closeAllTabs(),
        description: 'Close all open tabs'
      },
      {
        label: '↩️ Close Other Tabs',
        action: () => this.closeOtherTabs(tabId),
        description: 'Close all tabs except this one'
      }
    ];

    menuOptions.forEach(option => {
      const item = document.createElement('div');

      if (option.label === '---') {
        // Create separator
        item.className = 'tab-context-menu-separator';
        item.style.cssText = `
          height: 1px;
          background: var(--border-color);
          margin: 4px 0;
        `;
      } else {
        item.className = 'tab-context-menu-item';
        item.textContent = option.label;
        item.title = option.description;
        item.style.cssText = `
          padding: 10px 16px;
          cursor: pointer;
          font-size: 12px;
          color: var(--text-primary);
          transition: background-color 0.15s ease;
        `;

        item.addEventListener('mouseenter', () => {
          item.style.backgroundColor = 'var(--primary-color)';
          item.style.color = 'white';
        });

        item.addEventListener('mouseleave', () => {
          item.style.backgroundColor = 'transparent';
          item.style.color = 'var(--text-primary)';
        });

        if (option.action) {
          item.addEventListener('click', () => {
            option.action();
            if (document.body.contains(menu)) {
              document.body.removeChild(menu);
            }
          });
        }
      }

      menu.appendChild(item);
    });

    document.body.appendChild(menu);

    // Close menu when clicking outside
    const handleClickOutside = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) {
        if (document.body.contains(menu)) {
          document.body.removeChild(menu);
        }
        document.removeEventListener('click', handleClickOutside);
      }
    };

    setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 0);
  }

  private closeAllTabs(): void {
    if (this.tabs.length === 0) return;

    // Show confirmation dialog
    const confirmed = confirm(`Are you sure you want to close all ${this.tabs.length} tabs?`);
    if (!confirmed) return;

    this.tabs = [];
    this.activeTabId = undefined;
    this.renderTabs();
    this.notifyTabChange();
    this.saveState();
  }

  private closeOtherTabs(keepTabId: string): void {
    const tabsToClose = this.tabs.filter(tab => tab.id !== keepTabId);
    if (tabsToClose.length === 0) return;

    const confirmed = confirm(`Are you sure you want to close ${tabsToClose.length} other tabs?`);
    if (!confirmed) return;

    this.tabs = this.tabs.filter(tab => tab.id === keepTabId);
    this.activeTabId = keepTabId;
    this.renderTabs();
    this.notifyTabChange();
    this.saveState();
  }

  private duplicateTab(tabId: string): void {
    const originalTab = this.tabs.find(tab => tab.id === tabId);
    if (!originalTab) return;

    const duplicatedTab: RequestTab = {
      id: this.generateId(),
      name: `${originalTab.name} (Copy)`,
      request: {
        ...originalTab.request,
        id: this.generateId() // Generate new ID for the duplicated request
      },
      response: originalTab.response ? { ...originalTab.response } : undefined,
      isModified: true // Mark as modified since it's a copy
    };

    // Insert the duplicated tab right after the original
    const originalIndex = this.tabs.findIndex(tab => tab.id === tabId);
    this.tabs.splice(originalIndex + 1, 0, duplicatedTab);

    // Switch to the duplicated tab
    this.activeTabId = duplicatedTab.id;
    this.renderTabs();
    this.notifyTabChange();
    this.saveState();
  }

  private copyRequestUrl(tabId: string): void {
    const tab = this.tabs.find(t => t.id === tabId);
    if (!tab || !tab.request.url) {
      this.showNotification('No URL to copy', 'error');
      return;
    }

    // Copy URL to clipboard
    if (navigator.clipboard) {
      navigator.clipboard.writeText(tab.request.url).then(() => {
        this.showNotification('URL copied to clipboard', 'success');
      }).catch(() => {
        this.showNotification('Failed to copy URL', 'error');
      });
    } else {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = tab.request.url;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        this.showNotification('URL copied to clipboard', 'success');
      } catch (err) {
        this.showNotification('Failed to copy URL', 'error');
      }
      document.body.removeChild(textArea);
    }
  }

  private showNotification(message: string, type: 'success' | 'error'): void {
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${type === 'success' ? 'var(--success-color)' : 'var(--error-color)'};
      color: white;
      padding: 12px 16px;
      border-radius: 4px;
      z-index: 10001;
      font-size: 14px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    `;

    document.body.appendChild(notification);
    setTimeout(() => {
      if (document.body.contains(notification)) {
        document.body.removeChild(notification);
      }
    }, 3000);
  }

  updateTabNameForRequest(requestId: string, newName: string): void {
    // Find all tabs with the given request ID and update their names
    let updated = false;

    this.tabs.forEach(tab => {
      if (tab.request.id === requestId) {
        tab.name = newName;
        tab.request.name = newName;
        updated = true;
      }
    });

    if (updated) {
      this.renderTabs();
      this.saveState();
    }
  }
}