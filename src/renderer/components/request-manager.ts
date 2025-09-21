import { ApiRequest } from '../../shared/types';

export class RequestManager {
  private currentRequest: ApiRequest | null = null;

  initialize(): void {
    this.setupRequestForm();
    this.setupRequestTabs();
    this.setupSendButton();
    this.listenToTabChanges();
    this.showEmptyState(); // Show empty state initially
  }

  private setupRequestForm(): void {
    const methodSelect = document.getElementById('request-method') as HTMLSelectElement;
    const urlInput = document.getElementById('request-url') as HTMLInputElement;

    if (methodSelect) {
      methodSelect.addEventListener('change', () => {
        this.updateCurrentRequest({ method: methodSelect.value as any });
      });
    }

    if (urlInput) {
      urlInput.addEventListener('input', () => {
        this.updateCurrentRequest({ url: urlInput.value });
      });
    }
  }

  private setupRequestTabs(): void {
    const tabs = document.querySelectorAll('.request-details .tab');
    const sections = document.querySelectorAll('.request-details .section');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const sectionName = (tab as HTMLElement).dataset.section;

        tabs.forEach(t => t.classList.remove('active'));
        sections.forEach(s => s.classList.remove('active'));

        tab.classList.add('active');
        const section = document.getElementById(`${sectionName}-section`);
        if (section) {
          section.classList.add('active');
        }
      });
    });

    this.setupParamsEditor();
    this.setupHeadersEditor();
    this.setupBodyEditor();
    this.setupAuthEditor();
  }

  private setupParamsEditor(): void {
    const addParamBtn = document.querySelector('.add-param-btn');
    const paramsEditor = document.getElementById('params-editor');

    if (addParamBtn && paramsEditor) {
      addParamBtn.addEventListener('click', () => {
        this.addParamRow();
      });

      paramsEditor.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.classList.contains('remove-btn')) {
          const row = target.closest('.kv-row');
          if (row && paramsEditor.children.length > 1) {
            row.remove();
            this.updateParamsFromDOM();
          }
        }
      });

      paramsEditor.addEventListener('input', () => {
        this.updateParamsFromDOM();
      });
    }
  }

  private addParamRow(): void {
    const paramsEditor = document.getElementById('params-editor');
    if (!paramsEditor) return;

    const row = document.createElement('div');
    row.className = 'kv-row';
    row.innerHTML = `
      <input type="text" placeholder="Key" class="key-input">
      <input type="text" placeholder="Value" class="value-input">
      <button class="remove-btn">×</button>
    `;

    paramsEditor.appendChild(row);
  }

  private updateParamsFromDOM(): void {
    const paramsEditor = document.getElementById('params-editor');
    if (!paramsEditor) return;

    const params: Record<string, string> = {};
    const rows = paramsEditor.querySelectorAll('.kv-row');

    rows.forEach(row => {
      const keyInput = row.querySelector('.key-input') as HTMLInputElement;
      const valueInput = row.querySelector('.value-input') as HTMLInputElement;

      if (keyInput && valueInput && keyInput.value.trim()) {
        params[keyInput.value.trim()] = valueInput.value.trim();
      }
    });

    this.updateCurrentRequest({ params });
  }

  private setupHeadersEditor(): void {
    const addHeaderBtn = document.querySelector('.add-header-btn');
    const headersEditor = document.getElementById('headers-editor');

    if (addHeaderBtn && headersEditor) {
      addHeaderBtn.addEventListener('click', () => {
        this.addHeaderRow();
      });

      headersEditor.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.classList.contains('remove-btn')) {
          const row = target.closest('.kv-row');
          if (row && headersEditor.children.length > 1) {
            row.remove();
            this.updateHeadersFromDOM();
          }
        }
      });

      headersEditor.addEventListener('input', () => {
        this.updateHeadersFromDOM();
      });
    }
  }

  private addHeaderRow(): void {
    const headersEditor = document.getElementById('headers-editor');
    if (!headersEditor) return;

    const row = document.createElement('div');
    row.className = 'kv-row';
    row.innerHTML = `
      <input type="text" placeholder="Key" class="key-input">
      <input type="text" placeholder="Value" class="value-input">
      <button class="remove-btn">×</button>
    `;

    headersEditor.appendChild(row);
  }

  private updateHeadersFromDOM(): void {
    const headersEditor = document.getElementById('headers-editor');
    if (!headersEditor) return;

    const headers: Record<string, string> = {};
    const rows = headersEditor.querySelectorAll('.kv-row');

    rows.forEach(row => {
      const keyInput = row.querySelector('.key-input') as HTMLInputElement;
      const valueInput = row.querySelector('.value-input') as HTMLInputElement;

      if (keyInput && valueInput && keyInput.value.trim()) {
        headers[keyInput.value.trim()] = valueInput.value.trim();
      }
    });

    this.updateCurrentRequest({ headers });
  }

  private setupBodyEditor(): void {
    const bodyTypeInputs = document.querySelectorAll('input[name="body-type"]');
    const bodyEditor = document.getElementById('request-body') as HTMLTextAreaElement;

    bodyTypeInputs.forEach(input => {
      input.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        const bodyType = target.value;

        if (bodyEditor) {
          bodyEditor.style.display = bodyType === 'none' ? 'none' : 'block';
        }

        this.updateCurrentRequest({
          body: {
            type: bodyType as any,
            content: bodyEditor ? bodyEditor.value : ''
          }
        });
      });
    });

    if (bodyEditor) {
      bodyEditor.addEventListener('input', () => {
        const bodyType = (document.querySelector('input[name="body-type"]:checked') as HTMLInputElement)?.value || 'none';

        this.updateCurrentRequest({
          body: {
            type: bodyType as any,
            content: bodyEditor.value
          }
        });
      });
    }
  }

  private setupAuthEditor(): void {
    const authTypeSelect = document.getElementById('auth-type') as HTMLSelectElement;
    const authConfig = document.getElementById('auth-config');

    if (authTypeSelect && authConfig) {
      authTypeSelect.addEventListener('change', () => {
        this.renderAuthConfig(authTypeSelect.value);
      });
    }
  }

  private renderAuthConfig(authType: string): void {
    const authConfig = document.getElementById('auth-config');
    if (!authConfig) return;

    authConfig.innerHTML = '';

    const configs: Record<string, string[]> = {
      basic: ['username', 'password'],
      bearer: ['token'],
      'api-key': ['key', 'value', 'location'],
    };

    const fields = configs[authType] || [];

    fields.forEach(field => {
      const input = document.createElement('input');
      input.type = field === 'password' ? 'password' : 'text';
      input.placeholder = field.charAt(0).toUpperCase() + field.slice(1);
      input.dataset.field = field;

      if (field === 'location') {
        const select = document.createElement('select');
        select.dataset.field = field;
        select.innerHTML = '<option value="header">Header</option><option value="query">Query</option>';
        authConfig.appendChild(select);
      } else {
        authConfig.appendChild(input);
      }
    });

    authConfig.addEventListener('input', () => {
      this.updateAuthFromDOM(authType);
    });
  }

  private updateAuthFromDOM(authType: string): void {
    const authConfig = document.getElementById('auth-config');
    if (!authConfig) return;

    const config: Record<string, string> = {};
    const inputs = authConfig.querySelectorAll('input, select');

    inputs.forEach(input => {
      const field = (input as HTMLElement).dataset.field;
      const value = (input as HTMLInputElement | HTMLSelectElement).value;

      if (field) {
        config[field] = value;
      }
    });

    this.updateCurrentRequest({
      auth: {
        type: authType as any,
        config
      }
    });
  }

  private setupSendButton(): void {
    const sendBtn = document.getElementById('send-request');

    if (sendBtn) {
      sendBtn.addEventListener('click', async () => {
        await this.sendRequest();
      });
    }
  }

  private async sendRequest(): Promise<void> {
    if (!this.currentRequest) return;

    const sendBtn = document.getElementById('send-request');
    if (sendBtn) {
      sendBtn.textContent = 'Sending...';
      (sendBtn as HTMLButtonElement).disabled = true;
    }

    try {
      const response = await window.apiCourier.request.send(this.currentRequest);

      const event = new CustomEvent('response-received', {
        detail: { response, request: this.currentRequest }
      });
      document.dispatchEvent(event);
    } catch (error) {
      console.error('Request failed:', error);
      this.showError('Request failed: ' + (error as Error).message);
    } finally {
      if (sendBtn) {
        sendBtn.textContent = 'Send';
        (sendBtn as HTMLButtonElement).disabled = false;
      }
    }
  }

  private listenToTabChanges(): void {
    document.addEventListener('tab-changed', (e: Event) => {
      const customEvent = e as CustomEvent;
      const activeTab = customEvent.detail.activeTab;
      if (activeTab) {
        this.loadRequest(activeTab.request);
      } else {
        this.loadRequest(null);
      }
    });
  }


  private loadRequest(request: ApiRequest | null): void {
    this.currentRequest = request;

    const requestForm = document.querySelector('.request-form') as HTMLElement;
    const emptyState = document.getElementById('request-empty-state');

    if (!request) {
      this.clearForm();
      if (requestForm) requestForm.style.display = 'none';
      this.showEmptyState();
      return;
    }

    if (requestForm) requestForm.style.display = 'block';
    if (emptyState) emptyState.style.display = 'none';

    // Load method and URL
    const methodSelect = document.getElementById('request-method') as HTMLSelectElement;
    const urlInput = document.getElementById('request-url') as HTMLInputElement;

    if (methodSelect) methodSelect.value = request.method;
    if (urlInput) urlInput.value = request.url;

    // Load params
    this.loadParams(request.params || {});

    // Load headers
    this.loadHeaders(request.headers);

    // Load body
    if (request.body) {
      this.loadBody(request.body);
    }

    // Load auth
    if (request.auth) {
      this.loadAuth(request.auth);
    }
  }

  private loadParams(params: Record<string, string>): void {
    const paramsEditor = document.getElementById('params-editor');
    if (!paramsEditor) return;

    paramsEditor.innerHTML = '';

    Object.entries(params).forEach(([key, value]) => {
      const row = document.createElement('div');
      row.className = 'kv-row';
      row.innerHTML = `
        <input type="text" placeholder="Key" class="key-input" value="${key}">
        <input type="text" placeholder="Value" class="value-input" value="${value}">
        <button class="remove-btn">×</button>
      `;
      paramsEditor.appendChild(row);
    });

    if (paramsEditor.children.length === 0) {
      this.addParamRow();
    }
  }

  private loadHeaders(headers: Record<string, string>): void {
    const headersEditor = document.getElementById('headers-editor');
    if (!headersEditor) return;

    headersEditor.innerHTML = '';

    Object.entries(headers).forEach(([key, value]) => {
      const row = document.createElement('div');
      row.className = 'kv-row';
      row.innerHTML = `
        <input type="text" placeholder="Key" class="key-input" value="${key}">
        <input type="text" placeholder="Value" class="value-input" value="${value}">
        <button class="remove-btn">×</button>
      `;
      headersEditor.appendChild(row);
    });

    if (headersEditor.children.length === 0) {
      this.addHeaderRow();
    }
  }

  private loadBody(body: { type: string; content: string }): void {
    const bodyTypeInput = document.querySelector(`input[name="body-type"][value="${body.type}"]`) as HTMLInputElement;
    const bodyEditor = document.getElementById('request-body') as HTMLTextAreaElement;

    if (bodyTypeInput) {
      bodyTypeInput.checked = true;
    }

    if (bodyEditor) {
      bodyEditor.value = body.content;
      bodyEditor.style.display = body.type === 'none' ? 'none' : 'block';
    }
  }

  private loadAuth(auth: { type: string; config: Record<string, string> }): void {
    const authTypeSelect = document.getElementById('auth-type') as HTMLSelectElement;

    if (authTypeSelect) {
      authTypeSelect.value = auth.type;
      this.renderAuthConfig(auth.type);

      // Load auth config values
      setTimeout(() => {
        const authConfig = document.getElementById('auth-config');
        if (authConfig) {
          Object.entries(auth.config).forEach(([field, value]) => {
            const input = authConfig.querySelector(`[data-field="${field}"]`) as HTMLInputElement;
            if (input) {
              input.value = value;
            }
          });
        }
      }, 0);
    }
  }

  private clearForm(): void {
    const methodSelect = document.getElementById('request-method') as HTMLSelectElement;
    const urlInput = document.getElementById('request-url') as HTMLInputElement;
    const bodyEditor = document.getElementById('request-body') as HTMLTextAreaElement;

    if (methodSelect) methodSelect.value = 'GET';
    if (urlInput) urlInput.value = '';
    if (bodyEditor) bodyEditor.value = '';

    // Clear params
    const paramsEditor = document.getElementById('params-editor');
    if (paramsEditor) {
      paramsEditor.innerHTML = '';
      this.addParamRow();
    }

    // Clear headers
    const headersEditor = document.getElementById('headers-editor');
    if (headersEditor) {
      headersEditor.innerHTML = '';
      this.addHeaderRow();
    }

    // Reset body type
    const noneBodyType = document.querySelector('input[name="body-type"][value="none"]') as HTMLInputElement;
    if (noneBodyType) {
      noneBodyType.checked = true;
    }

    // Reset auth
    const authTypeSelect = document.getElementById('auth-type') as HTMLSelectElement;
    if (authTypeSelect) {
      authTypeSelect.value = 'none';
      this.renderAuthConfig('none');
    }
  }

  private updateCurrentRequest(updates: Partial<ApiRequest>): void {
    if (!this.currentRequest) return;

    this.currentRequest = { ...this.currentRequest, ...updates };

    const event = new CustomEvent('request-updated', {
      detail: { request: this.currentRequest }
    });
    document.dispatchEvent(event);
  }

  private showError(message: string): void {
    const errorDiv = document.createElement('div');
    errorDiv.textContent = message;
    errorDiv.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: var(--error-color);
      color: white;
      padding: 12px 16px;
      border-radius: 4px;
      z-index: 10001;
      font-size: 14px;
      max-width: 300px;
      word-wrap: break-word;
    `;

    document.body.appendChild(errorDiv);
    setTimeout(() => {
      if (document.body.contains(errorDiv)) {
        document.body.removeChild(errorDiv);
      }
    }, 5000);
  }

  private showEmptyState(): void {
    const requestPanel = document.querySelector('.request-panel');
    if (!requestPanel) return;

    // Hide the request form
    const requestForm = document.querySelector('.request-form') as HTMLElement;
    if (requestForm) requestForm.style.display = 'none';

    // Check if empty state already exists
    let emptyState = document.getElementById('request-empty-state');
    if (!emptyState) {
      emptyState = document.createElement('div');
      emptyState.id = 'request-empty-state';
      emptyState.style.cssText = `
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        flex: 1;
        color: var(--text-secondary);
        font-size: 14px;
        text-align: center;
        padding: 40px 20px;
      `;

      const icon = document.createElement('div');
      icon.textContent = '📄';
      icon.style.cssText = `
        font-size: 48px;
        margin-bottom: 16px;
        opacity: 0.5;
      `;

      const title = document.createElement('h3');
      title.textContent = 'No Request Selected';
      title.style.cssText = `
        margin: 0 0 8px 0;
        color: var(--text-primary);
        font-size: 16px;
        font-weight: 500;
      `;

      const description = document.createElement('p');
      description.textContent = 'Select a request from collections or create a new request tab to get started';
      description.style.cssText = `
        margin: 0;
        line-height: 1.5;
        max-width: 300px;
      `;

      emptyState.appendChild(icon);
      emptyState.appendChild(title);
      emptyState.appendChild(description);
      requestPanel.appendChild(emptyState);
    } else {
      emptyState.style.display = 'flex';
    }
  }
}