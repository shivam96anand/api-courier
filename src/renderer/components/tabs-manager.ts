import { RequestTab, ApiRequest, ApiResponse } from '../../shared/types';
import { TabsEventHandler } from './tabs/tabs-event-handler';
import { TabsRenderer } from './tabs/tabs-renderer';
import { TabsStateManager } from './tabs/tabs-state-manager';

export class TabsManager {
  private stateManager: TabsStateManager;
  private renderer: TabsRenderer;
  private eventHandler: TabsEventHandler;

  constructor() {
    this.renderer = new TabsRenderer();

    this.stateManager = new TabsStateManager(
      () => this.notifyTabChange(),
      (message, type) => this.eventHandler.showNotification(message, type)
    );

    this.eventHandler = new TabsEventHandler(
      () => this.createNewTabAndRender(),
      (tabId) => this.switchToTabAndRender(tabId),
      (tabId) => this.closeTabAndRender(tabId),
      (event, tabId) => this.showTabContextMenu(event, tabId),
      (updates, markAsModified) =>
        this.updateActiveTabAndRender(updates, markAsModified),
      (requestId) => this.closeTabsByRequestIdAndRender(requestId),
      (requestId, newName) =>
        this.updateTabNameForRequestAndRender(requestId, newName),
      (requestId, updates, markAsModified) =>
        this.updateTabByRequestIdAndRender(requestId, updates, markAsModified)
    );
  }

  initialize(): void {
    this.eventHandler.setupTabEvents();
    this.eventHandler.setupEventListeners();
    this.setupKeyboardShortcuts();
    this.setupTabReorderListener();
    this.renderer.renderTabs(
      this.stateManager.getTabs(),
      this.stateManager.getActiveTabId()
    );
  }

  private isApiTabActive(): boolean {
    const apiTab = document.getElementById('api-tab');
    return apiTab?.classList.contains('active') ?? false;
  }

  private setupTabReorderListener(): void {
    document.addEventListener('tab-reorder', ((e: CustomEvent) => {
      const { sourceTabId, targetTabId, dropBefore } = e.detail;
      this.stateManager.reorderTab(sourceTabId, targetTabId, dropBefore);
      this.renderer.renderTabs(
        this.stateManager.getTabs(),
        this.stateManager.getActiveTabId()
      );
    }) as EventListener);
  }

  private setupKeyboardShortcuts(): void {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;

    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if (!this.isApiTabActive()) return;

      const key = e.key.toLowerCase();

      // Ctrl+Tab / Ctrl+Shift+Tab for tab navigation
      if (key === 'tab' && e.ctrlKey) {
        e.preventDefault();
        if (e.shiftKey) {
          this.switchToPrevTab();
        } else {
          this.switchToNextTab();
        }
        return;
      }

      // Cmd+W (Mac) or Ctrl+W (Windows) to close active tab
      const modifierKey = isMac ? e.metaKey : e.ctrlKey;
      if (modifierKey && key === 'w') {
        e.preventDefault();
        this.closeActiveTab();
      }
    });
  }

  private createNewTabAndRender(): void {
    this.stateManager.createNewTab();
    this.renderer.renderTabs(
      this.stateManager.getTabs(),
      this.stateManager.getActiveTabId()
    );
  }

  private switchToTabAndRender(tabId: string): void {
    this.stateManager.switchToTab(tabId);
    this.renderer.renderTabs(
      this.stateManager.getTabs(),
      this.stateManager.getActiveTabId()
    );
  }

  private closeTabAndRender(tabId: string): void {
    this.stateManager.closeTab(tabId);
    this.renderer.renderTabs(
      this.stateManager.getTabs(),
      this.stateManager.getActiveTabId()
    );
  }

  private updateActiveTabAndRender(
    updates: Partial<RequestTab>,
    markAsModified: boolean
  ): void {
    this.stateManager.updateActiveTab(updates, markAsModified);
    this.renderer.renderTabs(
      this.stateManager.getTabs(),
      this.stateManager.getActiveTabId()
    );
  }

  private updateTabByRequestIdAndRender(
    requestId: string,
    updates: Partial<RequestTab>,
    markAsModified: boolean
  ): void {
    this.stateManager.updateTabByRequestId(requestId, updates, markAsModified);
    this.renderer.renderTabs(
      this.stateManager.getTabs(),
      this.stateManager.getActiveTabId()
    );
  }

  private closeTabsByRequestIdAndRender(requestId: string): void {
    this.stateManager.closeTabsByRequestId(requestId);
    this.renderer.renderTabs(
      this.stateManager.getTabs(),
      this.stateManager.getActiveTabId()
    );
  }

  private updateTabNameForRequestAndRender(
    requestId: string,
    newName: string
  ): void {
    this.stateManager.updateTabNameForRequest(requestId, newName);
    this.renderer.renderTabs(
      this.stateManager.getTabs(),
      this.stateManager.getActiveTabId()
    );
  }

  private showTabContextMenu(event: MouseEvent, tabId: string): void {
    const tab = this.stateManager.getTabs().find((t) => t.id === tabId);
    if (!tab) return;

    this.eventHandler.showTabContextMenu(
      event,
      tab,
      (tabId) => this.duplicateTabAndRender(tabId),
      (tabId) => this.stateManager.copyRequestUrl(tabId),
      () => this.closeAllTabsAndRender(),
      (keepTabId) => this.closeOtherTabsAndRender(keepTabId)
    );
  }

  private duplicateTabAndRender(tabId: string): void {
    this.stateManager.duplicateTab(tabId);
    this.renderer.renderTabs(
      this.stateManager.getTabs(),
      this.stateManager.getActiveTabId()
    );
  }

  private closeAllTabsAndRender(): void {
    this.stateManager.closeAllTabs();
    this.renderer.renderTabs(
      this.stateManager.getTabs(),
      this.stateManager.getActiveTabId()
    );
  }

  private closeOtherTabsAndRender(keepTabId: string): void {
    this.stateManager.closeOtherTabs(keepTabId);
    this.renderer.renderTabs(
      this.stateManager.getTabs(),
      this.stateManager.getActiveTabId()
    );
  }

  closeActiveTab(): void {
    const activeTabId = this.stateManager.getActiveTabId();
    if (activeTabId) {
      this.closeTabAndRender(activeTabId);
    }
  }

  switchToNextTab(): void {
    this.stateManager.switchToNextTab();
    this.renderer.renderTabs(
      this.stateManager.getTabs(),
      this.stateManager.getActiveTabId()
    );
  }

  switchToPrevTab(): void {
    this.stateManager.switchToPrevTab();
    this.renderer.renderTabs(
      this.stateManager.getTabs(),
      this.stateManager.getActiveTabId()
    );
  }

  private notifyTabChange(): void {
    const activeTab = this.stateManager.getActiveTab();
    const event = new CustomEvent('tab-changed', {
      detail: { activeTab },
    });
    document.dispatchEvent(event);
  }

  setTabs(tabs: RequestTab[], activeTabId?: string): void {
    this.stateManager.setTabs(tabs, activeTabId);
    this.renderer.renderTabs(
      this.stateManager.getTabs(),
      this.stateManager.getActiveTabId()
    );
    this.notifyTabChange();
  }

  getTabs(): RequestTab[] {
    return this.stateManager.getTabs();
  }

  getActiveTab(): RequestTab | undefined {
    return this.stateManager.getActiveTab();
  }

  getActiveTabId(): string | undefined {
    return this.stateManager.getActiveTabId();
  }

  updateActiveTab(
    updates: Partial<RequestTab>,
    markAsModified: boolean = true
  ): void {
    this.stateManager.updateActiveTab(updates, markAsModified);
    this.renderer.renderTabs(
      this.stateManager.getTabs(),
      this.stateManager.getActiveTabId()
    );
  }

  openRequestInTab(request: ApiRequest, collectionId?: string): void {
    this.stateManager.openRequestInTab(request, collectionId);
    this.renderer.renderTabs(
      this.stateManager.getTabs(),
      this.stateManager.getActiveTabId()
    );
  }

  openRequestInTabWithResponse(
    request: ApiRequest,
    response: ApiResponse,
    collectionId?: string
  ): void {
    this.stateManager.openRequestInTabWithResponse(
      request,
      response,
      collectionId
    );
    this.renderer.renderTabs(
      this.stateManager.getTabs(),
      this.stateManager.getActiveTabId()
    );
  }

  closeTabsByRequestId(requestId: string): void {
    this.stateManager.closeTabsByRequestId(requestId);
    this.renderer.renderTabs(
      this.stateManager.getTabs(),
      this.stateManager.getActiveTabId()
    );
  }

  updateTabNameForRequest(requestId: string, newName: string): void {
    this.stateManager.updateTabNameForRequest(requestId, newName);
    this.renderer.renderTabs(
      this.stateManager.getTabs(),
      this.stateManager.getActiveTabId()
    );
  }
}
