import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Backend: external Supabase project.
 * The publishable (anon) key is safe to ship in client code — set it via
 * VITE_SUPABASE_PUBLISHABLE_KEY, or paste it into PUBLISHABLE_KEY_FALLBACK below.
 */
export const SUPABASE_URL =
  (import.meta.env["VITE_SUPABASE_URL"] as string | undefined) ??
  "https://druggbmhwfqwomyjvpgc.supabase.co";

const PUBLISHABLE_KEY_FALLBACK = "sb_publishable_Pyl6efxrB4pZzKwzwI2YIw_PAc-i4ds";

export const SUPABASE_PUBLISHABLE_KEY =
  ((import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ??
    import.meta.env["VITE_SUPABASE_ANON_KEY"]) as string | undefined) || PUBLISHABLE_KEY_FALLBACK;

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storageKey: "sb-druggbmhwfqwomyjvpgc-auth-token",
      },
    })
  : null;
