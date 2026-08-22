/**
 * Single source of truth for "can we reuse the OAuth token we already have?".
 *
 * The renderer (before Send), the main process (before dispatching the HTTP
 * request) and the load-test engine each used to answer this question with
 * their own rules, which meant a perfectly good token was frequently thrown
 * away and a brand new one minted on every send.
 */

/**
 * A token expiring within this window is treated as already gone, so it is
 * renewed before the request rather than failing with a 401 mid-flight.
 */
export const OAUTH_TOKEN_REFRESH_SKEW_MS = 30_000;

export type OAuthTokenState =
  /** No access token at all — one must be acquired. */
  | 'missing'
  /** Usable as-is; do not acquire or refresh. */
  | 'reusable'
  /** Still technically valid but inside the refresh skew window. */
  | 'expiring'
  /** Past its expiry. */
  | 'expired';

interface OAuthTokenLike {
  accessToken?: string;
  expiresAt?: string;
}

interface OAuthTokenStateOptions {
  skewMs?: number;
  now?: number;
}

export function getOAuthTokenState(
  config: OAuthTokenLike | null | undefined,
  options: OAuthTokenStateOptions = {}
): OAuthTokenState {
  if (!config?.accessToken) return 'missing';

  const expiresAt = config.expiresAt
    ? Date.parse(config.expiresAt)
    : Number.NaN;
  // A token pasted by hand or carried in from a Postman/Insomnia import has no
  // expiry. Its lifetime is unknowable, so reuse it instead of re-running the
  // grant on every single send.
  if (!Number.isFinite(expiresAt)) return 'reusable';

  const now = options.now ?? Date.now();
  if (expiresAt <= now) return 'expired';

  const skewMs = options.skewMs ?? OAUTH_TOKEN_REFRESH_SKEW_MS;
  return expiresAt - now <= skewMs ? 'expiring' : 'reusable';
}

export function canReuseOAuthToken(
  config: OAuthTokenLike | null | undefined,
  options: OAuthTokenStateOptions = {}
): boolean {
  return getOAuthTokenState(config, options) === 'reusable';
}
