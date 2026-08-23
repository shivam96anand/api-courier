import * as http from 'http';
import { MockPathMatchType } from '../../../shared/types';

export interface RunningServerInfo {
  server: http.Server;
  serverId: string;
}

/**
 * Redact authorization/token values from headers for logging
 */
export function redactHeaders(
  headers: Record<string, string>
): Record<string, string> {
  const redacted: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey === 'authorization' ||
      lowerKey.includes('token') ||
      lowerKey.includes('secret')
    ) {
      redacted[key] = '[REDACTED]';
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

/**
 * Simple delay utility
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Permissive CORS headers for a mock server, so a browser front-end can call it
 * during development. Never overwrites a header a route already set.
 */
export function applyCorsHeaders(
  req: { headers: Record<string, string | string[] | undefined> },
  res: {
    hasHeader(name: string): boolean;
    setHeader(name: string, value: string): void;
  }
): void {
  const origin = req.headers.origin;
  const allowOrigin = typeof origin === 'string' && origin ? origin : '*';
  const requestedHeaders = req.headers['access-control-request-headers'];

  const defaults: Array<[string, string]> = [
    ['Access-Control-Allow-Origin', allowOrigin],
    ['Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS'],
    [
      'Access-Control-Allow-Headers',
      typeof requestedHeaders === 'string' && requestedHeaders
        ? requestedHeaders
        : '*',
    ],
    ['Access-Control-Max-Age', '600'],
  ];

  if (allowOrigin !== '*') {
    defaults.push(['Vary', 'Origin']);
  }

  defaults.forEach(([name, value]) => {
    if (!res.hasHeader(name)) res.setHeader(name, value);
  });
}

/**
 * Path matching utility for mock routes
 * Supports multiple matching strategies for enterprise-level flexibility
 */
export function matchPath(
  routePath: string,
  requestPath: string,
  matchType: MockPathMatchType = 'exact'
): boolean {
  switch (matchType) {
    case 'exact':
      return routePath === requestPath;

    case 'prefix':
      return matchPrefix(routePath, requestPath);

    case 'wildcard':
      return matchWildcard(routePath, requestPath);

    case 'regex':
      return matchRegex(routePath, requestPath);

    default:
      return routePath === requestPath;
  }
}

/** Trailing slashes are not meaningful when comparing path prefixes. */
function stripTrailingSlash(value: string): string {
  return value.length > 1 && value.endsWith('/') ? value.slice(0, -1) : value;
}

/**
 * Prefix matching on segment boundaries.
 *
 * A plain `startsWith` made a `/users` route also serve `/usersXYZ`, which is a
 * different resource. An explicit trailing `*` keeps its original loose
 * behaviour so existing routes are unaffected.
 */
function matchPrefix(routePath: string, requestPath: string): boolean {
  if (routePath.endsWith('*')) {
    return requestPath.startsWith(routePath.slice(0, -1));
  }

  const prefix = stripTrailingSlash(routePath);
  const path = stripTrailingSlash(requestPath);
  if (path === prefix) return true;
  return path.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`);
}

/**
 * Wildcard path matching
 * Supports:
 * - * matches any single path segment (e.g., /api/* matches /api/users but not /api/users/123)
 * - ** matches any number of path segments (e.g., /api/** matches /api/users/123/details)
 */
function matchWildcard(pattern: string, path: string): boolean {
  // Convert wildcard pattern to regex
  // Escape special regex characters except * and **
  const regexStr = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // Escape special chars
    .replace(/\*\*/g, '<<<DOUBLE_STAR>>>') // Placeholder for **
    .replace(/\*/g, '[^/]+') // * matches single segment
    .replace(/<<<DOUBLE_STAR>>>/g, '.*'); // ** matches multiple segments

  // Ensure full match
  const regex = new RegExp(`^${regexStr}$`);
  return regex.test(path);
}

/**
 * Longest request path we will run a user regex against. Real paths are far
 * below this; the cap stops a huge crafted URL from making even a linear
 * pattern expensive.
 */
const MAX_REGEX_PATH_LENGTH = 2048;

/**
 * Rejects patterns that can backtrack catastrophically, i.e. a quantifier
 * applied to a group that already contains a quantifier — `(a+)+`, `(a*)*`,
 * `([a-z]+)*` and friends. Matching one of those against a non-matching path
 * runs in exponential time, and because the mock server runs on the main
 * process that freezes the entire app until it finishes.
 */
export function isRedosProne(pattern: string): boolean {
  let depth = 0;
  const quantifierDepths: number[] = [];

  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '\\') {
      i++;
      continue;
    }
    if (ch === '[') {
      while (i < pattern.length && pattern[i] !== ']') {
        if (pattern[i] === '\\') i++;
        i++;
      }
      continue;
    }
    if (ch === '(') {
      depth++;
      quantifierDepths.push(0);
      continue;
    }
    if (ch === ')') {
      const innerQuantifiers = quantifierDepths.pop() ?? 0;
      depth--;
      const next = pattern[i + 1];
      const groupIsQuantified =
        next === '*' || next === '+' || next === '{' || next === '?';
      // A quantified group whose body is itself quantified is the classic
      // exponential-backtracking shape.
      if (groupIsQuantified && innerQuantifiers > 0 && next !== '?') {
        return true;
      }
      continue;
    }
    if ((ch === '*' || ch === '+' || ch === '{') && depth > 0) {
      quantifierDepths[quantifierDepths.length - 1]++;
    }
  }

  return false;
}

/** Compiled patterns are cached so a hot route doesn't recompile per request. */
const regexCache = new Map<string, RegExp | null>();

function compileRouteRegex(pattern: string): RegExp | null {
  if (regexCache.has(pattern)) {
    return regexCache.get(pattern) ?? null;
  }

  let compiled: RegExp | null = null;
  if (isRedosProne(pattern)) {
    console.warn(
      `[MockServer] Refusing unsafe regex route (nested quantifier can hang the app): ${pattern}`
    );
  } else {
    try {
      compiled = new RegExp(pattern);
    } catch {
      console.warn(`[MockServer] Invalid regex pattern: ${pattern}`);
    }
  }

  regexCache.set(pattern, compiled);
  return compiled;
}

/**
 * Regex path matching
 * Allows full regex patterns for advanced matching scenarios
 */
function matchRegex(pattern: string, path: string): boolean {
  const regex = compileRouteRegex(pattern);
  // Unusable pattern (invalid or unsafe) — fall back to exact match so the
  // route still behaves predictably instead of matching everything.
  if (!regex) return pattern === path;
  if (path.length > MAX_REGEX_PATH_LENGTH) return false;
  return regex.test(path);
}

/**
 * Calculate match specificity score for route prioritization
 * Higher score = more specific match = higher priority
 */
export function getMatchSpecificity(
  routePath: string,
  matchType: MockPathMatchType = 'exact'
): number {
  const segmentCount = (routePath.match(/\//g) || []).length;
  const wildcardCount = (routePath.match(/\*/g) || []).length;
  const doubleWildcardCount = (routePath.match(/\*\*/g) || []).length;

  switch (matchType) {
    case 'exact':
      // Exact matches have highest base priority
      return 1000 + segmentCount * 10;
    case 'prefix':
      // Prefix matches: longer prefixes = higher priority
      return 500 + segmentCount * 10 - wildcardCount * 5;
    case 'wildcard':
      // Wildcard: more segments = higher priority, but wildcards reduce it
      return (
        300 + segmentCount * 10 - wildcardCount * 5 - doubleWildcardCount * 20
      );
    case 'regex':
      // Regex has lowest base priority (most flexible = least specific)
      return 100 + routePath.length;
    default:
      return 0;
  }
}
