/**
 * Pure XML/HTML pretty-printer used by the Notepad "Format" action.
 *
 * Monaco ships no formatter for XML, so this re-indents the document itself.
 * It only rewrites the whitespace *between* nodes — tag names, attributes,
 * entities and text content are copied verbatim, so formatting never changes
 * the document's meaning. Like `notepad-json`, it never throws: malformed
 * input comes back unchanged with `ok: false`.
 */
import { JsonTransformResult } from './notepad-json';

/** HTML elements that never have a closing tag. */
const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

/** Elements whose body is raw text and must be copied through untouched. */
const RAW_TEXT_ELEMENTS = new Set(['script', 'style', 'pre', 'textarea']);

type TokenKind = 'open' | 'close' | 'leaf' | 'text';

interface Token {
  kind: TokenKind;
  text: string;
  /** Lower-cased tag name for `open` / `close` tokens, otherwise empty. */
  name: string;
}

function tagName(tag: string): string {
  return /^<\/?\s*([^\s/>]+)/.exec(tag)?.[1].toLowerCase() ?? '';
}

/** Split the source into tags and text runs. Returns null on malformed input. */
function tokenize(src: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;

  const pushText = (raw: string): void => {
    const text = raw.trim();
    if (text) tokens.push({ kind: 'text', text, name: '' });
  };

  while (i < src.length) {
    const next = src.indexOf('<', i);
    if (next === -1) {
      pushText(src.slice(i));
      break;
    }
    pushText(src.slice(i, next));

    // Comments, CDATA sections and doctypes are copied verbatim (they may span
    // lines and must not be re-indented internally).
    const verbatim = [
      { start: '<!--', end: '-->' },
      { start: '<![CDATA[', end: ']]>' },
    ].find((d) => src.startsWith(d.start, next));
    if (verbatim) {
      const end = src.indexOf(verbatim.end, next + verbatim.start.length);
      if (end === -1) return null;
      tokens.push({
        kind: 'leaf',
        text: src.slice(next, end + verbatim.end.length),
        name: '',
      });
      i = end + verbatim.end.length;
      continue;
    }

    const end = findTagEnd(src, next);
    if (end === -1) return null;
    const tag = src.slice(next, end + 1);
    i = end + 1;

    if (tag.startsWith('</')) {
      tokens.push({ kind: 'close', text: tag, name: tagName(tag) });
      continue;
    }
    const name = tagName(tag);
    if (!name) return null;
    if (
      tag.startsWith('<?') ||
      tag.startsWith('<!') ||
      tag.endsWith('/>') ||
      VOID_ELEMENTS.has(name)
    ) {
      tokens.push({ kind: 'leaf', text: tag, name: '' });
      continue;
    }
    tokens.push({ kind: 'open', text: tag, name });

    // Raw-text elements: swallow the body (and its closing tag) as one leaf.
    if (RAW_TEXT_ELEMENTS.has(name)) {
      const closeIdx = src.toLowerCase().indexOf(`</${name}`, i);
      if (closeIdx === -1) return null;
      const closeEnd = findTagEnd(src, closeIdx);
      if (closeEnd === -1) return null;
      const body = src.slice(i, closeIdx).trim();
      if (body) tokens.push({ kind: 'text', text: body, name: '' });
      tokens.push({
        kind: 'close',
        text: src.slice(closeIdx, closeEnd + 1),
        name,
      });
      i = closeEnd + 1;
    }
  }

  return tokens;
}

/** Index of the `>` that closes the tag starting at `start`, skipping quotes. */
function findTagEnd(src: string, start: number): number {
  let quote = '';
  for (let i = start + 1; i < src.length; i++) {
    const ch = src[i];
    if (quote) {
      if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '>') {
      return i;
    }
  }
  return -1;
}

/**
 * Pretty-print an XML (or HTML) document with the given indent width.
 * Elements holding a single text run stay on one line (`<id>42</id>`).
 */
export function formatXml(text: string, indent = 2): JsonTransformResult {
  const src = text.trim();
  if (!src.startsWith('<')) {
    return { text, ok: false, error: 'Not an XML document' };
  }

  const tokens = tokenize(src);
  if (!tokens) return { text, ok: false, error: 'Unterminated tag' };

  const lines: string[] = [];
  const open: string[] = [];
  const pad = (): string => ' '.repeat(indent * open.length);

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.kind === 'close') {
      if (open.pop() !== token.name) {
        return { text, ok: false, error: `Unexpected ${token.text}` };
      }
      lines.push(pad() + token.text);
      continue;
    }
    if (token.kind === 'open') {
      const body = tokens[i + 1];
      const after = tokens[i + 2];
      // Collapse `<tag>text</tag>` onto a single line.
      if (
        body?.kind === 'text' &&
        after?.kind === 'close' &&
        after.name === token.name &&
        !body.text.includes('\n')
      ) {
        lines.push(pad() + token.text + body.text + after.text);
        i += 2;
        continue;
      }
      lines.push(pad() + token.text);
      open.push(token.name);
      continue;
    }
    lines.push(pad() + token.text);
  }

  if (open.length) {
    return { text, ok: false, error: `Unclosed <${open[open.length - 1]}>` };
  }
  return { text: lines.join('\n'), ok: true };
}
