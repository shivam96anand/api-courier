/**
 * Notepad tab rendering - handles rendering of tab strip
 */
import { NotepadState, NotepadTab } from '../../../shared/types';
import { NotepadStore } from './notepad-store';
import { escapeHtml } from './notepad-utils';

export interface TabRenderingContext {
  tabStrip: HTMLElement;
  store: NotepadStore;
  onTabClick: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  onTabRename: (tabId: string) => void;
  onContextMenu: (tabId: string, x: number, y: number, hasFile: boolean) => void;
}

/**
 * Render tabs in the tab strip
 */
export function renderTabs(ctx: TabRenderingContext, state: NotepadState): void {
  if (!ctx.tabStrip) return;
  ctx.tabStrip.innerHTML = '';

  state.tabs.forEach(tab => {
    const button = document.createElement('button');
    button.className = `notepad-tab ${tab.id === state.activeTabId ? 'active' : ''}`;
    button.dataset.tabId = tab.id;
    button.innerHTML = `
      <span class="tab-dirty ${tab.isDirty ? 'visible' : ''}">●</span>
      <span class="tab-title">${escapeHtml(tab.title)}</span>
      <span class="tab-close" title="Close">x</span>
    `;

    button.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).classList.contains('tab-close')) {
        ctx.onTabClose(tab.id);
        return;
      }
      ctx.onTabClick(tab.id);
    });

    button.addEventListener('dblclick', () => ctx.onTabRename(tab.id));

    button.addEventListener('auxclick', (e) => {
      if (e.button === 1) {
        e.preventDefault();
        ctx.onTabClose(tab.id);
      }
    });

    button.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      ctx.onContextMenu(tab.id, e.clientX, e.clientY, Boolean(tab.filePath));
    });

    ctx.tabStrip.appendChild(button);
  });
}

export interface StatusBarElements {
  statusFile: HTMLElement;
  statusState: HTMLElement;
  statusCursor: HTMLElement;
  statusLines: HTMLElement;
  statusChars: HTMLElement;
}

export interface CursorPosition {
  lineNumber: number;
  column: number;
}

/**
 * Update the status bar with current tab information
 */
export function updateStatusBar(
  elements: StatusBarElements,
  cursorPosition: CursorPosition,
  tab?: NotepadTab,
  valueOverride?: string
): void {
  if (!tab) {
    elements.statusFile.textContent = 'No file';
    elements.statusState.textContent = '';
    elements.statusCursor.textContent = 'Ln 0, Col 0';
    elements.statusLines.textContent = '0 lines';
    elements.statusChars.textContent = '0 chars';
    return;
  }

  const value = valueOverride !== undefined ? valueOverride : tab.content;
  const lines = value.split(/\r?\n/).length;
  const chars = value.length;

  const fileName = tab.filePath
    ? tab.filePath.split(/[/\\]/).pop() || tab.filePath
    : tab.title;

  elements.statusFile.textContent = fileName;
  elements.statusFile.title = tab.filePath || tab.title;
  elements.statusState.textContent = tab.isDirty ? 'Unsaved' : 'Saved';
  elements.statusState.className = `status-state ${tab.isDirty ? 'dirty' : 'clean'}`;
  elements.statusCursor.textContent = `Ln ${cursorPosition.lineNumber}, Col ${cursorPosition.column}`;
  elements.statusLines.textContent = `${lines} line${lines === 1 ? '' : 's'}`;
  elements.statusChars.textContent = `${chars} char${chars === 1 ? '' : 's'}`;
}
