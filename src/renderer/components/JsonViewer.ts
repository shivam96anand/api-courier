import { JsonNode, SearchMatch } from './json-viewer/types';
import { JsonParser } from './json-viewer/parser';
import { JsonSearch } from './json-viewer/search';
import { NodeRenderer } from './json-viewer/renderer';
import { LineNumbersManager } from './json-viewer/line-numbers';
import { JsonViewerUtilities } from './json-viewer/utilities';

export type { JsonNode, SearchMatch } from './json-viewer/types';

export class JsonViewer {
  private container: HTMLElement;
  private jsonData: any;
  private nodes: JsonNode[] = [];
  private updateTimer: number | null = null;
  private formattedJsonText = '';
  private totalLines = 0;
  private resizeObserver: ResizeObserver | null = null;
  private searchEngine: JsonSearch;
  private lineNumbersManager: LineNumbersManager;

  constructor(containerId: string) {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`Container with id "${containerId}" not found`);
    }
    this.container = container;
    this.searchEngine = new JsonSearch();
    this.lineNumbersManager = new LineNumbersManager();
    this.setupDOMStructure();
    this.bindEvents();
  }

  private setupDOMStructure(): void {
    this.container.innerHTML = `
      <div class="json-viewer">
        <div class="json-viewer-content">
          <div class="line-numbers"></div>
          <div class="json-content">
            <div class="json-nodes-container"></div>
          </div>
        </div>
      </div>
    `;
  }

  private bindEvents(): void {
    const nodesContainer = this.container.querySelector('.json-nodes-container') as HTMLElement;
    const content = this.container.querySelector('.json-content') as HTMLElement;

    nodesContainer.addEventListener('click', (e) => this.handleNodeClick(e));

    // Handle copy events to include full nested JSON data
    nodesContainer.addEventListener('copy', (e) => this.handleCopy(e));

    // Debounce scroll events for better performance
    let scrollTimeout: number | null = null;
    content.addEventListener('scroll', () => {
      if (scrollTimeout) {
        clearTimeout(scrollTimeout);
      }

      // Immediate sync for visual consistency
      this.lineNumbersManager.syncLineNumbersScroll(this.container);

      // Debounced cleanup for performance
      scrollTimeout = window.setTimeout(() => {
        scrollTimeout = null;
      }, 16); // ~60fps
    }, { passive: true });

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }

    this.resizeObserver = new ResizeObserver(() => {
      this.debounceGenerateLineNumbers();
    });

    this.resizeObserver.observe(content);
    this.resizeObserver.observe(nodesContainer);
  }

  private debounceGenerateLineNumbers(): void {
    if (this.updateTimer) {
      cancelAnimationFrame(this.updateTimer);
    }

    this.updateTimer = requestAnimationFrame(() => {
      this.lineNumbersManager.generateLineNumbers(this.container);
    }) as unknown as number;
  }

  public setData(jsonData: any): void {
    this.jsonData = jsonData;
    this.nodes = JsonParser.parseToNodes(jsonData);
    this.renderNodesOptimized();
    requestAnimationFrame(() => {
      this.lineNumbersManager.generateLineNumbers(this.container);
      this.lineNumbersManager.syncLineNumbersScroll(this.container);
    });
  }

  private renderJsonAsText(): void {
    if (!this.jsonData) {
      this.formattedJsonText = '';
      this.totalLines = 0;
      return;
    }

    try {
      this.formattedJsonText = JSON.stringify(this.jsonData, null, 2);
      this.totalLines = this.formattedJsonText.split('\n').length;

      const textContent = this.container.querySelector('.json-text-content') as HTMLElement;
      if (textContent) {
        textContent.textContent = this.formattedJsonText;
      }
    } catch (error) {
      console.error('Failed to format JSON:', error);
      this.formattedJsonText = 'Invalid JSON data';
      this.totalLines = 1;

      const textContent = this.container.querySelector('.json-text-content') as HTMLElement;
      if (textContent) {
        textContent.textContent = this.formattedJsonText;
      }
    }
  }

  private renderNodesOptimized(): void {
    const container = this.container.querySelector('.json-nodes-container') as HTMLElement;
    const visibleNodes = JsonParser.getVisibleNodesWithClosingBrackets(this.nodes);
    const searchMatches = this.searchEngine.getMatches();
    const currentIndex = this.searchEngine.getCurrentIndex();
    const searchQuery = this.searchEngine.getSearchQuery();

    NodeRenderer.renderNodesOptimized(container, visibleNodes, searchQuery, searchMatches, currentIndex);
  }

  private handleNodeClick(e: Event): void {
    const target = e.target as HTMLElement;
    const nodeElement = target.closest('.json-node') as HTMLElement;

    if (!nodeElement) return;

    const nodeId = nodeElement.dataset.nodeId;
    if (!nodeId) return;

    const lineNumber = parseInt(nodeId);
    const node = JsonParser.findNodeByLineNumber(this.nodes, lineNumber);

    if (!node || (node.type !== 'object' && node.type !== 'array')) return;

    if (target.classList.contains('expand-icon') || target.classList.contains('bracket')) {
      this.toggleNode(node);
    }
  }

  private handleCopy(e: ClipboardEvent): void {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    // Get all selected node elements
    const range = selection.getRangeAt(0);
    const selectedNodes = this.getSelectedNodes(range);

    if (selectedNodes.length === 0) return;

    // Prevent default copy behavior
    e.preventDefault();

    // Reconstruct full JSON from selected nodes (including all nested data)
    const jsonToCopy = this.reconstructJsonFromNodes(selectedNodes);

    // Format and set clipboard data
    const formattedJson = JSON.stringify(jsonToCopy, null, 2);
    e.clipboardData?.setData('text/plain', formattedJson);
  }

  private getSelectedNodes(range: Range): JsonNode[] {
    const selectedNodes: JsonNode[] = [];
    const container = this.container.querySelector('.json-nodes-container');
    if (!container) return selectedNodes;

    // Get all node elements in the container
    const allNodeElements = container.querySelectorAll('.json-node[data-node-id]');

    allNodeElements.forEach((element) => {
      // Check if this element intersects with the selection
      if (range.intersectsNode(element)) {
        const nodeId = (element as HTMLElement).dataset.nodeId;
        if (nodeId) {
          const lineNumber = parseInt(nodeId);
          const node = JsonParser.findNodeByLineNumber(this.nodes, lineNumber);
          if (node && !selectedNodes.includes(node)) {
            selectedNodes.push(node);
          }
        }
      }
    });

    // Filter out nodes whose ancestors are also selected
    // This prevents duplication when selecting an expanded object
    return selectedNodes.filter(node => {
      // Check if any ancestor of this node is in the selection
      let parent = node.parent;
      while (parent) {
        if (selectedNodes.includes(parent)) {
          return false; // Exclude this node because its parent is selected
        }
        parent = parent.parent;
      }
      return true; // Include this node
    });
  }

  private reconstructJsonFromNodes(nodes: JsonNode[]): any {
    if (nodes.length === 0) return null;

    // If only one node is selected, return its full value
    if (nodes.length === 1) {
      return nodes[0].value;
    }

    // If multiple nodes are selected, reconstruct as array or object
    // Check if all nodes share the same parent
    const parent = nodes[0].parent;
    const allSameParent = nodes.every(node => node.parent === parent);

    if (allSameParent && parent) {
      if (parent.type === 'array') {
        // Return array of selected items
        return nodes.map(node => node.value);
      } else if (parent.type === 'object') {
        // Return object with selected properties
        const result: any = {};
        nodes.forEach(node => {
          if (node.key) {
            result[node.key] = node.value;
          }
        });
        return result;
      }
    }

    // Fallback: return array of all selected values
    return nodes.map(node => node.value);
  }

  private toggleNode(node: JsonNode): void {
    const content = this.container.querySelector('.json-content') as HTMLElement;
    const nodeElement = this.container.querySelector(`[data-node-id="${node.lineNumber}"]`) as HTMLElement;
    
    if (!content || !nodeElement) {
      node.isExpanded = !node.isExpanded;
      this.renderNodesOptimized();
      requestAnimationFrame(() => {
        this.lineNumbersManager.generateLineNumbers(this.container);
      });
      return;
    }
    
    // Disable smooth scrolling during the operation
    const originalScrollBehavior = content.style.scrollBehavior;
    content.style.scrollBehavior = 'auto';
    
    // Get the node's visual position relative to the scroll container
    const nodeRect = nodeElement.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();
    const visualOffsetFromContainerTop = nodeRect.top - contentRect.top;
    
    // Save current scroll position
    const savedScrollTop = content.scrollTop;
    
    // Toggle and render
    node.isExpanded = !node.isExpanded;
    this.renderNodesOptimized();
    
    // Force a reflow to ensure DOM is updated
    void content.offsetHeight;
    
    // Restore scroll position first to prevent jump
    content.scrollTop = savedScrollTop;
    
    // Now find the node and adjust scroll to keep it in place
    const updatedNodeElement = this.container.querySelector(`[data-node-id="${node.lineNumber}"]`) as HTMLElement;
    
    if (updatedNodeElement) {
      // Get updated position
      const newNodeRect = updatedNodeElement.getBoundingClientRect();
      const newContentRect = content.getBoundingClientRect();
      const currentOffset = newNodeRect.top - newContentRect.top;
      
      // Calculate and apply scroll adjustment
      const scrollAdjustment = currentOffset - visualOffsetFromContainerTop;
      const newScrollTop = content.scrollTop + scrollAdjustment;
      const maxScroll = Math.max(0, content.scrollHeight - content.clientHeight);
      content.scrollTop = Math.max(0, Math.min(newScrollTop, maxScroll));
    } else {
      // Node not found - keep scroll at saved position or clamp
      const maxScroll = Math.max(0, content.scrollHeight - content.clientHeight);
      content.scrollTop = Math.min(savedScrollTop, maxScroll);
    }
    
    // Restore smooth scrolling and update line numbers in next frame
    requestAnimationFrame(() => {
      content.style.scrollBehavior = originalScrollBehavior;
      this.lineNumbersManager.generateLineNumbers(this.container);
      this.lineNumbersManager.syncLineNumbersScroll(this.container);
    });
  }

  public expandAll(): void {
    JsonParser.expandAll(this.nodes);
    this.renderNodesOptimized();
    requestAnimationFrame(() => {
      // Reset scroll to top when expanding all
      const content = this.container.querySelector('.json-content') as HTMLElement;
      if (content) {
        content.scrollTop = 0;
      }
      this.lineNumbersManager.generateLineNumbers(this.container);
      this.lineNumbersManager.syncLineNumbersScroll(this.container);
    });
  }

  public collapseAll(): void {
    JsonParser.collapseAll(this.nodes);
    this.renderNodesOptimized();
    requestAnimationFrame(() => {
      // Reset scroll to top when collapsing all
      const content = this.container.querySelector('.json-content') as HTMLElement;
      if (content) {
        content.scrollTop = 0;
      }
      this.lineNumbersManager.generateLineNumbers(this.container);
      this.lineNumbersManager.syncLineNumbersScroll(this.container);
    });
  }

  public performSearch(query: string): void {
    const searchResult = this.searchEngine.performSearch(query, this.nodes);
    this.renderNodesOptimized();

    if (searchResult.currentIndex >= 0) {
      this.scrollToMatch();
    }

    try {
      this.updateSearchResults();
    } catch (error) {
      console.debug('Search results update skipped (toolbar not present)');
    }
  }

  public navigateSearch(direction: number): void {
    const searchResult = this.searchEngine.navigateSearch(direction);
    if (searchResult.matches.length === 0) return;

    this.scrollToMatch();
    this.renderNodesOptimized();

    try {
      this.updateSearchResults();
    } catch (error) {
      console.debug('Search results update skipped (toolbar not present)');
    }
  }

  private scrollToMatch(): void {
    const match = this.searchEngine.getCurrentMatch();
    if (!match) return;

    JsonViewerUtilities.scrollToMatch(this.container, match);
  }

  private updateSearchResults(): void {
    JsonViewerUtilities.updateSearchResults(this.container, this.searchEngine.getSearchInfo());
  }

  public clearSearch(): void {
    this.searchEngine.clearSearch();
    this.renderNodesOptimized();

    try {
      this.updateSearchResults();
    } catch (error) {
      console.debug('Search results update skipped (toolbar not present)');
    }
  }

  public getSearchInfo(): { total: number, current: number } {
    return this.searchEngine.getSearchInfo();
  }

  public clear(): void {
    if (this.updateTimer) {
      cancelAnimationFrame(this.updateTimer);
      this.updateTimer = null;
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    this.jsonData = null;
    this.formattedJsonText = '';
    this.totalLines = 0;
    this.nodes = [];
    this.searchEngine.clearSearch();
    this.lineNumbersManager.reset();

    const nodesContainer = this.container.querySelector('.json-nodes-container') as HTMLElement;
    const lineNumbers = this.container.querySelector('.line-numbers') as HTMLElement;

    if (nodesContainer) nodesContainer.innerHTML = '';
    if (lineNumbers) lineNumbers.innerHTML = '';

    try {
      this.updateSearchResults();
    } catch (error) {
      console.debug('Search results update skipped (toolbar not present)');
    }
  }

  public exportJson(): void {
    JsonViewerUtilities.exportJson(this.jsonData);
  }

  public openFullscreen(): void {
    JsonViewerUtilities.openFullscreen(this.jsonData);
  }
}