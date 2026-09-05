// ============================================================
// Server-side auth utilities (Server Components / Route Handlers).
//
// The Supabase session lives in cookies (managed by @supabase/ssr
// and refreshed by proxy.ts), so Server Components CAN evaluate
// identity. Everything read here — the platform-admin flag,
// business memberships — flows through Supabase RLS with the
// caller's own JWT. No client state, no localStorage, no emails.
// ============================================================

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BusinessInfo } from "./cloudSync";

/** Server Supabase client bound to the request's cookies (null when Supabase is not configured). */
export async function getSupabaseServerClient(): Promise<SupabaseClient | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options?: CookieOptions }>) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component render, where cookies are
          // read-only. proxy.ts already refreshes sessions per request.
        }
      },
    },
  });
}

export interface ServerUser {
  id: string;
  email: string | undefined;
}

/**
 * The authenticated user for the current request, or null.
 * getUser() validates the token with the Auth server — the embedded
 * cookie payload alone is never trusted for authorization.
 */
export async function getServerUser(): Promise<ServerUser | null> {
  const client = await getSupabaseServerClient();
  if (!client) return null;
  try {
    const { data } = await client.auth.getUser();
    if (!data.user) return null;
    return { id: data.user.id, email: data.user.email ?? undefined };
  } catch {
    return null;
  }
}

/**
 * Platform-admin status as decided by the DATABASE:
 * the SECURITY DEFINER RPC `current_is_platform_admin()` (migration 007)
 * evaluates profiles.is_platform_admin. Never a client flag, never an email.
 */
export async function getServerIsPlatformAdmin(): Promise<boolean> {
  const client = await getSupabaseServerClient();
  if (!client) return false;
  try {
    const { data, error } = await client.rpc("current_is_platform_admin");
    return !error && data === true;
  } catch {
    return false;
  }
}

/**
 * Businesses the signed-in user belongs to (business_members → businesses),
 * resolved server-side under RLS — the same authorization view the client
 * gets. Pass `userId` (from getServerUser) to skip the duplicate Auth-server
 * round-trip when the user was already resolved. Returns null when Supabase
 * is unavailable or the session is gone.
 */
export async function getServerMemberships(
  userId?: string
): Promise<BusinessInfo[] | null> {
  const client = await getSupabaseServerClient();
  if (!client) return null;
  try {
    let uid = userId;
    if (!uid) {
      const { data: auth } = await client.auth.getUser();
      if (!auth.user) return null;
      uid = auth.user.id;
    }
    const { data, error } = await client
      .from("business_members")
      .select("role, business:businesses ( id, name, slug, currency )")
      .eq("user_id", uid);
    if (error || !data) return null;
    return (data as Array<Record<string, unknown>>)
      .map((row) => {
        const b = row.business as Record<string, unknown> | null;
        return {
          id: String(b?.id ?? ""),
          name: String(b?.name ?? "Business"),
          slug: b?.slug ? String(b.slug) : null,
          currency: String(b?.currency ?? "USD"),
          role: (row.role as BusinessInfo["role"]) ?? "member",
        };
      })
      .filter((m) => m.id !== "");
  } catch {
    return null;
  }
}