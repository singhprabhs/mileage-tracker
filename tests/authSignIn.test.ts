import { describe, expect, it, vi } from "vitest";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { getCurrentSession, redeemPastedSignIn } from "../src/features/auth/authService";
import { parseSignInInput } from "../src/features/auth/signInInput";

const VERIFY_URL =
  "https://qzvjzehxviganvayuoke.supabase.co/auth/v1/verify?token=pkce_hash_abc123" +
  "&type=magiclink&redirect_to=https://singhprabhs.github.io/mileage-tracker/";

describe("parseSignInInput", () => {
  it("reads the token from a Supabase magic-link verify URL", () => {
    expect(parseSignInInput(VERIFY_URL)).toEqual({
      kind: "token_hash",
      tokenHash: "pkce_hash_abc123",
    });
  });

  it("reads a token_hash parameter by that name", () => {
    expect(
      parseSignInInput("https://example.supabase.co/auth/v1/verify?token_hash=hash-42&type=email"),
    ).toEqual({ kind: "token_hash", tokenHash: "hash-42" });
  });

  it("reads a PKCE code from the post-redirect app URL query", () => {
    expect(parseSignInInput("https://singhprabhs.github.io/mileage-tracker/?code=code-99")).toEqual(
      { kind: "code", code: "code-99" },
    );
  });

  it("reads a PKCE code carried in the hash fragment (hash routing)", () => {
    expect(
      parseSignInInput("https://singhprabhs.github.io/mileage-tracker/#/?code=frag-code"),
    ).toEqual({ kind: "code", code: "frag-code" });
  });

  it("finds the link inside sloppily pasted surrounding text", () => {
    const pasted = `Hi! Your sign-in link is here: ${VERIFY_URL} — it expires soon. Don't share it.)`;
    expect(parseSignInInput(pasted)).toEqual({
      kind: "token_hash",
      tokenHash: "pkce_hash_abc123",
    });
  });

  it("accepts a bare 6-digit code, with or without spaces", () => {
    expect(parseSignInInput("123456")).toEqual({ kind: "otp", code: "123456" });
    expect(parseSignInInput(" 123 456 ")).toEqual({ kind: "otp", code: "123456" });
  });

  it("rejects garbage, empty input, and URLs without sign-in params", () => {
    expect(parseSignInInput("")).toEqual({ kind: "invalid" });
    expect(parseSignInInput("hello there")).toEqual({ kind: "invalid" });
    expect(parseSignInInput("https://example.com/some/page?x=1")).toEqual({ kind: "invalid" });
    expect(parseSignInInput("12345")).toEqual({ kind: "invalid" });
  });
});

const FAKE_SESSION = { access_token: "access-1", refresh_token: "refresh-1" } as unknown as Session;

type VerifyBehaviour =
  | { kind: "success" }
  | { kind: "error"; error: { message: string; code?: string; status?: number; name?: string } }
  | { kind: "throw"; error: unknown };

/**
 * A minimal fake Supabase client whose auth methods remember the session
 * on success, the way the real client persists it to storage — so tests
 * can assert getCurrentSession() sees it afterwards.
 */
function mockClient(behaviour: VerifyBehaviour) {
  let stored: Session | null = null;
  const succeed = () => {
    stored = FAKE_SESSION;
    return { data: { user: null, session: FAKE_SESSION }, error: null };
  };
  const behave = () => {
    if (behaviour.kind === "success") return succeed();
    if (behaviour.kind === "throw") throw behaviour.error;
    return { data: { user: null, session: null }, error: behaviour.error };
  };
  const client = {
    auth: {
      verifyOtp: vi.fn(behave),
      exchangeCodeForSession: vi.fn(behave),
      getSession: vi.fn(async () => ({ data: { session: stored } })),
    },
  };
  return { client: client as unknown as SupabaseClient, auth: client.auth };
}

describe("redeemPastedSignIn", () => {
  it("redeems a pasted magic link via verifyOtp token_hash and stores the session", async () => {
    const { client, auth } = mockClient({ kind: "success" });
    const result = await redeemPastedSignIn(client, "user@example.com", VERIFY_URL);
    expect(result.ok).toBe(true);
    expect(auth.verifyOtp).toHaveBeenCalledWith({
      token_hash: "pkce_hash_abc123",
      type: "magiclink",
    });
    expect(result.session).toBe(FAKE_SESSION);
    expect(await getCurrentSession(client)).toBe(FAKE_SESSION);
  });

  it("redeems a pasted PKCE code via exchangeCodeForSession", async () => {
    const { client, auth } = mockClient({ kind: "success" });
    const result = await redeemPastedSignIn(
      client,
      "user@example.com",
      "https://singhprabhs.github.io/mileage-tracker/?code=the-code",
    );
    expect(result.ok).toBe(true);
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("the-code");
    expect(auth.verifyOtp).not.toHaveBeenCalled();
    expect(await getCurrentSession(client)).toBe(FAKE_SESSION);
  });

  it("redeems a bare 6-digit code against the entered email", async () => {
    const { client, auth } = mockClient({ kind: "success" });
    const result = await redeemPastedSignIn(client, "user@example.com", "123456");
    expect(result.ok).toBe(true);
    expect(auth.verifyOtp).toHaveBeenCalledWith({
      email: "user@example.com",
      token: "123456",
      type: "magiclink",
    });
  });

  it("refuses a bare code when no email was entered, without calling Supabase", async () => {
    const { client, auth } = mockClient({ kind: "success" });
    const result = await redeemPastedSignIn(client, "", "123456");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/email/i);
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });

  it("rejects garbage input without calling Supabase", async () => {
    const { client, auth } = mockClient({ kind: "success" });
    const result = await redeemPastedSignIn(client, "user@example.com", "not a link at all");
    expect(result.ok).toBe(false);
    expect(auth.verifyOtp).not.toHaveBeenCalled();
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("explains an expired or already-used link in friendly words", async () => {
    const { client } = mockClient({
      kind: "error",
      error: { message: "Email link has expired", code: "otp_expired", status: 403 },
    });
    const result = await redeemPastedSignIn(client, "user@example.com", VERIFY_URL);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/expired or was already used/);
    expect(result.error).toMatch(/without opening it first/);
  });

  it("turns a network failure into a check-your-connection message", async () => {
    const { client } = mockClient({ kind: "throw", error: new TypeError("Failed to fetch") });
    const result = await redeemPastedSignIn(client, "user@example.com", VERIFY_URL);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/check your connection/);
  });
});
