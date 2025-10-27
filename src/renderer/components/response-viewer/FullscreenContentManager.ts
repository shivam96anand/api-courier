/**
 * FullscreenContentManager - Manages content updates and tab switching
 * Handles JSON parsing, content updates, and view synchronization
 */

import { ViewerTab } from './types';
import { ViewerStateManager } from './viewerState';
import { RawEditorHandle } from './RawEditor';
import { JsonTreeHandle } from './JsonTree';
import { ToolbarHandle } from './Toolbar';
import { JsonUtils } from './utils/json';

export interface ContentManagerDependencies {
  stateManager: ViewerStateManager;
  rawEditor: RawEditorHandle | null;
  jsonTree: JsonTreeHandle | null;
  toolbar: ToolbarHandle | null;
  modal: HTMLElement | null;
}

export class FullscreenContentManager {
  private deps: ContentManagerDependencies;
  private currentContent = '';
  private parsedData: any = null;

  constructor(deps: ContentManagerDependencies) {
    this.deps = deps;
  }

  /**
   * Gets the current content
   */
  getCurrentContent(): string {
    return this.currentContent;
  }

  /**
   * Sets the current content
   */
  setCurrentContent(content: string): void {
    this.currentContent = content;
  }

  /**
   * Updates all content views with current content
   */
  updateContent(): void {
    if (!this.deps.rawEditor || !this.deps.jsonTree) return;

    // Set raw content
    this.deps.rawEditor.setValue(this.currentContent);

    // Parse and set tree data
    this.parseContentForTree();
  }

  /**
   * Parses JSON content for tree view
   */
  async parseContentForTree(): Promise<void> {
    if (!this.currentContent.trim()) {
      this.parsedData = null;
      this.deps.jsonTree?.setData([]);
      return;
    }

    try {
      const parseResult = await JsonUtils.parseJson(this.currentContent);
      if (parseResult.success && parseResult.data !== undefined) {
        this.parsedData = parseResult.data;
        const nodes = JsonUtils.buildJsonTree(parseResult.data);
        this.deps.jsonTree?.setData(nodes);
      } else {
        this.parsedData = null;
        this.deps.jsonTree?.setData([]);
      }
    } catch (error) {
      console.error('Failed to parse JSON for tree view:', error);
      this.parsedData = null;
      this.deps.jsonTree?.setData([]);
    }
  }

  /**
   * Updates the active tab view
   */
  updateActiveTab(): void {
    if (!this.deps.modal) return;

    const activeTab = this.deps.stateManager.getState().activeTab;
    this.deps.toolbar?.setActiveTab(activeTab);

    // Show/hide content views
    const views = this.deps.modal.querySelectorAll('.content-view');
    views.forEach(view => {
      const viewElement = view as HTMLElement;
      const isPretty = viewElement.classList.contains('pretty-view');
      const isRaw = viewElement.classList.contains('raw-view');
      const isHeaders = viewElement.classList.contains('headers-view');

      const shouldShow = (
        (activeTab === 'pretty' && isPretty) ||
        (activeTab === 'raw' && isRaw) ||
        (activeTab === 'headers' && isHeaders)
      );

      viewElement.style.display = shouldShow ? 'flex' : 'none';
    });
  }

  /**
   * Sets the active tab
   */
  setActiveTab(tab: ViewerTab): void {
    this.deps.stateManager.setActiveTab(tab);
    this.updateActiveTab();
  }
}
