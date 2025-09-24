export interface JsonNode {
  key: string;
  value: any;
  type: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';
  level: number;
  isExpanded: boolean;
  parent?: JsonNode;
  children?: JsonNode[];
  lineNumber: number;
}

export interface SearchMatch {
  node: JsonNode;
  lineNumber: number;
  text: string;
  startIndex: number;
  endIndex: number;
  isKey?: boolean;
}

export class JsonViewer {
  private container: HTMLElement;
  private jsonData: any;
  private nodes: JsonNode[] = [];
  private searchMatches: SearchMatch[] = [];
  private currentSearchIndex = -1;
  private searchQuery = '';
  private updateTimer: number | null = null;
  private formattedJsonText = '';
  private totalLines = 0;
  private resizeObserver: ResizeObserver | null = null;
  private lineHeightPx = 0;

  constructor(containerId: string) {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`Container with id "${containerId}" not found`);
    }
    this.container = container;
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

    content.addEventListener('scroll', () => {
      this.syncLineNumbersScroll();
    });

    // Set up ResizeObserver to re-measure line numbers when content changes
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
      this.generateLineNumbers();
    }) as unknown as number;
  }

  public setData(jsonData: any): void {
    this.jsonData = jsonData;
    this.parseJson();
    this.renderNodesOptimized();
    // Use requestAnimationFrame to ensure DOM is updated before measuring
    requestAnimationFrame(() => {
      this.generateLineNumbers();
      this.syncLineNumbersScroll();
    });
  }

  private renderJsonAsText(): void {
    if (!this.jsonData) {
      this.formattedJsonText = '';
      this.totalLines = 0;
      return;
    }

    try {
      // Format JSON with proper indentation
      this.formattedJsonText = JSON.stringify(this.jsonData, null, 2);

      // Count total lines
      this.totalLines = this.formattedJsonText.split('\n').length;

      // Render the text content
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

  private generateLineNumbers(): void {
    const lineNumbers = this.container.querySelector('.line-numbers') as HTMLElement;
    const nodesContainer = this.container.querySelector('.json-nodes-container') as HTMLElement;
    if (!lineNumbers || !nodesContainer) return;

    // Get all rendered node elements in DOM order
    const nodeElements = nodesContainer.querySelectorAll('.json-node, .json-node-bracket');
    const fragment = document.createDocumentFragment();

    // Measure baseline line height if not done already
    if (this.lineHeightPx === 0) {
      this.measureLineHeight();
    }

    let lineNumber = 1;

    // Performance safeguard: for very large JSON (>1000 nodes), use simple 1:1 mapping
    if (nodeElements.length > 1000) {
      nodeElements.forEach((element: Element) => {
        const nodeElement = element as HTMLElement;
        const lineDiv = document.createElement('div');
        lineDiv.className = 'line-number';
        lineDiv.textContent = lineNumber.toString();

        // Match node height exactly
        const nodeHeight = nodeElement.getBoundingClientRect().height;
        lineDiv.style.height = `${nodeHeight}px`;
        lineDiv.style.lineHeight = `${nodeHeight}px`;

        fragment.appendChild(lineDiv);
        lineNumber++;
      });
    } else {
      // Precise line-by-line approach
      nodeElements.forEach((element: Element) => {
        const nodeElement = element as HTMLElement;
        const nodeHeight = nodeElement.getBoundingClientRect().height;

        // Calculate how many actual text lines this node contains
        const visualLines = Math.max(1, Math.round(nodeHeight / this.lineHeightPx));

        // Create a line number for each visual line
        for (let i = 0; i < visualLines; i++) {
          const lineDiv = document.createElement('div');
          lineDiv.className = 'line-number';
          lineDiv.textContent = lineNumber.toString();

          // Each line number gets exactly one line height
          lineDiv.style.height = `${this.lineHeightPx}px`;
          lineDiv.style.lineHeight = `${this.lineHeightPx}px`;
          lineDiv.style.display = 'block';

          fragment.appendChild(lineDiv);
          lineNumber++;
        }
      });
    }

    // Clear and append new line numbers
    lineNumbers.innerHTML = '';
    lineNumbers.appendChild(fragment);
  }


  private measureLineHeight(): void {
    const nodesContainer = this.container.querySelector('.json-nodes-container') as HTMLElement;
    if (!nodesContainer) return;

    // Create a temporary element with exactly one line of text to measure line height
    const testElement = document.createElement('div');
    testElement.className = 'json-node';
    testElement.style.position = 'absolute';
    testElement.style.visibility = 'hidden';
    testElement.style.top = '-9999px';
    testElement.style.left = '-9999px';
    testElement.style.whiteSpace = 'nowrap';
    testElement.style.height = 'auto';
    testElement.style.minHeight = '0';
    testElement.style.maxHeight = 'none';
    testElement.innerHTML = '<div class="node-content"><span class="expand-icon"></span><span class="key">"test"</span><span class="separator">: </span><span class="value">"M"</span></div>';

    nodesContainer.appendChild(testElement);
    this.lineHeightPx = testElement.getBoundingClientRect().height;
    nodesContainer.removeChild(testElement);

    // Fallback if measurement fails
    if (this.lineHeightPx <= 0) {
      this.lineHeightPx = 20; // Reasonable default based on CSS line-height: 1.3 and font-size: 13px
    }
  }

  private parseJson(): void {
    this.nodes = [];
    let lineNumber = 1;

    const parseNode = (key: string, value: any, level: number, parent?: JsonNode): JsonNode => {
      const type = this.getValueType(value);
      const node: JsonNode = {
        key,
        value,
        type,
        level,
        isExpanded: level < 2,
        parent,
        lineNumber: lineNumber++
      };

      if (type === 'object' || type === 'array') {
        node.children = [];
        if (type === 'object') {
          Object.keys(value).forEach(childKey => {
            const childNode = parseNode(childKey, value[childKey], level + 1, node);
            node.children!.push(childNode);
          });
        } else {
          value.forEach((item: any, index: number) => {
            const childNode = parseNode(`${index}`, item, level + 1, node);
            node.children!.push(childNode);
          });
        }
      }

      return node;
    };

    if (this.jsonData !== null && this.jsonData !== undefined) {
      const rootType = this.getValueType(this.jsonData);

      if (rootType === 'object' || rootType === 'array') {
        // For root arrays/objects, create a single root node
        const rootNode = parseNode('', this.jsonData, 0, undefined);
        this.nodes = [rootNode];
      } else {
        // For primitive values at root, show them directly
        const rootNode = parseNode('', this.jsonData, 0, undefined);
        this.nodes = [rootNode];
      }
    }
  }

  private getValueType(value: any): JsonNode['type'] {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'object') return 'object';
    if (typeof value === 'string') return 'string';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    return 'string';
  }


  private renderNodesOptimized(): void {
    const container = this.container.querySelector('.json-nodes-container') as HTMLElement;
    const visibleNodes = this.getVisibleNodesWithClosingBrackets();

    // Use DocumentFragment for batch DOM updates
    const fragment = document.createDocumentFragment();

    // Process nodes in chunks to avoid blocking the UI
    if (visibleNodes.length > 100) {
      this.renderNodesInChunks(visibleNodes, container);
    } else {
      visibleNodes.forEach(nodeData => {
        if (nodeData.isClosingBracket) {
          const closingElement = this.createClosingBracketElement(nodeData.node!);
          fragment.appendChild(closingElement);
        } else {
          const nodeElement = this.createNodeElement(nodeData.node!);
          fragment.appendChild(nodeElement);
        }
      });

      // Single DOM update
      container.innerHTML = '';
      container.appendChild(fragment);
    }
  }

  private renderNodesInChunks(visibleNodes: Array<{node?: JsonNode, isClosingBracket: boolean}>, container: HTMLElement): void {
    const chunkSize = 50;
    let currentIndex = 0;

    container.innerHTML = '';

    const processChunk = () => {
      const fragment = document.createDocumentFragment();
      const endIndex = Math.min(currentIndex + chunkSize, visibleNodes.length);

      for (let i = currentIndex; i < endIndex; i++) {
        const nodeData = visibleNodes[i];
        if (nodeData.isClosingBracket) {
          const closingElement = this.createClosingBracketElement(nodeData.node!);
          fragment.appendChild(closingElement);
        } else {
          const nodeElement = this.createNodeElement(nodeData.node!);
          fragment.appendChild(nodeElement);
        }
      }

      container.appendChild(fragment);
      currentIndex = endIndex;

      if (currentIndex < visibleNodes.length) {
        requestAnimationFrame(processChunk);
      }
    };

    requestAnimationFrame(processChunk);
  }

  private getVisibleNodes(): JsonNode[] {
    const visibleNodes: JsonNode[] = [];

    const addVisibleNodes = (node: JsonNode) => {
      visibleNodes.push(node);
      if (node.isExpanded && node.children) {
        node.children.forEach(child => addVisibleNodes(child));
      }
    };

    // Since we now have only one root node, process it directly
    if (this.nodes.length > 0) {
      addVisibleNodes(this.nodes[0]);
    }

    return visibleNodes;
  }

  private getVisibleNodesWithClosingBrackets(): Array<{node?: JsonNode, isClosingBracket: boolean}> {
    const result: Array<{node?: JsonNode, isClosingBracket: boolean}> = [];

    const addVisibleNodes = (node: JsonNode) => {
      result.push({node, isClosingBracket: false});

      if (node.isExpanded && node.children) {
        node.children.forEach(child => addVisibleNodes(child));

        // Add closing bracket after all children
        if (node.children.length > 0) {
          result.push({node, isClosingBracket: true});
        }
      }
    };

    // Since we now have only one root node, process it directly
    if (this.nodes.length > 0) {
      addVisibleNodes(this.nodes[0]);
    }

    return result;
  }

  private createNodeElement(node: JsonNode): HTMLElement {
    const element = document.createElement('div');
    element.className = `json-node json-node-${node.type}`;
    element.style.paddingLeft = `${node.level * 12 + 8}px`;
    element.dataset.nodeId = `${node.lineNumber}`;

    const isArrayItem = node.parent && node.parent.type === 'array';
    const hasKey = node.key && !isArrayItem;

    // Create content container
    const contentDiv = document.createElement('div');
    contentDiv.className = 'node-content';

    if (node.type === 'object' || node.type === 'array') {
      const hasChildren = node.children && node.children.length > 0;
      const expandIcon = hasChildren ? (node.isExpanded ? '▼' : '▶') : '';
      const childrenCount = node.children ? node.children.length : 0;
      const preview = node.isExpanded ? '' : ` (${childrenCount} items)`;

      const keyPart = hasKey ? `<span class="key">"${this.highlightSearchTerm(node.key, node.lineNumber, true)}"</span><span class="separator">: </span>` : '';

      contentDiv.innerHTML = `
        <span class="expand-icon">${expandIcon}</span>
        ${keyPart}
        <span class="bracket">${node.type === 'array' ? '[' : '{'}</span>
        <span class="preview">${preview}</span>
        ${!node.isExpanded ? `<span class="bracket">${node.type === 'array' ? ']' : '}'}</span>` : ''}
      `;
    } else {
      const displayValue = this.formatValueWithHighlight(node.value, node.type, node.lineNumber);
      const keyPart = hasKey ? `<span class="key">"${this.highlightSearchTerm(node.key, node.lineNumber, true)}"</span><span class="separator">: </span>` : '';

      contentDiv.innerHTML = `
        <span class="expand-icon"></span>
        ${keyPart}
        <span class="value value-${node.type}">${displayValue}</span>
      `;
    }

    element.appendChild(contentDiv);
    return element;
  }

  private createClosingBracketElement(node: JsonNode): HTMLElement {
    const element = document.createElement('div');
    element.className = 'json-node json-node-bracket';
    element.style.paddingLeft = `${node.level * 12 + 8}px`;

    element.innerHTML = `
      <div class="node-content">
        <span class="expand-icon"></span>
        <span class="bracket">${node.type === 'array' ? ']' : '}'}</span>
      </div>
    `;

    return element;
  }

  private formatValue(value: any, type: JsonNode['type']): string {
    switch (type) {
      case 'string':
        return `"${this.escapeHtml(value)}"`;
      case 'number':
      case 'boolean':
        return String(value);
      case 'null':
        return 'null';
      default:
        return String(value);
    }
  }

  private formatValueWithHighlight(value: any, type: JsonNode['type'], nodeLineNumber: number): string {
    switch (type) {
      case 'string':
        return `"${this.highlightSearchTerm(value, nodeLineNumber, false)}"`;
      case 'number':
      case 'boolean':
        return this.highlightSearchTerm(String(value), nodeLineNumber, false);
      case 'null':
        return this.highlightSearchTerm('null', nodeLineNumber, false);
      default:
        return this.highlightSearchTerm(String(value), nodeLineNumber, false);
    }
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
      // Removed backspace and form feed escaping as they might be causing issues
  }

  private highlightSearchTerm(text: string, nodeLineNumber?: number, isKey: boolean = false): string {
    if (!this.searchQuery.trim()) {
      return this.escapeHtml(text);
    }

    const query = this.searchQuery.toLowerCase();
    const lowerText = text.toLowerCase();

    let result = '';
    let lastIndex = 0;
    let index = lowerText.indexOf(query);
    let matchIndexInText = 0;

    while (index !== -1) {
      // Add text before the match
      result += this.escapeHtml(text.substring(lastIndex, index));

      // Determine if this specific match occurrence is the current active match
      const currentMatch = this.searchMatches[this.currentSearchIndex];
      const isCurrentMatch = this.currentSearchIndex !== -1 &&
                           currentMatch &&
                           currentMatch.node.lineNumber === nodeLineNumber &&
                           currentMatch.startIndex === index &&
                           ((isKey && currentMatch.isKey) || (!isKey && !currentMatch.isKey));

      const highlightClass = isCurrentMatch ? 'search-highlight search-highlight-active' : 'search-highlight';

      // Add highlighted match
      const matchText = this.escapeHtml(text.substring(index, index + query.length));
      result += `<span class="${highlightClass}">${matchText}</span>`;

      lastIndex = index + query.length;
      index = lowerText.indexOf(query, lastIndex);
      matchIndexInText++;
    }

    // Add remaining text
    result += this.escapeHtml(text.substring(lastIndex));

    return result;
  }




  private syncLineNumbersScroll(): void {
    const lineNumbers = this.container.querySelector('.line-numbers') as HTMLElement;
    const content = this.container.querySelector('.json-content') as HTMLElement;

    if (lineNumbers && content) {
      // Sync scroll positions perfectly
      lineNumbers.scrollTop = content.scrollTop;
    }
  }

  private handleNodeClick(e: Event): void {
    const target = e.target as HTMLElement;
    const nodeElement = target.closest('.json-node') as HTMLElement;

    if (!nodeElement) return;

    const nodeId = nodeElement.dataset.nodeId;
    if (!nodeId) return;

    const lineNumber = parseInt(nodeId);
    const node = this.findNodeByLineNumber(lineNumber);

    if (!node || (node.type !== 'object' && node.type !== 'array')) return;

    if (target.classList.contains('expand-icon') || target.classList.contains('bracket')) {
      this.toggleNode(node);
    }
  }

  private findNodeByLineNumber(lineNumber: number): JsonNode | null {
    const searchInNode = (node: JsonNode): JsonNode | null => {
      if (node.lineNumber === lineNumber) {
        return node;
      }

      if (node.children) {
        for (const child of node.children) {
          const found = searchInNode(child);
          if (found) return found;
        }
      }

      return null;
    };

    // Search through all root nodes
    for (const rootNode of this.nodes) {
      const found = searchInNode(rootNode);
      if (found) return found;
    }

    return null;
  }

  private toggleNode(node: JsonNode): void {
    node.isExpanded = !node.isExpanded;
    this.renderNodesOptimized();
    // Use requestAnimationFrame to ensure DOM is updated before measuring
    requestAnimationFrame(() => {
      this.generateLineNumbers();
    });
  }

  public expandAll(): void {
    const expandNode = (node: JsonNode) => {
      if (node.type === 'object' || node.type === 'array') {
        node.isExpanded = true;
      }
      if (node.children) {
        node.children.forEach(child => expandNode(child));
      }
    };

    // Expand all nodes in the tree
    if (this.nodes.length > 0) {
      expandNode(this.nodes[0]);
    }

    this.renderNodesOptimized();
    // Use requestAnimationFrame to ensure DOM is updated before measuring
    requestAnimationFrame(() => {
      this.generateLineNumbers();
    });
  }

  public collapseAll(): void {
    const collapseNode = (node: JsonNode) => {
      if (node.type === 'object' || node.type === 'array') {
        node.isExpanded = false;
      }
      if (node.children) {
        node.children.forEach(child => collapseNode(child));
      }
    };

    // Collapse all nodes in the tree
    if (this.nodes.length > 0) {
      collapseNode(this.nodes[0]);
    }

    this.renderNodesOptimized();
    // Use requestAnimationFrame to ensure DOM is updated before measuring
    requestAnimationFrame(() => {
      this.generateLineNumbers();
    });
  }

  public performSearch(query: string): void {
    this.searchQuery = query;
    this.searchMatches = [];
    this.currentSearchIndex = -1;

    if (!this.searchQuery.trim()) {
      this.renderNodesOptimized();
      try {
        this.updateSearchResults();
      } catch (error) {
        console.debug('Search results update skipped (toolbar not present)');
      }
      return;
    }

    const queryLower = this.searchQuery.toLowerCase();
    const visibleNodes = this.getVisibleNodes();

    visibleNodes.forEach(node => {
      // Search in key
      if (node.key) {
        const keyLower = node.key.toLowerCase();
        let startIndex = 0;
        let index = keyLower.indexOf(queryLower, startIndex);

        while (index !== -1) {
          this.searchMatches.push({
            node,
            lineNumber: node.lineNumber,
            text: node.key,
            startIndex: index,
            endIndex: index + queryLower.length,
            isKey: true
          });
          startIndex = index + 1;
          index = keyLower.indexOf(queryLower, startIndex);
        }
      }

      // Search in value (only for non-object/array nodes)
      if (node.type !== 'object' && node.type !== 'array') {
        const valueStr = this.formatValue(node.value, node.type);
        const valueLower = valueStr.toLowerCase();
        let startIndex = 0;
        let index = valueLower.indexOf(queryLower, startIndex);

        while (index !== -1) {
          this.searchMatches.push({
            node,
            lineNumber: node.lineNumber,
            text: valueStr,
            startIndex: index,
            endIndex: index + queryLower.length,
            isKey: false
          });
          startIndex = index + 1;
          index = valueLower.indexOf(queryLower, startIndex);
        }
      }
    });

    this.currentSearchIndex = this.searchMatches.length > 0 ? 0 : -1;
    this.renderNodesOptimized();

    if (this.currentSearchIndex >= 0) {
      this.scrollToMatch();
    }

    try {
      this.updateSearchResults();
    } catch (error) {
      console.debug('Search results update skipped (toolbar not present)');
    }
  }


  public navigateSearch(direction: number): void {
    if (this.searchMatches.length === 0) return;

    if (direction === 1) {
      this.currentSearchIndex = (this.currentSearchIndex + 1) % this.searchMatches.length;
    } else {
      this.currentSearchIndex = this.currentSearchIndex <= 0 ? this.searchMatches.length - 1 : this.currentSearchIndex - 1;
    }

    this.scrollToMatch();
    this.renderNodesOptimized();

    try {
      this.updateSearchResults();
    } catch (error) {
      console.debug('Search results update skipped (toolbar not present)');
    }
  }

  private scrollToMatch(): void {
    if (this.currentSearchIndex === -1 || !this.searchMatches[this.currentSearchIndex]) return;

    const match = this.searchMatches[this.currentSearchIndex];

    // Find the actual node element to scroll to
    const nodeElements = this.container.querySelectorAll('.json-node');
    let targetElement: HTMLElement | null = null;

    nodeElements.forEach((element) => {
      if (element.getAttribute('data-node-id') === match.node.lineNumber.toString()) {
        targetElement = element as HTMLElement;
      }
    });

    if (targetElement) {
      (targetElement as any).scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }
  }

  private updateSearchResults(): void {
    const resultsSpan = this.container.querySelector('.search-results') as HTMLElement;
    if (resultsSpan) {
      const total = this.searchMatches.length;
      const current = this.currentSearchIndex === -1 ? 0 : this.currentSearchIndex + 1;
      resultsSpan.textContent = `${current}/${total}`;
    }
    // Note: Search results are now handled by the floating search bar in ResponseManager
  }

  public clearSearch(): void {
    this.searchQuery = '';
    this.searchMatches = [];
    this.currentSearchIndex = -1;

    this.renderNodesOptimized();

    try {
      this.updateSearchResults();
    } catch (error) {
      console.debug('Search results update skipped (toolbar not present)');
    }
  }

  public getSearchInfo(): { total: number, current: number } {
    return {
      total: this.searchMatches.length,
      current: this.currentSearchIndex === -1 ? 0 : this.currentSearchIndex + 1
    };
  }


  public clear(): void {
    // Clear any pending updates
    if (this.updateTimer) {
      cancelAnimationFrame(this.updateTimer);
      this.updateTimer = null;
    }

    // Disconnect ResizeObserver
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    this.jsonData = null;
    this.formattedJsonText = '';
    this.totalLines = 0;
    this.lineHeightPx = 0;
    this.nodes = [];
    this.searchMatches = [];
    this.currentSearchIndex = -1;
    this.searchQuery = '';

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
    if (!this.jsonData) return;

    const jsonString = JSON.stringify(this.jsonData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `json-export-${new Date().getTime()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  public openFullscreen(): void {
    if (!this.jsonData) return;

    // Create fullscreen modal
    const modal = document.createElement('div');
    modal.className = 'json-fullscreen-modal';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <div class="modal-title">JSON Viewer - Full Screen</div>
          <button class="close-btn">×</button>
        </div>
        <div class="modal-body">
          <div id="fullscreen-json-viewer"></div>
        </div>
      </div>
    `;

    // Add to body
    document.body.appendChild(modal);

    // Create new JSON viewer instance for fullscreen
    const fullscreenViewer = new JsonViewer('fullscreen-json-viewer');
    fullscreenViewer.setData(this.jsonData);

    // Handle close button
    const closeBtn = modal.querySelector('.close-btn') as HTMLButtonElement;
    closeBtn.addEventListener('click', () => {
      document.body.removeChild(modal);
    });

    // Handle escape key
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        document.body.removeChild(modal);
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);

    // Handle background click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        document.body.removeChild(modal);
        document.removeEventListener('keydown', handleEscape);
      }
    });
  }
}