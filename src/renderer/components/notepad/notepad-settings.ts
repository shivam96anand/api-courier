/**
 * Notepad settings menu — a small popover triggered by the gear button.
 * Renders settings as labelled checkboxes/inputs and emits change events via
 * the provided callbacks.
 */
import { NotepadSettings } from '../../../shared/types';

export interface SettingsMenuCallbacks {
  onChange: (updates: Partial<NotepadSettings>) => void;
}

export class SettingsMenu {
  private menu: HTMLElement;
  private outsideClickHandler: ((e: MouseEvent) => void) | null = null;

  constructor(
    container: HTMLElement,
    private readonly callbacks: SettingsMenuCallbacks
  ) {
    this.menu = document.createElement('div');
    this.menu.className = 'notepad-settings-menu hidden';
    this.menu.setAttribute('role', 'menu');
    container.appendChild(this.menu);
  }

  toggle(anchor: HTMLElement, settings: NotepadSettings): void {
    if (this.menu.classList.contains('hidden')) {
      this.open(anchor, settings);
    } else {
      this.close();
    }
  }

  open(anchor: HTMLElement, settings: NotepadSettings): void {
    this.render(settings);
    const rect = anchor.getBoundingClientRect();
    // Position below the anchor, right-aligned to it.
    this.menu.style.top = `${rect.bottom + 6}px`;
    this.menu.style.right = `${window.innerWidth - rect.right}px`;
    this.menu.classList.remove('hidden');

    // Defer outside-click attachment by a tick so the opening click doesn't
    // immediately dismiss us.
    setTimeout(() => {
      this.outsideClickHandler = (e: MouseEvent) => {
        if (!this.menu.contains(e.target as Node)) this.close();
      };
      document.addEventListener('click', this.outsideClickHandler);
    }, 0);
  }

  close(): void {
    this.menu.classList.add('hidden');
    if (this.outsideClickHandler) {
      document.removeEventListener('click', this.outsideClickHandler);
      this.outsideClickHandler = null;
    }
  }

  private render(settings: NotepadSettings): void {
    this.menu.innerHTML = `
      <div class="notepad-settings-section">
        <div class="notepad-settings-title">Editor</div>
        <label class="notepad-settings-row">
          <span>Word wrap</span>
          <input type="checkbox" data-key="wordWrap"
            ${settings.wordWrap === 'on' ? 'checked' : ''}>
        </label>
        <label class="notepad-settings-row">
          <span>Tab size</span>
          <select data-key="tabSize">
            <option value="2" ${settings.tabSize === 2 ? 'selected' : ''}>2</option>
            <option value="4" ${settings.tabSize === 4 ? 'selected' : ''}>4</option>
            <option value="8" ${settings.tabSize === 8 ? 'selected' : ''}>8</option>
          </select>
        </label>
      </div>
      <div class="notepad-settings-section">
        <div class="notepad-settings-title">On Save</div>
        <label class="notepad-settings-row">
          <span>Trim trailing whitespace</span>
          <input type="checkbox" data-key="trimTrailingWhitespace"
            ${settings.trimTrailingWhitespace ? 'checked' : ''}>
        </label>
        <label class="notepad-settings-row">
          <span>Insert final newline</span>
          <input type="checkbox" data-key="insertFinalNewline"
            ${settings.insertFinalNewline ? 'checked' : ''}>
        </label>
        <label class="notepad-settings-row">
          <span>Format document <small>(JSON / supported)</small></span>
          <input type="checkbox" data-key="formatOnSave"
            ${settings.formatOnSave ? 'checked' : ''}>
        </label>
      </div>
      <div class="notepad-settings-section">
        <div class="notepad-settings-title">App</div>
        <label class="notepad-settings-row">
          <span>Confirm exit when notes are unsaved</span>
          <input type="checkbox" data-key="promptOnExit"
            ${settings.promptOnExit ? 'checked' : ''}>
        </label>
      </div>
    `;

    this.menu.querySelectorAll('[data-key]').forEach((el) => {
      el.addEventListener('change', () => {
        const key = (el as HTMLElement).dataset.key as keyof NotepadSettings;
        const updates: Partial<NotepadSettings> = {};
        if (el instanceof HTMLInputElement && el.type === 'checkbox') {
          if (key === 'wordWrap') {
            updates.wordWrap = el.checked ? 'on' : 'off';
          } else {
            (updates as Record<string, unknown>)[key] = el.checked;
          }
        } else if (el instanceof HTMLSelectElement) {
          (updates as Record<string, unknown>)[key] = Number(el.value);
        }
        this.callbacks.onChange(updates);
      });
    });
  }
}
