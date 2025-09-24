/**
 * SearchBar component with next/prev navigation and JSONPath support
 */

import { SearchMatch, VIEWER_CONSTANTS, VIEWER_CLASSES } from './types';
import { ViewerStateManager } from './viewerState';

export interface SearchBarOptions {
  container: HTMLElement;
  stateManager: ViewerStateManager;
  onSearch?: (query: string) => void;
  onNavigate?: (direction: 1 | -1) => void;
  onClose?: () => void;
  onJsonPathEvaluate?: (path: string) => void;
  supportJsonPath?: boolean;
}

export interface SearchBarHandle {
  show: () => void;
  hide: () => void;
  focus: () => void;
  setQuery: (query: string) => void;
  updateResults: (current: number, total: number) => void;
  setMode: (mode: 'search' | 'jsonpath') => void;
  destroy: () => void;
}

export class SearchBar implements SearchBarHandle {
  private container: HTMLElement;
  private stateManager: ViewerStateManager;
  private options: SearchBarOptions;
  private elements: Map<string, HTMLElement> = new Map();
  private searchTimeout: number | null = null;
  private isVisible = false;
  private currentMode: 'search' | 'jsonpath' = 'search';

  constructor(options: SearchBarOptions) {
    this.options = options;
    this.container = options.container;
    this.stateManager = options.stateManager;

    this.render();
    this.attachEventListeners();
    this.applyStyles();
  }

  private render(): void {
    this.container.className = `${VIEWER_CLASSES.searchBar} json-viewer-search`;
    this.container.style.display = 'none';

    const searchBar = document.createElement('div');
    searchBar.className = 'search-bar-container';

    // Mode selector (if JSONPath is supported)
    if (this.options.supportJsonPath) {
      const modeSelector = this.createModeSelector();
      searchBar.appendChild(modeSelector);
    }

    // Main search input container
    const inputContainer = this.createInputContainer();
    searchBar.appendChild(inputContainer);

    // Navigation controls
    const navigation = this.createNavigationControls();
    searchBar.appendChild(navigation);

    // Close button
    const closeButton = this.createCloseButton();
    searchBar.appendChild(closeButton);

    this.container.appendChild(searchBar);
  }

  private createModeSelector(): HTMLElement {
    const selector = document.createElement('div');
    selector.className = 'search-mode-selector';

    const searchMode = document.createElement('button');
    searchMode.className = 'mode-button active';
    searchMode.textContent = 'Search';
    searchMode.dataset.mode = 'search';

    const jsonPathMode = document.createElement('button');
    jsonPathMode.className = 'mode-button';
    jsonPathMode.textContent = 'JSONPath';
    jsonPathMode.dataset.mode = 'jsonpath';

    searchMode.addEventListener('click', () => this.switchMode('search'));
    jsonPathMode.addEventListener('click', () => this.switchMode('jsonpath'));

    selector.appendChild(searchMode);
    selector.appendChild(jsonPathMode);

    this.elements.set('mode-search', searchMode);
    this.elements.set('mode-jsonpath', jsonPathMode);

    return selector;
  }

  private createInputContainer(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'search-input-container';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'search-input';
    input.placeholder = this.getPlaceholderText();

    const icon = document.createElement('span');
    icon.className = 'search-icon';
    icon.textContent = '🔍';

    container.appendChild(icon);
    container.appendChild(input);

    this.elements.set('input', input);
    return container;
  }

  private createNavigationControls(): HTMLElement {
    const navigation = document.createElement('div');
    navigation.className = 'search-navigation';

    const results = document.createElement('span');
    results.className = 'search-results';
    results.textContent = '0/0';

    const prevButton = document.createElement('button');
    prevButton.className = 'nav-button';
    prevButton.textContent = '↑';
    prevButton.title = 'Previous (Shift+F3)';
    prevButton.disabled = true;

    const nextButton = document.createElement('button');
    nextButton.className = 'nav-button';
    nextButton.textContent = '↓';
    nextButton.title = 'Next (F3)';
    nextButton.disabled = true;

    prevButton.addEventListener('click', () => this.navigate(-1));
    nextButton.addEventListener('click', () => this.navigate(1));

    navigation.appendChild(results);
    navigation.appendChild(prevButton);
    navigation.appendChild(nextButton);

    this.elements.set('results', results);
    this.elements.set('prev', prevButton);
    this.elements.set('next', nextButton);

    return navigation;
  }

  private createCloseButton(): HTMLElement {
    const button = document.createElement('button');
    button.className = 'search-close';
    button.textContent = '×';
    button.title = 'Close (Escape)';

    button.addEventListener('click', () => this.hide());

    this.elements.set('close', button);
    return button;
  }

  private attachEventListeners(): void {
    const input = this.elements.get('input') as HTMLInputElement;
    if (!input) return;

    // Search input handling
    input.addEventListener('input', (e) => {
      const query = (e.target as HTMLInputElement).value;
      this.handleSearch(query);
    });

    input.addEventListener('keydown', (e) => {
      switch (e.key) {
        case 'Enter':
          e.preventDefault();
          this.navigate(e.shiftKey ? -1 : 1);
          break;
        case 'Escape':
          e.preventDefault();
          this.hide();
          break;
        case 'F3':
          e.preventDefault();
          this.navigate(e.shiftKey ? -1 : 1);
          break;
      }
    });

    // Global keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (!this.isVisible) return;

      if (e.key === 'F3') {
        e.preventDefault();
        this.navigate(e.shiftKey ? -1 : 1);
      }
    });

    // Restore previous search query when showing
    this.container.addEventListener('show', () => {
      const state = this.stateManager.getState();
      if (state.search.query) {
        input.value = state.search.query;
        this.updateResults(state.search.currentIndex + 1, state.search.totalMatches);
      }
    });
  }

  private handleSearch(query: string): void {
    // Clear existing timeout
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }

    // Debounce search
    this.searchTimeout = setTimeout(() => {
      this.performSearch(query);
    }, VIEWER_CONSTANTS.SEARCH_DEBOUNCE) as unknown as number;
  }

  private performSearch(query: string): void {
    this.stateManager.updateSearch({ query });

    if (this.currentMode === 'search') {
      this.options.onSearch?.(query);
    } else {
      this.options.onJsonPathEvaluate?.(query);
    }
  }

  private navigate(direction: 1 | -1): void {
    this.options.onNavigate?.(direction);
  }

  private switchMode(mode: 'search' | 'jsonpath'): void {
    if (this.currentMode === mode) return;

    this.currentMode = mode;

    // Update mode buttons
    const searchButton = this.elements.get('mode-search');
    const jsonPathButton = this.elements.get('mode-jsonpath');

    if (searchButton && jsonPathButton) {
      searchButton.classList.toggle('active', mode === 'search');
      jsonPathButton.classList.toggle('active', mode === 'jsonpath');
    }

    // Update input placeholder
    const input = this.elements.get('input') as HTMLInputElement;
    if (input) {
      input.placeholder = this.getPlaceholderText();
      input.value = '';
    }

    // Clear results
    this.updateResults(0, 0);
  }

  private getPlaceholderText(): string {
    return this.currentMode === 'search'
      ? 'Search in JSON...'
      : 'Enter JSONPath (e.g., $.users[0].name)';
  }

  private applyStyles(): void {
    const style = document.createElement('style');
    style.textContent = `
      .json-viewer-search {
        position: absolute;
        top: 8px;
        right: 8px;
        z-index: 100;
        background: var(--bg-primary, #fff);
        border: 1px solid var(--border-color, #e0e0e0);
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        backdrop-filter: blur(10px);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 13px;
      }

      .search-bar-container {
        display: flex;
        align-items: center;
        padding: 8px;
        gap: 8px;
        min-width: 300px;
      }

      .search-mode-selector {
        display: flex;
        background: var(--bg-secondary, #f8f9fa);
        border-radius: 4px;
        overflow: hidden;
      }

      .mode-button {
        padding: 4px 8px;
        background: none;
        border: none;
        cursor: pointer;
        font-size: 11px;
        transition: all 0.2s;
      }

      .mode-button:hover {
        background: var(--bg-primary, #fff);
      }

      .mode-button.active {
        background: var(--primary-color, #007bff);
        color: white;
      }

      .search-input-container {
        position: relative;
        flex: 1;
        display: flex;
        align-items: center;
      }

      .search-icon {
        position: absolute;
        left: 8px;
        color: var(--text-secondary, #666);
        font-size: 12px;
        pointer-events: none;
      }

      .search-input {
        width: 100%;
        padding: 6px 8px 6px 28px;
        border: 1px solid var(--border-color, #e0e0e0);
        border-radius: 4px;
        font-size: 12px;
        background: var(--bg-primary, #fff);
      }

      .search-input:focus {
        outline: none;
        border-color: var(--primary-color, #007bff);
        box-shadow: 0 0 0 2px rgba(0,123,255,0.25);
      }

      .search-navigation {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .search-results {
        font-size: 11px;
        color: var(--text-secondary, #666);
        min-width: 32px;
        text-align: center;
      }

      .nav-button {
        width: 24px;
        height: 24px;
        padding: 0;
        background: var(--bg-secondary, #f8f9fa);
        border: 1px solid var(--border-color, #e0e0e0);
        border-radius: 3px;
        cursor: pointer;
        font-size: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
      }

      .nav-button:hover:not(:disabled) {
        background: var(--bg-primary, #fff);
        border-color: var(--primary-color, #007bff);
      }

      .nav-button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .search-close {
        width: 24px;
        height: 24px;
        padding: 0;
        background: none;
        border: none;
        cursor: pointer;
        font-size: 16px;
        font-weight: bold;
        color: var(--text-secondary, #666);
        border-radius: 3px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
      }

      .search-close:hover {
        background: var(--bg-secondary, #f8f9fa);
        color: var(--text-primary, #333);
      }

      /* JSONPath mode specific styles */
      .json-viewer-search.jsonpath-mode .search-input {
        font-family: 'JetBrains Mono', 'SF Mono', Monaco, monospace;
      }

      /* Animation */
      .json-viewer-search {
        animation: slideInFromTop 0.2s ease-out;
      }

      @keyframes slideInFromTop {
        from {
          opacity: 0;
          transform: translateY(-10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      /* Dark theme support */
      @media (prefers-color-scheme: dark) {
        .json-viewer-search {
          background: var(--bg-primary, #1e1e1e);
          border-color: var(--border-color, #333);
        }

        .search-input {
          background: var(--bg-primary, #1e1e1e);
          color: var(--text-primary, #fff);
          border-color: var(--border-color, #333);
        }

        .search-input:focus {
          border-color: var(--primary-color, #0078d4);
          box-shadow: 0 0 0 2px rgba(0,120,212,0.25);
        }
      }
    `;

    if (!document.querySelector('#searchbar-styles')) {
      style.id = 'searchbar-styles';
      document.head.appendChild(style);
    }
  }

  // Public API

  public show(): void {
    if (this.isVisible) return;

    this.isVisible = true;
    this.container.style.display = 'block';

    // Dispatch custom event for initialization
    this.container.dispatchEvent(new CustomEvent('show'));

    // Focus input after a short delay to ensure it's visible
    setTimeout(() => {
      this.focus();
    }, 100);

    this.stateManager.updateSearch({ isVisible: true });
  }

  public hide(): void {
    if (!this.isVisible) return;

    this.isVisible = false;
    this.container.style.display = 'none';

    // Clear search
    const input = this.elements.get('input') as HTMLInputElement;
    if (input) {
      input.value = '';
    }

    this.updateResults(0, 0);
    this.stateManager.updateSearch({ isVisible: false, query: '' });

    this.options.onClose?.();
  }

  public focus(): void {
    const input = this.elements.get('input') as HTMLInputElement;
    if (input && this.isVisible) {
      input.focus();
      input.select();
    }
  }

  public setQuery(query: string): void {
    const input = this.elements.get('input') as HTMLInputElement;
    if (input) {
      input.value = query;
      this.handleSearch(query);
    }
  }

  public updateResults(current: number, total: number): void {
    const results = this.elements.get('results');
    const prevButton = this.elements.get('prev') as HTMLButtonElement;
    const nextButton = this.elements.get('next') as HTMLButtonElement;

    if (results) {
      results.textContent = `${current}/${total}`;
    }

    if (prevButton) {
      prevButton.disabled = total === 0;
    }

    if (nextButton) {
      nextButton.disabled = total === 0;
    }

    // Update state
    this.stateManager.updateSearch({
      currentIndex: current - 1,
      totalMatches: total
    });
  }

  public setMode(mode: 'search' | 'jsonpath'): void {
    if (this.options.supportJsonPath) {
      this.switchMode(mode);
    }
  }

  public destroy(): void {
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }

    // Remove event listeners would be handled by removing the DOM elements
    this.container.innerHTML = '';
  }
}