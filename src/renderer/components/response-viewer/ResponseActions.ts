import { ApiResponse } from '../../../shared/types';

export class ResponseActions {
  private actionsContainer: HTMLElement | null = null;
  private onFullscreenCallback: (() => void) | null = null;
  private onCollapseCallback: (() => void) | null = null;
  private onExpandCallback: (() => void) | null = null;
  private onScrollTopCallback: (() => void) | null = null;
  private onScrollBottomCallback: (() => void) | null = null;
  private onClearCallback: (() => void) | null = null;
  private onAskAiCallback: (() => void) | null = null;
  private onOpenInNotepadCallback: (() => void) | null = null;

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
        <button id="enlarge-btn" class="response-action-btn" title="Fullscreen" aria-label="Fullscreen">Enlarge</button>
        <button id="open-notepad-btn" class="response-action-btn" title="Open in Notepad" aria-label="Open response in Notepad">Notepad</button>
        <button id="collapse-btn" class="response-action-btn" title="Collapse all" aria-label="Collapse all">Collapse</button>
        <button id="expand-btn" class="response-action-btn" title="Expand all" aria-label="Expand all">Expand</button>
        <button id="top-btn" class="response-action-btn" title="Scroll to top" aria-label="Scroll to top">Top</button>
        <button id="bottom-btn" class="response-action-btn" title="Scroll to bottom" aria-label="Scroll to bottom">Bottom</button>
        <button id="clear-btn" class="response-action-btn response-action-btn--clear" title="Clear response" aria-label="Clear response">Clear</button>
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
    const openNotepadBtn =
      this.actionsContainer.querySelector('#open-notepad-btn');
    const collapseBtn = this.actionsContainer.querySelector('#collapse-btn');
    const expandBtn = this.actionsContainer.querySelector('#expand-btn');
    const topBtn = this.actionsContainer.querySelector('#top-btn');
    const bottomBtn = this.actionsContainer.querySelector('#bottom-btn');
    const clearBtn = this.actionsContainer.querySelector('#clear-btn');

    enlargeBtn?.addEventListener('click', () => this.onFullscreenCallback?.());
    openNotepadBtn?.addEventListener('click', () =>
      this.onOpenInNotepadCallback?.()
    );
    collapseBtn?.addEventListener('click', () => this.onCollapseCallback?.());
    expandBtn?.addEventListener('click', () => this.onExpandCallback?.());
    topBtn?.addEventListener('click', () => this.onScrollTopCallback?.());
    bottomBtn?.addEventListener('click', () => this.onScrollBottomCallback?.());
    clearBtn?.addEventListener('click', () => this.onClearCallback?.());
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
      const openNotepadBtn =
        this.actionsContainer?.querySelector<HTMLElement>('#open-notepad-btn');
      const collapseBtn =
        this.actionsContainer?.querySelector<HTMLElement>('#collapse-btn');
      const expandBtn =
        this.actionsContainer?.querySelector<HTMLElement>('#expand-btn');
      if (openNotepadBtn) openNotepadBtn.style.display = '';
      if (collapseBtn) collapseBtn.style.display = '';
      if (expandBtn) expandBtn.style.display = '';
    } else {
      this.hide();
    }
  }

  public onFullscreen(callback: () => void): void {
    this.onFullscreenCallback = callback;
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
  public onClear(callback: () => void): void {
    this.onClearCallback = callback;
  }
  public onAskAi(callback: () => void): void {
    this.onAskAiCallback = callback;
  }
  public onOpenInNotepad(callback: () => void): void {
    this.onOpenInNotepadCallback = callback;
  }

  public destroy(): void {
    this.actionsContainer?.remove();
    this.onFullscreenCallback = null;
    this.onCollapseCallback = null;
    this.onExpandCallback = null;
    this.onScrollTopCallback = null;
    this.onScrollBottomCallback = null;
    this.onClearCallback = null;
    this.onAskAiCallback = null;
    this.onOpenInNotepadCallback = null;
  }
}
