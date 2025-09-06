// Simple JSON Tree Viewer for API Courier
// This file provides JSON visualization without ES6 imports

(function() {
  'use strict';

  // JSON Tree Viewer Class
  function JSONTreeViewer(container) {
    this.container = container;
    this.rootNode = null;
    this.searchQuery = '';
    this.filteredNodes = new Set();
    this.setupStyles();
  }

  JSONTreeViewer.prototype.setupStyles = function() {
    if (document.getElementById('json-tree-styles')) return;
    
    const style = document.createElement('style');
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
    `;
    document.head.appendChild(style);
  };

  JSONTreeViewer.prototype.render = function(data) {
    try {
      const jsonData = typeof data === 'string' ? JSON.parse(data) : data;
      this.rootNode = this.parseJSON(jsonData, '', '$');
      this.renderTree();
    } catch (error) {
      this.renderError('Invalid JSON data');
    }
  };

  JSONTreeViewer.prototype.parseJSON = function(value, key, path, parent) {
    const type = this.getValueType(value);
    const node = {
      key: key,
      value: value,
      type: type,
      path: path,
      isExpanded: type === 'object' || type === 'array' ? false : true,
      parent: parent,
      children: null
    };

    if (type === 'object' && value !== null) {
      node.children = [];
      for (const k in value) {
        if (value.hasOwnProperty(k)) {
          node.children.push(this.parseJSON(value[k], k, path + '.' + k, node));
        }
      }
    } else if (type === 'array') {
      node.children = [];
      for (let i = 0; i < value.length; i++) {
        node.children.push(this.parseJSON(value[i], '[' + i + ']', path + '[' + i + ']', node));
      }
    }

    return node;
  };

  JSONTreeViewer.prototype.getValueType = function(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
  };

  JSONTreeViewer.prototype.renderTree = function() {
    if (!this.rootNode) return;

    const self = this;
    this.container.innerHTML = `
      <div class="json-tree-controls">
        <input type="text" class="json-tree-search" placeholder="Search keys and values..." />
        <button class="json-tree-btn" onclick="window.jsonTreeExpand()">Expand All</button>
        <button class="json-tree-btn" onclick="window.jsonTreeCollapse()">Collapse All</button>
        <button class="json-tree-btn" onclick="window.jsonTreeCopy()">Copy JSON</button>
      </div>
      <div class="json-tree"></div>
    `;

    const treeContainer = this.container.querySelector('.json-tree');
    const searchInput = this.container.querySelector('.json-tree-search');

    if (searchInput) {
      searchInput.addEventListener('input', function(e) {
        self.searchQuery = e.target.value.toLowerCase();
        self.updateSearch();
      });
    }

    if (treeContainer && this.rootNode) {
      treeContainer.appendChild(this.renderNode(this.rootNode));
    }

    // Store reference for global access
    window.jsonTreeViewerInstance = this;
  };

  JSONTreeViewer.prototype.renderNode = function(node) {
    const self = this;
    const nodeElement = document.createElement('div');
    nodeElement.className = 'json-node';
    nodeElement.dataset.path = node.path;

    const contentElement = document.createElement('div');
    contentElement.className = 'json-node-content';

    // Toggle button
    if (node.children && node.children.length > 0) {
      const toggleElement = document.createElement('button');
      toggleElement.className = 'json-node-toggle';
      toggleElement.innerHTML = node.isExpanded ? '▼' : '▶';
      toggleElement.onclick = function(e) {
        e.stopPropagation();
        self.toggleNode(node);
      };
      contentElement.appendChild(toggleElement);
    } else {
      const spacer = document.createElement('span');
      spacer.style.width = '16px';
      spacer.style.display = 'inline-block';
      contentElement.appendChild(spacer);
    }

    // Key
    if (node.key) {
      const keyElement = document.createElement('span');
      keyElement.className = 'json-node-key';
      keyElement.textContent = node.key;
      contentElement.appendChild(keyElement);

      const colonElement = document.createElement('span');
      colonElement.className = 'json-node-colon';
      colonElement.textContent = ':';
      contentElement.appendChild(colonElement);
    }

    // Value
    const valueElement = document.createElement('span');
    valueElement.className = 'json-node-value ' + node.type;
    valueElement.textContent = this.formatValue(node);
    contentElement.appendChild(valueElement);

    nodeElement.appendChild(contentElement);

    // Children
    if (node.children && node.isExpanded) {
      const childrenElement = document.createElement('div');
      childrenElement.className = 'json-node-children';
      for (let i = 0; i < node.children.length; i++) {
        childrenElement.appendChild(this.renderNode(node.children[i]));
      }
      nodeElement.appendChild(childrenElement);
    }

    return nodeElement;
  };

  JSONTreeViewer.prototype.formatValue = function(node) {
    switch (node.type) {
      case 'string':
        return node.value;
      case 'number':
      case 'boolean':
        return String(node.value);
      case 'null':
        return 'null';
      case 'array':
        return 'Array(' + node.value.length + ')';
      case 'object':
        return '{' + Object.keys(node.value).length + ' keys}';
      default:
        return String(node.value);
    }
  };

  JSONTreeViewer.prototype.toggleNode = function(node) {
    node.isExpanded = !node.isExpanded;
    this.renderTree();
  };

  JSONTreeViewer.prototype.expandAll = function() {
    if (this.rootNode) {
      this.setAllExpanded(this.rootNode, true);
      this.renderTree();
    }
  };

  JSONTreeViewer.prototype.collapseAll = function() {
    if (this.rootNode) {
      this.setAllExpanded(this.rootNode, false);
      this.renderTree();
    }
  };

  JSONTreeViewer.prototype.setAllExpanded = function(node, expanded) {
    if (node.children) {
      node.isExpanded = expanded;
      for (let i = 0; i < node.children.length; i++) {
        this.setAllExpanded(node.children[i], expanded);
      }
    }
  };

  JSONTreeViewer.prototype.updateSearch = function() {
    this.filteredNodes = new Set();
    if (this.searchQuery && this.rootNode) {
      this.searchNodes(this.rootNode);
    }
    this.renderTree();
  };

  JSONTreeViewer.prototype.searchNodes = function(node) {
    let matches = false;
    
    const keyMatches = node.key.toLowerCase().indexOf(this.searchQuery) !== -1;
    const valueMatches = String(node.value).toLowerCase().indexOf(this.searchQuery) !== -1;

    if (keyMatches || valueMatches) {
      this.filteredNodes.add(node.path);
      matches = true;
    }

    if (node.children) {
      for (let i = 0; i < node.children.length; i++) {
        if (this.searchNodes(node.children[i])) {
          matches = true;
          node.isExpanded = true;
        }
      }
    }

    return matches;
  };

  JSONTreeViewer.prototype.copyJSON = function() {
    if (this.rootNode && navigator.clipboard) {
      const text = JSON.stringify(this.rootNode.value, null, 2);
      navigator.clipboard.writeText(text).then(function() {
        console.log('JSON copied to clipboard');
      }).catch(function() {
        console.log('Failed to copy JSON');
      });
    }
  };

  JSONTreeViewer.prototype.renderError = function(message) {
    this.container.innerHTML = `
      <div class="json-tree" style="color: #ff6b6b; padding: 16px; text-align: center;">
        <strong>Error:</strong> ${message}
      </div>
    `;
  };

  // Global functions for button callbacks
  window.jsonTreeExpand = function() {
    if (window.jsonTreeViewerInstance) {
      window.jsonTreeViewerInstance.expandAll();
    }
  };

  window.jsonTreeCollapse = function() {
    if (window.jsonTreeViewerInstance) {
      window.jsonTreeViewerInstance.collapseAll();
    }
  };

  window.jsonTreeCopy = function() {
    if (window.jsonTreeViewerInstance) {
      window.jsonTreeViewerInstance.copyJSON();
    }
  };

  // Expose JSONTreeViewer to global scope
  window.JSONTreeViewer = JSONTreeViewer;

})();
