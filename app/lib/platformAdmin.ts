// ============================================================
// Platform-admin (SaaS operator) client helpers.
//
// The authoritative check is ALWAYS the database: the
// `current_is_platform_admin()` RPC (migration 007) evaluates
// profiles.is_platform_admin under RLS. Nothing here trusts the UI,
// localStorage, or the business role ("admin" in business_members is a
// per-business role, never a platform role).
//
// Every call degrades gracefully to `false` when there is no session
// or migration 007 has not been applied yet.
// ============================================================

import { getSupabaseBrowserClient } from "./supabase";
import {
  clearTenantLocalData,
  setActiveBusinessId,
  setCloudOwnerTag,
} from "./cloudSync";

/** LocalStorage marker: an admin is currently VIEWING a business workspace. */
const ADMIN_VIEW_KEY = "budgeting-dashboard-v2-admin-viewing";
/** LocalStorage: the admin's own active business to restore on exit. */
const ADMIN_PREV_KEY = "budgeting-dashboard-v2-admin-prev-business";

export interface AdminViewing {
  businessId: string;
  businessName: string;
}

export function setAdminViewing(v: AdminViewing): void {
  try {
    window.localStorage.setItem(ADMIN_VIEW_KEY, JSON.stringify(v));
  } catch {
    /* private mode — viewing banner is session-only */
  }
}

export function getAdminViewing(): AdminViewing | null {
  try {
    const raw = window.localStorage.getItem(ADMIN_VIEW_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AdminViewing>;
    return parsed.businessId
      ? { businessId: parsed.businessId, businessName: parsed.businessName ?? "" }
      : null;
  } catch {
    return null;
  }
}

/** Remove the viewing marker; returns the previous business id (may be null). */
export function clearAdminViewing(): string | null {
  let previous: string | null = null;
  try {
    previous = window.localStorage.getItem(ADMIN_PREV_KEY);
    window.localStorage.removeItem(ADMIN_VIEW_KEY);
    window.localStorage.removeItem(ADMIN_PREV_KEY);
  } catch {
    /* ignore */
  }
  return previous;
}

/**
 * Enter a business workspace as a platform admin. Explicit by design:
 * the caller confirms, the marker is written, and a full reload lets
 * the dashboard provider bootstrap the viewed business cleanly.
 * The database keeps this read-only (no write policies in migration 007).
 */
export function enterBusinessAsAdmin(
  businessId: string,
  businessName: string,
  currentActiveId: string | null
): void {
  try {
    if (currentActiveId && currentActiveId !== businessId) {
      window.localStorage.setItem(ADMIN_PREV_KEY, currentActiveId);
    }
  } catch {
    /* ignore */
  }
  setAdminViewing({ businessId, businessName });
  // Deliberate full reload (NOT SPA navigation): the DashboardProvider must
  // remount and re-bootstrap so no state from the previous tenant context
  // survives in memory. This is part of the tenant-isolation design. The
  // target is the workspace surface itself — the DB-backed bootstrap and
  // the ContextIndicator make the "Platform Admin — Viewing" POV explicit.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign("/dashboard");
}

/** Exit admin viewing: restore the admin's prior business and reload.
 *  The viewed tenant's cached snapshot must never survive into the
 *  admin's own context — same isolation rule as business switching. */
export function exitAdminViewing(): void {
  const previous = clearAdminViewing();
  clearTenantLocalData();
  setCloudOwnerTag(null);
  if (previous) {
    try {
      setActiveBusinessId(previous);
    } catch {
      /* ignore */
    }
  }
  // Full reload for the same isolation reason as enterBusinessAsAdmin —
  // a clean provider remount guarantees the restored context bootstraps
  // from the database, never from the viewed tenant's cached state.
  // The admin's own POV is the platform-admin area.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign("/admin");
}

// Ask the DATABASE whether the signed-in user is a platform admin.
// 1) SECURITY DEFINER RPC `current_is_platform_admin()` (migration 007)
// 2) Fallback: own profiles row
// 3) Otherwise false — never guessed.
export async function checkPlatformAdmin(): Promise<boolean> {
  const client = getSupabaseBrowserClient();
  if (!client) return false;
  try {
    const { data } = await client.auth.getSession();
    if (!data.session) return false;

    const rpc = await client.rpc("current_is_platform_admin");
    if (!rpc.error && typeof rpc.data === "boolean") return rpc.data;

    const uid = data.session.user.id;
    const q = await client
      .from("profiles")
      .select("is_platform_admin")
      .eq("id", uid)
      .maybeSingle();
    const flag = (q.data as { is_platform_admin?: unknown } | null)?.is_platform_admin;
    if (!q.error && typeof flag === "boolean") return flag;

    return false;
  } catch {
    return false;
  }
}