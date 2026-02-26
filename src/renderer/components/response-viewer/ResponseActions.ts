import { ApiResponse } from '../../../shared/types';
import { iconHtml } from '../../utils/icons';

export class ResponseActions {
  private actionsContainer: HTMLElement | null = null;
  private onCopyCallback: (() => void) | null = null;
  private onFullscreenCallback: (() => void) | null = null;
  private onSearchCallback: (() => void) | null = null;
  private onCollapseCallback: (() => void) | null = null;
  private onExpandCallback: (() => void) | null = null;
  private onScrollTopCallback: (() => void) | null = null;
  private onScrollBottomCallback: (() => void) | null = null;
  private onExportCallback: (() => void) | null = null;
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
        <button id="enlarge-btn" class="response-action-btn" title="Fullscreen view">${iconHtml('maximize')}</button>
        <button id="copy-btn" class="response-action-btn" title="Copy response">${iconHtml('clipboard')}</button>
        <button id="export-btn" class="response-action-btn" title="Export JSON">${iconHtml('export')}</button>
        <button id="search-btn" class="response-action-btn" title="Search in response">${iconHtml('search')}</button>
        <button id="collapse-btn" class="response-action-btn" title="Collapse all">${iconHtml('collapse')}</button>
        <button id="expand-btn" class="response-action-btn" title="Expand all">${iconHtml('expand')}</button>
        <button id="top-btn" class="response-action-btn" title="Scroll to top">${iconHtml('arrow-up')}</button>
        <button id="bottom-btn" class="response-action-btn" title="Scroll to bottom">${iconHtml('arrow-down')}</button>
        <button id="ask-ai-btn" class="response-action-btn ask-ai-btn" title="Ask AI about this response">${iconHtml('bot')}</button>
      `;
      
      container.appendChild(this.actionsContainer);
    }
  }

  private setupEventListeners(): void {
    if (!this.actionsContainer) return;

    const enlargeBtn = this.actionsContainer.querySelector('#enlarge-btn');
    const copyBtn = this.actionsContainer.querySelector('#copy-btn');
    const exportBtn = this.actionsContainer.querySelector('#export-btn');
    const searchBtn = this.actionsContainer.querySelector('#search-btn');
    const collapseBtn = this.actionsContainer.querySelector('#collapse-btn');
    const expandBtn = this.actionsContainer.querySelector('#expand-btn');
    const topBtn = this.actionsContainer.querySelector('#top-btn');
    const bottomBtn = this.actionsContainer.querySelector('#bottom-btn');
    const askAiBtn = this.actionsContainer.querySelector('#ask-ai-btn');

    enlargeBtn?.addEventListener('click', () => this.onFullscreenCallback?.());
    copyBtn?.addEventListener('click', () => this.onCopyCallback?.());
    exportBtn?.addEventListener('click', () => this.onExportCallback?.());
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

  public updateVisibility(response: ApiResponse | null, activeTab: string, isJsonResponse: boolean): void {
    const shouldShow = activeTab === 'body' &&
                     response &&
                     isJsonResponse;
    
    if (shouldShow) {
      this.showForJsonResponse();
    } else {
      this.hide();
    }
  }

  public onCopy(callback: () => void): void {
    this.onCopyCallback = callback;
  }

  public onExport(callback: () => void): void {
    this.onExportCallback = callback;
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
    this.onExportCallback = null;
    this.onAskAiCallback = null;
  }
}
