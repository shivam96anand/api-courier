import { SoapCertEntry, SoapCerts } from '../../../shared/types';

type PemCertField = 'clientCert' | 'clientKey' | 'caCert' | 'pfx';

const PEM_FIELD_LABELS: Record<PemCertField, string> = {
  clientCert: 'Client Certificate (PEM)',
  clientKey:  'Client Key (PEM)',
  caCert:     'CA / Truststore Certificate (PEM)',
  pfx:        'PFX / PKCS12 Certificate',
};

const BINARY_EXTENSIONS = new Set(['.pfx', '.p12', '.jks']);

/**
 * SoapCertsManager - renders TLS/mTLS certificate configuration.
 * Default mode: JKS (upload keystore.jks + truststore.jks with passwords).
 * Advanced mode: PEM (individual cert/key/ca/pfx files or paste).
 */
export class SoapCertsManager {
  private container: HTMLElement | null = null;
  private current: SoapCerts = { mode: 'jks' };
  private onUpdate: (certs: SoapCerts) => void;

  constructor(onUpdate: (certs: SoapCerts) => void) {
    this.onUpdate = onUpdate;
  }

  render(container: HTMLElement, certs: SoapCerts = { mode: 'jks' }): void {
    this.container = container;
    this.current = this.clone(certs);
    this.rebuild();
  }

  load(certs: SoapCerts): void {
    if (!this.container) return;
    this.render(this.container, certs);
  }

  clear(): void {
    this.current = { mode: 'jks' };
    if (this.container) {
      this.container.innerHTML = `
        <select id="auth-type">
          <option value="none">No Auth</option>
          <option value="basic">Basic Auth</option>
          <option value="bearer">Bearer Token</option>
          <option value="api-key">API Key</option>
          <option value="oauth2">OAuth 2.0</option>
        </select>
        <div id="auth-config" class="auth-config"></div>
        <div id="oauth-status" class="oauth-status" style="display: none;">
          <span class="status-icon" aria-hidden="true"></span>
          <span class="status-text"></span>
        </div>`;
    }
  }

  // ── Private: full re-render ──────────────────────────────────────────────

  private rebuild(): void {
    if (!this.container) return;
    this.container.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'soap-certs';

    // Mode tabs: JKS | PEM
    wrapper.appendChild(this.buildModeToggle());

    // Content area (swapped by mode)
    const content = document.createElement('div');
    content.className = 'soap-certs__mode-content';
    wrapper.appendChild(content);

    this.renderModeContent(content);
    this.container.appendChild(wrapper);
  }

  private buildModeToggle(): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'soap-certs__mode-bar';

    const jksBtn = document.createElement('button');
    jksBtn.type = 'button';
    jksBtn.textContent = 'JKS';
    jksBtn.className = `soap-certs__mode-btn${this.current.mode === 'jks' ? ' active' : ''}`;

    const pemBtn = document.createElement('button');
    pemBtn.type = 'button';
    pemBtn.textContent = 'PEM / PFX';
    pemBtn.className = `soap-certs__mode-btn${this.current.mode === 'pem' ? ' active' : ''}`;

    jksBtn.addEventListener('click', () => {
      if (this.current.mode === 'jks') return;
      this.current.mode = 'jks';
      jksBtn.classList.add('active');
      pemBtn.classList.remove('active');
      const content = jksBtn.closest('.soap-certs')?.querySelector('.soap-certs__mode-content') as HTMLElement | null;
      if (content) this.renderModeContent(content);
      this.emit();
    });

    pemBtn.addEventListener('click', () => {
      if (this.current.mode === 'pem') return;
      this.current.mode = 'pem';
      pemBtn.classList.add('active');
      jksBtn.classList.remove('active');
      const content = pemBtn.closest('.soap-certs')?.querySelector('.soap-certs__mode-content') as HTMLElement | null;
      if (content) this.renderModeContent(content);
      this.emit();
    });

    bar.appendChild(jksBtn);
    bar.appendChild(pemBtn);
    return bar;
  }

  private renderModeContent(container: HTMLElement): void {
    container.innerHTML = '';
    if (this.current.mode === 'jks') {
      this.renderJksMode(container);
    } else {
      this.renderPemMode(container);
    }
  }

  // ── JKS mode ─────────────────────────────────────────────────────────────

  private renderJksMode(container: HTMLElement): void {
    container.appendChild(this.buildJksStoreBlock({
      label: 'Keystore (keystore.jks)',
      pwLabel: 'Keystore Password',
      source: this.current.keystoreSource ?? 'file',
      currentContent: this.current.keystoreJks,
      currentPath: this.current.keystoreFilePath,
      currentPw: this.current.keystorePassword,
      onContent: (src, content, filePath) => {
        this.current.keystoreSource = src;
        this.current.keystoreJks = content || undefined;
        this.current.keystoreFilePath = filePath;
        this.emit();
      },
      onPassword: (pw) => { this.current.keystorePassword = pw || undefined; this.emit(); },
    }));

    container.appendChild(this.buildJksStoreBlock({
      label: 'Truststore (truststore.jks)',
      pwLabel: 'Truststore Password',
      source: this.current.truststoreSource ?? 'file',
      currentContent: this.current.truststoreJks,
      currentPath: this.current.truststoreFilePath,
      currentPw: this.current.truststorePassword,
      onContent: (src, content, filePath) => {
        this.current.truststoreSource = src;
        this.current.truststoreJks = content || undefined;
        this.current.truststoreFilePath = filePath;
        this.emit();
      },
      onPassword: (pw) => { this.current.truststorePassword = pw || undefined; this.emit(); },
    }));

    const note = document.createElement('p');
    note.className = 'soap-certs__note';
    note.textContent = 'Keystore holds your client cert + key. Truststore holds the server CA certificate.';
    container.appendChild(note);
  }

  private buildJksStoreBlock(opts: {
    label: string;
    pwLabel: string;
    source: 'text' | 'file';
    currentContent: string | undefined;
    currentPath: string | undefined;
    currentPw: string | undefined;
    onContent: (src: 'text' | 'file', content: string, filePath?: string) => void;
    onPassword: (pw: string) => void;
  }): HTMLElement {
    const { label, pwLabel, onContent, onPassword } = opts;
    let srcMode = opts.source;

    const block = document.createElement('div');
    block.className = 'soap-certs__field';

    // Label
    const lbl = document.createElement('label');
    lbl.className = 'soap-certs__label';
    lbl.textContent = label;
    block.appendChild(lbl);

    // Paste / Upload toggle
    const toggle = document.createElement('div');
    toggle.className = 'soap-certs__toggle';

    const pasteBtn = document.createElement('button');
    pasteBtn.type = 'button';
    pasteBtn.textContent = 'Paste';
    pasteBtn.className = `soap-certs__toggle-btn${srcMode === 'text' ? ' active' : ''}`;

    const fileBtn = document.createElement('button');
    fileBtn.type = 'button';
    fileBtn.textContent = 'Upload File';
    fileBtn.className = `soap-certs__toggle-btn${srcMode === 'file' ? ' active' : ''}`;

    toggle.appendChild(pasteBtn);
    toggle.appendChild(fileBtn);
    block.appendChild(toggle);

    // Swappable content area
    const contentArea = document.createElement('div');
    contentArea.className = 'soap-certs__content';
    block.appendChild(contentArea);

    const renderCurrent = () => {
      contentArea.innerHTML = '';
      if (srcMode === 'text') {
        this.buildJksTextArea(contentArea, opts.currentContent ?? '', (val) => {
          onContent('text', val, undefined);
        });
      } else {
        this.buildJksFileRow(contentArea, opts.currentPath, (filePath, base64) => {
          onContent('file', base64, filePath);
        }, () => {
          onContent('file', '', undefined);
        });
      }
    };

    renderCurrent();

    pasteBtn.addEventListener('click', () => {
      if (srcMode === 'text') return;
      srcMode = 'text';
      pasteBtn.classList.add('active');
      fileBtn.classList.remove('active');
      renderCurrent();
    });

    fileBtn.addEventListener('click', () => {
      if (srcMode === 'file') return;
      srcMode = 'file';
      fileBtn.classList.add('active');
      pasteBtn.classList.remove('active');
      renderCurrent();
    });

    // Password field
    const pwInput = document.createElement('input');
    pwInput.type = 'password';
    pwInput.className = 'soap-certs__passphrase';
    pwInput.placeholder = pwLabel;
    pwInput.value = opts.currentPw ?? '';
    pwInput.addEventListener('input', () => onPassword(pwInput.value));
    block.appendChild(pwInput);

    return block;
  }

  private buildJksTextArea(container: HTMLElement, value: string, onChange: (val: string) => void): void {
    const ta = document.createElement('textarea');
    ta.className = 'soap-certs__textarea';
    ta.placeholder = 'Paste base64-encoded JKS content here…';
    ta.spellcheck = false;
    ta.rows = 4;
    ta.value = value;
    ta.addEventListener('input', () => onChange(ta.value));
    container.appendChild(ta);
  }

  private buildJksFileRow(
    container: HTMLElement,
    currentPath: string | undefined,
    onFile: (filePath: string, base64: string) => void,
    onClear: () => void
  ): void {
    const row = document.createElement('div');
    row.className = 'soap-certs__file-row';

    const pathSpan = document.createElement('span');
    pathSpan.className = 'soap-certs__file-path';
    pathSpan.textContent = currentPath ? this.basename(currentPath) : 'No file selected';
    if (currentPath) pathSpan.title = currentPath;

    const browseBtn = document.createElement('button');
    browseBtn.type = 'button';
    browseBtn.className = 'soap-certs__browse-btn';
    browseBtn.textContent = 'Browse…';

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'soap-certs__clear-btn';
    clearBtn.textContent = '×';
    clearBtn.title = 'Remove file';
    clearBtn.style.display = currentPath ? 'inline-flex' : 'none';

    browseBtn.addEventListener('click', async () => {
      const result = await window.apiCourier.files.openDialog();
      if (result.canceled || result.filePaths.length === 0) return;
      const filePath = result.filePaths[0];
      try {
        const res = await window.apiCourier.files.readBinary(filePath);
        pathSpan.textContent = this.basename(filePath);
        pathSpan.title = filePath;
        clearBtn.style.display = 'inline-flex';
        onFile(filePath, res.content);
      } catch {
        pathSpan.textContent = 'Failed to read file';
      }
    });

    clearBtn.addEventListener('click', () => {
      pathSpan.textContent = 'No file selected';
      pathSpan.title = '';
      clearBtn.style.display = 'none';
      onClear();
    });

    row.appendChild(pathSpan);
    row.appendChild(browseBtn);
    row.appendChild(clearBtn);
    container.appendChild(row);
  }

  // ── PEM mode ─────────────────────────────────────────────────────────────

  private renderPemMode(container: HTMLElement): void {
    const fields: PemCertField[] = ['clientCert', 'clientKey', 'caCert', 'pfx'];
    fields.forEach(field => {
      container.appendChild(this.buildPemFieldBlock(field));
    });
    container.appendChild(this.buildPassphraseBlock());
  }

  private buildPemFieldBlock(field: PemCertField): HTMLElement {
    const isPfx = field === 'pfx';
    const block = document.createElement('div');
    block.className = 'soap-certs__field';

    const lbl = document.createElement('label');
    lbl.className = 'soap-certs__label';
    lbl.textContent = PEM_FIELD_LABELS[field];
    block.appendChild(lbl);

    const existing = this.current[field] as SoapCertEntry | undefined;
    const srcMode: 'text' | 'file' = existing?.source ?? 'text';

    if (!isPfx) {
      const toggle = document.createElement('div');
      toggle.className = 'soap-certs__toggle';

      const textBtn = document.createElement('button');
      textBtn.type = 'button';
      textBtn.textContent = 'Paste';
      textBtn.className = `soap-certs__toggle-btn${srcMode === 'text' ? ' active' : ''}`;

      const fileBtn = document.createElement('button');
      fileBtn.type = 'button';
      fileBtn.textContent = 'Upload File';
      fileBtn.className = `soap-certs__toggle-btn${srcMode === 'file' ? ' active' : ''}`;

      toggle.appendChild(textBtn);
      toggle.appendChild(fileBtn);
      block.appendChild(toggle);

      const contentArea = document.createElement('div');
      contentArea.className = 'soap-certs__content';
      block.appendChild(contentArea);

      if (srcMode === 'file') {
        this.renderPemFileRow(field, contentArea, existing?.filePath, existing?.content);
      } else {
        this.renderPemTextArea(field, contentArea, existing?.content ?? '');
      }

      textBtn.addEventListener('click', () => {
        textBtn.classList.add('active');
        fileBtn.classList.remove('active');
        this.renderPemTextArea(field, contentArea, (this.current[field] as SoapCertEntry | undefined)?.content ?? '');
      });
      fileBtn.addEventListener('click', () => {
        fileBtn.classList.add('active');
        textBtn.classList.remove('active');
        const e = this.current[field] as SoapCertEntry | undefined;
        this.renderPemFileRow(field, contentArea, e?.filePath, e?.content);
      });
    } else {
      const contentArea = document.createElement('div');
      contentArea.className = 'soap-certs__content';
      this.renderPemFileRow(field, contentArea, existing?.filePath, existing?.content);
      block.appendChild(contentArea);
    }

    return block;
  }

  private renderPemTextArea(field: PemCertField, container: HTMLElement, value: string): void {
    container.innerHTML = '';
    const ta = document.createElement('textarea');
    ta.className = 'soap-certs__textarea';
    ta.placeholder = `Paste ${PEM_FIELD_LABELS[field]} here…`;
    ta.spellcheck = false;
    ta.rows = 5;
    ta.value = value;

    ta.addEventListener('input', () => {
      (this.current[field] as SoapCertEntry | undefined);
      this.current[field] = { source: 'text', content: ta.value };
      this.emit();
    });

    container.appendChild(ta);

    if ((this.current[field] as SoapCertEntry | undefined)?.source === 'file') {
      this.current[field] = { source: 'text', content: value };
      this.emit();
    }
  }

  private renderPemFileRow(field: PemCertField, container: HTMLElement, currentPath?: string, currentContent?: string): void {
    container.innerHTML = '';
    const row = document.createElement('div');
    row.className = 'soap-certs__file-row';

    const pathSpan = document.createElement('span');
    pathSpan.className = 'soap-certs__file-path';
    pathSpan.textContent = currentPath ? this.basename(currentPath) : 'No file selected';
    if (currentPath) pathSpan.title = currentPath;

    const browseBtn = document.createElement('button');
    browseBtn.type = 'button';
    browseBtn.className = 'soap-certs__browse-btn';
    browseBtn.textContent = 'Browse…';

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'soap-certs__clear-btn';
    clearBtn.textContent = '×';
    clearBtn.title = 'Remove file';
    clearBtn.style.display = currentPath ? 'inline-flex' : 'none';

    browseBtn.addEventListener('click', async () => {
      const result = await window.apiCourier.files.openDialog();
      if (result.canceled || result.filePaths.length === 0) return;
      const filePath = result.filePaths[0];
      const ext = this.extname(filePath).toLowerCase();
      const isBinary = BINARY_EXTENSIONS.has(ext);
      try {
        let content: string;
        if (isBinary) {
          const res = await window.apiCourier.files.readBinary(filePath);
          content = res.content;
        } else {
          const res = await window.apiCourier.files.readContent(filePath);
          content = res.content;
        }
        this.current[field] = { source: 'file', content, filePath };
        pathSpan.textContent = this.basename(filePath);
        pathSpan.title = filePath;
        clearBtn.style.display = 'inline-flex';
        this.emit();
      } catch {
        pathSpan.textContent = 'Failed to read file';
      }
    });

    clearBtn.addEventListener('click', () => {
      delete this.current[field];
      pathSpan.textContent = 'No file selected';
      pathSpan.title = '';
      clearBtn.style.display = 'none';
      this.emit();
    });

    row.appendChild(pathSpan);
    row.appendChild(browseBtn);
    row.appendChild(clearBtn);
    container.appendChild(row);

    if (currentPath && currentContent) {
      this.current[field] = { source: 'file', content: currentContent, filePath: currentPath };
    }
  }

  private buildPassphraseBlock(): HTMLElement {
    const block = document.createElement('div');
    block.className = 'soap-certs__field';

    const lbl = document.createElement('label');
    lbl.className = 'soap-certs__label';
    lbl.textContent = 'Passphrase';
    block.appendChild(lbl);

    const input = document.createElement('input');
    input.type = 'password';
    input.className = 'soap-certs__passphrase';
    input.placeholder = 'Passphrase for encrypted key or PFX';
    input.value = this.current.passphrase ?? '';
    input.addEventListener('input', () => {
      this.current.passphrase = input.value || undefined;
      this.emit();
    });

    block.appendChild(input);
    return block;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private emit(): void {
    this.onUpdate(this.clone(this.current));
  }

  private clone(certs: SoapCerts): SoapCerts {
    return JSON.parse(JSON.stringify(certs));
  }

  private basename(p: string): string {
    return p.replace(/\\/g, '/').split('/').pop() ?? p;
  }

  private extname(p: string): string {
    const base = this.basename(p);
    const idx = base.lastIndexOf('.');
    return idx >= 0 ? base.slice(idx) : '';
  }
}
