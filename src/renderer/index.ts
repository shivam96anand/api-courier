import './styles/main.scss';
import { ApiCourierAPI } from '../preload/index';
import { AppManager } from './components/app-manager';
import { TabsManager } from './components/tabs-manager';
import { CollectionsManager } from './components/collections-manager';
import { RequestManager } from './components/request-manager';
import { ResponseManager } from './components/response-manager';
import { HistoryManager } from './components/history-manager';
import { LoadTestManager } from './components/loadtest-manager';
import { JsonViewerTab } from './components/JsonViewerTab';
import { ThemeManager } from './utils/theme-manager';
import { resizeManager } from './utils/resize-manager';

declare global {
  interface Window {
    apiCourier: ApiCourierAPI;
  }
}

class ApiCourierRenderer {
  private appManager: AppManager;
  private tabsManager: TabsManager;
  private collectionsManager: CollectionsManager;
  private requestManager: RequestManager;
  private responseManager: ResponseManager;
  private historyManager: HistoryManager;
  private loadTestManager: LoadTestManager;
  private jsonViewerTab: JsonViewerTab;
  private themeManager: ThemeManager;

  constructor() {
    this.themeManager = new ThemeManager();
    this.appManager = new AppManager();
    this.tabsManager = new TabsManager();
    this.collectionsManager = new CollectionsManager();
    this.requestManager = new RequestManager();
    this.responseManager = new ResponseManager();
    this.historyManager = new HistoryManager();
    this.loadTestManager = new LoadTestManager();
    this.jsonViewerTab = new JsonViewerTab();
  }

  async initialize(): Promise<void> {
    // Set up event listeners first
    this.setupEventListeners();

    // Initialize managers
    this.themeManager.initialize();
    this.appManager.initialize();
    this.tabsManager.initialize();
    this.collectionsManager.initialize();
    this.requestManager.initialize();
    this.responseManager.initialize();
    this.historyManager.initialize();
    await this.loadTestManager.initialize();
    resizeManager.initialize();

    // Load initial state after all managers are initialized
    await this.loadInitialState();

    // Set up auto-save last
    this.setupAutoSave();
  }

  private async loadInitialState(): Promise<void> {
    try {
      const state = await window.apiCourier.store.get();
      this.themeManager.setTheme(state.theme);
      this.collectionsManager.setCollections(state.collections);
      this.tabsManager.setTabs(state.openTabs, state.activeTabId);
      this.historyManager.setHistory((state as any).history || []);
    } catch (error) {
      console.error('Failed to load initial state:', error);
    }
  }

  private setupEventListeners(): void {
    window.addEventListener('beforeunload', () => {
      this.saveState();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.saveState();
      }
    });

    // Listen for requests to be opened in tabs
    document.addEventListener('open-request-in-tab', (e: Event) => {
      const customEvent = e as CustomEvent;
      const request = customEvent.detail.request;
      const collectionId = customEvent.detail.collectionId;

      if (request) {
        // Check if we have a previous response for this request
        const lastData = this.historyManager.getLastResponseForRequest(request.id);

        if (lastData) {
          // Open tab with the last known state (request + response)
          this.tabsManager.openRequestInTabWithResponse(lastData.request, lastData.response, collectionId);
        } else {
          // Open tab with just the request
          this.tabsManager.openRequestInTab(request, collectionId);
        }
      }
    });

    // Listen for tab changes to trigger state saves
    document.addEventListener('tabs-changed', () => {
      this.saveState();
    });

    // Listen for history changes to trigger state saves
    document.addEventListener('history-changed', () => {
      this.saveState();
    });

    // Listen for request updates to save back to collection
    document.addEventListener('request-updated', (e: Event) => {
      const customEvent = e as CustomEvent;
      const updatedRequest = customEvent.detail.request;

      if (updatedRequest) {
        const activeTab = this.tabsManager.getActiveTab();

        // If this tab belongs to a collection, save the changes back to the collection
        if (activeTab && activeTab.collectionId) {
          this.collectionsManager.updateCollectionRequest(activeTab.collectionId, updatedRequest);
        }
      }
    });

    // Listen for collection changes to trigger state saves
    document.addEventListener('collections-changed', () => {
      this.saveState();
    });

    // Listen for tab changes to update collection selection
    document.addEventListener('tab-changed', (e: Event) => {
      const customEvent = e as CustomEvent;
      const activeTab = customEvent.detail.activeTab;

      // If the active tab belongs to a collection, select that collection
      if (activeTab && activeTab.collectionId) {
        this.collectionsManager.setSelectedCollection(activeTab.collectionId);
      } else if (!activeTab) {
        // If no active tab, clear collection selection
        this.collectionsManager.clearSelection();
      }
    });
  }

  private setupAutoSave(): void {
    // Auto-save every 30 seconds to ensure no data loss
    setInterval(() => {
      this.saveState();
    }, 30000);
  }

  private async saveState(): Promise<void> {
    try {
      const state = {
        collections: this.collectionsManager.getCollections(),
        openTabs: this.tabsManager.getTabs(),
        history: this.historyManager.getHistory(),
        activeTabId: this.tabsManager.getActiveTabId(),
        theme: this.themeManager.getCurrentTheme(),
      };
      await window.apiCourier.store.set(state);
    } catch (error) {
      console.error('Failed to save state:', error);
    }
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const app = new ApiCourierRenderer();
  await app.initialize();
});