import type { KeyValuePair } from '../../../../shared/types';
import { addVariableHighlighting } from '../variable-helper';
import { setupAutocomplete } from '../variable-autocomplete';

export class HeadersManager {
  private container: HTMLElement;
  private onUpdateCallback: ((headers: KeyValuePair[]) => void) | null = null;
  private activeEnvironment: any;
  private globals: any;
  private folderVars: any;

  constructor(container: HTMLElement) {
    this.container = container;
    this.setupEventListeners();
  }

  public setVariableContext(
    activeEnvironment: any,
    globals: any,
    folderVars?: any
  ): void {
    this.activeEnvironment = activeEnvironment;
    this.globals = globals;
    this.folderVars = folderVars;

    // Setup variable support for all existing inputs
    const headersEditor = this.container.querySelector('#headers-editor');
    if (headersEditor) {
      const rows = headersEditor.querySelectorAll('.kv-row');
      rows.forEach((row) => {
        const keyInput = row.querySelector('.key-input') as HTMLInputElement;
        const valueInput = row.querySelector(
          '.value-input'
        ) as HTMLInputElement;
        if (keyInput) {
          this.addVariableSupport(keyInput);
        }
        if (valueInput) {
          this.addVariableSupport(valueInput);
        }
      });
    }
  }

  private setupEventListeners(): void {
    const addHeaderBtn = this.container.querySelector('.add-header-btn');
    const headersEditor = this.container.querySelector('#headers-editor');

    if (addHeaderBtn && headersEditor) {
      addHeaderBtn.addEventListener('click', () => {
        this.addHeaderRow();
      });

      headersEditor.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.classList.contains('remove-btn')) {
          const row = target.closest('.kv-row');
          if (row) {
            row.remove();
            this.updateHeadersFromDOM();
            // Add a new empty row if no rows left
            if (headersEditor.children.length === 0) {
              this.addHeaderRow();
            }
          }
        }
      });

      headersEditor.addEventListener('input', () => {
        this.ensureTrailingEmptyRow();
        this.updateHeadersFromDOM();
      });

      headersEditor.addEventListener('change', (e) => {
        if ((e.target as HTMLElement).classList.contains('kv-checkbox')) {
          this.updateRowVisualState(e.target as HTMLInputElement);
        }
        this.updateHeadersFromDOM();
      });
    }
  }

  private addHeaderRow(): void {
    const headersEditor = this.container.querySelector('#headers-editor');
    if (!headersEditor) return;

    const row = document.createElement('div');
    row.className = 'kv-row';
    row.innerHTML = `
      <input type="checkbox" class="kv-checkbox" checked>
      <input type="text" placeholder="Key" class="key-input">
      <input type="text" placeholder="Value" class="value-input">
      <button class="remove-btn">×</button>
    `;

    headersEditor.appendChild(row);

    // Add variable support to new inputs (context will be available via callback)
    const keyInput = row.querySelector('.key-input') as HTMLInputElement;
    const valueInput = row.querySelector('.value-input') as HTMLInputElement;

    if (keyInput) {
      this.addVariableSupport(keyInput);
    }
    if (valueInput) {
      this.addVariableSupport(valueInput);
    }
  }

  private addVariableSupport(input: HTMLInputElement): void {
    // Attach once, but always refresh decorations with the latest context
    if (!(input as any).__variableSupportSetup) {
      (input as any).__variableSupportSetup = true;
      input.addEventListener('input', () => {
        this.refreshVariableDecorations(input);
      });
    }

    this.refreshVariableDecorations(input);

    // Setup autocomplete for variable suggestions (context fetched dynamically via callback)
    setupAutocomplete(input, () => ({
      activeEnvironment: this.activeEnvironment,
      globals: this.globals,
      folderVars: this.folderVars || {},
    }));
  }

  private refreshVariableDecorations(input: HTMLInputElement): void {
    // Only use addVariableHighlighting - it handles both coloring and tooltips on hover
    addVariableHighlighting(
      input,
      this.activeEnvironment,
      this.globals,
      this.folderVars
    );
  }

  /**
   * Postman-style affordance: auto-append a fresh empty row as soon as the
   * user starts typing in the last row, so they never have to click
   * "Add Header". Mirrors ParamsManager.ensureTrailingEmptyRow.
   */
  private ensureTrailingEmptyRow(): void {
    const headersEditor = this.container.querySelector('#headers-editor');
    if (!headersEditor) return;
    const rows = headersEditor.querySelectorAll('.kv-row');
    if (rows.length === 0) return;
    const lastRow = rows[rows.length - 1];
    const keyInput = lastRow.querySelector('.key-input') as HTMLInputElement;
    const valueInput = lastRow.querySelector(
      '.value-input'
    ) as HTMLInputElement;
    const lastIsNonEmpty =
      (keyInput?.value || '').trim() !== '' ||
      (valueInput?.value || '').trim() !== '';
    if (lastIsNonEmpty) {
      this.addHeaderRow();
    }
  }

  private updateHeadersFromDOM(): void {
    const headersEditor = this.container.querySelector('#headers-editor');
    if (!headersEditor) return;

    const headers: KeyValuePair[] = [];
    const rows = headersEditor.querySelectorAll('.kv-row');

    rows.forEach((row) => {
      const checkbox = row.querySelector('.kv-checkbox') as HTMLInputElement;
      const keyInput = row.querySelector('.key-input') as HTMLInputElement;
      const valueInput = row.querySelector('.value-input') as HTMLInputElement;

      if (keyInput && valueInput && keyInput.value.trim()) {
        headers.push({
          key: keyInput.value.trim(),
          value: valueInput.value.trim(),
          enabled: checkbox ? checkbox.checked : true,
        });
      }
    });

    this.onUpdateCallback?.(headers);
  }

  private updateRowVisualState(checkbox: HTMLInputElement): void {
    const row = checkbox.closest('.kv-row');
    if (row) {
      if (checkbox.checked) {
        row.classList.remove('disabled');
      } else {
        row.classList.add('disabled');
      }
    }
  }

  public loadHeaders(
    headers: KeyValuePair[] | Record<string, string> | undefined
  ): void {
    const headersEditor = this.container.querySelector('#headers-editor');
    if (!headersEditor) return;

    headersEditor.innerHTML = '';

    // Convert old Record format to array format for backward compatibility
    let headersArray: KeyValuePair[];
    if (Array.isArray(headers)) {
      headersArray = headers;
    } else if (headers) {
      headersArray = Object.entries(headers).map(([key, value]) => ({
        key,
        value,
        enabled: true,
      }));
    } else {
      headersArray = [];
    }

    headersArray.forEach(({ key, value, enabled }) => {
      const row = document.createElement('div');
      row.className = enabled ? 'kv-row' : 'kv-row disabled';
      row.innerHTML = `
        <input type="checkbox" class="kv-checkbox" ${enabled ? 'checked' : ''}>
        <input type="text" placeholder="Key" class="key-input">
        <input type="text" placeholder="Value" class="value-input">
        <button class="remove-btn">×</button>
      `;
      headersEditor.appendChild(row);

      // Set values after creating elements to avoid HTML escaping issues
      const keyInput = row.querySelector('.key-input') as HTMLInputElement;
      const valueInput = row.querySelector('.value-input') as HTMLInputElement;

      if (keyInput) keyInput.value = key;
      if (valueInput) valueInput.value = value;

      // Add variable support to loaded inputs (context available via callback)
      if (keyInput) {
        this.addVariableSupport(keyInput);
      }
      if (valueInput) {
        this.addVariableSupport(valueInput);
      }
    });

    if (headersEditor.children.length === 0) {
      this.addHeaderRow();
    }
  }

  public clear(): void {
    const headersEditor = this.container.querySelector('#headers-editor');
    if (headersEditor) {
      headersEditor.innerHTML = '';
      this.addHeaderRow();
    }
  }

  public onUpdate(callback: (headers: KeyValuePair[]) => void): void {
    this.onUpdateCallback = callback;
  }

  public updateHeader(key: string, value: string): void {
    const headersEditor = this.container.querySelector('#headers-editor');
    if (!headersEditor) return;

    // Find existing header row or create new one
    let targetRow: Element | null = null;
    const rows = headersEditor.querySelectorAll('.kv-row');

    rows.forEach((row) => {
      const keyInput = row.querySelector('.key-input') as HTMLInputElement;
      if (keyInput && keyInput.value.toLowerCase() === key.toLowerCase()) {
        targetRow = row;
      }
    });

    if (targetRow) {
      const valueInput = (targetRow as Element).querySelector(
        '.value-input'
      ) as HTMLInputElement;
      if (valueInput) {
        valueInput.value = value;
        // Update variable highlighting
        if (this.activeEnvironment && this.globals) {
          addVariableHighlighting(
            valueInput,
            this.activeEnvironment,
            this.globals
          );
        }
      }
    } else {
      // Create new row
      const row = document.createElement('div');
      row.className = 'kv-row';
      row.innerHTML = `
        <input type="checkbox" class="kv-checkbox" checked>
        <input type="text" placeholder="Key" class="key-input" value="${key}">
        <input type="text" placeholder="Value" class="value-input" value="${value}">
        <button class="remove-btn">×</button>
      `;
      headersEditor.appendChild(row);

      // Add variable support to new inputs
      const keyInput = row.querySelector('.key-input') as HTMLInputElement;
      const valueInput = row.querySelector('.value-input') as HTMLInputElement;

      if (keyInput && this.activeEnvironment && this.globals) {
        this.addVariableSupport(keyInput);
      }
      if (valueInput && this.activeEnvironment && this.globals) {
        this.addVariableSupport(valueInput);
      }
    }

    this.updateHeadersFromDOM();
  }

  public removeHeader(key: string): void {
    const headersEditor = this.container.querySelector('#headers-editor');
    if (!headersEditor) return;

    const rows = Array.from(headersEditor.querySelectorAll('.kv-row'));
    const targetKey = key.toLowerCase();
    rows.forEach((row) => {
      const keyInput = row.querySelector('.key-input') as HTMLInputElement;
      if (keyInput && keyInput.value.toLowerCase() === targetKey) {
        row.remove();
      }
    });

    if (headersEditor.children.length === 0) {
      this.addHeaderRow();
    }

    this.updateHeadersFromDOM();
  }
}
