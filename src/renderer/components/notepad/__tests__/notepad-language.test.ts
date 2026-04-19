import { describe, it, expect } from 'vitest';
import {
  detectLanguageFromContent,
  detectLanguageFromPath,
  languageLabel,
  PICKABLE_LANGUAGES,
} from '../notepad-language';

describe('detectLanguageFromPath', () => {
  it('detects common extensions', () => {
    expect(detectLanguageFromPath('/x/foo.json')).toBe('json');
    expect(detectLanguageFromPath('foo.MD')).toBe('markdown');
    expect(detectLanguageFromPath('a/b/c.ts')).toBe('typescript');
    expect(detectLanguageFromPath('script.py')).toBe('python');
  });

  it('returns undefined for unknown or missing extensions', () => {
    expect(detectLanguageFromPath('README')).toBeUndefined();
    expect(detectLanguageFromPath(undefined)).toBeUndefined();
    expect(detectLanguageFromPath('mystery.qqq')).toBeUndefined();
  });
});

describe('detectLanguageFromContent', () => {
  it('returns undefined for empty / whitespace-only input', () => {
    expect(detectLanguageFromContent('')).toBeUndefined();
    expect(detectLanguageFromContent('   \n\n  ')).toBeUndefined();
  });

  it('detects valid JSON objects', () => {
    expect(detectLanguageFromContent('{"a":1,"b":[2,3]}')).toBe('json');
    expect(detectLanguageFromContent('  {\n  "x": "y"\n}\n')).toBe('json');
  });

  it('detects valid JSON arrays', () => {
    expect(detectLanguageFromContent('[1, 2, 3]')).toBe('json');
  });

  it('does not classify malformed JSON-looking text as JSON', () => {
    expect(detectLanguageFromContent('{ not json at all')).not.toBe('json');
  });

  it('detects HTML doctype / common tags', () => {
    expect(detectLanguageFromContent('<!doctype html><html></html>')).toBe(
      'html'
    );
    expect(detectLanguageFromContent('<html><body>Hi</body></html>')).toBe(
      'html'
    );
    expect(detectLanguageFromContent('<div class="x">hi</div>')).toBe('html');
  });

  it('detects XML declarations', () => {
    expect(detectLanguageFromContent('<?xml version="1.0"?><root/>')).toBe(
      'xml'
    );
  });

  it('detects YAML document marker', () => {
    expect(detectLanguageFromContent('---\nfoo: bar\n')).toBe('yaml');
  });

  it('detects markdown headings and lists', () => {
    expect(detectLanguageFromContent('# Hello\n\nworld')).toBe('markdown');
    expect(detectLanguageFromContent('- item 1\n- item 2')).toBe('markdown');
    expect(detectLanguageFromContent('```js\nfoo\n```')).toBe('markdown');
  });

  it('detects shebangs', () => {
    expect(detectLanguageFromContent('#!/usr/bin/env bash\necho hi')).toBe(
      'shell'
    );
    expect(detectLanguageFromContent('#!/usr/bin/env python\nprint(1)')).toBe(
      'python'
    );
  });

  it('returns undefined for plain prose', () => {
    expect(
      detectLanguageFromContent('Just some notes I am writing today.')
    ).toBeUndefined();
  });

  it('does not parse multi-megabyte JSON payloads', () => {
    // Build a syntactically valid JSON longer than the parser cap.
    const big = '[' + '"x",'.repeat(60_000) + '"x"]';
    expect(big.length).toBeGreaterThan(200_000);
    // Should bail out instead of parsing — returns undefined, not 'json'.
    expect(detectLanguageFromContent(big)).toBeUndefined();
  });
});

describe('languageLabel', () => {
  it('falls back to Plain Text for undefined', () => {
    expect(languageLabel(undefined)).toBe('Plain Text');
  });

  it('returns the matching label for a known id', () => {
    expect(languageLabel('json')).toBe(
      PICKABLE_LANGUAGES.find((l) => l.id === 'json')!.label
    );
  });

  it('returns the id itself when not in PICKABLE_LANGUAGES', () => {
    expect(languageLabel('made-up')).toBe('made-up');
  });
});
