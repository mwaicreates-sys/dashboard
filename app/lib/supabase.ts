"use client";

/**
 * Supabase browser client (singleton).
 *
 * Returns null when Supabase is not configured — the application then
 * behaves exactly as before (local-only persistence) and never crashes.
 * Cloud sync activates purely through environment variables:
 *
 *   NEXT_PUBLIC_SUPABASE_URL=...
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
 *
 * ONLY the modern publishable key is accepted (never the legacy anon
 * JWT, never a service_role / sb_secret_... key).
 */

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

/** Resolve the public key: the modern publishable key only. */
function getPublicKey(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
}

/** True when the cloud deployment env vars are present. */
export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && getPublicKey());
}

/** Shared browser client, or null when running without Supabase. */
export function getSupabaseBrowserClient(): SupabaseClient | null {
  const key = getPublicKey();
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !key) return null;
  if (!browserClient) {
    browserClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      key
    );
  }
  return browserClient;
}