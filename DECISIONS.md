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
