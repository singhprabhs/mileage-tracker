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

Daily logging screens (Phase 3), offline/sync (Phase 4), history and
reports (Phase 5), and deployment (Phase 6) come in later phases.

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
back with the correct totals.

```sh
npm run test
```

## Repository layout

```text
src/domain    pure logic: claimable, odometer completion, totals (no UI, no I/O)
src/data      Dexie schema and repositories, Supabase client
src/features  auth, settings, home (day/stops/history/reports arrive in Phase 3+)
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
