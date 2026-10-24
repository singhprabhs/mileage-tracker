import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  archiveLocation,
  collectBackup,
  db,
  getLastBackupExportAt,
  getLocation,
  getProfile,
  importBackup,
  isBackupReminderDue,
  listLocations,
  parseBackup,
  recordBackupExported,
  saveProfileWithLocations,
  serializeBackup,
  supabase,
  updateLocation,
  upsertProfileToSupabase,
  type BackupFile,
  type LocationRecord,
} from "../../data";
import {
  Banner,
  BottomSheet,
  Button,
  Card,
  CheckIcon,
  ConfirmDialog,
  ErrorState,
  ListRow,
  SectionHeader,
  SegmentedControl,
  SkeletonCard,
  TextField,
  Toast,
} from "../../components";
import {
  applyThemePreference,
  readThemePreference,
  storeThemePreference,
  type ThemePreference,
} from "../../ui/theme";
import { useAuth } from "../auth/authContext";
import { BackLink } from "../day/chrome";
import { formatFullDateLabel, toLocalDateString } from "../day/dayService";
import Tour from "../tour/Tour";
import { downloadBlob } from "../reports/share";
import ProfileForm from "./ProfileForm";
import {
  EMPTY_PROFILE_FORM,
  hasProfileErrors,
  profileInputFromForm,
  validateProfileForm,
  type ProfileFormErrors,
  type ProfileFormState,
} from "./profileFormModel";

export { DEFAULT_OFFICE_NAME, DEFAULT_OFFICE_ADDRESS } from "./profileFormModel";

type SheetState =
  | { kind: "home" }
  | { kind: "office" }
  | { kind: "place"; place: LocationRecord }
  | null;

/** Small transient confirmation dock (the DS Toast pattern). */
function SavedToast({ message }: { message: string }) {
  return (
    <div className="ds-toast-dock">
      <div role="status">
        <Toast message={message} icon={<CheckIcon width={20} height={20} />} />
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="settings-section">
      <SectionHeader>{title}</SectionHeader>
      {children}
    </section>
  );
}

/**
 * Settings (UI Polish Phase 4): iPhone-Settings-style grouped
 * sections — Profile / Locations / Data / About — as DS Cards,
 * ListRows and SectionHeaders. First launch is a FOCUSED setup
 * screen instead of this whole page (audit F-06): welcome line,
 * the shared profile form, Save — the other sections appear only
 * once a profile exists. The form, its validation and the save
 * path are shared (ProfileForm + saveProfileWithLocations); inline
 * field errors replace the old single banner, a DS Toast confirms
 * saves, the backup reminder is a DS Banner, import confirms in a
 * DS ConfirmDialog, and the raw file input is gone (F-23). Home,
 * Office and saved customer places edit in BottomSheets that run
 * through the same save path. The backup format and its helpers
 * are untouched.
 */
export default function SettingsPage() {
  const { session, signOut } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState<ProfileFormState>(EMPTY_PROFILE_FORM);
  const [errors, setErrors] = useState<ProfileFormErrors>({});
  const [hasProfile, setHasProfile] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [banner, setBanner] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [lastExportAt, setLastExportAt] = useState<string | null>(null);
  const [importCandidate, setImportCandidate] = useState<BackupFile | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [places, setPlaces] = useState<LocationRecord[]>([]);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [sheetForm, setSheetForm] = useState<ProfileFormState>(EMPTY_PROFILE_FORM);
  const [sheetErrors, setSheetErrors] = useState<ProfileFormErrors>({});
  const [placeForm, setPlaceForm] = useState({ name: "", address: "" });
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemePreference>(() => readThemePreference());
  const [showTour, setShowTour] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadAll = useCallback(async () => {
    const profile = await getProfile(db);
    if (profile) {
      const office = profile.office_location_id
        ? await getLocation(db, profile.office_location_id)
        : undefined;
      setHasProfile(true);
      setForm({
        name: profile.name,
        tech_id: profile.tech_id,
        home_address: profile.home_address,
        office_name: office?.name ?? EMPTY_PROFILE_FORM.office_name,
        office_address: office?.address ?? EMPTY_PROFILE_FORM.office_address,
        home_office_km: String(profile.home_office_km),
      });
      const locations = await listLocations(db, profile.user_id);
      setPlaces(locations.filter((row) => row.type === "customer"));
    }
    setLastExportAt(await getLastBackupExportAt(db));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await loadAll();
        if (!cancelled) setLoaded(true);
      } catch {
        if (!cancelled) setLoadFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadAll, reloadKey]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function setField(field: keyof ProfileFormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  /** Appearance (Phase 6): persist and apply in the same tap. */
  function changeTheme(next: ThemePreference) {
    setTheme(next);
    storeThemePreference(next);
    applyThemePreference(next);
  }

  function setSheetField(field: keyof ProfileFormState, value: string) {
    setSheetForm((current) => ({ ...current, [field]: value }));
    setSheetErrors((current) => ({ ...current, [field]: undefined }));
  }

  /** The one save path: validate, persist, back up best-effort. */
  async function saveProfile(next: ProfileFormState): Promise<boolean> {
    const validation = validateProfileForm(next);
    if (hasProfileErrors(validation)) {
      if (next === form) setErrors(validation);
      return false;
    }
    setSaving(true);
    setBanner(null);
    try {
      const sessionUserId = session?.user.id;
      const { profile } = await saveProfileWithLocations(
        db,
        profileInputFromForm(next),
        sessionUserId,
      );
      const firstSave = !hasProfile;
      setHasProfile(true);
      setForm(next);
      if (supabase && sessionUserId) {
        const backup = await upsertProfileToSupabase(supabase, profile, sessionUserId);
        if (!backup.ok) {
          setBanner(
            "Saved on this device. The account backup did not go through — your data is safe here and will back up when sync runs.",
          );
        }
      }
      if (firstSave) {
        // First launch (Phase 6): Today offers the three-card tour
        // on this hand-off, once.
        void navigate("/", { replace: true, state: { showTour: true } });
      } else {
        setToast("Profile saved.");
      }
      // Refresh the saved-places list (office/home rows may have moved).
      const locations = await listLocations(db, profile.user_id);
      setPlaces(locations.filter((row) => row.type === "customer"));
      return true;
    } catch {
      setBanner("Couldn't save your profile. Please try again.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    await saveProfile(form);
  }

  function openSheet(next: Exclude<SheetState, null>) {
    setSheetForm(form);
    setSheetErrors({});
    setPlaceError(null);
    if (next.kind === "place") {
      setPlaceForm({ name: next.place.name, address: next.place.address });
    }
    setSheet(next);
  }

  async function handleSheetSave() {
    if (!sheet) return;
    if (sheet.kind === "place") {
      if (!placeForm.name.trim() || !placeForm.address.trim()) {
        setPlaceError("Add the place name and its full address.");
        return;
      }
      setSaving(true);
      try {
        await updateLocation(db, sheet.place.id, {
          name: placeForm.name.trim(),
          address: placeForm.address.trim(),
        });
        const profile = await getProfile(db);
        if (profile) {
          const locations = await listLocations(db, profile.user_id);
          setPlaces(locations.filter((row) => row.type === "customer"));
        }
        setSheet(null);
        setToast("Place saved.");
      } catch {
        setPlaceError("Couldn't save that place. Please try again.");
      } finally {
        setSaving(false);
      }
      return;
    }
    const validation = validateProfileForm(sheetForm);
    if (hasProfileErrors(validation)) {
      setSheetErrors(validation);
      return;
    }
    if (await saveProfile(sheetForm)) setSheet(null);
  }

  async function handleArchivePlace() {
    if (sheet?.kind !== "place") return;
    setSaving(true);
    try {
      await archiveLocation(db, sheet.place.id);
      setPlaces((current) => current.filter((row) => row.id !== sheet.place.id));
      setSheet(null);
      setToast("Removed from saved places.");
    } catch {
      setPlaceError("Couldn't remove that place. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleExportBackup() {
    setBanner(null);
    try {
      const backup = await collectBackup(db);
      const blob = new Blob([serializeBackup(backup)], { type: "application/json" });
      downloadBlob(blob, `mileage-tracker-backup-${toLocalDateString(new Date())}.json`);
      await recordBackupExported(db);
      setLastExportAt(await getLastBackupExportAt(db));
      setToast("Backup downloaded. Keep the file somewhere safe, outside this app.");
    } catch {
      setBanner("Couldn't export a backup. Please try again.");
    }
  }

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBanner(null);
    try {
      const backup = parseBackup(await file.text());
      setImportCandidate(backup);
    } catch {
      setImportCandidate(null);
      setBanner("That file isn't a backup from this app. Nothing was changed.");
    }
  }

  async function handleConfirmImport() {
    if (!importCandidate || importBusy) return;
    setImportBusy(true);
    try {
      await importBackup(db, importCandidate);
      setImportCandidate(null);
      await loadAll();
      setToast("Backup restored — this device now holds the backup's data.");
    } catch {
      setImportCandidate(null);
      setBanner("Couldn't restore that backup. Your current data was not changed.");
    } finally {
      setImportBusy(false);
    }
  }

  if (loadFailed) {
    return (
      <main className="app-shell">
        {hasProfile ? <BackLink to="/" /> : null}
        <h1 className="screen-title">Settings</h1>
        <ErrorState
          message="Settings couldn't be loaded. Your logs are safe on this phone."
          onRetry={() => {
            setLoadFailed(false);
            setReloadKey((key) => key + 1);
          }}
        />
      </main>
    );
  }

  if (!loaded) {
    return (
      <main className="app-shell">
        <h1 className="screen-title">Settings</h1>
        <SkeletonCard lines={4} />
      </main>
    );
  }

  // First launch: the focused setup screen (audit F-06) — no back
  // link (it would loop), no Data/Account sections yet.
  if (!hasProfile) {
    return (
      <main className="app-shell">
        <h1 className="screen-title">Set up your profile</h1>
        <p className="screen-date">
          One short form before your first day. Your name and Tech ID appear on reports
          exactly as you type them here, and your home address is shown in full on reports.
        </p>
        {banner ? <Banner kind="warning">{banner}</Banner> : null}
        <form onSubmit={handleSubmit} noValidate>
          <ProfileForm form={form} errors={errors} onFieldChange={setField} idPrefix="setup" />
          <div className="settings-submit">
            <Button type="submit" loading={saving}>
              Save and continue
            </Button>
          </div>
        </form>
        {toast ? <SavedToast message={toast} /> : null}
      </main>
    );
  }

  const reminderDue = isBackupReminderDue(lastExportAt);

  return (
    <main className="app-shell">
      <BackLink to="/" />
      <h1 className="screen-title">Settings</h1>
      {banner ? <Banner kind="warning">{banner}</Banner> : null}

      <Section title="Profile">
        <form onSubmit={handleSubmit} noValidate>
          <ProfileForm
            form={form}
            errors={errors}
            onFieldChange={setField}
            idPrefix="settings"
          />
          <div className="settings-submit">
            <Button type="submit" loading={saving}>
              Save settings
            </Button>
          </div>
        </form>
      </Section>

      <Section title="Appearance">
        <Card>
          <SegmentedControl
            label="Appearance"
            value={theme}
            onChange={changeTheme}
            options={[
              { value: "auto", label: "Auto" },
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
          />
          <p className="settings-note">
            Auto follows your phone&rsquo;s light or dark setting.
          </p>
        </Card>
      </Section>

      <Section title="Locations">
        <Card>
          <ListRow
            title="Home"
            subtitle={`${form.home_address} · ${form.home_office_km} km to the Office`}
            chevron
            onClick={() => openSheet({ kind: "home" })}
          />
          <ListRow
            title={form.office_name || "Office"}
            subtitle={form.office_address}
            chevron
            onClick={() => openSheet({ kind: "office" })}
          />
          {places.map((place) => (
            <ListRow
              key={place.id}
              title={place.name}
              subtitle={place.address}
              chevron
              onClick={() => openSheet({ kind: "place", place })}
            />
          ))}
        </Card>
        <p className="settings-note">
          Places you drive to are saved here as you log stops, so the next visit is one tap.
        </p>
      </Section>

      <Section title="Data">
        {reminderDue ? (
          <Banner kind="warning">
            {lastExportAt
              ? "It has been over a week since your last backup. Export a fresh one so a copy of your logs lives outside this app."
              : "You have not saved a backup yet. Export one so a copy of your logs lives outside this app."}
          </Banner>
        ) : null}
        <Card>
          <p className="settings-card-text">
            {lastExportAt
              ? `Last backup: ${formatFullDateLabel(lastExportAt.slice(0, 10))}.`
              : "No backup exported yet."}{" "}
            The export is one file with everything on this device: profile, places, days and
            legs.
          </p>
          <div className="settings-card-actions">
            <Button variant="secondary" onClick={() => void handleExportBackup()}>
              Export backup
            </Button>
            <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
              Import backup
            </Button>
          </div>
          <p className="settings-card-text">
            Importing replaces everything currently on this device with the backup's contents.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            hidden
            aria-label="Import backup file"
            onChange={(event) => void handleImportFile(event)}
          />
        </Card>
      </Section>

      <Section title="Account">
        <Card>
          {session ? (
            <>
              <p className="settings-card-text">
                Signed in as <strong>{session.user.email ?? "your account"}</strong>. Your
                session stays on this device, so you stay signed in offline.
              </p>
              <div className="settings-card-actions">
                <Button variant="secondary" onClick={() => void signOut()}>
                  Sign out
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="settings-card-text">
                Not signed in. Sign in to back your profile and logs up to your account.
                Everything also works on this device without signing in.
              </p>
              <div className="settings-card-actions">
                <Button variant="secondary" onClick={() => navigate("/signin")}>
                  Sign in
                </Button>
              </div>
            </>
          )}
        </Card>
      </Section>

      <Section title="About">
        <Card>
          <p className="settings-card-text">
            Mileage Tracker logs your work driving from odometer readings — no GPS — and
            builds claim reports in the same layout as your spreadsheet.
          </p>
          <p className="settings-card-text">
            Your logs live on this device first, so logging works with no signal; when
            you're signed in they also back up to your account.
          </p>
          <ListRow
            title="Replay the tour"
            subtitle="The three-card intro, again"
            chevron
            onClick={() => setShowTour(true)}
          />
        </Card>
      </Section>

      <BottomSheet
        open={sheet !== null}
        onClose={() => setSheet(null)}
        title={
          sheet?.kind === "home"
            ? "Home"
            : sheet?.kind === "office"
              ? "Office"
              : sheet?.kind === "place"
                ? sheet.place.name
                : undefined
        }
      >
        {sheet?.kind === "home" ? (
          <div className="settings-sheet">
            <TextField
              id="sheet-home-address"
              label="Home address (full)"
              autoComplete="street-address"
              value={sheetForm.home_address}
              error={sheetErrors.home_address}
              onChange={(event) => setSheetField("home_address", event.target.value)}
            />
            <TextField
              id="sheet-home-office-km"
              label="Distance Home – Office (km)"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={sheetForm.home_office_km}
              error={sheetErrors.home_office_km}
              onChange={(event) => setSheetField("home_office_km", event.target.value)}
            />
            <Button loading={saving} onClick={() => void handleSheetSave()}>
              Save
            </Button>
          </div>
        ) : null}
        {sheet?.kind === "office" ? (
          <div className="settings-sheet">
            <TextField
              id="sheet-office-name"
              label="Office name"
              value={sheetForm.office_name}
              error={sheetErrors.office_name}
              onChange={(event) => setSheetField("office_name", event.target.value)}
            />
            <TextField
              id="sheet-office-address"
              label="Office address"
              value={sheetForm.office_address}
              error={sheetErrors.office_address}
              onChange={(event) => setSheetField("office_address", event.target.value)}
            />
            <Button loading={saving} onClick={() => void handleSheetSave()}>
              Save
            </Button>
          </div>
        ) : null}
        {sheet?.kind === "place" ? (
          <div className="settings-sheet">
            <TextField
              id="sheet-place-name"
              label="Place name"
              value={placeForm.name}
              onChange={(event) =>
                setPlaceForm((current) => ({ ...current, name: event.target.value }))
              }
            />
            <TextField
              id="sheet-place-address"
              label="Full address"
              value={placeForm.address}
              onChange={(event) =>
                setPlaceForm((current) => ({ ...current, address: event.target.value }))
              }
            />
            {placeError ? (
              <div className="form-error" role="alert">
                {placeError}
              </div>
            ) : null}
            <Button loading={saving} onClick={() => void handleSheetSave()}>
              Save
            </Button>
            <Button
              variant="text"
              disabled={saving}
              onClick={() => void handleArchivePlace()}
            >
              Remove from saved places
            </Button>
          </div>
        ) : null}
      </BottomSheet>

      <ConfirmDialog
        open={importCandidate !== null}
        title="Replace your data with this backup?"
        message={
          importCandidate
            ? `This backup (exported ${new Date(importCandidate.exported_at).toLocaleString()}) holds ${importCandidate.data.days.length} days and ${importCandidate.data.legs.length} legs. Importing it replaces all data on this device and queues the restored data to sync.`
            : ""
        }
        confirmLabel="Replace my data"
        destructive
        onConfirm={() => void handleConfirmImport()}
        onCancel={() => setImportCandidate(null)}
      />

      {toast ? <SavedToast message={toast} /> : null}

      {showTour ? <Tour onClose={() => setShowTour(false)} /> : null}
    </main>
  );
}
