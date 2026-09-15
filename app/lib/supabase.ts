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

/**
 * `fetch` used for every request this client makes, with `keepalive: true`
 * set unconditionally.
 *
 * Without this, a write that is in flight (or about to be sent — e.g. the
 * debounced cloud push) is aborted outright when the tab that started it
 * is closed: the browser tears down the page's network requests along
 * with the page. `keepalive` is the browser's documented mechanism for
 * exactly this case (the same flag `navigator.sendBeacon` uses under the
 * hood) — it lets the request continue after the initiating document is
 * gone, instead of being cut off.
 *
 * Trade-off: the browser caps the combined body of in-flight keepalive
 * requests at ~64KB. GET requests (cloud pulls) carry no body and are
 * unaffected. Writes (the debounced full-state push) stay well under that
 * for a single business's data at realistic sizes; if a push ever did
 * exceed it, the request fails fast and is handled like any other network
 * failure (surfaced via cloudSyncState "offline") — no worse than before
 * this change.
 */
const keepaliveFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, keepalive: true });

/** Shared browser client, or null when running without Supabase. */
export function getSupabaseBrowserClient(): SupabaseClient | null {
  const key = getPublicKey();
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !key) return null;
  if (!browserClient) {
    browserClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      key,
      { global: { fetch: keepaliveFetch } }
    );
  }
  return browserClient;
}