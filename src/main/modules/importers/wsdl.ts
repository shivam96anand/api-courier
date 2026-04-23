/**
 * WSDL 1.1 / 2.0 importer.
 *
 * Parses just enough of a WSDL document to expose its operations as
 * Restbro SOAP requests. We do **not** validate against XSDs — the goal
 * is to give users a starting point per operation, not generate a fully
 * compliant SOAP envelope.
 *
 * For each `<wsdl:portType>/<wsdl:operation>` (or `<wsdl:interface>/<wsdl:operation>`
 * in WSDL 2.0) we emit one request:
 *   - method: POST
 *   - url: first `<wsdl:port>/<soap:address>` (or `<wsdl:endpoint>`) we find
 *   - headers: SOAPAction (when discoverable), Content-Type
 *   - body: minimal SOAP envelope skeleton with the operation as the body element
 *
 * Detection is done by looking for the WSDL namespace.
 */

import { Collection, ApiRequest, Environment } from '../../../shared/types';
import { generateId, sanitizeName } from './mappers';

const WSDL_NS_RE =
  /xmlns(?::[A-Za-z_][\w-]*)?\s*=\s*["']http:\/\/schemas\.xmlsoap\.org\/wsdl\/["']/;
const WSDL2_NS_RE =
  /xmlns(?::[A-Za-z_][\w-]*)?\s*=\s*["']http:\/\/www\.w3\.org\/ns\/wsdl["']/;

export function isWsdlDocument(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (!trimmed.startsWith('<')) return false;
  if (!/<\s*[A-Za-z_][\w-]*:?(?:definitions|description)\b/i.test(trimmed))
    return false;
  return WSDL_NS_RE.test(trimmed) || WSDL2_NS_RE.test(trimmed);
}

/** Extract attribute value from a tag, namespace-prefix-agnostic. */
function attr(tagText: string, name: string): string | undefined {
  const re = new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`);
  const m = tagText.match(re);
  return m ? m[1] : undefined;
}

/** Find every opening tag whose local name matches `name`. Returns the raw tag text. */
function findOpeningTags(xml: string, name: string): string[] {
  // Match start tags (possibly self-closing). The local name may be prefixed.
  const re = new RegExp(`<\\s*(?:[A-Za-z_][\\w-]*:)?${name}\\b[^>]*>`, 'gi');
  return xml.match(re) ?? [];
}

/** Find first attribute value across all opening tags of a given local name. */
function firstAttrAcrossTags(
  xml: string,
  tagName: string,
  attrName: string
): string | undefined {
  for (const tag of findOpeningTags(xml, tagName)) {
    const v = attr(tag, attrName);
    if (v) return v;
  }
  return undefined;
}

/** Detect the target namespace declared on the root element. */
function detectTargetNamespace(xml: string): string {
  const root = xml.match(
    /<\s*(?:[A-Za-z_][\w-]*:)?(?:definitions|description)\b[^>]*>/i
  );
  if (!root) return '';
  return attr(root[0], 'targetNamespace') ?? '';
}

/** Build a minimal SOAP 1.1 envelope for one operation. */
function buildEnvelope(operation: string, namespace: string): string {
  const ns = namespace || 'http://example.com/';
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tns="${ns}">
  <soapenv:Header/>
  <soapenv:Body>
    <tns:${operation}>
      <!-- TODO: add request parameters -->
    </tns:${operation}>
  </soapenv:Body>
</soapenv:Envelope>`;
}

/** Detect an endpoint URL from the first <soap:address> / <soap12:address> / wsdl:endpoint. */
function detectEndpoint(xml: string): string {
  const tags = [
    ...findOpeningTags(xml, 'address'),
    ...findOpeningTags(xml, 'endpoint'),
  ];
  for (const tag of tags) {
    const loc = attr(tag, 'location') ?? attr(tag, 'address');
    if (loc) return loc;
  }
  return '{{wsdlBaseUrl}}';
}

/** Extract operation names from <portType> / <interface>. */
function extractOperations(xml: string): string[] {
  const ops: string[] = [];
  const portTypeRe =
    /<\s*(?:[A-Za-z_][\w-]*:)?(?:portType|interface)\b[^>]*>([\s\S]*?)<\s*\/\s*(?:[A-Za-z_][\w-]*:)?(?:portType|interface)\s*>/gi;
  let m: RegExpExecArray | null;
  while ((m = portTypeRe.exec(xml)) !== null) {
    const inner = m[1];
    const opTags = findOpeningTags(inner, 'operation');
    for (const tag of opTags) {
      const name = attr(tag, 'name');
      if (name && !ops.includes(name)) ops.push(name);
    }
  }
  return ops;
}

/** Try to find the SOAPAction header for a given operation, if declared. */
function findSoapAction(xml: string, operation: string): string {
  // Search inside <binding>/<operation name="X"> for <soap:operation soapAction="..."/>
  const binding = new RegExp(
    `<\\s*(?:[A-Za-z_][\\w-]*:)?operation\\s+[^>]*name\\s*=\\s*["']${operation}["'][^>]*>([\\s\\S]*?)<\\s*/\\s*(?:[A-Za-z_][\\w-]*:)?operation\\s*>`,
    'i'
  ).exec(xml);
  if (!binding) return '';
  const inner = binding[1];
  for (const tag of findOpeningTags(inner, 'operation')) {
    const action = attr(tag, 'soapAction');
    if (action !== undefined) return action;
  }
  return '';
}

export function mapWsdlDocument(xml: string): {
  rootFolder: Collection;
  environments: Environment[];
} {
  const namespace = detectTargetNamespace(xml);
  const endpoint = detectEndpoint(xml);
  const serviceName =
    firstAttrAcrossTags(xml, 'service', 'name') ??
    firstAttrAcrossTags(xml, 'definitions', 'name') ??
    firstAttrAcrossTags(xml, 'description', 'name') ??
    'WSDL Import';

  const rootId = generateId();
  const rootFolder: Collection = {
    id: rootId,
    name: sanitizeName(serviceName),
    type: 'folder',
    children: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const operations = extractOperations(xml);
  for (const op of operations) {
    const soapAction = findSoapAction(xml, op);
    const headers: Record<string, string> = {
      'Content-Type': 'text/xml; charset=utf-8',
    };
    if (soapAction) headers.SOAPAction = `"${soapAction}"`;

    const apiRequest: ApiRequest = {
      id: generateId(),
      name: sanitizeName(op),
      method: 'POST',
      url: endpoint,
      params: {},
      headers,
      body: {
        type: 'raw',
        content: buildEnvelope(op, namespace),
        format: 'xml',
      },
      soap: { version: '1.1' },
    };

    rootFolder.children!.push({
      id: generateId(),
      name: apiRequest.name,
      type: 'request',
      parentId: rootId,
      request: apiRequest,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  const environments: Environment[] = [];
  if (endpoint && endpoint.startsWith('http')) {
    environments.push({
      id: generateId(),
      name: `${sanitizeName(serviceName)} Variables`,
      variables: { wsdlBaseUrl: endpoint },
    });
  }

  return { rootFolder, environments };
}
