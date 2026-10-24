# UI Audit — Mileage Tracker (UI Polish Brief, Phase 0)

Date: Oct 23, 2026 · Build audited: live commit `05c77e1` (local `b54e06c`), production build served locally.
Method: Playwright **WebKit** (installed for this audit; system libraries added) with iPhone-class
contexts — 390×844 (iPhone 13/14/15 class), 430×932 (Pro Max class), 360×740 — light + dark,
fixture data loaded through the app's own first-launch profile + Settings backup import.
Lighthouse 12 (mobile, simulated Moto G / slow 4G) ran against the same local build under Chromium,
because Lighthouse does not support WebKit. Baseline before any polish work: **123/123 unit tests pass**.

Severity: **High** = blocks or confuses a task · **Medium** = looks unprofessional · **Low** = minor polish.
Findings are one line each; [device] marks items that still need a real-iPhone check.

## Capture inventory (61 screenshots in `docs/ui/audit/`, uncommitted)

- All states at 390 light + dark: first-launch, signin, today-noday, today-midday, today-closed,
  start-day, start-day-blocked, logstop-search, logstop-results, logstop-odometer, logstop-parking,
  dialog-parking-confirm, endday-form, endday-summary, day-review, edit-leg, history, history-empty,
  report-preview, settings, settings-error, dialog-import-confirm, offline-today, offline-logstop.
- Width pass (360 + 430, light; 430 also dark): today-midday, logstop-search, history, settings, start-day-blocked.
- Plus: loading-shell (bundle delayed), flow-undo-snackbar (save feedback on Today).
- Caveat: address-search **results** could not be captured in their success form here — the Geoapify key's
  referer restriction rejects the local origin (`HTTP 401`), so `logstop-results-*` shows the failure
  variant. Search success on the real origin was verified in production during the build.

## Daily flow: taps and time for a 4-stop day

Fixture A shape (Start at Home → Canon → Dsk Law [parking $12.50] → Agat Laboratories → Canon → End Day at Home),
driven in WebKit from a fresh profile; full step list recorded during the run (39 actions).

- **Taps: 28** (includes tapping each field to focus it) · **Keystrokes: 106** with manual address entry.
- Machine-paced run: **16.3 s**; modelled active use ≈ **55–65 s** with manual entry (1.0 s/tap incl. screen
  change, 0.3 s/keystroke), ≈ **40–45 s** when address search works (production) and Start Day is prefilled —
  two new-customer stops drop from ~40 keystrokes each to ~8 (type a few letters, tap the suggestion).
- Not counted above: **~1–2 scroll swipes per stop** to reach the Save button (≈6 per day), because it is not docked.
- Log Stop opens from Today in **155 ms** on local data (brief target <200 ms ✓). Tap response is immediate (local-first).

## Lighthouse (mobile, local production build)

| Measure | Result | Brief target |
| --- | --- | --- |
| Performance | **50** | ≥ 90 |
| Accessibility | **100** | 100 |
| Best practices | **100** | (100 with PWA) |
| SEO | 90 (no meta description) | — |
| LCP | **4.3 s** | < 2.0 s |
| CLS | **0** | < 0.05 ✓ |
| Total blocking time | 1,310 ms | — |
| First byte → interactive | FCP 4.2 s · TTI 5.8 s | — |

- Lighthouse 12 no longer scores a PWA category; installability was checked by hand: manifest ✓
  (192/512/maskable icons), service worker registered ✓, `display: standalone` ✓, **apple-touch-icon absent ✗**.
- First-load JS is a **single 2,057,530-byte bundle ≈ 609 KB gzipped** (CSS 1.6 KB gz) vs the brief's
  <250 KB target — ExcelJS and jsPDF are bundled into the entry chunk though reports run ~monthly.
  Lighthouse estimates **435 KiB of unused JS** on first load; JS boot-up 1.5 s of the 3.3 s main-thread work.

## Contrast verification

Current palette (measured/computed): white on primary `#0F4C81` **8.86:1** · danger `#B3261E` on white **6.54:1** ·
dark danger `#F2B8B5` on dark canvas **9.96:1** · focus `#8ECBFF` on dark **9.83:1** · muted text via opacity
(black @80% = #333) **12.63:1** light, white @80% **11.25:1** dark — **all current text pairs pass WCAG AA**,
because the palette is essentially monochrome. The exception is disabled buttons (opacity 0.6 ≈ **1.54:1**;
WCAG-exempt, but "Saving…" states look washed out).
Brief token starting values, checked the same way: every text pair passes ≥4.5:1 (tightest: muted `#5B6472`
on background **5.58:1**, accent `#2457D6` on white **6.16:1**, white on accent **6.16:1**; dark pairs 6.17–17.01:1).
The brief's **border** tokens measure only **1.25:1** (light) / **1.42:1** (dark) — fine decoratively, but input
boundaries that carry meaning need ≥3:1, so Phase 1 must not use the border token alone to define fields.

## Current CSS vs the brief's design tokens (deltas)

| Token | Brief | Current | Delta |
| --- | --- | --- | --- |
| Background | `#F6F7F9` / `#0E1116` | *unset* — UA canvas (white / near-black) | No token; dark canvas is the browser's, not the app's |
| Surface | `#FFFFFF` / `#171B22` | transparent everywhere | Cards are just outlines; no surface in either theme |
| Text | `#0F172A` / `#F1F3F6` | UA default black / white | Close in effect, but not a token |
| Muted text | `#5B6472` / `#9AA3B2` | `opacity: .8–.85` on text colour | Works (≈12.6:1) but compounds over non-white backgrounds |
| Border | `#E3E6EB` / `#2A303A` | `1px solid currentColor` (full-strength) | Main cause of the harsh "wireframe" look |
| Accent | `#2457D6` / `#6C97FF` | `#0F4C81` both themes (theme-color + primary + snackbar) | Darker than brief; no brighter dark variant |
| Success | `#1E7B4D` / `#4CC38A` | *none* — no success colour exists | Synced/save states are plain text |
| Warning | `#B45309` / `#F0A54A` | *none* — warning notices differ only by bold text | Meaning carried by words alone, no visual signal |
| Danger | `#C62828` / `#FF6B6B` | `#B3261E` / `#F2B8B5` (dark fixed in build Phase 6) | Close to brief; dark value differs |
| Radius | 12 cards/inputs · 16 sheets · round pills | **8 everywhere** (pills 999 ✓) | All corners too tight vs brief |
| Spacing | 4-grid, 16 side padding | side padding 16 ✓; mixes 2/6/10px steps | Mostly on-grid; label gaps (6px) and field padding (10px) off |
| Type scale | 12/14/16/20/24/32/40, body ≥16 | 13.6 / 14.4 / 15.2 / 16 / 17.6 / 20 / 25.6 / 32 in use | Off-scale sizes on 7 elements; h1 32 ✓ |
| Key numbers | 32–40 semibold | stats 25.6 bold; **odometer renders 16 regular (bug, F-02)** | Both under target |
| Weights | regular + semibold only | 400 / 600 / **700** | Bold is a third weight |
| Targets | ≥48, primary 56 | buttons/chips/rows 48 ✓; main primaries 64 ✓; **text links 22**; secondary primaries 48 | See F-09, F-41 |
| Font stack | `-apple-system` first | `system-ui, -apple-system, …` | Order only; identical rendering on iOS |

## Findings

### High

- F-01 [Log Stop] Save stop is not docked: it sits at the bottom of a ~1,950px form (≈2.3 viewports at 390×844), so with the keyboard open it is hidden until scrolled — ~1–2 swipes per stop, every stop, every day.
- F-02 [Log Stop / Start Day / Edit Leg] The odometer's "big number" style is silently broken: `.field input { font: inherit }` (specificity 0-1-1) beats `.big-number-input` (0-1-0), so the app's most-typed field renders at **16px regular** instead of 28.8px bold — measured in computed style.
- F-03 [Today / all forms] Raw technical errors reach the user: the sync bar prints the backend's message verbatim (in production the user saw a raw Postgres foreign-key error), search shows "Address search failed (HTTP 401)", and several forms return `caught.message` directly — no plain-language error state.
- F-04 [Log Stop / Edit Leg] A half-filled form is lost silently: tapping Back, the Home shortcut, or the app being killed discards all typed name/address/odometer input with no draft and no discard warning — the main lose-work risk in daily use.
- F-05 [Performance] First load ships ~609 KB gz JS in one bundle (Performance 50, LCP 4.3s simulated) because the report libraries are in the entry chunk — cold starts on a mid-range phone pay for monthly features on every launch.
- F-06 [First launch] "One short form" is the entire Settings page: Backup (with a "you have not saved a backup yet" warning) and Account sections sit below the profile form on first run, and the "← Back" link loops (Today redirects back to Settings when no profile exists), so the only navigation on the screen does nothing.
- F-07 [App shell] No safe-area support at all: viewport lacks `viewport-fit=cover` and no rule uses `env(safe-area-inset-*)` — the fixed Undo bar sits 16px from the bottom edge (Home-bar zone) and landscape notch behaviour is unhandled. [device]

### Medium

- F-08 [All screens] No design system exists yet: zero CSS custom properties and no shared components (`src/ui/` is empty), and drift is visible — three different back-link labels ("← Back", "← Today", "← Day"), and Day Summary puts its back link at the bottom instead of the top.
- F-09 [All screens] Every plain-text navigation link measures **22px tall** (Back links, "Review or edit this day", "History and reports", "Sign in") — under the 48px target, and they are the app's only navigation; History is reachable only via a 22px footer link.
- F-10 [Today] Header is a 32px "Mileage Tracker" wordmark plus a ⚙ text glyph as the settings icon (renders as an emoji-style gear on iOS; brief: no emoji icons, use the SVG set) instead of the brief's compact top bar with the date at left and sync pill + settings icon at right.
- F-11 [Today] Sync state is a plain text line, not a pill with an icon; worse, when the user is signed out the label always reads "On this device only", so **offline is never shown** to signed-out users (the local-only branch wins over the offline branch).
- F-12 [Today] Summary figures sit in a 2×2 grid of outlined boxes with labels *above* 25.6px values and Odometer as a fourth figure; the brief wants one card, three figures (Distance/Claimable/Parking), labels beneath, 32–40px.
- F-13 [Today / Day review] Legs are flat hairline rows (route + km only) — no timeline, no muted address line on Today, and tapping a leg jumps straight into the full Edit form instead of a detail sheet with Edit/Delete.
- F-14 [Dark mode] No surface system in dark mode: transparent cards with full-strength white hairline borders read as a wireframe, and the primary stays dark navy `#0F4C81` instead of a brightened dark accent.
- F-15 [All screens] Corner radius is 8px on everything (brief: 12/16) and borders are full-strength `currentColor`, so even light mode reads as outlined boxes rather than calm surfaces.
- F-16 [States] Loading is the bare text "Loading…" on every screen — no skeletons; on a slow connection the first paint is a blank white page (index.html has no inline shell; manifest background is white only, so dark-mode launches flash white).
- F-17 [States] Success feedback is inconsistent: stop saves get an Undo snackbar, but End Day, Settings saves and report downloads confirm with at most a plain text notice (or nothing, for downloads) — no toast, no animation anywhere.
- F-18 [Motion/feel] The CSS contains zero `:active` states, transitions, `touch-action: manipulation`, tap-highlight control or `overscroll-behavior` — buttons give no press feedback of their own and the shell rubber-bands behind fixed bars. [device]
- F-19 [Log Stop] Search has no grouping (Recent vs Suggestions), no loading skeleton, and no built-in clear button; results insert above the form and shove every field down (in-page layout jump), and the completed-reading/warning blocks appearing likewise shift the Save button.
- F-20 [Log Stop] Odometer warnings are worded technically — "over the 150 km warning threshold", "over 3 times the median … for this route" — with no Fix/Keep actions; the brief asks for a plain-words inline message ("This is 480 km more than last time… Is that right?").
- F-21 [History] No period chips (This month / Last month / Custom) and no sticky totals bar; the totals cards repeat Today's style and the third card orphans at half width under a 2-column grid.
- F-22 [Reports] The on-screen preview does not resemble the report: no blue header block, the raw file name as its heading, and a sideways-scrolling table whose addresses wrap a word at a time; the format buttons wrap 2+1, and generation shows no progress — buttons just disable.
- F-23 [Settings] One long flat form: no Profile/Locations/Data/About grouping, validation only on submit with a single banner error (not inline per field, not linked via `aria-invalid`/`aria-describedby`), no unsaved-changes signal, and the backup import uses the raw unstyled browser file input ("Choose File / no file selected").
- F-24 [Settings] Copy is stale and duplicated: the home-address hint claims "Address search arrives in a later update" (it shipped during the build), and the backup reminder plus the paragraph under it say the same thing twice.
- F-25 [Confirmations] The >$100 parking confirmation and the restore-backup confirmation are inline notices, not sheets/dialogs — the parking one materialises at the bottom of a ~2,900px page and can be missed; neither dims the page nor manages focus.
- F-26 [Copy] Dual date formats survive in the Start Day blocked notice ("Oct 22 (2026-10-22)", twice) and History's report line uses raw ISO dates ("For 2026-07-02 to 2026-07-03").
- F-27 [Updates] The service worker is `autoUpdate` with no "Update available" prompt, so after a deploy a user can run the old version for a whole session with no signal — this already confused testing twice during the build.
- F-28 [Install] The install hint is a plain bordered box with an oversized ✕ button and no Share → Add to Home Screen illustration; brief asks for a one-time card (current behaviour: shows on every load in any browser until dismissed once).
- F-29 [Today, empty] The no-day state is a one-line notice; it does not show the last day's date and total as the brief suggests, and has no icon or visual anchor.
- F-30 [Accessibility] Form errors are `role="alert"` but not programmatically tied to their fields; VoiceOver reading order and announcements for totals are unverified. [device]

### Low

- F-31 [Typography] Off-scale sizes persist (13.6px report table and parking badge, 14.4px hints, 15.2px sync line, 17.6px date) and a third font weight (700) is in use.
- F-32 [Numbers] `tabular-nums` is set on leg rows only; Today/Day totals and odometer figures can change width as values change (9 → 10 km), causing small in-page shifts.
- F-33 [Buttons] Primary buttons on secondary screens are 48px tall (Settings save, sign-in submit, History Share) vs the brief's 56px primary; main-flow primaries are 64px and fine.
- F-34 [Forms] The "This stop is" select renders with WebKit's grey gradient, inconsistent with the flat inputs; the Settings distance field shows desktop spinner arrows on a phone form.
- F-35 [Parking] The parking editor's "Done" is a small pill at the bottom-left of the fieldset (easy to miss), and the amount label "Amount (type cents: 1250 = $12.50)" reads as instructions rather than a label.
- F-36 [Day summary] The "Edit" button does not say what it edits ("Edit" → day review), and the summary has no success cue before Done is tapped.
- F-37 [History] Day rows omit the number of stops (brief: date, stops, distance, claimable).
- F-38 [Metadata] No meta description (Lighthouse SEO 90); `theme-color` is one static `#0F4C81` with no light/dark variants and matches neither brief accent.
- F-39 [Today] The parking badge's "P $12.50" prefix is cryptic next to a plain-English interface ("Parking $12.50" would read better).
- F-40 [Sign-in] The paste-link field sits ~1.5 screens below the instructions that explain it — on the Home Screen app (its whole purpose) the field should be reachable with less scrolling. [device]
- F-41 [Font] Stack order is `system-ui, -apple-system, …` (brief: `-apple-system` first) — no visual effect on iOS, noted for token fidelity in Phase 1.

### Verified good (keep)

- Every input measures **16px** — no iOS focus zoom anywhere; all buttons, chips, inputs, rows ≥48px tall; no horizontal overflow or off-viewport element at 360/390/430 in either theme.
- Lighthouse accessibility **100**; all controls labelled; visible `:focus-visible` outlines exist in both themes; current text contrast passes AA everywhere (see table above).
- CLS **0** on load; 100dvh is used; `color-scheme: light dark` is set; offline shell loads from the service worker with data intact (verified in WebKit and by the committed e2e test).
- Save-a-stop feedback (snackbar + Undo), backup import confirmation, and delete-leg-via-Undo already match the brief's "undo, not dialogs" direction.

### Needs a real iPhone (cannot be settled in WebKit emulation)

1. Keyboard behaviour on Log Stop: does the keyboard cover the odometer/Save, and how much manual scrolling does a real save take? (F-01)
2. Standalone safe areas: notch (portrait + landscape) and Home-bar clearance of the Undo bar and page bottom. (F-07)
3. Launch feel from the Home Screen: white flash / splash behaviour, especially in dark mode. (F-16)
4. VoiceOver: reading order on Today, announcement of the completed odometer value and of save confirmations. (F-30)
5. Web Share with files attached (PDF/Excel/CSV) from the Reports preview. (F-22)
6. Large-text (largest accessibility size) + keyboard together on Log Stop and History. 
7. Press feedback / tap delay feel and rubber-banding of the shell. (F-18)
8. Sign-in from the Home Screen app (brief's Suggestion #1): the paste-the-link flow built during the
   build already addresses the storage-isolation problem and was confirmed working on the user's iPhone;
   whether to *also* change method (password / 6-digit code) remains a user decision — no audit action.

## The ten most important issues

1. **F-01 — Log Stop's Save button is not docked** (High): bottom of a ~2.3-screen form, hidden behind the keyboard until scrolled; costs ~6 extra swipes in every 4-stop day.
2. **F-02 — The odometer's big-number style is silently broken** (High): a CSS specificity bug renders the app's key field at 16px instead of large and bold.
3. **F-03 — Raw technical errors are shown to the user** (High): backend and HTTP messages ("…violates foreign key constraint…", "HTTP 401") instead of plain-language error states.
4. **F-04 — Half-filled Log Stop forms are lost silently** (High): no draft, no discard warning on Back or app kill.
5. **F-05 — First load is ~609 KB gz of JS** (High): Lighthouse Performance 50 / LCP 4.3s against targets of 90 / <2s; report libraries load on every cold start.
6. **F-06 — First launch is the whole Settings page** (High): backup warning and account sections bury the setup form, and its Back link loops to itself.
7. **F-07 — No safe-area support** (High): no `viewport-fit=cover`, no inset padding anywhere; Home-bar/notch clearance in standalone is unhandled and needs the device check.
8. **F-08 — No design system yet** (Medium): zero tokens/shared components; three back-link labels, a bottom-placed back link, and the wireframe hairline look are the visible symptoms.
9. **F-09 — Navigation targets are 22px text links** (Medium): Back, History and Review links fall under half the 48px minimum.
10. **F-16/F-17 — Loading, empty and success states are bare text** (Medium): no skeletons, almost no toasts, and a blank white first paint — the app rarely signals what it is doing.

## Effort estimate per polish phase (focused sessions, tests green after each)

| Phase | Scope (per brief) | Estimate |
| --- | --- | --- |
| 1 — Design system | tokens.css, shared components (buttons, fields, cards, sheet, dialog, pill, toast, states), hidden `/#/styleguide` | **Medium — ~half a day.** Mechanical once token deltas above are decided; contrast re-check included. |
| 2 — App shell & iPhone details | viewport-fit + safe areas, standalone metas, 180px apple-touch-icon + splash images, install card, update toast, keyboard docking groundwork | **Medium — ~half a day.** Mostly index.html/CSS shell work; device verification list comes back with it. |
| 3 — Core flow | Today top bar + summary card + leg timeline + docked action bar; Log Stop restructure (grouped results, skeleton, docked Save, plain-language warnings); Start/End parity + End Day success state | **Large — ~1 day.** The biggest phase; F-01/F-02/F-04/F-19/F-20 all live here. Tap count must not grow. |
| 4 — Review & output | History chips/cards/sticky totals, page-like report preview + progress/confirmation, Settings groups + inline validation, state kit applied everywhere (incl. first-launch slimming, F-06) | **Medium — ~half to a full day.** |
| 5 — Quality pass | Field-linked errors and VoiceOver labels, large-text/landscape re-checks, route-level code splitting to hit the performance targets, full unit + e2e + Fixture A/B/C re-run, Lighthouse re-measure | **Medium — ~half a day**, plus device-check turnaround. |
| 6 — Approved improvements | No-approval items only (month-end card, open-day recovery card, week/month totals, `/#/log-stop` deep link, theme setting + first-run tour) | **Small — ~half a day** for all five; approval-needed items are separate decisions. |

Total: roughly **3–4 focused days** across Phases 1–6, with a real-device check round after Phases 2 and 5.

---

# PHASE 5 RESULTS — Quality pass (2026-10-23, local only, not pushed)

Method: same as Phase 0 — production build served locally (`vite preview`),
Lighthouse 12.8.2 mobile (Moto G Power, simulated throttling) against the
signed-out first-load route; Playwright WebKit harness with Fixture A+B data
imported through the app's own backup restore (`docs/ui/phase5/`).

## Code splitting (audit F-05, and the Phase 4 precache warning)

- Report generators leave the entry chunk entirely: History now loads
  `reportPdf` / `reportExcel` with dynamic `import()` at generation time
  (jsPDF + autotable ≈ 426 KB raw, ExcelJS ≈ 944 KB raw as separate chunks).
- Route-level `React.lazy` for every route except Today (Day, Day Summary,
  Edit Leg, Insert Stop, History, Settings, Sign-in, Start Day, Log Stop;
  the styleguide was already lazy). Today stays eager: it is the launch
  screen and the offline shell's home.
- All lazy chunks are in the service-worker precache (the existing
  `globPatterns` already covers `assets/*.js`), verified functionally:
  the committed offline e2e passes, and a PDF report was generated in the
  harness with the network off after first visit.

| Measure | Before (Phase 4 build) | After |
| --- | --- | --- |
| Entry chunk | 2,089 KB raw / 623.6 KB gz | 644.6 KB raw / 192.8 KB gz |
| First-load JS (entry + shell chunks actually fetched) | 623.6 KB gz | ≈ 200.6 KB gz |
| SW precache | 13 entries / 2,479 KiB (entry ~8 KB under the 2 MiB file limit) | 29 entries / 2,465 KiB, largest file 944 KB |
| Brief target: first-load script < 250 KB gz | ✗ | ✓ |

## Lighthouse (mobile, local production build)

Before = Phase 4 build re-measured with the pinned Lighthouse 12.8.2
(Phase 0's own run recorded Perf 50 / LCP 4.3 s; run-to-run variance on
this harness is real). After = median of 3 runs.

| Metric | Before | After | Target | Verdict |
| --- | --- | --- | --- | --- |
| Performance | 47 | 93 (91/95/93) | ≥ 90 | ✓ |
| Accessibility | 100 | 100 | 100 | ✓ |
| Best Practices | 100 | 100 | best possible | ✓ |
| LCP | 5.54 s | 2.54 s (2.50–2.61) | < 2.0 s | ✗ missed |
| CLS | 0 | 0 | < 0.05 | ✓ |
| TBT | 882 ms | ~160 ms | — | — |
| Total byte weight | 624 KiB | 210 KiB | — | — |

The LCP miss is reported, not gamed: the LCP element is the first-launch
setup screen's intro text (Today redirects there when no profile exists),
and its render waits on the ~200 KB gz first-load stack — react-dom,
Supabase (its packages were ≈ 840 KB of the pre-split entry's 2,089 KB
raw), react-router, Dexie. What
remains is a hand-rolled Supabase auth+REST sub-client to replace
`@supabase/supabase-js` in the entry; that touches the data layer, which
this brief freezes, and the unit tests mock the client so behavioural
drift would not be caught locally. It is recorded in DECISIONS.md as the
identified next lever, deliberately not taken in this phase. On the
user's iPhone the installed PWA serves everything from the precache with
no network fetch, so real-world LCP is expected to be materially better
than the throttled lab number — that is an expectation, not a
measurement.

Also measured in the harness: opening Log Stop takes 861 ms on the very
first tap of a fresh install (lazy chunks fetching) and **70 ms** once
the chunks are on device — the steady state, since the chunks are
precached at install.

## Accessibility pass

Playwright WebKit audit of every screen (Today, Sign-in, Settings,
History, History report preview, Day review), with Fixture data loaded:

- Every visible control on every screen has an accessible name
  (0 unnamed of 5–15 controls per screen, computed from aria-label /
  aria-labelledby / associated label / content).
- Exactly one `<h1>` and one `<main>` per screen; heading order is
  H1 → H2 sections (Settings: Profile / Locations / Data / Account).
- Announcements: DS Toast/Pill/Banner render `role="status"`; ErrorState
  keeps `role="alert"` and EmptyState correctly has none (checked in
  source); the 10-second Undo offer is the DS Toast
  (`aria-live="polite"`), and an offline PDF generation succeeded inside
  the audited session, so save/report confirmations ride the same live
  regions.
- Form errors are wired to their fields, verified live on the profile
  form: emptying Name and saving sets `aria-invalid="true"` and
  `aria-describedby="settings-name-error"` pointing at the rendered
  error; the DS field components give every form (profile, Log Stop
  odometer, Settings) the same wiring.
- Focus: Tab trail on Today follows visual order and every stop shows
  the 3px `:focus-visible` outline; timeline legs are list markup
  (`<ol>/<ul>` with `<li>` rows) on Today and Day review; the sync
  StatusPill is `role="status"`.
- No fixes were needed: the audit found zero violations. (The Phase 0–4
  passes had already closed F-08/F-09/F-16; this pass verified the whole
  app at once instead of per screen.)

### Needs a real-device VoiceOver check (cannot be settled in WebKit emulation)

1. VoiceOver rotor landmarks/headings on each screen read in a sane
   order, especially Today's visually-hidden "Mileage Tracker" H1
   followed by the date.
2. The 10-second Undo toast after deleting a leg: VoiceOver should
   announce "… Undo" without stealing focus from the timeline.
3. BottomSheet (leg actions; place editors in Settings): focus moves
   into the sheet on open, is trapped while open, and returns to the
   invoking row on close.
4. ConfirmDialog (discard stop, parking over $100, backup replace):
   announced as an alert dialog and the destructive button is
   reachable by swipe in order.
5. The completed-reading live region on Log Stop / Edit Leg announces
   the new total distance after the odometer changes.
6. StatusPill state changes (Synced → Offline → changes pending) are
   announced politely, not assertively.
7. Report generation: the "report ready" toast is announced, and the
   Share sheet hand-off keeps VoiceOver focus sane on return.
8. Large-text (Dynamic Type) with VoiceOver running: the docked bars
   on Today / Log Stop remain reachable and don't cover content.

## Large text (200%) and landscape

Root font size doubled (the harness method from earlier phases) and
844×390 landscape, on Today, Log Stop step 2, History and Settings:
**no horizontal overflow and no clipping found** on any of the eight
combinations; docked bars stay on screen and content scrolls under
them. Screenshots in `docs/ui/phase5/` (`largetext-*`, `landscape-*`).

## Cleanup

- `src/index.css`: 524 → 116 lines. Removed every pre-design-system rule
  that is unreferenced or fully shadowed by the screen stylesheets
  (`.field*`, `.button-primary/-danger/-large/-row`, `.stats-grid`,
  `.summary-list`, `.sync-status*`, `.suggestion*`, `.date-range`,
  `.history-day-link`, the base `.report-table` family, `.today-footer`,
  `.completed-reading`, the Undo bar rules, …). Kept, with a comment in
  the file saying why: the InstallCard notice set (`.button`, `.notice`,
  `.install-hint*`), `.field-hint`, and the cascade-live margins/padding
  of `.chip-row` / `.parking-editor`.
- `src/features/day/LegList.tsx` deleted (unreferenced since the Phase 3
  timeline replaced it), along with its `.leg-*` rules; the dead
  `.undo-snackbar` override in `src/styles/shell.css` went with them.
- Pixel parity verified before/after in WebKit (390px, fixture data):
  Today and Edit Leg byte-identical; History report preview identical
  layout (same 1759px height; a 27×17px text-raster delta between runs,
  no geometry change). `docs/ui/phase5/parity-{before,after}/`.

## Verification

Typecheck ✓, lint ✓, **145/145 unit tests** (incl. the Fixture A/B/C
report tests), production build ✓, committed Playwright offline e2e ✓,
plus the harness's online + offline report generation above.
