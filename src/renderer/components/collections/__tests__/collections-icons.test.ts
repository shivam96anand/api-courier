/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { getIcon, getMethodIcon, createIconElement } from '../collections-icons';
import type { IconType } from '../collections-icons';

describe('collections-icons', () => {
  describe('getIcon', () => {
    const iconTypes: IconType[] = [
      'folder-closed',
      'folder-open',
      'file',
      'http-get',
      'http-post',
      'http-put',
      'http-patch',
      'http-delete',
      'http-head',
      'http-options',
      'add-folder',
      'add-file',
      'add',
      'import',
      'chevron-right',
      'chevron-down',
    ];

    it.each(iconTypes)('returns SVG string for %s', (type) => {
      const svg = getIcon(type);
      expect(svg).toContain('<svg');
      expect(svg).toContain('</svg>');
    });

    it('returns file icon for unknown type', () => {
      const svg = getIcon('unknown-type' as any);
      expect(svg).toContain('<svg');
    });
  });

  describe('getMethodIcon', () => {
    it.each([
      ['GET', 'http-get'],
      ['POST', 'http-post'],
      ['PUT', 'http-put'],
      ['PATCH', 'http-patch'],
      ['DELETE', 'http-delete'],
      ['HEAD', 'http-head'],
      ['OPTIONS', 'http-options'],
    ])('maps %s to %s', (method, expected) => {
      expect(getMethodIcon(method)).toBe(expected);
    });

    it('returns file icon for unknown method', () => {
      expect(getMethodIcon('TRACE')).toBe('file');
    });

    it('handles lowercase methods', () => {
      expect(getMethodIcon('get')).toBe('http-get');
      expect(getMethodIcon('post')).toBe('http-post');
    });
  });

  describe('createIconElement', () => {
    it('creates a span element with SVG', () => {
      const el = createIconElement('file');
      expect(el.tagName).toBe('SPAN');
      expect(el.innerHTML).toContain('<svg');
    });

    it('applies className', () => {
      const el = createIconElement('file', { className: 'my-icon' });
      expect(el.className).toBe('my-icon');
    });

    it('defaults className to icon', () => {
      const el = createIconElement('file');
      expect(el.className).toBe('icon');
    });

    it('applies title', () => {
      const el = createIconElement('file', { title: 'A file' });
      expect(el.title).toBe('A file');
    });

    it('applies inline styles', () => {
      const el = createIconElement('file', {
        style: { color: 'red' },
      });
      expect(el.style.color).toBe('red');
    });
  });
});
