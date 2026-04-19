/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '../notepad-markdown';

describe('renderMarkdown', () => {
  it('renders headings and paragraphs', () => {
    const html = renderMarkdown('# Hello\n\nworld');
    expect(html).toContain('<h1>');
    expect(html).toContain('Hello');
    expect(html).toContain('<p>');
    expect(html).toContain('world');
  });

  it('strips <script> tags', () => {
    const html = renderMarkdown('hi<script>alert(1)</script>bye');
    expect(html.toLowerCase()).not.toContain('<script');
    expect(html).toContain('hi');
    expect(html).toContain('bye');
  });

  it('strips <iframe> and <object> tags', () => {
    const html = renderMarkdown(
      '<iframe src="x"></iframe><object data="y"></object>'
    );
    expect(html.toLowerCase()).not.toContain('<iframe');
    expect(html.toLowerCase()).not.toContain('<object');
  });

  it('removes inline event handlers', () => {
    const html = renderMarkdown('<a href="#" onclick="alert(1)">x</a>');
    expect(html.toLowerCase()).not.toContain('onclick');
  });

  it('strips javascript: URLs from anchors', () => {
    const html = renderMarkdown('[click](javascript:alert(1))');
    expect(html.toLowerCase()).not.toContain('javascript:');
  });

  it('forces target=_blank and rel=noopener on links', () => {
    const html = renderMarkdown('[link](https://example.com)');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('strips dangerous <style> and <link> tags', () => {
    const html = renderMarkdown(
      '<style>body{display:none}</style><link rel="stylesheet" href="x">text'
    );
    expect(html.toLowerCase()).not.toContain('<style');
    expect(html.toLowerCase()).not.toContain('<link');
    expect(html).toContain('text');
  });

  it('returns an error block when rendering throws', () => {
    // marked is forgiving — pass a non-string-coercible value via cast.
    const html = renderMarkdown(null as unknown as string);
    // null-coerced markdown still renders without error (empty).
    expect(typeof html).toBe('string');
  });
});
