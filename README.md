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

Phase 4 (offline and sync) is built: every local write also lands in a
Dexie outbox in the same transaction, and a sync engine replays the
queue to Supabase (idempotent upserts), pulls newer server rows back
with last-write-wins, and shows Synced / Pending / Offline on Today.
The app shell is cached by the service worker so it opens with no
signal, and a one-time hint explains Add to Home Screen. See the
Phase 4 section below.

Phase 5 (history and reports) is built: the History screen with a
date-range picker (default: the current month), per-day and period
totals, and PDF / Excel / CSV reports generated on-device from local
data in the sample spreadsheet's layout, with preview and share.
Settings also has the JSON backup export / import with the weekly
backup reminder, and the PWA icons the manifest references are real
files in `public/`. See the Phase 5 section below.

Phase 6 (polish and release) is complete: every screen was reviewed
from rendered screenshots of the production build at 360 / 390 /
430 px, in light and dark mode, and at 200% text size; the layout
defects that pass found are fixed (see the Phase 6 section below),
and the accessibility pass — labels, focus visibility, AA contrast
in both themes — is done. Sample reports from Fixtures A + B and a
one-page user guide were produced as handoff deliverables.

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
   the same device. Exception: in the **Home Screen app** on iPhone,
   don't tap the link — iOS keeps the installed app's storage separate
   from the browser, so a tapped link signs in the browser instead.
   Long-press the link in the email, choose **Copy**, and paste it into
   the "Signing in from the Home Screen app?" section of the sign-in
   screen (a 6-digit code from the email works there too, if it shows
   one). The link is single-use: paste it before opening it anywhere.

Free Supabase projects pause after 7 days with no requests. A paused
project can be resumed in the dashboard with one click and no data is
lost; the scheduled keep-alive workflow is described in the Phase 4
section below.

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

## Phase 4: offline and sync

The phone is the source of truth while you work; the server is a
backup and a way to reach the data from another device.

- **Offline first.** Every create, edit and delete is written to
  IndexedDB (Dexie) immediately and the screens read from there. The
  service worker caches the app shell, so the app opens with no
  signal; address search is the only feature that needs a connection,
  and it falls back to manual entry. Signing in is only needed once —
  the session is kept on the device, so an offline reload never signs
  you out.
- **Outbox.** Each local change also writes one item to the outbox
  table in the same database transaction, carrying the record type,
  its id, and a full snapshot. The sync engine sends items whenever
  the app opens, when the network returns, shortly after each new
  change, and every 60 seconds while the app is open — in dependency
  order (locations, then profiles, then days, then legs), because the
  server enforces foreign keys and a leg must never arrive before its
  day. Before pushing, each run backfills: any local record that has
  no queued change but might not be on the server yet (for example
  data created before the outbox existed) is queued with its current
  snapshot, so its children's changes can succeed. An item is removed
  only after the server confirms it. Writes are upserts by
  client-generated UUID, so a retried item can never create a
  duplicate; soft deletes travel as the snapshot with `deleted_at`
  set, never as hard deletes.
- **Pull and conflicts.** After pushing, the engine fetches rows
  changed since the last sync and merges them, last-write-wins by
  `updated_at` — except a record that still has a pending outbox item,
  which is never overwritten until its change has been pushed. After a
  day's legs merge, the leg chain is re-checked; if a reading no
  longer follows the previous one, the day is flagged for review on
  the device instead of being silently merged into a broken chain.
- **Sync status.** Today shows **Synced**, **Pending (n changes)**,
  or **Offline**. A change that keeps failing blocks only its own
  record and the records that depend on it (a profile waits on its
  Office location; legs wait on their day) — everything else keeps
  syncing. If one change fails three times it stays queued and Today
  shows the error with a **Retry** button — sync never fails
  silently. Signed out (or with Supabase not configured) it honestly
  says the data is on this device only.
- **Install hint.** When the app opens in a normal browser tab (not
  installed), a one-time banner explains Share → Add to Home Screen.
  On iPhone this matters: Safari can clear a plain tab's stored data
  after 7 days without use, but not an installed web app's. The app
  also asks the browser for persistent storage on start.
- **Backup reminder.** Settings has Export / Import backup (a JSON
  file of all data; see the Phase 5 section), and the app gently
  reminds once a week to save a backup.
- **Keep-alive (do this once).** Free Supabase projects pause after 7
  days with no requests. Copy `docs/keepalive-workflow.yml` to
  `.github/workflows/keepalive.yml` in the repository (it lives under
  `docs/` because the automation account for this repo cannot create
  workflow files). The scheduled workflow makes one small request to
  the project every 3 days using the repository variables
  `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`, and fails loudly if
  the project does not respond. If the project ever does pause, resume
  it from the Supabase dashboard with one click — no data is lost.

## Phase 5: history and reports

The History screen (`/history`, linked from Today) has a date-range
picker defaulting to the first and last day of the current month,
lists the days in range with distance and claimable per day (parking
totals appear alongside whenever any parking was paid), and shows
period totals. Tapping a day opens the same review/edit screen as
Today, so edits flow through the day service and sync as usual.

Reports are generated on the device from the local database only —
the phone is the source of truth. A pure report model
(`src/features/reports/reportModel.ts`) computes rows and totals
through the domain module; the writers in `reportPdf.ts`,
`reportExcel.ts` and `reportCsv.ts` only format that model:

- All three reproduce the sample spreadsheet: Name / Tech ID on light
  blue at the left; the period start and end dates with ODOMETER
  START / ODOMETER END at the right; a peach DISTANCE HOME - OFFICE
  (KM) row; a pale yellow Total Claimable Mileage (KM) row; and the
  nine columns Date ("Jul 02"), From Destination, From Address
  (full — the home address is shown in full), To Destination, To
  Address (full), Odometer Start, Odometer End, Distance, Claimable
  (blank when a leg is not claimable). No signature, logo or
  approval fields.
- When the range contains any parking, PDF and Excel add a tenth
  Parking ($) column and a Total Parking ($) line directly under the
  Total Claimable line; the CSV always carries the Parking ($)
  column.
- PDF: landscape Letter via jsPDF + autotable, header block on the
  first page, table header repeated per page, "Page x of y" footer.
- Excel: one sheet via ExcelJS, real date cells (table dates
  formatted `mmm dd`), Distance as `=odo_end - odo_start` formulas,
  Total Claimable / Total Parking as `SUM` formulas over their
  columns, parking as currency-formatted numbers, panes frozen under
  the table header.
- CSV: UTF-8 with a byte order mark, dates as yyyy-mm-dd.
- File names: `mileage_<TechID>_<start>_<end>.pdf` / `.xlsx` / `.csv`.
- The chosen report is previewed on screen, then sent through the
  Web Share API share sheet, with a download fallback. A range with
  no trips shows a clear message instead of producing an empty file.

Settings has Export backup / Import backup: the export downloads a
versioned JSON file of all local data (profile, locations, days,
legs — including soft-deleted rows, so a restore is exact). Import
validates the file first (a leg whose day is missing is rejected,
as is a backup from a newer app version), asks for confirmation,
then replaces the local data in one transaction and queues every
restored record in the outbox, so the restore syncs up cleanly.
Settings shows a gentle reminder when the last export is older than
a week or has never happened (tracked as `lastExportAt` in the meta
table).

160 unit tests pass, alongside typecheck, lint and the production
build. (The UI Polish quality pass — route/report code-splitting,
Lighthouse and accessibility verification — is recorded in
`UI_AUDIT.md` under PHASE 5 RESULTS; the Phase 6 improvements —
week/month totals, the month-end and open-day recovery cards, the
/#/log-stop deep link, the appearance setting and the first-run
tour — are recorded per feature in `DECISIONS.md`, with
before/after screenshots in `docs/ui/phase6/`.)

The PWA icons (`public/pwa-192x192.png`, `pwa-512x512.png`,
`pwa-maskable-512x512.png`) are generated by
`scripts/generate-icons.py` (Pillow): the theme blue with a bold
white "M" and road dashes; the maskable icon is full-bleed with the
artwork inside the safe zone. Regenerate with
`python3 scripts/generate-icons.py`.

## Phase 6: polish and accessibility

Every screen (Today with and without an open day, Start Day, Log
Stop, day review, Edit Leg, History with the report preview,
Settings, Sign in) was screenshot-tested from the production build
at 360, 390 and 430 px wide, in light and dark mode, with fixture
data loaded through the app's own flows (profile form, then a
Settings backup import), plus a 200%-text pass (root font size
doubled) on Today, History and Log Stop. Automated checks on every
shot asserted no horizontal overflow, nothing past the viewport
edge, no primary tap target under 44 px, and no unlabelled form
control. Defects found and fixed:

- The install hint's dismiss button carried the full-width `.button`
  style into a flex row, squeezing the hint text into a narrow
  column and bursting the banner's border at every width and theme.
  It is now a compact 48 px button.
- At 200% text the History From/To date fields clipped their own
  values (a native date control hides its year when squeezed). The
  pair now stacks full-width whenever two columns would be too
  narrow — the column minimum is in rem, so it grows with the text
  size and only ever triggers under large-text settings.
- The danger (delete) red was 2.9:1 against the dark background —
  below WCAG AA. Dark mode now uses a pale tint at 11:1; the light
  red is 6.5:1 on white.
- Page date headers showed each date twice ("Oct 23 · 2026-10-23").
  Today, Start Day, day review and the day summary now use the
  single "Fri, Oct 23, 2026" format, like the History rows.
- An explicit `:focus-visible` outline is set for both themes
  (previously the app relied on the browser default).

Accessibility state: every form control has an associated label
(verified in the browser, not just by reading markup); icon-only
controls (Settings gear, dismiss, leg edit links) have accessible
names; body and muted text measure 12:1 or better in both themes;
sync status and form errors are always text, never colour alone.

## User guide

The essentials (the full one-page guide with screenshots is a
handoff document, kept with the sample reports):

- **Install (iPhone):** open the app in Safari → Share → **Add to
  Home Screen**. From then on, use the Home Screen icon — it keeps
  its data safe and works offline.
- **Sign in:** enter your email and tap **Email me a magic link**.
  In a normal browser tab you can tap the link in the email. In the
  **Home Screen app**, don't tap it — iOS gives the installed app
  its own storage, so a tapped link signs in the browser instead.
  Long-press the link in the email, choose **Copy**, come back to
  the app and paste it into the "Signing in from the Home Screen
  app?" section. The link works only once, so paste it before
  opening it anywhere. Sign-in emails are limited to **2 per
  hour**, so wait a bit rather than re-requesting.
- **Log a day:** **Start Day** at Home (check the odometer) → **Log
  Stop** at each arrival — type the address or pick a recent stop,
  then enter just the last digits of the odometer; the app completes
  the full reading and shows it before you save. Tap "Parking paid"
  if you paid to park. **End Day** back Home and confirm the summary.
- **Reports:** History & Reports → pick the From/To dates → PDF,
  Excel or CSV → Share or Download. The file matches the claim
  spreadsheet, with your home address in full.
- **Backup:** Settings → **Export backup** saves one JSON file with
  everything on the device. Do it about once a week (the app
  reminds you) and keep the file somewhere safe, like Files or
  iCloud. Import is in the same place and replaces the device's
  data with the backup's.
- **Offline:** logging works fully in airplane mode. The line under
  the title on Today tells you where things stand: **Synced**,
  **Pending (n changes)** (they send themselves when you're back
  online), **Offline**, or **On this device only** when you're not
  signed in.

## Scripts

| Script               | What it does                            |
| -------------------- | --------------------------------------- |
| `npm run dev`        | Start the Vite dev server               |
| `npm run build`      | Type-check and build to `dist/`         |
| `npm run typecheck`  | `tsc --noEmit` (TypeScript strict mode) |
| `npm run lint`       | ESLint                                  |
| `npm run test`       | Run the Vitest unit tests once          |
| `npm run test:watch` | Run the Vitest unit tests in watch mode |
| `npm run test:e2e`   | Build, then run the Playwright e2e test |
| `npm run preview`    | Serve the production build locally      |

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
and the unavailable signal on failure. `tests/sync.test.ts` drives
the sync engine against an in-memory fake remote: a full Fixture A
day logged while the remote is down survives a database reload and
then syncs exactly once (and a second sync duplicates nothing), push
failures are contained to their own record chain and surface after
three attempts until Retry, pull merges are last-write-wins and
never overwrite a pending local change, a merge that breaks a day's
leg chain flags the day for review, and the v1 → v2 schema migration
keeps existing data. The fake remote enforces the server's foreign
keys, and a regression suite covers the production deadlock it
caused: a day created before the outbox existed, edited afterwards,
now syncs fully via backfill and dependency-ordered push, a locked
item no longer blocks unrelated records, and a queue stuck on a
foreign-key lock recovers on the next app load.
`tests/history.test.ts` covers the current-month default range and
the History totals for Fixtures A + B and C. `tests/reports.test.ts`
seeds Fixtures A + B and C and asserts the generated report data
against the sample: the report model's header values, columns, rows
and totals (period odometer 155301 → 155470, claimable 74), the exact
CSV text (BOM, yyyy-mm-dd dates, blank claimable on commute legs),
the PDF table input and document, and the Excel workbook's real date
cells, `=odo_end - odo_start` distance formulas and `SUM` totals —
with the Parking ($) column present only when the range has parking
(always in CSV). `tests/backup.test.ts` covers the Settings backup:
export → wipe → import round-trips every table exactly, the import
queues every restored record (days before legs), import replaces
rather than merges, invalid files are rejected, and the weekly
reminder rule. `tests/authSignIn.test.ts` covers the pasted
sign-in link/code parsing and the in-app redeem flow against a
mocked Supabase client, including the expired-link message.

```sh
npm run test
```

End-to-end: `tests-e2e/offline.spec.ts` (Playwright, mobile viewport)
loads the production build, seeds a profile into the app's IndexedDB,
then reloads in airplane mode (`context.setOffline`) and checks the
shell and the locally saved state still render. One-time setup:
`npx playwright install chromium`. It is kept out of the Vitest run.

```sh
npm run test:e2e
```

## Repository layout

```text
src/domain    pure logic: claimable, odometer completion, totals (no UI, no I/O)
src/data      Dexie schema and repositories, outbox, sync engine, backup, Supabase client
src/features  auth, settings, day (Today/Start/Log/End/edit), stops (address
              search), history, reports
src/index.css all styles (one stylesheet, light + dark via color-scheme)
supabase/     SQL migrations and row-level security policies
tests/        unit tests and fixtures
tests-e2e/    Playwright end-to-end tests
scripts/      one-off generators (PWA icons)
docs/         keepalive workflow source (copied to .github/workflows/ by hand)
```

## Deploy

Hosting is GitHub Pages (free, HTTPS), deployed with GitHub Actions on
every push to `main`. The Vite base path is already set to
`/mileage-tracker/` and routing is hash-based, as GitHub Pages requires.

Note on Supabase: free projects pause after 7 days with no requests. A
paused project can be resumed in the Supabase dashboard with one click
and no data is lost. The scheduled keep-alive workflow that prevents
the pause is described in the Phase 4 section above.
