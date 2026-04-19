/**
 * Compute a stable hash for jsondiffpatch's array detectMove option.
 * Used by both the worker and the inline fallback.
 */
export function computeObjectHash(
  obj: unknown,
  index?: number
): string | undefined {
  if (!obj || typeof obj !== 'object') {
    return JSON.stringify(obj) + '#' + (index ?? 0);
  }

  const record = obj as Record<string, unknown>;
  const directId = record.id ?? record._id ?? record.uuid ?? record.guid;
  if (typeof directId === 'string' || typeof directId === 'number') {
    return String(directId);
  }

  return JSON.stringify(obj);
}
