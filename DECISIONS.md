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
