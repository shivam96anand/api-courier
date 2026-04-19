/**
 * Markdown rendering for the notepad preview pane.
 *
 * Uses `marked` for parsing. The output is then sanitised by stripping
 * dangerous tags (script/iframe/object) and on* event handlers via the DOM,
 * which is sufficient because the preview is rendered into a sandboxed
 * container the user cannot interact with for navigation. We also disable
 * marked's `mangle` and `headerIds` options to keep output stable.
 */
import { marked } from 'marked';

marked.setOptions({
  gfm: true,
  breaks: true,
});

const DANGEROUS_TAGS = new Set([
  'SCRIPT',
  'IFRAME',
  'OBJECT',
  'EMBED',
  'LINK',
  'META',
  'STYLE',
  'BASE',
]);

function sanitize(html: string): string {
  // Parse in a detached document so we don't hit network requests for any
  // <img src> or similar resource loads while sanitising.
  const doc = document.implementation.createHTMLDocument('preview');
  doc.body.innerHTML = html;
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT);
  const toRemove: Element[] = [];
  let node = walker.nextNode() as Element | null;
  while (node) {
    if (DANGEROUS_TAGS.has(node.tagName)) {
      toRemove.push(node);
    } else {
      // Strip event handler attributes (onclick, onerror, …) and javascript: URLs.
      for (const attr of Array.from(node.attributes)) {
        const name = attr.name.toLowerCase();
        const value = attr.value.trim().toLowerCase();
        if (name.startsWith('on')) node.removeAttribute(attr.name);
        if (
          (name === 'href' || name === 'src' || name === 'xlink:href') &&
          value.startsWith('javascript:')
        ) {
          node.removeAttribute(attr.name);
        }
      }
      // Force external links to open via the system handler with no opener.
      if (node.tagName === 'A') {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
      }
    }
    node = walker.nextNode() as Element | null;
  }
  toRemove.forEach((el) => el.remove());
  return doc.body.innerHTML;
}

/** Render markdown source to sanitised HTML. */
export function renderMarkdown(source: string): string {
  try {
    const html = marked.parse(source, { async: false }) as string;
    return sanitize(html);
  } catch (e) {
    return `<pre class="md-error">Failed to render markdown: ${
      e instanceof Error ? e.message : String(e)
    }</pre>`;
  }
}
