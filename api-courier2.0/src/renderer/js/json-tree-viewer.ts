interface JSONTreeNode {
  key: string;
  value: any;
  type: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';
  path: string;
  isExpanded: boolean;
  children?: JSONTreeNode[];
  parent?: JSONTreeNode;
}

export class JSONTreeViewer {
  private container: any;
  private rootNode: JSONTreeNode | null = null;
  private searchQuery: string = '';
  private filteredNodes: Set<string> = new Set();

  constructor(container: any) {
    this.container = container;
    this.setupStyles();
  }

  private setupStyles(): void {
    const existingStyle = (document as any).getElementById('json-tree-styles');
    if (!existingStyle) {
      const style = (document as any).createElement('style');
      style.id = 'json-tree-styles';
      style.textContent = `
        .json-tree {
          font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
          font-size: 12px;
          line-height: 1.4;
          color: var(--text-color);
          background: var(--surface-color);
          border: 1px solid var(--border-color);
          border-radius: 4px;
          max-height: 400px;
          overflow: auto;
          padding: 8px;
        }

        .json-tree-controls {
          display: flex;
          gap: 8px;
          margin-bottom: 8px;
          padding: 8px;
          background: var(--background-color);
          border-bottom: 1px solid var(--border-color);
        }

        .json-tree-search {
          flex: 1;
          padding: 4px 8px;
          border: 1px solid var(--border-color);
          border-radius: 4px;
          background: var(--surface-color);
          color: var(--text-color);
        }

        .json-tree-search:focus {
          outline: none;
          border-color: var(--accent-color);
        }

        .json-tree-btn {
          padding: 4px 8px;
          font-size: 11px;
          border: 1px solid var(--border-color);
          border-radius: 3px;
          background: var(--surface-color);
          color: var(--text-color);
          cursor: pointer;
        }

        .json-tree-btn:hover {
          background: var(--accent-color);
          color: white;
        }

        .json-node {
          margin: 0;
          padding: 0;
          list-style: none;
        }

        .json-node-content {
          display: flex;
          align-items: center;
          padding: 2px 4px;
          cursor: pointer;
          border-radius: 2px;
          position: relative;
        }

        .json-node-content:hover {
          background: rgba(255, 255, 255, 0.1);
        }

        .json-node-toggle {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 16px;
          height: 16px;
          margin-right: 4px;
          font-size: 10px;
          border: none;
          background: none;
          color: var(--text-secondary);
          cursor: pointer;
          border-radius: 2px;
        }

        .json-node-toggle:hover {
          background: var(--accent-color);
          color: white;
        }

        .json-node-toggle.empty {
          visibility: hidden;
        }

        .json-node-key {
          color: #9cdcfe;
          margin-right: 8px;
          font-weight: 500;
        }

        .json-node-colon {
          color: #d4d4d4;
          margin-right: 6px;
        }

        .json-node-value {
          flex: 1;
        }

        .json-node-value.string {
          color: #ce9178;
        }

        .json-node-value.string::before,
        .json-node-value.string::after {
          content: '"';
          color: #d4d4d4;
        }

        .json-node-value.number {
          color: #b5cea8;
        }

        .json-node-value.boolean {
          color: #569cd6;
        }

        .json-node-value.null {
          color: #808080;
        }

        .json-node-value.object,
        .json-node-value.array {
          color: #d4d4d4;
        }

        .json-node-children {
          margin-left: 20px;
          padding-left: 4px;
          border-left: 1px solid var(--border-color);
        }

        .json-node.highlighted .json-node-content {
          background: rgba(255, 215, 0, 0.3);
        }
      `;
      (document as any).head.appendChild(style);
    }
  }

  public render(data: any): void {
    try {
      const jsonData = typeof data === 'string' ? JSON.parse(data) : data;
      this.rootNode = this.parseJSON(jsonData, '', '$');
      this.renderTree();
    } catch (error) {
      this.renderError('Invalid JSON data');
    }
  }

  private parseJSON(value: any, key: string, path: string, parent?: JSONTreeNode): JSONTreeNode {
    const type = this.getValueType(value);
    const node: JSONTreeNode = {
      key,
      value,
      type,
      path,
      isExpanded: type === 'object' || type === 'array' ? false : true,
      parent
    };

    if (type === 'object' && value !== null) {
      node.children = Object.keys(value).map(k => 
        this.parseJSON(value[k], k, `${path}.${k}`, node)
      );
    } else if (type === 'array') {
      node.children = value.map((item: any, index: number) => 
        this.parseJSON(item, `[${index}]`, `${path}[${index}]`, node)
      );
    }

    return node;
  }

  private getValueType(value: any): JSONTreeNode['type'] {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value as JSONTreeNode['type'];
  }

  private renderTree(): void {
    if (!this.rootNode) return;

    this.container.innerHTML = `
      <div class="json-tree-controls">
        <input type="text" class="json-tree-search" placeholder="Search keys and values..." />
        <button class="json-tree-btn" onclick="window.jsonTreeViewer?.expandAll()">Expand All</button>
        <button class="json-tree-btn" onclick="window.jsonTreeViewer?.collapseAll()">Collapse All</button>
        <button class="json-tree-btn" onclick="window.jsonTreeViewer?.copyJSON()">Copy JSON</button>
      </div>
      <div class="json-tree"></div>
    `;

    const treeContainer = this.container.querySelector('.json-tree');
    const searchInput = this.container.querySelector('.json-tree-search');

    // Setup search
    if (searchInput) {
      searchInput.addEventListener('input', (e: any) => {
        this.searchQuery = e.target.value.toLowerCase();
        this.updateSearch();
      });
    }

    // Render the tree
    if (treeContainer && this.rootNode) {
      treeContainer.appendChild(this.renderNode(this.rootNode));
    }

    // Store reference for global access
    (window as any).jsonTreeViewer = this;
  }

  private renderNode(node: JSONTreeNode): any {
    const nodeElement = (document as any).createElement('div');
    nodeElement.className = 'json-node';
    nodeElement.dataset.path = node.path;

    const contentElement = (document as any).createElement('div');
    contentElement.className = 'json-node-content';

    // Toggle button
    if (node.children && node.children.length > 0) {
      const toggleElement = (document as any).createElement('button');
      toggleElement.className = 'json-node-toggle';
      toggleElement.innerHTML = node.isExpanded ? '▼' : '▶';
      toggleElement.onclick = (e: any) => {
        e.stopPropagation();
        this.toggleNode(node);
      };
      contentElement.appendChild(toggleElement);
    } else {
      const spacer = (document as any).createElement('span');
      spacer.style.width = '16px';
      spacer.style.display = 'inline-block';
      contentElement.appendChild(spacer);
    }

    // Key
    if (node.key) {
      const keyElement = (document as any).createElement('span');
      keyElement.className = 'json-node-key';
      keyElement.textContent = node.key;
      contentElement.appendChild(keyElement);

      const colonElement = (document as any).createElement('span');
      colonElement.className = 'json-node-colon';
      colonElement.textContent = ':';
      contentElement.appendChild(colonElement);
    }

    // Value
    const valueElement = (document as any).createElement('span');
    valueElement.className = `json-node-value ${node.type}`;
    valueElement.textContent = this.formatValue(node);
    contentElement.appendChild(valueElement);

    nodeElement.appendChild(contentElement);

    // Children
    if (node.children && node.isExpanded) {
      const childrenElement = (document as any).createElement('div');
      childrenElement.className = 'json-node-children';
      node.children.forEach(child => {
        childrenElement.appendChild(this.renderNode(child));
      });
      nodeElement.appendChild(childrenElement);
    }

    return nodeElement;
  }

  private formatValue(node: JSONTreeNode): string {
    switch (node.type) {
      case 'string':
        return node.value;
      case 'number':
      case 'boolean':
        return String(node.value);
      case 'null':
        return 'null';
      case 'array':
        return `Array(${node.value.length})`;
      case 'object':
        return `{${Object.keys(node.value).length} keys}`;
      default:
        return String(node.value);
    }
  }

  private toggleNode(node: JSONTreeNode): void {
    node.isExpanded = !node.isExpanded;
    this.renderTree();
  }

  public expandAll(): void {
    if (this.rootNode) {
      this.setAllExpanded(this.rootNode, true);
      this.renderTree();
    }
  }

  public collapseAll(): void {
    if (this.rootNode) {
      this.setAllExpanded(this.rootNode, false);
      this.renderTree();
    }
  }

  private setAllExpanded(node: JSONTreeNode, expanded: boolean): void {
    if (node.children) {
      node.isExpanded = expanded;
      node.children.forEach(child => this.setAllExpanded(child, expanded));
    }
  }

  private updateSearch(): void {
    this.filteredNodes.clear();
    if (this.searchQuery && this.rootNode) {
      this.searchNodes(this.rootNode);
      this.renderTree();
    } else {
      this.renderTree();
    }
  }

  private searchNodes(node: JSONTreeNode): boolean {
    let matches = false;

    // Check if current node matches
    const keyMatches = node.key.toLowerCase().includes(this.searchQuery);
    const valueMatches = String(node.value).toLowerCase().includes(this.searchQuery);

    if (keyMatches || valueMatches) {
      this.filteredNodes.add(node.path);
      matches = true;
    }

    // Check children
    if (node.children) {
      for (const child of node.children) {
        if (this.searchNodes(child)) {
          matches = true;
          // Expand parent if child matches
          node.isExpanded = true;
        }
      }
    }

    return matches;
  }

  public copyJSON(): void {
    if (this.rootNode) {
      const text = JSON.stringify(this.rootNode.value, null, 2);
      (navigator as any).clipboard?.writeText(text).then(() => {
        console.log('JSON copied to clipboard');
      }).catch(() => {
        console.log('Failed to copy JSON');
      });
    }
  }

  private renderError(message: string): void {
    this.container.innerHTML = `
      <div class="json-tree" style="color: #ff6b6b; padding: 16px; text-align: center;">
        <strong>Error:</strong> ${message}
      </div>
    `;
  }
}
