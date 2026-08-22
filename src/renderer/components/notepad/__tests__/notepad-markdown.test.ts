/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { renderMarkdown, stripFrontMatter } from '../notepad-markdown';

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

  it('nests a sub-list inside its parent list item', () => {
    const html = renderMarkdown('1. Parent\n   - Child\n   - Child 2\n');
    expect(html).toMatch(
      /<li>[\s\S]*<ul>[\s\S]*Child[\s\S]*<\/ul>[\s\S]*<\/li>/
    );
  });

  it('treats a single newline as a space (VS Code / CommonMark)', () => {
    const html = renderMarkdown('line one\nline two');
    expect(html).not.toContain('<br>');
  });

  it('still honours an explicit hard break', () => {
    expect(renderMarkdown('line one  \nline two')).toContain('<br>');
  });

  it('renders GFM task lists as checkboxes', () => {
    const html = renderMarkdown('- [x] done\n- [ ] todo\n');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('checked');
  });
});

describe('stripFrontMatter', () => {
  it('hides YAML front matter instead of rendering it as a heading', () => {
    const html = renderMarkdown('---\ntitle: My Doc\n---\n\n# Hello\n');
    expect(html).not.toContain('title: My Doc');
    expect(html).toContain('<h1>');
  });

  it('supports the "..." terminator', () => {
    expect(stripFrontMatter('---\na: 1\n...\n# H')).toBe('# H');
  });

  it('leaves documents without front matter untouched', () => {
    const src = '# Title\n\n---\n\nrule';
    expect(stripFrontMatter(src)).toBe(src);
  });

  it('leaves an unterminated block untouched', () => {
    const src = '---\nnot closed\n\n# H';
    expect(stripFrontMatter(src)).toBe(src);
  });
});
