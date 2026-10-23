/**
 * Parsing for the "paste your sign-in link" path on the sign-in screen.
 *
 * Why this exists: on iOS, a Home Screen web app runs in a storage sandbox
 * separate from Safari/Chrome. Tapping the emailed magic link opens it in
 * the default browser, so the session is created in the browser's storage
 * and the installed app can never see it. The workaround is to redeem the
 * same magic link INSIDE the app: the user copies the link from the email
 * (long-press → Copy, without opening it — the link is single-use) and
 * pastes it here, and the app exchanges it for a session in its own
 * storage via supabase.auth.verifyOtp / exchangeCodeForSession.
 *
 * The parser is deliberately forgiving: users paste sloppily — the link
 * may arrive wrapped in surrounding text, with trailing punctuation, or as
 * the post-redirect app URL. Anything we cannot positively identify is
 * "invalid" so the UI can ask for a fresh paste instead of guessing.
 */

export type ParsedSignInInput =
  /** The `token` / `token_hash` from a Supabase verify link → verifyOtp. */
  | { kind: "token_hash"; tokenHash: string }
  /** A PKCE `code` → exchangeCodeForSession. */
  | { kind: "code"; code: string }
  /** A bare 6-digit code from the email (only if the template shows one). */
  | { kind: "otp"; code: string }
  | { kind: "invalid" };

/** Pull an http(s) URL out of surrounding pasted text, if there is one. */
function extractUrl(text: string): URL | null {
  const match = text.match(/https?:\/\/[^\s<>"']+/);
  if (!match) return null;
  // Sentence punctuation glued to the end of a pasted link is not part of it.
  const candidate = match[0].replace(/[).,;]+$/, "");
  try {
    return new URL(candidate);
  } catch {
    return null;
  }
}

/**
 * Collect query-style params from a URL: its search string, plus its hash
 * fragment. The app uses hash routing, so a pasted post-redirect URL can
 * carry auth params in the fragment (`#/route?code=…` or `#code=…`).
 */
function collectParams(url: URL): URLSearchParams {
  const merged = new URLSearchParams();
  const absorb = (raw: string) => {
    if (!raw) return;
    for (const [key, value] of new URLSearchParams(raw)) {
      if (!merged.has(key)) merged.set(key, value);
    }
  };
  absorb(url.search.replace(/^\?/, ""));
  const fragment = url.hash.replace(/^#/, "");
  absorb(fragment.includes("?") ? fragment.slice(fragment.indexOf("?") + 1) : fragment);
  return merged;
}

export function parseSignInInput(raw: string): ParsedSignInInput {
  const text = raw.trim();
  if (!text) return { kind: "invalid" };

  // A bare 6-digit code (spaces between digits tolerated).
  const digitsOnly = text.replace(/\s+/g, "");
  if (/^\d{6}$/.test(digitsOnly)) return { kind: "otp", code: digitsOnly };

  const url = extractUrl(text);
  if (url) {
    const params = collectParams(url);
    const tokenHash = params.get("token_hash") ?? params.get("token");
    if (tokenHash) return { kind: "token_hash", tokenHash };
    const code = params.get("code");
    if (code) return { kind: "code", code };
    return { kind: "invalid" };
  }

  return { kind: "invalid" };
}
