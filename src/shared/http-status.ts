/**
 * Canonical HTTP reason phrases (RFC 9110 + common extensions).
 *
 * Many modern servers omit the reason phrase on the wire — Tomcat 9+/Spring
 * Boot 3 ship with `sendReasonPhrase=false`, and HTTP/2 removed it entirely —
 * so `res.statusMessage` arrives empty and the UI would render a bare "400".
 * We fall back to the standard phrase for the status code instead.
 */
const HTTP_STATUS_TEXT: Record<number, string> = {
  100: 'Continue',
  101: 'Switching Protocols',
  102: 'Processing',
  103: 'Early Hints',
  200: 'OK',
  201: 'Created',
  202: 'Accepted',
  203: 'Non-Authoritative Information',
  204: 'No Content',
  205: 'Reset Content',
  206: 'Partial Content',
  207: 'Multi-Status',
  208: 'Already Reported',
  226: 'IM Used',
  300: 'Multiple Choices',
  301: 'Moved Permanently',
  302: 'Found',
  303: 'See Other',
  304: 'Not Modified',
  305: 'Use Proxy',
  307: 'Temporary Redirect',
  308: 'Permanent Redirect',
  400: 'Bad Request',
  401: 'Unauthorized',
  402: 'Payment Required',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  406: 'Not Acceptable',
  407: 'Proxy Authentication Required',
  408: 'Request Timeout',
  409: 'Conflict',
  410: 'Gone',
  411: 'Length Required',
  412: 'Precondition Failed',
  413: 'Payload Too Large',
  414: 'URI Too Long',
  415: 'Unsupported Media Type',
  416: 'Range Not Satisfiable',
  417: 'Expectation Failed',
  418: "I'm a Teapot",
  421: 'Misdirected Request',
  422: 'Unprocessable Entity',
  423: 'Locked',
  424: 'Failed Dependency',
  425: 'Too Early',
  426: 'Upgrade Required',
  428: 'Precondition Required',
  429: 'Too Many Requests',
  431: 'Request Header Fields Too Large',
  451: 'Unavailable For Legal Reasons',
  500: 'Internal Server Error',
  501: 'Not Implemented',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
  505: 'HTTP Version Not Supported',
  506: 'Variant Also Negotiates',
  507: 'Insufficient Storage',
  508: 'Loop Detected',
  510: 'Not Extended',
  511: 'Network Authentication Required',
};

/**
 * Resolve the reason phrase to display for a response.
 *
 * Prefers the phrase the server actually sent; falls back to the canonical
 * phrase for the status code, then to a generic class label (e.g. "Client
 * Error") for non-standard codes. Returns '' when no status is available.
 */
export function resolveStatusText(
  status: number | undefined | null,
  statusText?: string | null
): string {
  const provided = (statusText || '').trim();
  if (provided) return provided;

  if (!status) return '';

  const known = HTTP_STATUS_TEXT[status];
  if (known) return known;

  if (status >= 100 && status < 200) return 'Informational';
  if (status >= 200 && status < 300) return 'Success';
  if (status >= 300 && status < 400) return 'Redirection';
  if (status >= 400 && status < 500) return 'Client Error';
  if (status >= 500 && status < 600) return 'Server Error';
  return '';
}

/**
 * Format a status line ("400 Bad Request") without leaving a dangling space
 * when no reason phrase can be resolved.
 */
export function formatStatusLine(
  status: number | undefined | null,
  statusText?: string | null
): string {
  const text = resolveStatusText(status, statusText);
  const code = status ?? 0;
  return text ? `${code} ${text}` : `${code}`;
}

export { HTTP_STATUS_TEXT };
