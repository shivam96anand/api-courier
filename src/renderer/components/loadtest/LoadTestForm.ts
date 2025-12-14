import { TargetAdHocEditor } from './TargetAdHocEditor';

interface LoadTestConfig {
  rpm: number;
  durationSec: number;
  target: any;
  followRedirects?: boolean;
  insecureTLS?: boolean;
  requestTimeoutMs?: number;
}

export class LoadTestForm {
  private container: HTMLElement | null = null;
  private targetEditor: TargetAdHocEditor;
  private collections: any[] = [];

  public onStart: ((config: LoadTestConfig) => void) | null = null;

  constructor() {
    this.targetEditor = new TargetAdHocEditor();
  }

  async loadCollections(): Promise<void> {
    try {
      const state = await window.apiCourier.store.get();
      this.collections = this.flattenCollections(state.collections || []);
      this.updateCollectionDropdown();
    } catch (error) {
      console.error('Failed to load collections:', error);
    }
  }

  private updateCollectionDropdown(): void {
    if (!this.container) return;

    const collectionSelect = this.container.querySelector('#collection-select');
    if (!collectionSelect) return;

    collectionSelect.innerHTML = `
      <option value="">Select a request...</option>
      ${this.collections.map(col =>
        `<option value="${col.id}">${col.name}</option>`
      ).join('')}
    `;
  }

  private flattenCollections(collections: any[], result: any[] = []): any[] {
    for (const collection of collections) {
      if (collection.type === 'request' && collection.request) {
        result.push({
          id: collection.request.id,
          name: collection.name,
          request: collection.request
        });
      }
      if (collection.children) {
        this.flattenCollections(collection.children, result);
      }
    }
    return result;
  }

  async render(container: HTMLElement): Promise<void> {
    this.container = container;

    container.innerHTML = `
      <div class="load-test-form">
        <div class="form-main-grid">
          <div class="form-section compact">
            <h3>Test Configuration</h3>
            <div class="form-grid">
              <div class="form-field">
                <label for="rpm-input">Requests per Minute</label>
                <input type="number" id="rpm-input" min="1" max="10000" value="60" class="form-input">
                <small class="form-help">Maximum 10,000 RPM</small>
              </div>

              <div class="form-field">
                <label for="duration-input">Duration</label>
                <div class="duration-input-group">
                  <input type="number" id="duration-value" min="1" value="5" class="form-input duration-value">
                  <select id="duration-unit" class="form-input duration-unit">
                    <option value="seconds">Seconds</option>
                    <option value="minutes" selected>Minutes</option>
                  </select>
                </div>
                <small class="form-help">1 second to 24 hours maximum</small>
              </div>
            </div>
          </div>

          <div class="form-section compact">
            <h3>Target Request</h3>
          <div class="target-selector">
            <div class="radio-group">
              <label class="radio-label">
                <input type="radio" name="target-type" value="collection" class="target-radio">
                <span class="radio-text">From Collections</span>
              </label>
              <label class="radio-label">
                <input type="radio" name="target-type" value="adhoc" class="target-radio" checked>
                <span class="radio-text">Ad-hoc Request</span>
              </label>
            </div>

            <div id="collection-selector" class="target-option" style="display: none;">
              <select id="collection-select" class="form-input">
                <option value="">Select a request...</option>
              </select>
            </div>

            <div id="adhoc-editor" class="target-option">
              <!-- Target editor will be rendered here -->
            </div>
          </div>
          </div>
        </div>

        <div class="form-section">
          <h3>Advanced Options</h3>
          <div class="form-grid two-column">
            <div class="form-field">
              <label class="checkbox-label">
                <input type="checkbox" id="follow-redirects" checked>
                <span class="checkbox-text">Follow Redirects</span>
              </label>
            </div>

            <div class="form-field">
              <label class="checkbox-label">
                <input type="checkbox" id="insecure-tls">
                <span class="checkbox-text">Allow Insecure TLS</span>
              </label>
            </div>

            <div class="form-field">
              <label for="timeout-input">Request Timeout (ms)</label>
              <input type="number" id="timeout-input" min="1000" max="300000" value="30000" class="form-input">
              <small class="form-help">1-300 seconds</small>
            </div>
          </div>
        </div>

        <div class="form-actions">
          <button id="start-test-btn" class="btn btn-primary" type="button">Start Load Test</button>
        </div>

        <div id="validation-errors" class="validation-errors" style="display: none;"></div>
      </div>
    `;

    this.setupEventListeners();
    this.renderTargetEditor();

    // Load collections after DOM is ready
    await this.loadCollections();
  }

  private setupEventListeners(): void {
    if (!this.container) return;

    // Target type radio buttons
    const targetRadios = this.container.querySelectorAll('.target-radio');
    targetRadios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        this.toggleTargetSelector(target.value);
      });
    });

    // Start test button
    const startBtn = this.container.querySelector('#start-test-btn');
    startBtn?.addEventListener('click', () => {
      this.handleStart();
    });

    // Form validation on input
    const inputs = this.container.querySelectorAll('input, select');
    inputs.forEach(input => {
      input.addEventListener('input', () => {
        this.clearValidationErrors();
      });
    });
  }

  private toggleTargetSelector(type: string): void {
    if (!this.container) return;

    const collectionSelector = this.container.querySelector('#collection-selector');
    const adhocEditor = this.container.querySelector('#adhoc-editor');

    if (type === 'collection') {
      collectionSelector?.setAttribute('style', 'display: block;');
      adhocEditor?.setAttribute('style', 'display: none;');
    } else {
      collectionSelector?.setAttribute('style', 'display: none;');
      adhocEditor?.setAttribute('style', 'display: block;');
    }
  }

  private renderTargetEditor(): void {
    if (!this.container) return;

    const editorContainer = this.container.querySelector('#adhoc-editor');
    if (editorContainer) {
      this.targetEditor.render(editorContainer as HTMLElement);
    }
  }

  private handleStart(): void {
    const config = this.buildConfig();
    const errors = this.validateConfig(config);

    if (errors.length > 0) {
      this.showValidationErrors(errors);
      return;
    }

    if (this.onStart) {
      this.onStart(config);
    }
  }

  private buildConfig(): LoadTestConfig {
    if (!this.container) throw new Error('Form not rendered');

    const rpmInput = this.container.querySelector('#rpm-input') as HTMLInputElement;
    const durationValue = this.container.querySelector('#duration-value') as HTMLInputElement;
    const durationUnit = this.container.querySelector('#duration-unit') as HTMLSelectElement;
    const targetType = this.container.querySelector('input[name="target-type"]:checked') as HTMLInputElement;
    const collectionSelect = this.container.querySelector('#collection-select') as HTMLSelectElement;
    const followRedirects = this.container.querySelector('#follow-redirects') as HTMLInputElement;
    const insecureTLS = this.container.querySelector('#insecure-tls') as HTMLInputElement;
    const timeout = this.container.querySelector('#timeout-input') as HTMLInputElement;

    const rpm = parseInt(rpmInput.value);
    const duration = parseInt(durationValue.value);
    const durationSec = durationUnit.value === 'minutes' ? duration * 60 : duration;

    let target: any;
    if (targetType.value === 'collection') {
      target = {
        kind: 'collection',
        requestId: collectionSelect.value
      };
    } else {
      target = this.targetEditor.getTarget();
    }

    return {
      rpm,
      durationSec,
      target,
      followRedirects: followRedirects.checked,
      insecureTLS: insecureTLS.checked,
      requestTimeoutMs: parseInt(timeout.value)
    };
  }

  private validateConfig(config: LoadTestConfig): string[] {
    const errors: string[] = [];

    if (!config.rpm || config.rpm < 1 || config.rpm > 10000) {
      errors.push('RPM must be between 1 and 10,000');
    }

    if (!config.durationSec || config.durationSec < 1 || config.durationSec > 86400) {
      errors.push('Duration must be between 1 second and 24 hours');
    }

    if (config.target.kind === 'collection' && !config.target.requestId) {
      errors.push('Please select a request from collections');
    }

    if (config.target.kind === 'adhoc') {
      const adhocErrors = this.targetEditor.validate();
      errors.push(...adhocErrors);
    }

    if (!config.requestTimeoutMs || config.requestTimeoutMs < 1000 || config.requestTimeoutMs > 300000) {
      errors.push('Request timeout must be between 1 and 300 seconds');
    }

    return errors;
  }

  private showValidationErrors(errors: string[]): void {
    if (!this.container) return;

    const errorContainer = this.container.querySelector('#validation-errors') as HTMLElement;
    errorContainer.innerHTML = `
      <div class="error-list">
        ${errors.map(error => `<div class="error-item">• ${error}</div>`).join('')}
      </div>
    `;
    errorContainer.style.display = 'block';
  }

  private clearValidationErrors(): void {
    if (!this.container) return;

    const errorContainer = this.container.querySelector('#validation-errors') as HTMLElement;
    errorContainer.style.display = 'none';
  }

  prefillConfig(config: LoadTestConfig): void {
    if (!this.container) return;

    const rpmInput = this.container.querySelector('#rpm-input') as HTMLInputElement;
    const durationValue = this.container.querySelector('#duration-value') as HTMLInputElement;
    const durationUnit = this.container.querySelector('#duration-unit') as HTMLSelectElement;
    const followRedirects = this.container.querySelector('#follow-redirects') as HTMLInputElement;
    const insecureTLS = this.container.querySelector('#insecure-tls') as HTMLInputElement;
    const timeout = this.container.querySelector('#timeout-input') as HTMLInputElement;

    rpmInput.value = config.rpm.toString();

    if (config.durationSec >= 60 && config.durationSec % 60 === 0) {
      durationValue.value = (config.durationSec / 60).toString();
      durationUnit.value = 'minutes';
    } else {
      durationValue.value = config.durationSec.toString();
      durationUnit.value = 'seconds';
    }

    followRedirects.checked = config.followRedirects !== false;
    insecureTLS.checked = config.insecureTLS === true;
    timeout.value = (config.requestTimeoutMs || 30000).toString();

    if (config.target.kind === 'collection') {
      const collectionRadio = this.container.querySelector('input[value="collection"]') as HTMLInputElement;
      const collectionSelect = this.container.querySelector('#collection-select') as HTMLSelectElement;
      collectionRadio.checked = true;
      collectionSelect.value = config.target.requestId;
      this.toggleTargetSelector('collection');
    } else {
      const adhocRadio = this.container.querySelector('input[value="adhoc"]') as HTMLInputElement;
      adhocRadio.checked = true;
      this.toggleTargetSelector('adhoc');
      this.targetEditor.prefillTarget(config.target);
    }
  }
}