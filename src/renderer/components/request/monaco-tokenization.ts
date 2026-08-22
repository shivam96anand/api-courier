/**
 * Shared helpers to eliminate Monaco's "white then colored" syntax-highlight flash.
 *
 * There are two independent causes, and both are handled here:
 *
 * 1. Monaco defers syntactic tokenization to a background scheduler, so a freshly
 *    created (or freshly `setValue`-d) editor paints its text with the default
 *    (white) foreground until that async pass runs. Under main-thread contention
 *    (e.g. switching requests, or a large response arriving) that pass can be
 *    queued behind other work and lag visibly.
 *    -> `forceInitialViewportTokenization`
 *
 * 2. The grammar itself is loaded lazily, in its own chunk, the first time a
 *    model of that language exists. Until it arrives there is no tokenizer at
 *    all, so nothing can be colored.
 *    -> `warmUpMonacoLanguages`
 */

import * as monaco from 'monaco-editor';

/**
 * `forceTokenization` lives on Monaco's runtime model (ITokenizationTextModelPart)
 * but is intentionally omitted from the public `monaco.d.ts`. Narrow the shape so
 * we stay type-safe (and feature-detect it) at this boundary instead of `any`.
 */
type TokenizableModel = monaco.editor.ITextModel & {
  tokenization?: {
    forceTokenization?: (lineNumber: number) => void;
  };
};

/**
 * Upper bound on lines tokenized synchronously. A viewport is only tens of lines;
 * a few hundred covers the initial view plus scroll headroom without freezing the
 * UI thread on very large payloads.
 */
const MAX_SYNC_TOKENIZE_LINES = 500;

/**
 * Synchronously tokenize the top of the model so the next paint is already
 * themed. Call after creating an editor and after replacing its content via
 * `setValue`. Safe no-op if the runtime API is unavailable.
 */
export function forceInitialViewportTokenization(
  editor: monaco.editor.IStandaloneCodeEditor | null
): void {
  const model = editor?.getModel() as TokenizableModel | null | undefined;
  if (!model?.tokenization?.forceTokenization) return;

  const lines = Math.min(model.getLineCount(), MAX_SYNC_TOKENIZE_LINES);
  model.tokenization.forceTokenization(lines);
}

/**
 * Languages whose grammars must be ready before the user can open a body or
 * response. Matches the `languages` list in the MonacoWebpackPlugin config.
 */
const WARM_UP_LANGUAGE_IDS = ['json', 'xml'] as const;

let warmUpPromise: Promise<void> | null = null;

/**
 * Preload Monaco's Monarch grammars for JSON and XML.
 *
 * Monaco registers basic languages with a *lazy* tokenizer factory
 * (`registerTokensProviderFactory` in `basic-languages/_.contribution`), so the
 * grammar lives in its own webpack chunk that is only fetched when a model of
 * that language is first created. Until that chunk resolves, the model has no
 * tokenization support at all and every line falls back to the null tokenizer,
 * which paints with `editor.foreground` (#ffffff) — the "all white text, colors
 * appear seconds later" flash. `forceInitialViewportTokenization` cannot help
 * there because there is no grammar yet to tokenize with.
 *
 * `monaco.editor.colorize` is the public API that awaits
 * `TokenizationRegistry.getOrCreate(languageId)`, so it resolves once the
 * grammar is registered. Calling this during app startup moves the chunk load
 * off the critical path, so the first request body / response paints colored.
 *
 * Idempotent: repeat calls reuse the first promise.
 */
export function warmUpMonacoLanguages(): Promise<void> {
  warmUpPromise ??= Promise.all(
    WARM_UP_LANGUAGE_IDS.map((languageId) =>
      monaco.editor.colorize('', languageId, {}).catch(() => undefined)
    )
  ).then(() => undefined);

  return warmUpPromise;
}
