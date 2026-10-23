import type { Session, SupabaseClient } from "@supabase/supabase-js";

export interface AuthActionResult {
  ok: boolean;
  error: string | null;
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

export async function signOut(client: SupabaseClient): Promise<AuthActionResult> {
  const { error } = await client.auth.signOut();
  if (error) return { ok: false, error: error.message };
  return { ok: true, error: null };
}
