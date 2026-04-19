/**
 * In-app JSON export modal.
 *
 * Replaces the silent (or OS-level) blob download with a polished, themed
 * picker so the export experience feels native to RestBro. The user can:
 *   - Copy as pretty-printed / minified JSON to the clipboard
 *   - Download as pretty-printed / minified JSON file
 *
 * Usage:
 *   showJsonExportModal(jsonData, { defaultFileName: 'response' });
 */

type ExportFormat = 'pretty' | 'minified';

interface ExportOptions {
  /** Base filename without extension. Defaults to "json-export-<ts>". */
  defaultFileName?: string;
  /** Title shown in the modal header. */
  title?: string;
}

export function showJsonExportModal(
  jsonData: unknown,
  options: ExportOptions = {}
): void {
  if (jsonData === undefined || jsonData === null) return;

  const baseName =
    options.defaultFileName?.trim() || `json-export-${Date.now()}`;
  const title = options.title || 'Export JSON';

  const overlay = document.createElement('div');
  overlay.className = 'export-modal-overlay';
  overlay.innerHTML = `
    <div class="export-modal" role="dialog" aria-label="${escapeAttr(title)}">
      <div class="export-modal__header">
        <span class="export-modal__title">${escapeText(title)}</span>
        <button class="export-modal__close" aria-label="Close">\u00D7</button>
      </div>
      <div class="export-modal__body">
        <button class="export-modal__option" data-action="copy" data-format="pretty">
          <span class="export-modal__option-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
          </span>
          <span class="export-modal__option-text">
            <span class="export-modal__option-title">Copy as pretty JSON</span>
            <span class="export-modal__option-sub">Indented, human-readable \u2014 to clipboard</span>
          </span>
        </button>
        <button class="export-modal__option" data-action="copy" data-format="minified">
          <span class="export-modal__option-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
          </span>
          <span class="export-modal__option-text">
            <span class="export-modal__option-title">Copy as minified JSON</span>
            <span class="export-modal__option-sub">Single line, no whitespace \u2014 to clipboard</span>
          </span>
        </button>
        <div class="export-modal__divider"></div>
        <button class="export-modal__option" data-action="download" data-format="pretty">
          <span class="export-modal__option-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          </span>
          <span class="export-modal__option-text">
            <span class="export-modal__option-title">Download pretty JSON</span>
            <span class="export-modal__option-sub">${escapeText(baseName)}.json</span>
          </span>
        </button>
        <button class="export-modal__option" data-action="download" data-format="minified">
          <span class="export-modal__option-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          </span>
          <span class="export-modal__option-text">
            <span class="export-modal__option-title">Download minified JSON</span>
            <span class="export-modal__option-sub">${escapeText(baseName)}.min.json</span>
          </span>
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const dispose = (): void => {
    document.removeEventListener('keydown', onKey);
    overlay.classList.add('export-modal-overlay--leaving');
    overlay.addEventListener('animationend', () => overlay.remove(), {
      once: true,
    });
    // Safety net if animationend doesn't fire.
    setTimeout(() => overlay.remove(), 250);
  };

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') dispose();
  };
  document.addEventListener('keydown', onKey);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) dispose();
  });
  overlay
    .querySelector('.export-modal__close')
    ?.addEventListener('click', dispose);

  overlay
    .querySelectorAll<HTMLButtonElement>('.export-modal__option')
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action as 'copy' | 'download';
        const format = (btn.dataset.format as ExportFormat) || 'pretty';
        const text = serialize(jsonData, format);

        if (action === 'copy') {
          void navigator.clipboard
            .writeText(text)
            .then(() => toast('Copied to clipboard', 'success'))
            .catch(() => toast('Copy failed', 'error'));
        } else {
          const ext = format === 'minified' ? '.min.json' : '.json';
          downloadBlob(text, `${baseName}${ext}`);
          toast('Downloaded', 'success');
        }
        dispose();
      });
    });

  // Focus first option for keyboard accessibility.
  requestAnimationFrame(() => {
    overlay.querySelector<HTMLButtonElement>('.export-modal__option')?.focus();
  });
}

function serialize(data: unknown, format: ExportFormat): string {
  return format === 'minified'
    ? JSON.stringify(data)
    : JSON.stringify(data, null, 2);
}

function downloadBlob(text: string, filename: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function toast(message: string, type: 'success' | 'info' | 'error'): void {
  document.dispatchEvent(
    new CustomEvent('show-toast', { detail: { type, message } })
  );
}

function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return escapeText(s).replace(/"/g, '&quot;');
}
