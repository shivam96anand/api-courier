import './styles/main.scss';

if (process.env.NODE_ENV !== 'development') {
  console.log = () => {};
  console.debug = () => {};
  console.info = () => {};
}

import { RestbroAPI } from '../preload/index';
import { AppManager } from './components/app-manager';
import { TabsManager } from './components/tabs-manager';
import { CollectionsManager } from './components/collections-manager';
import { RequestManager } from './components/request-manager';
import { ResponseManager } from './components/response-manager';
import { HistoryManager } from './components/history-manager';
import { LoadTestManager } from './components/loadtest-manager';
import { MockServerTabManager } from './components/MockServerTabManager';
import { JsonCompareTabManager } from './components/JsonCompareTab';
import { AskAiTab } from './components/AskAiTab';
import { NotepadManager } from './components/NotepadManager';
import { CurlToolManager } from './components/CurlToolManager';
import { UpdateNotificationManager } from './components/update-notification-manager';
import { SpeedTestManager } from './components/speed-test-manager';
import { ToastManager } from './components/toast-manager';
import { HistoryPanel } from './components/history-panel';
import { SendOptionsManager } from './components/request/send-options-manager';
import { ThemeManager } from './utils/theme-manager';
import { resizeManager } from './utils/resize-manager';
import { EnvironmentManager } from './components/environments/environment-manager';
import { ImportManager } from './components/import/import-manager';
import { setupEventListeners } from './event-listeners';
import { setupMenuActions } from './components/menu-action-router';
import { BackupManager } from './components/backup-manager';
import { ThemeOnboarding } from './components/theme-onboarding';
import { LayoutToggleManager } from './components/layout-toggle-manager';
import { SettingsModal } from './components/settings/settings-modal';
import {
  sanitizeHistoryForPersistence,
  sanitizeTabsForPersistence,
} from './utils/response-persistence';
import { hydrateBodyFontSize } from './utils/body-font-size';
import { warmUpMonacoLanguages } from './components/request/monaco-tokenization';

declare global {
  interface Window {
    restbro: RestbroAPI;
  }
}

class RestbroRenderer {
  private appManager: AppManager;
  private tabsManager: TabsManager;
  private collectionsManager: CollectionsManager;
  private requestManager: RequestManager;
  private responseManager: ResponseManager;
  private historyManager: HistoryManager;
  private loadTestManager: LoadTestManager;
  private mockServerManager: MockServerTabManager;
  private jsonCompareTab: JsonCompareTabManager;
  private askAiTab: AskAiTab;
  private notepadManager: NotepadManager;
  private curlToolManager: CurlToolManager;
  private themeManager: ThemeManager;
  private environmentManager: EnvironmentManager;
  private importManager: ImportManager;
  private backupManager: BackupManager;
  private themeOnboarding: ThemeOnboarding;
  private layoutToggleManager: LayoutToggleManager;
  private settingsModal: SettingsModal;
  private updateNotificationManager: UpdateNotificationManager;
  private speedTestManager: SpeedTestManager;
  private toastManager: ToastManager;
  private historyPanel: HistoryPanel;
  private sendOptionsManager!: SendOptionsManager;
  private autoSaveTimer: number | null = null;

  constructor() {
    this.themeManager = new ThemeManager();
    this.appManager = new AppManager();
    this.tabsManager = new TabsManager();
    this.collectionsManager = new CollectionsManager();
    this.requestManager = new RequestManager();
    this.environmentManager = new EnvironmentManager();
    this.importManager = new ImportManager(
      this.handleImportComplete.bind(this)
    );
    this.backupManager = new BackupManager({
      onBeforeRestore: () => this.stopAutoSave(),
    });
    this.themeOnboarding = new ThemeOnboarding(this.themeManager);
    this.layoutToggleManager = new LayoutToggleManager();
    this.settingsModal = new SettingsModal({
      onTimeoutChange: (ms) => this.handleTimeoutChange(ms),
      onLayoutChange: (mode) => this.handleLayoutChange(mode),
    });
    this.updateNotificationManager = new UpdateNotificationManager();
    this.speedTestManager = new SpeedTestManager();
    this.toastManager = new ToastManager();
    this.historyManager = new HistoryManager();
    this.historyPanel = new HistoryPanel(this.historyManager);

    // Get container elements for managers that require them
    const responseContainer =
      document.getElementById('response-area') || document.body;
    const askAiContainer =
      document.getElementById('ask-ai-tab') || document.body;

    this.responseManager = new ResponseManager(responseContainer);
    this.loadTestManager = new LoadTestManager();
    this.mockServerManager = new MockServerTabManager();
    this.jsonCompareTab = new JsonCompareTabManager();
    this.askAiTab = new AskAiTab(askAiContainer);
    this.notepadManager = new NotepadManager(
      document.getElementById('notepad-tab')
    );
    this.curlToolManager = new CurlToolManager();
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

    // Route native application-menu commands to existing managers/DOM events.
    setupMenuActions({
      tabsManager: this.tabsManager,
      notepadManager: this.notepadManager,
      themeManager: this.themeManager,
      themeOnboarding: this.themeOnboarding,
      settingsModal: this.settingsModal,
      saveState: this.saveState.bind(this),
    });

    // Initialize synchronous managers (fast, no I/O)
    this.themeManager.initialize();
    this.appManager.initialize();
    // Register the OS file-open bridge early (before the async inits below) so
    // an "Open with Restbro" on a .json/.md/etc. is never missed on cold start.
    this.setupNotepadFileOpen();
    this.tabsManager.initialize();
    this.collectionsManager.initialize();
    this.requestManager.initialize();
    this.responseManager.initialize();
    this.historyManager.initialize();
    this.environmentManager.initialize();
    this.backupManager.initialize();
    this.askAiTab.initialize();
    this.curlToolManager.initialize();
    this.updateNotificationManager.initialize();
    this.speedTestManager.initialize();
    this.toastManager.initialize();
    this.historyPanel.initialize();
    resizeManager.initialize();

    // Split-button Send-options menu (scheduled/interval/N-times/load-test).
    // Needs tabsManager for active-request context. Must run after
    // requestManager so the Send button exists to be driven.
    this.sendOptionsManager = new SendOptionsManager(this.tabsManager);
    this.sendOptionsManager.initialize();

    // Parallelize independent async initializations
    await Promise.all([
      this.loadTestManager.initialize(),
      this.mockServerManager.initialize(),
    ]);

    // Wire up lazy init for heavy tabs (Monaco / React / MUI)
    this.setupLazyTabInit();
    this.setupOpenInNotepad();

    // Set up import button
    this.setupImportButton();

    // Load initial state after all managers are initialized
    await this.loadInitialState();
    await this.themeOnboarding.maybeShow();
    this.bindThemeButton();
    this.bindSettingsButton();
    this.bindHeaderDoubleClick();

    // Set up auto-save last
    this.setupAutoSave();
  }

  private async loadInitialState(): Promise<void> {
    try {
      const state = await window.restbro.store.get();
      this.themeManager.setTheme(state.theme);
      this.appManager.setNavOrder(state.navOrder);
      await this.collectionsManager.setCollections(state.collections);
      this.tabsManager.setTabs(state.openTabs, state.activeTabId);
      this.historyManager.setHistory((state as any).history || []);
      this.historyManager.setClearedResponses(
        (state as any).clearedResponses || {}
      );
      this.environmentManager.setEnvironments(
        (state as any).environments || []
      );
      this.environmentManager.setActiveEnvironment(
        (state as any).activeEnvironmentId
      );
      const layoutMode = (state as any).layoutMode || 'horizontal';
      this.layoutToggleManager.initialize(layoutMode);
      const rs = (state as any).requestSettings;
      this.settingsModal.setValues(rs?.defaultTimeoutMs ?? 60000, layoutMode);
      hydrateBodyFontSize(state.editorSettings?.bodyFontSize);
    } catch (error) {
      console.error('Failed to load initial state:', error);
    }
  }

  private setupAutoSave(): void {
    // Auto-save every 30 seconds to ensure no data loss
    this.autoSaveTimer = window.setInterval(() => {
      this.saveState();
    }, 30000);
  }

  /**
   * Pause renderer-driven persistence. Used by Time Machine restore so
   * the periodic autosave can't race the restore and re-publish stale
   * in-memory state to the store between restoreBackup() resolving and
   * window.location.reload() actually navigating.
   */
  public stopAutoSave(): void {
    if (this.autoSaveTimer !== null) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
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
        clearedResponses: this.historyManager.getClearedResponses(),
      };
      await window.restbro.store.set(state);
    } catch (error) {
      console.error('Failed to save state:', error);
    }
  }

  /**
   * Lazy-initialize heavy tabs (Monaco/React/MUI) on first navigation.
   * This avoids ~1-2 s of startup overhead from editors that aren't visible.
   */
  private setupLazyTabInit(): void {
    const lazyMap: Record<string, () => void | Promise<void>> = {
      'json-compare': () => this.jsonCompareTab.ensureInitialized(),
      notepad: () => this.notepadManager.ensureInitialized(),
    };

    document.addEventListener('nav-tab-switched', ((
      e: CustomEvent<{ tab: string }>
    ) => {
      const initFn = lazyMap[e.detail.tab];
      if (initFn) initFn();
    }) as EventListener);
  }

  /**
   * Bridge for opening a response body in the Notepad tab (replaces the
   * standalone JSON Viewer). Any component can dispatch `open-in-notepad` with
   * the raw text; we switch to Notepad and open a pretty-printed tab.
   */
  private setupOpenInNotepad(): void {
    document.addEventListener('open-in-notepad', ((
      e: CustomEvent<{ text: string; title?: string; language?: string }>
    ) => {
      const text = e.detail?.text ?? '';
      document.dispatchEvent(
        new CustomEvent('switch-to-tab', { detail: { tab: 'notepad' } })
      );
      void this.notepadManager.openInNotepad(text, {
        title: e.detail?.title,
        language: e.detail?.language,
      });
    }) as EventListener);
  }

  /**
   * Route OS "open file" events (double-click a file / "Open with Restbro")
   * into the Notepad. Kept at the app level — not inside NotepadManager's lazy
   * init — so a file opened before the Notepad tab is ever visited still lands
   * there (the Notepad initializes on demand via openPath()).
   */
  private setupNotepadFileOpen(): void {
    const open = (filePath: string): void => {
      document.dispatchEvent(
        new CustomEvent('switch-to-tab', { detail: { tab: 'notepad' } })
      );
      void this.notepadManager.openPath(filePath);
    };
    // Runtime: the OS hands us a file while the app is already running.
    window.restbro.notepad.onFileOpened((filePath) => open(filePath));
    // Cold start: drain files queued before the renderer was ready.
    void (async () => {
      try {
        const files = await window.restbro.notepad.getPendingFiles();
        files.forEach(open);
      } catch {
        // Best-effort; the pending-files API may be unavailable.
      }
    })();
  }

  private bindThemeButton(): void {
    const button = document.getElementById('theme-button');
    if (!button) return;
    button.addEventListener('click', () => {
      this.themeOnboarding.openPicker();
    });
  }

  /**
   * macOS only applies its own double-click-to-zoom to the native title-bar
   * strip, which is shorter than our custom header, so the lower part of the
   * bar felt dead. Handle the gesture ourselves across the whole header.
   */
  private bindHeaderDoubleClick(): void {
    const header = document.querySelector('.app-header');
    header?.addEventListener('dblclick', (e) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('button, select, input, a')) return;
      void window.restbro.window.titleDoubleClick();
    });
  }

  private bindSettingsButton(): void {
    const button = document.getElementById('settings-button');
    if (!button) return;
    button.addEventListener('click', () => {
      if (this.settingsModal.isOpen()) {
        this.settingsModal.close();
      } else {
        this.settingsModal.open();
      }
    });
  }

  private async handleTimeoutChange(ms: number): Promise<void> {
    try {
      const state = await window.restbro.store.get();
      const current = (state as any).requestSettings || {};
      await window.restbro.store.set({
        requestSettings: { ...current, defaultTimeoutMs: ms },
      } as any);
    } catch (error) {
      console.error('Failed to save timeout setting:', error);
    }
  }

  private async handleLayoutChange(
    mode: 'horizontal' | 'vertical'
  ): Promise<void> {
    // Delegate to the existing LayoutToggleManager's public API
    // by applying the layout and persisting
    const workspaceArea = document.querySelector(
      '.workspace-area'
    ) as HTMLElement | null;
    if (workspaceArea) {
      const requestPanel = workspaceArea.querySelector(
        '.request-panel'
      ) as HTMLElement | null;
      if (requestPanel) {
        requestPanel.style.width = '';
        requestPanel.style.height = '';
        requestPanel.style.flex = '';
      }
      if (mode === 'vertical') {
        workspaceArea.classList.add('layout-vertical');
      } else {
        workspaceArea.classList.remove('layout-vertical');
      }
    }
    await window.restbro.store.set({ layoutMode: mode } as any);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const app = new RestbroRenderer();
  await app.initialize();

  // Fetch Monaco's lazily-chunked JSON/XML grammars now, so the first request
  // body or response is already syntax-coloured on its first paint.
  void warmUpMonacoLanguages();

  // Remove loading overlay with a smooth fade
  const overlay = document.getElementById('app-loading-overlay');
  if (overlay) {
    overlay.classList.add('fade-out');
    overlay.addEventListener('transitionend', () => overlay.remove());
  }
});
