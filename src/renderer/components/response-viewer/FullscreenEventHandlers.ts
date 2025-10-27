/**
 * FullscreenEventHandlers - Handles all user interactions
 * Manages event handling for toolbar actions, search, and content operations
 */

import { ViewerTab } from './types';
import { ViewerStateManager } from './viewerState';
import { RawEditorHandle } from './RawEditor';
import { JsonTreeHandle } from './JsonTree';
import { SearchBarHandle } from './SearchBar';
import { JsonUtils } from './utils/json';
import { FullscreenModalUI } from './FullscreenModalUI';

export interface EventHandlersDependencies {
  stateManager: ViewerStateManager;
  rawEditor: RawEditorHandle | null;
  jsonTree: JsonTreeHandle | null;
  searchBar: SearchBarHandle | null;
  modalUI: FullscreenModalUI;
  modal: HTMLElement | null;
  getCurrentContent: () => string;
  onContentChange: (content: string) => void;
  onHide: () => void;
}

export class FullscreenEventHandlers {
  private deps: EventHandlersDependencies;

  constructor(deps: EventHandlersDependencies) {
    this.deps = deps;
  }

  handleTabChange(tab: ViewerTab, updateTabCallback: () => void): void {
    this.deps.stateManager.setActiveTab(tab);
    updateTabCallback();
  }

  async handleFormat(): Promise<void> {
    if (this.deps.rawEditor) {
      await this.deps.rawEditor.format();
    }
  }

  async handleMinify(): Promise<void> {
    if (this.deps.rawEditor) {
      await this.deps.rawEditor.minify();
    }
  }

  handleExpandAll(): void {
    this.deps.jsonTree?.expandAll();
  }

  handleCollapseAll(): void {
    this.deps.jsonTree?.collapseAll();
  }

  handleToggleWrap(): void {
    this.deps.rawEditor?.toggleWrap();
  }

  handleToggleTypes(): void {
    this.deps.stateManager.toggleTypesBadges();
    this.deps.jsonTree?.refresh();
  }

  handleSearch(): void {
    this.deps.searchBar?.show();
  }

  handleCopy(): void {
    const content = this.deps.rawEditor?.getValue() || this.deps.getCurrentContent();
    JsonUtils.copyToClipboard(content).then(success => {
      if (success) {
        this.deps.modalUI.showToast('Copied to clipboard');
      } else {
        this.deps.modalUI.showToast('Failed to copy');
      }
    });
  }

  handleExport(): void {
    const content = this.deps.getCurrentContent();
    if (!content) return;

    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `json-export-${Date.now()}.json`;
    link.style.display = 'none';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  }

  handleFontSizeChange(size: number): void {
    this.deps.rawEditor?.setFontSize(size);
    this.deps.jsonTree?.setFontSize(size);
  }

  handleScrollTop(): void {
    const activeTab = this.deps.stateManager.getState().activeTab;
    
    if (activeTab === 'pretty') {
      // Scroll pretty view to top
      const prettyView = this.deps.modal?.querySelector('.pretty-view') as HTMLElement;
      if (prettyView) {
        const scrollable = prettyView.querySelector('.json-tree-container, .json-content') as HTMLElement;
        if (scrollable) {
          scrollable.scrollTop = 0;
        }
      }
    } else if (activeTab === 'raw') {
      // Scroll raw editor to top
      this.deps.rawEditor?.goToLine(1);
    }
  }

  handleScrollBottom(): void {
    const activeTab = this.deps.stateManager.getState().activeTab;
    
    if (activeTab === 'pretty') {
      // Scroll pretty view to bottom
      const prettyView = this.deps.modal?.querySelector('.pretty-view') as HTMLElement;
      if (prettyView) {
        const scrollable = prettyView.querySelector('.json-tree-container, .json-content') as HTMLElement;
        if (scrollable) {
          scrollable.scrollTop = scrollable.scrollHeight;
        }
      }
    } else if (activeTab === 'raw') {
      // Scroll raw editor to bottom - get last line number
      const content = this.deps.rawEditor?.getValue() || '';
      const lines = content.split('\n').length;
      this.deps.rawEditor?.goToLine(lines);
    }
  }

  handleAskAI(): void {
    const content = this.deps.getCurrentContent();
    if (!content) {
      this.deps.modalUI.showToast('No JSON to analyze');
      return;
    }

    // Create response context for Ask AI using the existing event pattern
    try {
      const response = {
        body: content,
        headers: {}, // We don't have headers in fullscreen mode
        status: 200,
        statusText: 'OK',
        size: content.length,
        time: 0, // No timing info available
        contentType: 'application/json',
        timestamp: Date.now()
      };

      // Dispatch the existing 'open-ask-ai' event that the main app listens for
      const askAIEvent = new CustomEvent('open-ask-ai', {
        detail: {
          response: response
        }
      });
      
      document.dispatchEvent(askAIEvent);
      this.deps.modalUI.showToast('Opening Ask AI...');
      
      // Close fullscreen to show the AI tab
      this.deps.onHide();
      
    } catch (error) {
      console.error('Failed to trigger Ask AI:', error);
      this.deps.modalUI.showToast('Failed to open Ask AI');
    }
  }

  handleContentChange(content: string): void {
    this.deps.onContentChange(content);
  }

  handleCursorChange(line: number, column: number): void {
    // Could be used for status display
  }

  handleNodeToggle(nodeId: string, expanded: boolean): void {
    // Node expansion is handled by the tree component
  }

  handleNodeSelect(nodeId: string): void {
    // Node selection is handled by the tree component
  }

  handleNodeAction(nodeId: string, action: string, data?: any): void {
    // Handle node actions like copy value, copy path, etc.
    switch (action) {
      case 'copy-value':
        // Implementation would depend on finding the node and copying its value
        break;
      case 'copy-path':
        // Implementation would depend on finding the node and copying its path
        break;
      case 'copy-jsonpath':
        // Implementation would depend on finding the node and copying its JSONPath
        break;
    }
  }

  handleSearchMatches(matches: any[]): void {
    this.deps.searchBar?.updateResults(
      this.deps.stateManager.getState().search.currentIndex + 1,
      matches.length
    );
  }

  handleSearchQuery(query: string): void {
    const activeTab = this.deps.stateManager.getState().activeTab;

    if (activeTab === 'pretty') {
      this.deps.jsonTree?.search(query);
    } else if (activeTab === 'raw') {
      this.deps.rawEditor?.find(query);
    }
  }

  handleSearchNavigate(direction: 1 | -1): void {
    const activeTab = this.deps.stateManager.getState().activeTab;

    if (activeTab === 'pretty') {
      this.deps.jsonTree?.navigateSearch(direction);
    } else if (activeTab === 'raw') {
      this.deps.rawEditor?.find('', direction);
    }
  }

  handleSearchClose(): void {
    const activeTab = this.deps.stateManager.getState().activeTab;

    if (activeTab === 'pretty') {
      this.deps.jsonTree?.clearSearch();
    }
  }
}
