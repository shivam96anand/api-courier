/**
 * Fullscreen modal for the XML/SOAP response body. Mirrors the JSON viewer's
 * fullscreen modal (same `.json-fullscreen-modal` markup so styling is shared)
 * but is backed by a read-only Monaco XML editor.
 */
import { MonacoXmlEditor } from '../request/MonacoXmlEditor';

export function openFullscreenXml(xml: string, hasSoapFault = false): void {
  if (!xml) return;

  const modal = document.createElement('div');
  modal.className = 'json-fullscreen-modal';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <div class="modal-title">XML Viewer - Full Screen${hasSoapFault ? ' (SOAP Fault)' : ''}</div>
        <div class="modal-actions">
          <button id="fs-xml-copy-btn" class="response-action-btn" title="Copy XML to clipboard">Copy</button>
          <button id="fs-xml-search-btn" class="response-action-btn" title="Search within XML">Search</button>
          <button id="fs-xml-collapse-btn" class="response-action-btn" title="Collapse all">Collapse</button>
          <button id="fs-xml-expand-btn" class="response-action-btn" title="Expand all">Expand</button>
          <button id="fs-xml-top-btn" class="response-action-btn" title="Scroll to top">Top</button>
          <button id="fs-xml-bottom-btn" class="response-action-btn" title="Scroll to bottom">Bottom</button>
          <button class="close-btn">&times;</button>
        </div>
      </div>
      <div class="modal-body">
        <div id="fullscreen-monaco-xml-viewer" style="width:100%;height:100%;"></div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const editor = new MonacoXmlEditor({
    container: modal.querySelector(
      '#fullscreen-monaco-xml-viewer'
    ) as HTMLElement,
    value: xml,
    onChange: () => {
      /* read-only */
    },
    readOnly: true,
  });

  const on = (id: string, handler: () => void): void => {
    modal.querySelector(`#${id}`)?.addEventListener('click', handler);
  };

  on('fs-xml-copy-btn', () => {
    navigator.clipboard.writeText(xml).catch(() => {
      /* silent */
    });
  });
  on('fs-xml-search-btn', () => editor.toggleFind());
  on('fs-xml-collapse-btn', () => editor.foldAll());
  on('fs-xml-expand-btn', () => editor.unfoldAll());
  on('fs-xml-top-btn', () => editor.scrollToTop());
  on('fs-xml-bottom-btn', () => editor.scrollToBottom());

  const handleEscape = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') cleanup();
  };

  function cleanup(): void {
    editor.dispose();
    modal.remove();
    document.removeEventListener('keydown', handleEscape);
  }

  modal.querySelector('.close-btn')?.addEventListener('click', cleanup);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) cleanup();
  });
  document.addEventListener('keydown', handleEscape);
}
