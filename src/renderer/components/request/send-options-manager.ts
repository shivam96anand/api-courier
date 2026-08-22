import { TabsManager } from '../tabs-manager';
import { ApiRequest } from '../../../shared/types';

type TimeUnit = 'ms' | 's';

/**
 * Owns the chevron "more send options" dropdown next to the Send button,
 * and the inline status bar used by the scheduled/repeat/N-times actions.
 *
 * All actions compose existing behaviour:
 *   - triggering a send   → click `#send-request`
 *   - cancelling a send   → `request-cancel-trigger` custom event
 *   - completion signals  → `response-received` / `request-failed` events
 *
 * No new IPC is required.
 */
export class SendOptionsManager {
  private tabsManager: TabsManager;
  private menuEl: HTMLElement | null = null;
  private statusEl: HTMLElement | null = null;
  private cancelAction: (() => void) | null = null;

  constructor(tabsManager: TabsManager) {
    this.tabsManager = tabsManager;
  }

  initialize(): void {
    const btn = document.getElementById(
      'send-options-btn'
    ) as HTMLButtonElement | null;
    if (!btn) return;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.menuEl) {
        this.closeMenu();
      } else {
        this.openMenu(btn);
      }
    });

    // Close on outside click / Escape.
    document.addEventListener('click', () => this.closeMenu());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeMenu();
      }
    });
  }

  // ---- Menu -------------------------------------------------------------

  private openMenu(anchor: HTMLElement): void {
    this.closeMenu();

    const menu = document.createElement('div');
    menu.className = 'send-options-menu';
    menu.setAttribute('role', 'menu');
    menu.addEventListener('click', (e) => e.stopPropagation());

    menu.appendChild(this.buildDelayItem());
    menu.appendChild(this.buildIntervalItem());
    menu.appendChild(this.buildNTimesItem());
    menu.appendChild(this.buildSeparator());
    menu.appendChild(this.buildLoadTestItem());

    document.body.appendChild(menu);
    this.menuEl = menu;
    anchor.setAttribute('aria-expanded', 'true');

    // Position below the anchor, right-aligned.
    const rect = anchor.getBoundingClientRect();
    menu.style.top = `${rect.bottom + 6}px`;
    const right = window.innerWidth - rect.right;
    menu.style.right = `${right}px`;
  }

  private closeMenu(): void {
    if (this.menuEl) {
      this.menuEl.remove();
      this.menuEl = null;
    }
    const btn = document.getElementById('send-options-btn');
    btn?.setAttribute('aria-expanded', 'false');
  }

  private buildSeparator(): HTMLElement {
    const sep = document.createElement('div');
    sep.className = 'send-options-menu__sep';
    return sep;
  }

  private buildDelayItem(): HTMLElement {
    return this.buildNumberItem({
      label: 'Send after delay',
      hint: 'Fire once after a wait',
      defaultValue: 2,
      unit: 's',
      showUnit: true,
      actionLabel: 'Schedule',
      onSubmit: (ms) => this.runDelayed(ms),
    });
  }

  private buildIntervalItem(): HTMLElement {
    return this.buildNumberItem({
      label: 'Repeat on interval',
      hint: 'Send every N until stopped',
      defaultValue: 5,
      unit: 's',
      showUnit: true,
      actionLabel: 'Start',
      onSubmit: (ms) => this.runInterval(ms),
    });
  }

  private buildNTimesItem(): HTMLElement {
    return this.buildNumberItem({
      label: 'Send N times',
      hint: 'Back-to-back, sequentially',
      defaultValue: 5,
      unit: 'x',
      showUnit: false,
      actionLabel: 'Run',
      onSubmit: (count) => this.runNTimes(Math.max(1, Math.floor(count))),
    });
  }

  private buildLoadTestItem(): HTMLElement {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'send-options-menu__action';
    row.setAttribute('role', 'menuitem');
    row.innerHTML = `
      <span class="send-options-menu__action-label">Load test…</span>
      <span class="send-options-menu__action-hint">Open in Load Testing with values prefilled</span>
    `;
    row.addEventListener('click', () => {
      this.closeMenu();
      this.redirectToLoadTest();
    });
    return row;
  }

  private buildNumberItem(opts: {
    label: string;
    hint: string;
    defaultValue: number;
    unit: TimeUnit | 'x';
    showUnit: boolean;
    actionLabel: string;
    onSubmit: (value: number) => void;
  }): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'send-options-menu__item';

    const header = document.createElement('div');
    header.className = 'send-options-menu__item-header';
    header.innerHTML = `
      <span class="send-options-menu__item-label">${opts.label}</span>
      <span class="send-options-menu__item-hint">${opts.hint}</span>
    `;
    wrap.appendChild(header);

    const form = document.createElement('div');
    form.className = 'send-options-menu__form';

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '1';
    input.step = 'any';
    input.value = String(opts.defaultValue);
    input.className = 'send-options-menu__input';
    form.appendChild(input);

    let unit: TimeUnit | 'x' = opts.unit;
    if (opts.showUnit) {
      const unitToggle = document.createElement('div');
      unitToggle.className = 'send-options-menu__unit';
      const msBtn = document.createElement('button');
      msBtn.type = 'button';
      msBtn.textContent = 'ms';
      const sBtn = document.createElement('button');
      sBtn.type = 'button';
      sBtn.textContent = 's';
      const applyActive = () => {
        msBtn.classList.toggle('active', unit === 'ms');
        sBtn.classList.toggle('active', unit === 's');
      };
      msBtn.addEventListener('click', () => {
        unit = 'ms';
        applyActive();
      });
      sBtn.addEventListener('click', () => {
        unit = 's';
        applyActive();
      });
      applyActive();
      unitToggle.append(msBtn, sBtn);
      form.appendChild(unitToggle);
    } else {
      const tag = document.createElement('span');
      tag.className = 'send-options-menu__unit-static';
      tag.textContent = '×';
      form.appendChild(tag);
    }

    const submit = document.createElement('button');
    submit.type = 'button';
    submit.className = 'send-options-menu__submit';
    submit.textContent = opts.actionLabel;
    form.appendChild(submit);

    const trigger = () => {
      const raw = parseFloat(input.value);
      if (!isFinite(raw) || raw <= 0) return;
      const value = unit === 's' ? raw * 1000 : raw;
      this.closeMenu();
      opts.onSubmit(value);
    };

    submit.addEventListener('click', trigger);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        trigger();
      }
    });

    wrap.appendChild(form);
    return wrap;
  }

  // ---- Actions ----------------------------------------------------------

  private runDelayed(ms: number): void {
    const endAt = Date.now() + ms;
    let frameId: number | undefined;

    const updateLabel = () => {
      const remaining = Math.max(0, endAt - Date.now());
      const secs = (remaining / 1000).toFixed(1);
      this.setStatus(`Sending in ${secs}s…`);
      if (remaining > 0) {
        frameId = window.requestAnimationFrame(updateLabel);
      }
    };

    const timeoutId = window.setTimeout(() => {
      if (frameId !== undefined) window.cancelAnimationFrame(frameId);
      this.hideStatus();
      this.clickSend();
    }, ms);

    this.showStatus('', () => {
      window.clearTimeout(timeoutId);
      if (frameId !== undefined) window.cancelAnimationFrame(frameId);
      this.hideStatus();
    });
    updateLabel();
  }

  private runInterval(ms: number): void {
    let stopped = false;
    let iteration = 0;

    const stop = () => {
      stopped = true;
      this.hideStatus();
    };

    const cycle = () => {
      if (stopped) return;
      iteration += 1;
      this.setStatus(
        `Repeating every ${this.formatMs(ms)} — iteration ${iteration}`
      );
      this.clickSend();
      this.waitForCompletion().then(() => {
        if (stopped) return;
        window.setTimeout(cycle, ms);
      });
    };

    this.showStatus('', stop);
    cycle();
  }

  private runNTimes(n: number): void {
    let stopped = false;
    let completed = 0;

    const stop = () => {
      stopped = true;
      this.hideStatus();
    };

    const next = () => {
      if (stopped || completed >= n) {
        this.hideStatus();
        return;
      }
      completed += 1;
      this.setStatus(`Sending ${completed} / ${n}…`);
      this.clickSend();
      this.waitForCompletion().then(next);
    };

    this.showStatus('', stop);
    next();
  }

  private redirectToLoadTest(): void {
    const activeTab = this.tabsManager.getActiveTab();
    const request = activeTab?.request as ApiRequest | undefined;
    if (!request) return;

    // Decoupled handoff: LoadTestPage listens for this event and prefills
    // either the saved-request picker (if it has a collectionId) or the
    // ad-hoc editor. The user just fills in RPM + duration.
    const detail = {
      request,
      collectionId: activeTab?.collectionId,
    };
    document.dispatchEvent(
      new CustomEvent('loadtest-prefill-request', { detail })
    );

    // Switch to the load-testing tab. Uses the existing nav mechanism.
    document.dispatchEvent(
      new CustomEvent('switch-to-tab', {
        detail: { tab: 'load-testing' },
      })
    );
  }

  // ---- Helpers ----------------------------------------------------------

  private clickSend(): void {
    const btn = document.getElementById(
      'send-request'
    ) as HTMLButtonElement | null;
    if (btn && !btn.disabled) btn.click();
  }

  /**
   * Resolves once the in-flight request either completes or fails.
   * Used to chain sequential/interval sends without overlapping.
   */
  private waitForCompletion(): Promise<void> {
    return new Promise((resolve) => {
      const onDone = () => {
        document.removeEventListener('response-received', onDone);
        document.removeEventListener('request-failed', onDone);
        resolve();
      };
      document.addEventListener('response-received', onDone, { once: true });
      document.addEventListener('request-failed', onDone, { once: true });
    });
  }

  private formatMs(ms: number): string {
    if (ms >= 1000) {
      const s = ms / 1000;
      return Number.isInteger(s) ? `${s}s` : `${s.toFixed(1)}s`;
    }
    return `${ms}ms`;
  }

  // ---- Status bar -------------------------------------------------------

  private showStatus(label: string, onCancel: () => void): void {
    this.hideStatus();

    const bar = document.createElement('div');
    bar.className = 'send-options-status';
    bar.innerHTML = `
      <span class="send-options-status__label"></span>
      <button type="button" class="send-options-status__cancel">Cancel</button>
    `;

    const host = document.querySelector('.request-form');
    const requestLine = host?.querySelector('.request-line');
    if (host && requestLine) {
      host.insertBefore(bar, requestLine.nextSibling);
    } else {
      document.body.appendChild(bar);
    }

    this.statusEl = bar;
    this.cancelAction = onCancel;
    this.setStatus(label);

    bar
      .querySelector('.send-options-status__cancel')
      ?.addEventListener('click', () => {
        const action = this.cancelAction;
        this.cancelAction = null;
        if (action) action();
      });
  }

  private setStatus(label: string): void {
    if (!this.statusEl) return;
    const labelEl = this.statusEl.querySelector('.send-options-status__label');
    if (labelEl) labelEl.textContent = label;
  }

  private hideStatus(): void {
    if (this.statusEl) {
      this.statusEl.remove();
      this.statusEl = null;
    }
    this.cancelAction = null;
  }
}
