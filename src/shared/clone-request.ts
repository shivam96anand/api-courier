import type { ApiRequest } from './types';

/**
 * Deep-clones an `ApiRequest`, preserving the array-vs-object shape of
 * `params` and `headers`. Centralized so the three former renderer copies
 * (request-manager, tabs-event-handler, tabs-state-manager) stay in sync.
 *
 * NOTE: this is a structural clone of the request graph only — `body.content`
 * stays as-is (it's a string), and we don't recurse into `auth.config` values
 * beyond a shallow copy because they're flat string maps.
 */
export function cloneApiRequest(request: ApiRequest): ApiRequest {
  return {
    ...request,
    params: Array.isArray(request.params)
      ? request.params.map((param) => ({ ...param }))
      : request.params
        ? { ...request.params }
        : request.params,
    headers: Array.isArray(request.headers)
      ? request.headers.map((header) => ({ ...header }))
      : request.headers
        ? { ...request.headers }
        : request.headers,
    body: request.body
      ? {
          ...request.body,
          formDataFields: request.body.formDataFields
            ? request.body.formDataFields.map((f) => ({ ...f }))
            : undefined,
        }
      : request.body,
    auth: request.auth
      ? { ...request.auth, config: { ...request.auth.config } }
      : request.auth,
    soap: request.soap ? { ...request.soap } : request.soap,
    variables: request.variables ? { ...request.variables } : request.variables,
  };
}
