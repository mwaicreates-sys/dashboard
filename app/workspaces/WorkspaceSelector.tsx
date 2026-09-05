"use client";

// ============================================================
// /workspaces — the workspace (business) selector.
//
// Requirement: a user who belongs to several businesses is never
// assigned one arbitrarily — they explicitly choose which
// business they are entering. The list comes from the DATABASE
// (business_members → businesses, through RLS). The selection is
// persisted ONLY as device UI state; every subsequent read and
// write is re-authorized server-side (RLS), so the choice can
// never widen what the session may access.
// ============================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  fetchBusinessesForUser,
  setActiveBusinessId,
  clearActiveBusinessId,
  clearTenantLocalData,
  setCloudOwnerTag,
  type BusinessInfo,
} from "@/lib/cloudSync";
import { checkPlatformAdmin, clearAdminViewing } from "@/lib/platformAdmin";
import { getSupabaseBrowserClient } from "@/lib/supabase";

const ROLE_LABEL: Record<BusinessInfo["role"], string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  "platform-admin": "Platform Admin (read-only)",
};

export function WorkspaceSelector() {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [businesses, setBusinesses] = useState<BusinessInfo[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [list, admin] = await Promise.all([
        fetchBusinessesForUser(),
        checkPlatformAdmin(),
      ]);
      if (!alive) return;
      setIsAdmin(admin);
      if (list === null) {
        setState("error");
        return;
      }
      setBusinesses(list);
      setState("ready");
    })();
    return () => {
      alive = false;
    };
  }, []);

  const enter = (business: BusinessInfo) => {
    setActiveBusinessId(business.id);
    // Tenant-cache isolation (the same rule as business switching in
    // the Profile card): wipe any previous business's local snapshot
    // BEFORE the reload so no foreign data is ever rendered in — or
    // pushed into — the target context. The clean remount then
    // bootstraps this business's state from the cloud.
    clearTenantLocalData();
    setCloudOwnerTag(null);
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/dashboard");
  };

  const signOut = async () => {
    const client = getSupabaseBrowserClient();
    await client?.auth.signOut();
    // Tenant isolation: no cached business data may survive sign-out.
    clearTenantLocalData();
    setCloudOwnerTag(null);
    clearActiveBusinessId();
    clearAdminViewing();
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/login");
  };

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-surface px-4 py-10">
      <div className="mb-6 text-center">
        <p className="text-2xl font-semibold tracking-tight text-primary-text">
          Choose a workspace
        </p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-muted-text">
          Pick which business to enter. Access is verified on every request.
        </p>
        {isAdmin ? (
          <Link
            href="/admin"
            className="mt-3 inline-block rounded-lg border border-blue/40 px-3 py-1.5 text-[11px] font-semibold text-blue transition-colors hover:bg-blue/10"
          >
            Open Platform Admin
          </Link>
        ) : null}
      </div>

      {state === "loading" ? (
        <p className="rounded-2xl border border-border bg-card p-5 text-center text-xs text-muted-text">
          Loading your workspaces…
        </p>
      ) : null}

      {state === "error" ? (
        <div className="rounded-2xl border border-border bg-card p-5 text-center">
          <p className="text-xs font-medium text-primary-text">
            Could not load your workspaces.
          </p>
          <p className="mt-1 text-[11px] text-muted-text">
            Check your connection and try again.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-3 h-9 rounded-xl bg-blue px-4 text-xs font-semibold text-white transition-opacity hover:opacity-90"
          >
            Retry
          </button>
        </div>
      ) : null}

      {state === "ready" && businesses.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-5 text-center">
          <p className="text-sm font-semibold text-primary-text">
            No business access
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-text">
            Your account hasn't been assigned to a business yet. Please contact your platform administrator.
          </p>
          <button
            type="button"
            onClick={() => void signOut()}
            className="mt-3 h-9 w-full rounded-xl border border-border text-xs font-semibold text-secondary-text transition-colors hover:bg-light-border hover:text-primary-text"
          >
            Sign out
          </button>
        </div>
      ) : null}

      {state === "ready" && businesses.length > 0 ? (
        <div className="space-y-2.5">
          {businesses.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => enter(b)}
              className="w-full rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-blue/50 hover:bg-light-border focus-visible:ring-2 focus-visible:ring-blue/60"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-primary-text">
                    {b.name}
                  </p>
                  <p className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-muted-text">
                    Business Workspace
                    {b.slug ? ` · ${b.slug}` : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <span className="rounded-full bg-blue/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-blue">
                    {ROLE_LABEL[b.role] ?? b.role}
                  </span>
                  <p className="mt-1 text-[10px] font-medium text-secondary-text">
                    {b.currency}
                  </p>
                </div>
              </div>
            </button>
          ))}

          <button
            type="button"
            onClick={() => void signOut()}
            className="mt-1 h-9 w-full rounded-xl border border-border text-xs font-semibold text-secondary-text transition-colors hover:bg-light-border hover:text-primary-text"
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}