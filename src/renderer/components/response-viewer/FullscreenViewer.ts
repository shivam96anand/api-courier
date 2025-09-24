/**
 * Fullscreen viewer modal with 85% width and backdrop blur
 */

import { ViewerTab, JsonNode, VIEWER_CLASSES } from './types';
import { ViewerStateManager } from './viewerState';
import { RawEditor, RawEditorHandle } from './RawEditor';
import { JsonTree, JsonTreeHandle } from './JsonTree';
import { Toolbar, ToolbarHandle } from './Toolbar';
import { SearchBar, SearchBarHandle } from './SearchBar';
import { JsonUtils } from './utils/json';

export interface FullscreenViewerOptions {
  requestId: string;
  initialTab?: ViewerTab;
  initialContent?: string;
  onClose?: () => void;
}

export interface FullscreenViewerHandle {
  show: () => void;
  hide: () => void;
  setContent: (content: string) => void;
  setActiveTab: (tab: ViewerTab) => void;
  destroy: () => void;
}

export class FullscreenViewer implements FullscreenViewerHandle {
  private modal: HTMLElement | null = null;
  private stateManager: ViewerStateManager;
  private options: FullscreenViewerOptions;
  private rawEditor: RawEditorHandle | null = null;
  private jsonTree: JsonTreeHandle | null = null;
  private toolbar: ToolbarHandle | null = null;
  private searchBar: SearchBarHandle | null = null;
  private currentContent = '';
  private parsedData: any = null;
  private isVisible = false;

  constructor(options: FullscreenViewerOptions) {
    this.options = options;
    this.stateManager = new ViewerStateManager(`${options.requestId}-fullscreen`);

    if (options.initialContent) {
      this.currentContent = options.initialContent;
    }

    if (options.initialTab) {
      this.stateManager.setActiveTab(options.initialTab);
    }
  }

  private createModal(): HTMLElement {
    const modal = document.createElement('div');
    modal.className = `${VIEWER_CLASSES.fullscreen} json-viewer-fullscreen`;

    const backdrop = document.createElement('div');
    backdrop.className = 'fullscreen-backdrop';

    const dialog = document.createElement('div');
    dialog.className = 'fullscreen-dialog';

    const header = this.createHeader();
    const body = this.createBody();

    dialog.appendChild(header);
    dialog.appendChild(body);
    modal.appendChild(backdrop);
    modal.appendChild(dialog);

    this.attachModalEventListeners(modal, backdrop);

    return modal;
  }

  private createHeader(): HTMLElement {
    const header = document.createElement('div');
    header.className = 'fullscreen-header';

    const title = document.createElement('h2');
    title.className = 'fullscreen-title';
    title.textContent = 'JSON Viewer - Full Screen';

    const closeButton = document.createElement('button');
    closeButton.className = 'fullscreen-close';
    closeButton.innerHTML = '×';
    closeButton.title = 'Close (ESC)';
    closeButton.addEventListener('click', () => this.hide());

    header.appendChild(title);
    header.appendChild(closeButton);

    return header;
  }

  private createBody(): HTMLElement {
    const body = document.createElement('div');
    body.className = 'fullscreen-body';

    // Toolbar container
    const toolbarContainer = document.createElement('div');
    toolbarContainer.className = 'fullscreen-toolbar';
    body.appendChild(toolbarContainer);

    // Content container with tabs
    const contentContainer = document.createElement('div');
    contentContainer.className = 'fullscreen-content';

    // Pretty view container
    const prettyContainer = document.createElement('div');
    prettyContainer.className = 'content-view pretty-view';
    prettyContainer.id = 'fullscreen-pretty-view';
    contentContainer.appendChild(prettyContainer);

    // Raw view container
    const rawContainer = document.createElement('div');
    rawContainer.className = 'content-view raw-view';
    rawContainer.id = 'fullscreen-raw-view';
    contentContainer.appendChild(rawContainer);

    // Headers view container (placeholder)
    const headersContainer = document.createElement('div');
    headersContainer.className = 'content-view headers-view';
    headersContainer.innerHTML = '<div class="placeholder">Headers view not implemented in fullscreen mode</div>';
    contentContainer.appendChild(headersContainer);

    body.appendChild(contentContainer);

    // Search bar container (absolute positioned)
    const searchContainer = document.createElement('div');
    searchContainer.className = 'fullscreen-search-container';
    body.appendChild(searchContainer);

    // Initialize components
    this.initializeComponents(toolbarContainer, rawContainer, prettyContainer, searchContainer);

    return body;
  }

  private initializeComponents(
    toolbarContainer: HTMLElement,
    rawContainer: HTMLElement,
    prettyContainer: HTMLElement,
    searchContainer: HTMLElement
  ): void {
    // Initialize toolbar
    this.toolbar = new Toolbar({
      container: toolbarContainer,
      stateManager: this.stateManager,
      onTabChange: (tab) => this.handleTabChange(tab),
      onFormat: () => this.handleFormat(),
      onMinify: () => this.handleMinify(),
      onExpandAll: () => this.handleExpandAll(),
      onCollapseAll: () => this.handleCollapseAll(),
      onToggleWrap: () => this.handleToggleWrap(),
      onToggleTypes: () => this.handleToggleTypes(),
      onSearch: () => this.handleSearch(),
      onFullscreen: () => this.hide(), // Close fullscreen when clicked again
      onCopy: () => this.handleCopy(),
      onExport: () => this.handleExport(),
      onFontSizeChange: (size) => this.handleFontSizeChange(size),
    });

    // Initialize raw editor
    this.rawEditor = new RawEditor({
      container: rawContainer,
      stateManager: this.stateManager,
      onChange: (content) => this.handleContentChange(content),
      onCursorChange: (line, column) => this.handleCursorChange(line, column),
    });

    // Initialize JSON tree
    this.jsonTree = new JsonTree({
      container: prettyContainer,
      stateManager: this.stateManager,
      onNodeToggle: (nodeId, expanded) => this.handleNodeToggle(nodeId, expanded),
      onNodeSelect: (nodeId) => this.handleNodeSelect(nodeId),
      onNodeAction: (nodeId, action, data) => this.handleNodeAction(nodeId, action, data),
      onSearchMatches: (matches) => this.handleSearchMatches(matches),
    });

    // Initialize search bar
    this.searchBar = new SearchBar({
      container: searchContainer,
      stateManager: this.stateManager,
      onSearch: (query) => this.handleSearchQuery(query),
      onNavigate: (direction) => this.handleSearchNavigate(direction),
      onClose: () => this.handleSearchClose(),
      supportJsonPath: true,
    });

    // Set initial content and tab
    this.updateContent();
    this.updateActiveTab();
  }

  private attachModalEventListeners(modal: HTMLElement, backdrop: HTMLElement): void {
    // Close on backdrop click
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        this.hide();
      }
    });

    // Close on Escape key
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.isVisible) {
        this.hide();
      }
    };

    document.addEventListener('keydown', handleEscape);

    // Store reference to remove later
    (modal as any).__escapeHandler = handleEscape;
  }

  private updateContent(): void {
    if (!this.rawEditor || !this.jsonTree) return;

    // Set raw content
    this.rawEditor.setValue(this.currentContent);

    // Parse and set tree data
    this.parseContentForTree();
  }

  private async parseContentForTree(): Promise<void> {
    if (!this.currentContent.trim()) {
      this.parsedData = null;
      this.jsonTree?.setData([]);
      return;
    }

    try {
      const parseResult = await JsonUtils.parseJson(this.currentContent);
      if (parseResult.success && parseResult.data !== undefined) {
        this.parsedData = parseResult.data;
        const nodes = JsonUtils.buildJsonTree(parseResult.data);
        this.jsonTree?.setData(nodes);
      } else {
        this.parsedData = null;
        this.jsonTree?.setData([]);
      }
    } catch (error) {
      console.error('Failed to parse JSON for tree view:', error);
      this.parsedData = null;
      this.jsonTree?.setData([]);
    }
  }

  private updateActiveTab(): void {
    if (!this.modal) return;

    const activeTab = this.stateManager.getState().activeTab;
    this.toolbar?.setActiveTab(activeTab);

    // Show/hide content views
    const views = this.modal.querySelectorAll('.content-view');
    views.forEach(view => {
      const viewElement = view as HTMLElement;
      const isPretty = viewElement.classList.contains('pretty-view');
      const isRaw = viewElement.classList.contains('raw-view');
      const isHeaders = viewElement.classList.contains('headers-view');

      const shouldShow = (
        (activeTab === 'pretty' && isPretty) ||
        (activeTab === 'raw' && isRaw) ||
        (activeTab === 'headers' && isHeaders)
      );

      viewElement.style.display = shouldShow ? 'flex' : 'none';
    });
  }

  private applyStyles(): void {
    const style = document.createElement('style');
    style.textContent = `
      .json-viewer-fullscreen {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }

      .fullscreen-backdrop {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
      }

      .fullscreen-dialog {
        position: relative;
        width: 85%;
        height: 85%;
        max-width: 1200px;
        background: var(--bg-primary, #fff);
        border-radius: 12px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        animation: modalSlideIn 0.3s ease-out;
      }

      @keyframes modalSlideIn {
        from {
          opacity: 0;
          transform: scale(0.9) translateY(-20px);
        }
        to {
          opacity: 1;
          transform: scale(1) translateY(0);
        }
      }

      .fullscreen-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px;
        background: var(--bg-secondary, #f8f9fa);
        border-bottom: 1px solid var(--border-color, #e0e0e0);
        flex-shrink: 0;
      }

      .fullscreen-title {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
        color: var(--text-primary, #333);
      }

      .fullscreen-close {
        width: 32px;
        height: 32px;
        background: none;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 20px;
        font-weight: bold;
        color: var(--text-secondary, #666);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
      }

      .fullscreen-close:hover {
        background: var(--bg-tertiary, #e9ecef);
        color: var(--text-primary, #333);
      }

      .fullscreen-body {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        position: relative;
      }

      .fullscreen-toolbar {
        flex-shrink: 0;
      }

      .fullscreen-content {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      .content-view {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      .content-view.pretty-view,
      .content-view.raw-view {
        padding: 0;
      }

      .content-view .placeholder {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--text-secondary, #666);
        font-size: 14px;
      }

      .fullscreen-search-container {
        position: absolute;
        top: 0;
        right: 0;
        z-index: 10;
      }

      /* Responsive adjustments */
      @media (max-width: 768px) {
        .fullscreen-dialog {
          width: 95%;
          height: 95%;
        }

        .fullscreen-header {
          padding: 12px 16px;
        }

        .fullscreen-title {
          font-size: 16px;
        }
      }

      /* Dark theme support */
      @media (prefers-color-scheme: dark) {
        .fullscreen-dialog {
          background: var(--bg-primary, #1e1e1e);
        }

        .fullscreen-header {
          background: var(--bg-secondary, #252526);
          border-bottom-color: var(--border-color, #333);
        }

        .fullscreen-title {
          color: var(--text-primary, #fff);
        }

        .fullscreen-close {
          color: var(--text-secondary, #ccc);
        }

        .fullscreen-close:hover {
          background: var(--bg-tertiary, #333);
          color: var(--text-primary, #fff);
        }
      }
    `;

    if (!document.querySelector('#fullscreen-viewer-styles')) {
      style.id = 'fullscreen-viewer-styles';
      document.head.appendChild(style);
    }
  }

  // Event handlers
  private handleTabChange(tab: ViewerTab): void {
    this.stateManager.setActiveTab(tab);
    this.updateActiveTab();
  }

  private async handleFormat(): Promise<void> {
    if (this.rawEditor) {
      await this.rawEditor.format();
    }
  }

  private async handleMinify(): Promise<void> {
    if (this.rawEditor) {
      await this.rawEditor.minify();
    }
  }

  private handleExpandAll(): void {
    this.jsonTree?.expandAll();
  }

  private handleCollapseAll(): void {
    this.jsonTree?.collapseAll();
  }

  private handleToggleWrap(): void {
    this.rawEditor?.toggleWrap();
  }

  private handleToggleTypes(): void {
    this.stateManager.toggleTypesBadges();
    this.jsonTree?.refresh();
  }

  private handleSearch(): void {
    this.searchBar?.show();
  }

  private handleCopy(): void {
    const content = this.rawEditor?.getValue() || this.currentContent;
    JsonUtils.copyToClipboard(content).then(success => {
      if (success) {
        this.showToast('Copied to clipboard');
      } else {
        this.showToast('Failed to copy');
      }
    });
  }

  private handleExport(): void {
    if (!this.currentContent) return;

    const blob = new Blob([this.currentContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `json-export-${Date.now()}.json`;
    link.style.display = 'none';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  }

  private handleFontSizeChange(size: number): void {
    this.rawEditor?.setFontSize(size);
    this.jsonTree?.setFontSize(size);
  }

  private handleContentChange(content: string): void {
    this.currentContent = content;
    this.parseContentForTree();
  }

  private handleCursorChange(line: number, column: number): void {
    // Could be used for status display
  }

  private handleNodeToggle(nodeId: string, expanded: boolean): void {
    // Node expansion is handled by the tree component
  }

  private handleNodeSelect(nodeId: string): void {
    // Node selection is handled by the tree component
  }

  private handleNodeAction(nodeId: string, action: string, data?: any): void {
    // Handle node actions like copy value, copy path, etc.
    switch (action) {
      case 'copy-value':
        // Implementation would depend on finding the node and copying its value
        break;
      case 'copy-path':
        // Implementation would depend on finding the node and copying its path
        break;
      case 'copy-jsonpath':
        // Implementation would depend on finding the node and copying its JSONPath
        break;
    }
  }

  private handleSearchMatches(matches: any[]): void {
    this.searchBar?.updateResults(
      this.stateManager.getState().search.currentIndex + 1,
      matches.length
    );
  }

  private handleSearchQuery(query: string): void {
    const activeTab = this.stateManager.getState().activeTab;

    if (activeTab === 'pretty') {
      this.jsonTree?.search(query);
    } else if (activeTab === 'raw') {
      this.rawEditor?.find(query);
    }
  }

  private handleSearchNavigate(direction: 1 | -1): void {
    const activeTab = this.stateManager.getState().activeTab;

    if (activeTab === 'pretty') {
      this.jsonTree?.navigateSearch(direction);
    } else if (activeTab === 'raw') {
      this.rawEditor?.find('', direction);
    }
  }

  private handleSearchClose(): void {
    const activeTab = this.stateManager.getState().activeTab;

    if (activeTab === 'pretty') {
      this.jsonTree?.clearSearch();
    }
  }

  private showToast(message: string): void {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: var(--primary-color, #007bff);
      color: white;
      padding: 12px 16px;
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      z-index: 10000;
      font-size: 13px;
      animation: fadeInOut 2s ease-in-out forwards;
    `;
    toast.textContent = message;

    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeInOut {
        0% { opacity: 0; transform: translateY(-10px); }
        20%, 80% { opacity: 1; transform: translateY(0); }
        100% { opacity: 0; transform: translateY(-10px); }
      }
    `;
    document.head.appendChild(style);

    document.body.appendChild(toast);

    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
      if (style.parentNode) {
        style.parentNode.removeChild(style);
      }
    }, 2000);
  }

  // Public API

  public show(): void {
    if (this.isVisible) return;

    this.modal = this.createModal();
    this.applyStyles();
    document.body.appendChild(this.modal);
    this.isVisible = true;

    // Focus the first interactive element
    setTimeout(() => {
      const firstButton = this.modal?.querySelector('button') as HTMLElement;
      firstButton?.focus();
    }, 100);
  }

  public hide(): void {
    if (!this.isVisible || !this.modal) return;

    // Remove escape key listener
    const escapeHandler = (this.modal as any).__escapeHandler;
    if (escapeHandler) {
      document.removeEventListener('keydown', escapeHandler);
    }

    document.body.removeChild(this.modal);
    this.modal = null;
    this.isVisible = false;

    this.options.onClose?.();
  }

  public setContent(content: string): void {
    this.currentContent = content;
    this.updateContent();
  }

  public setActiveTab(tab: ViewerTab): void {
    this.stateManager.setActiveTab(tab);
    this.updateActiveTab();
  }

  public destroy(): void {
    if (this.isVisible) {
      this.hide();
    }

    this.rawEditor?.destroy();
    this.jsonTree?.destroy();
    this.toolbar?.destroy();
    this.searchBar?.destroy();
  }
}