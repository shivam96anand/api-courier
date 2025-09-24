/**
 * Toolbar component with all viewer controls and keyboard shortcuts
 */

import { ViewerTab, ViewerEvents, VIEWER_CONSTANTS, VIEWER_CLASSES } from './types';
import { ViewerStateManager } from './viewerState';

export interface ToolbarOptions {
  container: HTMLElement;
  stateManager: ViewerStateManager;
  onTabChange?: (tab: ViewerTab) => void;
  onFormat?: () => void;
  onMinify?: () => void;
  onExpandAll?: () => void;
  onCollapseAll?: () => void;
  onToggleWrap?: () => void;
  onToggleTypes?: () => void;
  onSearch?: () => void;
  onFullscreen?: () => void;
  onCopy?: () => void;
  onExport?: () => void;
  onFontSizeChange?: (size: number) => void;
}

export interface ToolbarHandle {
  setActiveTab: (tab: ViewerTab) => void;
  updateSearchResults: (current: number, total: number) => void;
  setFormatEnabled: (enabled: boolean) => void;
  destroy: () => void;
}

export class Toolbar implements ToolbarHandle {
  private container: HTMLElement;
  private stateManager: ViewerStateManager;
  private options: ToolbarOptions;
  private elements: Map<string, HTMLElement> = new Map();
  private keyboardShortcuts: Map<string, () => void> = new Map();

  constructor(options: ToolbarOptions) {
    this.options = options;
    this.container = options.container;
    this.stateManager = options.stateManager;

    this.render();
    this.setupKeyboardShortcuts();
    this.attachEventListeners();
  }

  private render(): void {
    this.container.className = `${VIEWER_CLASSES.toolbar} json-viewer-toolbar`;
    this.container.innerHTML = '';

    // Create toolbar sections
    const leftSection = this.createSection('toolbar-left');
    const centerSection = this.createSection('toolbar-center');
    const rightSection = this.createSection('toolbar-right');

    // Tab selector
    leftSection.appendChild(this.createTabSelector());

    // Main actions (center)
    centerSection.appendChild(this.createActionsGroup());

    // Settings and utilities (right)
    rightSection.appendChild(this.createSettingsGroup());

    this.container.appendChild(leftSection);
    this.container.appendChild(centerSection);
    this.container.appendChild(rightSection);

    this.applyStyles();
  }

  private createSection(className: string): HTMLElement {
    const section = document.createElement('div');
    section.className = `toolbar-section ${className}`;
    return section;
  }

  private createTabSelector(): HTMLElement {
    const tabContainer = document.createElement('div');
    tabContainer.className = 'toolbar-tabs';

    const tabs: Array<{ id: ViewerTab; label: string; icon: string }> = [
      { id: 'pretty', label: 'Pretty', icon: '🌳' },
      { id: 'raw', label: 'Raw', icon: '📝' },
      { id: 'headers', label: 'Headers', icon: '📋' },
    ];

    tabs.forEach(tab => {
      const button = this.createTabButton(tab);
      tabContainer.appendChild(button);
      this.elements.set(`tab-${tab.id}`, button);
    });

    return tabContainer;
  }

  private createTabButton(tab: { id: ViewerTab; label: string; icon: string }): HTMLElement {
    const button = document.createElement('button');
    button.className = 'toolbar-tab';
    button.dataset.tab = tab.id;

    const icon = document.createElement('span');
    icon.className = 'tab-icon';
    icon.textContent = tab.icon;

    const label = document.createElement('span');
    label.className = 'tab-label';
    label.textContent = tab.label;

    button.appendChild(icon);
    button.appendChild(label);

    button.addEventListener('click', () => {
      this.setActiveTab(tab.id);
      this.options.onTabChange?.(tab.id);
    });

    return button;
  }

  private createActionsGroup(): HTMLElement {
    const group = document.createElement('div');
    group.className = 'toolbar-actions';

    const actions = [
      { id: 'format', label: 'Format', icon: '✨', shortcut: 'Ctrl+B', handler: () => this.options.onFormat?.() },
      { id: 'minify', label: 'Minify', icon: '📦', shortcut: 'Ctrl+M', handler: () => this.options.onMinify?.() },
      { id: 'expand', label: 'Expand All', icon: '📂', shortcut: 'Ctrl+E', handler: () => this.options.onExpandAll?.() },
      { id: 'collapse', label: 'Collapse All', icon: '📁', shortcut: 'Ctrl+Shift+E', handler: () => this.options.onCollapseAll?.() },
      { id: 'search', label: 'Search', icon: '🔍', shortcut: 'Ctrl+F', handler: () => this.options.onSearch?.() },
    ];

    actions.forEach(action => {
      const button = this.createActionButton(action);
      group.appendChild(button);
      this.elements.set(action.id, button);
    });

    return group;
  }

  private createActionButton(action: {
    id: string;
    label: string;
    icon: string;
    shortcut: string;
    handler: () => void;
  }): HTMLElement {
    const button = document.createElement('button');
    button.className = 'toolbar-button';
    button.dataset.action = action.id;
    button.title = `${action.label} (${action.shortcut})`;

    const icon = document.createElement('span');
    icon.className = 'button-icon';
    icon.textContent = action.icon;

    const label = document.createElement('span');
    label.className = 'button-label';
    label.textContent = action.label;

    button.appendChild(icon);
    button.appendChild(label);

    button.addEventListener('click', action.handler);

    return button;
  }

  private createSettingsGroup(): HTMLElement {
    const group = document.createElement('div');
    group.className = 'toolbar-settings';

    // Font size controls
    const fontSizeContainer = this.createFontSizeControls();
    group.appendChild(fontSizeContainer);

    // Toggle controls
    const togglesContainer = this.createToggleControls();
    group.appendChild(togglesContainer);

    // More actions dropdown
    const moreActionsContainer = this.createMoreActionsDropdown();
    group.appendChild(moreActionsContainer);

    return group;
  }

  private createFontSizeControls(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'font-size-controls';

    const decreaseButton = document.createElement('button');
    decreaseButton.className = 'font-size-btn';
    decreaseButton.textContent = 'A-';
    decreaseButton.title = 'Decrease font size';
    decreaseButton.addEventListener('click', () => this.changeFontSize(-1));

    const sizeDisplay = document.createElement('span');
    sizeDisplay.className = 'font-size-display';
    sizeDisplay.textContent = `${this.stateManager.getFontSize()}px`;
    this.elements.set('font-size-display', sizeDisplay);

    const increaseButton = document.createElement('button');
    increaseButton.className = 'font-size-btn';
    increaseButton.textContent = 'A+';
    increaseButton.title = 'Increase font size';
    increaseButton.addEventListener('click', () => this.changeFontSize(1));

    container.appendChild(decreaseButton);
    container.appendChild(sizeDisplay);
    container.appendChild(increaseButton);

    return container;
  }

  private createToggleControls(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'toggle-controls';

    // Word wrap toggle
    const wrapToggle = this.createToggleButton(
      'wrap',
      '🔄',
      'Toggle word wrap (Ctrl+W)',
      this.stateManager.getState().rawEditor.wrapText,
      () => {
        this.options.onToggleWrap?.();
        this.updateToggleState('wrap', this.stateManager.getState().rawEditor.wrapText);
      }
    );

    // Type badges toggle
    const typesToggle = this.createToggleButton(
      'types',
      '🏷️',
      'Toggle type badges',
      this.stateManager.getState().prettyView.showTypes,
      () => {
        this.options.onToggleTypes?.();
        this.updateToggleState('types', this.stateManager.getState().prettyView.showTypes);
      }
    );

    container.appendChild(wrapToggle);
    container.appendChild(typesToggle);

    return container;
  }

  private createToggleButton(
    id: string,
    icon: string,
    title: string,
    active: boolean,
    handler: () => void
  ): HTMLElement {
    const button = document.createElement('button');
    button.className = `toolbar-toggle ${active ? 'active' : ''}`;
    button.dataset.toggle = id;
    button.title = title;
    button.textContent = icon;
    button.addEventListener('click', handler);

    this.elements.set(`toggle-${id}`, button);
    return button;
  }

  private createMoreActionsDropdown(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'more-actions';

    const trigger = document.createElement('button');
    trigger.className = 'toolbar-button more-trigger';
    trigger.textContent = '⋯';
    trigger.title = 'More actions';

    const dropdown = document.createElement('div');
    dropdown.className = 'more-dropdown';
    dropdown.style.display = 'none';

    const actions = [
      { id: 'copy', label: 'Copy JSON', icon: '📋', handler: () => this.options.onCopy?.() },
      { id: 'export', label: 'Export...', icon: '💾', handler: () => this.options.onExport?.() },
      { id: 'fullscreen', label: 'Fullscreen', icon: '🔍', handler: () => this.options.onFullscreen?.() },
    ];

    actions.forEach(action => {
      const item = document.createElement('button');
      item.className = 'dropdown-item';
      item.innerHTML = `<span class="item-icon">${action.icon}</span><span class="item-label">${action.label}</span>`;
      item.addEventListener('click', () => {
        action.handler();
        this.hideDropdown();
      });
      dropdown.appendChild(item);
    });

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleDropdown();
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', () => this.hideDropdown());

    container.appendChild(trigger);
    container.appendChild(dropdown);
    this.elements.set('more-dropdown', dropdown);

    return container;
  }

  private setupKeyboardShortcuts(): void {
    const shortcuts = [
      { key: 'Control+f', mac: 'Meta+f', action: () => this.options.onSearch?.() },
      { key: 'Control+b', mac: 'Meta+b', action: () => this.options.onFormat?.() },
      { key: 'Control+m', mac: 'Meta+m', action: () => this.options.onMinify?.() },
      { key: 'Control+w', mac: 'Meta+w', action: () => this.options.onToggleWrap?.() },
      { key: 'Control+e', mac: 'Meta+e', action: () => this.options.onExpandAll?.() },
      { key: 'Control+Shift+e', mac: 'Meta+Shift+e', action: () => this.options.onCollapseAll?.() },
      { key: 'Control+=', mac: 'Meta+=', action: () => this.changeFontSize(1) },
      { key: 'Control+-', mac: 'Meta+-', action: () => this.changeFontSize(-1) },
      { key: 'F11', action: () => this.options.onFullscreen?.() },
    ];

    shortcuts.forEach(shortcut => {
      const key = navigator.platform.includes('Mac') ? (shortcut.mac || shortcut.key) : shortcut.key;
      this.keyboardShortcuts.set(key.toLowerCase(), shortcut.action);
    });
  }

  private attachEventListeners(): void {
    document.addEventListener('keydown', this.handleKeydown.bind(this));
  }

  private handleKeydown(e: KeyboardEvent): void {
    const key = this.getKeyString(e);
    const handler = this.keyboardShortcuts.get(key);

    if (handler) {
      e.preventDefault();
      handler();
    }
  }

  private getKeyString(e: KeyboardEvent): string {
    const parts = [];

    if (e.ctrlKey || e.metaKey) parts.push(navigator.platform.includes('Mac') ? 'Meta' : 'Control');
    if (e.shiftKey) parts.push('Shift');
    if (e.altKey) parts.push('Alt');

    parts.push(e.key);

    return parts.join('+').toLowerCase();
  }

  private changeFontSize(delta: number): void {
    const currentSize = this.stateManager.getFontSize();
    const newSize = Math.max(
      VIEWER_CONSTANTS.MIN_FONT_SIZE,
      Math.min(VIEWER_CONSTANTS.MAX_FONT_SIZE, currentSize + delta)
    );

    if (newSize !== currentSize) {
      this.stateManager.setFontSize(newSize);
      this.updateFontSizeDisplay(newSize);
      this.options.onFontSizeChange?.(newSize);
    }
  }

  private updateFontSizeDisplay(size: number): void {
    const display = this.elements.get('font-size-display');
    if (display) {
      display.textContent = `${size}px`;
    }
  }

  private updateToggleState(toggleId: string, active: boolean): void {
    const toggle = this.elements.get(`toggle-${toggleId}`);
    if (toggle) {
      toggle.classList.toggle('active', active);
    }
  }

  private toggleDropdown(): void {
    const dropdown = this.elements.get('more-dropdown');
    if (dropdown) {
      const isVisible = dropdown.style.display !== 'none';
      dropdown.style.display = isVisible ? 'none' : 'block';
    }
  }

  private hideDropdown(): void {
    const dropdown = this.elements.get('more-dropdown');
    if (dropdown) {
      dropdown.style.display = 'none';
    }
  }

  private applyStyles(): void {
    const style = document.createElement('style');
    style.textContent = `
      .json-viewer-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px;
        background: var(--bg-secondary, #f8f9fa);
        border-bottom: 1px solid var(--border-color, #e0e0e0);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 13px;
        user-select: none;
      }

      .toolbar-section {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .toolbar-tabs {
        display: flex;
        gap: 2px;
        background: var(--bg-primary, #fff);
        border: 1px solid var(--border-color, #e0e0e0);
        border-radius: 6px;
        overflow: hidden;
      }

      .toolbar-tab {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 6px 12px;
        background: none;
        border: none;
        cursor: pointer;
        font-size: 12px;
        transition: background-color 0.2s;
      }

      .toolbar-tab:hover {
        background: var(--bg-secondary, #f8f9fa);
      }

      .toolbar-tab.active {
        background: var(--primary-color, #007bff);
        color: white;
      }

      .tab-icon {
        font-size: 14px;
      }

      .toolbar-actions {
        display: flex;
        gap: 4px;
      }

      .toolbar-button {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 6px 8px;
        background: var(--bg-primary, #fff);
        border: 1px solid var(--border-color, #e0e0e0);
        border-radius: 4px;
        cursor: pointer;
        font-size: 11px;
        transition: all 0.2s;
      }

      .toolbar-button:hover {
        background: var(--bg-secondary, #f8f9fa);
        border-color: var(--border-hover, #ccc);
      }

      .toolbar-button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .button-icon {
        font-size: 12px;
      }

      .font-size-controls {
        display: flex;
        align-items: center;
        gap: 2px;
        background: var(--bg-primary, #fff);
        border: 1px solid var(--border-color, #e0e0e0);
        border-radius: 4px;
        overflow: hidden;
      }

      .font-size-btn {
        padding: 4px 6px;
        background: none;
        border: none;
        cursor: pointer;
        font-size: 10px;
        font-weight: bold;
      }

      .font-size-btn:hover {
        background: var(--bg-secondary, #f8f9fa);
      }

      .font-size-display {
        padding: 4px 8px;
        font-size: 10px;
        font-weight: 500;
        border-left: 1px solid var(--border-color, #e0e0e0);
        border-right: 1px solid var(--border-color, #e0e0e0);
        min-width: 32px;
        text-align: center;
      }

      .toggle-controls {
        display: flex;
        gap: 2px;
      }

      .toolbar-toggle {
        padding: 6px 8px;
        background: var(--bg-primary, #fff);
        border: 1px solid var(--border-color, #e0e0e0);
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        transition: all 0.2s;
      }

      .toolbar-toggle:hover {
        background: var(--bg-secondary, #f8f9fa);
      }

      .toolbar-toggle.active {
        background: var(--primary-color, #007bff);
        color: white;
        border-color: var(--primary-color, #007bff);
      }

      .more-actions {
        position: relative;
      }

      .more-trigger {
        font-weight: bold;
      }

      .more-dropdown {
        position: absolute;
        top: 100%;
        right: 0;
        margin-top: 2px;
        background: var(--bg-primary, #fff);
        border: 1px solid var(--border-color, #e0e0e0);
        border-radius: 6px;
        box-shadow: 0 2px 12px rgba(0,0,0,0.15);
        z-index: 1000;
        min-width: 160px;
        overflow: hidden;
      }

      .dropdown-item {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        padding: 8px 12px;
        background: none;
        border: none;
        cursor: pointer;
        font-size: 12px;
        text-align: left;
      }

      .dropdown-item:hover {
        background: var(--bg-secondary, #f8f9fa);
      }

      .item-icon {
        font-size: 14px;
      }
    `;

    if (!document.querySelector('#toolbar-styles')) {
      style.id = 'toolbar-styles';
      document.head.appendChild(style);
    }
  }

  // Public API

  public setActiveTab(tab: ViewerTab): void {
    // Update state
    this.stateManager.setActiveTab(tab);

    // Update UI
    const tabs = this.container.querySelectorAll('.toolbar-tab');
    tabs.forEach(tabElement => {
      const tabButton = tabElement as HTMLElement;
      const isActive = tabButton.dataset.tab === tab;
      tabButton.classList.toggle('active', isActive);
    });

    // Update button states based on active tab
    this.updateButtonStates(tab);
  }

  private updateButtonStates(activeTab: ViewerTab): void {
    const formatEnabled = activeTab === 'raw';
    const expandEnabled = activeTab === 'pretty';

    const formatBtn = this.elements.get('format') as HTMLButtonElement;
    const minifyBtn = this.elements.get('minify') as HTMLButtonElement;
    const expandBtn = this.elements.get('expand') as HTMLButtonElement;
    const collapseBtn = this.elements.get('collapse') as HTMLButtonElement;

    if (formatBtn) formatBtn.disabled = !formatEnabled;
    if (minifyBtn) minifyBtn.disabled = !formatEnabled;
    if (expandBtn) expandBtn.disabled = !expandEnabled;
    if (collapseBtn) collapseBtn.disabled = !expandEnabled;
  }

  public updateSearchResults(current: number, total: number): void {
    // This could be used to update a search results indicator
    // For now, we'll just store it in case we want to display it
  }

  public setFormatEnabled(enabled: boolean): void {
    const formatBtn = this.elements.get('format') as HTMLButtonElement;
    const minifyBtn = this.elements.get('minify') as HTMLButtonElement;

    if (formatBtn) formatBtn.disabled = !enabled;
    if (minifyBtn) minifyBtn.disabled = !enabled;
  }

  public destroy(): void {
    document.removeEventListener('keydown', this.handleKeydown);
    this.hideDropdown();
  }
}