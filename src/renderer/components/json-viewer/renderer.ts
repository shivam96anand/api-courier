import { JsonNode } from './types';
import { JsonFormatter } from './formatter';

export class NodeRenderer {
  public static createNodeElement(
    node: JsonNode,
    searchQuery: string,
    searchMatches: any[],
    currentSearchIndex: number
  ): HTMLElement {
    const element = document.createElement('div');
    element.className = `json-node json-node-${node.type}`;
    element.style.paddingLeft = `${node.level * 12 + 8}px`;
    element.dataset.nodeId = `${node.lineNumber}`;

    const isArrayItem = node.parent && node.parent.type === 'array';
    const hasKey = node.key && !isArrayItem;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'node-content';

    if (node.type === 'object' || node.type === 'array') {
      const hasChildren = node.children && node.children.length > 0;
      const expandIcon = hasChildren ? (node.isExpanded ? '▼' : '▶') : '';
      const childrenCount = node.children ? node.children.length : 0;
      const preview = node.isExpanded ? '' : ` (${childrenCount} items)`;

      const keyPart = hasKey ?
        `<span class="key">"${JsonFormatter.highlightSearchTerm(node.key, node.lineNumber, true, searchQuery, searchMatches, currentSearchIndex)}"</span><span class="separator">: </span>` :
        '';

      contentDiv.innerHTML = `
        <span class="expand-icon">${expandIcon}</span>
        ${keyPart}
        <span class="bracket">${node.type === 'array' ? '[' : '{'}</span>
        <span class="preview">${preview}</span>
        ${!node.isExpanded ? `<span class="bracket">${node.type === 'array' ? ']' : '}'}</span>` : ''}
      `;
    } else {
      const displayValue = JsonFormatter.formatValueWithHighlight(
        node.value,
        node.type,
        node.lineNumber,
        searchQuery,
        searchMatches,
        currentSearchIndex
      );
      const keyPart = hasKey ?
        `<span class="key">"${JsonFormatter.highlightSearchTerm(node.key, node.lineNumber, true, searchQuery, searchMatches, currentSearchIndex)}"</span><span class="separator">: </span>` :
        '';

      contentDiv.innerHTML = `
        <span class="expand-icon"></span>
        ${keyPart}
        <span class="value value-${node.type}">${displayValue}</span>
      `;
    }

    element.appendChild(contentDiv);
    return element;
  }

  public static createClosingBracketElement(node: JsonNode): HTMLElement {
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

  public static renderNodesOptimized(
    container: HTMLElement,
    visibleNodes: Array<{node?: JsonNode, isClosingBracket: boolean}>,
    searchQuery: string,
    searchMatches: any[],
    currentSearchIndex: number
  ): void {
    // Always render synchronously to avoid scroll position issues
    // For very large datasets (>5000 nodes), we could consider chunked rendering
    // but 602 nodes is not large enough to need it
    const fragment = document.createDocumentFragment();

    visibleNodes.forEach(nodeData => {
      if (nodeData.isClosingBracket) {
        const closingElement = this.createClosingBracketElement(nodeData.node!);
        fragment.appendChild(closingElement);
      } else {
        const nodeElement = this.createNodeElement(nodeData.node!, searchQuery, searchMatches, currentSearchIndex);
        fragment.appendChild(nodeElement);
      }
    });

    container.innerHTML = '';
    container.appendChild(fragment);
  }

  // Keep this for potential future use with very large datasets
  private static renderNodesInChunks(
    container: HTMLElement,
    visibleNodes: Array<{node?: JsonNode, isClosingBracket: boolean}>,
    searchQuery: string,
    searchMatches: any[],
    currentSearchIndex: number
  ): void {
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
          const nodeElement = this.createNodeElement(nodeData.node!, searchQuery, searchMatches, currentSearchIndex);
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
}