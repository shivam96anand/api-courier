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
  private onExportCallback: (() => void) | null = null;
  private onAskAiCallback: (() => void) | null = null;

  constructor(container: HTMLElement) {
    this.setupActionsContainer(container);
    this.setupEventListeners();
  }

  private setupActionsContainer(container: HTMLElement): void {
    this.actionsContainer = container.querySelector('#response-actions');

    if (!this.actionsContainer) {
      this.actionsContainer = document.createElement('div');
      this.actionsContainer.id = 'response-actions';
      this.actionsContainer.className = 'response-actions';
      this.actionsContainer.style.display = 'none';

      this.actionsContainer.innerHTML = `
        <button id="enlarge-btn" class="response-action-btn" title="Fullscreen">Enlarge</button>
        <button id="search-btn" class="response-action-btn" title="Search (${navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+F)">Search</button>
        <button id="copy-btn" class="response-action-btn" title="Copy response">Copy</button>
        <button id="export-btn" class="response-action-btn" title="Export JSON">Export</button>
        <button id="collapse-btn" class="response-action-btn" title="Collapse all">Collapse</button>
        <button id="expand-btn" class="response-action-btn" title="Expand all">Expand</button>
        <button id="top-btn" class="response-action-btn" title="Scroll to top">Top</button>
        <button id="bottom-btn" class="response-action-btn" title="Scroll to bottom">Bottom</button>
        <button id="ask-ai-btn" class="response-action-btn ask-ai-btn" title="Ask AI">Ask AI</button>
      `;

      // Insert after toolbar but before body/header sections
      const toolbar = container.querySelector('.response-toolbar');
      if (toolbar && toolbar.parentNode) {
        toolbar.parentNode.insertBefore(
          this.actionsContainer,
          toolbar.nextSibling
        );
      } else {
        container.prepend(this.actionsContainer);
      }
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

  public updateVisibility(
    response: ApiResponse | null,
    activeTab: string,
    isJsonResponse: boolean,
    isXmlResponse: boolean = false
  ): void {
    const shouldShow =
      activeTab === 'body' && response && (isJsonResponse || isXmlResponse);
    if (shouldShow) {
      this.showForJsonResponse();
      const exportBtn =
        this.actionsContainer?.querySelector<HTMLElement>('#export-btn');
      const collapseBtn =
        this.actionsContainer?.querySelector<HTMLElement>('#collapse-btn');
      const expandBtn =
        this.actionsContainer?.querySelector<HTMLElement>('#expand-btn');
      const display = isJsonResponse ? '' : 'none';
      if (exportBtn) exportBtn.style.display = display;
      if (collapseBtn) collapseBtn.style.display = display;
      if (expandBtn) expandBtn.style.display = display;
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
