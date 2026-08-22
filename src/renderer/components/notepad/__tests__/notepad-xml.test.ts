import { describe, it, expect } from 'vitest';
import { formatXml } from '../notepad-xml';
import { canFormatLanguage, formatText } from '../notepad-format';

describe('formatXml', () => {
  it('indents nested elements and inlines simple text nodes', () => {
    const result = formatXml('<a><b><c>42</c></b></a>');
    expect(result.ok).toBe(true);
    expect(result.text).toBe('<a>\n  <b>\n    <c>42</c>\n  </b>\n</a>');
  });

  it('re-indents an already formatted document idempotently', () => {
    const once = formatXml('<a>\n        <b>1</b>\n</a>');
    const twice = formatXml(once.text);
    expect(once.text).toBe('<a>\n  <b>1</b>\n</a>');
    expect(twice.text).toBe(once.text);
  });

  it('honours a custom indent width', () => {
    const result = formatXml('<a><b>1</b></a>', 4);
    expect(result.text).toBe('<a>\n    <b>1</b>\n</a>');
  });

  it('keeps declarations, comments, CDATA and self-closing tags', () => {
    const src =
      '<?xml version="1.0"?><r><!-- note --><e/><d><![CDATA[a<b]]></d></r>';
    const result = formatXml(src);
    expect(result.ok).toBe(true);
    expect(result.text).toBe(
      [
        '<?xml version="1.0"?>',
        '<r>',
        '  <!-- note -->',
        '  <e/>',
        '  <d>',
        '    <![CDATA[a<b]]>',
        '  </d>',
        '</r>',
      ].join('\n')
    );
  });

  it('does not split tags on a ">" inside an attribute value', () => {
    const result = formatXml('<a t="x > y"><b>1</b></a>');
    expect(result.ok).toBe(true);
    expect(result.text).toBe('<a t="x > y">\n  <b>1</b>\n</a>');
  });

  it('treats HTML void elements as leaves', () => {
    const result = formatXml('<div><br><img src="a.png"><p>hi</p></div>');
    expect(result.ok).toBe(true);
    expect(result.text).toBe(
      '<div>\n  <br>\n  <img src="a.png">\n  <p>hi</p>\n</div>'
    );
  });

  it('rejects mismatched and unclosed tags without changing the text', () => {
    for (const raw of ['<a><b></a></b>', '<a><b>1</b>', '<a', 'plain text']) {
      const result = formatXml(raw);
      expect(result.ok).toBe(false);
      expect(result.text).toBe(raw);
      expect(result.error).toBeTruthy();
    }
  });
});

describe('canFormatLanguage', () => {
  it('accepts the languages with a built-in formatter', () => {
    expect(canFormatLanguage('json')).toBe(true);
    expect(canFormatLanguage('xml')).toBe(true);
    expect(canFormatLanguage('html')).toBe(true);
  });

  it('rejects languages without one', () => {
    expect(canFormatLanguage('plaintext')).toBe(false);
    expect(canFormatLanguage('python')).toBe(false);
    expect(canFormatLanguage(undefined)).toBe(false);
  });
});

describe('formatText', () => {
  it('dispatches to the JSON formatter', () => {
    expect(formatText('{"a":1}', 'json').text).toBe('{\n  "a": 1\n}');
  });

  it('dispatches to the XML formatter', () => {
    expect(formatText('<a><b>1</b></a>', 'xml').text).toBe(
      '<a>\n  <b>1</b>\n</a>'
    );
  });

  it('returns the text unchanged for unsupported languages', () => {
    const result = formatText('hello', 'plaintext');
    expect(result.ok).toBe(false);
    expect(result.text).toBe('hello');
  });
});
