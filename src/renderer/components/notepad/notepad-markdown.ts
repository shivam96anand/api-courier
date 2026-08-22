/**
 * Markdown rendering for the notepad preview pane.
 *
 * Uses `marked` in GitHub-flavoured CommonMark mode, configured to match the
 * VS Code markdown preview: soft line breaks stay soft (`breaks: false`) and
 * YAML front matter is hidden rather than rendered as a heading.
 *
 * The output is then sanitised by stripping dangerous tags
 * (script/iframe/object) and on* event handlers via the DOM, which is
 * sufficient because the preview is rendered into a sandboxed container the
 * user cannot interact with for navigation.
 */
import { marked } from 'marked';

marked.setOptions({
  gfm: true,
  // VS Code (markdown-it/CommonMark) treats a single newline as a space.
  breaks: false,
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

/**
 * Strip a leading YAML front-matter block. Without this `---\ntitle: x\n---`
 * renders as a horizontal rule plus a setext heading, which is not what the
 * author meant (and not what VS Code shows).
 */
export function stripFrontMatter(source: string): string {
  if (!/^(\uFEFF)?---[ \t]*\r?\n/.test(source)) return source;
  const body = source.replace(/^\uFEFF/, '');
  const end = /\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/.exec(body.slice(3));
  if (!end?.index) return source;
  return body.slice(3 + end.index + end[0].length);
}

/** Render markdown source to sanitised HTML. */
export function renderMarkdown(source: string): string {
  try {
    const html = marked.parse(stripFrontMatter(source), {
      async: false,
    }) as string;
    return sanitize(html);
  } catch (e) {
    return `<pre class="md-error">Failed to render markdown: ${
      e instanceof Error ? e.message : String(e)
    }</pre>`;
  }
}
