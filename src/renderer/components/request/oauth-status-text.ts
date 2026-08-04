/**
 * Renders an OAuth failure inside the auth panel status box.
 *
 * Kept separate from UIHelpers so the DOM shape of the error (title, server
 * detail, actionable hint) lives in one place. Every node is filled with
 * textContent — the description originates from the remote authorization
 * server and must never be treated as HTML.
 */
import { formatOAuthError } from '../../../shared/oauth-error-format';

function appendLine(
  container: HTMLElement,
  className: string,
  text: string
): void {
  const el = document.createElement('span');
  el.className = className;
  el.textContent = text;
  container.appendChild(el);
}

export function renderOAuthErrorText(
  container: HTMLElement,
  message: string
): void {
  const { title, detail, hint } = formatOAuthError(message);

  container.textContent = '';
  appendLine(container, 'status-title', title);
  if (detail) appendLine(container, 'status-detail', detail);
  if (hint) appendLine(container, 'status-hint', hint);

  container.title = [title, detail, hint].filter(Boolean).join('\n');
}
