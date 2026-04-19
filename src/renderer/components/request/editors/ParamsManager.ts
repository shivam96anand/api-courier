import type { KeyValuePair } from '../../../../shared/types';
import { addVariableHighlighting } from '../variable-helper';
import { setupAutocomplete } from '../variable-autocomplete';

export class ParamsManager {
  private container: HTMLElement;
  private onUpdateCallback: ((params: KeyValuePair[]) => void) | null = null;
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
    const paramsEditor = this.container.querySelector('#params-editor');
    if (paramsEditor) {
      const rows = paramsEditor.querySelectorAll('.kv-row');
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
    const addParamBtn = this.container.querySelector('.add-param-btn');
    const paramsEditor = this.container.querySelector('#params-editor');

    if (addParamBtn && paramsEditor) {
      addParamBtn.addEventListener('click', () => {
        this.addParamRow();
      });

      paramsEditor.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.classList.contains('remove-btn')) {
          const row = target.closest('.kv-row');
          if (row) {
            row.remove();
            this.updateParamsFromDOM();
            // Add a new empty row if no rows left
            if (paramsEditor.children.length === 0) {
              this.addParamRow();
            }
          }
        }
      });

      paramsEditor.addEventListener('input', () => {
        this.ensureTrailingEmptyRow();
        this.updateParamsFromDOM();
      });

      paramsEditor.addEventListener('change', (e) => {
        if ((e.target as HTMLElement).classList.contains('kv-checkbox')) {
          this.updateRowVisualState(e.target as HTMLInputElement);
        }
        this.updateParamsFromDOM();
      });
    }
  }

  private addParamRow(): void {
    const paramsEditor = this.container.querySelector('#params-editor');
    if (!paramsEditor) return;

    const row = document.createElement('div');
    row.className = 'kv-row';
    row.innerHTML = `
      <input type="checkbox" class="kv-checkbox" checked>
      <input type="text" placeholder="Key" class="key-input">
      <input type="text" placeholder="Value" class="value-input">
      <button class="remove-btn">×</button>
    `;

    paramsEditor.appendChild(row);

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
   * Postman-style affordance: as soon as the user starts typing in the last
   * row, append a fresh empty row so they never have to click "Add Parameter".
   * Runs on every input event but only mutates the DOM when needed.
   */
  private ensureTrailingEmptyRow(): void {
    const paramsEditor = this.container.querySelector('#params-editor');
    if (!paramsEditor) return;
    const rows = paramsEditor.querySelectorAll('.kv-row');
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
      this.addParamRow();
    }
  }

  private updateParamsFromDOM(): void {
    const paramsEditor = this.container.querySelector('#params-editor');
    if (!paramsEditor) return;

    const params: KeyValuePair[] = [];
    const rows = paramsEditor.querySelectorAll('.kv-row');

    rows.forEach((row) => {
      const checkbox = row.querySelector('.kv-checkbox') as HTMLInputElement;
      const keyInput = row.querySelector('.key-input') as HTMLInputElement;
      const valueInput = row.querySelector('.value-input') as HTMLInputElement;

      if (keyInput && valueInput && keyInput.value.trim()) {
        params.push({
          key: keyInput.value.trim(),
          value: valueInput.value.trim(),
          enabled: checkbox ? checkbox.checked : true,
        });
      }
    });

    this.onUpdateCallback?.(params);
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

  public loadParams(
    params: KeyValuePair[] | Record<string, string> | undefined
  ): void {
    const paramsEditor = this.container.querySelector('#params-editor');
    if (!paramsEditor) return;

    paramsEditor.innerHTML = '';

    // Convert old Record format to array format for backward compatibility
    let paramsArray: KeyValuePair[];
    if (Array.isArray(params)) {
      paramsArray = params;
    } else if (params) {
      paramsArray = Object.entries(params).map(([key, value]) => ({
        key,
        value,
        enabled: true,
      }));
    } else {
      paramsArray = [];
    }

    paramsArray.forEach(({ key, value, enabled }) => {
      const row = document.createElement('div');
      row.className = enabled ? 'kv-row' : 'kv-row disabled';
      row.innerHTML = `
        <input type="checkbox" class="kv-checkbox" ${enabled ? 'checked' : ''}>
        <input type="text" placeholder="Key" class="key-input">
        <input type="text" placeholder="Value" class="value-input">
        <button class="remove-btn">×</button>
      `;
      paramsEditor.appendChild(row);

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

    if (paramsEditor.children.length === 0) {
      this.addParamRow();
    }
  }

  public clear(): void {
    const paramsEditor = this.container.querySelector('#params-editor');
    if (paramsEditor) {
      paramsEditor.innerHTML = '';
      this.addParamRow();
    }
  }

  public onUpdate(callback: (params: KeyValuePair[]) => void): void {
    this.onUpdateCallback = callback;
  }
}
