import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { SUPABASE_NOT_CONFIGURED_MESSAGE, supabase } from "../../data";
import { Banner, Button, Card, TextField, type BannerKind } from "../../components";
import { BackLink } from "../day/chrome";
import { useAuth } from "./authContext";
import { redeemPastedSignIn, signInWithMagicLink } from "./authService";

interface StatusState {
  text: string;
  kind: BannerKind;
}

/**
 * Plain-language mapping for the magic-link send result — the
 * service returns the backend's raw message, which must never
 * reach the screen (audit F-03). The paste path's errors are
 * already friendly (see redeemPastedSignIn).
 */
function plainSendError(raw: string | null): string {
  const message = raw ?? "";
  if (/rate limit|over_email_send|too many/i.test(message)) {
    return "Too many sign-in emails just now — only a couple can be sent per hour. Wait a little, then try again.";
  }
  if (/invalid.*email|email.*invalid/i.test(message)) {
    return "That email address doesn't look right — check it and try again.";
  }
  return "Couldn't send the magic link. Check your connection and try again.";
}

/**
 * Sign in (UI Polish Phase 4 restyle): design-system fields,
 * buttons and banners; the consistent ≥48px BackLink; statuses
 * as banners instead of bare notices. Every behaviour is the
 * shipped one — email a magic link, and the Home Screen
 * paste-the-link / 6-digit-code redeem with its exact steps copy —
 * only the presentation and the send error mapping changed.
 */
export default function SignInPage() {
  const { session, configured } = useAuth();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<StatusState | null>(null);
  const [sending, setSending] = useState(false);
  const [pasted, setPasted] = useState("");
  const [pasteStatus, setPasteStatus] = useState<StatusState | null>(null);
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
        ? {
            kind: "info",
            text:
              `Magic link sent to ${email.trim()}. In a browser, just open the link. ` +
              `In the Home Screen app, don't tap it — copy it and paste it below instead.`,
          }
        : { kind: "warning", text: plainSendError(result.error) },
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
        ? { kind: "info", text: "Signed in — taking you to the app…" }
        : {
            kind: "warning",
            text: result.error ?? "Something went wrong while signing you in.",
          },
    );
    if (result.ok) setPasted("");
  }

  return (
    <main className="app-shell signin-shell">
      <BackLink to="/" />
      <h1 className="screen-title">Sign in</h1>
      <p className="screen-date">
        Sign in with the email you use for mileage claims. We email you a magic link — no
        password to remember. Your logs are saved on this device first, so signing in is
        only needed to back them up.
      </p>
      {!configured ? (
        <Banner kind="info">{SUPABASE_NOT_CONFIGURED_MESSAGE}</Banner>
      ) : (
        <>
          <form onSubmit={handleSubmit}>
            <TextField
              id="signin-email"
              label="Email address"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <Button type="submit" loading={sending}>
              Email me a magic link
            </Button>
            {status ? <Banner kind={status.kind}>{status.text}</Banner> : null}
          </form>

          <section aria-labelledby="paste-signin-heading" className="signin-paste">
            <Card>
              <h2 id="paste-signin-heading" className="signin-paste-title">
                Signing in from the Home Screen app?
              </h2>
              <p className="settings-card-text">
                On iPhone, tapping the emailed link opens it in your browser — and the Home
                Screen app can't see a sign-in that happened there. Paste the link here
                instead, so the sign-in happens inside this app:
              </p>
              <ol className="signin-steps">
                <li>Request the magic link above, then open the email on this phone.</li>
                <li>
                  <strong>Don't tap the link</strong> — long-press it and choose{" "}
                  <strong>Copy</strong>. (Tapping it uses it up in the browser; the link
                  works only once.)
                </li>
                <li>Come back here and paste it below.</li>
              </ol>
              <form onSubmit={handleRedeem}>
                <TextField
                  id="signin-paste"
                  label="Paste the sign-in link — or type the 6-digit code"
                  type="text"
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="Paste the link from the email"
                  value={pasted}
                  onChange={(event) => setPasted(event.target.value)}
                />
                <Button
                  type="submit"
                  variant="secondary"
                  loading={redeeming}
                  disabled={pasted.trim() === ""}
                >
                  Sign in with this link / code
                </Button>
                {pasteStatus ? (
                  <Banner kind={pasteStatus.kind}>{pasteStatus.text}</Banner>
                ) : null}
              </form>
            </Card>
          </section>
        </>
      )}
    </main>
  );
}
