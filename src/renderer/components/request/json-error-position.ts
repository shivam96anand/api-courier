/**
 * Extracts the character offset reported by a `JSON.parse` failure.
 *
 * V8 words this differently across versions ("at position 12",
 * "at position 12 (line 2 column 3)"), and some messages carry no offset at
 * all, so callers must handle `null` by falling back to a whole-document mark.
 */
export function parseJsonErrorOffset(errorMessage: string): number | null {
  const match = /position (\d+)/.exec(errorMessage);
  if (!match) return null;
  const offset = Number.parseInt(match[1], 10);
  return Number.isFinite(offset) ? offset : null;
}

/** Result of validating a JSON string for the body editor. */
export interface JsonValidationResult {
  valid: boolean;
  error?: string;
}

/** Empty content is treated as valid — an absent body is not a syntax error. */
export function validateJsonText(text: string): JsonValidationResult {
  if (!text.trim()) return { valid: true };
  try {
    JSON.parse(text);
    return { valid: true };
  } catch (err) {
    return { valid: false, error: (err as Error).message };
  }
}
