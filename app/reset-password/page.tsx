"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    if (password.length < 8) {
      setMessage("Use a password with at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setMessage("The passwords do not match.");
      return;
    }
    const client = getSupabaseBrowserClient();
    if (!client) {
      setMessage("Authentication is not configured.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const { error } = await client.auth.updateUser({ password });
      if (error) {
        setMessage(error.message);
        return;
      }
      router.replace("/login?reset=success");
    } catch {
      setMessage("Could not update the password. Request a new reset link and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4 py-10">
      <section className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-sm md:p-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-text">
          Platform administrator
        </p>
        <h1 className="mt-2 text-xl font-semibold text-primary-text">Set a new password</h1>
        <p className="mt-1 text-xs leading-relaxed text-secondary-text">
          Choose a password for your admin account. This link can only be used through the email recovery flow.
        </p>
        <div className="mt-5 space-y-3">
          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-secondary-text">New password</span>
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm text-primary-text outline-none focus-visible:ring-2 focus-visible:ring-blue/60"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-secondary-text">Confirm password</span>
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
              className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm text-primary-text outline-none focus-visible:ring-2 focus-visible:ring-blue/60"
            />
          </label>
        </div>
        {message ? <p role="alert" className="mt-3 text-[11px] leading-relaxed text-orange">{message}</p> : null}
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy}
          className="mt-4 h-10 w-full rounded-xl bg-blue text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Updating…" : "Update password"}
        </button>
      </section>
    </main>
  );
}
