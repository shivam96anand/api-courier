/**
 * Fullscreen viewer modal with 85% width and backdrop blur
 */

import { ViewerTab } from './types';
import { ViewerStateManager } from './viewerState';
import { RawEditor, RawEditorHandle } from './RawEditor';
import { JsonTree, JsonTreeHandle } from './JsonTree';
import { Toolbar, ToolbarHandle } from './Toolbar';
import { SearchBar, SearchBarHandle } from './SearchBar';
import { FullscreenModalUI } from './FullscreenModalUI';
import { FullscreenEventHandlers } from './FullscreenEventHandlers';
import { FullscreenContentManager } from './FullscreenContentManager';

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
  private isVisible = false;

  // Modular components
  private modalUI: FullscreenModalUI;
  private eventHandlers!: FullscreenEventHandlers;
  private contentManager!: FullscreenContentManager;

  constructor(options: FullscreenViewerOptions) {
    this.options = options;
    this.stateManager = new ViewerStateManager(`${options.requestId}-fullscreen`);
    this.modalUI = new FullscreenModalUI();

    if (options.initialTab) {
      this.stateManager.setActiveTab(options.initialTab);
    }
  }

  private createModal(): HTMLElement {
    const components = this.modalUI.createModal();

    // Initialize content manager
    this.contentManager = new FullscreenContentManager({
      stateManager: this.stateManager,
      rawEditor: this.rawEditor,
      jsonTree: this.jsonTree,
      toolbar: this.toolbar,
      modal: components.modal
    });

    // Initialize event handlers
    this.eventHandlers = new FullscreenEventHandlers({
      stateManager: this.stateManager,
      rawEditor: this.rawEditor,
      jsonTree: this.jsonTree,
      searchBar: this.searchBar,
      modalUI: this.modalUI,
      modal: components.modal,
      getCurrentContent: () => this.contentManager.getCurrentContent(),
      onContentChange: (content) => {
        this.contentManager.setCurrentContent(content);
        this.contentManager.parseContentForTree();
      },
      onHide: () => this.hide()
    });

    this.initializeComponents(
      components.toolbarContainer,
      components.rawContainer,
      components.prettyContainer,
      components.searchContainer
    );

    this.attachModalEventListeners(components.modal, components.backdrop);

    // Set initial content if provided
    if (this.options.initialContent) {
      this.contentManager.setCurrentContent(this.options.initialContent);
    }

    return components.modal;
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
      onTabChange: (tab) => this.eventHandlers.handleTabChange(tab, () => this.contentManager.updateActiveTab()),
      onFormat: () => this.eventHandlers.handleFormat(),
      onMinify: () => this.eventHandlers.handleMinify(),
      onExpandAll: () => this.eventHandlers.handleExpandAll(),
      onCollapseAll: () => this.eventHandlers.handleCollapseAll(),
      onToggleWrap: () => this.eventHandlers.handleToggleWrap(),
      onToggleTypes: () => this.eventHandlers.handleToggleTypes(),
      onSearch: () => this.eventHandlers.handleSearch(),
      onFullscreen: () => this.hide(), // Close fullscreen when clicked again
      onCopy: () => this.eventHandlers.handleCopy(),
      onExport: () => this.eventHandlers.handleExport(),
      onFontSizeChange: (size) => this.eventHandlers.handleFontSizeChange(size),
      onScrollTop: () => this.eventHandlers.handleScrollTop(),
      onScrollBottom: () => this.eventHandlers.handleScrollBottom(),
      onAskAI: () => this.eventHandlers.handleAskAI(),
    });

    // Initialize raw editor
    this.rawEditor = new RawEditor({
      container: rawContainer,
      stateManager: this.stateManager,
      onChange: (content) => this.eventHandlers.handleContentChange(content),
      onCursorChange: (line, column) => this.eventHandlers.handleCursorChange(line, column),
    });

    // Initialize JSON tree
    this.jsonTree = new JsonTree({
      container: prettyContainer,
      stateManager: this.stateManager,
      onNodeToggle: (nodeId, expanded) => this.eventHandlers.handleNodeToggle(nodeId, expanded),
      onNodeSelect: (nodeId) => this.eventHandlers.handleNodeSelect(nodeId),
      onNodeAction: (nodeId, action, data) => this.eventHandlers.handleNodeAction(nodeId, action, data),
      onSearchMatches: (matches) => this.eventHandlers.handleSearchMatches(matches),
    });

    // Initialize search bar
    this.searchBar = new SearchBar({
      container: searchContainer,
      stateManager: this.stateManager,
      onSearch: (query) => this.eventHandlers.handleSearchQuery(query),
      onNavigate: (direction) => this.eventHandlers.handleSearchNavigate(direction),
      onClose: () => this.eventHandlers.handleSearchClose(),
      supportJsonPath: true,
    });

    // Update dependencies in managers
    this.contentManager = new FullscreenContentManager({
      stateManager: this.stateManager,
      rawEditor: this.rawEditor,
      jsonTree: this.jsonTree,
      toolbar: this.toolbar,
      modal: this.modal
    });

    this.eventHandlers = new FullscreenEventHandlers({
      stateManager: this.stateManager,
      rawEditor: this.rawEditor,
      jsonTree: this.jsonTree,
      searchBar: this.searchBar,
      modalUI: this.modalUI,
      modal: this.modal,
      getCurrentContent: () => this.contentManager.getCurrentContent(),
      onContentChange: (content) => {
        this.contentManager.setCurrentContent(content);
        this.contentManager.parseContentForTree();
      },
      onHide: () => this.hide()
    });

    // Set initial content and tab
    this.contentManager.updateContent();
    this.contentManager.updateActiveTab();
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

  // Public API

  public show(): void {
    if (this.isVisible) return;

    this.modal = this.createModal();
    this.modalUI.applyStyles();
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
    this.contentManager.setCurrentContent(content);
    this.contentManager.updateContent();
  }

  public setActiveTab(tab: ViewerTab): void {
    this.stateManager.setActiveTab(tab);
    this.contentManager.updateActiveTab();
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