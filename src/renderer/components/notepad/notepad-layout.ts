/**
 * Notepad layout builder - builds the HTML structure for the notepad tab
 */

export interface NotepadElements {
  tabStrip: HTMLElement;
  editorHost: HTMLElement;
  statusFile: HTMLElement;
  statusState: HTMLElement;
  statusCursor: HTMLElement;
  statusLines: HTMLElement;
  statusChars: HTMLElement;
  contextMenu: HTMLElement;
  dirtyModal: HTMLElement;
}

export interface NotepadLayoutCallbacks {
  onZoomOut: () => void;
  onZoomIn: () => void;
  onAddTab: () => void;
  onOpenFile: () => void;
  onSave: () => void;
  onSaveAs: () => void;
}

/**
 * Builds the notepad HTML layout and returns references to key elements
 */
export function buildNotepadLayout(
  container: HTMLElement,
  callbacks: NotepadLayoutCallbacks
): NotepadElements {
  container.innerHTML = `
    <div class="notepad-layout">
      <div class="notepad-topbar">
        <div class="notepad-tabs-area">
          <div class="notepad-tabs" id="notepad-tab-strip"></div>
          <button class="notepad-tab add" id="np-add-tab" title="New Tab">+</button>
        </div>
        <div class="notepad-actions">
          <button class="np-btn icon" id="np-zoom-out" title="Zoom Out">A-</button>
          <button class="np-btn icon" id="np-zoom-in" title="Zoom In">A+</button>
          <button class="np-btn ghost" id="np-new-tab" title="New Tab (Ctrl/Cmd+N)">+ New</button>
          <button class="np-btn ghost" id="np-open-file" title="Open File (Ctrl/Cmd+O)">Open</button>
          <button class="np-btn primary" id="np-save" title="Save (Ctrl/Cmd+S)">Save</button>
          <button class="np-btn" id="np-save-as" title="Save As (Ctrl/Cmd+Shift+S)">Save As</button>
        </div>
      </div>
      <div class="notepad-editor" id="notepad-editor"></div>
      <div class="notepad-status-bar">
        <div class="status-left">
          <span class="status-file" id="np-status-file">No file</span>
          <span class="status-state" id="np-status-state">Unsaved</span>
        </div>
        <div class="status-right">
          <span class="status-metric" id="np-status-cursor">Ln 1, Col 1</span>
          <span class="status-metric" id="np-status-lines">0 lines</span>
          <span class="status-metric" id="np-status-chars">0 chars</span>
        </div>
      </div>
      <div class="notepad-context-menu hidden" id="notepad-context-menu">
        <button data-action="new">New Tab</button>
        <button data-action="rename">Rename</button>
        <button data-action="save">Save</button>
        <button data-action="saveAs">Save As</button>
        <button data-action="close">Close</button>
        <button data-action="closeOthers">Close Others</button>
        <button data-action="closeAll">Close All</button>
        <button data-action="reveal">Reveal in Finder/Explorer</button>
      </div>
      <div class="notepad-modal hidden" id="notepad-dirty-modal">
        <div class="notepad-modal-content">
          <div class="modal-title">Unsaved Changes</div>
          <div class="modal-body">
            This tab has unsaved changes. Save before closing?
          </div>
          <div class="modal-actions">
            <button class="np-btn primary" data-action="save">Save</button>
            <button class="np-btn ghost" data-action="discard">Don't Save</button>
            <button class="np-btn" data-action="cancel">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  `;

  const elements: NotepadElements = {
    tabStrip: container.querySelector('#notepad-tab-strip') as HTMLElement,
    editorHost: container.querySelector('#notepad-editor') as HTMLElement,
    statusFile: container.querySelector('#np-status-file') as HTMLElement,
    statusState: container.querySelector('#np-status-state') as HTMLElement,
    statusCursor: container.querySelector('#np-status-cursor') as HTMLElement,
    statusLines: container.querySelector('#np-status-lines') as HTMLElement,
    statusChars: container.querySelector('#np-status-chars') as HTMLElement,
    contextMenu: container.querySelector('#notepad-context-menu') as HTMLElement,
    dirtyModal: container.querySelector('#notepad-dirty-modal') as HTMLElement,
  };

  // Attach button event listeners
  container.querySelector('#np-zoom-out')?.addEventListener('click', callbacks.onZoomOut);
  container.querySelector('#np-zoom-in')?.addEventListener('click', callbacks.onZoomIn);
  container.querySelector('#np-add-tab')?.addEventListener('click', callbacks.onAddTab);
  container.querySelector('#np-new-tab')?.addEventListener('click', callbacks.onAddTab);
  container.querySelector('#np-open-file')?.addEventListener('click', callbacks.onOpenFile);
  container.querySelector('#np-save')?.addEventListener('click', callbacks.onSave);
  container.querySelector('#np-save-as')?.addEventListener('click', callbacks.onSaveAs);

  return elements;
}
