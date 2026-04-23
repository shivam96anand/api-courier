/**
 * OpenAPI / Swagger Importer
 *
 * Supports OpenAPI 3.x (`openapi: "3.x.y"`) and Swagger 2.0
 * (`swagger: "2.0"`). Each path × method becomes one Restbro request,
 * grouped by the operation's first tag (or "Untagged" when none).
 *
 * What we map:
 *   - operation summary/operationId → request name
 *   - path parameters (`{id}` → `{{id}}` in URL)
 *   - query / header parameters with `example`/`default` values
 *   - request body (JSON / form-urlencoded / multipart) using example or schema-derived placeholder
 *   - servers[0].url (OpenAPI 3) or host+basePath+schemes[0] (Swagger 2)
 *   - securitySchemes / securityDefinitions for the first global security requirement
 *
 * What we deliberately drop:
 *   - $ref deep dereferencing (we only resolve in-document references one level)
 *   - response examples (Restbro doesn't model them)
 *   - callbacks, links, webhooks
 */

import { Collection, ApiRequest, Environment } from '../../../shared/types';
import { generateId, mapHttpMethod, sanitizeName } from './mappers';

const HTTP_METHODS = [
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'head',
  'options',
];

interface OpenAPIInfo {
  title?: string;
  description?: string;
  version?: string;
}

interface OpenAPIDoc {
  openapi?: string;
  swagger?: string;
  info?: OpenAPIInfo;
  servers?: Array<{
    url?: string;
    variables?: Record<string, { default?: string }>;
  }>;
  host?: string;
  basePath?: string;
  schemes?: string[];
  paths?: Record<string, any>;
  components?: {
    securitySchemes?: Record<string, any>;
    schemas?: Record<string, any>;
  };
  securityDefinitions?: Record<string, any>;
  security?: Array<Record<string, string[]>>;
}

/** True when `data` is an OpenAPI 3.x or Swagger 2.0 document. */
export function isOpenApiDocument(data: any): boolean {
  if (!data || typeof data !== 'object') return false;
  const isV3 = typeof data.openapi === 'string' && /^3\./.test(data.openapi);
  const isV2 = data.swagger === '2.0';
  if (!isV3 && !isV2) return false;
  return Boolean(data.paths && typeof data.paths === 'object');
}

/** Resolve a single-level $ref like "#/components/schemas/User" or "#/definitions/User". */
function resolveRef(doc: OpenAPIDoc, ref: string): any {
  if (!ref.startsWith('#/')) return undefined;
  const parts = ref.slice(2).split('/');
  let cur: any = doc;
  for (const p of parts) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = cur[p];
  }
  return cur;
}

/** Generate a placeholder value from a JSON Schema fragment (best-effort, recursion-safe). */
function placeholderForSchema(
  schema: any,
  doc: OpenAPIDoc,
  depth = 0
): unknown {
  if (!schema || depth > 4) return null;
  if (schema.$ref) {
    const resolved = resolveRef(doc, schema.$ref);
    return placeholderForSchema(resolved, doc, depth + 1);
  }
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  const t = schema.type;
  if (t === 'string') return schema.enum?.[0] ?? '';
  if (t === 'integer' || t === 'number') return 0;
  if (t === 'boolean') return false;
  if (t === 'array')
    return [placeholderForSchema(schema.items, doc, depth + 1)];
  if (t === 'object' || schema.properties) {
    const out: Record<string, unknown> = {};
    const props = schema.properties ?? {};
    for (const key of Object.keys(props)) {
      out[key] = placeholderForSchema(props[key], doc, depth + 1);
    }
    return out;
  }
  return null;
}

/** Convert a single OpenAPI parameter list into headers/query/path maps. */
function splitParameters(
  parameters: any[],
  doc: OpenAPIDoc
): {
  query: Record<string, string>;
  headers: Record<string, string>;
  path: Record<string, string>;
} {
  const query: Record<string, string> = {};
  const headers: Record<string, string> = {};
  const path: Record<string, string> = {};
  for (const rawParam of parameters ?? []) {
    const param = rawParam.$ref ? resolveRef(doc, rawParam.$ref) : rawParam;
    if (!param || !param.name || !param.in) continue;
    const value = String(
      param.example ??
        param.schema?.example ??
        param.schema?.default ??
        param.default ??
        ''
    );
    if (param.in === 'query') query[param.name] = value;
    else if (param.in === 'header') headers[param.name] = value;
    else if (param.in === 'path') path[param.name] = value;
  }
  return { query, headers, path };
}

/** Build an ApiRequest body from an OpenAPI requestBody (3.x) or Swagger body parameter. */
function buildBody(
  operation: any,
  doc: OpenAPIDoc,
  isV2: boolean
): { body: ApiRequest['body']; headers: Record<string, string> } {
  const extraHeaders: Record<string, string> = {};
  const none = { type: 'none' as const, content: '' };

  if (isV2) {
    const params = operation.parameters ?? [];
    const bodyParam = params.find((p: any) => p.in === 'body');
    if (bodyParam) {
      const sample = placeholderForSchema(bodyParam.schema, doc);
      const consumes: string[] =
        operation.consumes ?? doc.paths?.consumes ?? [];
      const ct = consumes[0] ?? 'application/json';
      if (ct.includes('json')) {
        extraHeaders['Content-Type'] = ct;
        return {
          body: { type: 'json', content: JSON.stringify(sample, null, 2) },
          headers: extraHeaders,
        };
      }
      return {
        body: { type: 'raw', content: JSON.stringify(sample, null, 2) },
        headers: extraHeaders,
      };
    }
    const formParams = params.filter((p: any) => p.in === 'formData');
    if (formParams.length > 0) {
      const pairs = formParams
        .map(
          (p: any) =>
            `${encodeURIComponent(p.name)}=${encodeURIComponent(String(p.example ?? p.default ?? ''))}`
        )
        .join('&');
      return {
        body: { type: 'form-urlencoded', content: pairs },
        headers: extraHeaders,
      };
    }
    return { body: none, headers: extraHeaders };
  }

  // OpenAPI 3.x
  const requestBody = operation.requestBody?.$ref
    ? resolveRef(doc, operation.requestBody.$ref)
    : operation.requestBody;
  if (!requestBody?.content) return { body: none, headers: extraHeaders };

  const content = requestBody.content as Record<string, any>;
  const preferOrder = [
    'application/json',
    'application/x-www-form-urlencoded',
    'multipart/form-data',
    'text/plain',
  ];
  const chosenType =
    preferOrder.find((t) => content[t]) ?? Object.keys(content)[0];
  const media = content[chosenType];
  if (!media) return { body: none, headers: extraHeaders };

  if (chosenType.includes('json')) {
    const sample = media.example ?? placeholderForSchema(media.schema, doc);
    extraHeaders['Content-Type'] = chosenType;
    return {
      body: { type: 'json', content: JSON.stringify(sample, null, 2) },
      headers: extraHeaders,
    };
  }
  if (chosenType.includes('x-www-form-urlencoded')) {
    const props = media.schema?.properties ?? {};
    const pairs = Object.keys(props)
      .map(
        (k) =>
          `${encodeURIComponent(k)}=${encodeURIComponent(String(placeholderForSchema(props[k], doc) ?? ''))}`
      )
      .join('&');
    return {
      body: { type: 'form-urlencoded', content: pairs },
      headers: extraHeaders,
    };
  }
  if (chosenType.includes('multipart/form-data')) {
    const props = media.schema?.properties ?? {};
    const lines = Object.keys(props)
      .map((k) => `${k}=${String(placeholderForSchema(props[k], doc) ?? '')}`)
      .join('\n');
    return {
      body: { type: 'form-data', content: lines },
      headers: extraHeaders,
    };
  }
  // Fallback: raw text/string body
  const sample = media.example ?? placeholderForSchema(media.schema, doc);
  extraHeaders['Content-Type'] = chosenType;
  return {
    body: {
      type: 'raw',
      content: typeof sample === 'string' ? sample : JSON.stringify(sample),
    },
    headers: extraHeaders,
  };
}

/** Build the base server URL for the variables environment. */
function buildBaseUrl(doc: OpenAPIDoc): string {
  if (doc.openapi && Array.isArray(doc.servers) && doc.servers.length > 0) {
    let url = doc.servers[0].url ?? '';
    const vars = doc.servers[0].variables ?? {};
    for (const [name, def] of Object.entries(vars)) {
      url = url.replace(new RegExp(`\\{${name}\\}`, 'g'), def?.default ?? '');
    }
    return url.replace(/\/$/, '');
  }
  if (doc.swagger === '2.0') {
    const scheme = doc.schemes?.[0] ?? 'https';
    const host = doc.host ?? '';
    const basePath = doc.basePath ?? '';
    if (!host) return basePath;
    return `${scheme}://${host}${basePath}`.replace(/\/$/, '');
  }
  return '';
}

/** Choose an auth config from the document's security schemes (best-effort). */
function buildAuth(doc: OpenAPIDoc, operation: any): ApiRequest['auth'] {
  const requirement = (operation?.security ?? doc.security ?? [])[0] ?? null;
  if (!requirement) return undefined;
  const schemeName = Object.keys(requirement)[0];
  if (!schemeName) return undefined;
  const schemes =
    doc.components?.securitySchemes ?? doc.securityDefinitions ?? {};
  const scheme = schemes[schemeName];
  if (!scheme) return undefined;

  const type = String(scheme.type ?? '').toLowerCase();
  if (type === 'http' && String(scheme.scheme).toLowerCase() === 'basic') {
    return { type: 'basic', config: { username: '', password: '' } };
  }
  if (
    (type === 'http' && String(scheme.scheme).toLowerCase() === 'bearer') ||
    type === 'oauth2'
  ) {
    if (type === 'oauth2') {
      const flows = scheme.flows ?? {};
      const flowName = Object.keys(flows)[0];
      const flow = flows[flowName] ?? {};
      const config: Record<string, string> = {};
      if (flow.authorizationUrl) config.authUrl = String(flow.authorizationUrl);
      if (flow.tokenUrl) {
        config.tokenUrl = String(flow.tokenUrl);
        config.accessTokenUrl = String(flow.tokenUrl);
      }
      const scopes = flow.scopes ? Object.keys(flow.scopes).join(' ') : '';
      if (scopes) config.scope = scopes;
      return { type: 'oauth2', config };
    }
    return { type: 'bearer', config: { token: '' } };
  }
  if (type === 'apikey') {
    const location = scheme.in === 'query' ? 'query' : 'header';
    return {
      type: 'api-key',
      config: { key: scheme.name ?? '', value: '', location, in: location },
    };
  }
  return undefined;
}

/**
 * Map an OpenAPI / Swagger document into a Restbro collection tree.
 */
export function mapOpenApiDocument(doc: OpenAPIDoc): {
  rootFolder: Collection;
  environments: Environment[];
} {
  const isV2 = doc.swagger === '2.0';
  const title = sanitizeName(doc.info?.title ?? 'OpenAPI Import');
  const baseUrl = buildBaseUrl(doc);

  const rootId = generateId();
  const rootFolder: Collection = {
    id: rootId,
    name: title,
    type: 'folder',
    children: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // Group by first tag.
  const tagFolders = new Map<string, Collection>();
  const getTagFolder = (tag: string): Collection => {
    let folder = tagFolders.get(tag);
    if (folder) return folder;
    folder = {
      id: generateId(),
      name: sanitizeName(tag),
      type: 'folder',
      parentId: rootId,
      children: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    tagFolders.set(tag, folder);
    return folder;
  };

  const paths = doc.paths ?? {};
  for (const rawPath of Object.keys(paths)) {
    const pathItem = paths[rawPath];
    if (!pathItem || typeof pathItem !== 'object') continue;
    const sharedParams = pathItem.parameters ?? [];

    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation || typeof operation !== 'object') continue;

      const allParams = [...sharedParams, ...(operation.parameters ?? [])];
      const { query, headers, path } = splitParameters(allParams, doc);
      const { body, headers: bodyHeaders } = buildBody(operation, doc, isV2);
      const mergedHeaders = { ...headers, ...bodyHeaders };

      // Replace `{name}` with `{{name}}` (Restbro variable syntax) before
      // prefixing the base URL — otherwise the regex would also match the
      // inner braces of `{{baseUrl}}`.
      const templatedPath = rawPath.replace(
        /\{([^{}]+)\}/g,
        (_, name) => `{{${name}}}`
      );
      const url = `{{baseUrl}}${templatedPath}`;

      const requestVars: Record<string, string> = {};
      for (const [k, v] of Object.entries(path)) {
        if (v) requestVars[k] = v;
      }

      const apiRequest: ApiRequest = {
        id: generateId(),
        name: sanitizeName(
          operation.summary ??
            operation.operationId ??
            `${method.toUpperCase()} ${rawPath}`
        ),
        method: mapHttpMethod(method.toUpperCase()),
        url,
        params: query,
        headers: mergedHeaders,
        body,
        auth: buildAuth(doc, operation),
      };
      if (Object.keys(requestVars).length > 0)
        apiRequest.variables = requestVars;

      const tag = operation.tags?.[0] ?? 'Untagged';
      const folder = getTagFolder(tag);
      folder.children!.push({
        id: generateId(),
        name: apiRequest.name,
        type: 'request',
        parentId: folder.id,
        request: apiRequest,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }

  // Sort tag folders alphabetically for deterministic output.
  rootFolder.children = [...tagFolders.values()].sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  const environments: Environment[] = [];
  if (baseUrl) {
    environments.push({
      id: generateId(),
      name: `${title} Variables`,
      variables: { baseUrl },
    });
  }

  return { rootFolder, environments };
}
