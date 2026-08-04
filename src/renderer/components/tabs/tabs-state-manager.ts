import {
  RequestTab,
  ApiRequest,
  ApiResponse,
  RequestMode,
  ResponseViewState,
} from '../../../shared/types';
import { cloneApiRequest } from '../../../shared/clone-request';
import { showConfirmDialog } from '../../utils/confirm-dialog';

export class TabsStateManager {
  private tabs: RequestTab[] = [];
  private activeTabId?: string;
  private onNotifyTabChange: () => void;
  private onShowNotification: (
    message: string,
    type: 'success' | 'error'
  ) => void;

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
    return this.tabs.find((tab) => tab.id === this.activeTabId);
  }

  getActiveTabId(): string | undefined {
    return this.activeTabId;
  }

  setTabs(tabs: RequestTab[], activeTabId?: string): void {
    this.tabs = tabs.map((tab) => ({
      ...tab,
      requestMode: tab.requestMode || 'rest',
      restDraft: tab.restDraft
        ? this.cloneRequest(tab.restDraft)
        : this.cloneRequest(tab.request),
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
        'User-Agent': 'Restbro',
        'Accept-Encoding': 'gzip',
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
    const currentIndex = this.tabs.findIndex(
      (tab) => tab.id === this.activeTabId
    );
    if (currentIndex === -1) return;
    const nextIndex = (currentIndex + 1) % this.tabs.length;
    this.activeTabId = this.tabs[nextIndex].id;
    this.onNotifyTabChange();
    this.saveState();
  }

  switchToPrevTab(): void {
    if (this.tabs.length <= 1) return;
    const currentIndex = this.tabs.findIndex(
      (tab) => tab.id === this.activeTabId
    );
    if (currentIndex === -1) return;
    const prevIndex = (currentIndex - 1 + this.tabs.length) % this.tabs.length;
    this.activeTabId = this.tabs[prevIndex].id;
    this.onNotifyTabChange();
    this.saveState();
  }

  closeTab(tabId: string): void {
    const tabIndex = this.tabs.findIndex((tab) => tab.id === tabId);
    if (tabIndex === -1) return;

    const tab = this.tabs[tabIndex];

    if (tab.response) {
      const event = new CustomEvent('tab-closed-with-response', {
        detail: {
          request: tab.request,
          response: tab.response,
        },
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

  updateActiveTab(
    updates: Partial<RequestTab>,
    markAsModified: boolean = true
  ): void {
    if (!this.activeTabId) return;

    const tabIndex = this.tabs.findIndex((tab) => tab.id === this.activeTabId);
    if (tabIndex !== -1) {
      const currentTab = this.tabs[tabIndex];
      this.tabs[tabIndex] = this.mergeTabUpdates(
        currentTab,
        updates,
        markAsModified
      );
      this.saveState();
    }
  }

  /**
   * Inline-rename support: updates the tab label and the underlying
   * `request.name`. Marks the tab as modified so the user can save the new
   * name back to the collection.
   */
  renameTab(tabId: string, newName: string): void {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const tab = this.tabs.find((t) => t.id === tabId);
    if (!tab) return;
    if (tab.name === trimmed && tab.request.name === trimmed) return;
    tab.name = trimmed;
    tab.request.name = trimmed;
    tab.isModified = true;
    this.saveState();
    this.onNotifyTabChange();
  }

  updateTabByRequestId(
    requestId: string,
    updates: Partial<RequestTab>,
    markAsModified: boolean = false
  ): void {
    const tabIndex = this.tabs.findIndex((tab) => tab.request.id === requestId);
    if (tabIndex === -1) return;

    const currentTab = this.tabs[tabIndex];
    this.tabs[tabIndex] = this.mergeTabUpdates(
      currentTab,
      updates,
      markAsModified
    );
    this.saveState();
  }

  /**
   * Toggling REST <-> SOAP must not throw away the response captured in the
   * other protocol mode. We stash the currently-active response/view-state into
   * the `fromMode` slot and restore the `toMode` slot into the active fields.
   * Returns the restored response so the caller can re-display it.
   */
  swapModeResponses(
    requestId: string,
    fromMode: RequestMode,
    toMode: RequestMode
  ): { response?: ApiResponse; responseViewState?: ResponseViewState } {
    const tab = this.tabs.find((t) => t.request.id === requestId);
    if (!tab) return {};

    // Stash the active response for the mode we are leaving.
    if (fromMode === 'soap') {
      tab.soapResponse = tab.response;
      tab.soapResponseViewState = tab.responseViewState;
    } else {
      tab.restResponse = tab.response;
      tab.restResponseViewState = tab.responseViewState;
    }

    // Restore whatever we previously stashed for the mode we are entering.
    if (toMode === 'soap') {
      tab.response = tab.soapResponse;
      tab.responseViewState = tab.soapResponseViewState;
    } else {
      tab.response = tab.restResponse;
      tab.responseViewState = tab.restResponseViewState;
    }

    this.saveState();
    return { response: tab.response, responseViewState: tab.responseViewState };
  }

  openRequestInTab(request: ApiRequest, collectionId?: string): void {
    const existingTab = this.tabs.find((tab) => tab.request.id === request.id);

    if (existingTab) {
      this.activeTabId = existingTab.id;
      this.onNotifyTabChange();
      this.saveState();
    } else {
      const requestWithCollection = { ...request, collectionId };
      const newTab: RequestTab = {
        id: this.generateId(),
        name: request.name,
        // Deep-clone so the tab never shares nested references (params/
        // headers/body/auth) with the source collection-tree request.
        request: this.cloneRequest(requestWithCollection),
        requestMode: request.soap ? 'soap' : 'rest',
        restDraft: this.cloneRequest(requestWithCollection),
        soapDraft: request.soap
          ? this.cloneRequest(requestWithCollection)
          : undefined,
        isModified: false,
        collectionId: collectionId,
      };

      this.tabs.push(newTab);
      this.activeTabId = newTab.id;
      this.onNotifyTabChange();
      this.saveState();
    }
  }

  openRequestInTabWithResponse(
    request: ApiRequest,
    response: ApiResponse,
    collectionId?: string
  ): void {
    const existingTab = this.tabs.find((tab) => tab.request.id === request.id);

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
        // Deep-clone so the tab never shares nested references (params/
        // headers/body/auth) with the source collection-tree request.
        request: this.cloneRequest(requestWithCollection),
        requestMode: request.soap ? 'soap' : 'rest',
        restDraft: this.cloneRequest(requestWithCollection),
        soapDraft: request.soap
          ? this.cloneRequest(requestWithCollection)
          : undefined,
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

  /**
   * Load a historical request + response snapshot into the currently active
   * tab. Used by the response panel's "previous responses" dropdown so that
   * opening a past response also restores the exact request that produced it
   * (URL, params, headers, body, auth) — not just the response body.
   *
   * Notifies listeners (fires `tab-changed`) so both the request editor and
   * the response viewer re-render from the updated tab.
   */
  loadHistorySnapshotIntoActiveTab(
    request: ApiRequest,
    response: ApiResponse
  ): void {
    if (!this.activeTabId) return;
    const tab = this.tabs.find((t) => t.id === this.activeTabId);
    if (!tab) return;

    this.updateActiveTab(
      {
        // Deep-clone so the tab never shares nested references with the
        // stored history item.
        request: this.cloneRequest(request),
        requestMode: request.soap ? 'soap' : 'rest',
        restDraft: this.cloneRequest(request),
        soapDraft: request.soap ? this.cloneRequest(request) : undefined,
        response: { ...response },
      },
      true
    );
    this.onNotifyTabChange();
  }

  /**
   * Drop the response stored for a request's tab. Called when the user hits
   * "Clear" in the response panel — without this the tab keeps its response
   * and re-displays it on the next tab switch, making the clear look like it
   * was undone. The response stays recoverable from history via the response
   * panel's previous-responses dropdown.
   */
  clearResponseForRequest(requestId: string): void {
    const tab = this.tabs.find((t) => t.request.id === requestId);
    if (!tab) return;

    tab.response = undefined;
    tab.responseViewState = undefined;

    // Also drop the stash for the mode on screen, otherwise a REST <-> SOAP
    // round trip would resurrect the cleared response.
    if (tab.requestMode === 'soap') {
      tab.soapResponse = undefined;
      tab.soapResponseViewState = undefined;
    } else {
      tab.restResponse = undefined;
      tab.restResponseViewState = undefined;
    }

    this.saveState();
  }

  closeTabsByRequestId(requestId: string): void {
    const tabsToClose = this.tabs.filter((tab) => tab.request.id === requestId);

    if (tabsToClose.length === 0) return;

    this.tabs = this.tabs.filter((tab) => tab.request.id !== requestId);

    const wasActiveTabClosed = tabsToClose.some(
      (tab) => tab.id === this.activeTabId
    );
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
      destructive: true,
    }).then((confirmed) => {
      if (!confirmed) return;
      this.tabs = [];
      this.activeTabId = undefined;
      this.onNotifyTabChange();
      this.saveState();
    });
  }

  closeOtherTabs(keepTabId: string): void {
    const tabsToClose = this.tabs.filter((tab) => tab.id !== keepTabId);
    if (tabsToClose.length === 0) return;

    void showConfirmDialog({
      title: 'Close other tabs?',
      message: `You are about to close ${tabsToClose.length} other tabs.`,
      confirmLabel: 'Close Others',
      cancelLabel: 'Cancel',
      destructive: true,
    }).then((confirmed) => {
      if (!confirmed) return;
      this.tabs = this.tabs.filter((tab) => tab.id === keepTabId);
      this.activeTabId = keepTabId;
      this.onNotifyTabChange();
      this.saveState();
    });
  }

  duplicateTab(tabId: string): void {
    const originalTab = this.tabs.find((tab) => tab.id === tabId);
    if (!originalTab) return;

    const duplicatedRequestId = this.generateId();
    const duplicatedTab: RequestTab = {
      id: this.generateId(),
      name: `${originalTab.name} (Copy)`,
      request: {
        ...originalTab.request,
        id: duplicatedRequestId,
      },
      requestMode: originalTab.requestMode || 'rest',
      restDraft: originalTab.restDraft
        ? { ...originalTab.restDraft, id: duplicatedRequestId }
        : undefined,
      soapDraft: originalTab.soapDraft
        ? { ...originalTab.soapDraft, id: duplicatedRequestId }
        : undefined,
      response: originalTab.response ? { ...originalTab.response } : undefined,
      isModified: true,
    };

    const originalIndex = this.tabs.findIndex((tab) => tab.id === tabId);
    this.tabs.splice(originalIndex + 1, 0, duplicatedTab);

    this.activeTabId = duplicatedTab.id;
    this.onNotifyTabChange();
    this.saveState();
  }

  copyRequestUrl(tabId: string): void {
    const tab = this.tabs.find((t) => t.id === tabId);
    if (!tab || !tab.request.url) {
      this.onShowNotification('No URL to copy', 'error');
      return;
    }

    if (navigator.clipboard) {
      navigator.clipboard
        .writeText(tab.request.url)
        .then(() => {
          this.onShowNotification('URL copied to clipboard', 'success');
        })
        .catch(() => {
          this.onShowNotification('Failed to copy URL', 'error');
        });
    }
  }

  updateTabNameForRequest(requestId: string, newName: string): void {
    let updated = false;

    this.tabs.forEach((tab) => {
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

  reorderTab(
    sourceTabId: string,
    targetTabId: string,
    dropBefore: boolean
  ): void {
    const sourceIndex = this.tabs.findIndex((t) => t.id === sourceTabId);
    const targetIndex = this.tabs.findIndex((t) => t.id === targetTabId);
    if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex)
      return;

    const [removed] = this.tabs.splice(sourceIndex, 1);
    let insertIndex = this.tabs.findIndex((t) => t.id === targetTabId);
    if (insertIndex === -1) {
      this.tabs.push(removed);
    } else {
      if (!dropBefore) insertIndex++;
      this.tabs.splice(insertIndex, 0, removed);
    }

    this.onNotifyTabChange();
    this.saveState();
  }

  private generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }

  private cloneRequest(request: ApiRequest): ApiRequest {
    return cloneApiRequest(request);
  }

  private mergeTabUpdates(
    currentTab: RequestTab,
    updates: Partial<RequestTab>,
    markAsModified: boolean
  ): RequestTab {
    const hasResponseViewStateUpdate = Object.prototype.hasOwnProperty.call(
      updates,
      'responseViewState'
    );
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
        activeTabId: this.activeTabId,
      },
    });
    document.dispatchEvent(event);
  }
}
