# Mileage Tracker

A mobile-first progressive web app (PWA) for one field technician to log a
day of driving in under a minute and export a mileage claim that matches an
existing spreadsheet layout.

- Distances are in kilometres, taken from odometer readings. No GPS tracking.
- Canon (10851 Shellbridge Way, Richmond, BC) is the Office. Home <-> Office
  legs are commute and not claimable. A Home <-> customer leg is claimable
  only for the distance beyond the Home <-> Office distance (23 km).
- The home address is shown in full on reports.

## Status

Phase 1 (foundation and domain logic) is complete: project scaffold,
tooling, CI, and the pure, unit-tested domain module in `src/domain`.

Phase 2 (data layer and accounts) is built: the Supabase schema with
row-level security in `supabase/migrations/`, the local Dexie database
and repositories in `src/data`, email magic-link sign-in, and the
Settings / first-launch profile form. The profile is saved on the device
first and read back after reload; see the Phase 2 setup below for the
one-time Supabase project steps.

Phase 3 (daily logging) is built: the Today / Start Day / Log Stop /
End Day screens, address autocomplete with a manual-entry fallback,
leg editing with insert-a-missed-stop and 10-second Undo, and the
parking row. See the Phase 3 section below.

Offline/sync (Phase 4), history and reports (Phase 5), and final
deployment polish (Phase 6) come in later phases.

## Setup

Requires Node 20 or 22.

```sh
npm install
cp .env.example .env   # fill in your own values; never commit .env
npm run dev
```

## Environment variables

Listed in `.env.example`. Real values are never committed.

| Variable                 | Used for                                               |
| ------------------------ | ------------------------------------------------------ |
| `VITE_SUPABASE_URL`      | Supabase project URL (Phase 2)                         |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon (public) key (Phase 2)                   |
| `VITE_GEOAPIFY_API_KEY`  | Geoapify Address Autocomplete key, free plan (Phase 3) |

Only these public keys are used in the browser; Supabase row-level
security (Phase 2) protects the data.

## Phase 2 setup: Supabase project (one time)

The app runs fully on-device without this. Do these steps to enable
sign-in and the account backup of the profile.

1. Create a free Supabase project at https://supabase.com — no credit
   card. Choose the **Canada (Central) `ca-central-1`** region. Save the
   database password in your password manager; the app never needs it.
2. Run the schema: in the project dashboard open **SQL Editor**, paste
   the whole of `supabase/migrations/0001_init.sql` and run it. It
   creates the `profiles`, `locations`, `days` and `legs` tables,
   indexes, and row-level security policies so each signed-in user can
   only see and change their own rows. It is safe to run more than once.
3. Copy the two browser-safe values into `.env` (Settings → API in the
   dashboard): `VITE_SUPABASE_URL` is the Project URL and
   `VITE_SUPABASE_ANON_KEY` is the anon/public key. Never commit `.env`,
   and never put the service_role key in the app.
4. Configure Auth URLs: in the dashboard open **Authentication → URL
   Configuration** and set:
   - Site URL: `https://singhprabhs.github.io/mileage-tracker/`
   - Redirect URLs: `https://singhprabhs.github.io/mileage-tracker/` and
     `http://localhost:5173` (for local development)

   Magic-link sign-in will not complete until the URL the link returns
   to is listed here.

5. Restart `npm run dev` (or rebuild) so the new `.env` values load,
   then use **Sign in** in the app and open the emailed magic link on
   the same device.

Free Supabase projects pause after 7 days with no requests. A paused
project can be resumed in the dashboard with one click and no data is
lost; the scheduled keep-alive workflow arrives with the sync work in
Phase 4.

## Phase 3: daily logging and the Geoapify key

The day flow is local-first, like everything else: Start Day at Home,
Log Stop at each arrival (the odometer field accepts just the last
digits and shows the completed reading before you save), and End Day
back Home, then confirm the summary to close the day. Any leg can be
edited or deleted, and a missed stop can be inserted — every change
recalculates the day's chain, and Undo is offered for 10 seconds after
a save or delete. Parking paid at a stop is recorded from the
collapsed "Parking paid" row on the Log Stop and Edit Leg screens.

Address suggestions come from Geoapify Address Autocomplete (free
plan, no credit card):

1. Create a free account at https://www.geoapify.com and an API key in
   a project. The free plan allows 3,000 credits per day; the app
   debounces typing, only searches from 3 characters, and caches
   results to stay well inside that.
2. Put the key in `.env` as `VITE_GEOAPIFY_API_KEY` for local
   development. For the deployed GitHub Pages build, add the same value
   as the repository **Actions variable** `VITE_GEOAPIFY_API_KEY`
   (Settings → Secrets and variables → Actions → Variables) — the
   deploy workflow already forwards it.
3. In the Geoapify dashboard, restrict the key to the app's domain
   (`singhprabhs.github.io`) if the dashboard offers domain
   restriction, so the public key can only be used from the app.

Without a key — or offline — address search simply reports itself
unavailable and the Log Stop screen falls back to typing the place
name and full address, which works completely on its own.

## Scripts

| Script               | What it does                            |
| -------------------- | --------------------------------------- |
| `npm run dev`        | Start the Vite dev server               |
| `npm run build`      | Type-check and build to `dist/`         |
| `npm run typecheck`  | `tsc --noEmit` (TypeScript strict mode) |
| `npm run lint`       | ESLint                                  |
| `npm run test`       | Run the Vitest unit tests once          |
| `npm run test:watch` | Run the Vitest unit tests in watch mode |

## Tests

Unit tests live in `tests/` and cover every domain rule in the brief:
Fixtures A, B and C, the claimable calculation, odometer completion,
warning checks, chain recalculation after edits, and the parking rules
(integer cents only, keypad entry, validation). `tests/data.test.ts`
covers the Phase 2 Dexie repositories against a fake IndexedDB:
profile save and reload persistence, Home/Office location maintenance,
location CRUD and archiving, and a day with the Fixture A legs read
back with the correct totals. `tests/dayService.test.ts` drives the
whole Jul 02 sample day (Fixture A, with Fixture C parking) through
the Phase 3 day service — Start Day, each Log Stop, End Day — and
checks the 85 km / 36 km claimable result, the blocked Start Day
while an earlier day is open, chain recalculation after edit / delete
/ insert, Undo restoral, and the parking rules.
`tests/addressSearch.test.ts` covers the Geoapify client with a
stubbed fetch: mapping, the 3-character minimum, caching, debounce,
and the unavailable signal on failure.

```sh
npm run test
```

## Repository layout

```text
src/domain    pure logic: claimable, odometer completion, totals (no UI, no I/O)
src/data      Dexie schema and repositories, Supabase client
src/features  auth, settings, day (Today/Start/Log/End/edit), stops (address search)
src/ui        shared components and styles
supabase/     SQL migrations and row-level security policies
tests/        unit tests and fixtures
```

## Deploy (later phase)

Hosting is GitHub Pages (free, HTTPS), deployed with GitHub Actions on
every push to `main`. The Vite base path is already set to
`/mileage-tracker/` and routing is hash-based, as GitHub Pages requires.

Note on Supabase: free projects pause after 7 days with no requests. A
paused project can be resumed in the Supabase dashboard with one click
and no data is lost. A scheduled keep-alive workflow is added with the
sync work in Phase 4.
