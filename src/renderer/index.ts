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
import { JsonCompareTabManager } from './components/JsonCompareTab';
import { AskAiTab } from './components/AskAiTab';
import { NotepadManager } from './components/NotepadManager';
import { ThemeManager } from './utils/theme-manager';
import { resizeManager } from './utils/resize-manager';
import { EnvironmentManager } from './components/environments/environment-manager';
import { ImportManager } from './components/import/import-manager';
import { VariableEditDialog } from './components/request/variable-edit-dialog';

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
  private jsonCompareTab: JsonCompareTabManager;
  private askAiTab: AskAiTab;
  private notepadManager: NotepadManager;
  private themeManager: ThemeManager;
  private environmentManager: EnvironmentManager;
  private importManager: ImportManager;

  constructor() {
    this.themeManager = new ThemeManager();
    this.appManager = new AppManager();
    this.tabsManager = new TabsManager();
    this.collectionsManager = new CollectionsManager();
    this.requestManager = new RequestManager();
    this.environmentManager = new EnvironmentManager();
    this.importManager = new ImportManager(this.handleImportComplete.bind(this));

    // Get container elements for managers that require them
    const responseContainer = document.getElementById('response-area') || document.body;
    const askAiContainer = document.getElementById('ask-ai-tab') || document.body;

    this.responseManager = new ResponseManager(responseContainer);
    this.historyManager = new HistoryManager();
    this.loadTestManager = new LoadTestManager();
    this.jsonViewerTab = new JsonViewerTab();
    this.jsonCompareTab = new JsonCompareTabManager();
    this.askAiTab = new AskAiTab(askAiContainer);
    this.notepadManager = new NotepadManager(document.getElementById('notepad-tab'));
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
    this.environmentManager.initialize();
    await this.loadTestManager.initialize();
    this.askAiTab.initialize();
    await this.notepadManager.initialize();
    resizeManager.initialize();

    // Set up import button
    this.setupImportButton();

    // Load initial state after all managers are initialized
    await this.loadInitialState();

    // Set up auto-save last
    this.setupAutoSave();
  }

  private async loadInitialState(): Promise<void> {
    try {
      const state = await window.apiCourier.store.get();
      this.themeManager.setTheme(state.theme);
      await this.collectionsManager.setCollections(state.collections);
      this.tabsManager.setTabs(state.openTabs, state.activeTabId);
      this.historyManager.setHistory((state as any).history || []);
      this.environmentManager.setEnvironments((state as any).environments || []);
      this.environmentManager.setActiveEnvironment((state as any).activeEnvironmentId);
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

    // Listen for Ask AI requests - open with context from response viewer
    document.addEventListener('open-ask-ai', (e: Event) => {
      const customEvent = e as CustomEvent;
      const response = customEvent.detail?.response;
      // Get the current request from tabs manager
      const activeTab = this.tabsManager.getActiveTab();
      const request = activeTab?.request;
      this.askAiTab.openWithContext(request, response);
    });

    // Listen for tab switching requests (for Ask AI to switch tabs)
    document.addEventListener('switch-to-tab', (e: Event) => {
      const customEvent = e as CustomEvent;
      const tabName = customEvent.detail.tabName;

      if (tabName) {
        // Use the app manager to switch tabs
        const navTab = document.querySelector(`[data-tab="${tabName}"]`) as HTMLElement;
        if (navTab) {
          navTab.click();
        }
      }
    });

    // Listen for variable edit requests from tooltips
    document.addEventListener('edit-variable-requested', async (e: Event) => {
      const customEvent = e as CustomEvent;
      const { variableName, value, source } = customEvent.detail;

      // Get current state to populate the dialog
      const state = await window.apiCourier.store.get();
      const activeTab = this.tabsManager.getActiveTab();
      const collectionId = activeTab?.collectionId;

      const result = await VariableEditDialog.show(
        variableName,
        value,
        source,
        state.environments || [],
        state.activeEnvironmentId,
        state.globals || { variables: {} },
        collectionId,
        state.collections || []
      );

      if (result) {
        try {
          if (result.source === 'environment' && result.environmentId) {
            // Update environment variable
            const envIndex = state.environments.findIndex((e: any) => e.id === result.environmentId);
            if (envIndex !== -1) {
              state.environments[envIndex].variables[result.variableName] = result.newValue;
              await window.apiCourier.store.set({ environments: state.environments });
              this.environmentManager.setEnvironments(state.environments);
              document.dispatchEvent(new CustomEvent('environment-changed'));
            }
          } else if (result.source === 'globals') {
            // Update global variable
            const globals = state.globals || { variables: {} };
            globals.variables[result.variableName] = result.newValue;
            await window.apiCourier.store.set({ globals });
            document.dispatchEvent(new CustomEvent('globals-updated'));
          } else if (result.source === 'folder' && result.folderId) {
            // Update folder variable
            await window.apiCourier.collection.update(result.folderId, {
              variables: { 
                ...(this.collectionsManager.getCollections().find(c => c.id === result.folderId)?.variables || {}),
                [result.variableName]: result.newValue 
              }
            });
            // Refresh collections
            const updatedState = await window.apiCourier.store.get();
            await this.collectionsManager.setCollections(updatedState.collections);
            document.dispatchEvent(new CustomEvent('folder-variables-changed', {
              detail: { folderId: result.folderId }
            }));
          }
        } catch (error) {
          console.error('Failed to save variable:', error);
        }
      }
    });
  }

  private setupAutoSave(): void {
    // Auto-save every 30 seconds to ensure no data loss
    setInterval(() => {
      this.saveState();
    }, 30000);
  }

  private setupImportButton(): void {
    const importBtn = document.getElementById('btn-import');
    if (importBtn) {
      importBtn.addEventListener('click', () => {
        this.importManager.showImportDialog();
      });
    }
  }

  private async handleImportComplete(): Promise<void> {
    // Reload state after import to show new collections and environments
    await this.loadInitialState();
  }

  private async saveState(): Promise<void> {
    try {
      const state = {
        collections: this.collectionsManager.getCollections(),
        openTabs: this.tabsManager.getTabs(),
        history: this.historyManager.getHistory(),
        activeTabId: this.tabsManager.getActiveTabId(),
        theme: this.themeManager.getCurrentTheme(),
        environments: this.environmentManager.getEnvironments(),
        activeEnvironmentId: this.environmentManager.getActiveEnvironmentId(),
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
