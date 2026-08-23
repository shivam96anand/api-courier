import { iconHtml } from '../../utils/icons';
import {
  clampBodyFontSize,
  getBodyFontSize,
  setBodyFontSize,
} from '../../utils/body-font-size';
import {
  MAX_BODY_FONT_SIZE,
  MIN_BODY_FONT_SIZE,
} from '../../../shared/constants';

type LayoutMode = 'horizontal' | 'vertical';

interface SettingsModalCallbacks {
  onTimeoutChange: (ms: number) => void;
  onLayoutChange: (mode: LayoutMode) => void;
}

export class SettingsModal {
  private overlay: HTMLElement | null = null;
  private callbacks: SettingsModalCallbacks;
  private currentTimeoutMs = 60000;
  private currentLayout: LayoutMode = 'horizontal';

  constructor(callbacks: SettingsModalCallbacks) {
    this.callbacks = callbacks;
  }

  setValues(timeoutMs: number, layout: LayoutMode): void {
    this.currentTimeoutMs = timeoutMs;
    this.currentLayout = layout;
  }

  open(): void {
    if (this.overlay) return;
    this.overlay = this.buildOverlay();
    document.body.appendChild(this.overlay);
    // Focus the timeout input
    const input = this.overlay.querySelector(
      '.settings-timeout-input'
    ) as HTMLInputElement | null;
    input?.focus();
  }

  close(): void {
    if (!this.overlay) return;
    this.overlay.remove();
    this.overlay = null;
  }

  isOpen(): boolean {
    return this.overlay !== null;
  }

  private buildOverlay(): HTMLElement {
    const overlay = document.createElement('div');
    overlay.className = 'settings-modal-overlay';
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.close();
    });

    const modal = document.createElement('div');
    modal.className = 'settings-modal';

    // Header
    const header = document.createElement('div');
    header.className = 'settings-modal-header';
    header.innerHTML = `
      <h2 class="settings-modal-title">${iconHtml('settings')} Settings</h2>
    `;
    const closeBtn = document.createElement('button');
    closeBtn.className = 'settings-modal-close';
    closeBtn.innerHTML = iconHtml('close');
    closeBtn.title = 'Close';
    closeBtn.addEventListener('click', () => this.close());
    header.appendChild(closeBtn);
    modal.appendChild(header);

    // Body
    const body = document.createElement('div');
    body.className = 'settings-modal-body';

    body.appendChild(this.buildTimeoutSection());
    body.appendChild(this.buildBodyFontSection());
    body.appendChild(this.buildLayoutSection());

    modal.appendChild(body);
    overlay.appendChild(modal);

    // ESC to close
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.close();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);

    return overlay;
  }

  private buildTimeoutSection(): HTMLElement {
    const section = document.createElement('div');
    section.className = 'settings-section';

    const label = document.createElement('label');
    label.className = 'settings-label';
    label.textContent = 'Request Timeout';

    const description = document.createElement('p');
    description.className = 'settings-description';
    description.textContent =
      'Default timeout for API requests. Set to 0 for no timeout.';

    const row = document.createElement('div');
    row.className = 'settings-input-row';

    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'settings-timeout-input';
    input.min = '0';
    input.step = '1';
    input.value = String(Math.round(this.currentTimeoutMs / 1000));
    input.placeholder = '60';

    const unit = document.createElement('span');
    unit.className = 'settings-input-unit';
    unit.textContent = 'seconds';

    input.addEventListener('change', () => {
      const seconds = Math.max(0, parseInt(input.value, 10) || 0);
      input.value = String(seconds);
      this.currentTimeoutMs = seconds * 1000;
      this.callbacks.onTimeoutChange(this.currentTimeoutMs);
    });

    row.appendChild(input);
    row.appendChild(unit);

    section.appendChild(label);
    section.appendChild(description);
    section.appendChild(row);
    return section;
  }

  /**
   * Default font size for the request payload and response body editors.
   * Shares one value with the A- / A+ controls in both panes, so this input
   * mirrors whatever the user last landed on.
   */
  private buildBodyFontSection(): HTMLElement {
    const section = document.createElement('div');
    section.className = 'settings-section';

    const label = document.createElement('label');
    label.className = 'settings-label';
    label.textContent = 'Body Font Size';

    const description = document.createElement('p');
    description.className = 'settings-description';
    description.textContent =
      'Font size for the request payload and response body editors. Applied on every launch.';

    const row = document.createElement('div');
    row.className = 'settings-input-row';

    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'settings-font-size-input';
    input.min = String(MIN_BODY_FONT_SIZE);
    input.max = String(MAX_BODY_FONT_SIZE);
    input.step = '1';
    input.value = String(getBodyFontSize());

    const unit = document.createElement('span');
    unit.className = 'settings-input-unit';
    unit.textContent = 'px';

    input.addEventListener('change', () => {
      const px = clampBodyFontSize(parseInt(input.value, 10));
      input.value = String(px);
      setBodyFontSize(px);
    });

    row.appendChild(input);
    row.appendChild(unit);

    section.appendChild(label);
    section.appendChild(description);
    section.appendChild(row);
    return section;
  }

  private buildLayoutSection(): HTMLElement {
    const section = document.createElement('div');
    section.className = 'settings-section';

    const label = document.createElement('label');
    label.className = 'settings-label';
    label.textContent = 'Request / Response Layout';

    const description = document.createElement('p');
    description.className = 'settings-description';
    description.textContent =
      'Choose how the request and response panels are arranged.';

    const toggleRow = document.createElement('div');
    toggleRow.className = 'settings-layout-toggle';

    const btnH = document.createElement('button');
    btnH.className = `settings-layout-btn${this.currentLayout === 'horizontal' ? ' active' : ''}`;
    btnH.dataset.mode = 'horizontal';
    btnH.innerHTML = `
      <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
        <rect x="1" y="2" width="8" height="16" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/>
        <rect x="11" y="2" width="8" height="16" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/>
      </svg>
      <span>Side by Side</span>
    `;

    const btnV = document.createElement('button');
    btnV.className = `settings-layout-btn${this.currentLayout === 'vertical' ? ' active' : ''}`;
    btnV.dataset.mode = 'vertical';
    btnV.innerHTML = `
      <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
        <rect x="2" y="1" width="16" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/>
        <rect x="2" y="11" width="16" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/>
      </svg>
      <span>Stacked</span>
    `;

    const handleClick = (mode: LayoutMode) => {
      this.currentLayout = mode;
      btnH.classList.toggle('active', mode === 'horizontal');
      btnV.classList.toggle('active', mode === 'vertical');
      this.callbacks.onLayoutChange(mode);
    };

    btnH.addEventListener('click', () => handleClick('horizontal'));
    btnV.addEventListener('click', () => handleClick('vertical'));

    toggleRow.appendChild(btnH);
    toggleRow.appendChild(btnV);

    section.appendChild(label);
    section.appendChild(description);
    section.appendChild(toggleRow);
    return section;
  }
}
