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
        <div class="json-viewer-toolbar">
          <div class="search-container">
            <input type="text" class="search-input" placeholder="Search in JSON...">
            <span class="search-results">0/0</span>
          </div>
          <div class="toolbar-actions">
            <button class="export-btn">📤 Export</button>
            <button class="collapse-all">📁 Collapse</button>
            <button class="expand-all">📂 Expand</button>
            <button class="fullscreen-btn">⛶ Fullscreen</button>
          </div>
        </div>
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
    const searchInput = this.container.querySelector('.search-input') as HTMLInputElement;
    const exportBtn = this.container.querySelector('.export-btn') as HTMLButtonElement;
    const expandAll = this.container.querySelector('.expand-all') as HTMLButtonElement;
    const collapseAll = this.container.querySelector('.collapse-all') as HTMLButtonElement;
    const fullscreenBtn = this.container.querySelector('.fullscreen-btn') as HTMLButtonElement;
    const nodesContainer = this.container.querySelector('.json-nodes-container') as HTMLElement;
    const content = this.container.querySelector('.json-content') as HTMLElement;

    searchInput.addEventListener('input', (e) => {
      this.searchQuery = (e.target as HTMLInputElement).value;
      this.performSearch();
    });

    // Handle keyboard navigation for search
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.navigateSearch(e.shiftKey ? -1 : 1);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.clearSearch();
      }
    });

    exportBtn.addEventListener('click', () => this.exportJson());
    expandAll.addEventListener('click', () => this.expandAll());
    collapseAll.addEventListener('click', () => this.collapseAll());
    fullscreenBtn.addEventListener('click', () => this.openFullscreen());

    nodesContainer.addEventListener('click', (e) => this.handleNodeClick(e));

    content.addEventListener('scroll', () => {
      this.syncLineNumbersScroll();
    });
  }

  public setData(jsonData: any): void {
    this.jsonData = jsonData;
    this.parseJson();
    this.renderNodes();
    this.updateLineNumbersBatched(); // Use batched for initial load
    this.syncLineNumbersScroll();
    // Perform search without triggering another line number update
    this.performSearchWithoutUpdate();
  }

  private parseJson(): void {
    this.nodes = [];
    let lineNumber = 1;

    const parseNode = (key: string, value: any, level: number, parent?: JsonNode, isRoot: boolean = false): JsonNode => {
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

      if (!isRoot) {
        this.nodes.push(node);
      }
      return node;
    };

    if (this.jsonData !== null && this.jsonData !== undefined) {
      const rootType = this.getValueType(this.jsonData);

      if (rootType === 'object' || rootType === 'array') {
        // For root arrays/objects, show the container with its brackets
        const rootNode = parseNode('', this.jsonData, 0, undefined, false);
        this.flattenAndAddNodes(rootNode);
      } else {
        // For primitive values at root, show them directly
        const rootNode = parseNode('', this.jsonData, -1, undefined, true);
        if (rootNode.children) {
          rootNode.children.forEach(child => {
            child.level = 0;
            this.flattenAndAddNodes(child);
          });
        }
      }
    }
  }

  private flattenAndAddNodes(node: JsonNode): void {
    this.nodes.push(node);
    if (node.children) {
      node.children.forEach(child => {
        this.flattenAndAddNodes(child);
      });
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

  private renderNodes(): void {
    const container = this.container.querySelector('.json-nodes-container') as HTMLElement;
    container.innerHTML = '';

    const visibleNodes = this.getVisibleNodesWithClosingBrackets();

    visibleNodes.forEach(nodeData => {
      if (nodeData.isClosingBracket) {
        const closingElement = this.createClosingBracketElement(nodeData.node!);
        container.appendChild(closingElement);
      } else {
        const nodeElement = this.createNodeElement(nodeData.node!);
        container.appendChild(nodeElement);
      }
    });
  }

  private getVisibleNodes(): JsonNode[] {
    const visibleNodes: JsonNode[] = [];

    const addVisibleNodes = (node: JsonNode) => {
      visibleNodes.push(node);
      if (node.isExpanded && node.children) {
        node.children.forEach(child => addVisibleNodes(child));
      }
    };

    this.nodes.filter(node => node.level === 0).forEach(rootNode => {
      addVisibleNodes(rootNode);
    });

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

    this.nodes.filter(node => node.level === 0).forEach(rootNode => {
      addVisibleNodes(rootNode);
    });

    return result;
  }

  private createNodeElement(node: JsonNode): HTMLElement {
    const element = document.createElement('div');
    element.className = `json-node json-node-${node.type}`;
    element.style.paddingLeft = `${node.level * 12 + 8}px`;
    element.dataset.nodeId = `${node.lineNumber}`;

    const isArrayItem = node.parent && node.parent.type === 'array';
    const hasKey = node.key && !isArrayItem;

    if (node.type === 'object' || node.type === 'array') {
      const hasChildren = node.children && node.children.length > 0;
      const expandIcon = hasChildren ? (node.isExpanded ? '▼' : '▶') : '';
      const childrenCount = node.children ? node.children.length : 0;
      const preview = node.isExpanded ? '' : ` (${childrenCount} items)`;

      const keyPart = hasKey ? `<span class="key">"${this.highlightSearchTerm(node.key, node.lineNumber, true)}"</span><span class="separator">: </span>` : '';

      element.innerHTML = `
        <div class="node-content">
          <span class="expand-icon">${expandIcon}</span>
          ${keyPart}
          <span class="bracket">${node.type === 'array' ? '[' : '{'}</span>
          <span class="preview">${preview}</span>
          ${!node.isExpanded ? `<span class="bracket">${node.type === 'array' ? ']' : '}'}</span>` : ''}
        </div>
      `;
    } else {
      const displayValue = this.formatValueWithHighlight(node.value, node.type, node.lineNumber);
      const keyPart = hasKey ? `<span class="key">"${this.highlightSearchTerm(node.key, node.lineNumber, true)}"</span><span class="separator">: </span>` : '';

      element.innerHTML = `
        <div class="node-content">
          <span class="expand-icon"></span>
          ${keyPart}
          <span class="value value-${node.type}">${displayValue}</span>
        </div>
      `;
    }

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

  private updateLineNumbers(): void {
    this.updateLineNumbersImmediate();
  }

  private updateLineNumbersBatched(): void {
    // Clear any pending updates to prevent multiple rapid calls
    if (this.updateTimer) {
      cancelAnimationFrame(this.updateTimer);
    }

    // Use requestAnimationFrame for smoother updates in batch scenarios
    this.updateTimer = requestAnimationFrame(() => {
      this.updateLineNumbersImmediate();
    }) as unknown as number;
  }

  private updateLineNumbersImmediate(): void {
    const lineNumbers = this.container.querySelector('.line-numbers') as HTMLElement;
    const visibleNodes = this.getVisibleNodesWithClosingBrackets();

    // Create a document fragment for batch DOM updates
    const fragment = document.createDocumentFragment();
    
    visibleNodes.forEach((_, index) => {
      const lineDiv = document.createElement('div');
      lineDiv.className = 'line-number';
      lineDiv.textContent = (index + 1).toString();
      fragment.appendChild(lineDiv);
    });

    // Single DOM update
    lineNumbers.innerHTML = '';
    lineNumbers.appendChild(fragment);

    // Sync heights immediately after DOM update
    this.syncLineHeightsImmediate();
  }

  private syncLineHeights(): void {
    const lineNumbers = this.container.querySelectorAll('.line-number') as NodeListOf<HTMLElement>;
    const jsonNodes = this.container.querySelectorAll('.json-node') as NodeListOf<HTMLElement>;

    // Ensure we have the same number of elements
    if (lineNumbers.length !== jsonNodes.length) return;

    // Match heights after content is rendered
    setTimeout(() => {
      lineNumbers.forEach((lineNumber, index) => {
        if (jsonNodes[index]) {
          const nodeHeight = jsonNodes[index].offsetHeight;
          lineNumber.style.minHeight = `${nodeHeight}px`;
        }
      });
    }, 0);
  }

  private syncLineHeightsImmediate(): void {
    const lineNumbers = this.container.querySelectorAll('.line-number') as NodeListOf<HTMLElement>;
    const jsonNodes = this.container.querySelectorAll('.json-node') as NodeListOf<HTMLElement>;

    // Ensure we have the same number of elements
    if (lineNumbers.length !== jsonNodes.length) return;

    // Force a reflow to ensure DOM is updated, then sync heights immediately
    this.container.offsetHeight;
    
    lineNumbers.forEach((lineNumber, index) => {
      if (jsonNodes[index]) {
        const nodeHeight = jsonNodes[index].offsetHeight;
        lineNumber.style.minHeight = `${nodeHeight}px`;
      }
    });
  }

  private syncLineNumbersScroll(): void {
    const lineNumbers = this.container.querySelector('.line-numbers') as HTMLElement;
    const content = this.container.querySelector('.json-content') as HTMLElement;

    // Sync scroll positions
    lineNumbers.scrollTop = content.scrollTop;
  }

  private handleNodeClick(e: Event): void {
    const target = e.target as HTMLElement;
    const nodeElement = target.closest('.json-node') as HTMLElement;

    if (!nodeElement) return;

    const nodeId = nodeElement.dataset.nodeId;
    if (!nodeId) return;

    const lineNumber = parseInt(nodeId);
    const node = this.nodes.find(n => n.lineNumber === lineNumber);

    if (!node || (node.type !== 'object' && node.type !== 'array')) return;

    if (target.classList.contains('expand-icon') || target.classList.contains('bracket')) {
      this.toggleNode(node);
    }
  }

  private toggleNode(node: JsonNode): void {
    node.isExpanded = !node.isExpanded;
    this.renderNodes();
    this.updateLineNumbers();
    this.syncLineNumbersScroll();
  }

  private expandAll(): void {
    this.nodes.forEach(node => {
      if (node.type === 'object' || node.type === 'array') {
        node.isExpanded = true;
      }
    });
    this.renderNodes();
    this.updateLineNumbers();
    this.syncLineNumbersScroll();
  }

  private collapseAll(): void {
    this.nodes.forEach(node => {
      if (node.type === 'object' || node.type === 'array') {
        node.isExpanded = node.level === 0;
      }
    });
    this.renderNodes();
    this.updateLineNumbers();
    this.syncLineNumbersScroll();
  }

  private performSearch(): void {
    this.searchMatches = [];

    if (!this.searchQuery.trim()) {
      this.updateSearchResults();
      this.renderNodes();
      this.updateLineNumbers();
      this.syncLineNumbersScroll();
      return;
    }

    const query = this.searchQuery.toLowerCase();

    // Only search in visible nodes
    const visibleNodes = this.getVisibleNodes();

    visibleNodes.forEach(node => {
      // Search in key - find ALL occurrences
      if (node.key) {
        const keyLower = node.key.toLowerCase();
        let startIndex = 0;
        let index = keyLower.indexOf(query, startIndex);

        while (index !== -1) {
          this.searchMatches.push({
            node,
            lineNumber: node.lineNumber,
            text: node.key,
            startIndex: index,
            endIndex: index + query.length,
            isKey: true
          });
          startIndex = index + 1;
          index = keyLower.indexOf(query, startIndex);
        }
      }

      // Search in value (only for non-object/array nodes) - find ALL occurrences
      if (node.type !== 'object' && node.type !== 'array') {
        const valueStr = this.formatValue(node.value, node.type);
        const valueLower = valueStr.toLowerCase();
        let startIndex = 0;
        let index = valueLower.indexOf(query, startIndex);

        while (index !== -1) {
          this.searchMatches.push({
            node,
            lineNumber: node.lineNumber,
            text: valueStr,
            startIndex: index,
            endIndex: index + query.length,
            isKey: false
          });
          startIndex = index + 1;
          index = valueLower.indexOf(query, startIndex);
        }
      }
    });

    this.currentSearchIndex = this.searchMatches.length > 0 ? 0 : -1;
    this.updateSearchResults();
    this.highlightSearchMatches();
  }

  private performSearchWithoutUpdate(): void {
    this.searchMatches = [];

    if (!this.searchQuery.trim()) {
      this.updateSearchResults();
      // Skip the render/update calls since they were already done
      return;
    }

    const query = this.searchQuery.toLowerCase();

    // Only search in visible nodes
    const visibleNodes = this.getVisibleNodes();

    visibleNodes.forEach(node => {
      // Search in key - find ALL occurrences
      if (node.key) {
        const keyLower = node.key.toLowerCase();
        let startIndex = 0;
        let index = keyLower.indexOf(query, startIndex);

        while (index !== -1) {
          this.searchMatches.push({
            node,
            lineNumber: node.lineNumber,
            text: node.key,
            startIndex: index,
            endIndex: index + query.length,
            isKey: true
          });
          startIndex = index + 1;
          index = keyLower.indexOf(query, startIndex);
        }
      }

      // Search in value (only for non-object/array nodes) - find ALL occurrences
      if (node.type !== 'object' && node.type !== 'array') {
        const valueStr = this.formatValue(node.value, node.type);
        const valueLower = valueStr.toLowerCase();
        let startIndex = 0;
        let index = valueLower.indexOf(query, startIndex);

        while (index !== -1) {
          this.searchMatches.push({
            node,
            lineNumber: node.lineNumber,
            text: valueStr,
            startIndex: index,
            endIndex: index + query.length,
            isKey: false
          });
          startIndex = index + 1;
          index = valueLower.indexOf(query, startIndex);
        }
      }
    });

    this.currentSearchIndex = this.searchMatches.length > 0 ? 0 : -1;
    this.updateSearchResults();
    // Skip highlightSearchMatches() since it triggers render/update cycle
  }

  private navigateSearch(direction: number): void {
    if (this.searchMatches.length === 0) return;

    this.currentSearchIndex += direction;

    if (this.currentSearchIndex >= this.searchMatches.length) {
      this.currentSearchIndex = 0;
    } else if (this.currentSearchIndex < 0) {
      this.currentSearchIndex = this.searchMatches.length - 1;
    }

    this.updateSearchResults();
    this.scrollToMatch();
  }

  private scrollToMatch(): void {
    if (this.currentSearchIndex === -1 || !this.searchMatches[this.currentSearchIndex]) return;

    const match = this.searchMatches[this.currentSearchIndex];
    const content = this.container.querySelector('.json-content') as HTMLElement;

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
    const total = this.searchMatches.length;
    const current = this.currentSearchIndex === -1 ? 0 : this.currentSearchIndex + 1;
    resultsSpan.textContent = `${current}/${total}`;
  }

  private clearSearch(): void {
    this.searchQuery = '';
    this.searchMatches = [];
    this.currentSearchIndex = -1;

    const searchInput = this.container.querySelector('.search-input') as HTMLInputElement;
    if (searchInput) {
      searchInput.value = '';
    }

    this.updateSearchResults();
    this.renderNodes();
    this.updateLineNumbers();
    this.syncLineNumbersScroll();
  }

  private highlightSearchMatches(): void {
    this.renderNodes();
    this.updateLineNumbers();
    this.syncLineNumbersScroll();
  }

  public clear(): void {
    // Clear any pending updates
    if (this.updateTimer) {
      cancelAnimationFrame(this.updateTimer);
      this.updateTimer = null;
    }

    this.jsonData = null;
    this.nodes = [];
    this.searchMatches = [];
    this.currentSearchIndex = -1;
    this.searchQuery = '';

    const nodesContainer = this.container.querySelector('.json-nodes-container') as HTMLElement;
    const lineNumbers = this.container.querySelector('.line-numbers') as HTMLElement;
    const searchInput = this.container.querySelector('.search-input') as HTMLInputElement;

    if (nodesContainer) nodesContainer.innerHTML = '';
    if (lineNumbers) lineNumbers.innerHTML = '';
    if (searchInput) searchInput.value = '';

    this.updateSearchResults();
  }

  private exportJson(): void {
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

  private openFullscreen(): void {
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