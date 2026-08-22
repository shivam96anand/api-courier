/**
 * Maps a Notepad tab language to a built-in pretty-printer.
 *
 * Monaco only ships a formatter for JSON in this app's bundle, so the Notepad
 * provides its own pure formatters (JSON, XML/HTML). Languages without one fall
 * back to Monaco's `editor.action.formatDocument` in `PaneController`.
 */
import { formatJson, JsonTransformResult } from './notepad-json';
import { formatXml } from './notepad-xml';

type Formatter = (text: string, indent: number) => JsonTransformResult;

const FORMATTERS: Record<string, Formatter> = {
  json: formatJson,
  xml: formatXml,
  html: formatXml,
};

/** True when the Notepad can pretty-print the given language itself. */
export function canFormatLanguage(language: string | undefined): boolean {
  return Boolean(language && language in FORMATTERS);
}

/**
 * Pretty-print `text` for the given language. Returns `ok: false` (with the
 * text unchanged) when the language has no formatter or the input is invalid.
 */
export function formatText(
  text: string,
  language: string | undefined,
  indent = 2
): JsonTransformResult {
  const formatter = language ? FORMATTERS[language] : undefined;
  if (!formatter) return { text, ok: false, error: 'No formatter available' };
  return formatter(text, indent);
}
