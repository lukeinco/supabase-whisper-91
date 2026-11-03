import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

// No real fetch is retained by a test path: every request uses this stub.
const originalFetch = globalThis.fetch;
const toast = mock(() => {});
mock.module("sonner", () => ({ toast }));
globalThis.fetch = mock(() => Promise.reject(new Error("unexpected stubbed request")));
const { mutate, refreshState, bumpLocalVersion, localStateVersion } = await import("./api");
const { readCache, writeCache, clearCache, bumpVersion } = await import("./state-cache");
const { commitMutation, isGoneRow } = await import("./state-commit");
const { normalizeBudgetCats } = await import("./budget");
const { normalizeBuyItems, normalizeBudgetCategories } = await import("./buy");
const { normalizeFolders, normalizeTodos } = await import("./todos");
const { normalizeRoutines, normalizeWaiting } = await import("./modules");
const { normalizeReminders } = await import("./reminders");

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
const response = (body, status = 200) => new Response(JSON.stringify(body), { status });
const pause = (ms) => new Promise((done) => setTimeout(done, ms));

beforeEach(() => {
  clearCache();
  toast.mockClear();
  globalThis.fetch = mock(() => Promise.reject(new Error("unexpected stubbed request")));
});
afterAll(() => { clearCache(); globalThis.fetch = originalFetch; });

describe("sync reliability, stubbed fetch only", () => {
  test("delete removes cached row synchronously and stays gone after a version bump", async () => {
    const pending = deferred();
    globalThis.fetch = mock(() => pending.promise);
    writeCache({ todos: [{ id: "todo-1", title: "keep trust" }] });
    const deletion = mutate("", "todo", "deleted", { id: "todo-1" });
    expect(readCache().todos).toEqual([]);
    bumpVersion();
    expect(readCache().todos).toEqual([]);
    pending.resolve(response({ ok: true, result: { id: "todo-1", deleted_at: "2026-11-03T00:00:00Z" } }));
    await deletion;
    expect(readCache().todos).toEqual([]);
  });

  test("failed delete restores prior row in its original position", async () => {
    const pending = deferred();
    globalThis.fetch = mock(() => pending.promise);
    const row = { id: "todo-1", title: "restore me", sort_order: 0 };
    writeCache({ todos: [row, { id: "todo-2" }] });
    const deletion = mutate("", "todo", "deleted", { id: row.id });
    expect(readCache().todos).toEqual([{ id: "todo-2" }]);
    pending.resolve(response({ error: "stub failure" }, 500));
    await expect(deletion).rejects.toThrow("stub failure");
    expect(readCache().todos).toEqual([row, { id: "todo-2" }]);
  });

  for (const timing of ["before", "during"]) {
    test(`snapshot launched ${timing} a write is discarded and clean refetch follows`, async () => {
      const snapshot = deferred();
      const pendingWrite = deferred();
      let reads = 0;
      globalThis.fetch = mock((url) => {
        if (url.endsWith("/mutate")) return pendingWrite.promise;
        reads += 1;
        return reads === 1 ? snapshot.promise : Promise.resolve(response({ todos: [{ id: "clean" }] }));
      });
      writeCache({ todos: [{ id: "old" }] });
      let refresh;
      if (timing === "before") refresh = refreshState("", { force: true });
      const deletion = mutate("", "todo", "deleted", { id: "old" });
      if (timing === "during") refresh = refreshState("", { force: true });
      snapshot.resolve(response({ todos: [{ id: "stale" }] }));
      await refresh;
      expect(readCache().todos).toEqual([]);
      await pause(850); // Timer must re-arm instead of reading during the write.
      expect(reads).toBe(1);
      pendingWrite.resolve(response({ ok: true, result: { id: "old", deleted_at: "gone" } }));
      await deletion;
      await pause(850);
      expect(reads).toBe(2);
      expect(readCache().todos).toEqual([{ id: "clean" }]);
    });
  }

  test("snapshot launched during a write cannot land even after the write settles", async () => {
    const snapshot = deferred();
    let reads = 0;
    globalThis.fetch = mock((url) => url.endsWith("/mutate")
      ? Promise.resolve(response({ ok: true, result: { id: "old", deleted_at: "gone" } }))
      : ++reads === 1 ? snapshot.promise : Promise.resolve(response({ todos: [] })));
    writeCache({ todos: [{ id: "old" }] });
    const deletion = mutate("", "todo", "deleted", { id: "old" });
    const refresh = refreshState("", { force: true });
    await deletion;
    snapshot.resolve(response({ todos: [{ id: "old" }] }));
    await refresh;
    expect(readCache().todos).toEqual([]);
    await pause(850);
    expect(reads).toBe(2);
    expect(readCache().todos).toEqual([]);
  });

  for (const [entity, key, marker] of [
    ["budget_category", "budgetCategories", { archived_at: "gone" }],
    ["routine", "routines", { active: false }],
  ]) {
    test(`delete response with ${Object.keys(marker)[0]} stays removed`, async () => {
      globalThis.fetch = mock(() => Promise.resolve(response({ ok: true, result: { id: "row-1", ...marker } })));
      writeCache({ [key]: [{ id: "row-1" }] });
      await mutate("", entity, "deleted", { id: "row-1" });
      expect(readCache()[key]).toEqual([]);
      // Marker filtering also applies to non-delete responses.
      writeCache({ [key]: [{ id: "row-1" }] });
      commitMutation(entity, "edited", { id: "row-1" }, { id: "row-1", ...marker });
      expect(readCache()[key]).toEqual([]);
    });
  }

  test("undo restores the full server row without payload noise", async () => {
    const row = { id: "category-1", name: "food", archived_at: null, deleted_at: null, sort_order: 2 };
    writeCache({ budgetCategories: [] });
    globalThis.fetch = mock(() => Promise.resolve(response({ ok: true, result: row })));
    await mutate("", "budget_category", "edited", { id: row.id, deleted_at: null });
    expect(readCache().budgetCategories).toEqual([row]);
  });

  test("reorder updates both cached order fields with exactly one network call", async () => {
    writeCache({ budgetCategories: [{ id: "a", sort_order: 0 }, { id: "b", sort_order: 1 }] });
    const reorder = [{ id: "a", position: 1 }, { id: "b", sort_order: 0 }];
    globalThis.fetch = mock((url, init) => {
      expect(JSON.parse(init.body)).toEqual({ entity: "budget_category", action: "edited", payload: { reorder } });
      return Promise.resolve(response({ ok: true, result: null }));
    });
    await mutate("", "budget_category", "edited", { reorder });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(readCache().budgetCategories).toEqual([
      { id: "a", position: 1, sort_order: 1 }, { id: "b", position: 0, sort_order: 0 },
    ]);
  });

  test("temporary deletes reject quietly with no fetch, toast, or version change", async () => {
    const version = localStateVersion();
    await expect(mutate("", "todo", "deleted", { id: "tmp-1" })).rejects.toThrow("still saving");
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
    expect(localStateVersion()).toBe(version);
  });

  test("scalar edits update cache before queuing and roll back on failure", async () => {
    const pending = deferred();
    globalThis.fetch = mock(() => pending.promise);
    writeCache({ todos: [{ id: "a", title: "before" }] });
    const edit = mutate("", "todo", "edited", { id: "a", title: "after", nested: { ignored: true }, deleted_at: null });
    expect(readCache().todos).toEqual([{ id: "a", title: "after" }]);
    pending.resolve(response({ error: "stub failure" }, 500));
    await expect(edit).rejects.toThrow("stub failure");
    expect(readCache().todos).toEqual([{ id: "a", title: "before" }]);
  });

  test("committer never inserts payload-only rows and expense uses budget lines", () => {
    writeCache({ todos: [], budgetLines: [] });
    commitMutation("todo", "created", { id: "payload-only" }, null);
    expect(readCache().todos).toEqual([]);
    commitMutation("expense", "created", {}, { id: "expense-1", amount: 25 });
    expect(readCache().budgetLines).toEqual([{ id: "expense-1", amount: 25 }]);
  });

  test("all gone markers are recognized", () => {
    for (const key of ["deleted_at", "archived_at", "completed_at", "cleared_at", "resolved_at", "purchased_at"]) {
      expect(isGoneRow({ [key]: "gone" })).toBe(true);
      expect(isGoneRow({ [key]: null })).toBe(false);
    }
    expect(isGoneRow({ active: false })).toBe(true);
    expect(isGoneRow({ active: true })).toBe(false);
  });

  test("normalizers drop soft-delete markers and honor sort_order fallback", () => {
    const ordered = [{ id: "a", sort_order: 4 }, { id: "b", position: 2, sort_order: 9 }];
    expect(normalizeTodos({ todos: ordered }).map((r) => r.position)).toEqual([2, 4]);
    expect(normalizeBuyItems({ buy_items: ordered }).map((r) => r.position)).toEqual([2, 4]);
    expect(normalizeRoutines({ routines: ordered }).map((r) => r.position)).toEqual([2, 4]);
    expect(normalizeBudgetCats({ budgetCategories: ordered }).map((r) => r.position)).toEqual([2, 4]);
    expect(normalizeFolders({ folders: [{ id: "gone", deleted_at: "gone" }] }).map((r) => r.id)).toEqual(["unfiled"]);
    expect(normalizeBudgetCats({ budgetCategories: [{ id: "a", archived_at: "gone" }, { id: "b", active: false }] })).toEqual([]);
    expect(normalizeBudgetCategories({ budgetCategories: [{ id: "a", archived_at: "gone" }] })).toEqual([]);
    expect(normalizeRoutines({ routines: [{ id: "a", active: false }] })).toEqual([]);
    expect(normalizeWaiting({ waiting_on: [{ id: "a", resolved_at: "gone" }] })).toEqual([]);
    expect(normalizeReminders({ reminders: [{ id: "a", fire_at: "2026-11-03T00:00:00Z", completed_at: "gone" }] })).toEqual([]);
  });
});