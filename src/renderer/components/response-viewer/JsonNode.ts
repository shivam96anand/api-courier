/**
 * JSON node renderer with type badges, actions, and search highlighting
 */

import { JsonNode, JsonValueType, SearchMatch, VIEWER_CLASSES } from './types';
import { ViewerStateManager } from './viewerState';
import { JsonUtils } from './utils/json';

export interface JsonNodeRendererOptions {
  stateManager: ViewerStateManager;
  onToggle?: (nodeId: string) => void;
  onSelect?: (nodeId: string) => void;
  onAction?: (nodeId: string, action: string, data?: any) => void;
}

export interface JsonNodeRenderContext {
  searchMatches: SearchMatch[];
  isSelected: boolean;
  showTypes: boolean;
}

export class JsonNodeRenderer {
  private stateManager: ViewerStateManager;
  private options: JsonNodeRendererOptions;
  private actionMenus = new Map<string, HTMLElement>();

  constructor(options: JsonNodeRendererOptions) {
    this.options = options;
    this.stateManager = options.stateManager;
    this.setupGlobalEventListeners();
  }

  private setupGlobalEventListeners(): void {
    // Close action menus when clicking outside
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.json-node-actions')) {
        this.closeAllActionMenus();
      }
    });
  }

  public render(node: JsonNode, context: JsonNodeRenderContext): HTMLElement {
    const element = document.createElement('div');
    element.className = this.getNodeClasses(node, context);
    element.style.paddingLeft = `${node.level * 16 + 8}px`;
    element.dataset.nodeId = node.id;
    element.dataset.nodeType = node.type;

    // Main content container
    const contentContainer = document.createElement('div');
    contentContainer.className = 'json-node-content';

    // Expand/collapse icon
    const expandIcon = this.createExpandIcon(node);
    contentContainer.appendChild(expandIcon);

    // Key part
    if (this.shouldShowKey(node)) {
      const keyElement = this.createKeyElement(node, context);
      contentContainer.appendChild(keyElement);

      const separator = document.createElement('span');
      separator.className = 'json-node-separator';
      separator.textContent = ': ';
      contentContainer.appendChild(separator);
    }

    // Value part
    const valueElement = this.createValueElement(node, context);
    contentContainer.appendChild(valueElement);

    // Type badge
    if (context.showTypes) {
      const typeBadge = this.createTypeBadge(node);
      contentContainer.appendChild(typeBadge);
    }

    // Actions menu
    const actionsElement = this.createActionsElement(node);
    contentContainer.appendChild(actionsElement);

    element.appendChild(contentContainer);

    // Add event listeners
    this.attachEventListeners(element, node);

    return element;
  }

  private getNodeClasses(node: JsonNode, context: JsonNodeRenderContext): string {
    const classes = [VIEWER_CLASSES.node, `json-node--${node.type}`];

    if (context.isSelected) {
      classes.push('json-node--selected');
    }

    if (node.hasChildren) {
      classes.push(node.isExpanded ? VIEWER_CLASSES.nodeExpanded : VIEWER_CLASSES.nodeCollapsed);
    }

    if (context.searchMatches.length > 0) {
      classes.push('json-node--has-matches');
    }

    return classes.join(' ');
  }

  private createExpandIcon(node: JsonNode): HTMLElement {
    const icon = document.createElement('span');
    icon.className = 'json-node-expand';

    if (node.hasChildren) {
      icon.textContent = node.isExpanded ? '▼' : '▶';
      icon.style.cursor = 'pointer';
      icon.style.userSelect = 'none';
      icon.style.minWidth = '12px';
      icon.style.display = 'inline-block';
      icon.style.color = 'var(--text-secondary, #666)';
    } else {
      icon.style.minWidth = '12px';
      icon.style.display = 'inline-block';
    }

    return icon;
  }

  private shouldShowKey(node: JsonNode): boolean {
    // Don't show key for root node or array items that are just indices
    if (node.level === 0) return false;
    if (node.parent?.type === 'array' && /^\[\d+\]$/.test(node.key)) return false;
    return node.key.length > 0;
  }

  private createKeyElement(node: JsonNode, context: JsonNodeRenderContext): HTMLElement {
    const keyElement = document.createElement('span');
    keyElement.className = VIEWER_CLASSES.nodeKey;

    const displayKey = node.parent?.type === 'array' ? node.key : `"${node.key}"`;
    const highlightedKey = this.highlightSearchMatches(
      displayKey,
      context.searchMatches.filter(m => m.isKey)
    );

    keyElement.innerHTML = highlightedKey;
    keyElement.style.color = 'var(--json-key-color, #0451a5)';
    keyElement.style.fontWeight = '600';

    return keyElement;
  }

  private createValueElement(node: JsonNode, context: JsonNodeRenderContext): HTMLElement {
    const valueElement = document.createElement('span');
    valueElement.className = VIEWER_CLASSES.nodeValue;

    let displayValue: string;
    let preview = '';

    if (node.type === 'object' || node.type === 'array') {
      const bracket = node.type === 'array' ? '[' : '{';
      const closeBracket = node.type === 'array' ? ']' : '}';

      if (node.isExpanded) {
        displayValue = bracket;
      } else {
        preview = node.childCount > 0 ? ` ${node.childCount} ${node.childCount === 1 ? 'item' : 'items'} ` : ' ';
        displayValue = `${bracket}${preview}${closeBracket}`;
      }
    } else {
      displayValue = JsonUtils.formatDisplayValue(node.value, node.type);
    }

    // Apply search highlighting for value matches
    const valueMatches = context.searchMatches.filter(m => !m.isKey);
    const highlightedValue = this.highlightSearchMatches(displayValue, valueMatches);

    valueElement.innerHTML = highlightedValue;
    valueElement.style.color = this.getValueColor(node.type);

    return valueElement;
  }

  private getValueColor(type: JsonValueType): string {
    const colors = {
      string: 'var(--json-string-color, #d73a49)',
      number: 'var(--json-number-color, #005cc5)',
      boolean: 'var(--json-boolean-color, #d73a49)',
      null: 'var(--json-null-color, #6f42c1)',
      object: 'var(--json-bracket-color, #24292e)',
      array: 'var(--json-bracket-color, #24292e)',
    };
    return colors[type] || 'var(--text-primary, #333)';
  }

  private createTypeBadge(node: JsonNode): HTMLElement {
    const badge = document.createElement('span');
    badge.className = 'json-node-type';
    badge.textContent = node.type;
    badge.style.cssText = `
      margin-left: 8px;
      padding: 1px 6px;
      border-radius: 3px;
      font-size: 10px;
      font-weight: 500;
      background: ${this.getTypeBadgeColor(node.type)};
      color: #fff;
      text-transform: uppercase;
    `;

    return badge;
  }

  private getTypeBadgeColor(type: JsonValueType): string {
    const colors = {
      string: '#28a745',
      number: '#007bff',
      boolean: '#ffc107',
      null: '#6c757d',
      object: '#17a2b8',
      array: '#e83e8c',
    };
    return colors[type] || '#6c757d';
  }

  private createActionsElement(node: JsonNode): HTMLElement {
    const actions = document.createElement('div');
    actions.className = 'json-node-actions';
    actions.style.cssText = `
      display: inline-block;
      margin-left: 8px;
      position: relative;
      opacity: 0;
      transition: opacity 0.2s;
    `;

    const trigger = document.createElement('button');
    trigger.className = 'json-node-actions-trigger';
    trigger.textContent = '•••';
    trigger.style.cssText = `
      background: none;
      border: none;
      padding: 2px 6px;
      cursor: pointer;
      border-radius: 3px;
      font-size: 12px;
      color: var(--text-secondary, #666);
    `;

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleActionMenu(node.id, actions);
    });

    actions.appendChild(trigger);
    return actions;
  }

  private toggleActionMenu(nodeId: string, container: HTMLElement): void {
    // Close other menus
    this.closeAllActionMenus();

    const existingMenu = this.actionMenus.get(nodeId);
    if (existingMenu) {
      this.closeActionMenu(nodeId);
      return;
    }

    const menu = this.createActionMenu(nodeId);
    container.appendChild(menu);
    this.actionMenus.set(nodeId, menu);

    // Position menu
    this.positionActionMenu(menu, container);
  }

  private createActionMenu(nodeId: string): HTMLElement {
    const menu = document.createElement('div');
    menu.className = 'json-node-actions-menu';
    menu.style.cssText = `
      position: absolute;
      top: 100%;
      right: 0;
      background: var(--bg-primary, #fff);
      border: 1px solid var(--border-color, #e0e0e0);
      border-radius: 6px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.15);
      z-index: 1000;
      min-width: 150px;
      padding: 4px 0;
    `;

    const actions = this.getAvailableActions(nodeId);
    actions.forEach(action => {
      const item = document.createElement('button');
      item.className = 'json-node-actions-item';
      item.textContent = action.label;
      item.style.cssText = `
        display: block;
        width: 100%;
        padding: 6px 12px;
        border: none;
        background: none;
        text-align: left;
        cursor: pointer;
        font-size: 12px;
        color: var(--text-primary, #333);
      `;

      item.addEventListener('click', (e) => {
        e.stopPropagation();
        this.handleActionClick(nodeId, action.id, action.data);
        this.closeActionMenu(nodeId);
      });

      item.addEventListener('mouseenter', () => {
        item.style.background = 'var(--bg-secondary, #f5f5f5)';
      });

      item.addEventListener('mouseleave', () => {
        item.style.background = 'none';
      });

      menu.appendChild(item);
    });

    return menu;
  }

  private getAvailableActions(nodeId: string): Array<{ id: string; label: string; data?: any }> {
    const node = this.findNode(nodeId);
    if (!node) return [];

    const actions = [
      { id: 'copy-value', label: 'Copy Value' },
      { id: 'copy-path', label: 'Copy Path' },
      { id: 'copy-jsonpath', label: 'Copy JSONPath' },
    ];

    if (node.key && node.level > 0) {
      actions.unshift({ id: 'copy-key', label: 'Copy Key' });
    }

    if (node.hasChildren) {
      actions.push(
        { id: 'expand-all', label: 'Expand All Children' },
        { id: 'collapse-all', label: 'Collapse All Children' }
      );
    }

    return actions;
  }

  private findNode(nodeId: string): JsonNode | null {
    // This would need to be provided by the parent tree component
    // For now, we'll stub this
    return null;
  }

  private handleActionClick(nodeId: string, actionId: string, data?: any): void {
    this.options.onAction?.(nodeId, actionId, data);
  }

  private positionActionMenu(menu: HTMLElement, container: HTMLElement): void {
    const rect = container.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Adjust horizontal position if menu would go off screen
    if (rect.right + menuRect.width > viewportWidth) {
      menu.style.right = '0';
      menu.style.left = 'auto';
    }

    // Adjust vertical position if menu would go off screen
    if (rect.bottom + menuRect.height > viewportHeight) {
      menu.style.top = 'auto';
      menu.style.bottom = '100%';
    }
  }

  private closeActionMenu(nodeId: string): void {
    const menu = this.actionMenus.get(nodeId);
    if (menu) {
      menu.remove();
      this.actionMenus.delete(nodeId);
    }
  }

  private closeAllActionMenus(): void {
    this.actionMenus.forEach((menu, nodeId) => {
      menu.remove();
    });
    this.actionMenus.clear();
  }

  private highlightSearchMatches(text: string, matches: SearchMatch[]): string {
    if (matches.length === 0) return JsonUtils.escapeHtml(text);

    let result = '';
    let lastIndex = 0;

    // Sort matches by start index
    const sortedMatches = [...matches].sort((a, b) => a.startIndex - b.startIndex);

    sortedMatches.forEach((match, index) => {
      // Add text before the match
      result += JsonUtils.escapeHtml(text.substring(lastIndex, match.startIndex));

      // Add highlighted match
      const matchText = text.substring(match.startIndex, match.endIndex);
      const isActive = index === 0; // For simplicity, highlight first match as active
      const className = isActive ?
        `${VIEWER_CLASSES.searchHighlight} ${VIEWER_CLASSES.searchActive}` :
        VIEWER_CLASSES.searchHighlight;

      result += `<span class="${className}">${JsonUtils.escapeHtml(matchText)}</span>`;

      lastIndex = match.endIndex;
    });

    // Add remaining text
    result += JsonUtils.escapeHtml(text.substring(lastIndex));

    return result;
  }

  private attachEventListeners(element: HTMLElement, node: JsonNode): void {
    // Toggle expansion on expand icon or bracket click
    const expandIcon = element.querySelector('.json-node-expand');
    if (expandIcon && node.hasChildren) {
      expandIcon.addEventListener('click', (e) => {
        e.stopPropagation();
        this.options.onToggle?.(node.id);
      });
    }

    // Node selection on click
    element.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.json-node-actions')) {
        return; // Don't select when clicking actions
      }
      this.options.onSelect?.(node.id);
    });

    // Show actions on hover
    element.addEventListener('mouseenter', () => {
      const actions = element.querySelector('.json-node-actions') as HTMLElement;
      if (actions) {
        actions.style.opacity = '1';
      }
    });

    element.addEventListener('mouseleave', () => {
      const actions = element.querySelector('.json-node-actions') as HTMLElement;
      if (actions && !this.actionMenus.has(node.id)) {
        actions.style.opacity = '0';
      }
    });

    // Context menu
    element.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const actions = element.querySelector('.json-node-actions') as HTMLElement;
      if (actions) {
        this.toggleActionMenu(node.id, actions);
      }
    });
  }

  public destroy(): void {
    this.closeAllActionMenus();
  }
}