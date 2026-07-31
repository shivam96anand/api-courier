/** Header names whose values must never be pasted into a ticket or chat. */
const SENSITIVE_HEADERS = [
  'authorization',
  'proxy-authorization',
  'x-api-key',
  'api-key',
  'apikey',
  'cookie',
  'set-cookie',
  'x-auth-token',
];

const PLACEHOLDER = '<REDACTED>';

export function isSensitiveHeaderName(name: string): boolean {
  return SENSITIVE_HEADERS.includes(name.trim().toLowerCase());
}

/** Matches `Authorization:` and `'X-API-Key' :` alike, across all generators. */
const SENSITIVE_HEADER_PATTERN = new RegExp(
  `(^|[^a-z-])(${SENSITIVE_HEADERS.join('|')})["']?\\s*:`,
  'i'
);

/** True when a generated snippet embeds a credential the user may not expect. */
export function snippetContainsCredentials(snippet: string): boolean {
  if (!snippet) return false;
  return SENSITIVE_HEADER_PATTERN.test(snippet);
}

/**
 * Replaces credential values in a generated snippet while leaving the code
 * syntactically valid, so it can be shared and then filled in by the reader.
 *
 * Works on the rendered text rather than the request model because each
 * generator formats headers differently.
 */
export function redactSnippetCredentials(snippet: string): string {
  if (!snippet) return snippet;

  return snippet.replace(
    /(['"]?)([A-Za-z-]+)\1(\s*:\s*)(['"]?)([^'"\n,}]*)\4/g,
    (match, keyQuote, headerName, separator, valueQuote, value) => {
      if (!isSensitiveHeaderName(headerName)) return match;
      if (!value || value.trim() === '') return match;
      return `${keyQuote}${headerName}${keyQuote}${separator}${valueQuote}${PLACEHOLDER}${valueQuote}`;
    }
  );
}
