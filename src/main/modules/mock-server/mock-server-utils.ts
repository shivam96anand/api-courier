import * as http from 'http';
import { MockPathMatchType } from '../../../shared/types';

export interface RunningServerInfo {
  server: http.Server;
  serverId: string;
}

/**
 * Redact authorization/token values from headers for logging
 */
export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const redacted: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    if (lowerKey === 'authorization' || lowerKey.includes('token') || lowerKey.includes('secret')) {
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
      // Match if request path starts with route path (supports trailing wildcards like /api/*)
      const prefixPattern = routePath.endsWith('*') ? routePath.slice(0, -1) : routePath;
      return requestPath.startsWith(prefixPattern);

    case 'wildcard':
      return matchWildcard(routePath, requestPath);

    case 'regex':
      return matchRegex(routePath, requestPath);

    default:
      return routePath === requestPath;
  }
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
  let regexStr = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // Escape special chars
    .replace(/\*\*/g, '<<<DOUBLE_STAR>>>') // Placeholder for **
    .replace(/\*/g, '[^/]+') // * matches single segment
    .replace(/<<<DOUBLE_STAR>>>/g, '.*'); // ** matches multiple segments

  // Ensure full match
  const regex = new RegExp(`^${regexStr}$`);
  return regex.test(path);
}

/**
 * Regex path matching
 * Allows full regex patterns for advanced matching scenarios
 */
function matchRegex(pattern: string, path: string): boolean {
  try {
    const regex = new RegExp(pattern);
    return regex.test(path);
  } catch {
    // Invalid regex pattern, fallback to exact match
    console.warn(`[MockServer] Invalid regex pattern: ${pattern}`);
    return pattern === path;
  }
}

/**
 * Calculate match specificity score for route prioritization
 * Higher score = more specific match = higher priority
 */
export function getMatchSpecificity(routePath: string, matchType: MockPathMatchType = 'exact'): number {
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
      return 300 + segmentCount * 10 - wildcardCount * 5 - doubleWildcardCount * 20;
    case 'regex':
      // Regex has lowest base priority (most flexible = least specific)
      return 100 + routePath.length;
    default:
      return 0;
  }
}
