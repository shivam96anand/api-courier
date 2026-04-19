/**
 * Notepad tab strip rendering and the status bar.
 *
 * Tabs support drag-to-reorder via native HTML5 drag events. Drag indicators
 * are minimal (border-left highlight on the drop target) to keep the strip
 * legible during drag.
 */
import { NotepadState, NotepadTab } from '../../../shared/types';
import { NotepadStore } from './notepad-store';
import { languageLabel } from './notepad-language';
import { escapeHtml } from './notepad-utils';

export interface TabRenderingContext {
  tabStrip: HTMLElement;
  store: NotepadStore;
  onTabClick: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  onTabRename: (tabId: string) => void;
  onContextMenu: (
    tabId: string,
    x: number,
    y: number,
    hasFile: boolean
  ) => void;
  onReorder: (fromIdx: number, toIdx: number) => void;
}

export function renderTabs(
  ctx: TabRenderingContext,
  state: NotepadState
): void {
  if (!ctx.tabStrip) return;
  ctx.tabStrip.innerHTML = '';

  state.tabs.forEach((tab, idx) => {
    const button = document.createElement('button');
    button.className = `notepad-tab ${tab.id === state.activeTabId ? 'active' : ''}`;
    button.dataset.tabId = tab.id;
    button.dataset.tabIdx = String(idx);
    button.draggable = true;
    button.title = tab.filePath ?? tab.title;
    button.innerHTML = `
      <span class="tab-dirty ${tab.isDirty ? 'visible' : ''}" aria-hidden="true">●</span>
      <span class="tab-title">${escapeHtml(tab.title)}</span>
      <span class="tab-close" title="Close" aria-label="Close tab">×</span>
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

    // Drag-to-reorder
    button.addEventListener('dragstart', (e) => {
      e.dataTransfer?.setData('text/x-notepad-tab', String(idx));
      e.dataTransfer!.effectAllowed = 'move';
      button.classList.add('dragging');
    });
    button.addEventListener('dragend', () =>
      button.classList.remove('dragging')
    );
    button.addEventListener('dragover', (e) => {
      if (!e.dataTransfer?.types.includes('text/x-notepad-tab')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      button.classList.add('drag-over');
    });
    button.addEventListener('dragleave', () =>
      button.classList.remove('drag-over')
    );
    button.addEventListener('drop', (e) => {
      e.preventDefault();
      button.classList.remove('drag-over');
      const fromRaw = e.dataTransfer?.getData('text/x-notepad-tab');
      if (!fromRaw) return;
      const fromIdx = Number(fromRaw);
      if (!Number.isFinite(fromIdx) || fromIdx === idx) return;
      ctx.onReorder(fromIdx, idx);
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
  statusLanguage: HTMLElement;
  statusSelection: HTMLElement;
  statusEol: HTMLElement;
  statusIndent: HTMLElement;
}

export interface CursorPosition {
  lineNumber: number;
  column: number;
  selectionLength?: number;
}

export interface StatusBarOptions {
  tabSize: number;
}

export function updateStatusBar(
  elements: StatusBarElements,
  cursorPosition: CursorPosition,
  options: StatusBarOptions,
  tab?: NotepadTab,
  valueOverride?: string
): void {
  if (!tab) {
    elements.statusFile.textContent = 'No file';
    elements.statusFile.title = '';
    elements.statusState.textContent = '';
    elements.statusCursor.textContent = 'Ln 0, Col 0';
    elements.statusLines.textContent = '0 lines';
    elements.statusChars.textContent = '0 chars';
    elements.statusLanguage.textContent = 'Plain Text';
    elements.statusSelection.textContent = '';
    elements.statusEol.textContent = 'LF';
    elements.statusIndent.textContent = `Spaces: ${options.tabSize}`;
    return;
  }

  const value = valueOverride !== undefined ? valueOverride : tab.content;
  // Counting on every cursor move is fine up to a few MB; anything larger we
  // gate elsewhere.
  const lines = value.length === 0 ? 1 : value.split(/\r?\n/).length;
  const chars = value.length;
  const eol = /\r\n/.test(value) ? 'CRLF' : 'LF';

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
  elements.statusLanguage.textContent = languageLabel(tab.language);
  elements.statusEol.textContent = eol;
  elements.statusIndent.textContent = `Spaces: ${options.tabSize}`;

  const sel = cursorPosition.selectionLength ?? 0;
  elements.statusSelection.textContent = sel > 0 ? `(${sel} selected)` : '';
}
