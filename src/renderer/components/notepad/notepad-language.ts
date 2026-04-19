/**
 * Map a file path to a Monaco language id based on extension.
 * Conservative — falls back to `plaintext` for unknown extensions.
 */
const EXT_TO_LANGUAGE: Record<string, string> = {
  json: 'json',
  jsonc: 'json',
  json5: 'json',
  md: 'markdown',
  markdown: 'markdown',
  yaml: 'yaml',
  yml: 'yaml',
  xml: 'xml',
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'scss',
  less: 'less',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  php: 'php',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  sql: 'sql',
  ini: 'ini',
  toml: 'ini',
  conf: 'ini',
  env: 'ini',
  dockerfile: 'dockerfile',
  graphql: 'graphql',
  gql: 'graphql',
  proto: 'proto',
  log: 'plaintext',
  txt: 'plaintext',
  csv: 'plaintext',
};

/**
 * Languages exposed in the language picker. Keep this list short so users
 * can scan it; obscure languages are still detected automatically.
 */
export const PICKABLE_LANGUAGES: Array<{ id: string; label: string }> = [
  { id: 'plaintext', label: 'Plain Text' },
  { id: 'markdown', label: 'Markdown' },
  { id: 'json', label: 'JSON' },
  { id: 'yaml', label: 'YAML' },
  { id: 'xml', label: 'XML' },
  { id: 'html', label: 'HTML' },
  { id: 'css', label: 'CSS' },
  { id: 'scss', label: 'SCSS' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'python', label: 'Python' },
  { id: 'shell', label: 'Shell' },
  { id: 'sql', label: 'SQL' },
  { id: 'ini', label: 'INI / TOML' },
  { id: 'graphql', label: 'GraphQL' },
];

export function detectLanguageFromPath(
  filePath: string | undefined
): string | undefined {
  if (!filePath) return undefined;
  const lower = filePath.toLowerCase();
  // Special filenames without an extension.
  if (lower.endsWith('/dockerfile') || lower === 'dockerfile') {
    return 'dockerfile';
  }
  const dot = lower.lastIndexOf('.');
  if (dot === -1) return undefined;
  const ext = lower.slice(dot + 1);
  return EXT_TO_LANGUAGE[ext];
}

export function languageLabel(languageId: string | undefined): string {
  if (!languageId) return 'Plain Text';
  const found = PICKABLE_LANGUAGES.find((l) => l.id === languageId);
  return found?.label ?? languageId;
}

/**
 * Best-effort language detection from the document body. Conservative — only
 * returns a language when the heuristic is reasonably confident, otherwise
 * returns `undefined` (leave the current language untouched).
 *
 * Used to auto-detect after a paste so the user sees JSON/HTML/XML highlighting
 * without manually picking from the dropdown.
 */
export function detectLanguageFromContent(text: string): string | undefined {
  if (!text) return undefined;
  // Cap the slice we inspect — we only need a peek for structural cues.
  const head = text.trimStart().slice(0, 512);
  if (!head) return undefined;
  const tail = text.trimEnd().slice(-1);
  const first = head[0];

  // JSON: starts with { or [ AND parses cleanly. Use a length cap so we don't
  // try to parse multi-megabyte buffers on every keystroke.
  if ((first === '{' || first === '[') && (tail === '}' || tail === ']')) {
    if (text.length < 200_000) {
      try {
        JSON.parse(text);
        return 'json';
      } catch {
        // Fall through.
      }
    }
  }

  // XML / HTML
  if (first === '<') {
    if (/^<\?xml\b/i.test(head)) return 'xml';
    if (/^<!doctype\s+html\b|^<html\b|^<head\b|^<body\b/i.test(head)) {
      return 'html';
    }
    // Generic tag at the start — bias toward HTML for common tag names.
    if (
      /^<(?:div|span|p|a|h[1-6]|table|ul|ol|li|section|article|nav|header|footer|main|form|input|button|svg|img|script|style|link|meta|title)\b/i.test(
        head
      )
    ) {
      return 'html';
    }
    if (/^<[a-z][\w:-]*[\s>]/i.test(head)) return 'xml';
  }

  // YAML document marker
  if (/^---\s*$/m.test(head.split('\n').slice(0, 3).join('\n'))) return 'yaml';

  // Markdown — headings, lists, fenced code blocks
  if (/^(#{1,6}\s|\*\s|-\s|\d+\.\s|```)/m.test(head)) return 'markdown';

  // Shell shebang
  if (/^#!\s*\/(?:usr\/)?bin\/(?:env\s+)?(?:bash|sh|zsh)/.test(head)) {
    return 'shell';
  }
  if (/^#!\s*\/(?:usr\/)?bin\/(?:env\s+)?python/.test(head)) return 'python';

  return undefined;
}
