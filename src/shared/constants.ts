/**
 * Centralized numeric constants used across main + renderer.
 *
 * Keep this file dependency-free so it can be imported from both processes
 * without dragging Node or DOM types in.
 */

// ---------- Networking / requests ----------

/** Default per-request timeout (ms) when user hasn't overridden in settings. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;

/** Default cap on response body size we'll buffer (bytes). */
export const DEFAULT_MAX_RESPONSE_BYTES = 50 * 1024 * 1024;

/** Threshold above which a response body is considered "large". */
export const LARGE_RESPONSE_THRESHOLD_BYTES = 5_000_000;

// ---------- Renderer debouncing ----------

/** Quick debounce for live editor previews (curl/code panes). */
export const PREVIEW_DEBOUNCE_MS = 120;

/** Slower debounce for autosaving form state. */
export const AUTOSAVE_DEBOUNCE_MS = 500;

/** Standard toast/notification visibility duration. */
export const TOAST_DURATION_MS = 5_000;
