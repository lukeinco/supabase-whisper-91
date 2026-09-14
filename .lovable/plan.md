# Fix: optimistic rows rendered twice in Budget (and sibling lists)

## Root cause (confirmed in code)

`BudgetView.tsx` `reconcile()` (line 187) always relabels the `tmp-` row to the real id. But `commitMutation()` has already pushed the real row into the cache, and the `dataVersion` effect reloads from cache before `.then(reconcile)` runs — so state holds `[realRow, tmpRow]`, and relabelling produces two rows with the same id. Deleting one deletes both (it's one record). The identical relabel-unconditionally pattern exists in four more files.

## Changes

1. **New helper `src/lib/optimistic.ts`** — the same block appears in 5 files (≥4), so per the rule in the request, extract one helper:
   ```ts
   export function reconcileOptimistic<T extends { id: string }>(
     list: T[], tmpId: string, realId: string | null,
   ): T[] {
     if (!realId) return list.filter((x) => x.id !== tmpId);
     return list.some((x) => x.id === realId)
       ? list.filter((x) => x.id !== tmpId)
       : list.map((x) => (x.id === tmpId ? { ...x, id: realId } : x));
   }
   ```

2. **`BudgetView.tsx`** — FIX 1: replace `reconcile()` body with the drop-if-present shape via the helper (used by both `addLine` and `addPotential`). FIX 2: in `save()`'s `if (!id)` branch, apply the same shape to `setCats`. Behavior exactly as specified in the request, expressed through the helper.

3. **Sweep — same fix applied:**
   - `TodoList.tsx` (`reconcileTodo`, line 231; used at 336, 358) — YES, pattern found
   - `BuyList.tsx` (line 243) — YES
   - `WaitingOn.tsx` (`commitAdd`, line 109) — YES
   - `useReminderHub.ts` (`addReminder`, line 180) — YES

4. **Checked, no pattern:** `CaptureBar.tsx`, `Scratchpad.tsx` — no `tmp-` optimistic rows (Scratchpad edits in place; capture commits via mutate without an optimistic tmp row).

## Not touched

`addLine`, `addPotential`, `removeLine`, `load()`, `state-commit.ts`, `state-cache.ts`, `api.ts`, cache/committer layer, visual design.

## Verification

- TypeScript typecheck.
- Rebuild: yes — this is client-bundle code, so publishing a new build is required for the fix to reach production.
- Authenticated live verification (add a budget line, watch for duplicates, delete it) needs a valid `#k=` secret; without it I'll report the flow unverified rather than claim it works.

## Report format

Per file: pattern found yes/no + what changed, then the rebuild statement.
