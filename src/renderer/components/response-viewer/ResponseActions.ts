import { ApiResponse } from '../../../shared/types';

export class ResponseActions {
  private actionsContainer: HTMLElement | null = null;
  private onCopyCallback: (() => void) | null = null;
  private onFullscreenCallback: (() => void) | null = null;
  private onSearchCallback: (() => void) | null = null;
  private onCollapseCallback: (() => void) | null = null;
  private onExpandCallback: (() => void) | null = null;
  private onScrollTopCallback: (() => void) | null = null;
  private onScrollBottomCallback: (() => void) | null = null;
  private onAskAiCallback: (() => void) | null = null;

  constructor(container: HTMLElement) {
    this.setupActionsContainer(container);
    this.setupEventListeners();
  }

  private setupActionsContainer(container: HTMLElement): void {
    // Find existing actions container or create new one
    this.actionsContainer = container.querySelector('#response-actions');
    
    if (!this.actionsContainer) {
      this.actionsContainer = document.createElement('div');
      this.actionsContainer.id = 'response-actions';
      this.actionsContainer.className = 'response-actions';
      this.actionsContainer.style.display = 'none';
      
      this.actionsContainer.innerHTML = `
        <button id="enlarge-btn" title="Fullscreen view">🔍</button>
        <button id="copy-btn" title="Copy response">📋</button>
        <button id="search-btn" title="Search in response">🔍</button>
        <button id="collapse-btn" title="Collapse all">📁</button>
        <button id="expand-btn" title="Expand all">📂</button>
        <button id="top-btn" title="Scroll to top">⬆️</button>
        <button id="bottom-btn" title="Scroll to bottom">⬇️</button>
        <button id="ask-ai-btn" title="Ask AI about this response">🤖</button>
      `;
      
      container.appendChild(this.actionsContainer);
    }
  }

  private setupEventListeners(): void {
    if (!this.actionsContainer) return;

    const enlargeBtn = this.actionsContainer.querySelector('#enlarge-btn');
    const copyBtn = this.actionsContainer.querySelector('#copy-btn');
    const searchBtn = this.actionsContainer.querySelector('#search-btn');
    const collapseBtn = this.actionsContainer.querySelector('#collapse-btn');
    const expandBtn = this.actionsContainer.querySelector('#expand-btn');
    const topBtn = this.actionsContainer.querySelector('#top-btn');
    const bottomBtn = this.actionsContainer.querySelector('#bottom-btn');
    const askAiBtn = this.actionsContainer.querySelector('#ask-ai-btn');

    enlargeBtn?.addEventListener('click', () => this.onFullscreenCallback?.());
    copyBtn?.addEventListener('click', () => this.onCopyCallback?.());
    searchBtn?.addEventListener('click', () => this.onSearchCallback?.());
    collapseBtn?.addEventListener('click', () => this.onCollapseCallback?.());
    expandBtn?.addEventListener('click', () => this.onExpandCallback?.());
    topBtn?.addEventListener('click', () => this.onScrollTopCallback?.());
    bottomBtn?.addEventListener('click', () => this.onScrollBottomCallback?.());
    askAiBtn?.addEventListener('click', () => this.onAskAiCallback?.());
  }

  public showForJsonResponse(): void {
    if (this.actionsContainer) {
      this.actionsContainer.style.display = 'flex';
    }
  }

  public hide(): void {
    if (this.actionsContainer) {
      this.actionsContainer.style.display = 'none';
    }
  }

  public updateVisibility(response: ApiResponse | null, activeTab: string): void {
    const shouldShow = activeTab === 'body' && 
                     response && 
                     this.isJsonResponse(response);
    
    if (shouldShow) {
      this.showForJsonResponse();
    } else {
      this.hide();
    }
  }

  private isJsonResponse(response: ApiResponse): boolean {
    const contentType = response.headers['content-type'] || '';
    return contentType.includes('application/json') || this.isValidJSON(response.body || '');
  }

  private isValidJSON(str: string): boolean {
    try {
      JSON.parse(str);
      return true;
    } catch (e) {
      return false;
    }
  }

  public onCopy(callback: () => void): void {
    this.onCopyCallback = callback;
  }

  public onFullscreen(callback: () => void): void {
    this.onFullscreenCallback = callback;
  }

  public onSearch(callback: () => void): void {
    this.onSearchCallback = callback;
  }

  public onCollapse(callback: () => void): void {
    this.onCollapseCallback = callback;
  }

  public onExpand(callback: () => void): void {
    this.onExpandCallback = callback;
  }

  public onScrollTop(callback: () => void): void {
    this.onScrollTopCallback = callback;
  }

  public onScrollBottom(callback: () => void): void {
    this.onScrollBottomCallback = callback;
  }

  public onAskAi(callback: () => void): void {
    this.onAskAiCallback = callback;
  }

  public destroy(): void {
    this.actionsContainer?.remove();
    this.onCopyCallback = null;
    this.onFullscreenCallback = null;
    this.onSearchCallback = null;
    this.onCollapseCallback = null;
    this.onExpandCallback = null;
    this.onScrollTopCallback = null;
    this.onScrollBottomCallback = null;
    this.onAskAiCallback = null;
  }
}