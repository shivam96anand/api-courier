/**
 * Sanitizer for the folding state Monaco embeds in a persisted view state.
 */

const FOLDING_CONTRIBUTION_ID = 'editor.contrib.folding';
/** Monaco's `FoldSource.recovered`: collapsed, but no provider reports it. */
const FOLD_SOURCE_RECOVERED = 2;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Drop "recovered" fold ranges from a saved view state.
 *
 * Monaco keeps a collapsed range alive even after the language provider stops
 * reporting it, re-tagging it `recovered` so it survives every later recompute.
 * A fold arrow pinned to a line that isn't foldable therefore sticks forever
 * once saved — and its checksum (a hash of just two lines) is far too weak to
 * catch it, since JSON is full of identical `{` / `}` lines. Genuinely
 * recovered folds are re-derivable; phantoms are not, so drop the whole class.
 */
export function stripRecoveredFolds(viewState: unknown): unknown {
  if (!isRecord(viewState)) return viewState;
  const contributions = viewState.contributionsState;
  if (!isRecord(contributions)) return viewState;
  const folding = contributions[FOLDING_CONTRIBUTION_ID];
  if (!isRecord(folding)) return viewState;
  const regions = folding.collapsedRegions;
  if (!Array.isArray(regions)) return viewState;

  const kept = regions.filter(
    (region) => !isRecord(region) || region.source !== FOLD_SOURCE_RECOVERED
  );
  if (kept.length === regions.length) return viewState;

  return {
    ...viewState,
    contributionsState: {
      ...contributions,
      [FOLDING_CONTRIBUTION_ID]: { ...folding, collapsedRegions: kept },
    },
  };
}
