/**
 * Redacts sensitive header / config values before logging. Intended for use
 * anywhere that may print headers, errors, or auth config — keep its surface
 * small and use it instead of ad-hoc `JSON.stringify(headers)` calls.
 *
 * Why the suffix list is generous: enterprise users frequently use custom
 * headers like `X-Company-Auth`, `X-Internal-Token`, etc. Better to over-
 * redact than to leak a credential into a log file or a customer screenshot.
 */

const SENSITIVE_PATTERNS = [
  /authorization/i,
  /cookie/i,
  /set-cookie/i,
  /api[-_]?key/i,
  /token/i,
  /secret/i,
  /password/i,
  /passphrase/i,
  /client[-_]?secret/i,
  /jks[-_]?password/i,
  /private[-_]?key/i,
  /x-amz-security-token/i,
  /x-csrf-token/i,
];

const REDACTED = '[REDACTED]';

export function isSensitiveHeader(name: string): boolean {
  return SENSITIVE_PATTERNS.some((re) => re.test(name));
}

export function redactHeaders(
  headers: Record<string, string | string[] | undefined> | undefined
): Record<string, string> {
  if (!headers) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    const value = Array.isArray(v) ? v.join(', ') : (v ?? '');
    out[k] = isSensitiveHeader(k) ? REDACTED : String(value);
  }
  return out;
}

/**
 * Shallow-redact arbitrary string fields that look secret. Use for logging
 * auth.config or arbitrary objects.
 */
export function redactObject<T extends Record<string, unknown>>(obj: T): T {
  const out = { ...obj };
  for (const k of Object.keys(out)) {
    if (typeof out[k] === 'string' && isSensitiveHeader(k)) {
      (out as Record<string, unknown>)[k] = REDACTED;
    }
  }
  return out;
}
