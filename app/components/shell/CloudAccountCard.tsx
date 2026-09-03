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

type SyncCopy = { dot: string; text: string };

const SYNC_COPY: Record<string, SyncCopy> = {
  idle: { dot: "bg-muted-text/60", text: "Sign in to sync this business to the cloud." },
  syncing: { dot: "animate-pulse bg-blue", text: "Updating your business workspace…" },
  synced: { dot: "bg-green", text: "All changes saved to your business workspace." },
  offline: { dot: "bg-orange", text: "Saved on this device — will sync when reconnected." },
  error: { dot: "bg-orange", text: "Cloud connection problem — data stays safe locally." },
};

export function CloudAccountCard() {
  const { activeBusiness, cloudSyncState } = useDashboardData();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
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
      if (mode === "signin") {
        const { error } = await client.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) {
          setMessage(error.message);
        } else {
          window.location.reload(); // re-run cloud bootstrap with the session
          return;
        }
      } else {
        const { data, error } = await client.auth.signUp({
          email: email.trim(),
          password,
        });
        if (error) {
          setMessage(error.message);
        } else if (data.session) {
          window.location.reload(); // confirmation disabled — session ready
          return;
        } else {
          setMessage("Account created — check your inbox to confirm, then sign in.");
          setMode("signin");
        }
      }
    } catch {
      setMessage("Could not reach the authentication service.");
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    const client = getSupabaseBrowserClient();
    await client?.auth.signOut();
    // Tenant isolation: this business's cached data must never remain on
    // the device for the next visitor/session. Storage falls back to the
    // designed starter dataset after the wipe.
    clearTenantLocalData();
    setCloudOwnerTag(null);
    clearActiveBusinessId();
    window.location.reload();
  };

  const switchBusiness = (id: string) => {
    if (id === activeBusiness?.id) return;
    setActiveBusinessId(id);
    // Wipe the previous business's cached snapshot BEFORE the reload so no
    // foreign data is ever rendered in — or pushed into — the new context.
    // The cloud bootstrap then imports the target business's cloud state,
    // or initializes it from the starter dataset when it is new.
    clearTenantLocalData();
    setCloudOwnerTag(null);
    window.location.reload();
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
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
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

          {message ? (
            <p role="alert" className="mt-2 text-[11px] font-medium text-secondary-text">
              {message}
            </p>
          ) : null}

          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy}
            className="mt-3 h-10 w-full rounded-xl bg-blue text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-blue/60 disabled:opacity-50"
          >
            {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>

          <button
            type="button"
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setMessage(null);
            }}
            className="mt-2 w-full text-center text-[11px] font-medium text-muted-text transition-colors hover:text-primary-text"
          >
            {mode === "signin"
              ? "New here? Create a business account"
              : "Already have an account? Sign in"}
          </button>
        </>
      )}
    </section>
  );
}