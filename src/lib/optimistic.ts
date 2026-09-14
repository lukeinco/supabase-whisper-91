/**
 * Swap an optimistic row for the real one the server returned.
 * The snapshot may already carry the real row (cache write-through +
 * reload can land before the mutate promise resolves). In that case,
 * drop the optimistic row rather than relabelling it into a duplicate.
 */
export function reconcileOptimistic<T extends { id?: string | null }>(
  list: T[],
  tmpId: string,
  realId: string | null,
): T[] {
  if (!realId) return list.filter((x) => x.id !== tmpId);
  return list.some((x) => x.id === realId)
    ? list.filter((x) => x.id !== tmpId)
    : list.map((x) => (x.id === tmpId ? { ...x, id: realId } : x));
}
