import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { db, getLocation, getProfile, type LocationRecord, type ProfileRecord } from "../../data";
import { useAuth } from "../auth/authContext";

interface LoadedHome {
  profile: ProfileRecord;
  office: LocationRecord | undefined;
}

export default function HomePage() {
  const { session, configured } = useAuth();
  const [loaded, setLoaded] = useState<LoadedHome | null>(null);
  const [noProfile, setNoProfile] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const profile = await getProfile(db);
      if (cancelled) return;
      if (!profile) {
        setNoProfile(true);
        return;
      }
      const office = profile.office_location_id
        ? await getLocation(db, profile.office_location_id)
        : undefined;
      if (!cancelled) setLoaded({ profile, office });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (noProfile) return <Navigate to="/settings" replace />;

  if (!loaded) {
    return (
      <main className="app-shell">
        <p role="status">Loading…</p>
      </main>
    );
  }

  const { profile, office } = loaded;

  return (
    <main className="app-shell">
      <header className="home-header">
        <h1>Mileage Tracker</h1>
        <Link className="icon-link" to="/settings" aria-label="Settings">
          ⚙
        </Link>
      </header>
      <p className="profile-line">
        {profile.name} · Tech ID {profile.tech_id}
      </p>
      <dl className="summary-list">
        <div>
          <dt>Home</dt>
          <dd>{profile.home_address}</dd>
        </div>
        <div>
          <dt>Office</dt>
          <dd>{office ? `${office.name} — ${office.address}` : "Not set"}</dd>
        </div>
        <div>
          <dt>Distance Home – Office</dt>
          <dd>{profile.home_office_km} km (commute, not claimable)</dd>
        </div>
      </dl>
      <p className="notice" role="status">
        Your profile is saved on this device. Day logging arrives in the next phase — for now, check
        your details are right in Settings.
      </p>
      {session ? (
        <p>
          Signed in as <strong>{session.user.email ?? "your account"}</strong>.
        </p>
      ) : configured ? (
        <p>
          <Link to="/signin">Sign in</Link> to back up your profile and logs.
        </p>
      ) : (
        <p>Cloud sign-in is not set up on this device yet; your data is stored locally.</p>
      )}
    </main>
  );
}
