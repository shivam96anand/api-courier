/**
 * Main JsonViewer component with public API
 * This replaces the existing JsonViewer.ts with a modern, performant implementation
 */

import {
  JsonViewerHandle,
  JsonViewerOptions,
  ViewerTab,
  JsonNode,
  VIEWER_CONSTANTS,
  VIEWER_CLASSES
} from './types';
import { ViewerStateManager } from './viewerState';
import { RawEditor, RawEditorHandle } from './RawEditor';
import { JsonTree, JsonTreeHandle } from './JsonTree';
import { Toolbar, ToolbarHandle } from './Toolbar';
import { SearchBar, SearchBarHandle } from './SearchBar';
import { FullscreenViewer, FullscreenViewerHandle } from './FullscreenViewer';
import { JsonUtils } from './utils/json';

export class JsonViewer implements JsonViewerHandle {
  private container: HTMLElement;
  private stateManager: ViewerStateManager;
  private options: JsonViewerOptions;
  private rawEditor: RawEditorHandle | null = null;
  private jsonTree: JsonTreeHandle | null = null;
  private toolbar: ToolbarHandle | null = null;
  private searchBar: SearchBarHandle | null = null;
  private fullscreenViewer: FullscreenViewerHandle | null = null;
  private currentContent = '';
  private parsedData: any = null;
  private isInitialized = false;

  constructor(containerId: string, options: Partial<JsonViewerOptions> = {}) {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`Container with id "${containerId}" not found`);
    }

    this.container = container;
    this.options = {
      requestId: 'default',
      theme: 'light',
      fontSize: VIEWER_CONSTANTS.DEFAULT_FONT_SIZE,
      showLineNumbers: false,
      enableVirtualization: true,
      maxFileSize: VIEWER_CONSTANTS.MAX_FILE_SIZE,
      ...options
    };

    this.stateManager = new ViewerStateManager(this.options.requestId);
    this.initialize();
  }

  private initialize(): void {
    if (this.isInitialized) return;

    this.setupContainer();
    this.createLayout();
    this.initializeComponents();
    this.setupEventListeners();
    this.applyInitialContent();
    this.applyStyles();

    this.isInitialized = true;
  }

  private setupContainer(): void {
    this.container.className = `${VIEWER_CLASSES.container} json-viewer-main`;
    this.container.innerHTML = '';
  }

  private createLayout(): void {
    // Main toolbar
    const toolbarContainer = document.createElement('div');
    toolbarContainer.className = 'json-viewer-toolbar-container';
    this.container.appendChild(toolbarContainer);

    // Content area with tab panels
    const contentContainer = document.createElement('div');
    contentContainer.className = 'json-viewer-content-container';

    // Pretty view
    const prettyContainer = document.createElement('div');
    prettyContainer.className = 'json-viewer-panel pretty-panel';
    prettyContainer.id = `${this.options.requestId}-pretty-view`;
    contentContainer.appendChild(prettyContainer);

    // Raw view
    const rawContainer = document.createElement('div');
    rawContainer.className = 'json-viewer-panel raw-panel';
    rawContainer.id = `${this.options.requestId}-raw-view`;
    contentContainer.appendChild(rawContainer);

    // Headers view (simple table for now)
    const headersContainer = document.createElement('div');
    headersContainer.className = 'json-viewer-panel headers-panel';
    headersContainer.innerHTML = '<div class="panel-placeholder">Response headers will be shown here</div>';
    contentContainer.appendChild(headersContainer);

    this.container.appendChild(contentContainer);

    // Search bar (absolute positioned)
    const searchContainer = document.createElement('div');
    searchContainer.className = 'json-viewer-search-container';
    this.container.appendChild(searchContainer);
  }

  private initializeComponents(): void {
    const toolbarContainer = this.container.querySelector('.json-viewer-toolbar-container') as HTMLElement;
    const rawContainer = this.container.querySelector('.raw-panel') as HTMLElement;
    const prettyContainer = this.container.querySelector('.pretty-panel') as HTMLElement;
    const searchContainer = this.container.querySelector('.json-viewer-search-container') as HTMLElement;

    // Initialize toolbar
    this.toolbar = new Toolbar({
      container: toolbarContainer,
      stateManager: this.stateManager,
      onTabChange: (tab) => this.handleTabChange(tab),
      onFormat: () => this.format(),
      onMinify: () => this.minifyContent(),
      onExpandAll: () => this.expandAll(),
      onCollapseAll: () => this.collapseAll(),
      onToggleWrap: () => this.toggleWrap(),
      onToggleTypes: () => this.toggleTypes(),
      onSearch: () => this.showSearch(),
      onFullscreen: () => this.openFullscreen(),
      onCopy: () => this.copyContent(),
      onExport: () => this.exportData(),
      onFontSizeChange: (size) => this.setFontSize(size),
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
      onSearch: (query) => this.handleSearch(query),
      onNavigate: (direction) => this.handleSearchNavigate(direction),
      onClose: () => this.handleSearchClose(),
      supportJsonPath: true,
    });

    // Set initial tab
    const initialTab = this.options.initialTab || this.stateManager.getState().activeTab;
    this.setActiveTab(initialTab);
  }

  private setupEventListeners(): void {
    // Handle container resize
    const resizeObserver = new ResizeObserver(() => {
      this.handleResize();
    });
    resizeObserver.observe(this.container);

    // Handle window beforeunload for cleanup
    window.addEventListener('beforeunload', () => {
      this.cleanup();
    });
  }

  private applyInitialContent(): void {
    if (this.options.initialContent) {
      this.setContent(this.options.initialContent);
    }
  }

  private applyStyles(): void {
    const style = document.createElement('style');
    style.textContent = `
      .json-viewer-main {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: var(--bg-primary, #fff);
        border: 1px solid var(--border-color, #e0e0e0);
        border-radius: 6px;
        overflow: hidden;
        position: relative;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }

      .json-viewer-toolbar-container {
        flex-shrink: 0;
      }

      .json-viewer-content-container {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        position: relative;
      }

      .json-viewer-panel {
        flex: 1;
        display: none;
        flex-direction: column;
        overflow: hidden;
      }

      .json-viewer-panel.active {
        display: flex;
      }

      .panel-placeholder {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--text-secondary, #666);
        font-size: 14px;
      }

      .json-viewer-search-container {
        position: absolute;
        top: 8px;
        right: 8px;
        z-index: 100;
      }

      /* Raw editor styles */
      .raw-panel {
        background: var(--bg-primary, #fff);
      }

      /* Pretty tree styles */
      .pretty-panel {
        background: var(--bg-primary, #fff);
        overflow: hidden;
      }

      /* Headers panel styles */
      .headers-panel {
        padding: 16px;
        background: var(--bg-primary, #fff);
      }

      /* Responsive design */
      @media (max-width: 768px) {
        .json-viewer-search-container {
          position: static;
          padding: 8px;
          background: var(--bg-secondary, #f8f9fa);
          border-bottom: 1px solid var(--border-color, #e0e0e0);
        }
      }

      /* Dark theme support */
      @media (prefers-color-scheme: dark) {
        .json-viewer-main {
          background: var(--bg-primary, #1e1e1e);
          border-color: var(--border-color, #333);
        }

        .raw-panel,
        .pretty-panel,
        .headers-panel {
          background: var(--bg-primary, #1e1e1e);
        }

        .panel-placeholder {
          color: var(--text-secondary, #ccc);
        }
      }

      /* Loading state */
      .json-viewer-main.loading {
        pointer-events: none;
      }

      .json-viewer-main.loading::after {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(255, 255, 255, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
      }

      @media (prefers-color-scheme: dark) {
        .json-viewer-main.loading::after {
          background: rgba(30, 30, 30, 0.8);
        }
      }

      /* Error state */
      .json-viewer-error {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-direction: column;
        padding: 20px;
        color: var(--text-secondary, #666);
      }

      .json-viewer-error h3 {
        margin: 0 0 8px 0;
        color: var(--error-color, #dc3545);
      }

      .json-viewer-error p {
        margin: 0;
        text-align: center;
        line-height: 1.5;
      }
    `;

    if (!document.querySelector('#json-viewer-main-styles')) {
      style.id = 'json-viewer-main-styles';
      document.head.appendChild(style);
    }
  }

  // Event handlers
  private handleTabChange(tab: ViewerTab): void {
    this.setActiveTab(tab);
  }

  private async handleContentChange(content: string): Promise<void> {
    this.currentContent = content;
    await this.updatePrettyView();
  }

  private handleCursorChange(line: number, column: number): void {
    // Could be used for status display or breadcrumb updates
  }

  private handleNodeToggle(nodeId: string, expanded: boolean): void {
    // Node expansion is handled by the state manager
  }

  private handleNodeSelect(nodeId: string): void {
    // Node selection is handled by the state manager
  }

  private handleNodeAction(nodeId: string, action: string, data?: any): void {
    switch (action) {
      case 'copy-key':
        this.copyNodeKey(nodeId);
        break;
      case 'copy-value':
        this.copyNodeValue(nodeId);
        break;
      case 'copy-path':
        this.copyNodePath(nodeId);
        break;
      case 'copy-jsonpath':
        this.copyNodeJsonPath(nodeId);
        break;
    }
  }

  private handleSearchMatches(matches: any[]): void {
    const currentIndex = this.stateManager.getState().search.currentIndex;
    this.searchBar?.updateResults(currentIndex + 1, matches.length);
  }

  private handleSearch(query: string): void {
    const activeTab = this.stateManager.getState().activeTab;

    if (activeTab === 'pretty' && this.jsonTree) {
      this.jsonTree.search(query);
    } else if (activeTab === 'raw' && this.rawEditor) {
      this.rawEditor.find(query);
    }
  }

  private handleSearchNavigate(direction: 1 | -1): void {
    const activeTab = this.stateManager.getState().activeTab;

    if (activeTab === 'pretty' && this.jsonTree) {
      this.jsonTree.navigateSearch(direction);
    } else if (activeTab === 'raw' && this.rawEditor) {
      this.rawEditor.find('', direction);
    }
  }

  private handleSearchClose(): void {
    const activeTab = this.stateManager.getState().activeTab;

    if (activeTab === 'pretty' && this.jsonTree) {
      this.jsonTree.clearSearch();
    }
  }

  private handleResize(): void {
    // Handle container resize events
    // Could be used to update virtualization or layout
  }

  // Content management
  private async updatePrettyView(): Promise<void> {
    if (!this.jsonTree) return;

    if (!this.currentContent.trim()) {
      this.parsedData = null;
      this.jsonTree.setData([]);
      this.updateFormatButtonState(false);
      return;
    }

    try {
      this.setLoadingState(true);

      const parseResult = await JsonUtils.parseJson(this.currentContent);
      if (parseResult.success && parseResult.data !== undefined) {
        this.parsedData = parseResult.data;

        // Check file size and warn user
        if (parseResult.isLargeFile) {
          this.showLargeFileWarning();
        }

        const nodes = JsonUtils.buildJsonTree(parseResult.data);
        this.jsonTree.setData(nodes);
        this.updateFormatButtonState(true);
      } else {
        this.parsedData = null;
        this.jsonTree.setData([]);
        this.updateFormatButtonState(false);

        if (parseResult.error) {
          this.showParseError(parseResult.error);
        }
      }
    } catch (error) {
      console.error('Failed to update pretty view:', error);
      this.parsedData = null;
      this.jsonTree.setData([]);
      this.updateFormatButtonState(false);
    } finally {
      this.setLoadingState(false);
    }
  }

  private setActiveTab(tab: ViewerTab): void {
    this.stateManager.setActiveTab(tab);
    this.toolbar?.setActiveTab(tab);

    // Show/hide panels
    const panels = this.container.querySelectorAll('.json-viewer-panel');
    panels.forEach(panel => {
      const panelElement = panel as HTMLElement;
      const isPretty = panelElement.classList.contains('pretty-panel');
      const isRaw = panelElement.classList.contains('raw-panel');
      const isHeaders = panelElement.classList.contains('headers-panel');

      const shouldShow = (
        (tab === 'pretty' && isPretty) ||
        (tab === 'raw' && isRaw) ||
        (tab === 'headers' && isHeaders)
      );

      panelElement.classList.toggle('active', shouldShow);
    });
  }

  private updateFormatButtonState(canFormat: boolean): void {
    this.toolbar?.setFormatEnabled(canFormat);
  }

  private setLoadingState(loading: boolean): void {
    this.container.classList.toggle('loading', loading);
  }

  private showLargeFileWarning(): void {
    console.warn('Large JSON file detected. Performance may be impacted.');
  }

  private showParseError(error: string): void {
    const activePanel = this.container.querySelector('.json-viewer-panel.active');
    if (activePanel) {
      const errorDiv = document.createElement('div');
      errorDiv.className = 'json-viewer-error';
      errorDiv.innerHTML = `
        <h3>Invalid JSON</h3>
        <p>${this.escapeHtml(error)}</p>
      `;
      activePanel.innerHTML = '';
      activePanel.appendChild(errorDiv);
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Node action helpers
  private copyNodeKey(nodeId: string): void {
    // Implementation would need access to the tree data
    console.log('Copy key for node:', nodeId);
  }

  private copyNodeValue(nodeId: string): void {
    // Implementation would need access to the tree data
    console.log('Copy value for node:', nodeId);
  }

  private copyNodePath(nodeId: string): void {
    // Implementation would need access to the tree data
    console.log('Copy path for node:', nodeId);
  }

  private copyNodeJsonPath(nodeId: string): void {
    // Implementation would need access to the tree data
    console.log('Copy JSONPath for node:', nodeId);
  }

  // Utility methods
  private async minifyContent(): Promise<void> {
    if (this.rawEditor) {
      await this.rawEditor.minify();
    }
  }

  private showSearch(): void {
    this.searchBar?.show();
  }

  private copyContent(): void {
    const content = this.rawEditor?.getValue() || this.currentContent;
    JsonUtils.copyToClipboard(content);
  }

  private setFontSize(size: number): void {
    this.rawEditor?.setFontSize(size);
    this.jsonTree?.setFontSize(size);
  }

  private toggleTypes(): void {
    this.stateManager.toggleTypesBadges();
    this.jsonTree?.refresh();
  }

  private cleanup(): void {
    JsonUtils.cleanup();
    this.stateManager.saveState();
  }

  // Public API Implementation

  public setContent(text: string): void {
    this.currentContent = text;
    this.rawEditor?.setValue(text);
    this.updatePrettyView();
  }

  public getContent(): string {
    return this.rawEditor?.getValue() || this.currentContent;
  }

  public async format(): Promise<void> {
    if (this.rawEditor) {
      await this.rawEditor.format();
    }
  }

  public goToLine(line: number): void {
    if (this.rawEditor) {
      this.rawEditor.goToLine(line);
    }
  }

  public find(query: string, direction: 1 | -1 = 1): void {
    const activeTab = this.stateManager.getState().activeTab;

    if (activeTab === 'raw' && this.rawEditor) {
      this.rawEditor.find(query, direction);
    } else if (activeTab === 'pretty' && this.jsonTree) {
      this.jsonTree.search(query);
    }
  }

  public toggleWrap(): void {
    if (this.rawEditor) {
      this.rawEditor.toggleWrap();
    }
  }

  public openFullscreen(tab?: ViewerTab): void {
    if (!this.fullscreenViewer) {
      this.fullscreenViewer = new FullscreenViewer({
        requestId: this.options.requestId,
        initialTab: tab || this.stateManager.getState().activeTab,
        initialContent: this.currentContent,
        onClose: () => {
          if (this.fullscreenViewer) {
            this.fullscreenViewer.destroy();
            this.fullscreenViewer = null;
          }
        }
      });
    }

    this.fullscreenViewer.show();
  }

  public expandAll(): void {
    this.jsonTree?.expandAll();
  }

  public collapseAll(): void {
    this.jsonTree?.collapseAll();
  }

  public exportData(): void {
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

  // Legacy API compatibility (for existing JsonViewer usage)
  public setData(jsonData: any): void {
    try {
      const jsonString = JSON.stringify(jsonData, null, 2);
      this.setContent(jsonString);
    } catch (error) {
      console.error('Failed to serialize data:', error);
    }
  }

  public performSearch(query: string): void {
    this.find(query);
  }

  public navigateSearch(direction: number): void {
    this.find('', direction as 1 | -1);
  }

  public clearSearch(): void {
    this.searchBar?.hide();
    this.handleSearchClose();
  }

  public clear(): void {
    this.setContent('');
  }

  public destroy(): void {
    this.cleanup();

    this.rawEditor?.destroy();
    this.jsonTree?.destroy();
    this.toolbar?.destroy();
    this.searchBar?.destroy();
    this.fullscreenViewer?.destroy();

    this.container.innerHTML = '';
  }
}