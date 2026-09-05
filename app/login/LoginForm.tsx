"use client";

// ============================================================
// /login — the one public entry point of the SaaS.
//
// Business owners (provisioned by the Platform Admin) activate with
//   Business Email + Access Code  →  POST /api/auth/activate
// which establishes a genuine, persistent Supabase session — no
// password creation, no email confirmation, no forgot-password flow.
//
// Platform Admins keep their existing email + password sign-in
// (unchanged). Both modes route purely by database state afterwards:
// platform admin → /admin · one business → /dashboard · zero or several
// → /workspaces (unprovisioned users see the "No business access" state).
// ============================================================

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import { routeAfterSignIn } from "@/lib/authRouting";

type Mode = "access" | "admin";

export function LoginForm() {
  const [mode, setMode] = useState<Mode>("access");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    // `?error=` is set by /auth/callback for stale link exchanges. It is only
    // readable on the client (window), so the setState-in-effect is
    // intentional and hydration-safe — same pattern as the dashboard
    // bootstrap in app/lib/dashboardData.tsx.
    const err = new URLSearchParams(window.location.search).get("error");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (err) setMessage(err);
  }, []);

  /** Owner activation: email + access code → persistent Supabase session. */
  const handleActivate = async () => {
    if (busy) return;
    if (!email.trim() || !code.trim()) {
      setMessage("Enter your business email and the access code.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/auth/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), code: code.trim() }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; message?: string }
        | null;
      if (!res.ok || !data?.ok) {
        setMessage(data?.message ?? "Activation failed. Please try again.");
        return;
      }
      await routeAfterSignIn();
    } catch {
      setMessage("Could not reach the authentication service.");
    } finally {
      setBusy(false);
    }
  };

  /** Platform-admin sign-in (unchanged email + password flow). */
  const handleAdminSignIn = async () => {
    const client = getSupabaseBrowserClient();
    if (!client || busy) return;
    if (!email.trim() || password.length < 6) {
      setMessage("Enter an email and a password of at least 6 characters.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const { error: signInError } = await client.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) {
        setMessage(signInError.message);
        return;
      }
      await routeAfterSignIn();
    } catch {
      setMessage("Could not reach the authentication service.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="text-3xl font-semibold tracking-tight text-primary-text">
            Budget
          </p>
          <p className="mt-1.5 text-[10px] uppercase tracking-[0.2em] text-muted-text">
            Business workspaces · Year at a glance
          </p>
        </div>

        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm md:p-6">
          {!isSupabaseConfigured() ? (
            <p className="rounded-xl border border-border bg-surface px-3 py-2.5 text-[11px] leading-relaxed text-muted-text">
              Cloud sign-in is not configured in this build. Set{" "}
              <code className="rounded bg-surface px-1">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
              <code className="rounded bg-surface px-1">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code>{" "}
              to enable it.
            </p>
          ) : (
            <p className="mb-3 text-center text-[11px] text-muted-text">
              Access is provided by your platform administrator.
            </p>
          )}

          <h1 className="text-lg font-semibold text-primary-text">
            {mode === "access" ? "Welcome back" : "Platform administrator sign in"}
          </h1>

          <div className="mt-4 space-y-2.5">
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-secondary-text">
                Business Email
              </span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="owner@example.com"
                className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm text-primary-text outline-none transition-colors placeholder:text-muted-text focus-visible:ring-2 focus-visible:ring-blue/60"
              />
            </label>

            {mode === "access" ? (
              <label className="block">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-secondary-text">
                  Access Code
                </span>
                <input
                  type="text"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleActivate();
                  }}
                  placeholder="LUM-XXXXXXXXXX"
                  className="h-10 w-full rounded-xl border border-border bg-surface px-3 font-mono text-sm uppercase tracking-wider text-primary-text outline-none transition-colors placeholder:font-sans placeholder:normal-case placeholder:tracking-normal placeholder:text-muted-text focus-visible:ring-2 focus-visible:ring-blue/60"
                />
              </label>
            ) : (
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
                    if (e.key === "Enter") void handleAdminSignIn();
                  }}
                  placeholder="••••••••"
                  className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm text-primary-text outline-none transition-colors placeholder:text-muted-text focus-visible:ring-2 focus-visible:ring-blue/60"
                />
              </label>
            )}
          </div>

          {message ? (
            <p role="alert" className="mt-2.5 text-[11px] font-medium leading-relaxed text-orange">
              {message}
            </p>
          ) : null}

          <button
            type="button"
            onClick={mode === "access" ? handleActivate : handleAdminSignIn}
            disabled={busy || !isSupabaseConfigured()}
            className="mt-4 h-10 w-full rounded-xl bg-blue text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-blue/60 disabled:opacity-50"
          >
            {busy
              ? mode === "access"
                ? "Activating…"
                : "Signing in…"
              : mode === "access"
                ? "Continue"
                : "Sign in"}
          </button>

          <button
            type="button"
            onClick={() => {
              setMode(mode === "access" ? "admin" : "access");
              setMessage(null);
            }}
            className="mt-2.5 w-full text-center text-[11px] font-medium text-muted-text transition-colors hover:text-primary-text"
          >
            {mode === "access"
              ? "Platform administrator? Sign in with password"
              : "Business owner? Use your access code"}
          </button>
        </section>

        <p className="mt-4 text-center text-[10px] leading-relaxed text-muted-text">
          Every workspace access is verified against the server on each request.
        </p>
      </div>
    </div>
  );
}