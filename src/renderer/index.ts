import './styles/main.scss';
import { ApiCourierAPI } from '../preload/index';
import { AppManager } from './components/app-manager';
import { TabsManager } from './components/tabs-manager';
import { CollectionsManager } from './components/collections-manager';
import { RequestManager } from './components/request-manager';
import { ResponseManager } from './components/response-manager';
import { HistoryManager } from './components/history-manager';
import { LoadTestManager } from './components/loadtest-manager';
import { MockServerTabManager } from './components/MockServerTabManager';
import { JsonViewerTab } from './components/JsonViewerTab';
import { JsonCompareTabManager } from './components/JsonCompareTab';
import { AskAiTab } from './components/AskAiTab';
import { NotepadManager } from './components/NotepadManager';
import { ThemeManager } from './utils/theme-manager';
import { resizeManager } from './utils/resize-manager';
import { EnvironmentManager } from './components/environments/environment-manager';
import { ImportManager } from './components/import/import-manager';
import { setupEventListeners } from './event-listeners';
import { BackupManager } from './components/backup-manager';
import { ThemeOnboarding } from './components/theme-onboarding';
import { sanitizeHistoryForPersistence, sanitizeTabsForPersistence } from './utils/response-persistence';

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
  private mockServerManager: MockServerTabManager;
  private jsonViewerTab: JsonViewerTab;
  private jsonCompareTab: JsonCompareTabManager;
  private askAiTab: AskAiTab;
  private notepadManager: NotepadManager;
  private themeManager: ThemeManager;
  private environmentManager: EnvironmentManager;
  private importManager: ImportManager;
  private backupManager: BackupManager;
  private themeOnboarding: ThemeOnboarding;

  constructor() {
    this.themeManager = new ThemeManager();
    this.appManager = new AppManager();
    this.tabsManager = new TabsManager();
    this.collectionsManager = new CollectionsManager();
    this.requestManager = new RequestManager();
    this.environmentManager = new EnvironmentManager();
    this.importManager = new ImportManager(this.handleImportComplete.bind(this));
    this.backupManager = new BackupManager();
    this.themeOnboarding = new ThemeOnboarding(this.themeManager);

    // Get container elements for managers that require them
    const responseContainer = document.getElementById('response-area') || document.body;
    const askAiContainer = document.getElementById('ask-ai-tab') || document.body;

    this.responseManager = new ResponseManager(responseContainer);
    this.historyManager = new HistoryManager();
    this.loadTestManager = new LoadTestManager();
    this.mockServerManager = new MockServerTabManager();
    this.jsonViewerTab = new JsonViewerTab();
    this.jsonCompareTab = new JsonCompareTabManager();
    this.askAiTab = new AskAiTab(askAiContainer);
    this.notepadManager = new NotepadManager(document.getElementById('notepad-tab'));
  }

  async initialize(): Promise<void> {
    // Set up event listeners first
    setupEventListeners({
      tabsManager: this.tabsManager,
      collectionsManager: this.collectionsManager,
      historyManager: this.historyManager,
      environmentManager: this.environmentManager,
      askAiTab: this.askAiTab,
      saveState: this.saveState.bind(this),
    });

    // Initialize managers
    this.themeManager.initialize();
    this.appManager.initialize();
    this.tabsManager.initialize();
    this.collectionsManager.initialize();
    this.requestManager.initialize();
    this.responseManager.initialize();
    this.historyManager.initialize();
    this.environmentManager.initialize();
    this.backupManager.initialize();
    await this.loadTestManager.initialize();
    await this.mockServerManager.initialize();
    this.askAiTab.initialize();
    await this.notepadManager.initialize();
    resizeManager.initialize();

    // Set up import button
    this.setupImportButton();

    // Load initial state after all managers are initialized
    await this.loadInitialState();
    await this.themeOnboarding.maybeShow();
    this.bindThemeButton();

    // Set up auto-save last
    this.setupAutoSave();
  }

  private async loadInitialState(): Promise<void> {
    try {
      const state = await window.apiCourier.store.get();
      this.themeManager.setTheme(state.theme);
      this.appManager.setNavOrder(state.navOrder);
      await this.collectionsManager.setCollections(state.collections);
      this.tabsManager.setTabs(state.openTabs, state.activeTabId);
      this.historyManager.setHistory((state as any).history || []);
      this.environmentManager.setEnvironments((state as any).environments || []);
      this.environmentManager.setActiveEnvironment((state as any).activeEnvironmentId);
    } catch (error) {
      console.error('Failed to load initial state:', error);
    }
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
      const tabs = this.tabsManager.getTabs();
      const history = this.historyManager.getHistory();

      const state = {
        collections: this.collectionsManager.getCollections(),
        openTabs: sanitizeTabsForPersistence(tabs),
        history: sanitizeHistoryForPersistence(history),
        activeTabId: this.tabsManager.getActiveTabId(),
        theme: this.themeManager.getCurrentTheme(),
        navOrder: this.appManager.getNavOrder(),
        environments: this.environmentManager.getEnvironments(),
        activeEnvironmentId: this.environmentManager.getActiveEnvironmentId(),
      };
      await window.apiCourier.store.set(state);
    } catch (error) {
      console.error('Failed to save state:', error);
    }
  }

  private bindThemeButton(): void {
    const button = document.getElementById('theme-button');
    if (!button) return;
    button.addEventListener('click', () => {
      this.themeOnboarding.openPicker();
    });
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const app = new ApiCourierRenderer();
  await app.initialize();
});
