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
  private requestTabs: any[] = [];
  private activeTabId: string | null = null;

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
      await this.loadTabState();
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

  private autoSaveTimeout: any = null;

  /**
   * Debounced auto-save for request changes
   */
  private debounceAutoSave(requestId: string, updates: any): void {
    if (this.autoSaveTimeout) {
      clearTimeout(this.autoSaveTimeout);
    }
    
    this.autoSaveTimeout = setTimeout(() => {
      this.updateRequestInCollection(requestId, updates);
    }, 1000); // Auto-save after 1 second of inactivity
  }

  /**
   * Save current tab state to storage
   */
  private async saveTabState(): Promise<void> {
    try {
      const tabState = {
        tabs: this.requestTabs,
        activeTabId: this.activeTabId
      };
      
      console.log('Attempting to save tab state:', tabState);
      
      if (api && api.store) {
        console.log('API store available:', Object.keys(api.store));
        if (typeof api.store.saveTabState === 'function') {
          await api.store.saveTabState(tabState);
          console.log('Tab state saved successfully');
        } else {
          console.warn('saveTabState method not available on api.store');
        }
      } else {
        console.warn('API or API store not available');
      }
    } catch (error) {
      console.error('Failed to save tab state:', error);
    }
  }

  /**
   * Restore tab state from storage
   */
  private async loadTabState(): Promise<void> {
    try {
      console.log('Attempting to load tab state...');
      
      if (api && api.store) {
        console.log('API store available:', Object.keys(api.store));
        if (typeof api.store.getTabState === 'function') {
          const tabState = await api.store.getTabState();
          console.log('Retrieved tab state:', tabState);
          
          if (tabState && tabState.tabs && tabState.tabs.length > 0) {
            this.requestTabs = tabState.tabs;
            this.activeTabId = tabState.activeTabId;
            this.renderRequestTabs();
            
            if (this.activeTabId) {
              const activeTab = this.requestTabs.find(t => t.id === this.activeTabId);
              if (activeTab) {
                this.renderTabContent(activeTab);
                if (activeTab.response) {
                  this.displayResponse(activeTab.response);
                }
              }
            }
            console.log('Tab state loaded successfully');
          } else {
            console.log('No tab state to restore');
          }
        } else {
          console.warn('getTabState method not available on api.store');
        }
      } else {
        console.warn('API or API store not available');
      }
    } catch (error) {
      console.error('Failed to load tab state:', error);
    }
  }

  /**
   * Load collections
   */
  private async loadCollections(): Promise<void> {
    try {
      if (api && api.store) {
        this.collections = await api.store.getCollections();
        this.renderCollections();
      }
    } catch (error) {
      console.error('Failed to load collections:', error);
    }
  }

  /**
   * Render collections in the sidebar with hierarchical structure
   */
  private renderCollections(): void {
    const collectionsTree = doc.getElementById('collections-tree');
    if (!collectionsTree) return;

    if (!this.collections || this.collections.length === 0) {
      collectionsTree.innerHTML = `
        <div class="empty-collections">
          <p>No collections yet</p>
          <p>Create a folder or request to get started</p>
        </div>
      `;
      return;
    }

    const renderItem = (collection: any, level: number = 0): string => {
      const indent = level * 16;
      const icon = collection.type === 'folder' ? 
        `<svg class="collection-icon" width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" stroke="currentColor" stroke-width="2"/>
        </svg>` :
        `<svg class="collection-icon" width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" stroke-width="2"/>
        </svg>`;

      const method = collection.method ? `<span class="collection-method ${collection.method.toLowerCase()}">${collection.method}</span>` : '';

      let html = `
        <div class="collection-item" data-id="${collection.id}" data-type="${collection.type}" style="padding-left: ${indent}px">
          ${icon}
          <span class="collection-name">${collection.name}</span>
          ${method}
          <div class="collection-actions">
            <button class="action-btn" data-action="add-folder" data-parent="${collection.id}" title="Add Folder">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" stroke="currentColor" stroke-width="2"/>
                <line x1="12" y1="8" x2="12" y2="16" stroke="currentColor" stroke-width="1"/>
                <line x1="8" y1="12" x2="16" y2="12" stroke="currentColor" stroke-width="1"/>
              </svg>
            </button>
            <button class="action-btn" data-action="add-request" data-parent="${collection.id}" title="Add Request">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" stroke-width="2"/>
                <line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" stroke-width="2"/>
              </svg>
            </button>
            <button class="action-btn" data-action="rename" data-id="${collection.id}" title="Rename">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" stroke-width="2"/>
                <path d="m18.5 2.5 a2.121 2.121 0 0 1 3 3l-12.5 12.5-6 2 2-6z" stroke="currentColor" stroke-width="2"/>
              </svg>
            </button>
            <button class="action-btn danger" data-action="delete" data-id="${collection.id}" title="Delete">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" stroke="currentColor" stroke-width="2"/>
                <line x1="10" y1="11" x2="10" y2="17" stroke="currentColor" stroke-width="2"/>
                <line x1="14" y1="11" x2="14" y2="17" stroke="currentColor" stroke-width="2"/>
              </svg>
            </button>
          </div>
        </div>
      `;

      // Add children if it's a folder
      if (collection.type === 'folder') {
        const children = this.collections.filter((c: any) => c.parentId === collection.id);
        children.forEach((child: any) => {
          html += renderItem(child, level + 1);
        });
      }

      return html;
    };

    // Render root items (no parentId)
    const rootItems = this.collections.filter((c: any) => !c.parentId);
    const collectionsHTML = rootItems.map(collection => renderItem(collection)).join('');

    collectionsTree.innerHTML = collectionsHTML;

    // Add event listeners
    this.setupCollectionEventListeners();
  }

  /**
   * Setup event listeners for collection items
   */
  private setupCollectionEventListeners(): void {
    const collectionsTree = doc.getElementById('collections-tree');
    if (!collectionsTree) return;

    // Handle collection item clicks
    const collectionItems = collectionsTree.querySelectorAll('.collection-item');
    collectionItems.forEach((item: any) => {
      // Main item click (but not on actions)
      item.addEventListener('click', (e: any) => {
        if (e.target.closest('.collection-actions')) return;
        this.selectCollection(item.dataset.id, item.dataset.type);
      });

      // Double click for rename
      item.addEventListener('dblclick', (e: any) => {
        if (e.target.closest('.collection-actions')) return;
        const nameElement = item.querySelector('.collection-name');
        if (nameElement) {
          this.startInlineEdit(item.dataset.id, nameElement.textContent);
        }
      });
    });

    // Handle action buttons
    const actionButtons = collectionsTree.querySelectorAll('.action-btn');
    actionButtons.forEach((btn: any) => {
      btn.addEventListener('click', (e: any) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const itemId = btn.dataset.id;
        const parentId = btn.dataset.parent;

        switch (action) {
          case 'add-folder':
            this.createNewFolder(parentId);
            break;
          case 'add-request':
            this.createNewRequest(parentId);
            break;
          case 'rename':
            const nameElement = btn.closest('.collection-item').querySelector('.collection-name');
            if (nameElement) {
              this.startInlineEdit(itemId, nameElement.textContent);
            }
            break;
          case 'delete':
            this.deleteCollection(itemId);
            break;
        }
      });
    });
  }

  /**
   * Delete a collection item
   */
  private async deleteCollection(itemId: string): Promise<void> {
    if (!win.confirm('Are you sure you want to delete this item?')) return;

    try {
      // Remove from collections array (including children)
      const removeItem = (id: string) => {
        const children = this.collections.filter((c: any) => c.parentId === id);
        children.forEach((child: any) => removeItem(child.id));
        
        const index = this.collections.findIndex((c: any) => c.id === id);
        if (index !== -1) {
          this.collections.splice(index, 1);
        }
      };

      removeItem(itemId);

      if (api && api.store) {
        await api.store.deleteCollection(itemId);
      }

      // Close any open tabs for this item
      this.requestTabs = this.requestTabs.filter(tab => tab.sourceId !== itemId);
      if (this.activeTabId && this.requestTabs.find(t => t.id === this.activeTabId)?.sourceId === itemId) {
        if (this.requestTabs.length > 0) {
          this.switchToTab(this.requestTabs[0].id);
        } else {
          this.activeTabId = null;
          this.showEmptyState();
        }
      }

      this.renderCollections();
      this.renderRequestTabs();
    } catch (error) {
      console.error('Failed to delete collection:', error);
    }
  }

  /**
   * Select a collection item
   */
  private selectCollection(id: string, type: string): void {
    // Remove active class from all items
    const allItems = doc.querySelectorAll('.collection-item');
    allItems.forEach((item: any) => item.classList.remove('active'));

    // Add active class to selected item
    const selectedItem = doc.querySelector(`[data-id="${id}"]`);
    if (selectedItem) {
      selectedItem.classList.add('active');
    }

    if (type === 'request') {
      this.openRequest(id);
    }
  }

  /**
   * Open a request in the request panel
   */
  private openRequest(id: string): void {
    const request = this.collections.find((c: any) => c.id === id);
    if (!request) return;

    // Check if tab already exists
    const existingTab = this.requestTabs.find(tab => tab.sourceId === id);
    if (existingTab) {
      this.switchToTab(existingTab.id);
      return;
    }

    // Create a new tab for this request
    this.createNewRequestTab(request);
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

    // Setup resizable panels
    this.setupResizablePanels();
    
    // Collection buttons
    this.setupCollectionButtons();
    
    // JSON Tree Viewer
    this.initializeJSONViewer();

    // Theme selector
    this.setupThemeSelector();

    // Request functionality
    this.setupRequestHandlers();

    // Setup request tab system
    this.setupRequestTabSystem();

    // Setup navigation tabs
    this.setupNavigationTabs();

    // Setup request tabs
    this.setupRequestTabs();

    // Setup response tabs 
    this.setupResponseTabs();
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
    // The new tab system handles request functionality
    // No global request handlers needed
  }

  /**
   * Find a request by ID
   */
  private findRequestById(requestId: string): any {
    return this.collections.find(item => item.id === requestId && item.type === 'request');
  }

  /**
   * Update a request in the collections
   */
  private async updateRequestInCollection(requestId: string, updates: any): Promise<void> {
    const request = this.collections.find(item => item.id === requestId && item.type === 'request');
    if (request) {
      Object.assign(request, updates);
      
      // Save to storage
      if (api && api.store) {
        await api.store.saveCollection(request);
      }
      
      // Update collections display
      this.renderCollections();
    }
  }

  /**
   * Create new folder
   */
  private async createNewFolder(parentId: string | null = null): Promise<void> {
    console.log('Creating new folder...');

    try {
      const newFolder = {
        id: `folder_${Date.now()}`,
        name: 'New Folder',
        type: 'folder',
        parentId: parentId,
        items: [],
        createdAt: new Date().toISOString()
      };

      this.collections.push(newFolder);
      
      if (api && api.store) {
        await api.store.saveCollection(newFolder);
      }
      
      // Update UI and start editing
      this.renderCollections();
      setTimeout(() => this.startInlineEdit(newFolder.id, 'New Folder'), 100);
      console.log('Folder created');
    } catch (error) {
      console.error('Failed to create folder:', error);
    }
  }

  /**
   * Create new request
   */
  private async createNewRequest(parentId: string | null = null): Promise<void> {
    try {
      const newRequest = {
        id: `request_${Date.now()}`,
        name: 'New Request',
        type: 'request',
        method: 'GET',
        url: '',
        headers: {},
        params: {},
        body: '',
        auth: { type: 'none' },
        parentId: parentId,
        createdAt: new Date().toISOString()
      };

      this.collections.push(newRequest);
      
      if (api && api.store) {
        await api.store.saveCollection(newRequest);
      }
      
      // Update UI and start editing
      this.renderCollections();
      setTimeout(() => this.startInlineEdit(newRequest.id, 'New Request'), 100);
      console.log('Request created');
    } catch (error) {
      console.error('Failed to create request:', error);
    }
  }

  /**
   * Start inline editing of collection item
   */
  private startInlineEdit(itemId: string, currentName: string): void {
    const item = doc.querySelector(`[data-id="${itemId}"] .collection-name`);
    if (!item) return;

    const input = doc.createElement('input');
    input.type = 'text';
    input.value = currentName;
    input.className = 'collection-name-input';
    input.style.cssText = `
      background: var(--bg-primary);
      border: 1px solid var(--accent-primary);
      border-radius: 3px;
      padding: 2px 6px;
      color: var(--text-primary);
      font-size: 13px;
      width: 100%;
      outline: none;
    `;

    // Replace the span with input
    item.replaceWith(input);
    input.focus();
    input.select();

    const finishEdit = (save: boolean) => {
      const newName = save ? input.value.trim() : currentName;
      
      if (!newName) return;

      // Find the current parent container to ensure we're working with valid DOM
      const parentElement = input.parentElement;
      if (!parentElement) {
        console.warn('Parent element not found during edit finish');
        return;
      }

      // Create new span
      const span = doc.createElement('span');
      span.className = 'collection-name';
      span.textContent = newName;
      
      try {
        input.replaceWith(span);
      } catch (error) {
        console.warn('Failed to replace input, recreating collections:', error);
        // If replace fails, just re-render everything
        if (save && newName !== currentName) {
          this.updateCollectionName(itemId, newName);
        } else {
          this.renderCollections();
        }
        return;
      }

      if (save && newName !== currentName) {
        this.updateCollectionName(itemId, newName);
      }
    };

    input.addEventListener('blur', () => finishEdit(true));
    input.addEventListener('keydown', (e: any) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        finishEdit(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        finishEdit(false);
      }
    });
  }

  /**
   * Update collection item name
   */
  private async updateCollectionName(itemId: string, newName: string): Promise<void> {
    const item = this.collections.find(c => c.id === itemId);
    if (item) {
      item.name = newName;
      if (api && api.store) {
        await api.store.saveCollection(item);
      }
      
      // Update active tab name if it's open
      const tab = this.requestTabs.find(t => t.sourceId === itemId);
      if (tab) {
        tab.name = newName;
        this.renderRequestTabs();
      }
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
    root.setAttribute('data-color-theme', theme);
    
    // Update active theme option
    const themeOptions = doc.querySelectorAll('.theme-option');
    themeOptions.forEach((option: any) => {
      option.classList.remove('active');
      if (option.dataset.theme === theme) {
        option.classList.add('active');
      }
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
   * Display response in the response panel
   */
  private displayResponse(response: any): void {
    // Save response to active tab
    if (this.activeTabId) {
      const activeTab = this.requestTabs.find(t => t.id === this.activeTabId);
      if (activeTab) {
        activeTab.response = response;
        
        // If this tab is linked to a saved request, also save response to collection
        if (activeTab.sourceId) {
          this.updateRequestInCollection(activeTab.sourceId, { response: response });
        }
        
        // Save tab state to persist response data
        this.saveTabState();
      }
    }

    // Update response metadata
    const responseMeta = doc.getElementById('response-meta');
    if (responseMeta) {
      const statusClass = response.status >= 200 && response.status < 300 ? 'success' : 'error';
      responseMeta.innerHTML = `
        <span class="response-status ${statusClass}">${response.status} ${response.statusText}</span>
        <span class="response-time">${response.time}ms</span>
        <span class="response-size">${this.formatBytes(response.size)}</span>
      `;
    }

    // Display pretty response
    const prettyContent = doc.getElementById('response-pretty-content');
    if (prettyContent) {
      try {
        const jsonData = JSON.parse(response.body);
        prettyContent.innerHTML = `<pre>${JSON.stringify(jsonData, null, 2)}</pre>`;
      } catch (error) {
        prettyContent.innerHTML = `<pre>${response.body}</pre>`;
      }
    }

    // Display raw response
    const rawContent = doc.getElementById('response-raw-content');
    if (rawContent) {
      rawContent.textContent = response.body;
    }

    // Display response headers
    const headersContent = doc.getElementById('response-headers-content');
    if (headersContent) {
      const headersHTML = Object.entries(response.headers)
        .map(([key, value]) => `<div class="header-item"><strong>${key}:</strong> ${value}</div>`)
        .join('');
      headersContent.innerHTML = headersHTML || '<div class="empty-state">No headers</div>';
    }
  }

  /**
   * Clear response display
   */
  private clearResponseDisplay(): void {
    // Clear response metadata
    const responseMeta = doc.getElementById('response-meta');
    if (responseMeta) {
      responseMeta.innerHTML = `
        <span class="response-status">No Response</span>
        <span class="response-time"></span>
        <span class="response-size"></span>
      `;
    }

    // Clear response content
    const prettyContent = doc.getElementById('response-pretty-content');
    if (prettyContent) {
      prettyContent.innerHTML = '<div class="empty-response"><p>Send a request to see the response</p></div>';
    }

    const rawContent = doc.getElementById('response-raw-content');
    if (rawContent) {
      rawContent.textContent = '';
    }

    const headersContent = doc.getElementById('response-headers-content');
    if (headersContent) {
      headersContent.innerHTML = '<div class="empty-state">No headers</div>';
    }
  }

  /**
   * Show error message
   */
  private showError(message: string): void {
    console.error('Error:', message);
    
    const responseMeta = doc.getElementById('response-meta');
    if (responseMeta) {
      responseMeta.innerHTML = `<span class="response-status error">Error: ${message}</span>`;
    }

    const prettyContent = doc.getElementById('response-pretty-content');
    if (prettyContent) {
      prettyContent.innerHTML = `<div class="empty-state" style="color: #ff6b6b;">Error: ${message}</div>`;
    }
  }

  /**
   * Format bytes to human readable format
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  /**
   * Setup resizable panels
   */
  private setupResizablePanels(): void {
    const resizeHandles = doc.querySelectorAll('.resize-handle');
    
    resizeHandles.forEach((handle: any) => {
      let isResizing = false;
      let startX = 0;
      let startWidth = 0;
      let panel: any;

      handle.addEventListener('mousedown', (e: any) => {
        isResizing = true;
        startX = e.clientX;
        panel = handle.parentElement;
        startWidth = parseInt(doc.defaultView?.getComputedStyle(panel).width || '0', 10);
        
        handle.classList.add('dragging');
        doc.body.style.cursor = 'col-resize';
        doc.body.style.userSelect = 'none';
        
        e.preventDefault();
      });

      doc.addEventListener('mousemove', (e: any) => {
        if (!isResizing) return;
        
        const width = startWidth + e.clientX - startX;
        const minWidth = parseInt(panel.style.minWidth) || 200;
        const maxWidth = parseInt(panel.style.maxWidth) || window.innerWidth * 0.8;
        
        if (width >= minWidth && width <= maxWidth) {
          panel.style.width = width + 'px';
        }
      });

      doc.addEventListener('mouseup', () => {
        if (isResizing) {
          isResizing = false;
          handle.classList.remove('dragging');
          doc.body.style.cursor = '';
          doc.body.style.userSelect = '';
        }
      });
    });
  }

  /**
   * Setup navigation tabs
   */
  private setupNavigationTabs(): void {
    const navTabs = doc.querySelectorAll('.nav-tab');
    const tabContents = doc.querySelectorAll('.tab-content');

    navTabs.forEach((tab: any) => {
      tab.addEventListener('click', () => {
        const targetTab = tab.dataset.tab;
        
        // Update active nav tab
        navTabs.forEach((t: any) => t.classList.remove('active'));
        tab.classList.add('active');
        
        // Update active content
        tabContents.forEach((content: any) => {
          content.classList.remove('active');
          if (content.id === `${targetTab}-tab`) {
            content.classList.add('active');
          }
        });
      });
    });
  }

  /**
   * Setup request tabs
   */
  private setupRequestTabs(): void {
    const requestTabs = doc.querySelectorAll('.request-tabs .tab-btn');
    const requestTabContents = doc.querySelectorAll('.request-tab');

    requestTabs.forEach((tab: any) => {
      tab.addEventListener('click', () => {
        const targetTab = tab.dataset.tab;
        
        // Update active tab
        requestTabs.forEach((t: any) => t.classList.remove('active'));
        tab.classList.add('active');
        
        // Update active content
        requestTabContents.forEach((content: any) => {
          content.classList.remove('active');
          if (content.id === `${targetTab}-tab`) {
            content.classList.add('active');
          }
        });
      });
    });
  }

  /**
   * Setup response tabs
   */
  private setupResponseTabs(): void {
    const responseTabs = doc.querySelectorAll('.response-tabs .tab-btn');
    const responseTabContents = doc.querySelectorAll('.response-tab');

    responseTabs.forEach((tab: any) => {
      tab.addEventListener('click', () => {
        const targetTab = tab.dataset.tab;
        
        // Update active tab
        responseTabs.forEach((t: any) => t.classList.remove('active'));
        tab.classList.add('active');
        
        // Update active content
        responseTabContents.forEach((content: any) => {
          content.classList.remove('active');
          if (content.id === `response-${targetTab}`) {
            content.classList.add('active');
          }
        });
      });
    });
  }

  /**
   * Setup request tab system for multiple request tabs
   */
  private setupRequestTabSystem(): void {
    const newTabButton = doc.getElementById('new-request-tab');
    
    if (newTabButton) {
      newTabButton.addEventListener('click', () => {
        this.createNewRequestTab();
      });
    }
    
    // Create initial welcome tab if no tabs exist
    if (this.requestTabs.length === 0) {
      this.showEmptyState();
    }
  }

  /**
   * Show empty state when no request tabs are open
   */
  private showEmptyState(): void {
    const contentArea = doc.getElementById('request-content-area');
    if (contentArea) {
      contentArea.innerHTML = `
        <div class="empty-request-state">
          <p>Create a new request or select from collections to get started</p>
        </div>
      `;
    }
  }

  /**
   * Create a new request tab
   */
  private createNewRequestTab(requestData: any = null): string {
    // Check for duplicate tabs if this is a saved request
    if (requestData?.id) {
      const existingTab = this.requestTabs.find(tab => tab.sourceId === requestData.id);
      if (existingTab) {
        this.switchToTab(existingTab.id);
        return existingTab.id;
      }
    }

    const tabId = `tab_${Date.now()}`;
    const tabName = requestData?.name || 'Untitled Request';
    const method = requestData?.method || 'GET';
    
    const tab = {
      id: tabId,
      name: tabName,
      method: method,
      url: requestData?.url || '',
      headers: requestData?.headers || {},
      params: requestData?.params || {},
      body: requestData?.body || '',
      auth: requestData?.auth || { type: 'none' },
      sourceId: requestData?.id || null,
      isDirty: false,
      response: requestData?.response || null
    };

    this.requestTabs.push(tab);
    this.renderRequestTabs();
    this.switchToTab(tabId);
    this.saveTabState(); // Save tab state when new tab is created
    
    return tabId;
  }

  /**
   * Render request tabs in the header
   */
  private renderRequestTabs(): void {
    const tabsList = doc.getElementById('request-tabs-list');
    if (!tabsList) return;

    const tabsHTML = this.requestTabs.map(tab => `
      <button class="request-tab-item ${this.activeTabId === tab.id ? 'active' : ''}" data-tab-id="${tab.id}">
        <span class="tab-method ${tab.method.toLowerCase()}">${tab.method}</span>
        <span class="tab-name">${tab.name}</span>
        <button class="tab-close" data-tab-id="${tab.id}" title="Close Tab">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2"/>
          </svg>
        </button>
      </button>
    `).join('');

    tabsList.innerHTML = tabsHTML;

    // Add event listeners
    const tabItems = tabsList.querySelectorAll('.request-tab-item');
    tabItems.forEach((item: any) => {
      item.addEventListener('click', (e: any) => {
        if (!e.target.closest('.tab-close')) {
          this.switchToTab(item.dataset.tabId);
        }
      });
    });

    const closeButtons = tabsList.querySelectorAll('.tab-close');
    closeButtons.forEach((btn: any) => {
      btn.addEventListener('click', (e: any) => {
        e.stopPropagation();
        this.closeTab(btn.dataset.tabId);
      });
    });
  }

  /**
   * Switch to a specific tab
   */
  private switchToTab(tabId: string): void {
    const tab = this.requestTabs.find(t => t.id === tabId);
    if (!tab) return;

    this.activeTabId = tabId;
    this.renderRequestTabs();
    this.renderTabContent(tab);
    
    // Restore response if it exists
    if (tab.response) {
      this.displayResponse(tab.response);
    } else {
      // Clear response display if no response
      this.clearResponseDisplay();
    }
  }

  /**
   * Close a tab
   */
  private closeTab(tabId: string): void {
    const tabIndex = this.requestTabs.findIndex(t => t.id === tabId);
    if (tabIndex === -1) return;

    this.requestTabs.splice(tabIndex, 1);

    // Switch to another tab or show empty state
    if (this.requestTabs.length === 0) {
      this.activeTabId = null;
      this.showEmptyState();
    } else if (this.activeTabId === tabId) {
      const newActiveTab = this.requestTabs[Math.max(0, tabIndex - 1)];
      this.switchToTab(newActiveTab.id);
    }

    this.renderRequestTabs();
    this.saveTabState(); // Save tab state when tab is closed
  }

  /**
   * Render the content for the active tab
   */
  private renderTabContent(tab: any): void {
    const contentArea = doc.getElementById('request-content-area');
    if (!contentArea) return;

    contentArea.innerHTML = `
      <div class="request-tab-content-wrapper active">
        <div class="request-header-bar">
          <select class="method-select" id="request-method-${tab.id}">
            <option value="GET" ${tab.method === 'GET' ? 'selected' : ''}>GET</option>
            <option value="POST" ${tab.method === 'POST' ? 'selected' : ''}>POST</option>
            <option value="PUT" ${tab.method === 'PUT' ? 'selected' : ''}>PUT</option>
            <option value="PATCH" ${tab.method === 'PATCH' ? 'selected' : ''}>PATCH</option>
            <option value="DELETE" ${tab.method === 'DELETE' ? 'selected' : ''}>DELETE</option>
            <option value="HEAD" ${tab.method === 'HEAD' ? 'selected' : ''}>HEAD</option>
            <option value="OPTIONS" ${tab.method === 'OPTIONS' ? 'selected' : ''}>OPTIONS</option>
          </select>
          <input type="text" class="url-input" id="request-url-${tab.id}" placeholder="Enter request URL..." value="${tab.url}">
          <button class="btn-primary" id="send-request-${tab.id}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <line x1="22" y1="2" x2="11" y2="13" stroke="currentColor" stroke-width="2"/>
              <polygon points="22,2 15,22 11,13 2,9 22,2" fill="currentColor"/>
            </svg>
            Send
          </button>
        </div>
        
        <div class="panel-content">
          <div class="request-tabs">
            <button class="tab-btn active" data-tab="params">Params</button>
            <button class="tab-btn" data-tab="headers">Headers</button>
            <button class="tab-btn" data-tab="body">Body</button>
            <button class="tab-btn" data-tab="auth">Auth</button>
          </div>
          
          <div class="request-tab-content">
            <!-- Params Tab -->
            <div id="params-tab-${tab.id}" class="request-tab active">
              <div class="key-value-editor">
                <div class="kv-header">
                  <span>✓</span>
                  <span>Key</span>
                  <span>Value</span>
                  <span>Description</span>
                  <span></span>
                </div>
                <div id="params-list-${tab.id}" class="kv-list">
                  <!-- Dynamic params rows -->
                </div>
                <button class="add-kv-button" data-type="params" data-tab-id="${tab.id}">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" stroke-width="2"/>
                    <line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" stroke-width="2"/>
                  </svg>
                  Add Parameter
                </button>
              </div>
            </div>
            
            <!-- Headers Tab -->
            <div id="headers-tab-${tab.id}" class="request-tab">
              <div class="key-value-editor">
                <div class="kv-header">
                  <span>✓</span>
                  <span>Key</span>
                  <span>Value</span>
                  <span>Description</span>
                  <span></span>
                </div>
                <div id="headers-list-${tab.id}" class="kv-list">
                  <!-- Dynamic header rows -->
                </div>
                <button class="add-kv-button" data-type="headers" data-tab-id="${tab.id}">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" stroke-width="2"/>
                    <line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" stroke-width="2"/>
                  </svg>
                  Add Header
                </button>
              </div>
            </div>
            
            <!-- Body Tab -->
            <div id="body-tab-${tab.id}" class="request-tab">
              <div class="body-type-selector">
                <label class="body-type-label">Body Type:</label>
                <select class="body-type-dropdown">
                  <option value="none">None</option>
                  <option value="json">JSON</option>
                  <option value="xml">XML</option>
                  <option value="html">HTML</option>
                  <option value="text">Plain Text</option>
                  <option value="javascript">JavaScript</option>
                  <option value="form-urlencoded">x-www-form-urlencoded</option>
                  <option value="form-data">form-data</option>
                  <option value="binary">Binary</option>
                </select>
              </div>
              <div class="body-content">
                <div class="body-editor-container">
                  <div class="body-editor-header">
                    <div class="body-format-info">
                      <span class="format-indicator">JSON</span>
                      <span class="size-indicator">0 bytes</span>
                    </div>
                    <div class="body-actions">
                      <button class="body-action-btn" title="Format/Prettify">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                          <path d="M16 4h2a2 2 0 012 2v12a2 2 0 01-2 2h-2" stroke="currentColor" stroke-width="2"/>
                          <path d="M8 20H6a2 2 0 01-2-2V6a2 2 0 012-2h2" stroke="currentColor" stroke-width="2"/>
                          <circle cx="12" cy="12" r="2" fill="currentColor"/>
                        </svg>
                      </button>
                      <button class="body-action-btn" title="Clear Content">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                          <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                  <textarea class="body-editor" id="body-editor-${tab.id}" placeholder="Enter request body...">${tab.body}</textarea>
                </div>
              </div>
            </div>
            
            <!-- Auth Tab -->
            <div id="auth-tab-${tab.id}" class="request-tab">
              <div class="auth-type-selector">
                <select class="auth-select">
                  <option value="none">No Auth</option>
                  <option value="basic">Basic Auth</option>
                  <option value="bearer">Bearer Token</option>
                  <option value="api-key">API Key</option>
                  <option value="oauth2">OAuth 2.0</option>
                </select>
              </div>
              <div class="auth-config">
                <!-- Auth configuration will be added here -->
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Setup event listeners for this tab
    this.setupTabEventListeners(tab.id);
  }

  /**
   * Setup event listeners for a specific tab
   */
  private setupTabEventListeners(tabId: string): void {
    const sendButton = doc.getElementById(`send-request-${tabId}`);
    if (sendButton) {
      sendButton.addEventListener('click', () => this.sendRequestFromTab(tabId));
    }

    // Method selector change listener
    const methodSelect = doc.getElementById(`request-method-${tabId}`) as any;
    if (methodSelect) {
      methodSelect.addEventListener('change', () => {
        const tab = this.requestTabs.find(t => t.id === tabId);
        if (tab) {
          const newMethod = methodSelect.value;
          tab.method = newMethod;
          
          // If this tab is linked to a saved request, update the collection
          if (tab.sourceId) {
            this.updateRequestInCollection(tab.sourceId, { method: newMethod });
          }
          
          // Update tab display
          this.renderRequestTabs();
        }
      });
    }

    // URL input change listener
    const urlInput = doc.getElementById(`request-url-${tabId}`) as any;
    if (urlInput) {
      urlInput.addEventListener('input', () => {
        const tab = this.requestTabs.find(t => t.id === tabId);
        if (tab) {
          tab.url = urlInput.value;
          tab.isDirty = true;
          
          // Auto-save if this tab is linked to a saved request
          if (tab.sourceId) {
            this.debounceAutoSave(tab.sourceId, { url: urlInput.value });
          }
          
          // Save tab state
          this.saveTabState();
        }
      });
    }

    // Setup request content tabs
    const requestTabs = doc.querySelectorAll('.request-tabs .tab-btn');
    const requestTabContents = doc.querySelectorAll('.request-tab');

    requestTabs.forEach((tab: any) => {
      tab.addEventListener('click', () => {
        const targetTab = tab.dataset.tab;
        
        // Update active tab
        requestTabs.forEach((t: any) => t.classList.remove('active'));
        tab.classList.add('active');
        
        // Update active content
        requestTabContents.forEach((content: any) => {
          content.classList.remove('active');
          if (content.id === `${targetTab}-tab-${tabId}`) {
            content.classList.add('active');
          }
        });
      });
    });

    // Setup add key-value buttons
    const addButtons = doc.querySelectorAll('.add-kv-button');
    addButtons.forEach((btn: any) => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.type;
        const tabId = btn.dataset.tabId;
        this.addKeyValueRowForTab(type, tabId);
      });
    });

    // Add initial rows
    this.addKeyValueRowForTab('params', tabId);
    this.addKeyValueRowForTab('headers', tabId);
  }

  /**
   * Add key-value row for a specific tab
   */
  private addKeyValueRowForTab(type: string, tabId: string, key: string = '', value: string = '', description: string = '', enabled: boolean = true): void {
    const container = doc.getElementById(`${type}-list-${tabId}`);
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
   * Send request from specific tab
   */
  private async sendRequestFromTab(tabId: string): Promise<void> {
    const tab = this.requestTabs.find(t => t.id === tabId);
    if (!tab) return;

    console.log('Sending request from tab:', tabId);
    
    // Get request data from the tab
    const methodEl = doc.getElementById(`request-method-${tabId}`) as any;
    const urlEl = doc.getElementById(`request-url-${tabId}`) as any;
    const method = methodEl?.value || 'GET';
    const url = urlEl?.value?.trim();
    
    if (!url) {
      this.showError('Please enter a URL');
      return;
    }

    // Update tab data
    tab.method = method;
    tab.url = url;

    // Collect headers for this tab
    const headers: Record<string, string> = {};
    const headerRows = doc.querySelectorAll(`#headers-list-${tabId} .kv-row`);
    headerRows.forEach((row: any) => {
      const checkbox = row.querySelector('.kv-checkbox');
      const keyInput = row.querySelector('.key-input');
      const valueInput = row.querySelector('.value-input');
      
      if (checkbox?.checked && keyInput?.value?.trim() && valueInput?.value) {
        headers[keyInput.value.trim()] = valueInput.value;
      }
    });

    // Collect params and update URL
    const params = new URLSearchParams();
    const paramRows = doc.querySelectorAll(`#params-list-${tabId} .kv-row`);
    paramRows.forEach((row: any) => {
      const checkbox = row.querySelector('.kv-checkbox');
      const keyInput = row.querySelector('.key-input');
      const valueInput = row.querySelector('.value-input');
      
      if (checkbox?.checked && keyInput?.value?.trim()) {
        params.append(keyInput.value.trim(), valueInput?.value || '');
      }
    });

    // Build final URL with parameters
    let finalUrl = url;
    if (params.toString()) {
      const separator = url.includes('?') ? '&' : '?';
      finalUrl = `${url}${separator}${params.toString()}`;
    }

    // Get body data
    let body: string | undefined;
    const bodyEditor = doc.getElementById(`body-editor-${tabId}`) as any;
    if (bodyEditor && bodyEditor.value.trim()) {
      body = bodyEditor.value.trim();
    }

    // Update UI for loading state
    const sendBtn = doc.getElementById(`send-request-${tabId}`);
    const originalText = sendBtn?.textContent || 'Send';
    
    if (sendBtn) {
      sendBtn.textContent = 'Sending...';
      sendBtn.setAttribute('disabled', 'true');
    }

    try {
      // Make the request
      const requestId = `req_${Date.now()}`;

      if (api && api.network) {
        const result = await api.network.executeRequest(requestId, {
          method,
          url: finalUrl,
          headers,
          body,
          timeout: 30000,
          followRedirects: true
        });

        if (result.success && result.data) {
          this.displayResponse(result.data);
        } else {
          this.showError(result.error || 'Request failed');
        }
      } else {
        this.showError('Network API not available');
      }
    } catch (error: any) {
      console.error('Request failed:', error);
      this.showError(error.message || 'Request failed');
    } finally {
      // Restore button state
      if (sendBtn) {
        sendBtn.textContent = originalText;
        sendBtn.removeAttribute('disabled');
      }
    }
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
