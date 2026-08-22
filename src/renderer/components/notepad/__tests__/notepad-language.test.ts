import { describe, it, expect } from 'vitest';
import {
  defaultFileName,
  detectLanguageFromContent,
  detectLanguageFromPath,
  extensionForLanguage,
  languageLabel,
  looksLikeOpenApi,
  monacoLanguageFor,
  PICKABLE_LANGUAGES,
} from '../notepad-language';
import { LANGUAGES } from '../notepad-language-map';

describe('detectLanguageFromPath', () => {
  it('detects common extensions', () => {
    expect(detectLanguageFromPath('/x/foo.json')).toBe('json');
    expect(detectLanguageFromPath('foo.MD')).toBe('markdown');
    expect(detectLanguageFromPath('a/b/c.ts')).toBe('typescript');
    expect(detectLanguageFromPath('script.py')).toBe('python');
  });

  it('detects the wider JSON family (incl. json5)', () => {
    for (const name of [
      'a.json5',
      'a.jsonc',
      'a.jsonl',
      'a.ndjson',
      'a.geojson',
      'a.har',
      'a.webmanifest',
      'a.ipynb',
      '.babelrc',
      '.prettierrc',
    ]) {
      expect(detectLanguageFromPath(name)).toBe('json');
    }
  });

  it('detects XML-family and web extensions', () => {
    expect(detectLanguageFromPath('a.xsd')).toBe('xml');
    expect(detectLanguageFromPath('a.svg')).toBe('xml');
    expect(detectLanguageFromPath('a.plist')).toBe('xml');
    expect(detectLanguageFromPath('a.vue')).toBe('html');
    expect(detectLanguageFromPath('a.sass')).toBe('scss');
    expect(detectLanguageFromPath('a.tsx')).toBe('typescript');
  });

  it('detects config, infra and shell extensions', () => {
    expect(detectLanguageFromPath('a.toml')).toBe('ini');
    expect(detectLanguageFromPath('.editorconfig')).toBe('ini');
    expect(detectLanguageFromPath('.env')).toBe('ini');
    expect(detectLanguageFromPath('.env.local')).toBe('ini');
    expect(detectLanguageFromPath('main.tf')).toBe('hcl');
    expect(detectLanguageFromPath('.zshrc')).toBe('shell');
    expect(detectLanguageFromPath('deploy.ps1')).toBe('powershell');
  });

  it('detects languages by exact file name', () => {
    expect(detectLanguageFromPath('/repo/Dockerfile')).toBe('dockerfile');
    expect(detectLanguageFromPath('Dockerfile.dev')).toBe('dockerfile');
    expect(detectLanguageFromPath('/repo/Gemfile')).toBe('ruby');
    expect(detectLanguageFromPath('C:\\repo\\Rakefile')).toBe('ruby');
  });

  it('keeps .yaml as YAML rather than the swagger pseudo-language', () => {
    expect(detectLanguageFromPath('openapi.yaml')).toBe('yaml');
    expect(extensionForLanguage('swagger')).toBe('yaml');
  });

  it('returns undefined for unknown or missing extensions', () => {
    expect(detectLanguageFromPath('README')).toBeUndefined();
    expect(detectLanguageFromPath(undefined)).toBeUndefined();
    expect(detectLanguageFromPath('mystery.qqq')).toBeUndefined();
  });
});

describe('language catalog', () => {
  it('has no duplicate ids and a label for every entry', () => {
    const ids = LANGUAGES.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const lang of LANGUAGES) {
      expect(lang.label.length).toBeGreaterThan(0);
      expect(lang.exts.length).toBeGreaterThan(0);
    }
  });
});

describe('OpenAPI / Swagger detection', () => {
  const yamlSpec = [
    'openapi: 3.0.3',
    'info:',
    '  title: Petstore',
    '  version: 1.0.0',
    'paths:',
    '  /pets:',
    '    get:',
    '      responses:',
    "        '200':",
    '          description: ok',
  ].join('\n');
  const jsonSpec = JSON.stringify({
    openapi: '3.0.0',
    info: { title: 'x', version: '1' },
    paths: {},
  });

  it('detects YAML specs', () => {
    expect(detectLanguageFromContent(yamlSpec)).toBe('swagger');
    expect(detectLanguageFromContent(`# my api\n${yamlSpec}`)).toBe('swagger');
    expect(detectLanguageFromContent(`---\n${yamlSpec}`)).toBe('swagger');
  });

  it('detects JSON specs instead of plain JSON', () => {
    expect(detectLanguageFromContent(jsonSpec)).toBe('swagger');
    expect(
      detectLanguageFromContent('swagger: "2.0"\ninfo:\n  title: x\n')
    ).toBe('swagger');
  });

  it('leaves ordinary JSON and YAML alone', () => {
    expect(detectLanguageFromContent('{"a":1}')).toBe('json');
    expect(detectLanguageFromContent('---\nfoo: bar\n')).toBe('yaml');
  });

  it('does not misread Markdown that quotes a spec further down', () => {
    const md = `# API docs\n\n${'Some prose. '.repeat(60)}\n\n\`\`\`yaml\nopenapi: 3.0.0\n\`\`\`\n`;
    expect(detectLanguageFromContent(md)).toBe('markdown');
  });

  it('looksLikeOpenApi only fires on a version key', () => {
    expect(looksLikeOpenApi(jsonSpec)).toBe(true);
    expect(looksLikeOpenApi(yamlSpec)).toBe(true);
    expect(looksLikeOpenApi('{"a":1}')).toBe(false);
    expect(looksLikeOpenApi('description: swagger is great\n')).toBe(false);
  });
});

describe('monacoLanguageFor', () => {
  it('maps the swagger pseudo-language onto YAML or JSON', () => {
    expect(monacoLanguageFor('swagger', 'openapi: 3.0.0')).toBe('yaml');
    expect(monacoLanguageFor('swagger', '  {"openapi":"3.0.0"}')).toBe('json');
  });

  it('passes real languages through and defaults to plaintext', () => {
    expect(monacoLanguageFor('markdown')).toBe('markdown');
    expect(monacoLanguageFor(undefined)).toBe('plaintext');
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

  it('detects Markdown with YAML frontmatter as markdown', () => {
    const withFrontmatter =
      '---\ntitle: My Doc\nauthor: Jane\n---\n\n# Hello\n\nSome content here.';
    expect(detectLanguageFromContent(withFrontmatter)).toBe('markdown');
  });

  it('keeps pure YAML (no markdown body after closing ---) as yaml', () => {
    expect(detectLanguageFromContent('---\nfoo: bar\nbaz: qux\n---\n')).toBe(
      'yaml'
    );
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

describe('extensionForLanguage', () => {
  it('falls back to txt for undefined / unknown languages', () => {
    expect(extensionForLanguage(undefined)).toBe('txt');
    expect(extensionForLanguage('made-up')).toBe('txt');
  });

  it('maps common languages to their preferred extension', () => {
    expect(extensionForLanguage('markdown')).toBe('md');
    expect(extensionForLanguage('json')).toBe('json');
    expect(extensionForLanguage('yaml')).toBe('yaml');
    expect(extensionForLanguage('javascript')).toBe('js');
    expect(extensionForLanguage('typescript')).toBe('ts');
    expect(extensionForLanguage('python')).toBe('py');
    expect(extensionForLanguage('plaintext')).toBe('txt');
  });

  it('returns a non-empty extension for every pickable language', () => {
    for (const { id } of PICKABLE_LANGUAGES) {
      expect(extensionForLanguage(id)).toMatch(/^[a-z0-9]+$/);
    }
  });
});

describe('defaultFileName', () => {
  it('appends the language extension to an untitled tab', () => {
    expect(defaultFileName('Untitled', 'markdown')).toBe('Untitled.md');
    expect(defaultFileName('Untitled', 'json')).toBe('Untitled.json');
    expect(defaultFileName('Untitled', 'yaml')).toBe('Untitled.yaml');
  });

  it('defaults to .txt for plaintext / unknown / missing language', () => {
    expect(defaultFileName('Untitled', 'plaintext')).toBe('Untitled.txt');
    expect(defaultFileName('Untitled', undefined)).toBe('Untitled.txt');
    expect(defaultFileName('Untitled', 'made-up')).toBe('Untitled.txt');
  });

  it('does not duplicate an extension the title already has', () => {
    expect(defaultFileName('response.json', 'json')).toBe('response.json');
    expect(defaultFileName('README.MD', 'markdown')).toBe('README.MD');
  });

  it('falls back to Untitled for empty / whitespace titles', () => {
    expect(defaultFileName('', 'markdown')).toBe('Untitled.md');
    expect(defaultFileName('   ', undefined)).toBe('Untitled.txt');
  });
});
