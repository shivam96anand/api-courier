type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

interface LoadTestTargetAdHoc {
  kind: 'adhoc';
  method: HttpMethod;
  url: string;
  params?: Record<string, string | number | boolean>;
  headers?: Record<string, string>;
  auth?: { type: 'none' | 'basic' | 'bearer' | 'apikey' | 'oauth2'; data?: unknown };
  body?: {
    type: 'none' | 'json' | 'raw' | 'form-data' | 'form-urlencoded';
    content: string;
  };
}

export class TargetAdHocEditor {
  private container: HTMLElement | null = null;
  private activeTab = 'params';

  render(container: HTMLElement): void {
    this.container = container;

    container.innerHTML = `
      <div class="target-adhoc-editor">
        <div class="request-line">
          <select id="target-method" class="method-select">
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="PATCH">PATCH</option>
            <option value="DELETE">DELETE</option>
            <option value="HEAD">HEAD</option>
            <option value="OPTIONS">OPTIONS</option>
          </select>
          <input type="text" id="target-url" class="url-input" placeholder="Enter request URL">
        </div>

        <div class="target-details">
          <div class="tabs">
            <button class="tab active" data-section="params">Params</button>
            <button class="tab" data-section="headers">Headers</button>
            <button class="tab" data-section="auth">Auth</button>
            <button class="tab" data-section="body">Body</button>
          </div>

          <div id="target-params-section" class="section active">
            <div class="key-value-editor" id="target-params-editor">
              <div class="kv-row">
                <input type="checkbox" class="kv-checkbox" checked>
                <input type="text" placeholder="Key" class="key-input">
                <input type="text" placeholder="Value" class="value-input">
                <button class="remove-btn" type="button">×</button>
              </div>
            </div>
            <button class="add-param-btn" type="button">Add Parameter</button>
          </div>

          <div id="target-headers-section" class="section">
            <div class="key-value-editor" id="target-headers-editor">
              <div class="kv-row">
                <input type="checkbox" class="kv-checkbox" checked>
                <input type="text" placeholder="Key" class="key-input">
                <input type="text" placeholder="Value" class="value-input">
                <button class="remove-btn" type="button">×</button>
              </div>
            </div>
            <button class="add-header-btn" type="button">Add Header</button>
          </div>

          <div id="target-auth-section" class="section">
            <select id="target-auth-type" class="form-input">
              <option value="none">No Auth</option>
              <option value="basic">Basic Auth</option>
              <option value="bearer">Bearer Token</option>
              <option value="apikey">API Key</option>
            </select>
            <div id="target-auth-config" class="auth-config"></div>
          </div>

          <div id="target-body-section" class="section">
            <div class="body-type-selector">
              <label><input type="radio" name="target-body-type" value="none" checked> None</label>
              <label><input type="radio" name="target-body-type" value="json"> JSON</label>
              <label><input type="radio" name="target-body-type" value="raw"> Raw</label>
              <label><input type="radio" name="target-body-type" value="form-urlencoded"> Form URL Encoded</label>
            </div>
            <textarea id="target-request-body" class="body-editor" placeholder="Request body"></textarea>
          </div>
        </div>
      </div>
    `;

    this.setupEventListeners();
    this.setupAuthConfig();
  }

  private setupEventListeners(): void {
    if (!this.container) return;

    // Tab switching
    const tabs = this.container.querySelectorAll('.tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const section = target.dataset.section;
        if (section) {
          this.switchTab(section);
        }
      });
    });

    // Add parameter button
    const addParamBtn = this.container.querySelector('.add-param-btn');
    addParamBtn?.addEventListener('click', () => {
      this.addKeyValueRow('target-params-editor');
    });

    // Add header button
    const addHeaderBtn = this.container.querySelector('.add-header-btn');
    addHeaderBtn?.addEventListener('click', () => {
      this.addKeyValueRow('target-headers-editor');
    });

    // Auth type change
    const authType = this.container.querySelector('#target-auth-type');
    authType?.addEventListener('change', () => {
      this.setupAuthConfig();
    });

    // Body type change
    const bodyTypeRadios = this.container.querySelectorAll('input[name="target-body-type"]');
    bodyTypeRadios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        this.toggleBodyEditor(target.value);
      });
    });

    // Remove button delegation
    this.container.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('remove-btn')) {
        const row = target.closest('.kv-row');
        if (row) {
          row.remove();
        }
      }
    });
  }

  private switchTab(section: string): void {
    if (!this.container) return;

    this.activeTab = section;

    // Update tab active state
    this.container.querySelectorAll('.tab').forEach(tab => {
      tab.classList.remove('active');
    });
    this.container.querySelector(`[data-section="${section}"]`)?.classList.add('active');

    // Show appropriate section
    this.container.querySelectorAll('.section').forEach(sec => {
      sec.classList.remove('active');
    });
    this.container.querySelector(`#target-${section}-section`)?.classList.add('active');
  }

  private addKeyValueRow(editorId: string): void {
    if (!this.container) return;

    const editor = this.container.querySelector(`#${editorId}`);
    if (!editor) return;

    const row = document.createElement('div');
    row.className = 'kv-row';
    row.innerHTML = `
      <input type="checkbox" class="kv-checkbox" checked>
      <input type="text" placeholder="Key" class="key-input">
      <input type="text" placeholder="Value" class="value-input">
      <button class="remove-btn" type="button">×</button>
    `;

    editor.appendChild(row);
  }

  private setupAuthConfig(): void {
    if (!this.container) return;

    const authType = this.container.querySelector('#target-auth-type') as HTMLSelectElement;
    const authConfig = this.container.querySelector('#target-auth-config') as HTMLElement;

    authConfig.innerHTML = '';

    switch (authType.value) {
      case 'basic':
        authConfig.innerHTML = `
          <input type="text" placeholder="Username" class="auth-input" id="auth-username">
          <input type="password" placeholder="Password" class="auth-input" id="auth-password">
        `;
        break;
      case 'bearer':
        authConfig.innerHTML = `
          <input type="text" placeholder="Token" class="auth-input" id="auth-token">
        `;
        break;
      case 'apikey':
        authConfig.innerHTML = `
          <input type="text" placeholder="Key" class="auth-input" id="auth-key">
          <input type="text" placeholder="Value" class="auth-input" id="auth-value">
          <select class="auth-input" id="auth-location">
            <option value="header">Header</option>
            <option value="query">Query Parameter</option>
          </select>
        `;
        break;
    }
  }

  private toggleBodyEditor(type: string): void {
    if (!this.container) return;

    const bodyEditor = this.container.querySelector('#target-request-body') as HTMLTextAreaElement;

    if (type === 'none') {
      bodyEditor.style.display = 'none';
      bodyEditor.value = '';
    } else {
      bodyEditor.style.display = 'block';
      if (type === 'json' && !bodyEditor.value) {
        bodyEditor.value = '{\n  \n}';
      }
    }
  }

  getTarget(): LoadTestTargetAdHoc {
    if (!this.container) throw new Error('Editor not rendered');

    const method = (this.container.querySelector('#target-method') as HTMLSelectElement).value as HttpMethod;
    const url = (this.container.querySelector('#target-url') as HTMLInputElement).value;

    const target: LoadTestTargetAdHoc = {
      kind: 'adhoc',
      method,
      url
    };

    // Get params
    target.params = this.getKeyValuePairs('target-params-editor');

    // Get headers
    target.headers = this.getKeyValuePairs('target-headers-editor');

    // Get auth
    target.auth = this.getAuthConfig();

    // Get body
    target.body = this.getBodyConfig();

    return target;
  }

  private getKeyValuePairs(editorId: string): Record<string, string> {
    if (!this.container) return {};

    const editor = this.container.querySelector(`#${editorId}`);
    if (!editor) return {};

    const pairs: Record<string, string> = {};
    const rows = editor.querySelectorAll('.kv-row');

    rows.forEach(row => {
      const checkbox = row.querySelector('.kv-checkbox') as HTMLInputElement;
      const keyInput = row.querySelector('.key-input') as HTMLInputElement;
      const valueInput = row.querySelector('.value-input') as HTMLInputElement;

      if (checkbox.checked && keyInput.value.trim() && valueInput.value.trim()) {
        pairs[keyInput.value.trim()] = valueInput.value.trim();
      }
    });

    return pairs;
  }

  private getAuthConfig(): { type: 'none' | 'basic' | 'bearer' | 'apikey'; data?: any } {
    if (!this.container) return { type: 'none' };

    const authType = (this.container.querySelector('#target-auth-type') as HTMLSelectElement).value;

    if (authType === 'none') {
      return { type: 'none' };
    }

    const data: any = {};

    switch (authType) {
      case 'basic':
        const username = this.container.querySelector('#auth-username') as HTMLInputElement;
        const password = this.container.querySelector('#auth-password') as HTMLInputElement;
        data.username = username?.value || '';
        data.password = password?.value || '';
        break;
      case 'bearer':
        const token = this.container.querySelector('#auth-token') as HTMLInputElement;
        data.token = token?.value || '';
        break;
      case 'apikey':
        const key = this.container.querySelector('#auth-key') as HTMLInputElement;
        const value = this.container.querySelector('#auth-value') as HTMLInputElement;
        const location = this.container.querySelector('#auth-location') as HTMLSelectElement;
        data.key = key?.value || '';
        data.value = value?.value || '';
        data.location = location?.value || 'header';
        break;
    }

    return { type: authType as any, data };
  }

  private getBodyConfig(): { type: 'none' | 'json' | 'raw' | 'form-urlencoded'; content: string } {
    if (!this.container) return { type: 'none', content: '' };

    const bodyType = this.container.querySelector('input[name="target-body-type"]:checked') as HTMLInputElement;
    const bodyContent = this.container.querySelector('#target-request-body') as HTMLTextAreaElement;

    return {
      type: bodyType.value as any,
      content: bodyContent.value || ''
    };
  }

  validate(): string[] {
    const errors: string[] = [];
    const target = this.getTarget();

    if (!target.url.trim()) {
      errors.push('URL is required');
    } else {
      try {
        new URL(target.url);
      } catch {
        errors.push('Invalid URL format');
      }
    }

    return errors;
  }

  prefillTarget(target: LoadTestTargetAdHoc): void {
    if (!this.container) return;

    const methodSelect = this.container.querySelector('#target-method') as HTMLSelectElement;
    const urlInput = this.container.querySelector('#target-url') as HTMLInputElement;

    methodSelect.value = target.method;
    urlInput.value = target.url;

    // Prefill params
    if (target.params) {
      this.prefillKeyValuePairs('target-params-editor', target.params);
    }

    // Prefill headers
    if (target.headers) {
      this.prefillKeyValuePairs('target-headers-editor', target.headers);
    }

    // Prefill auth
    if (target.auth) {
      this.prefillAuth(target.auth);
    }

    // Prefill body
    if (target.body) {
      this.prefillBody(target.body);
    }
  }

  private prefillKeyValuePairs(editorId: string, data: Record<string, any>): void {
    if (!this.container) return;

    const editor = this.container.querySelector(`#${editorId}`);
    if (!editor) return;

    // Clear existing rows except the first one
    const rows = editor.querySelectorAll('.kv-row');
    for (let i = 1; i < rows.length; i++) {
      rows[i].remove();
    }

    // Fill data
    const entries = Object.entries(data);
    entries.forEach((entry, index) => {
      let row: Element;
      if (index === 0) {
        row = rows[0];
      } else {
        // Add new row
        if (editorId.includes('params')) {
          this.addKeyValueRow('target-params-editor');
        } else {
          this.addKeyValueRow('target-headers-editor');
        }
        const allRows = editor.querySelectorAll('.kv-row');
        row = allRows[allRows.length - 1];
      }

      const keyInput = row.querySelector('.key-input') as HTMLInputElement;
      const valueInput = row.querySelector('.value-input') as HTMLInputElement;
      const checkbox = row.querySelector('.kv-checkbox') as HTMLInputElement;

      keyInput.value = entry[0];
      valueInput.value = String(entry[1]);
      checkbox.checked = true;
    });
  }

  private prefillAuth(auth: any): void {
    if (!this.container) return;

    const authType = this.container.querySelector('#target-auth-type') as HTMLSelectElement;
    authType.value = auth.type;
    this.setupAuthConfig();

    if (auth.data) {
      setTimeout(() => {
        switch (auth.type) {
          case 'basic':
            const username = this.container!.querySelector('#auth-username') as HTMLInputElement;
            const password = this.container!.querySelector('#auth-password') as HTMLInputElement;
            if (username) username.value = auth.data.username || '';
            if (password) password.value = auth.data.password || '';
            break;
          case 'bearer':
            const token = this.container!.querySelector('#auth-token') as HTMLInputElement;
            if (token) token.value = auth.data.token || '';
            break;
          case 'apikey':
            const key = this.container!.querySelector('#auth-key') as HTMLInputElement;
            const value = this.container!.querySelector('#auth-value') as HTMLInputElement;
            const location = this.container!.querySelector('#auth-location') as HTMLSelectElement;
            if (key) key.value = auth.data.key || '';
            if (value) value.value = auth.data.value || '';
            if (location) location.value = auth.data.location || 'header';
            break;
        }
      }, 0);
    }
  }

  private prefillBody(body: any): void {
    if (!this.container) return;

    const bodyTypeRadio = this.container.querySelector(`input[name="target-body-type"][value="${body.type}"]`) as HTMLInputElement;
    const bodyContent = this.container.querySelector('#target-request-body') as HTMLTextAreaElement;

    if (bodyTypeRadio) {
      bodyTypeRadio.checked = true;
      this.toggleBodyEditor(body.type);
    }

    if (bodyContent) {
      bodyContent.value = body.content || '';
    }
  }
}