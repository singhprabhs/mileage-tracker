import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { parseSignInInput } from "./signInInput";

export interface AuthActionResult {
  ok: boolean;
  error: string | null;
}

export interface RedeemSignInResult extends AuthActionResult {
  /** The session created in this app's own storage, on success. */
  session: Session | null;
}

/** The current persisted session, or null when signed out. */
export async function getCurrentSession(client: SupabaseClient): Promise<Session | null> {
  const { data } = await client.auth.getSession();
  return data.session;
}

/**
 * Subscribe to sign-in / sign-out changes. Supabase persists the session
 * (localStorage on web), so a reload — including an offline reload — keeps
 * the user signed in. Returns an unsubscribe function.
 */
export function subscribeToAuthChanges(
  client: SupabaseClient,
  onChange: (session: Session | null) => void,
): () => void {
  const { data } = client.auth.onAuthStateChange((_event, session) => {
    onChange(session);
  });
  return () => {
    data.subscription.unsubscribe();
  };
}

/** Send an email magic link. The link returns to this app's own URL. */
export async function signInWithMagicLink(
  client: SupabaseClient,
  email: string,
): Promise<AuthActionResult> {
  const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}`;
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo },
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, error: null };
}

const EXPIRED_LINK_MESSAGE =
  "That link has expired or was already used — request a fresh one above and paste it here " +
  "without opening it first (opening it uses it up in your browser).";
const NETWORK_MESSAGE =
  "Could not reach the sign-in server — check your connection and try again.";

interface AuthErrorLike {
  message?: string;
  code?: string;
  status?: number;
  name?: string;
}

function friendlyAuthError(caught: unknown): string {
  if (caught instanceof TypeError) return NETWORK_MESSAGE; // fetch could not run at all
  const error = (caught ?? {}) as AuthErrorLike;
  const message = typeof error.message === "string" ? error.message : "";
  if (
    error.code === "otp_expired" ||
    /expired|invalid.*token|token.*invalid|already.*used/i.test(message)
  ) {
    return EXPIRED_LINK_MESSAGE;
  }
  if (error.name === "AuthRetryableFetchError" || error.status === 0) {
    return NETWORK_MESSAGE;
  }
  return message || "Something went wrong while signing you in — please try again.";
}

/**
 * Redeem a magic link (or 6-digit code) that the user pasted into the app
 * instead of tapping it in their email. This is what makes sign-in work
 * from an iOS Home Screen app: the browser sandbox never sees this
 * session — verifyOtp / exchangeCodeForSession store it in THIS app's
 * storage. The emailed link is single-use, so it must be pasted before
 * (not after) being opened anywhere else.
 */
export async function redeemPastedSignIn(
  client: SupabaseClient,
  email: string,
  rawInput: string,
): Promise<RedeemSignInResult> {
  const parsed = parseSignInInput(rawInput);
  if (parsed.kind === "invalid") {
    return {
      ok: false,
      session: null,
      error:
        "That doesn't look like a sign-in link or a 6-digit code. Copy the link from the " +
        "email (long-press it and choose Copy) and paste the whole thing here.",
    };
  }
  if (parsed.kind === "otp" && !email.trim()) {
    return {
      ok: false,
      session: null,
      error: "Enter your email address above first — the code is matched against it.",
    };
  }

  try {
    const { data, error } =
      parsed.kind === "token_hash"
        ? await client.auth.verifyOtp({ token_hash: parsed.tokenHash, type: "magiclink" })
        : parsed.kind === "code"
          ? await client.auth.exchangeCodeForSession(parsed.code)
          : await client.auth.verifyOtp({
              email: email.trim(),
              token: parsed.code,
              type: "magiclink",
            });
    if (error) return { ok: false, session: null, error: friendlyAuthError(error) };
    if (!data.session) {
      return {
        ok: false,
        session: null,
        error: "The sign-in server did not return a session — request a fresh link and try again.",
      };
    }
    return { ok: true, session: data.session, error: null };
  } catch (caught) {
    // Network failures surface as thrown fetch errors on some paths.
    return { ok: false, session: null, error: friendlyAuthError(caught) || NETWORK_MESSAGE };
  }
}

export async function signOut(client: SupabaseClient): Promise<AuthActionResult> {
  const { error } = await client.auth.signOut();
  if (error) return { ok: false, error: error.message };
  return { ok: true, error: null };
}
