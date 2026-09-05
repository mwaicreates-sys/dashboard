"use client";

// ============================================================
// Post-authentication routing (client-side, DB-decided).
//
// After a sign-in completes, the destination is derived from
// DATABASE state only:
//   1. current_is_platform_admin() RPC  → /admin
//   2. business_members → exactly one   → /dashboard
//   3. business_members → zero or many  → /workspaces (selector)
// No emails, no localStorage values, no URL parameters are
// consulted. Full-page navigation is deliberate: every context
// change gets a clean DashboardProvider remount (tenant-isolation
// design — the same rule as business switching).
// ============================================================

import { checkPlatformAdmin } from "./platformAdmin";
import { fetchBusinessesForUser } from "./cloudSync";

export async function routeAfterSignIn(): Promise<void> {
  // 1) Platform admins land in the platform-admin area — DB-decided.
  if (await checkPlatformAdmin()) {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/admin");
    return;
  }

  // 2/3) Business users: exactly one membership → straight in;
  // zero or several → the explicit workspace selector.
  const businesses = await fetchBusinessesForUser();
  if (businesses && businesses.length !== 1) {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/workspaces");
    return;
  }
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign("/dashboard");
}