import {
  DEFAULT_BODY_FONT_SIZE,
  MAX_BODY_FONT_SIZE,
  MIN_BODY_FONT_SIZE,
} from '../../shared/constants';

/**
 * The one font size shared by the request-payload and response-body editors.
 *
 * Held here (not in either editor) so the A- / A+ controls in both panes and
 * the Settings modal all read and write the same value, and so it can be
 * persisted to `editorSettings.bodyFontSize` for the next launch.
 */

export const BODY_FONT_SIZE_CHANGED_EVENT = 'body-font-size-changed';

let currentFontSize = DEFAULT_BODY_FONT_SIZE;

export function clampBodyFontSize(px: number): number {
  if (!Number.isFinite(px)) return DEFAULT_BODY_FONT_SIZE;
  return Math.min(
    MAX_BODY_FONT_SIZE,
    Math.max(MIN_BODY_FONT_SIZE, Math.round(px))
  );
}

export function getBodyFontSize(): number {
  return currentFontSize;
}

function apply(px: number): boolean {
  const next = clampBodyFontSize(px);
  if (next === currentFontSize) return false;
  currentFontSize = next;
  document.dispatchEvent(
    new CustomEvent(BODY_FONT_SIZE_CHANGED_EVENT, {
      detail: { fontSize: next },
    })
  );
  return true;
}

/** Adopt the stored preference on startup without writing it back. */
export function hydrateBodyFontSize(px: number | undefined): void {
  if (typeof px !== 'number') return;
  apply(px);
}

/** User-driven change: updates both editors and persists the preference. */
export function setBodyFontSize(px: number): void {
  if (!apply(px)) return;
  void window.restbro.store
    .set({ editorSettings: { bodyFontSize: currentFontSize } })
    .catch((error) => console.error('Failed to save body font size:', error));
}
