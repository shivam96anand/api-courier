import { describe, it, expect } from 'vitest';
import { JsonFormatter } from '../formatter';

describe('JsonFormatter', () => {
  describe('formatValue', () => {
    it('wraps strings in quotes with HTML-escaped content', () => {
      expect(JsonFormatter.formatValue('hello', 'string')).toBe('"hello"');
    });

    it('escapes HTML in string values', () => {
      expect(JsonFormatter.formatValue('<b>hi</b>', 'string')).toBe(
        '"&lt;b&gt;hi&lt;/b&gt;"'
      );
    });

    it('formats numbers as strings', () => {
      expect(JsonFormatter.formatValue(42, 'number')).toBe('42');
      expect(JsonFormatter.formatValue(0, 'number')).toBe('0');
      expect(JsonFormatter.formatValue(-3.14, 'number')).toBe('-3.14');
    });

    it('formats booleans as strings', () => {
      expect(JsonFormatter.formatValue(true, 'boolean')).toBe('true');
      expect(JsonFormatter.formatValue(false, 'boolean')).toBe('false');
    });

    it('formats null as "null"', () => {
      expect(JsonFormatter.formatValue(null, 'null')).toBe('null');
    });

    it('formats unknown types as strings', () => {
      expect(JsonFormatter.formatValue({}, 'object')).toBe('[object Object]');
      expect(JsonFormatter.formatValue([1, 2], 'array')).toBe('1,2');
    });
  });

  describe('escapeHtml', () => {
    it('escapes ampersands', () => {
      expect(JsonFormatter.escapeHtml('a&b')).toBe('a&amp;b');
    });

    it('escapes less-than and greater-than', () => {
      expect(JsonFormatter.escapeHtml('<div>')).toBe('&lt;div&gt;');
    });

    it('escapes double quotes', () => {
      expect(JsonFormatter.escapeHtml('"hello"')).toBe('&quot;hello&quot;');
    });

    it('escapes single quotes', () => {
      expect(JsonFormatter.escapeHtml("it's")).toBe('it&#39;s');
    });

    it('escapes newlines, carriage returns, and tabs', () => {
      expect(JsonFormatter.escapeHtml('a\nb')).toBe('a\\nb');
      expect(JsonFormatter.escapeHtml('a\rb')).toBe('a\\rb');
      expect(JsonFormatter.escapeHtml('a\tb')).toBe('a\\tb');
    });

    it('handles multiple escapes in one string', () => {
      expect(JsonFormatter.escapeHtml('<a href="b&c">')).toBe(
        '&lt;a href=&quot;b&amp;c&quot;&gt;'
      );
    });

    it('returns empty string for empty input', () => {
      expect(JsonFormatter.escapeHtml('')).toBe('');
    });
  });

  describe('highlightSearchTerm', () => {
    it('returns escaped text when query is empty', () => {
      expect(JsonFormatter.highlightSearchTerm('hello <world>')).toBe(
        'hello &lt;world&gt;'
      );
    });

    it('returns escaped text when query is whitespace', () => {
      expect(JsonFormatter.highlightSearchTerm('hello', 1, false, '  ')).toBe(
        'hello'
      );
    });

    it('wraps matching text in highlight spans', () => {
      const result = JsonFormatter.highlightSearchTerm(
        'hello world',
        1,
        false,
        'world',
        [],
        -1
      );
      expect(result).toContain('<span class="search-highlight">world</span>');
    });

    it('highlights multiple occurrences', () => {
      const result = JsonFormatter.highlightSearchTerm(
        'abcabc',
        1,
        false,
        'abc',
        [],
        -1
      );
      const matches = result.match(/search-highlight/g);
      expect(matches).toHaveLength(2);
    });

    it('is case-insensitive', () => {
      const result = JsonFormatter.highlightSearchTerm(
        'Hello HELLO',
        1,
        false,
        'hello',
        [],
        -1
      );
      const matches = result.match(/search-highlight/g);
      expect(matches).toHaveLength(2);
    });

    it('marks active match with search-highlight-active class', () => {
      const match = {
        node: { lineNumber: 1 },
        startIndex: 0,
        isKey: false,
      };
      const result = JsonFormatter.highlightSearchTerm(
        'test',
        1,
        false,
        'test',
        [match],
        0
      );
      expect(result).toContain('search-highlight-active');
    });

    it('escapes HTML in non-matching parts', () => {
      const result = JsonFormatter.highlightSearchTerm(
        '<b>test</b>',
        1,
        false,
        'test',
        [],
        -1
      );
      expect(result).toContain('&lt;b&gt;');
      expect(result).toContain('&lt;/b&gt;');
    });
  });

  describe('formatValueWithHighlight', () => {
    it('wraps string values in quotes with highlights', () => {
      const result = JsonFormatter.formatValueWithHighlight(
        'hello',
        'string',
        1,
        'hello',
        [],
        -1
      );
      expect(result).toContain('"');
      expect(result).toContain('search-highlight');
    });

    it('highlights number values', () => {
      const result = JsonFormatter.formatValueWithHighlight(
        42,
        'number',
        1,
        '42',
        [],
        -1
      );
      expect(result).toContain('search-highlight');
    });

    it('highlights boolean values', () => {
      const result = JsonFormatter.formatValueWithHighlight(
        true,
        'boolean',
        1,
        'true',
        [],
        -1
      );
      expect(result).toContain('search-highlight');
    });

    it('highlights null value', () => {
      const result = JsonFormatter.formatValueWithHighlight(
        null,
        'null',
        1,
        'null',
        [],
        -1
      );
      expect(result).toContain('search-highlight');
    });
  });
});
