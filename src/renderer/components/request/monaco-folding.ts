import type * as monaco from 'monaco-editor';

/**
 * Drop the fold ranges Monaco computed for a reused editor's *previous* content.
 *
 * `setValue()` only schedules a fold recompute (`FoldingController` debounces it
 * by >=200ms), so until that lands `FoldingModel` still describes the document
 * that was just replaced. Anything that reads it in the meantime — restoring a
 * saved view state, a gutter click, a fold command — acts on line ranges from
 * the old text and can pin a fold to a line that isn't foldable. Toggling the
 * `folding` option makes `FoldingController` rebuild the model with an empty
 * range set. Only call this when there is no fold state worth preserving.
 */
export function resetFoldingRanges(
  editor: monaco.editor.IStandaloneCodeEditor
): void {
  editor.updateOptions({ folding: false });
  editor.updateOptions({ folding: true });
}
