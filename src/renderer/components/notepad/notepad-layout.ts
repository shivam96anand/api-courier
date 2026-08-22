/**
 * Notepad layout builder. Constructs the global chrome (top-bar actions, status
 * bar, context menu, dirty modal, settings host) plus two pane host elements
 * with a divider between them. Each pane's inner DOM + editor is built by
 * `PaneController`; `NotepadManager` wires everything together.
 */
import { PICKABLE_LANGUAGES } from './notepad-language';
import { attachThemedSelect } from '../../utils/themed-select';

export interface NotepadElements {
  root: HTMLElement;
  panesHost: HTMLElement;
  pane0Root: HTMLElement;
  pane1Root: HTMLElement;
  paneDivider: HTMLElement;
  statusFile: HTMLElement;
  statusState: HTMLElement;
  statusCursor: HTMLElement;
  statusLines: HTMLElement;
  statusChars: HTMLElement;
  statusLanguage: HTMLElement;
  statusSelection: HTMLElement;
  statusEol: HTMLElement;
  statusIndent: HTMLElement;
  contextMenu: HTMLElement;
  dirtyModal: HTMLElement;
  dirtyModalTitle: HTMLElement;
  dirtyModalBody: HTMLElement;
  settingsHost: HTMLElement;
  previewToggleBtn: HTMLButtonElement;
  formatBtn: HTMLButtonElement;
  settingsBtn: HTMLButtonElement;
  splitBtn: HTMLButtonElement;
  languagePicker: HTMLSelectElement;
}

export interface NotepadLayoutCallbacks {
  onZoomOut: () => void;
  onZoomIn: () => void;
  onOpenFile: () => void;
  onSave: () => void;
  onTogglePreview: () => void;
  onToggleSplit: () => void;
  onFormat: () => void;
  onSettingsClick: (anchor: HTMLElement) => void;
  onLanguageChange: (language: string) => void;
  onFind: () => void;
  onReplace: () => void;
}

export function buildNotepadLayout(
  container: HTMLElement,
  callbacks: NotepadLayoutCallbacks
): NotepadElements {
  const languageOptions = PICKABLE_LANGUAGES.map(
    (lang) => `<option value="${lang.id}">${lang.label}</option>`
  ).join('');

  container.innerHTML = `
    <div class="notepad-layout">
      <div class="notepad-topbar">
        <div class="notepad-tools">
          <button class="np-btn ghost" id="np-find" title="Find (Ctrl/Cmd+F)">Find</button>
          <button class="np-btn ghost" id="np-replace" title="Replace (Ctrl/Cmd+H)">Replace</button>
          <button class="np-btn primary hidden" id="np-format" title="Format Document">Format</button>
          <select class="status-language-picker" id="np-status-language-picker"
            title="Change syntax language">
            ${languageOptions}
          </select>
          <div class="np-zoom-group">
            <button class="np-btn ghost icon" id="np-zoom-out" title="Zoom Out (Ctrl/Cmd+-)">A-</button>
            <button class="np-btn ghost icon" id="np-zoom-in" title="Zoom In (Ctrl/Cmd++)">A+</button>
          </div>
        </div>
        <div class="notepad-actions">
          <button class="np-btn primary" id="np-toggle-preview" title="Toggle Preview">Preview</button>
          <button class="np-btn ghost" id="np-open-file" title="Open File (Ctrl/Cmd+O)">Open</button>
          <button class="np-btn ghost" id="np-save" title="Save (Ctrl/Cmd+S)">Save</button>
          <button class="np-btn ghost" id="np-split" title="Split into two side-by-side panes" aria-pressed="false">Split</button>
          <button class="np-btn settings" id="np-settings" title="Notepad Settings" aria-haspopup="menu" aria-label="Notepad Settings">▾</button>
        </div>
      </div>
      <div class="notepad-panes" id="notepad-panes">
        <div data-pane-root="0"></div>
        <div class="notepad-pane-divider hidden" id="notepad-pane-divider" title="Drag to resize panes"></div>
        <div class="notepad-pane hidden" data-pane-root="1"></div>
      </div>
      <div class="notepad-status-bar">
        <div class="status-left">
          <span class="status-file" id="np-status-file">No file</span>
          <span class="status-state" id="np-status-state">Unsaved</span>
        </div>
        <div class="status-right">
          <span class="status-metric" id="np-status-language">Plain Text</span>
          <span class="status-metric" id="np-status-cursor">Ln 1, Col 1</span>
          <span class="status-metric status-metric--muted" id="np-status-selection"></span>
          <span class="status-metric" id="np-status-lines">0 lines</span>
          <span class="status-metric" id="np-status-chars">0 chars</span>
          <span class="status-metric status-metric--muted" id="np-status-eol">LF</span>
          <span class="status-metric status-metric--muted" id="np-status-indent">Spaces: 2</span>
        </div>
      </div>
      <div class="notepad-context-menu hidden" id="notepad-context-menu" role="menu">
        <button data-action="new" role="menuitem">New Tab</button>
        <button data-action="rename" role="menuitem">Rename</button>
        <button data-action="save" role="menuitem">Save</button>
        <button data-action="saveAs" role="menuitem">Save As</button>
        <button data-action="moveToOtherView" role="menuitem">Move to Other View</button>
        <button data-action="close" role="menuitem">Close</button>
        <button data-action="closeOthers" role="menuitem">Close Others</button>
        <button data-action="closeLeft" role="menuitem">Close to the Left</button>
        <button data-action="closeRight" role="menuitem">Close to the Right</button>
        <button data-action="closeAll" role="menuitem">Close All</button>
        <button data-action="reveal" role="menuitem">Reveal in Finder/Explorer</button>
        <button data-action="copyPath" role="menuitem">Copy Full Path</button>
      </div>
      <div class="notepad-modal hidden" id="notepad-dirty-modal" role="dialog" aria-modal="true">
        <div class="notepad-modal-content">
          <div class="modal-title" id="notepad-dirty-modal-title">Unsaved Changes</div>
          <div class="modal-body" id="notepad-dirty-modal-body">
            This tab has unsaved changes. Save before closing?
          </div>
          <div class="modal-actions">
            <button class="np-btn primary" data-action="save">Save</button>
            <button class="np-btn ghost" data-action="discard">Don't Save</button>
            <button class="np-btn" data-action="cancel">Cancel</button>
          </div>
        </div>
      </div>
      <div class="notepad-settings-host"></div>
    </div>
  `;

  const q = <T extends HTMLElement = HTMLElement>(sel: string): T =>
    container.querySelector(sel) as T;

  const elements: NotepadElements = {
    root: q('.notepad-layout'),
    panesHost: q('#notepad-panes'),
    pane0Root: q('[data-pane-root="0"]'),
    pane1Root: q('[data-pane-root="1"]'),
    paneDivider: q('#notepad-pane-divider'),
    statusFile: q('#np-status-file'),
    statusState: q('#np-status-state'),
    statusCursor: q('#np-status-cursor'),
    statusLines: q('#np-status-lines'),
    statusChars: q('#np-status-chars'),
    statusLanguage: q('#np-status-language'),
    statusSelection: q('#np-status-selection'),
    statusEol: q('#np-status-eol'),
    statusIndent: q('#np-status-indent'),
    contextMenu: q('#notepad-context-menu'),
    dirtyModal: q('#notepad-dirty-modal'),
    dirtyModalTitle: q('#notepad-dirty-modal-title'),
    dirtyModalBody: q('#notepad-dirty-modal-body'),
    settingsHost: q('.notepad-settings-host'),
    previewToggleBtn: q<HTMLButtonElement>('#np-toggle-preview'),
    formatBtn: q<HTMLButtonElement>('#np-format'),
    settingsBtn: q<HTMLButtonElement>('#np-settings'),
    splitBtn: q<HTMLButtonElement>('#np-split'),
    languagePicker: q<HTMLSelectElement>('#np-status-language-picker'),
  };

  q('#np-zoom-out').addEventListener('click', callbacks.onZoomOut);
  q('#np-zoom-in').addEventListener('click', callbacks.onZoomIn);
  q('#np-open-file').addEventListener('click', callbacks.onOpenFile);
  q('#np-save').addEventListener('click', callbacks.onSave);
  q('#np-find').addEventListener('click', callbacks.onFind);
  q('#np-replace').addEventListener('click', callbacks.onReplace);
  elements.previewToggleBtn.addEventListener(
    'click',
    callbacks.onTogglePreview
  );
  elements.splitBtn.addEventListener('click', callbacks.onToggleSplit);
  elements.formatBtn.addEventListener('click', callbacks.onFormat);
  elements.settingsBtn.addEventListener('click', () =>
    callbacks.onSettingsClick(elements.settingsBtn)
  );
  elements.languagePicker.addEventListener('change', () =>
    callbacks.onLanguageChange(elements.languagePicker.value)
  );

  // Replace the native OS <select> popup with the app's themed dropdown
  // (matching the environment selector). The <select> stays the source of
  // truth, so the change handler above keeps working.
  attachThemedSelect(elements.languagePicker);

  return elements;
}
