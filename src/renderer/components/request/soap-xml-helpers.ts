// SOAP / XML pure helpers extracted from request-manager.ts
// Keeps the renderer-side request manager focused on UI orchestration.

export const SOAP_CONTENT_TYPE_11 = 'text/xml; charset=utf-8';
export const SOAP_CONTENT_TYPE_12 = 'application/soap+xml; charset=utf-8';

export const SOAP_ENVELOPE_NS_11 = 'http://schemas.xmlsoap.org/soap/envelope/';
export const SOAP_ENVELOPE_NS_12 = 'http://www.w3.org/2003/05/soap-envelope';

export const AUTO_SOAP_CONTENT_TYPES = new Set([
  SOAP_CONTENT_TYPE_11,
  SOAP_CONTENT_TYPE_12,
  'text/xml',
  'application/xml',
  'application/json',
]);

export function getSoapContentType(version: '1.1' | '1.2'): string {
  return version === '1.1' ? SOAP_CONTENT_TYPE_11 : SOAP_CONTENT_TYPE_12;
}

export function buildSoapEnvelopeTemplate(
  version: '1.1' | '1.2',
  action: string
): string {
  const envelopeNamespace =
    version === '1.2' ? SOAP_ENVELOPE_NS_12 : SOAP_ENVELOPE_NS_11;
  const actionComment = action
    ? `<!-- SOAPAction: ${action} -->`
    : '<!-- SOAPAction -->';
  return `<?xml version="1.0" encoding="UTF-8"?>\n<soap:Envelope xmlns:soap="${envelopeNamespace}">\n  <soap:Header>\n    ${actionComment}\n  </soap:Header>\n  <soap:Body>\n    <m:Operation xmlns:m="http://tempuri.org/">\n      <m:Value></m:Value>\n    </m:Operation>\n  </soap:Body>\n</soap:Envelope>`;
}

export function syncSoapEnvelopeNamespace(
  xml: string,
  version: '1.1' | '1.2'
): string {
  const targetNamespace =
    version === '1.2' ? SOAP_ENVELOPE_NS_12 : SOAP_ENVELOPE_NS_11;
  if (!xml.trim()) return xml;

  const envelopeTagMatch = xml.match(/<([\w.-]+:)?Envelope\b[^>]*>/i);
  if (!envelopeTagMatch) return xml;

  const openingTag = envelopeTagMatch[0];
  const normalizedTag = openingTag
    .replace(
      new RegExp(
        SOAP_ENVELOPE_NS_11.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        'g'
      ),
      targetNamespace
    )
    .replace(
      new RegExp(
        SOAP_ENVELOPE_NS_12.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        'g'
      ),
      targetNamespace
    );

  if (normalizedTag === openingTag) {
    return xml;
  }

  return xml.replace(openingTag, normalizedTag);
}

export interface ParsedXml {
  valid: boolean;
  document?: Document;
  error?: string;
}

export function parseXml(xml: string): ParsedXml {
  try {
    const parser = new DOMParser();
    const documentNode = parser.parseFromString(xml, 'application/xml');
    const parserError = documentNode.querySelector('parsererror');
    if (parserError) {
      return {
        valid: false,
        error: 'Invalid XML body. Check tags, attributes, and namespaces.',
      };
    }
    return { valid: true, document: documentNode };
  } catch {
    return { valid: false, error: 'Invalid XML body.' };
  }
}

export function prettyPrintXml(documentNode: Document): string {
  const serializeNode = (node: Node, depth: number): string => {
    const indent = '  '.repeat(depth);

    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.nodeValue || '').trim();
      return text ? `${indent}${text}\n` : '';
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return '';
    }

    const el = node as Element;
    const attrs = Array.from(el.attributes)
      .map((attr) => `${attr.name}="${attr.value}"`)
      .join(' ');
    const openTag = attrs ? `<${el.tagName} ${attrs}>` : `<${el.tagName}>`;

    const childNodes = Array.from(el.childNodes).filter(
      (child) =>
        child.nodeType === Node.ELEMENT_NODE ||
        (child.nodeType === Node.TEXT_NODE && (child.nodeValue || '').trim())
    );

    if (childNodes.length === 0) {
      return `${indent}${openTag.replace('>', '/>')}\n`;
    }

    const hasOnlyText = childNodes.every(
      (child) => child.nodeType === Node.TEXT_NODE
    );
    if (hasOnlyText) {
      const textContent = childNodes
        .map((child) => (child.nodeValue || '').trim())
        .join('');
      return `${indent}${openTag}${textContent}</${el.tagName}>\n`;
    }

    let content = `${indent}${openTag}\n`;
    childNodes.forEach((child) => {
      content += serializeNode(child, depth + 1);
    });
    content += `${indent}</${el.tagName}>\n`;
    return content;
  };

  const declaration = '<?xml version="1.0" encoding="UTF-8"?>\n';
  const root = documentNode.documentElement;
  return `${declaration}${serializeNode(root, 0).trimEnd()}`;
}
