import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { SUPABASE_NOT_CONFIGURED_MESSAGE, supabase } from "../../data";
import { useAuth } from "./authContext";
import { signInWithMagicLink } from "./authService";

export default function SignInPage() {
  const { session, configured } = useAuth();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  if (session) return <Navigate to="/" replace />;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setSending(true);
    setStatus(null);
    const result = await signInWithMagicLink(supabase, email.trim());
    setSending(false);
    setStatus(
      result.ok
        ? `Magic link sent to ${email.trim()}. Open it on this device to finish signing in.`
        : `Could not send the magic link: ${result.error ?? "unknown error"}`,
    );
  }

  return (
    <main className="app-shell">
      <p>
        <Link to="/">← Back</Link>
      </p>
      <h1>Sign in</h1>
      <p>
        Sign in with the email you use for mileage claims. We email you a magic link — no password
        to remember. Your logs are saved on this device first, so signing in is only needed to back
        them up.
      </p>
      {!configured ? (
        <p className="notice" role="status">
          {SUPABASE_NOT_CONFIGURED_MESSAGE}
        </p>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="signin-email">Email address</label>
            <input
              id="signin-email"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <button className="button button-primary" type="submit" disabled={sending}>
            {sending ? "Sending…" : "Email me a magic link"}
          </button>
          {status ? (
            <p className="notice" role="status">
              {status}
            </p>
          ) : null}
        </form>
      )}
    </main>
  );
}
