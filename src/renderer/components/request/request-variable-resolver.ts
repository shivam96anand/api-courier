import { ApiRequest } from '../../../shared/types';
import { resolveSystemVariable } from '../../../shared/system-variables';
import { buildFolderVars } from './variable-helper';

export interface VariableSources {
  requestVars: Record<string, string>;
  folderVars: Record<string, string>;
  envVars: Record<string, string>;
  globalVars: Record<string, string>;
}

/**
 * Resolves template variables in a string using the provided variable sources
 * Supports nested resolution up to maxDepth levels
 */
export function resolveTemplate(
  input: string,
  vars: VariableSources,
  maxDepth = 5
): string {
  const pattern = /{{\s*([a-zA-Z0-9_\-.]+)(?::([^}]+))?\s*}}/g;
  let output = input;

  for (let depth = 0; depth < maxDepth; depth++) {
    let changed = false;

    output = output.replace(pattern, (match, varName, defaultValue) => {
      let value: string | undefined;

      if (varName in vars.requestVars) {
        value = vars.requestVars[varName];
      } else if (varName in vars.envVars) {
        value = vars.envVars[varName];
      } else if (varName in vars.folderVars) {
        value = vars.folderVars[varName];
      } else if (varName in vars.globalVars) {
        value = vars.globalVars[varName];
      } else {
        const systemValue = resolveSystemVariable(varName);
        if (systemValue !== undefined) {
          value = systemValue;
        }
      }

      if (value === undefined && defaultValue !== undefined) {
        value = defaultValue;
      } else if (value === undefined) {
        return match;
      }

      changed = changed || value !== match;
      return String(value);
    });

    if (!changed) break;
  }

  return output;
}

/**
 * Resolves variables in an object's keys and values
 */
export function resolveObject(
  input: Record<string, string>,
  resolve: (value: string) => string
): Record<string, string> {
  const resolved: Record<string, string> = {};
  Object.entries(input).forEach(([key, value]) => {
    resolved[resolve(key)] = resolve(value);
  });
  return resolved;
}

/**
 * Resolves variables in params or headers (array or object format)
 */
export function resolveParamsOrHeaders(
  input: ApiRequest['params'] | ApiRequest['headers'],
  resolve: (value: string) => string
): ApiRequest['params'] | ApiRequest['headers'] {
  if (!input) return input;

  if (Array.isArray(input)) {
    return input.map(({ key, value, enabled }) => ({
      key: resolve(key),
      value: resolve(value),
      enabled
    }));
  }

  return resolveObject(input, resolve);
}

/**
 * Resolves all variables in a request, returning a new request with resolved values
 */
export async function resolveRequestVariables(request: ApiRequest): Promise<ApiRequest> {
  try {
    const state = await window.apiCourier.store.get();
    const activeEnvironment = state.activeEnvironmentId
      ? state.environments.find((e: any) => e.id === state.activeEnvironmentId)
      : undefined;
    const globals = state.globals || { variables: {} };
    const folderVars = buildFolderVars(request.collectionId, state.collections || []);
    const requestVars = request.variables || {};

    const vars: VariableSources = {
      requestVars,
      folderVars,
      envVars: activeEnvironment?.variables || {},
      globalVars: globals.variables || {}
    };

    const resolve = (input: string) => resolveTemplate(input, vars);

    const resolved: ApiRequest = {
      ...request,
      url: resolve(request.url || ''),
      params: resolveParamsOrHeaders(request.params, resolve),
      headers: resolveParamsOrHeaders(request.headers, resolve),
      body: request.body
        ? {
            ...request.body,
            content: resolve(request.body.content || ''),
            contentType: request.body.contentType ? resolve(request.body.contentType) : request.body.contentType
          }
        : undefined,
      auth: request.auth
        ? {
            ...request.auth,
            config: resolveObject(request.auth.config || {}, resolve)
          }
        : undefined
    };

    return resolved;
  } catch (error) {
    console.error('Failed to resolve request variables:', error);
    return request;
  }
}
