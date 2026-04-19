/**
 * Glob-style matcher for JSON Pointer paths.
 *
 * Patterns:
 *   - "/users/0/name"         exact
 *   - "/users/* /createdAt"    "*"  matches a single segment
 *   - "/audit/**"             "**" matches any number of segments (zero or more)
 *   - leading "/" optional; matching is case-sensitive
 *   - lines starting with "#" or empty lines are ignored when normalising input
 */

export function normalizeIgnorePatterns(
  patterns: string[] | undefined
): string[] {
  if (!patterns) return [];
  return patterns
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !p.startsWith('#'));
}

function patternToRegex(pattern: string): RegExp {
  const normalized = pattern.startsWith('/') ? pattern : '/' + pattern;
  // Escape regex specials, then re-introduce ** and * placeholders.
  // Use sentinel tokens to avoid clashes during escape.
  const escaped = normalized
    // eslint-disable-next-line no-control-regex
    .replace(/\*\*/g, '\u0000DOUBLESTAR\u0000')
    // eslint-disable-next-line no-control-regex
    .replace(/\*/g, '\u0000SINGLESTAR\u0000')
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    // eslint-disable-next-line no-control-regex
    .replace(/\u0000DOUBLESTAR\u0000/g, '.*')
    // eslint-disable-next-line no-control-regex
    .replace(/\u0000SINGLESTAR\u0000/g, '[^/]*');
  return new RegExp('^' + escaped + '$');
}

export function buildIgnoreMatcher(
  patterns: string[] | undefined
): (path: string) => boolean {
  const list = normalizeIgnorePatterns(patterns);
  if (list.length === 0) return () => false;
  const regexes = list.map(patternToRegex);
  return (path: string) => regexes.some((r) => r.test(path));
}
