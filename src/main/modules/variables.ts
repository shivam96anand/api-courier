/**
 * Variable Resolution Engine for API Courier
 * Resolves {{variable}} placeholders in URLs, headers, params, and body content
 *
 * Precedence: Request Local > Active Environment > Folder (ancestor chain) > Globals
 * Supports: nested variables, default values {{var:default}}, URL encoding
 */

import { KeyValuePair } from '../../shared/types';
import { resolveSystemVariable } from '../../shared/system-variables';

export interface ResolveOptions {
  requestVars?: Record<string, string>;
  folderVars?: Record<string, string>; // Merged from all ancestor folders (nearest first)
  envVars?: Record<string, string>;
  globalVars?: Record<string, string>;
  systemVars?: Record<string, string>;
  urlEncodeValues?: boolean;
  maxDepth?: number;
}

// Regex to match {{varName}} or {{varName:defaultValue}}
const VAR_RE = /{{\s*([a-zA-Z0-9_\-.]+)(?::([^}]+))?\s*}}/g;

/**
 * Builds folder variables by merging ancestor folder variables
 * Precedence: nearest folder (child) overrides distant folder (parent)
 */
export function buildFolderVars(
  collectionId: string | undefined,
  collections: any[]
): Record<string, string> {
  if (!collectionId) return {};

  const folderVars: Record<string, string> = {};
  const ancestorChain: any[] = [];

  // Build ancestor chain from child to root
  let currentId: string | undefined = collectionId;
  while (currentId) {
    const collection = collections.find(c => c.id === currentId);
    if (!collection) break;

    ancestorChain.push(collection);
    currentId = collection.parentId;
  }

  // Merge variables from root to child (so child overrides parent)
  for (let i = ancestorChain.length - 1; i >= 0; i--) {
    const ancestor = ancestorChain[i];
    if (ancestor.variables && ancestor.type === 'folder') {
      Object.assign(folderVars, ancestor.variables);
    }
  }

  return folderVars;
}

/**
 * Resolves variable placeholders in a template string
 * Supports nested variables and default values
 */
export function resolveTemplate(input: string, opts: ResolveOptions = {}): string {
  const {
    requestVars = {},
    folderVars = {},
    envVars = {},
    globalVars = {},
    systemVars,
    urlEncodeValues = false,
    maxDepth = 5
  } = opts;

  let output = input;

  // Iteratively resolve up to maxDepth to handle nested variables
  for (let depth = 0; depth < maxDepth; depth++) {
    let changed = false;

    output = output.replace(VAR_RE, (match, varName, defaultValue) => {
      // Check precedence: request > env > folder > global
      let value: string | undefined;

      if (varName in requestVars) {
        value = requestVars[varName];
      } else if (varName in envVars) {
        value = envVars[varName];
      } else if (varName in folderVars) {
        value = folderVars[varName];
      } else if (varName in globalVars) {
        value = globalVars[varName];
      } else if (systemVars && varName in systemVars) {
        value = systemVars[varName];
      } else {
        const systemValue = resolveSystemVariable(varName);
        if (systemValue !== undefined) {
          value = systemValue;
          if (systemVars) {
            systemVars[varName] = systemValue;
          }
        }
      }

      if (value === undefined && defaultValue !== undefined) {
        value = defaultValue;
      } else {
        // Variable not found and no default - keep placeholder
        return match;
      }

      // URL encode if requested
      if (urlEncodeValues && value !== undefined) {
        value = encodeURIComponent(value);
      }

      changed = changed || value !== match;
      return String(value);
    });

    // Stop if nothing changed (no more substitutions possible)
    if (!changed) break;
  }

  return output;
}

/**
 * Resolves variables in a key-value record
 */
export function resolveObject(
  obj: Record<string, string>,
  opts: ResolveOptions = {}
): Record<string, string> {
  const resolved: Record<string, string> = {};

  for (const [key, value] of Object.entries(obj)) {
    resolved[resolveTemplate(key, opts)] = resolveTemplate(value, opts);
  }

  return resolved;
}

/**
 * Resolves variables in a KeyValuePair array
 */
export function resolveKeyValueArray(
  arr: KeyValuePair[],
  opts: ResolveOptions = {}
): KeyValuePair[] {
  return arr.map(({ key, value, enabled }) => ({
    key: resolveTemplate(key, opts),
    value: resolveTemplate(value, opts),
    enabled
  }));
}

/**
 * Resolves variables in params/headers (handles both formats)
 */
export function resolveParamsOrHeaders(
  input: KeyValuePair[] | Record<string, string> | undefined,
  opts: ResolveOptions = {}
): KeyValuePair[] | Record<string, string> {
  if (!input) return {};
  
  if (Array.isArray(input)) {
    return resolveKeyValueArray(input, opts);
  } else {
    return resolveObject(input, opts);
  }
}

/**
 * Scans a string for unresolved variable placeholders
 * Returns array of variable names that couldn't be resolved
 */
export function scanUnresolvedVars(input: string, opts: ResolveOptions = {}): string[] {
  const { requestVars = {}, folderVars = {}, envVars = {}, globalVars = {} } = opts;
  const unresolved: string[] = [];

  // After resolution, find remaining {{var}} patterns
  const resolved = resolveTemplate(input, opts);

  let match;
  const regex = new RegExp(VAR_RE);
  while ((match = regex.exec(resolved)) !== null) {
    const varName = match[1];
    if (
      !(varName in requestVars) &&
      !(varName in envVars) &&
      !(varName in folderVars) &&
      !(varName in globalVars) &&
      resolveSystemVariable(varName) === undefined
    ) {
      unresolved.push(varName);
    }
  }

  return unresolved;
}

/**
 * Composes a final request with all variables resolved
 */
export function composeFinalRequest(
  request: any,
  activeEnv?: { variables: Record<string, string> },
  globals?: { variables: Record<string, string> },
  folderVars?: Record<string, string>
): {
  url: string;
  params: KeyValuePair[] | Record<string, string>;
  headers: KeyValuePair[] | Record<string, string>;
  body?: { type: string; content: string };
  auth?: any;
} {
  const opts: ResolveOptions = {
    requestVars: request.variables || {},
    folderVars: folderVars || {},
    envVars: activeEnv?.variables || {},
    globalVars: globals?.variables || {},
    systemVars: {},
    maxDepth: 5,
  };

  // Resolve URL (without URL encoding the template itself)
  const resolvedUrl = resolveTemplate(request.url, opts);

  // Resolve params (with URL encoding for values that will go into query string)
  const resolvedParams = resolveParamsOrHeaders(request.params, {
    ...opts,
    urlEncodeValues: true,
  });

  // Resolve headers
  const resolvedHeaders = resolveParamsOrHeaders(request.headers, opts);

  // Resolve body content
  let resolvedBody = request.body;
  if (request.body && request.body.content) {
    resolvedBody = {
      ...request.body,
      content: resolveTemplate(request.body.content, opts),
    };
  }

  // Resolve auth config values
  let resolvedAuth = request.auth;
  if (request.auth && request.auth.config) {
    resolvedAuth = {
      ...request.auth,
      config: resolveObject(request.auth.config, opts),
    };
  }

  return {
    url: resolvedUrl,
    params: resolvedParams,
    headers: resolvedHeaders,
    body: resolvedBody,
    auth: resolvedAuth,
  };
}
