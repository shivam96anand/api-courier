/**
 * Syntax highlighting for fenced code blocks in the markdown preview, using
 * the Monaco tokenizers already bundled for the editor (so the preview matches
 * VS Code without pulling in a second highlighter).
 */
import * as monaco from 'monaco-editor';

/** Skip very large blocks — tokenizing them would stall the preview. */
const MAX_BLOCK_CHARS = 20_000;

/** Aliases used in fenced code info strings that Monaco doesn't register. */
const ALIASES: Record<string, string> = {
  js: 'javascript',
  ts: 'typescript',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  console: 'shell',
  yml: 'yaml',
  jsonc: 'json',
  json5: 'json',
  'c++': 'cpp',
  'c#': 'csharp',
  cs: 'csharp',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  kt: 'kotlin',
  golang: 'go',
  ps: 'powershell',
  ps1: 'powershell',
  tf: 'hcl',
  terraform: 'hcl',
  dockerfile: 'dockerfile',
  gql: 'graphql',
  proto3: 'proto',
  htm: 'html',
};

/**
 * Colorize every ```lang block inside a rendered markdown preview. Safe to
 * call on every render: blocks detached before colorizing finishes are skipped.
 */
export async function highlightCodeBlocks(root: HTMLElement): Promise<void> {
  const blocks = root.querySelectorAll<HTMLElement>(
    'pre > code[class*="language-"]'
  );
  await Promise.all(
    Array.from(blocks).map(async (block) => {
      const raw = /language-([\w#+.-]+)/.exec(block.className)?.[1];
      if (!raw) return;
      const language = ALIASES[raw.toLowerCase()] ?? raw.toLowerCase();
      const text = (block.textContent ?? '').replace(/\n$/, '');
      if (!text.trim() || text.length > MAX_BLOCK_CHARS) return;
      if (!monaco.languages.getLanguages().some((l) => l.id === language)) {
        return;
      }
      try {
        const html = await monaco.editor.colorize(text, language, {
          tabSize: 2,
        });
        if (block.isConnected) block.innerHTML = html;
      } catch {
        // Leave the block as plain text if tokenization fails.
      }
    })
  );
}
