import { ApiResponse } from '../../../shared/types';
import { ResponseSearchConfig } from '../../types/response-types';

export class ResponseSearch {
  private searchContainer: HTMLElement | null = null;
  private searchInput: HTMLInputElement | null = null;
  private resultsSpan: HTMLSpanElement | null = null;
  private isVisible = false;
  private currentMatches: number = 0;
  private totalMatches: number = 0;
  private currentIndex: number = -1;
  private onSearchChangeCallback: ((query: string) => void) | null = null;
  private onNavigateCallback: ((direction: number) => void) | null = null;

  constructor(container: HTMLElement, private config: ResponseSearchConfig) {
    this.createSearchInterface(container);
    this.setupEventListeners();
  }

  private createSearchInterface(container: HTMLElement): void {
    // Find existing floating search or create new one
    this.searchContainer = container.querySelector('#floating-search-bar');
    
    if (!this.searchContainer) {
      this.searchContainer = document.createElement('div');
      this.searchContainer.id = 'floating-search-bar';
      this.searchContainer.className = 'floating-search-bar';
      this.searchContainer.style.display = 'none';
      
      this.searchContainer.innerHTML = `
        <div class="floating-search-content">
          <input type="text" class="floating-search-input" placeholder="Search in response...">
          <span class="floating-search-results">0/0</span>
          <button id="search-prev" class="search-nav-btn" title="Previous match">↑</button>
          <button id="search-next" class="search-nav-btn" title="Next match">↓</button>
          <button id="search-close" class="search-close-btn" title="Close search">×</button>
        </div>
      `;
      
      container.appendChild(this.searchContainer);
    }

    this.searchInput = this.searchContainer.querySelector('.floating-search-input');
    this.resultsSpan = this.searchContainer.querySelector('.floating-search-results');
  }

  private setupEventListeners(): void {
    if (!this.searchContainer) return;

    const searchInput = this.searchContainer.querySelector('.floating-search-input') as HTMLInputElement;
    const searchClose = this.searchContainer.querySelector('#search-close');
    const searchPrev = this.searchContainer.querySelector('#search-prev');
    const searchNext = this.searchContainer.querySelector('#search-next');

    searchInput?.addEventListener('input', (e) => {
      const query = (e.target as HTMLInputElement).value;
      this.onSearchChangeCallback?.(query);
    });

    searchInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.onNavigateCallback?.(e.shiftKey ? -1 : 1);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.hide();
      }
    });

    searchClose?.addEventListener('click', () => this.hide());
    searchPrev?.addEventListener('click', () => this.onNavigateCallback?.(-1));
    searchNext?.addEventListener('click', () => this.onNavigateCallback?.(1));
  }

  public show(): void {
    if (this.searchContainer) {
      this.searchContainer.style.display = 'flex';
      this.isVisible = true;
      
      // Focus the input
      setTimeout(() => {
        this.searchInput?.focus();
      }, 100);
    }
  }

  public hide(): void {
    if (this.searchContainer) {
      this.searchContainer.style.display = 'none';
      this.isVisible = false;
      
      // Clear search
      if (this.searchInput) {
        this.searchInput.value = '';
      }
      this.onSearchChangeCallback?.('');
      this.updateResults(0, 0, -1);
    }
  }

  public toggle(): void {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  public updateResults(current: number, total: number, currentIndex: number = -1): void {
    this.currentMatches = current;
    this.totalMatches = total;
    this.currentIndex = currentIndex;
    
    if (this.resultsSpan) {
      const displayCurrent = currentIndex === -1 ? 0 : currentIndex + 1;
      this.resultsSpan.textContent = `${displayCurrent}/${total}`;
    }
  }

  public onSearchChange(callback: (query: string) => void): void {
    this.onSearchChangeCallback = callback;
  }

  public onNavigate(callback: (direction: number) => void): void {
    this.onNavigateCallback = callback;
  }

  public getQuery(): string {
    return this.searchInput?.value || '';
  }

  public setQuery(query: string): void {
    if (this.searchInput) {
      this.searchInput.value = query;
    }
  }

  public isSearchVisible(): boolean {
    return this.isVisible;
  }

  public focus(): void {
    this.searchInput?.focus();
  }

  public destroy(): void {
    this.searchContainer?.remove();
    this.onSearchChangeCallback = null;
    this.onNavigateCallback = null;
  }
}