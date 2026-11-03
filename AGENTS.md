<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Budget category management is isolated in BudgetCategoryEditor, while BudgetView owns mutations and ordering; this keeps mobile drag gestures separate from category long-press amount editing.
- Apply budgetFirstLayout when restoring desktop layouts so saved layouts also place budget first without changing widget sizes.
- The shared cache is the optimistic source of truth for reads; apply deletes and scalar edits before queuing requests so subscribers cannot resurrect pending changes.
- Snapshots may land only when no writes are in flight and their launch version is still current; rejected snapshots schedule a clean debounced refetch to reconcile server-side effects.
- Folders are soft-deleted, and orphaned todos render under unfiled without changing folder_id so undo restores their grouping.
- Dashboard memory updates immediately; localStorage persistence is debounced and flushed when the page hides to avoid synchronous writes on every mutation.
