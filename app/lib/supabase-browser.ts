"use client";

import { createClient } from "@supabase/supabase-js";
import { resolveBrowserAccountContext } from "./browser-account-context";

export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "https://tbbgwjmmaiclkhssimhf.supabase.co";

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRiYmd3am1tYWljbGtoc3NpbWhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3Njg5MzcsImV4cCI6MjA4NjM0NDkzN30.EIdR7FeqojB7hyLtyp8_ij75JN6AsIaE17jnCxUnqUA";

let browserClient: ReturnType<typeof createClient> | null = null;
const transientAuth = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };

export function getSupabaseBrowserClient() {
  // Client components can render on the server. Never share a persisted auth
  // client between server renders or inspect browser storage in that environment.
  if (typeof window === "undefined") {
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: transientAuth });
  }
  if (!browserClient) {
    let context: ReturnType<typeof resolveBrowserAccountContext> = null;
    try {
      context = resolveBrowserAccountContext(SUPABASE_URL, window.localStorage, window.sessionStorage);
    } catch { /* Storage getters may be unavailable; keep this client anonymous. */ }
    browserClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: context ? {
        storageKey: context.storageKey,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      } : transientAuth,
    });
  }
  return browserClient;
}
