/**
 * Main renderer process application
 */

// Simple console test
console.log('API Courier starting...');

// Get API from window with type assertion
const api = (window as any).apiCourier;

/**
 * Main Application Class
 */
class APICourierApp {
  private currentColorTheme: string = 'blue';

  constructor() {
    this.initializeApp();
  }

  /**
   * Initialize the application
   */
  private async initializeApp(): Promise<void> {
    try {
      console.log('Initializing API Courier...');
      this.setupEventListeners();
      console.log('API Courier initialized successfully');
    } catch (error) {
      console.error('Failed to initialize API Courier:', error);
    }
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    // Initialize DOM after page loads
    document.addEventListener('DOMContentLoaded', () => {
      this.initializeDOMElements();
    });
  }

  /**
   * Initialize DOM elements
   */
  private initializeDOMElements(): void {
    console.log('Initializing DOM elements...');

    // Modal functionality
    this.setupModal();
    
    // Collection buttons
    this.setupCollectionButtons();
    
    // JSON Tree Viewer
    this.initializeJSONViewer();
  }

  /**
   * Setup modal dialog
   */
  private setupModal(): void {
    console.log('Setting up modal...');
  }

  /**
   * Setup collection buttons
   */
  private setupCollectionButtons(): void {
    const newFolderBtn = document.getElementById('new-folder');
    if (newFolderBtn) {
      newFolderBtn.addEventListener('click', () => {
        this.createNewFolder();
      });
    }
  }

  /**
   * Create new folder
   */
  private async createNewFolder(): Promise<void> {
    console.log('Creating new folder...');
    
    // Use custom modal instead of prompt()
    const name = await this.showModal('New Folder', 'Enter folder name:');
    if (!name || !name.trim()) return;

    console.log('Creating folder:', name);
  }

  /**
   * Show custom modal dialog
   */
  private showModal(title: string, message: string, defaultValue = ''): Promise<string | null> {
    return new Promise((resolve) => {
      // Simple implementation for now - later replace with proper modal
      const result = prompt(message);
      resolve(result);
    });
  }

  /**
   * Initialize JSON Viewer
   */
  private initializeJSONViewer(): void {
    console.log('Initializing JSON Viewer...');
    
    if ((window as any).JSONTreeViewer) {
      const container = document.getElementById('json-tree-container');
      if (container) {
        // Initialize JSON tree viewer
        console.log('JSON Tree Viewer available');
      }
    } else {
      console.warn('JSONTreeViewer not available');
    }
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new APICourierApp();
  });
} else {
  new APICourierApp();
}
