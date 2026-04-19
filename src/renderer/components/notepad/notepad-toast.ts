/**
 * Lightweight toast helper scoped to the notepad. Renders a stack of dismissable
 * messages in the bottom-right of the notepad container. No global state.
 */
export type ToastVariant = 'info' | 'success' | 'error';

let toastHost: HTMLElement | null = null;

function ensureHost(parent: HTMLElement): HTMLElement {
  if (toastHost && parent.contains(toastHost)) return toastHost;
  const host = document.createElement('div');
  host.className = 'notepad-toast-host';
  parent.appendChild(host);
  toastHost = host;
  return host;
}

export function showNotepadToast(
  parent: HTMLElement,
  message: string,
  variant: ToastVariant = 'info',
  durationMs = 4000
): void {
  const host = ensureHost(parent);
  const toast = document.createElement('div');
  toast.className = `notepad-toast notepad-toast--${variant}`;
  toast.textContent = message;
  toast.setAttribute('role', variant === 'error' ? 'alert' : 'status');
  host.appendChild(toast);

  const dismiss = () => {
    toast.classList.add('notepad-toast--leaving');
    setTimeout(() => toast.remove(), 200);
  };

  toast.addEventListener('click', dismiss);
  setTimeout(dismiss, durationMs);
}
