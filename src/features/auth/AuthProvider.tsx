import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "../../data";
import { AuthContext, type AuthContextValue } from "./authContext";
import {
  getCurrentSession,
  signOut as signOutRequest,
  subscribeToAuthChanges,
} from "./authService";

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void getCurrentSession(supabase).then((current) => {
      if (!cancelled) {
        setSession(current);
        setLoading(false);
      }
    });
    const unsubscribe = subscribeToAuthChanges(supabase, (next) => {
      setSession(next);
      setLoading(false);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      loading,
      configured: isSupabaseConfigured,
      signOut: async () => {
        if (supabase) await signOutRequest(supabase);
        setSession(null);
      },
    }),
    [session, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
