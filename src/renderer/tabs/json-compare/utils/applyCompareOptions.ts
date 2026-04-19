/**
 * Pure helpers that apply user-selected JsonCompareOptions to two parsed JSON
 * values BEFORE diffing. Keeps the diff worker straightforward.
 */

import type { JsonCompareOptions } from '../../../../shared/types';

/** Recursively sort object keys (canonicalize) so key order doesn't show up as a diff. */
export function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    Object.keys(obj)
      .sort()
      .forEach((k) => {
        out[k] = sortKeysDeep(obj[k]);
      });
    return out;
  }
  return value;
}

/** Recursively lowercase string values (case-insensitive compare). */
export function lowerStringsDeep(value: unknown): unknown {
  if (typeof value === 'string') return value.toLowerCase();
  if (Array.isArray(value)) return value.map(lowerStringsDeep);
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj)) out[k] = lowerStringsDeep(obj[k]);
    return out;
  }
  return value;
}

/** Recursively collapse internal whitespace in string values. */
export function collapseWhitespaceDeep(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(/\s+/g, ' ').trim();
  if (Array.isArray(value)) return value.map(collapseWhitespaceDeep);
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj)) out[k] = collapseWhitespaceDeep(obj[k]);
    return out;
  }
  return value;
}

/** Apply all comparison options to a parsed JSON value. Returns a new value (does not mutate input). */
export function applyCompareOptions(
  value: unknown,
  options: JsonCompareOptions | undefined
): unknown {
  if (!options) return value;
  let v = value;
  if (options.ignoreStringWhitespace) v = collapseWhitespaceDeep(v);
  if (options.caseInsensitive) v = lowerStringsDeep(v);
  if (options.sortKeys) v = sortKeysDeep(v);
  return v;
}
