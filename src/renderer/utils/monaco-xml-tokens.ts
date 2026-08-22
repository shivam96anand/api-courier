/**
 * XML/HTML token colours shared by every Monaco theme in the app.
 *
 * Monaco's standalone editor has a single *global* theme, so whichever editor
 * was created last decides how every other editor looks. Keeping these rules in
 * one place stops the notepad and request/response themes from drifting apart
 * (they did: XML rendered in Monaco's stock blue after opening the notepad).
 */
import type * as monaco from 'monaco-editor';

export function xmlTokenRules(
  themeColor: string,
  valueColor: string
): monaco.editor.ITokenThemeRule[] {
  return [
    { token: 'tag', foreground: themeColor, fontStyle: 'bold' },
    { token: 'tag.id.xml', foreground: themeColor, fontStyle: 'bold' },
    { token: 'attribute.name', foreground: 'f8c771' },
    { token: 'attribute.name.xml', foreground: 'f8c771' },
    { token: 'attribute.value', foreground: '98c379' },
    { token: 'attribute.value.xml', foreground: '98c379' },
    { token: 'delimiter.xml', foreground: valueColor },
    { token: 'comment', foreground: '6a737d', fontStyle: 'italic' },
    { token: 'cdata', foreground: 'e6db74' },
    { token: 'metatag', foreground: '56b6c2' },
    { token: 'metatag.xml', foreground: '56b6c2' },
  ];
}
