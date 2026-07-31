import type { KeyValuePair } from '../../../shared/types';

export interface SplitUrlResult {
  /** The URL with its query string removed (fragment preserved). */
  baseUrl: string;
  /** Query pairs, percent-decoded for display in the Params table. */
  params: KeyValuePair[];
}

/** `decodeURIComponent` throws on malformed input such as `%zz`. */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return value;
  }
}

/**
 * Splits a typed or pasted URL into its base and its query pairs.
 *
 * The Params table owns the query string, so leaving it in the URL bar means
 * the two disagree and the table silently wins at send time.
 */
export function splitUrlAndParams(url: string): SplitUrlResult {
  const questionIndex = url.indexOf('?');
  if (questionIndex === -1) return { baseUrl: url, params: [] };

  const base = url.slice(0, questionIndex);
  const rest = url.slice(questionIndex + 1);

  // A fragment always follows the query, so anything after '#' stays with the URL.
  const hashIndex = rest.indexOf('#');
  const queryString = hashIndex === -1 ? rest : rest.slice(0, hashIndex);
  const fragment = hashIndex === -1 ? '' : rest.slice(hashIndex);

  const params: KeyValuePair[] = [];
  queryString
    .split('&')
    .filter((pair) => pair.length > 0)
    .forEach((pair) => {
      const eq = pair.indexOf('=');
      const rawKey = eq === -1 ? pair : pair.slice(0, eq);
      const rawValue = eq === -1 ? '' : pair.slice(eq + 1);
      const key = safeDecode(rawKey).trim();
      if (!key) return;
      params.push({ key, value: safeDecode(rawValue), enabled: true });
    });

  return { baseUrl: `${base}${fragment}`, params };
}

/**
 * Appends newly parsed pairs to the existing table.
 *
 * Duplicate keys are kept as separate rows rather than overwritten — a repeated
 * key is legal in a query string, and silently replacing a value the user
 * already typed would be worse than showing both.
 */
export function mergeParams(
  existing: KeyValuePair[],
  incoming: KeyValuePair[]
): { params: KeyValuePair[]; duplicateKeys: string[] } {
  const meaningful = existing.filter((p) => (p.key ?? '').trim() !== '');
  const existingKeys = new Set(meaningful.map((p) => p.key));
  const duplicateKeys = incoming
    .filter((p) => existingKeys.has(p.key))
    .map((p) => p.key);

  return { params: [...meaningful, ...incoming], duplicateKeys };
}
