/**
 * Tiny toast surface that listens for `show-toast` custom events and renders
 * a transient banner in the corner of the window. Intentionally dependency
 * free \u2014 this is a notification primitive used by collection runners,
 * save shortcuts, etc.
 */
type ToastType = 'info' | 'success' | 'warning' | 'error';

interface ToastDetail {
  type?: ToastType;
  message: string;
  durationMs?: number;
}

export class ToastManager {
  private container: HTMLElement | null = null;

  initialize(): void {
    this.ensureContainer();
    document.addEventListener('show-toast', ((e: CustomEvent) => {
      const detail = (e.detail || {}) as ToastDetail;
      if (!detail.message) return;
      this.show(detail.message, detail.type || 'info', detail.durationMs);
    }) as EventListener);
  }

  private ensureContainer(): void {
    if (this.container) return;
    const el = document.createElement('div');
    el.id = 'toast-container';
    el.className = 'toast-container';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
    this.container = el;
  }

  private show(message: string, type: ToastType, durationMs = 3500): void {
    if (!this.container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.textContent = message;
    this.container.appendChild(toast);
    // Force reflow then add visible class for transition
    requestAnimationFrame(() => toast.classList.add('toast--visible'));
    window.setTimeout(() => {
      toast.classList.remove('toast--visible');
      window.setTimeout(() => toast.remove(), 200);
    }, durationMs);
  }
}
