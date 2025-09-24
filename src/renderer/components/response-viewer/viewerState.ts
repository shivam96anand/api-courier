/**
 * Request-scoped state management for the JSON viewer
 * Handles persistence to localStorage with automatic restoration
 */

import { ViewerState, ViewerTab, VIEWER_CONSTANTS } from './types';

const STORAGE_PREFIX = 'viewer:';
const GLOBAL_SETTINGS_KEY = 'viewer:settings';

interface GlobalSettings {
  theme: 'light' | 'dark';
  fontSize: number;
  wrapText: boolean;
  showTypes: boolean;
}

export class ViewerStateManager {
  private state: ViewerState;
  private requestId: string;
  private storageKey: string;
  private saveTimeout: number | null = null;

  constructor(requestId: string) {
    this.requestId = requestId;
    this.storageKey = `${STORAGE_PREFIX}${requestId}`;
    this.state = this.loadState();
  }

  /**
   * Load state from localStorage or create default state
   */
  private loadState(): ViewerState {
    try {
      const stored = localStorage.getItem(this.storageKey);
      const globalSettings = this.getGlobalSettings();

      if (stored) {
        const parsedState = JSON.parse(stored) as ViewerState;
        // Ensure expandedNodes is a Set
        if (parsedState.prettyView.expandedNodes) {
          parsedState.prettyView.expandedNodes = new Set(
            Array.isArray(parsedState.prettyView.expandedNodes)
              ? parsedState.prettyView.expandedNodes
              : Array.from(parsedState.prettyView.expandedNodes)
          );
        }

        // Apply global settings if they've changed
        parsedState.rawEditor.fontSize = globalSettings.fontSize;
        parsedState.prettyView.fontSize = globalSettings.fontSize;
        parsedState.rawEditor.theme = globalSettings.theme;
        parsedState.rawEditor.wrapText = globalSettings.wrapText;
        parsedState.prettyView.showTypes = globalSettings.showTypes;

        return parsedState;
      }
    } catch (error) {
      console.warn('Failed to load viewer state:', error);
    }

    return this.createDefaultState();
  }

  /**
   * Create default state with global settings applied
   */
  private createDefaultState(): ViewerState {
    const globalSettings = this.getGlobalSettings();

    return {
      requestId: this.requestId,
      activeTab: 'pretty',
      rawEditor: {
        wrapText: globalSettings.wrapText,
        fontSize: globalSettings.fontSize,
        theme: globalSettings.theme,
        scrollPosition: 0,
        cursorPosition: 0,
      },
      prettyView: {
        expandedNodes: new Set<string>(),
        fontSize: globalSettings.fontSize,
        showTypes: globalSettings.showTypes,
        scrollPosition: 0,
      },
      search: {
        query: '',
        isVisible: false,
        currentIndex: -1,
        totalMatches: 0,
      },
    };
  }

  /**
   * Get global settings that apply to all viewers
   */
  private getGlobalSettings(): GlobalSettings {
    try {
      const stored = localStorage.getItem(GLOBAL_SETTINGS_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.warn('Failed to load global settings:', error);
    }

    return {
      theme: 'light',
      fontSize: VIEWER_CONSTANTS.DEFAULT_FONT_SIZE,
      wrapText: true,
      showTypes: true,
    };
  }

  /**
   * Save global settings that apply to all viewers
   */
  public saveGlobalSettings(settings: Partial<GlobalSettings>): void {
    const current = this.getGlobalSettings();
    const updated = { ...current, ...settings };

    try {
      localStorage.setItem(GLOBAL_SETTINGS_KEY, JSON.stringify(updated));

      // Apply to current state
      if (settings.fontSize !== undefined) {
        this.state.rawEditor.fontSize = settings.fontSize;
        this.state.prettyView.fontSize = settings.fontSize;
      }
      if (settings.theme !== undefined) {
        this.state.rawEditor.theme = settings.theme;
      }
      if (settings.wrapText !== undefined) {
        this.state.rawEditor.wrapText = settings.wrapText;
      }
      if (settings.showTypes !== undefined) {
        this.state.prettyView.showTypes = settings.showTypes;
      }

      this.scheduleSave();
    } catch (error) {
      console.error('Failed to save global settings:', error);
    }
  }

  /**
   * Get current state
   */
  public getState(): ViewerState {
    return this.state;
  }

  /**
   * Update state and schedule save
   */
  public updateState(updates: Partial<ViewerState>): void {
    this.state = { ...this.state, ...updates };
    this.scheduleSave();
  }

  /**
   * Update active tab
   */
  public setActiveTab(tab: ViewerTab): void {
    this.updateState({ activeTab: tab });
  }

  /**
   * Update raw editor settings
   */
  public updateRawEditor(updates: Partial<ViewerState['rawEditor']>): void {
    this.state.rawEditor = { ...this.state.rawEditor, ...updates };
    this.scheduleSave();
  }

  /**
   * Update pretty view settings
   */
  public updatePrettyView(updates: Partial<ViewerState['prettyView']>): void {
    this.state.prettyView = { ...this.state.prettyView, ...updates };
    this.scheduleSave();
  }

  /**
   * Update search state
   */
  public updateSearch(updates: Partial<ViewerState['search']>): void {
    this.state.search = { ...this.state.search, ...updates };
    this.scheduleSave();
  }

  /**
   * Toggle node expansion
   */
  public toggleNodeExpansion(nodeId: string): boolean {
    const expanded = this.state.prettyView.expandedNodes;
    if (expanded.has(nodeId)) {
      expanded.delete(nodeId);
      this.scheduleSave();
      return false;
    } else {
      expanded.add(nodeId);
      this.scheduleSave();
      return true;
    }
  }

  /**
   * Expand all nodes (with warning for large datasets)
   */
  public expandAll(nodeIds: string[]): boolean {
    if (nodeIds.length > VIEWER_CONSTANTS.MAX_EXPAND_WARNING) {
      const confirmed = confirm(
        `This will expand ${nodeIds.length} nodes, which may impact performance. Continue?`
      );
      if (!confirmed) return false;
    }

    nodeIds.forEach(id => this.state.prettyView.expandedNodes.add(id));
    this.scheduleSave();
    return true;
  }

  /**
   * Collapse all nodes
   */
  public collapseAll(): void {
    this.state.prettyView.expandedNodes.clear();
    this.scheduleSave();
  }

  /**
   * Check if node is expanded
   */
  public isNodeExpanded(nodeId: string): boolean {
    return this.state.prettyView.expandedNodes.has(nodeId);
  }

  /**
   * Get all expanded node IDs
   */
  public getExpandedNodes(): Set<string> {
    return new Set(this.state.prettyView.expandedNodes);
  }

  /**
   * Schedule a debounced save operation
   */
  private scheduleSave(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(() => {
      this.saveState();
      this.saveTimeout = null;
    }, VIEWER_CONSTANTS.DEBOUNCE_DELAY) as unknown as number;
  }

  /**
   * Immediately save state to localStorage
   */
  public saveState(): void {
    try {
      // Convert Set to Array for JSON serialization
      const stateToSave = {
        ...this.state,
        prettyView: {
          ...this.state.prettyView,
          expandedNodes: Array.from(this.state.prettyView.expandedNodes),
        },
      };

      localStorage.setItem(this.storageKey, JSON.stringify(stateToSave));
    } catch (error) {
      console.error('Failed to save viewer state:', error);
      // If localStorage is full, try to clean up old states
      this.cleanupOldStates();
    }
  }

  /**
   * Clean up old viewer states to free storage space
   */
  private cleanupOldStates(): void {
    try {
      const keysToRemove: string[] = [];
      const cutoffTime = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days ago

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(STORAGE_PREFIX) && key !== this.storageKey) {
          try {
            const item = localStorage.getItem(key);
            if (item) {
              const parsed = JSON.parse(item);
              // If no timestamp or very old, mark for removal
              if (!parsed.timestamp || parsed.timestamp < cutoffTime) {
                keysToRemove.push(key);
              }
            }
          } catch {
            // If we can't parse it, remove it
            keysToRemove.push(key);
          }
        }
      }

      keysToRemove.forEach(key => localStorage.removeItem(key));
    } catch (error) {
      console.warn('Failed to cleanup old states:', error);
    }
  }

  /**
   * Reset state to defaults
   */
  public resetState(): void {
    this.state = this.createDefaultState();
    this.saveState();
  }

  /**
   * Remove state from storage
   */
  public clearState(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }

    try {
      localStorage.removeItem(this.storageKey);
    } catch (error) {
      console.warn('Failed to clear viewer state:', error);
    }
  }

  /**
   * Check if localStorage is available
   */
  public static isStorageAvailable(): boolean {
    try {
      const test = '__storage_test__';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Export state for debugging
   */
  public exportState(): string {
    return JSON.stringify({
      ...this.state,
      prettyView: {
        ...this.state.prettyView,
        expandedNodes: Array.from(this.state.prettyView.expandedNodes),
      },
    }, null, 2);
  }

  /**
   * Get current theme
   */
  public getTheme(): 'light' | 'dark' {
    return this.state.rawEditor.theme;
  }

  /**
   * Get current font size
   */
  public getFontSize(): number {
    return this.state.rawEditor.fontSize;
  }

  /**
   * Update font size for both raw and pretty views
   */
  public setFontSize(size: number): void {
    const clampedSize = Math.max(
      VIEWER_CONSTANTS.MIN_FONT_SIZE,
      Math.min(VIEWER_CONSTANTS.MAX_FONT_SIZE, size)
    );

    this.updateRawEditor({ fontSize: clampedSize });
    this.updatePrettyView({ fontSize: clampedSize });
    this.saveGlobalSettings({ fontSize: clampedSize });
  }

  /**
   * Toggle text wrapping
   */
  public toggleTextWrap(): boolean {
    const newWrap = !this.state.rawEditor.wrapText;
    this.updateRawEditor({ wrapText: newWrap });
    this.saveGlobalSettings({ wrapText: newWrap });
    return newWrap;
  }

  /**
   * Toggle type badges visibility
   */
  public toggleTypesBadges(): boolean {
    const newShow = !this.state.prettyView.showTypes;
    this.updatePrettyView({ showTypes: newShow });
    this.saveGlobalSettings({ showTypes: newShow });
    return newShow;
  }
}