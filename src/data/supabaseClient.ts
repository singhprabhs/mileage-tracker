import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** True when both Supabase environment variables are set. */
export const isSupabaseConfigured = Boolean(url && anonKey);

/** Shown in the UI wherever a cloud feature needs Supabase configuration. */
export const SUPABASE_NOT_CONFIGURED_MESSAGE =
  "Cloud sign-in is not set up yet: this device has no Supabase URL and anon key configured. " +
  "Everything you save still works on this device. Add VITE_SUPABASE_URL and " +
  "VITE_SUPABASE_ANON_KEY to the app's .env file to enable sign-in.";

/**
 * The Supabase client, or null when the app has not been configured with
 * the environment variables yet. Local (Dexie) features must keep working
 * in either case; only auth and the best-effort profile backup need this.
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url as string, anonKey as string)
  : null;
