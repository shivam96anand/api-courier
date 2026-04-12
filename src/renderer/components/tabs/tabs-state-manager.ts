import { RequestTab, ApiRequest, ApiResponse } from '../../../shared/types';
import { showConfirmDialog } from '../../utils/confirm-dialog';

export class TabsStateManager {
  private tabs: RequestTab[] = [];
  private activeTabId?: string;
  private onNotifyTabChange: () => void;
  private onShowNotification: (message: string, type: 'success' | 'error') => void;

  constructor(
    onNotifyTabChange: () => void,
    onShowNotification: (message: string, type: 'success' | 'error') => void
  ) {
    this.onNotifyTabChange = onNotifyTabChange;
    this.onShowNotification = onShowNotification;
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

  setTabs(tabs: RequestTab[], activeTabId?: string): void {
    this.tabs = tabs.map((tab) => ({
      ...tab,
      requestMode: tab.requestMode || 'rest',
      restDraft: tab.restDraft ? this.cloneRequest(tab.restDraft) : this.cloneRequest(tab.request),
      soapDraft: tab.soapDraft ? this.cloneRequest(tab.soapDraft) : undefined,
    }));
    this.activeTabId = activeTabId;
  }

  createNewTab(): void {
    const tabNumber = this.tabs.length + 1;
    const newRequest: ApiRequest = {
      id: this.generateId(),
      name: `Untitled Request ${tabNumber}`,
      method: 'GET',
      url: '',
      params: {},
      headers: {
        'User-Agent': 'Restbro/1.0',
        'Accept-Encoding': 'gzip'
      },
    };

    const newTab: RequestTab = {
      id: this.generateId(),
      name: newRequest.name,
      request: newRequest,
      requestMode: 'rest',
      restDraft: this.cloneRequest(newRequest),
      soapDraft: undefined,
      isModified: false,
    };

    this.tabs.push(newTab);
    this.activeTabId = newTab.id;
    this.onNotifyTabChange();
    this.saveState();
  }

  switchToTab(tabId: string): void {
    this.activeTabId = tabId;
    this.onNotifyTabChange();
    this.saveState();
  }

  switchToNextTab(): void {
    if (this.tabs.length <= 1) return;
    const currentIndex = this.tabs.findIndex(tab => tab.id === this.activeTabId);
    if (currentIndex === -1) return;
    const nextIndex = (currentIndex + 1) % this.tabs.length;
    this.activeTabId = this.tabs[nextIndex].id;
    this.onNotifyTabChange();
    this.saveState();
  }

  switchToPrevTab(): void {
    if (this.tabs.length <= 1) return;
    const currentIndex = this.tabs.findIndex(tab => tab.id === this.activeTabId);
    if (currentIndex === -1) return;
    const prevIndex = (currentIndex - 1 + this.tabs.length) % this.tabs.length;
    this.activeTabId = this.tabs[prevIndex].id;
    this.onNotifyTabChange();
    this.saveState();
  }

  closeTab(tabId: string): void {
    const tabIndex = this.tabs.findIndex(tab => tab.id === tabId);
    if (tabIndex === -1) return;

    const tab = this.tabs[tabIndex];

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

    this.onNotifyTabChange();
    this.saveState();
  }

  updateActiveTab(updates: Partial<RequestTab>, markAsModified: boolean = true): void {
    if (!this.activeTabId) return;

    const tabIndex = this.tabs.findIndex(tab => tab.id === this.activeTabId);
    if (tabIndex !== -1) {
      const currentTab = this.tabs[tabIndex];
      this.tabs[tabIndex] = this.mergeTabUpdates(currentTab, updates, markAsModified);
      this.saveState();
    }
  }

  updateTabByRequestId(requestId: string, updates: Partial<RequestTab>, markAsModified: boolean = false): void {
    const tabIndex = this.tabs.findIndex(tab => tab.request.id === requestId);
    if (tabIndex === -1) return;

    const currentTab = this.tabs[tabIndex];
    this.tabs[tabIndex] = this.mergeTabUpdates(currentTab, updates, markAsModified);
    this.saveState();
  }

  openRequestInTab(request: ApiRequest, collectionId?: string): void {
    const existingTab = this.tabs.find(tab => tab.request.id === request.id);

    if (existingTab) {
      this.activeTabId = existingTab.id;
      this.onNotifyTabChange();
      this.saveState();
    } else {
      const requestWithCollection = { ...request, collectionId };
      const newTab: RequestTab = {
        id: this.generateId(),
        name: request.name,
        request: requestWithCollection, // Add collectionId to request
        requestMode: request.soap ? 'soap' : 'rest',
        restDraft: this.cloneRequest(requestWithCollection),
        soapDraft: request.soap ? this.cloneRequest(requestWithCollection) : undefined,
        isModified: false,
        collectionId: collectionId,
      };

      this.tabs.push(newTab);
      this.activeTabId = newTab.id;
      this.onNotifyTabChange();
      this.saveState();
    }
  }

  openRequestInTabWithResponse(request: ApiRequest, response: ApiResponse, collectionId?: string): void {
    const existingTab = this.tabs.find(tab => tab.request.id === request.id);

    if (existingTab) {
      this.activeTabId = existingTab.id;
      this.updateActiveTab({ response }, false);
      this.onNotifyTabChange();
      this.saveState();
    } else {
      const requestWithCollection = { ...request, collectionId };
      const newTab: RequestTab = {
        id: this.generateId(),
        name: request.name,
        request: requestWithCollection, // Add collectionId to request
        requestMode: request.soap ? 'soap' : 'rest',
        restDraft: this.cloneRequest(requestWithCollection),
        soapDraft: request.soap ? this.cloneRequest(requestWithCollection) : undefined,
        response: { ...response },
        isModified: false,
        collectionId: collectionId,
      };

      this.tabs.push(newTab);
      this.activeTabId = newTab.id;
      this.onNotifyTabChange();
      this.saveState();
    }
  }

  closeTabsByRequestId(requestId: string): void {
    const tabsToClose = this.tabs.filter(tab => tab.request.id === requestId);

    if (tabsToClose.length === 0) return;

    this.tabs = this.tabs.filter(tab => tab.request.id !== requestId);

    const wasActiveTabClosed = tabsToClose.some(tab => tab.id === this.activeTabId);
    if (wasActiveTabClosed) {
      if (this.tabs.length > 0) {
        this.activeTabId = this.tabs[0].id;
      } else {
        this.activeTabId = undefined;
      }
    }

    this.onNotifyTabChange();
    this.saveState();
  }

  closeAllTabs(): void {
    if (this.tabs.length === 0) return;

    void showConfirmDialog({
      title: 'Close all tabs?',
      message: `You are about to close ${this.tabs.length} tabs.`,
      confirmLabel: 'Close All',
      cancelLabel: 'Cancel',
      destructive: true
    }).then((confirmed) => {
      if (!confirmed) return;
      this.tabs = [];
      this.activeTabId = undefined;
      this.onNotifyTabChange();
      this.saveState();
    });
  }

  closeOtherTabs(keepTabId: string): void {
    const tabsToClose = this.tabs.filter(tab => tab.id !== keepTabId);
    if (tabsToClose.length === 0) return;

    void showConfirmDialog({
      title: 'Close other tabs?',
      message: `You are about to close ${tabsToClose.length} other tabs.`,
      confirmLabel: 'Close Others',
      cancelLabel: 'Cancel',
      destructive: true
    }).then((confirmed) => {
      if (!confirmed) return;
      this.tabs = this.tabs.filter(tab => tab.id === keepTabId);
      this.activeTabId = keepTabId;
      this.onNotifyTabChange();
      this.saveState();
    });
  }

  duplicateTab(tabId: string): void {
    const originalTab = this.tabs.find(tab => tab.id === tabId);
    if (!originalTab) return;

    const duplicatedRequestId = this.generateId();
    const duplicatedTab: RequestTab = {
      id: this.generateId(),
      name: `${originalTab.name} (Copy)`,
      request: {
        ...originalTab.request,
        id: duplicatedRequestId
      },
      requestMode: originalTab.requestMode || 'rest',
      restDraft: originalTab.restDraft
        ? { ...originalTab.restDraft, id: duplicatedRequestId }
        : undefined,
      soapDraft: originalTab.soapDraft
        ? { ...originalTab.soapDraft, id: duplicatedRequestId }
        : undefined,
      response: originalTab.response ? { ...originalTab.response } : undefined,
      isModified: true
    };

    const originalIndex = this.tabs.findIndex(tab => tab.id === tabId);
    this.tabs.splice(originalIndex + 1, 0, duplicatedTab);

    this.activeTabId = duplicatedTab.id;
    this.onNotifyTabChange();
    this.saveState();
  }

  copyRequestUrl(tabId: string): void {
    const tab = this.tabs.find(t => t.id === tabId);
    if (!tab || !tab.request.url) {
      this.onShowNotification('No URL to copy', 'error');
      return;
    }

    if (navigator.clipboard) {
      navigator.clipboard.writeText(tab.request.url).then(() => {
        this.onShowNotification('URL copied to clipboard', 'success');
      }).catch(() => {
        this.onShowNotification('Failed to copy URL', 'error');
      });
    } else {
      const textArea = document.createElement('textarea');
      textArea.value = tab.request.url;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        this.onShowNotification('URL copied to clipboard', 'success');
      } catch (err) {
        this.onShowNotification('Failed to copy URL', 'error');
      }
      document.body.removeChild(textArea);
    }
  }

  updateTabNameForRequest(requestId: string, newName: string): void {
    let updated = false;

    this.tabs.forEach(tab => {
      if (tab.request.id === requestId) {
        tab.name = newName;
        tab.request.name = newName;
        updated = true;
      }
    });

    if (updated) {
      this.saveState();
    }
  }

  private generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }

  private cloneRequest(request: ApiRequest): ApiRequest {
    return {
      ...request,
      params: Array.isArray(request.params)
        ? request.params.map((param) => ({ ...param }))
        : request.params
          ? { ...request.params }
          : request.params,
      headers: Array.isArray(request.headers)
        ? request.headers.map((header) => ({ ...header }))
        : { ...request.headers },
      body: request.body ? { ...request.body } : request.body,
      auth: request.auth ? { ...request.auth, config: { ...request.auth.config } } : request.auth,
      soap: request.soap ? { ...request.soap } : request.soap,
      variables: request.variables ? { ...request.variables } : request.variables,
    };
  }

  private mergeTabUpdates(currentTab: RequestTab, updates: Partial<RequestTab>, markAsModified: boolean): RequestTab {
    const hasResponseViewStateUpdate = Object.prototype.hasOwnProperty.call(updates, 'responseViewState');
    const responseViewState = hasResponseViewStateUpdate
      ? {
          ...(currentTab.responseViewState || {}),
          ...(updates.responseViewState || {}),
        }
      : currentTab.responseViewState;

    return {
      ...currentTab,
      ...updates,
      responseViewState,
      isModified: markAsModified ? true : currentTab.isModified,
    };
  }

  private saveState(): void {
    const event = new CustomEvent('tabs-changed', {
      detail: {
        tabs: this.tabs,
        activeTabId: this.activeTabId
      }
    });
    document.dispatchEvent(event);
  }
}
