import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { SUPABASE_NOT_CONFIGURED_MESSAGE, supabase } from "../../data";
import { useAuth } from "./authContext";
import { redeemPastedSignIn, signInWithMagicLink } from "./authService";

export default function SignInPage() {
  const { session, configured } = useAuth();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [pasted, setPasted] = useState("");
  const [pasteStatus, setPasteStatus] = useState<string | null>(null);
  const [redeeming, setRedeeming] = useState(false);

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
        ? `Magic link sent to ${email.trim()}. In a browser, just open the link. ` +
            `In the Home Screen app, don't tap it — copy it and paste it below instead.`
        : `Could not send the magic link: ${result.error ?? "unknown error"}`,
    );
  }

  async function handleRedeem(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setRedeeming(true);
    setPasteStatus(null);
    const result = await redeemPastedSignIn(supabase, email.trim(), pasted);
    setRedeeming(false);
    // On success the auth provider picks up the new session and this page
    // redirects on its own; the status covers the brief moment before that.
    setPasteStatus(
      result.ok
        ? "Signed in — taking you to the app…"
        : (result.error ?? "Something went wrong while signing you in."),
    );
    if (result.ok) setPasted("");
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
        <>
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

          <section aria-labelledby="paste-signin-heading">
            <h2 id="paste-signin-heading">Signing in from the Home Screen app?</h2>
            <p>
              On iPhone, tapping the emailed link opens it in your browser — and the Home Screen
              app can't see a sign-in that happened there. Paste the link here instead, so the
              sign-in happens inside this app:
            </p>
            <ol>
              <li>Request the magic link above, then open the email on this phone.</li>
              <li>
                <strong>Don't tap the link</strong> — long-press it and choose <strong>Copy</strong>
                . (Tapping it uses it up in the browser; the link works only once.)
              </li>
              <li>Come back here and paste it below.</li>
            </ol>
            <form onSubmit={handleRedeem}>
              <div className="field">
                <label htmlFor="signin-paste">Paste the sign-in link — or type the 6-digit code</label>
                <input
                  id="signin-paste"
                  type="text"
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="Paste the link from the email"
                  value={pasted}
                  onChange={(event) => setPasted(event.target.value)}
                />
              </div>
              <button
                className="button"
                type="submit"
                disabled={redeeming || pasted.trim() === ""}
              >
                {redeeming ? "Signing in…" : "Sign in with this link / code"}
              </button>
              {pasteStatus ? (
                <p className="notice" role="status">
                  {pasteStatus}
                </p>
              ) : null}
            </form>
          </section>
        </>
      )}
    </main>
  );
}
