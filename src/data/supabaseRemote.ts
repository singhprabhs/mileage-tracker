import type { SupabaseClient } from "@supabase/supabase-js";
import type { RemoteRow, RemoteStore } from "./sync";
import type { SyncEntity } from "./types";

/** Sync entity name -> Supabase table name. */
const TABLES: Record<SyncEntity, string> = {
  profile: "profiles",
  location: "locations",
  day: "days",
  leg: "legs",
};

/**
 * The real RemoteStore: wraps the Supabase client. Upserts are keyed by
 * the client-generated UUID primary key (profiles by user_id), so sending
 * the same change twice can never create a duplicate row. Row level
 * security on the server restricts every query to the signed-in user.
 */
export function createSupabaseRemote(client: SupabaseClient): RemoteStore {
  return {
    async upsert(entity, payload) {
      const { error } = await client.from(TABLES[entity]).upsert(payload);
      if (error) throw new Error(error.message);
    },
    async fetchSince(entity, userId, since) {
      let query = client.from(TABLES[entity]).select("*").eq("user_id", userId);
      if (since) query = query.gte("updated_at", since);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []) as RemoteRow[];
    },
  };
}
