/**
 * Turns raw OAuth token-endpoint failures into human-readable messages.
 *
 * The main process throws strings such as
 *   `Token request failed: 401 Unauthorized - {"error":"unauthorized_client",...}`
 * Dumping that straight into the UI shows the user raw JSON. This module
 * parses the RFC 6749 error response (or network error code) and produces a
 * short title, the server's own description, and an actionable hint.
 */

export interface OAuthErrorDisplay {
  /** Short, human-readable summary — always present. */
  title: string;
  /** The authorization server's own explanation, if it sent a useful one. */
  detail?: string;
  /** Actionable next step for the user. */
  hint?: string;
}

interface ParsedOAuthBody {
  code?: string;
  description?: string;
  uri?: string;
}

const MAX_DETAIL_LENGTH = 300;

/** RFC 6749 §5.2 / §4.1.2.1 / RFC 8628 error codes → friendly copy. */
const ERROR_CODE_COPY: Record<string, { title: string; hint?: string }> = {
  invalid_client: {
    title: 'Client authentication failed',
    hint: 'Check the Client ID and Client Secret, and confirm the client authentication method (Basic header vs. request body) under Advanced Options.',
  },
  unauthorized_client: {
    title: 'Client is not allowed to use this grant',
    hint: 'Verify the Client ID and Client Secret, and make sure this grant type is enabled for the client on the authorization server.',
  },
  invalid_grant: {
    title: 'Authorization grant is invalid or expired',
    hint: 'The authorization code or refresh token may have expired or already been used. Request a new token.',
  },
  invalid_request: {
    title: 'The token request was malformed',
    hint: 'Check that every field required by this grant type is filled in and free of typos or stray spaces.',
  },
  invalid_scope: {
    title: 'The requested scope is invalid',
    hint: 'Remove the scope or use one the client is allowed to request.',
  },
  unsupported_grant_type: {
    title: 'The server does not support this grant type',
    hint: 'Pick a grant type the authorization server enables for this client.',
  },
  unsupported_response_type: {
    title: 'The server does not support this response type',
    hint: 'Use a grant type supported by the authorization server.',
  },
  access_denied: {
    title: 'Access was denied',
    hint: 'The user or the authorization server rejected the request.',
  },
  invalid_token: {
    title: 'The token was rejected',
    hint: 'Clear the stored token and request a new one.',
  },
  expired_token: {
    title: 'The token has expired',
    hint: 'Request a new token.',
  },
  server_error: {
    title: 'The authorization server hit an internal error',
    hint: 'Retry in a moment, or contact the API provider if it keeps failing.',
  },
  temporarily_unavailable: {
    title: 'The authorization server is temporarily unavailable',
    hint: 'Retry in a moment.',
  },
  authorization_pending: {
    title: 'Waiting for the user to approve the device code',
    hint: 'Finish the approval in the browser, then try again.',
  },
  slow_down: {
    title: 'Polling too fast',
    hint: 'Wait a few seconds before requesting the token again.',
  },
  consent_required: {
    title: 'User consent is required',
    hint: 'Use a grant type with a browser step so the user can grant consent.',
  },
  login_required: {
    title: 'User login is required',
    hint: 'Use a grant type with a browser step so the user can sign in.',
  },
};

/** Status-code fallbacks when the server sends no OAuth error code. */
const STATUS_COPY: Record<number, { title: string; hint?: string }> = {
  400: {
    title: 'The authorization server rejected the token request',
    hint: 'Check the grant type settings and required fields.',
  },
  401: {
    title: 'Client authentication failed',
    hint: 'Check the Client ID and Client Secret.',
  },
  403: {
    title: 'The authorization server refused the request',
    hint: 'The client may not be allowed to use this token endpoint or grant type.',
  },
  404: {
    title: 'Token URL not found',
    hint: 'Check the Token URL — it must point at the token endpoint (for example .../protocol/openid-connect/token).',
  },
  405: {
    title: 'Token URL does not accept POST',
    hint: 'Check the Token URL — it is probably the authorization endpoint, not the token endpoint.',
  },
  415: {
    title: 'The server rejected the request content type',
    hint: 'Try switching the client authentication method under Advanced Options.',
  },
  429: {
    title: 'Too many token requests',
    hint: 'Wait a moment before requesting another token.',
  },
};

/** Network/TLS failures that never reach the token endpoint. */
function formatTransportError(message: string): OAuthErrorDisplay | null {
  if (/cancelled by user|AbortError/i.test(message)) {
    return { title: 'Token request cancelled' };
  }
  if (/ENOTFOUND|getaddrinfo|EAI_AGAIN|\bDNS\b/i.test(message)) {
    return {
      title: 'Cannot reach the authorization server',
      hint: 'The host could not be resolved. Check the Token URL, your network, and whether a VPN is required.',
    };
  }
  if (/ECONNREFUSED/i.test(message)) {
    return {
      title: 'Connection refused by the authorization server',
      hint: 'Check the Token URL and port, and that the server is running.',
    };
  }
  if (/ETIMEDOUT|ESOCKETTIMEDOUT|\btimeout\b/i.test(message)) {
    return {
      title: 'The authorization server timed out',
      hint: 'Check your network or VPN connection and try again.',
    };
  }
  if (/ECONNRESET|EPIPE/i.test(message)) {
    return {
      title: 'The connection to the authorization server was reset',
      hint: 'Retry the request; if it persists, check any proxy or VPN in between.',
    };
  }
  if (
    /certificate|self.signed|CERT_|SSL|TLS|DEPTH_ZERO|UNABLE_TO_VERIFY/i.test(
      message
    )
  ) {
    return {
      title: 'TLS certificate could not be verified',
      detail: trimDetail(message),
      hint: 'The token endpoint uses a certificate your machine does not trust. Install the CA certificate or use a trusted endpoint.',
    };
  }
  return null;
}

function trimDetail(text: string): string | undefined {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return undefined;
  return clean.length > MAX_DETAIL_LENGTH
    ? `${clean.slice(0, MAX_DETAIL_LENGTH - 1)}…`
    : clean;
}

/** `unauthorized_client` → `Unauthorized client` for codes we don't map. */
function humanizeCode(code: string): string {
  const words = code.replace(/[_-]+/g, ' ').trim();
  if (!words) return 'Token request failed';
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function stripHtml(body: string): string | undefined {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(body)?.[1];
  return trimDetail(title || body.replace(/<[^>]*>/g, ' '));
}

function parseBody(body: string): ParsedOAuthBody | null {
  const trimmed = body.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;
  try {
    const data = JSON.parse(trimmed);
    if (!data || typeof data !== 'object') return null;
    const code =
      typeof data.error === 'string'
        ? data.error
        : typeof data.error?.code === 'string'
          ? data.error.code
          : undefined;
    const description =
      typeof data.error_description === 'string'
        ? data.error_description
        : typeof data.message === 'string'
          ? data.message
          : typeof data.error?.message === 'string'
            ? data.error.message
            : undefined;
    const uri = typeof data.error_uri === 'string' ? data.error_uri : undefined;
    if (!code && !description) return null;
    return { code, description, uri };
  } catch {
    return null;
  }
}

function describeBody(body: string): ParsedOAuthBody & { raw?: string } {
  const parsed = parseBody(body);
  if (parsed) return parsed;
  if (/^\s*</.test(body)) return { description: stripHtml(body) };
  return { description: trimDetail(body) };
}

/**
 * Formats any OAuth failure message for display.
 * Always returns a title; `detail`/`hint` are added when we have something
 * genuinely useful to say.
 */
export function formatOAuthError(rawMessage: unknown): OAuthErrorDisplay {
  const message =
    typeof rawMessage === 'string'
      ? rawMessage.trim()
      : rawMessage instanceof Error
        ? rawMessage.message.trim()
        : '';

  if (!message) {
    return {
      title: 'Token request failed',
      hint: 'Check the OAuth configuration and try again.',
    };
  }

  // Strip a leading "Error: " added by callers before matching.
  const normalized = message.replace(/^error:\s*/i, '');

  const transport = formatTransportError(normalized);
  if (transport) return transport;

  // `Token request failed: 401 Unauthorized - <body>`
  const httpMatch =
    /^Token request failed:\s*(\d{3})[^-]*(?:-\s*([\s\S]*))?$/i.exec(
      normalized
    );
  // `OAuth error: invalid_client - description`
  const oauthMatch = /^OAuth error:\s*([\w.-]+)\s*(?:-\s*([\s\S]*))?$/i.exec(
    normalized
  );

  let status: number | undefined;
  let parsed: ParsedOAuthBody = {};

  if (httpMatch) {
    status = Number(httpMatch[1]);
    parsed = describeBody(httpMatch[2] || '');
  } else if (oauthMatch) {
    parsed = {
      code: oauthMatch[1],
      description: trimDetail(oauthMatch[2] || ''),
    };
  } else {
    parsed = describeBody(normalized);
    // Nothing structured to work with — surface the original message as-is.
    if (!parsed.code) {
      return { title: parsed.description || 'Token request failed' };
    }
  }

  const copy = parsed.code
    ? ERROR_CODE_COPY[parsed.code.toLowerCase()]
    : undefined;
  const statusCopy = status !== undefined ? STATUS_COPY[status] : undefined;

  const title =
    copy?.title ||
    (parsed.code ? humanizeCode(parsed.code) : undefined) ||
    statusCopy?.title ||
    (status !== undefined
      ? `Token request failed (HTTP ${status})`
      : 'Token request failed');

  const hint = copy?.hint || statusCopy?.hint;

  const detailParts: string[] = [];
  if (status !== undefined) detailParts.push(`HTTP ${status}`);
  const description = trimDetail(parsed.description || '');
  if (description && description.toLowerCase() !== title.toLowerCase()) {
    detailParts.push(description);
  }

  return {
    title,
    ...(detailParts.length ? { detail: detailParts.join(' · ') } : {}),
    ...(hint ? { hint } : {}),
  };
}

/** Single-line variant for logs, tooltips and toasts. */
export function formatOAuthErrorText(rawMessage: unknown): string {
  const { title, detail, hint } = formatOAuthError(rawMessage);
  return [title, detail, hint].filter(Boolean).join(' — ');
}
