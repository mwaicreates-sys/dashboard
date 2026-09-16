"use client";

/**
 * Cloud account card (Profile).
 *
 * The single entry point for the multi-tenant SaaS layer. Renders nothing
 * unless Supabase is configured via env vars — local-only deployments are
 * completely unaffected. Handles:
 *   • sign in / sign up (Supabase email auth)
 *   • active business (workspace) display + switching
 *   • cloud sync status
 *   • sign out
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import {
  fetchBusinessesForUser,
  setActiveBusinessId,
  clearActiveBusinessId,
  clearTenantLocalData,
  setCloudOwnerTag,
  type BusinessInfo,
} from "@/lib/cloudSync";
import { useDashboardData } from "@/lib/dashboardData";
import { clearAdminViewing } from "@/lib/platformAdmin";
import { routeAfterSignIn } from "@/lib/authRouting";

type SyncCopy = { dot: string; text: string };

const SYNC_COPY: Record<string, SyncCopy> = {
  idle: { dot: "bg-muted-text/60", text: "Sign in to sync this business to the cloud." },
  syncing: { dot: "animate-pulse bg-blue", text: "Updating your business workspace…" },
  synced: { dot: "bg-green", text: "All changes saved to your business workspace." },
  offline: { dot: "bg-orange", text: "Cloud save is not confirmed. Reconnect and retry." },
  error: { dot: "bg-orange", text: "Cloud save failed. Keep this workspace open and retry." },
  conflict: { dot: "bg-red-500", text: "This workspace changed elsewhere. Reload the page to continue." },
};

export function CloudAccountCard() {
  const { activeBusiness, cloudSyncState, flushCloudChanges } = useDashboardData();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [businesses, setBusinesses] = useState<BusinessInfo[]>([]);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    let cancelled = false;
    (async () => {
      const client = getSupabaseBrowserClient();
      const auth = await client?.auth.getUser();
      if (cancelled) return;
      setUserEmail(auth?.data?.user?.email ?? null);
      if (auth?.data?.user) {
        const list = await fetchBusinessesForUser();
        if (!cancelled && list) setBusinesses(list);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cloudSyncState]);

  if (!isSupabaseConfigured()) return null;

  const sync = SYNC_COPY[cloudSyncState] ?? SYNC_COPY.idle;

  const submit = async () => {
    const client = getSupabaseBrowserClient();
    if (!client || busy) return;
    if (!email.trim() || password.length < 6) {
      setMessage("Enter an email and a password of at least 6 characters.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      // Sign-in only. Account creation happens exclusively through the
      // platform-admin provisioning flow (email + access code on /login);
      // this card never signs users up.
      const { error } = await client.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        setMessage(error.message);
      } else {
        // Re-enter through the DB-decided role router: platform admins
        // → /admin, business users → workspace or the selector.
        await routeAfterSignIn();
        return;
      }
    } catch {
      setMessage("Could not reach the authentication service.");
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    try { await flushCloudChanges(); } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed. Please retry.");
      return;
    }
    const client = getSupabaseBrowserClient();
    const result = await client?.auth.signOut();
    if (result?.error) { setMessage(result.error.message); return; }
    // Tenant isolation: this business's cached data must never remain on
    // the device for the next visitor/session. Storage falls back to the
    // designed starter dataset after the wipe.
    clearTenantLocalData();
    setCloudOwnerTag(null);
    clearActiveBusinessId();
    clearAdminViewing();
    // Land on the public login page — a signed-out visitor can no longer
    // reach any protected route (proxy.ts enforces the rest).
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/login");
  };

  const switchBusiness = async (id: string) => {
    if (id === activeBusiness?.id) return;
    try { await flushCloudChanges(); } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed. Please retry.");
      return;
    }
    setActiveBusinessId(id);
    // Wipe the previous business's cached snapshot BEFORE the reload so no
    // foreign data is ever rendered in — or pushed into — the new context.
    // The cloud bootstrap then imports the target business's cloud state,
    // or initializes it from the starter dataset when it is new.
    clearTenantLocalData();
    setCloudOwnerTag(null);
    window.location.reload();
  };

  const openWorkspaceSelector = async () => {
    try { await flushCloudChanges(); } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed. Please retry.");
      return;
    }
    // A fresh provider must resolve the next tenant after selection.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/workspaces");
  };

  return (
    <section className="rounded-2xl border border-border bg-surface p-4 md:p-5">
      <h2 className="text-sm font-semibold text-primary-text">Cloud account</h2>

      {userEmail ? (
        <>
          <p className="mt-0.5 text-[11px] text-muted-text">
            Signed in as <span className="font-medium text-secondary-text">{userEmail}</span>
          </p>

          <div className="mt-3 rounded-xl border border-border bg-card px-3.5 py-3">
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted-text">
              Workspace
            </span>
            {businesses.length > 1 ? (
              <select
                value={activeBusiness?.id ?? ""}
                onChange={(e) => switchBusiness(e.target.value)}
                aria-label="Active business"
                className="mt-1 h-9 w-full rounded-lg border border-border bg-surface px-2 text-sm font-medium text-primary-text outline-none focus-visible:ring-2 focus-visible:ring-blue/60"
              >
                {businesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="mt-0.5 block truncate text-sm font-medium text-primary-text">
                {activeBusiness?.name ?? "—"}
              </span>
            )}
          </div>

          <Link
            href="/workspaces"
            onClick={(event) => { event.preventDefault(); void openWorkspaceSelector(); }}
            className="mt-2 block text-center text-[10px] font-medium text-muted-text transition-colors hover:text-primary-text"
          >
            Open workspace selector
          </Link>

          <p
            role="status"
            aria-live="polite"
            className="mt-2 flex items-center gap-1.5 text-[10px] leading-relaxed text-muted-text"
          >
            <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${sync.dot}`} />
            {sync.text}
          </p>

          <button
            type="button"
            onClick={signOut}
            className="mt-3 h-9 w-full rounded-xl border border-border bg-card text-xs font-semibold text-secondary-text transition-colors hover:bg-light-border hover:text-primary-text focus-visible:ring-2 focus-visible:ring-blue/60"
          >
            Sign out
          </button>
        </>
      ) : (
        <>
          <p className="mt-0.5 text-[11px] text-muted-text">
            Sign in to keep this business synced across devices and teammates.
          </p>

          <div className="mt-3 space-y-2.5">
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-secondary-text">
                Email
              </span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@business.com"
                className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm text-primary-text outline-none transition-colors placeholder:text-muted-text focus-visible:ring-2 focus-visible:ring-blue/60"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-secondary-text">
                Password
              </span>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submit();
                }}
                placeholder="••••••••"
                className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm text-primary-text outline-none transition-colors placeholder:text-muted-text focus-visible:ring-2 focus-visible:ring-blue/60"
              />
            </label>
          </div>

          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy}
            className="mt-3 h-10 w-full rounded-xl bg-blue text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-blue/60 disabled:opacity-50"
          >
            {busy ? "Please wait…" : "Sign in"}
          </button>
        </>
      )}
      {message ? (
        <p role="alert" className="mt-2 text-[11px] font-medium text-secondary-text">
          {message}
        </p>
      ) : null}
    </section>
  );
}
