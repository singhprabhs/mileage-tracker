# Decisions

One line per decision made without the user, with the reason.

- Used Vite base path `/mileage-tracker/` and `HashRouter` — the brief names `mileage-tracker` as the repo and requires hash-based routing for GitHub Pages.
- PWA manifest references `pwa-192x192.png`, `pwa-512x512.png` and `pwa-maskable-512x512.png`, but the PNG icon files land in Phase 4 — Phase 1 is setup only and ships no binary files.
- Domain code uses the brief's snake_case leg field names (`odo_start`, `from_type`, `parking_cents`) — they mirror the database tables, so later phases need no field translation.
- Odometer and parking helpers throw `RangeError` on invalid input (non-digits, negative previous reading, non-integer cents) — pure functions cannot show UI errors, and throwing keeps invalid values out of stored data.
- A leg's "same pair" for the 3x-median warning is matched on `from_name` + `to_name` — the brief says "the same two places" and names are the place identity available on a leg.
- Locked-leg handling for a Home–Office distance change is modelled with an optional `locked` flag and stored values on `StoredLeg` — days carry the lock in Phase 2, and this keeps the recalculation rule unit-testable now.
- CI runs on Node 20 and 22 — 20 is the current GitHub Actions LTS baseline and 22 is the active LTS.
- No Dexie, Supabase, Geoapify, PDF or Excel dependencies were installed in Phase 1 — they belong to Phases 2, 3 and 5 and keeping them out keeps Phase 1 minimal.
- Phase 2 Dexie schema is version 1 with only profiles, locations, days and legs — the sync outbox table is Phase 4, so no unused table ships early.
- The local profile is a single row keyed by user_id; before sign-in it uses a locally generated UUID and is re-keyed to the signed-in user's id on the next save — this is a one-user app, so there is never more than one profile row to reconcile.
- Office name and address live on the Office row in locations (profile carries only office_location_id, exactly like the Supabase schema) — one source of truth for addresses, and Settings edits update that row in place.
- The best-effort Supabase profile backup sends office_location_id as null in Phase 2 — locations only exist on the server once sync lands in Phase 4, and sending a local-only id would break the foreign key.
- Sign-in is email magic link only (signInWithOtp) — the brief allows magic link or password, and magic link means no password to store or reset.
- When VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are unset, the Supabase client is null and the app runs fully locally with a clear "not set up" message — dev and tests must never need real credentials.
- Today's primary button is derived from the open day's state: no open day → Start Day; open day whose last stop is not Home → Log Stop (with an End Day button beside it); open day whose last leg already ends at Home → End Day, which opens the summary to review and close — "End Day" on Today means finishing the day, and the End Day screen is the log-the-Home-stop path.
- Undo snapshots live in memory only (a Map keyed by a token carried in router state) and hold the one most recent change per navigation — Phase 4 sync will give changes a durable outbox, and a 10-second undo window never needs to survive a reload.
- Recent parking chips come from the user's own stored legs (Dexie, across all days): the 3 most recent distinct amounts and the 5 most recent distinct notes, most recent first — no separate recents table to keep in sync.
- A logStop / insertLeg whose parking is over $100.00 writes nothing and returns a needs-confirmation result; the UI confirms and re-calls with parking_confirmed — the confirmation rule lives in the service, so no caller can bypass it by accident.
- Vitest blanks VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / VITE_GEOAPIFY_API_KEY in vitest.config.ts — unit tests stay deterministic on machines whose local .env holds real public keys, and never build a live client by accident.
- Phase 4 outbox has no coalescing: one item per change with that write's full snapshot, replayed in queue order — volume is tiny for one user, and replaying every snapshot in order is correct by construction.
- Pull never overwrites a record that still has a pending outbox item (local pending wins until pushed, then the next pull sees it) — a queued local edit must never be clobbered by the older server copy of the same record.
- The needs_review flag set when a pulled merge breaks a day's leg chain is local-only: it lives on the local day row, is stripped from Supabase payloads, and is recomputed after every merge of that day's legs — the server schema has no such column and the flag is derived state, not user data.
- The Add to Home Screen hint shows on every non-standalone browser, not only iOS Safari (with Share-sheet wording when an Apple mobile user agent is detected) — platform detection is unreliable, and the brief's intent is getting the app installed so its storage is not cleared.
- A sync run that hits a 3-times-failed item leaves it queued and locked until the user presses Retry on Today (which resets attempts) — automatic runs never hammer a failing item, and the error stays visible instead of failing silently.
- The Supabase keepalive workflow ships as docs/keepalive-workflow.yml and must be copied to .github/workflows/keepalive.yml by hand once — the automation account for this repo cannot write files under .github/workflows/ (the same restriction as ci.yml in Phase 1).
- The brief's Playwright airplane-mode test (tests-e2e/offline.spec.ts, `npm run test:e2e`) runs and passes locally with headless Chromium; it stays out of the Vitest run and the GitHub CI unit job (browsers are a separate heavy download), and seeds its profile straight into IndexedDB because e2e cannot sign in.
