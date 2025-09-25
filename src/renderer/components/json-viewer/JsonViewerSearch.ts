import { JsonViewer } from '../JsonViewer';

export class JsonViewerSearch {
  private container: HTMLElement;
  private jsonViewer: JsonViewer | null = null;
  private isFloatingSearchVisible = false;

  constructor(container: HTMLElement) {
    this.container = container;
    this.initialize();
  }

  private initialize(): void {
    this.setupDOM();
    this.setupEventListeners();
  }

  private setupDOM(): void {
    // Create floating search bar and append to container
    const searchBarHtml = `
      <div id="json-viewer-floating-search-bar" class="floating-search-bar" style="display: none;">
        <input type="text" class="floating-search-input" placeholder="Search in JSON...">
        <div class="floating-search-results">0/0</div>
        <button id="json-viewer-search-prev" class="floating-search-nav">↑</button>
        <button id="json-viewer-search-next" class="floating-search-nav">↓</button>
        <button id="json-viewer-search-close" class="floating-search-close">×</button>
      </div>
    `;

    this.container.insertAdjacentHTML('beforeend', searchBarHtml);
  }

  private setupEventListeners(): void {
    const floatingSearchBar = document.getElementById('json-viewer-floating-search-bar');
    const searchInput = floatingSearchBar?.querySelector('.floating-search-input') as HTMLInputElement;
    const searchClose = document.getElementById('json-viewer-search-close');
    const searchPrev = document.getElementById('json-viewer-search-prev');
    const searchNext = document.getElementById('json-viewer-search-next');

    searchInput?.addEventListener('input', (e) => {
      const query = (e.target as HTMLInputElement).value;
      this.performFloatingSearch(query);
    });

    searchInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.navigateFloatingSearch(e.shiftKey ? -1 : 1);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.hideFloatingSearch();
      }
    });

    searchClose?.addEventListener('click', () => this.hideFloatingSearch());
    searchPrev?.addEventListener('click', () => this.navigateFloatingSearch(-1));
    searchNext?.addEventListener('click', () => this.navigateFloatingSearch(1));
  }

  public setJsonViewer(jsonViewer: JsonViewer | null): void {
    this.jsonViewer = jsonViewer;
  }

  public toggleFloatingSearch(): void {
    if (!this.jsonViewer) {
      return;
    }

    if (this.isFloatingSearchVisible) {
      this.hideFloatingSearch();
    } else {
      this.showFloatingSearch();
    }
  }

  private showFloatingSearch(): void {
    const floatingSearchBar = document.getElementById('json-viewer-floating-search-bar')!;
    const searchInput = floatingSearchBar.querySelector('.floating-search-input') as HTMLInputElement;

    floatingSearchBar.style.display = 'flex';
    this.isFloatingSearchVisible = true;

    setTimeout(() => {
      searchInput.focus();
    }, 100);
  }

  private hideFloatingSearch(): void {
    const floatingSearchBar = document.getElementById('json-viewer-floating-search-bar')!;
    floatingSearchBar.style.display = 'none';
    this.isFloatingSearchVisible = false;

    if (this.jsonViewer) {
      this.jsonViewer.clearSearch();
    }
    this.updateFloatingSearchResults();
  }

  private performFloatingSearch(query: string): void {
    if (!this.jsonViewer) return;

    this.jsonViewer.performSearch(query);
    this.updateFloatingSearchResults();
  }

  private navigateFloatingSearch(direction: number): void {
    if (!this.jsonViewer) return;

    this.jsonViewer.navigateSearch(direction);
    this.updateFloatingSearchResults();
  }

  private updateFloatingSearchResults(): void {
    const resultsSpan = document.querySelector('#json-viewer-floating-search-bar .floating-search-results') as HTMLElement;
    if (resultsSpan && this.jsonViewer) {
      const searchInfo = this.jsonViewer.getSearchInfo();
      resultsSpan.textContent = `${searchInfo.current}/${searchInfo.total}`;
    }
  }

  public isSearchVisible(): boolean {
    return this.isFloatingSearchVisible;
  }

  public destroy(): void {
    // Remove the floating search bar from DOM
    const floatingSearchBar = document.getElementById('json-viewer-floating-search-bar');
    if (floatingSearchBar) {
      floatingSearchBar.remove();
    }

    this.jsonViewer = null;
    this.isFloatingSearchVisible = false;
  }
}