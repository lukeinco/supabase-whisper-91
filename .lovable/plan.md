# Show a "calendar not connected" line

Today, when no calendar feed is configured, the calendar block renders nothing at
all — indistinguishable from a day with no events. Replace that silence with one
quiet line telling you the feed is missing.

## Behavior

Three states in the today block, in the existing visual language:

- Feed configured, events today → rows as they are now (unchanged).
- Feed configured, no events today → renders nothing, as it does now.
- Feed not configured → one 11px mono line in `--muted`: `calendar not connected`.

No accent color, no icon, no error box, no button. It sits exactly where the
event rows would go, under the same `today` label.

## Where it appears

Both shells, since both already render the calendar block: the mobile today tab
and the desktop today widget.

## Technical notes

- `/functions/v1/state` already returns `calendarConfigured: false`; no backend or
  schema change is needed and the `calendar` function is not touched.
- `src/components/dashboard/CalendarToday.tsx` currently returns `null` whenever
  the event list is empty. It will additionally read `calendarConfigured` from
  the cached dashboard state (via the existing sync hook used elsewhere) and
  render the muted line when that flag is false.
- While state is still loading, render nothing — the line must never flash before
  the flag is known.

## Not included

Setting the `ICAL_URL` secret in the Supabase project — that stays a manual step
in the Supabase dashboard, and the line disappears on its own once it is set.
