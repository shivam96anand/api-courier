import './styles/main.scss';
import { UIManager } from './components/ui-manager';
import { CollectionsManager } from './components/collections-manager';
import { RequestManager } from './components/request-manager';
import { ResponseManager } from './components/response-manager';
import { TabsManager } from './components/tabs-manager';
import { KeyValueEditor } from './components/key-value-editor';
import { ThemeManager } from './utils/theme-manager';
import { EventBus } from './utils/event-bus';

class ApiCourierRenderer {
  private uiManager: UIManager;
  private collectionsManager: CollectionsManager;
  private requestManager: RequestManager;
  private responseManager: ResponseManager;
  private tabsManager: TabsManager;
  private themeManager: ThemeManager;
  private eventBus: EventBus;
  private paramsEditor: KeyValueEditor;
  private headersEditor: KeyValueEditor;

  constructor() {
    this.eventBus = EventBus.getInstance();
    this.themeManager = new ThemeManager();
    this.uiManager = new UIManager(this.eventBus);
    this.collectionsManager = new CollectionsManager(this.eventBus);
    this.requestManager = new RequestManager(this.eventBus);
    this.responseManager = new ResponseManager(this.eventBus);
    this.tabsManager = new TabsManager(this.eventBus);
    this.paramsEditor = new KeyValueEditor('paramsEditor');
    this.headersEditor = new KeyValueEditor('headersEditor');
    
    this.initialize();
  }

  private async initialize(): Promise<void> {
    // Initialize theme
    await this.themeManager.initialize();
    
    // Initialize UI components
    this.uiManager.initialize();
    this.collectionsManager.initialize();
    this.requestManager.initialize();
    this.responseManager.initialize();
    this.tabsManager.initialize();
    
    // Initialize key-value editors
    this.paramsEditor.render();
    this.headersEditor.render();
    
    // Remove window controls event listeners
    this.removeWindowControls();
    
    // Load initial data and restore state
    await this.loadInitialData();
    await this.restoreApplicationState();
    
    // Setup auto-save and state persistence
    this.setupStatePersistence();
    
    console.log('API Courier initialized successfully');
  }

  private removeWindowControls(): void {
    // Remove window control buttons since we removed them from HTML
    const minimizeBtn = document.getElementById('minimizeBtn');
    const maximizeBtn = document.getElementById('maximizeBtn');
    const closeBtn = document.getElementById('closeBtn');

    // Remove event listeners if buttons exist
    [minimizeBtn, maximizeBtn, closeBtn].forEach(btn => {
      if (btn) {
        btn.remove();
      }
    });
  }

  private async loadInitialData(): Promise<void> {
    try {
      // Load collections
      const collections = await window.electronAPI.getCollections();
      this.eventBus.emit('collections:loaded', collections);
      
      // Load settings
      const settings = await window.electronAPI.getSettings();
      this.eventBus.emit('settings:loaded', settings);
      
    } catch (error) {
      console.error('Failed to load initial data:', error);
    }
  }

  private async restoreApplicationState(): Promise<void> {
    try {
      const settings = await window.electronAPI.getSettings();
      if (settings) {
        // Restore expanded folders (already handled by CollectionsManager)
        // Expanded folders are loaded automatically in CollectionsManager.initialize()

        // Restore panel sizes if saved in settings
        if (settings.sidebarWidth) {
          const sidebar = document.querySelector('.sidebar') as HTMLElement;
          if (sidebar) {
            sidebar.style.width = `${settings.sidebarWidth}px`;
          }
        }

        if (settings.requestPanelWidth) {
          const requestPanel = document.querySelector('.request-panel') as HTMLElement;
          if (requestPanel) {
            requestPanel.style.width = `${settings.requestPanelWidth}px`;
          }
        }
      }
    } catch (error) {
      console.warn('Failed to restore application state:', error);
    }
  }

  private setupStatePersistence(): void {
    // Save state periodically
    setInterval(() => {
      this.saveApplicationState();
    }, 30000); // Save every 30 seconds

    // Save state before window closes
    window.addEventListener('beforeunload', (event) => {
      this.saveApplicationState();
    });

    // Save state when visibility changes (app minimized/hidden)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.saveApplicationState();
      }
    });
  }

  private async saveApplicationState(): Promise<void> {
    try {
      const currentSettings = await window.electronAPI.getSettings();
      const updatedSettings = {
        ...currentSettings,
        expandedFolders: this.collectionsManager.getExpandedFolders(),
        sidebarWidth: this.getCurrentPanelSizes().collectionWidth,
        requestPanelWidth: this.getCurrentPanelSizes().requestHeight,
      };

      await window.electronAPI.saveSettings(updatedSettings);
      console.debug('Application state saved to settings');
    } catch (error) {
      console.error('Failed to save application state:', error);
    }
  }

  private getCurrentPanelSizes(): Record<string, number> {
    const sizes: Record<string, number> = {};
    
    // Get collection panel width
    const collectionPanel = document.querySelector('.sidebar') as HTMLElement;
    if (collectionPanel) {
      sizes.collectionWidth = collectionPanel.offsetWidth;
    }

    // Get request panel height (if split horizontally)
    const requestPanel = document.querySelector('.request-panel') as HTMLElement;
    if (requestPanel) {
      sizes.requestHeight = requestPanel.offsetHeight;
    }

    return sizes;
  }
}

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new ApiCourierRenderer();
});
