/**
 * Marks rows whose key is repeated. The last enabled row wins when the request
 * is built, so the earlier ones are shadowed and would otherwise look active.
 */
export function findShadowedRowIndexes(
  rows: Array<{ key: string; enabled: boolean }>
): Set<number> {
  const lastIndexByKey = new Map<string, number>();
  rows.forEach((row, index) => {
    const key = row.key.trim().toLowerCase();
    if (!key || !row.enabled) return;
    lastIndexByKey.set(key, index);
  });

  const shadowed = new Set<number>();
  rows.forEach((row, index) => {
    const key = row.key.trim().toLowerCase();
    if (!key || !row.enabled) return;
    if (lastIndexByKey.get(key) !== index) shadowed.add(index);
  });
  return shadowed;
}

/** Applies the shadowed styling/tooltip to a set of key-value rows. */
export function markShadowedRows(rows: HTMLElement[]): void {
  const descriptors = rows.map((row) => ({
    key: (row.querySelector('.key-input') as HTMLInputElement)?.value ?? '',
    enabled:
      (row.querySelector('.kv-checkbox') as HTMLInputElement)?.checked ?? true,
  }));
  const shadowed = findShadowedRowIndexes(descriptors);

  rows.forEach((row, index) => {
    const isShadowed = shadowed.has(index);
    row.classList.toggle('kv-row--shadowed', isShadowed);
    row.title = isShadowed
      ? `Duplicate "${descriptors[index].key.trim()}" — the last row wins.`
      : '';
  });
}
