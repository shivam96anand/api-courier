/**
 * SpeedTestManager
 *
 * Adds a "Speed Test" button to the right side of the header (left of
 * "Time Machine" / the optional "Updates installed" button) and shows a
 * floating, themed popup that streams live download / upload speeds while
 * the test runs in the main process.
 *
 * The popup is non-blocking — the user can dismiss it at any time and keep
 * working while the test is ongoing.
 */

interface SpeedTestProgress {
  phase: 'starting' | 'download' | 'upload' | 'done' | 'error';
  mbps: number;
  ratio: number;
}

export class SpeedTestManager {
  private button: HTMLButtonElement | null = null;
  private popup: HTMLElement | null = null;
  private offProgress: (() => void) | null = null;
  private running = false;

  initialize(): void {
    const api = (window as any).restbro?.network;
    if (!api) return;

    this.mountButton();
  }

  private mountButton(): void {
    const headerRight = document.querySelector('.header-right');
    if (!headerRight) return;
    if (document.getElementById('speed-test-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'speed-test-btn';
    btn.className = 'speed-test-button';
    btn.title = 'Run network speed test';
    btn.setAttribute('aria-label', 'Run network speed test');
    btn.innerHTML = `
      <svg class="speed-test-button__icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3a9 9 0 0 0-9 9h2a7 7 0 0 1 14 0h2a9 9 0 0 0-9-9z"/>
        <path d="M12 12l5-3"/>
        <circle cx="12" cy="12" r="1.6"/>
      </svg>
      <span>Speed Test</span>
    `;
    btn.addEventListener('click', () => this.toggle());

    // Insert at the very start of header-right (so order, left-to-right, is:
    // Speed Test, [Updates installed if any], Time Machine, Theme).
    headerRight.insertBefore(btn, headerRight.firstChild);
    this.button = btn;
  }

  private toggle(): void {
    if (this.popup) {
      this.dismissPopup();
      return;
    }
    this.openPopup();
    if (!this.running) void this.run();
  }

  private openPopup(): void {
    if (this.popup) return;

    const popup = document.createElement('div');
    popup.className = 'speed-test-popup';
    popup.setAttribute('role', 'dialog');
    popup.setAttribute('aria-label', 'Network speed test');
    popup.innerHTML = `
      <div class="speed-test-popup__header">
        <span class="speed-test-popup__title">Network Speed Test</span>
        <button class="speed-test-popup__close" aria-label="Close">\u00D7</button>
      </div>
      <div class="speed-test-popup__body">
        <div class="speed-test-stat" data-stat="download">
          <div class="speed-test-stat__head">
            <span class="speed-test-stat__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            </span>
            <span class="speed-test-stat__label">Download</span>
          </div>
          <div class="speed-test-stat__value">
            <span class="speed-test-stat__num" data-num="download">\u2014</span>
            <span class="speed-test-stat__unit">Mbps</span>
          </div>
          <div class="speed-test-stat__bar"><div class="speed-test-stat__fill" data-fill="download"></div></div>
        </div>
        <div class="speed-test-stat" data-stat="upload">
          <div class="speed-test-stat__head">
            <span class="speed-test-stat__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </span>
            <span class="speed-test-stat__label">Upload</span>
          </div>
          <div class="speed-test-stat__value">
            <span class="speed-test-stat__num" data-num="upload">\u2014</span>
            <span class="speed-test-stat__unit">Mbps</span>
          </div>
          <div class="speed-test-stat__bar"><div class="speed-test-stat__fill" data-fill="upload"></div></div>
        </div>
        <div class="speed-test-stat speed-test-stat--ping">
          <span class="speed-test-stat__label">Latency</span>
          <span class="speed-test-stat__num" data-num="ping">\u2014</span>
          <span class="speed-test-stat__unit">ms</span>
        </div>
        <div class="speed-test-popup__status" data-status>Preparing\u2026</div>
        <div class="speed-test-popup__actions">
          <button class="speed-test-popup__retry" data-retry hidden>Run again</button>
        </div>
      </div>
    `;

    document.body.appendChild(popup);
    this.popup = popup;
    this.positionPopup();

    popup
      .querySelector('.speed-test-popup__close')
      ?.addEventListener('click', () => this.dismissPopup());

    popup
      .querySelector<HTMLButtonElement>('[data-retry]')
      ?.addEventListener('click', () => {
        if (this.running) return;
        this.resetUI();
        void this.run();
      });

    document.addEventListener('mousedown', this.outsideHandler, true);
    document.addEventListener('keydown', this.keyHandler);
    window.addEventListener('resize', this.positionHandler);
  }

  private dismissPopup(): void {
    document.removeEventListener('mousedown', this.outsideHandler, true);
    document.removeEventListener('keydown', this.keyHandler);
    window.removeEventListener('resize', this.positionHandler);

    this.popup?.classList.add('speed-test-popup--leaving');
    const popup = this.popup;
    this.popup = null;
    setTimeout(() => popup?.remove(), 160);

    // Also stop the test if still running — user dismissed.
    if (this.running) {
      try {
        (window as any).restbro?.network?.cancelSpeedTest?.();
      } catch {
        /* noop */
      }
    }
  }

  private outsideHandler = (e: MouseEvent): void => {
    if (!this.popup) return;
    const target = e.target as Node;
    if (this.popup.contains(target)) return;
    if (this.button?.contains(target)) return;
    this.dismissPopup();
  };

  private keyHandler = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') this.dismissPopup();
  };

  private positionHandler = (): void => this.positionPopup();

  private positionPopup(): void {
    if (!this.popup || !this.button) return;
    const rect = this.button.getBoundingClientRect();
    const popupWidth = 320;
    const left = Math.min(
      window.innerWidth - popupWidth - 12,
      Math.max(12, rect.left + rect.width / 2 - popupWidth / 2)
    );
    this.popup.style.top = `${rect.bottom + 10}px`;
    this.popup.style.left = `${left}px`;
    this.popup.style.width = `${popupWidth}px`;
  }

  private resetUI(): void {
    if (!this.popup) return;
    this.setNum('download', '\u2014');
    this.setNum('upload', '\u2014');
    this.setNum('ping', '\u2014');
    this.setFill('download', 0);
    this.setFill('upload', 0);
    this.setStatus('Preparing\u2026');
    const retry = this.popup.querySelector<HTMLButtonElement>('[data-retry]');
    if (retry) retry.hidden = true;
    this.popup
      .querySelector('[data-stat="download"]')
      ?.classList.remove('is-active', 'is-done');
    this.popup
      .querySelector('[data-stat="upload"]')
      ?.classList.remove('is-active', 'is-done');
  }

  private async run(): Promise<void> {
    const api = (window as any).restbro?.network;
    if (!api || this.running) return;

    this.running = true;
    this.button?.classList.add('is-running');

    this.offProgress?.();
    this.offProgress = api.onSpeedTestProgress((p: SpeedTestProgress) =>
      this.onProgress(p)
    );

    try {
      const result = await api.runSpeedTest();
      if (!result?.ok) {
        this.setStatus(
          `Test failed: ${result?.error || 'unknown error'}`,
          'error'
        );
      } else {
        this.setNum('download', formatMbps(result.downloadMbps));
        this.setNum('upload', formatMbps(result.uploadMbps));
        this.setNum('ping', `${Math.round(result.pingMs)}`);
        this.setFill('download', 1);
        this.setFill('upload', 1);
        this.popup
          ?.querySelector('[data-stat="download"]')
          ?.classList.add('is-done');
        this.popup
          ?.querySelector('[data-stat="upload"]')
          ?.classList.add('is-done');
        this.setStatus(qualify(result.downloadMbps, result.uploadMbps), 'ok');
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'unknown error';
      this.setStatus(`Test failed: ${message}`, 'error');
    } finally {
      this.running = false;
      this.button?.classList.remove('is-running');
      this.offProgress?.();
      this.offProgress = null;
      const retry =
        this.popup?.querySelector<HTMLButtonElement>('[data-retry]');
      if (retry) retry.hidden = false;
    }
  }

  private onProgress(p: SpeedTestProgress): void {
    if (!this.popup) return;
    if (p.phase === 'download') {
      this.popup
        .querySelector('[data-stat="download"]')
        ?.classList.add('is-active');
      this.setNum('download', formatMbps(p.mbps));
      this.setFill('download', p.ratio);
      this.setStatus('Measuring download\u2026');
    } else if (p.phase === 'upload') {
      this.popup
        .querySelector('[data-stat="download"]')
        ?.classList.remove('is-active');
      this.popup
        .querySelector('[data-stat="download"]')
        ?.classList.add('is-done');
      this.popup
        .querySelector('[data-stat="upload"]')
        ?.classList.add('is-active');
      this.setNum('upload', formatMbps(p.mbps));
      this.setFill('upload', p.ratio);
      this.setStatus('Measuring upload\u2026');
    } else if (p.phase === 'starting') {
      this.setStatus('Pinging server\u2026');
    }
  }

  private setNum(which: 'download' | 'upload' | 'ping', value: string): void {
    const el = this.popup?.querySelector(`[data-num="${which}"]`);
    if (el) el.textContent = value;
  }

  private setFill(which: 'download' | 'upload', ratio: number): void {
    const el = this.popup?.querySelector<HTMLElement>(`[data-fill="${which}"]`);
    if (el) el.style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
  }

  private setStatus(
    text: string,
    kind: 'info' | 'ok' | 'error' = 'info'
  ): void {
    const el = this.popup?.querySelector<HTMLElement>('[data-status]');
    if (!el) return;
    el.textContent = text;
    el.dataset.kind = kind;
  }
}

function formatMbps(mbps: number): string {
  if (!Number.isFinite(mbps) || mbps <= 0) return '\u2014';
  if (mbps < 10) return mbps.toFixed(2);
  if (mbps < 100) return mbps.toFixed(1);
  return Math.round(mbps).toString();
}

function qualify(down: number, up: number): string {
  const min = Math.min(down, up);
  if (min >= 100) return 'Excellent connection';
  if (min >= 25) return 'Great for HD streaming & video calls';
  if (min >= 5) return 'Good for general browsing';
  return 'Connection appears slow';
}
