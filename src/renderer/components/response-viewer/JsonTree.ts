/**
 * Virtualized JSON tree for Pretty view with high performance
 */

import { JsonNode, SearchMatch, VIEWER_CONSTANTS, VIEWER_CLASSES } from './types';
import { ViewerStateManager } from './viewerState';
import { JsonUtils } from './utils/json';
import { JsonNodeRenderer } from './JsonNode';

export interface JsonTreeOptions {
  container: HTMLElement;
  stateManager: ViewerStateManager;
  onNodeToggle?: (nodeId: string, expanded: boolean) => void;
  onNodeSelect?: (nodeId: string) => void;
  onNodeAction?: (nodeId: string, action: string, data?: any) => void;
  onSearchMatches?: (matches: SearchMatch[]) => void;
}

export interface JsonTreeHandle {
  setData: (nodes: JsonNode[]) => void;
  getData: () => JsonNode[];
  expandAll: () => void;
  collapseAll: () => void;
  search: (query: string) => SearchMatch[];
  clearSearch: () => void;
  navigateSearch: (direction: 1 | -1) => void;
  goToNode: (nodeId: string) => void;
  refresh: () => void;
  setFontSize: (size: number) => void;
  destroy: () => void;
}

/**
 * Simple virtualization manager for large lists
 */
class VirtualScroller {
  private container: HTMLElement;
  private viewport: HTMLElement;
  private items: JsonNode[] = [];
  private visibleItems: JsonNode[] = [];
  private itemHeight: number = VIEWER_CONSTANTS.LINE_HEIGHT;
  private containerHeight = 0;
  private scrollTop = 0;
  private startIndex = 0;
  private endIndex = 0;
  private renderCallback?: (items: JsonNode[], startIndex: number) => void;
  private buffer = 5; // Render extra items for smooth scrolling

  constructor(container: HTMLElement) {
    this.container = container;
    this.viewport = this.createViewport();
    this.setupEventListeners();
  }

  private createViewport(): HTMLElement {
    const viewport = document.createElement('div');
    viewport.className = 'json-tree-viewport';
    viewport.style.cssText = `
      position: relative;
      height: 100%;
      overflow-y: auto;
      overflow-x: hidden;
    `;

    const content = document.createElement('div');
    content.className = 'json-tree-content';
    content.style.cssText = `
      position: relative;
      width: 100%;
    `;

    viewport.appendChild(content);
    this.container.appendChild(viewport);

    return viewport;
  }

  private setupEventListeners(): void {
    this.viewport.addEventListener('scroll', () => {
      this.scrollTop = this.viewport.scrollTop;
      this.updateVisibleRange();
      this.render();
    });

    const resizeObserver = new ResizeObserver(() => {
      this.containerHeight = this.viewport.clientHeight;
      this.updateVisibleRange();
      this.render();
    });

    resizeObserver.observe(this.viewport);
  }

  private updateVisibleRange(): void {
    if (!this.items.length) {
      this.startIndex = 0;
      this.endIndex = 0;
      return;
    }

    const visibleCount = Math.ceil(this.containerHeight / this.itemHeight);
    this.startIndex = Math.max(0, Math.floor(this.scrollTop / this.itemHeight) - this.buffer);
    this.endIndex = Math.min(this.items.length, this.startIndex + visibleCount + this.buffer * 2);

    this.visibleItems = this.items.slice(this.startIndex, this.endIndex);
  }

  private render(): void {
    if (!this.renderCallback) return;

    const content = this.viewport.querySelector('.json-tree-content') as HTMLElement;
    if (!content) return;

    // Set total height for scrollbar
    const totalHeight = this.items.length * this.itemHeight;
    content.style.height = `${totalHeight}px`;

    // Clear current content
    content.innerHTML = '';

    // Render visible items with offset
    const offset = this.startIndex * this.itemHeight;
    const container = document.createElement('div');
    container.style.cssText = `
      position: absolute;
      top: ${offset}px;
      width: 100%;
    `;

    this.renderCallback(this.visibleItems, this.startIndex);
    content.appendChild(container);
  }

  public setItems(items: JsonNode[]): void {
    this.items = items;
    this.updateVisibleRange();
    this.render();
  }

  public setItemHeight(height: number): void {
    this.itemHeight = height;
    this.updateVisibleRange();
    this.render();
  }

  public setRenderCallback(callback: (items: JsonNode[], startIndex: number) => void): void {
    this.renderCallback = callback;
  }

  public scrollToItem(index: number): void {
    if (index < 0 || index >= this.items.length) return;

    const targetScrollTop = index * this.itemHeight;
    this.viewport.scrollTo({
      top: targetScrollTop,
      behavior: 'smooth'
    });
  }

  public getViewport(): HTMLElement {
    return this.viewport;
  }

  public destroy(): void {
    this.container.removeChild(this.viewport);
  }
}

export class JsonTree implements JsonTreeHandle {
  private container: HTMLElement;
  private stateManager: ViewerStateManager;
  private options: JsonTreeOptions;
  private nodes: JsonNode[] = [];
  private visibleNodes: JsonNode[] = [];
  private virtualScroller: VirtualScroller;
  private nodeRenderer: JsonNodeRenderer;
  private searchMatches: SearchMatch[] = [];
  private currentSearchIndex = -1;
  private isLargeDataset = false;

  constructor(options: JsonTreeOptions) {
    this.options = options;
    this.container = options.container;
    this.stateManager = options.stateManager;

    this.setupContainer();
    this.virtualScroller = new VirtualScroller(this.container);
    this.nodeRenderer = new JsonNodeRenderer({
      stateManager: this.stateManager,
      onToggle: this.handleNodeToggle.bind(this),
      onSelect: this.handleNodeSelect.bind(this),
      onAction: this.handleNodeAction.bind(this),
    });

    this.setupVirtualScroller();
    this.restoreScrollPosition();
  }

  private setupContainer(): void {
    this.container.className = `${VIEWER_CLASSES.prettyTree} json-tree-container`;
    this.container.style.cssText = `
      height: 100%;
      font-family: 'JetBrains Mono', 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
      font-size: ${this.stateManager.getFontSize()}px;
      line-height: 1.4;
      background: var(--bg-primary, #fff);
      color: var(--text-primary, #333);
      overflow: hidden;
    `;
  }

  private setupVirtualScroller(): void {
    this.virtualScroller.setRenderCallback((items, startIndex) => {
      this.renderVisibleNodes(items, startIndex);
    });

    // Update item height based on font size
    const fontSize = this.stateManager.getFontSize();
    const lineHeight = Math.ceil(fontSize * 1.4);
    this.virtualScroller.setItemHeight(lineHeight);
  }

  private renderVisibleNodes(items: JsonNode[], startIndex: number): void {
    const viewport = this.virtualScroller.getViewport();
    const content = viewport.querySelector('.json-tree-content') as HTMLElement;
    if (!content) return;

    const container = document.createElement('div');
    container.className = 'visible-nodes-container';

    items.forEach((node, index) => {
      const element = this.nodeRenderer.render(node, {
        searchMatches: this.getNodeSearchMatches(node.id),
        isSelected: this.stateManager.getState().prettyView.selectedNode === node.id,
        showTypes: this.stateManager.getState().prettyView.showTypes,
      });

      element.style.position = 'relative';
      element.style.height = `${this.virtualScroller['itemHeight']}px`;
      element.dataset.nodeIndex = (startIndex + index).toString();

      container.appendChild(element);
    });

    // Replace content
    const existingContainer = content.querySelector('.visible-nodes-container');
    if (existingContainer) {
      content.replaceChild(container, existingContainer);
    } else {
      content.appendChild(container);
    }
  }

  private getNodeSearchMatches(nodeId: string): SearchMatch[] {
    return this.searchMatches.filter(match => match.nodeId === nodeId);
  }

  private handleNodeToggle(nodeId: string): void {
    const expanded = this.stateManager.toggleNodeExpansion(nodeId);
    this.options.onNodeToggle?.(nodeId, expanded);
    this.updateVisibleNodes();
    this.render();
  }

  private handleNodeSelect(nodeId: string): void {
    this.stateManager.updatePrettyView({ selectedNode: nodeId });
    this.options.onNodeSelect?.(nodeId);
    this.render();
  }

  private handleNodeAction(nodeId: string, action: string, data?: any): void {
    this.options.onNodeAction?.(nodeId, action, data);
  }

  private updateVisibleNodes(): void {
    const expandedNodes = this.stateManager.getExpandedNodes();
    this.visibleNodes = JsonUtils.getVisibleNodes(this.nodes, expandedNodes);
    this.isLargeDataset = this.visibleNodes.length > VIEWER_CONSTANTS.VIRTUALIZATION_THRESHOLD;
  }

  private render(): void {
    if (this.isLargeDataset) {
      // Use virtualization for large datasets
      this.virtualScroller.setItems(this.visibleNodes);
    } else {
      // Render all items for small datasets
      this.renderAllNodes();
    }
  }

  private renderAllNodes(): void {
    const viewport = this.virtualScroller.getViewport();
    const content = viewport.querySelector('.json-tree-content') as HTMLElement;
    if (!content) return;

    content.innerHTML = '';
    content.style.height = 'auto';

    const container = document.createElement('div');
    container.className = 'all-nodes-container';

    this.visibleNodes.forEach((node, index) => {
      const element = this.nodeRenderer.render(node, {
        searchMatches: this.getNodeSearchMatches(node.id),
        isSelected: this.stateManager.getState().prettyView.selectedNode === node.id,
        showTypes: this.stateManager.getState().prettyView.showTypes,
      });

      element.dataset.nodeIndex = index.toString();
      container.appendChild(element);
    });

    content.appendChild(container);
  }

  private restoreScrollPosition(): void {
    const state = this.stateManager.getState();
    if (state.prettyView.scrollPosition > 0) {
      setTimeout(() => {
        const viewport = this.virtualScroller.getViewport();
        viewport.scrollTop = state.prettyView.scrollPosition;
      }, 100);
    }
  }

  private saveScrollPosition(): void {
    const viewport = this.virtualScroller.getViewport();
    this.stateManager.updatePrettyView({
      scrollPosition: viewport.scrollTop
    });
  }

  private findNodeIndex(nodeId: string): number {
    return this.visibleNodes.findIndex(node => node.id === nodeId);
  }

  // Public API

  public setData(nodes: JsonNode[]): void {
    this.nodes = nodes;
    this.updateVisibleNodes();
    this.render();
  }

  public getData(): JsonNode[] {
    return this.nodes;
  }

  public expandAll(): void {
    const allNodeIds = this.getAllNodeIds(this.nodes);
    const success = this.stateManager.expandAll(allNodeIds);

    if (success) {
      this.updateVisibleNodes();
      this.render();
    }
  }

  private getAllNodeIds(nodes: JsonNode[]): string[] {
    const ids: string[] = [];

    const traverse = (node: JsonNode) => {
      if (node.hasChildren) {
        ids.push(node.id);
      }
      if (node.children) {
        node.children.forEach(child => traverse(child));
      }
    };

    nodes.forEach(node => traverse(node));
    return ids;
  }

  public collapseAll(): void {
    this.stateManager.collapseAll();
    this.updateVisibleNodes();
    this.render();
  }

  public search(query: string): SearchMatch[] {
    if (!query.trim()) {
      this.clearSearch();
      return [];
    }

    const expandedNodes = this.stateManager.getExpandedNodes();
    this.searchMatches = JsonUtils.searchInNodes(this.nodes, query, expandedNodes);
    this.currentSearchIndex = this.searchMatches.length > 0 ? 0 : -1;

    this.stateManager.updateSearch({
      query,
      totalMatches: this.searchMatches.length,
      currentIndex: this.currentSearchIndex
    });

    this.options.onSearchMatches?.(this.searchMatches);
    this.render();

    if (this.currentSearchIndex >= 0) {
      this.scrollToSearchMatch(this.currentSearchIndex);
    }

    return this.searchMatches;
  }

  public clearSearch(): void {
    this.searchMatches = [];
    this.currentSearchIndex = -1;

    this.stateManager.updateSearch({
      query: '',
      totalMatches: 0,
      currentIndex: -1
    });

    this.options.onSearchMatches?.([]);
    this.render();
  }

  public navigateSearch(direction: 1 | -1): void {
    if (this.searchMatches.length === 0) return;

    if (direction === 1) {
      this.currentSearchIndex = (this.currentSearchIndex + 1) % this.searchMatches.length;
    } else {
      this.currentSearchIndex = this.currentSearchIndex <= 0
        ? this.searchMatches.length - 1
        : this.currentSearchIndex - 1;
    }

    this.stateManager.updateSearch({
      currentIndex: this.currentSearchIndex
    });

    this.scrollToSearchMatch(this.currentSearchIndex);
    this.render();
  }

  private scrollToSearchMatch(index: number): void {
    if (index < 0 || index >= this.searchMatches.length) return;

    const match = this.searchMatches[index];
    const nodeIndex = this.findNodeIndex(match.nodeId);

    if (nodeIndex >= 0) {
      if (this.isLargeDataset) {
        this.virtualScroller.scrollToItem(nodeIndex);
      } else {
        this.scrollToNode(match.nodeId);
      }
    }
  }

  public goToNode(nodeId: string): void {
    const nodeIndex = this.findNodeIndex(nodeId);
    if (nodeIndex >= 0) {
      if (this.isLargeDataset) {
        this.virtualScroller.scrollToItem(nodeIndex);
      } else {
        this.scrollToNode(nodeId);
      }
    }
  }

  private scrollToNode(nodeId: string): void {
    const viewport = this.virtualScroller.getViewport();
    const nodeElement = viewport.querySelector(`[data-node-id="${nodeId}"]`) as HTMLElement;

    if (nodeElement) {
      nodeElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }
  }

  public refresh(): void {
    this.updateVisibleNodes();
    this.render();
  }

  public setFontSize(size: number): void {
    this.container.style.fontSize = `${size}px`;

    // Update virtualization item height
    const lineHeight = Math.ceil(size * 1.4);
    this.virtualScroller.setItemHeight(lineHeight);

    this.render();
  }

  public destroy(): void {
    this.virtualScroller.destroy();
    this.nodeRenderer.destroy();
  }
}