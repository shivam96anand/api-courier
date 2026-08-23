/**
 * Transient "14px" badge shown over an editor whenever its font size changes,
 * so the user can see which value they are landing on. Shared by the request
 * body editor and the response body viewer; auto-hides after ~1s.
 */

const VISIBLE_MS = 900;

let badge: HTMLElement | null = null;
let hideTimer: number | null = null;

function getBadge(): HTMLElement {
  if (badge?.isConnected) return badge;

  const el = document.createElement('div');
  el.className = 'font-size-indicator';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  document.body.appendChild(el);
  badge = el;
  return el;
}

/** Flash the given font size centred over `anchor`. */
export function showFontSizeIndicator(
  anchor: HTMLElement | null,
  sizePx: number
): void {
  if (!anchor) return;

  const el = getBadge();
  const rect = anchor.getBoundingClientRect();
  el.textContent = `${sizePx}px`;
  el.style.left = `${rect.left + rect.width / 2}px`;
  el.style.top = `${rect.top + rect.height / 2}px`;
  el.classList.add('font-size-indicator--visible');

  if (hideTimer !== null) window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => {
    hideTimer = null;
    el.classList.remove('font-size-indicator--visible');
  }, VISIBLE_MS);
}
