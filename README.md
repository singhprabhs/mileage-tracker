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
Data layer (Phase 2), daily logging screens (Phase 3), offline/sync
(Phase 4), history and reports (Phase 5), and deployment (Phase 6) come
in later phases.

## Setup

Requires Node 20 or 22.

```sh
npm install
cp .env.example .env   # fill in your own values; never commit .env
npm run dev
```

## Environment variables

Listed in `.env.example`. Real values are never committed.

| Variable | Used for |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL (Phase 2) |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon (public) key (Phase 2) |
| `VITE_GEOAPIFY_API_KEY` | Geoapify Address Autocomplete key, free plan (Phase 3) |

Only these public keys are used in the browser; Supabase row-level
security (Phase 2) protects the data.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Type-check and build to `dist/` |
| `npm run typecheck` | `tsc --noEmit` (TypeScript strict mode) |
| `npm run lint` | ESLint |
| `npm run test` | Run the Vitest unit tests once |
| `npm run test:watch` | Run the Vitest unit tests in watch mode |

## Tests

Unit tests live in `tests/` and cover every domain rule in the brief:
Fixtures A, B and C, the claimable calculation, odometer completion,
warning checks, chain recalculation after edits, and the parking rules
(integer cents only, keypad entry, validation).

```sh
npm run test
```

## Repository layout

```text
src/domain    pure logic: claimable, odometer completion, totals (no UI, no I/O)
src/data      Dexie schema, repositories, sync engine, Supabase client (Phase 2+)
src/features  day, stops, history, reports, settings (Phase 3+)
src/ui        shared components and styles
supabase/     SQL migrations and row-level security policies (Phase 2)
tests/        unit tests and fixtures
```

## Deploy (later phase)

Hosting is GitHub Pages (free, HTTPS), deployed with GitHub Actions on
every push to `main`. The Vite base path is already set to
`/mileage-tracker/` and routing is hash-based, as GitHub Pages requires.

Note on Supabase: free projects pause after 7 days with no requests. A
paused project can be resumed in the Supabase dashboard with one click
and no data is lost. A scheduled keep-alive workflow is added with the
Supabase setup in Phase 2.
