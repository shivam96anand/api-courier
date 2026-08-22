/**
 * Language detection helpers for the Notepad. The catalog itself lives in
 * `notepad-language-map.ts`; everything here is derived from it so the
 * extension map, Save-dialog extension and dropdown can never drift apart.
 */
import {
  EXTRA_FILENAMES,
  LANGUAGES,
  LanguageDef,
} from './notepad-language-map';

/** Extension (no dot) → language id. First entry in the catalog wins. */
const EXT_TO_LANGUAGE: Record<string, string> = {};
/** Exact lower-case file name → language id. */
const FILENAME_TO_LANGUAGE: Record<string, string> = { ...EXTRA_FILENAMES };
/** Language id → preferred extension for the Save dialog. */
const LANGUAGE_TO_EXT: Record<string, string> = {};
const LABELS: Record<string, string> = {};

for (const lang of LANGUAGES) {
  LABELS[lang.id] = lang.label;
  if (!LANGUAGE_TO_EXT[lang.id]) LANGUAGE_TO_EXT[lang.id] = lang.exts[0];
  for (const ext of lang.exts) {
    if (!EXT_TO_LANGUAGE[ext]) EXT_TO_LANGUAGE[ext] = lang.id;
  }
  for (const name of lang.files ?? []) {
    if (!FILENAME_TO_LANGUAGE[name]) FILENAME_TO_LANGUAGE[name] = lang.id;
  }
}

/** Languages offered in the Notepad's language dropdown. */
export const PICKABLE_LANGUAGES: Array<{ id: string; label: string }> =
  LANGUAGES.filter((l: LanguageDef) => l.pickable).map(({ id, label }) => ({
    id,
    label,
  }));

/**
 * Map a Monaco language id to its preferred file extension (without the dot).
 * Falls back to `txt` for unknown or missing languages.
 */
export function extensionForLanguage(languageId: string | undefined): string {
  if (!languageId) return 'txt';
  return LANGUAGE_TO_EXT[languageId] ?? 'txt';
}

/**
 * Build a default Save-dialog file name from a tab title and its language.
 * The extension is derived from the language (see {@link extensionForLanguage})
 * so, e.g., a Markdown tab defaults to `Untitled.md` instead of `Untitled.txt`.
 * If the title already ends with that extension it is kept as-is, avoiding
 * duplicated suffixes like `response.json.json`.
 */
export function defaultFileName(
  title: string | undefined,
  language: string | undefined
): string {
  const ext = extensionForLanguage(language);
  const base = title?.trim() || 'Untitled';
  if (base.toLowerCase().endsWith(`.${ext}`)) return base;
  return `${base}.${ext}`;
}

/**
 * Language for a path, by exact file name first (Dockerfile, Gemfile, …) then
 * by extension. Dot-files work too: `.babelrc` resolves through the `babelrc`
 * extension entry.
 */
export function detectLanguageFromPath(
  filePath: string | undefined
): string | undefined {
  if (!filePath) return undefined;
  const name = filePath.toLowerCase().split(/[\\/]/).pop() ?? '';
  if (!name) return undefined;
  if (FILENAME_TO_LANGUAGE[name]) return FILENAME_TO_LANGUAGE[name];
  // `Dockerfile.dev`, `.env.local`, … — variants of a known base name.
  if (name.startsWith('dockerfile.')) return 'dockerfile';
  if (name.startsWith('.env')) return 'ini';
  const dot = name.lastIndexOf('.');
  if (dot === -1) return undefined;
  return EXT_TO_LANGUAGE[name.slice(dot + 1)];
}

export function languageLabel(languageId: string | undefined): string {
  if (!languageId) return 'Plain Text';
  return LABELS[languageId] ?? languageId;
}

/**
 * True when the text carries a top-level `openapi`/`swagger` version key, in
 * either YAML or JSON form. Cheap enough to run on every open/paste; the
 * authoritative check (a full parse) lives in `notepad-swagger.ts`.
 */
const OPENAPI_VERSION_KEY =
  /(?:^|[\n{,])[ \t]*["']?(openapi|swagger)["']?[ \t]*:[ \t]*["']?\d/;

export function looksLikeOpenApi(text: string): boolean {
  return OPENAPI_VERSION_KEY.test(text.slice(0, 8192));
}

/**
 * Monaco model language for a tab language. `swagger` is a Restbro
 * pseudo-language (it drives the preview), so the editor tokenizes the
 * underlying YAML or JSON instead of falling back to plain text.
 */
export function monacoLanguageFor(
  language: string | undefined,
  content = ''
): string {
  if (!language) return 'plaintext';
  if (language !== 'swagger') return language;
  return content.trimStart().startsWith('{') ? 'json' : 'yaml';
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

  // Swagger/OpenAPI first: a spec is also valid JSON or YAML, so checking it
  // later would classify JSON specs as plain JSON.

  // JSON: starts with { or [ AND parses cleanly. Use a length cap so we don't
  // try to parse multi-megabyte buffers on every keystroke.
  if ((first === '{' || first === '[') && (tail === '}' || tail === ']')) {
    if (text.length < 200_000) {
      try {
        JSON.parse(text);
        // A spec is also valid JSON — prefer the Swagger preview over raw JSON.
        return looksLikeOpenApi(text) ? 'swagger' : 'json';
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

  // Swagger/OpenAPI: the version key is a top-level field, so only the head is
  // inspected — a Markdown page quoting a spec further down stays Markdown.
  if (looksLikeOpenApi(head)) return 'swagger';

  // YAML document marker — but check first whether this is Markdown with YAML
  // frontmatter (opening ---, then key-value pairs, then closing ---, then Markdown).
  if (/^---\s*$/m.test(head.split('\n').slice(0, 3).join('\n'))) {
    const afterOpen = text.trimStart().slice(3); // skip the opening ---
    const closingMatch = afterOpen.match(/\n---\s*(\n|$)/);
    if (closingMatch && closingMatch.index !== undefined) {
      const afterFrontmatter = afterOpen
        .slice(closingMatch.index + closingMatch[0].length)
        .trimStart();
      if (/^(#{1,6}\s|\*\s|-\s|\d+\.\s|```)/m.test(afterFrontmatter)) {
        return 'markdown';
      }
    }
    return 'yaml';
  }

  // Markdown — headings, lists, fenced code blocks
  if (/^(#{1,6}\s|\*\s|-\s|\d+\.\s|```)/m.test(head)) return 'markdown';

  // Shell shebang
  if (/^#!\s*\/(?:usr\/)?bin\/(?:env\s+)?(?:bash|sh|zsh)/.test(head)) {
    return 'shell';
  }
  if (/^#!\s*\/(?:usr\/)?bin\/(?:env\s+)?python/.test(head)) return 'python';

  return undefined;
}
