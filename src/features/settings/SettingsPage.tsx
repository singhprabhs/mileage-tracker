import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  collectBackup,
  db,
  getLastBackupExportAt,
  getLocation,
  getProfile,
  importBackup,
  isBackupReminderDue,
  parseBackup,
  recordBackupExported,
  saveProfileWithLocations,
  serializeBackup,
  supabase,
  upsertProfileToSupabase,
  type BackupFile,
  type ProfileInput,
} from "../../data";
import { DEFAULT_HOME_OFFICE_KM } from "../../domain";
import { useAuth } from "../auth/authContext";
import { toLocalDateString } from "../day/dayService";
import { downloadBlob } from "../reports/share";

export const DEFAULT_OFFICE_NAME = "Canon";
export const DEFAULT_OFFICE_ADDRESS = "10851 Shellbridge Way, Richmond, BC";

interface FormState {
  name: string;
  tech_id: string;
  home_address: string;
  office_name: string;
  office_address: string;
  home_office_km: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  tech_id: "",
  home_address: "",
  office_name: DEFAULT_OFFICE_NAME,
  office_address: DEFAULT_OFFICE_ADDRESS,
  home_office_km: String(DEFAULT_HOME_OFFICE_KM),
};

export default function SettingsPage() {
  const { session, signOut } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [hasProfile, setHasProfile] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [lastExportAt, setLastExportAt] = useState<string | null>(null);
  const [importCandidate, setImportCandidate] = useState<BackupFile | null>(null);
  const [importBusy, setImportBusy] = useState(false);

  const loadForm = useCallback(async () => {
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
        office_name: office?.name ?? DEFAULT_OFFICE_NAME,
        office_address: office?.address ?? DEFAULT_OFFICE_ADDRESS,
        home_office_km: String(profile.home_office_km),
      });
    }
    setLastExportAt(await getLastBackupExportAt(db));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await loadForm();
      if (!cancelled) setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadForm]);

  function setField(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const homeOfficeKm = Number(form.home_office_km);
    if (!form.name.trim() || !form.tech_id.trim() || !form.home_address.trim()) {
      setError("Name, Tech ID and home address are all required.");
      return;
    }
    if (!form.office_name.trim() || !form.office_address.trim()) {
      setError("Office name and office address are required.");
      return;
    }
    if (!Number.isFinite(homeOfficeKm) || homeOfficeKm <= 0) {
      setError("Home to Office distance must be a number above 0.");
      return;
    }

    const input: ProfileInput = {
      name: form.name.trim(),
      tech_id: form.tech_id.trim(),
      home_address: form.home_address.trim(),
      home_office_km: homeOfficeKm,
      office_name: form.office_name.trim(),
      office_address: form.office_address.trim(),
    };

    setSaving(true);
    try {
      const sessionUserId = session?.user.id;
      const { profile } = await saveProfileWithLocations(db, input, sessionUserId);
      let message = "Saved on this device.";
      if (supabase && sessionUserId) {
        const backup = await upsertProfileToSupabase(supabase, profile, sessionUserId);
        message = backup.ok
          ? "Saved on this device and backed up to your account."
          : "Saved on this device. The account backup did not go through — your data is safe here and will back up when sync runs.";
      }
      setHasProfile(true);
      setNotice(message);
      if (!hasProfile) void navigate("/", { replace: true });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? `Could not save: ${caught.message}`
          : "Could not save the profile.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleExportBackup() {
    setError(null);
    setNotice(null);
    try {
      const backup = await collectBackup(db);
      const blob = new Blob([serializeBackup(backup)], { type: "application/json" });
      downloadBlob(blob, `mileage-tracker-backup-${toLocalDateString(new Date())}.json`);
      await recordBackupExported(db);
      setLastExportAt(await getLastBackupExportAt(db));
      setNotice("Backup downloaded. Keep the file somewhere safe, outside this app.");
    } catch (caught) {
      setError(
        caught instanceof Error ? `Could not export: ${caught.message}` : "Could not export.",
      );
    }
  }

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    setNotice(null);
    try {
      const backup = parseBackup(await file.text());
      setImportCandidate(backup);
    } catch (caught) {
      setImportCandidate(null);
      setError(
        caught instanceof Error
          ? caught.message
          : "That file could not be read as a backup.",
      );
    }
  }

  async function handleConfirmImport() {
    if (!importCandidate) return;
    setImportBusy(true);
    setError(null);
    try {
      await importBackup(db, importCandidate);
      setImportCandidate(null);
      await loadForm();
      setNotice(
        "Backup restored — this device now holds the backup's data, and it is queued to sync to your account.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? `Could not import: ${caught.message}`
          : "Could not import the backup.",
      );
    } finally {
      setImportBusy(false);
    }
  }

  if (!loaded) {
    return (
      <main className="app-shell">
        <p role="status">Loading…</p>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <p>
        <Link to="/">← Back</Link>
      </p>
      <h1>{hasProfile ? "Settings" : "Set up your profile"}</h1>
      {!hasProfile ? (
        <p>
          One short form before your first day. Your name and Tech ID appear on reports exactly as
          you type them here, and your home address is shown in full on reports.
        </p>
      ) : null}

      <form onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label htmlFor="settings-name">Name</label>
          <input
            id="settings-name"
            type="text"
            autoComplete="name"
            required
            value={form.name}
            onChange={(event) => setField("name", event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="settings-tech-id">Tech ID</label>
          <input
            id="settings-tech-id"
            type="text"
            required
            value={form.tech_id}
            onChange={(event) => setField("tech_id", event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="settings-home-address">Home address (full)</label>
          <input
            id="settings-home-address"
            type="text"
            autoComplete="street-address"
            required
            value={form.home_address}
            onChange={(event) => setField("home_address", event.target.value)}
          />
          <p className="field-hint">
            Type the full address. Address search arrives in a later update; typing it here works
            fully on its own.
          </p>
        </div>
        <div className="field">
          <label htmlFor="settings-office-name">Office name</label>
          <input
            id="settings-office-name"
            type="text"
            required
            value={form.office_name}
            onChange={(event) => setField("office_name", event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="settings-office-address">Office address</label>
          <input
            id="settings-office-address"
            type="text"
            required
            value={form.office_address}
            onChange={(event) => setField("office_address", event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="settings-home-office-km">Distance Home – Office (km)</label>
          <input
            id="settings-home-office-km"
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            required
            value={form.home_office_km}
            onChange={(event) => setField("home_office_km", event.target.value)}
          />
          <p className="field-hint">
            Home ↔ Office driving is commute and is not claimable. A Home ↔ customer leg is
            claimable for the distance beyond this.
          </p>
        </div>

        {error ? (
          <p className="notice notice-error" role="alert">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="notice" role="status">
            {notice}
          </p>
        ) : null}

        <button className="button button-primary" type="submit" disabled={saving}>
          {saving ? "Saving…" : hasProfile ? "Save settings" : "Save and continue"}
        </button>
      </form>

      <section className="account-section" aria-labelledby="backup-heading">
        <h2 id="backup-heading">Backup</h2>
        {isBackupReminderDue(lastExportAt) ? (
          <p className="notice notice-warning" role="status">
            {lastExportAt
              ? "It has been over a week since your last backup. Export a fresh one so a copy of your logs lives outside this app."
              : "You have not saved a backup yet. Export one so a copy of your logs lives outside this app."}
          </p>
        ) : null}
        <p>
          {lastExportAt
            ? `Last backup exported on ${new Date(lastExportAt).toLocaleDateString()}.`
            : "No backup exported yet."}{" "}
          The export is one JSON file with everything on this device: profile, places, days and
          legs.
        </p>
        <div className="button-row">
          <button className="button" type="button" onClick={() => void handleExportBackup()}>
            Export backup
          </button>
        </div>
        <div className="field">
          <label htmlFor="settings-import-backup">Import backup</label>
          <input
            id="settings-import-backup"
            type="file"
            accept="application/json,.json"
            onChange={(event) => void handleImportFile(event)}
          />
          <p className="field-hint">
            Importing replaces everything currently on this device with the backup's contents.
          </p>
        </div>
        {importCandidate ? (
          <div className="report-preview">
            <p>
              This backup (exported {new Date(importCandidate.exported_at).toLocaleString()})
              holds {importCandidate.data.days.length} days and{" "}
              {importCandidate.data.legs.length} legs. Importing it replaces all data on this
              device and queues the restored data to sync.
            </p>
            <div className="button-row">
              <button
                className="button button-danger"
                type="button"
                disabled={importBusy}
                onClick={() => void handleConfirmImport()}
              >
                {importBusy ? "Importing…" : "Replace my data with this backup"}
              </button>
              <button
                className="button"
                type="button"
                disabled={importBusy}
                onClick={() => setImportCandidate(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="account-section" aria-labelledby="account-heading">
        <h2 id="account-heading">Account</h2>
        {session ? (
          <>
            <p>
              Signed in as <strong>{session.user.email ?? "your account"}</strong>. Your session
              stays on this device, so you stay signed in offline.
            </p>
            <button className="button" type="button" onClick={() => void signOut()}>
              Sign out
            </button>
          </>
        ) : (
          <p>
            Not signed in. <Link to="/signin">Sign in</Link> to back your profile and logs up to
            your account. Everything also works on this device without signing in.
          </p>
        )}
      </section>
    </main>
  );
}
