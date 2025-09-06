/**
 * Main renderer process application
 */

// Simple console test
console.log('API Courier starting...');

// DOM references to avoid type conflicts
const doc = (globalThis as any).document;
const win = (globalThis as any).window;

// Get API from window with type assertion
const api = win.apiCourier;

/**
 * Main Application Class
 */
class APICourierApp {
  private currentColorTheme: string = 'blue';
  private collections: any[] = [];
  private environments: any[] = [];
  private activeEnvironment: any = null;
  private jsonTreeViewer: any = null;

  constructor() {
    this.initializeApp();
  }

  /**
   * Initialize the application
   */
  private async initializeApp(): Promise<void> {
    try {
      console.log('Initializing API Courier...');
      await this.loadSettings();
      await this.loadCollections();
      await this.loadEnvironments();
      this.setupEventListeners();
      console.log('API Courier initialized successfully');
    } catch (error) {
      console.error('Failed to initialize API Courier:', error);
    }
  }

  /**
   * Load application settings
   */
  private async loadSettings(): Promise<void> {
    try {
      if (api && api.store) {
        const settings = await api.store.getSettings();
        this.currentColorTheme = settings.theme || 'blue';
        this.applyTheme(this.currentColorTheme);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }

  /**
   * Load collections
   */
  private async loadCollections(): Promise<void> {
    try {
      if (api && api.store) {
        this.collections = await api.store.getCollections();
      }
    } catch (error) {
      console.error('Failed to load collections:', error);
    }
  }

  /**
   * Load environments
   */
  private async loadEnvironments(): Promise<void> {
    try {
      if (api && api.store) {
        this.environments = await api.store.getEnvironments();
        this.activeEnvironment = await api.store.getActiveEnvironment();
      }
    } catch (error) {
      console.error('Failed to load environments:', error);
    }
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    // Initialize DOM after page loads
    if (doc.readyState === 'loading') {
      doc.addEventListener('DOMContentLoaded', () => {
        this.initializeDOMElements();
      });
    } else {
      this.initializeDOMElements();
    }
  }

  /**
   * Initialize DOM elements
   */
  private initializeDOMElements(): void {
    console.log('Initializing DOM elements...');

    // Collection buttons
    this.setupCollectionButtons();
    
    // Key-value editors
    this.setupKeyValueEditors();
    
    // JSON Tree Viewer
    this.initializeJSONViewer();

    // Theme selector
    this.setupThemeSelector();

    // Request functionality
    this.setupRequestHandlers();
  }

  /**
   * Setup collection buttons
   */
  private setupCollectionButtons(): void {
    const newFolderBtn = doc.getElementById('new-folder');
    const newRequestBtn = doc.getElementById('new-request');
    const importCollectionBtn = doc.getElementById('import-collection');

    if (newFolderBtn) {
      newFolderBtn.addEventListener('click', () => {
        this.createNewFolder();
      });
    }

    if (newRequestBtn) {
      newRequestBtn.addEventListener('click', () => {
        this.createNewRequest();
      });
    }

    if (importCollectionBtn) {
      importCollectionBtn.addEventListener('click', () => {
        this.importCollection();
      });
    }
  }

  /**
   * Setup key-value editors
   */
  private setupKeyValueEditors(): void {
    const addParamButton = doc.getElementById('add-param');
    const addHeaderButton = doc.getElementById('add-header');
    
    if (addParamButton) {
      addParamButton.addEventListener('click', () => this.addKeyValueRow('params'));
    }
    if (addHeaderButton) {
      addHeaderButton.addEventListener('click', () => this.addKeyValueRow('headers'));
    }

    // Add default rows
    this.addKeyValueRow('params');
    this.addKeyValueRow('headers');
  }

  /**
   * Setup theme selector
   */
  private setupThemeSelector(): void {
    const themeToggle = doc.getElementById('theme-toggle');
    const themeDropdown = doc.getElementById('theme-dropdown');
    
    if (themeToggle && themeDropdown) {
      themeToggle.addEventListener('click', (e: any) => {
        e.stopPropagation();
        themeDropdown.classList.toggle('show');
      });

      doc.addEventListener('click', () => {
        themeDropdown.classList.remove('show');
      });

      themeDropdown.addEventListener('click', (e: any) => {
        const target = e.target;
        const themeOption = target.closest('.theme-option');
        if (themeOption) {
          const themeName = themeOption.dataset.theme;
          if (themeName) {
            this.changeTheme(themeName);
          }
        }
      });
    }
  }

  /**
   * Setup request handlers
   */
  private setupRequestHandlers(): void {
    const sendButton = doc.getElementById('send-request');
    if (sendButton) {
      sendButton.addEventListener('click', () => this.sendRequest());
    }
  }

  /**
   * Create new folder with modal
   */
  private async createNewFolder(): Promise<void> {
    console.log('Creating new folder...');
    
    const name = await this.showModal('New Folder', 'Enter folder name:');
    if (!name || !name.trim()) return;

    try {
      const newFolder = {
        id: `folder_${Date.now()}`,
        name: name.trim(),
        type: 'folder',
        items: [],
        createdAt: new Date().toISOString()
      };

      this.collections.push(newFolder);
      if (api && api.store) {
        await api.store.saveCollection(newFolder);
      }
      console.log('Folder created:', name);
    } catch (error) {
      console.error('Failed to create folder:', error);
    }
  }

  /**
   * Create new request
   */
  private async createNewRequest(): Promise<void> {
    const name = await this.showModal('New Request', 'Enter request name:');
    if (!name || !name.trim()) return;

    try {
      const newRequest = {
        id: `request_${Date.now()}`,
        name: name.trim(),
        type: 'request',
        method: 'GET',
        url: '',
        headers: {},
        body: null,
        auth: { type: 'none' },
        createdAt: new Date().toISOString()
      };

      this.collections.push(newRequest);
      if (api && api.store) {
        await api.store.saveCollection(newRequest);
      }
      console.log('Request created:', name);
    } catch (error) {
      console.error('Failed to create request:', error);
    }
  }

  /**
   * Import collection
   */
  private async importCollection(): Promise<void> {
    console.log('Import collection functionality - to be implemented');
  }

  /**
   * Show custom modal dialog - replaces prompt()
   */
  private showModal(title: string, message: string, defaultValue = ''): Promise<string | null> {
    return new Promise((resolve) => {
      const overlay = doc.getElementById('modal-overlay');
      const titleEl = doc.getElementById('modal-title');
      const messageEl = doc.getElementById('modal-message');
      const inputEl = doc.getElementById('modal-input');
      const confirmBtn = doc.getElementById('modal-confirm');
      const cancelBtn = doc.getElementById('modal-cancel');
      const closeBtn = doc.getElementById('modal-close');

      if (!overlay || !titleEl || !messageEl || !inputEl || !confirmBtn || !cancelBtn || !closeBtn) {
        // Fallback to prompt if modal elements not available
        const result = win.prompt(message);
        resolve(result);
        return;
      }

      // Set content
      titleEl.textContent = title;
      messageEl.textContent = message;
      inputEl.value = defaultValue;

      // Show modal
      overlay.style.display = 'flex';
      inputEl.focus();
      inputEl.select();

      // Handle confirm
      const handleConfirm = () => {
        const value = inputEl.value.trim();
        cleanup();
        resolve(value || null);
      };

      // Handle cancel
      const handleCancel = () => {
        cleanup();
        resolve(null);
      };

      // Handle keyboard
      const handleKeydown = (e: any) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleConfirm();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          handleCancel();
        }
      };

      // Cleanup function
      const cleanup = () => {
        overlay.style.display = 'none';
        confirmBtn.removeEventListener('click', handleConfirm);
        cancelBtn.removeEventListener('click', handleCancel);
        closeBtn.removeEventListener('click', handleCancel);
        inputEl.removeEventListener('keydown', handleKeydown);
      };

      // Add event listeners
      confirmBtn.addEventListener('click', handleConfirm);
      cancelBtn.addEventListener('click', handleCancel);
      closeBtn.addEventListener('click', handleCancel);
      inputEl.addEventListener('keydown', handleKeydown);
    });
  }

  /**
   * Add a key-value row - fixes UI layout issues
   */
  private addKeyValueRow(type: 'params' | 'headers', key: string = '', value: string = '', description: string = '', enabled: boolean = true): void {
    const container = doc.getElementById(`${type}-list`);
    if (!container) return;

    const row = doc.createElement('div');
    row.className = 'kv-row';
    row.innerHTML = `
      <input type="checkbox" class="kv-checkbox" ${enabled ? 'checked' : ''}>
      <input type="text" class="kv-input key-input" placeholder="Key" value="${key}">
      <input type="text" class="kv-input value-input" placeholder="Value" value="${value}">
      <input type="text" class="kv-input desc-input" placeholder="Description" value="${description}">
      <button class="kv-delete-btn" title="Remove">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </button>
    `;

    // Handle checkbox change
    const checkbox = row.querySelector('.kv-checkbox');
    if (checkbox) {
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          row.classList.remove('disabled');
        } else {
          row.classList.add('disabled');
        }
      });
    }

    // Add remove functionality
    const removeBtn = row.querySelector('.kv-delete-btn');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => row.remove());
    }

    container.appendChild(row);
  }

  /**
   * Initialize JSON Viewer - fixes JSONTreeViewer constructor issue
   */
  private initializeJSONViewer(): void {
    console.log('Initializing JSON Viewer...');
    
    if (win.JSONTreeViewer) {
      const jsonTreeContainer = doc.getElementById('json-tree-container');
      if (jsonTreeContainer) {
        try {
          this.jsonTreeViewer = new win.JSONTreeViewer(jsonTreeContainer);
          console.log('JSON Tree Viewer initialized successfully');
          
          // Setup JSON input handler
          this.setupJSONInputHandler();
        } catch (error) {
          console.error('Failed to initialize JSONTreeViewer:', error);
        }
      }
    } else {
      console.warn('JSONTreeViewer not available');
    }
  }

  /**
   * Setup JSON input handler
   */
  private setupJSONInputHandler(): void {
    const jsonInput = doc.getElementById('json-input');
    const jsonTreeContainer = doc.getElementById('json-tree-container');
    
    if (!jsonInput || !jsonTreeContainer) return;

    // Auto-update tree when input changes
    let debounceTimer: any;
    jsonInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const jsonText = jsonInput.value.trim();
        if (jsonText) {
          try {
            const jsonData = JSON.parse(jsonText);
            if (this.jsonTreeViewer) {
              this.jsonTreeViewer.render(jsonData);
            }
          } catch (error: any) {
            jsonTreeContainer.innerHTML = `
              <div class="empty-state">
                <p style="color: #ff6b6b;">Invalid JSON: ${error.message}</p>
              </div>
            `;
          }
        } else {
          jsonTreeContainer.innerHTML = `
            <div class="empty-state">
              <p>Enter valid JSON to view the tree structure</p>
            </div>
          `;
        }
      }, 300);
    });
  }

  /**
   * Apply theme
   */
  private applyTheme(theme: string): void {
    const root = doc.documentElement;
    
    const themes: Record<string, any> = {
      blue: {
        '--accent-color': '#007acc',
        '--surface-color': '#1e1e1e',
        '--background-color': '#252526',
        '--border-color': '#3c3c3c',
        '--text-color': '#cccccc',
        '--text-secondary': '#969696'
      }
    };

    const selectedTheme = themes[theme] || themes.blue;
    
    Object.entries(selectedTheme).forEach(([property, value]) => {
      root.style.setProperty(property, value);
    });
  }

  /**
   * Change theme
   */
  private async changeTheme(theme: string): Promise<void> {
    this.currentColorTheme = theme;
    this.applyTheme(theme);
    
    try {
      if (api && api.store) {
        await api.store.updateSettings({ theme });
      }
    } catch (error) {
      console.error('Failed to save theme:', error);
    }
  }

  /**
   * Send request
   */
  private async sendRequest(): Promise<void> {
    console.log('Send request functionality - to be implemented');
  }
}

// Initialize when DOM is ready
if (doc.readyState === 'loading') {
  doc.addEventListener('DOMContentLoaded', () => {
    new APICourierApp();
  });
} else {
  new APICourierApp();
}
