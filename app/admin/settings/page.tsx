"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { AdminPageHeader, MigrationNotice, SectionCard } from "../ui";

export default function AdminSettings() {
  const [email, setEmail] = useState<string | null>(null);
  const [rpcDetected, setRpcDetected] = useState<boolean | null>(null);
  const [url, setUrl] = useState<string>("");
  const [newOwnerEmail, setNewOwnerEmail] = useState("");
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [transferSuccess, setTransferSuccess] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const client = getSupabaseBrowserClient();
      if (!client) return;
      const { data } = await client.auth.getSession();
      const rpc = await client.rpc("current_is_platform_admin");
      if (!alive) return;
      setEmail(data.session?.user.email ?? null);
      setRpcDetected(!rpc.error);
      setUrl(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    })();
    return () => {
      alive = false;
    };
  }, []);

  const transferOwnership = async () => {
    setTransferring(true);
    setTransferError(null);
    const response = await fetch("/api/admin/transfer-ownership", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: newOwnerEmail }),
    });
    const result = (await response.json().catch(() => null)) as
      | { ok?: boolean; message?: string }
      | null;
    if (!response.ok || !result?.ok) {
      setTransferError(result?.message ?? "Could not transfer platform ownership.");
      setTransferring(false);
      return;
    }
    setTransferSuccess(true);
    setTransferOpen(false);
    setTransferring(false);
    const client = getSupabaseBrowserClient();
    await client?.auth.signOut();
    window.location.assign("/login");
  };

  let host = "";
  try {
    host = url ? new URL(url).host : "";
  } catch {
    host = "";
  }

  return (
    <div className="space-y-3">
      <AdminPageHeader
        title="Settings"
        subtitle="Read-only platform status — no settings are modified from this page"
      />

      {rpcDetected === false ? <MigrationNotice /> : null}

      <SectionCard title="Platform status">
        <dl className="space-y-2 text-[11px]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <dt className="text-muted-text">Signed in as</dt>
            <dd className="font-medium text-primary-text">{email ?? "—"}</dd>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <dt className="text-muted-text">Supabase project</dt>
            <dd className="font-medium text-primary-text">{host || "not configured"}</dd>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <dt className="text-muted-text">Migration 007 (platform admin)</dt>
            <dd>
              <span
                className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                  rpcDetected === null
                    ? "bg-muted-text/15 text-secondary-text"
                    : rpcDetected
                      ? "bg-green/15 text-green"
                      : "bg-orange/15 text-orange"
                }`}
              >
                {rpcDetected === null ? "checking…" : rpcDetected ? "applied" : "not applied"}
              </span>
            </dd>
          </div>
        </dl>
      </SectionCard>

      <SectionCard title="Platform Ownership">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <span className="text-muted-text">Current owner</span>
            <span className="font-medium text-primary-text">{email ?? "—"}</span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <span className="text-muted-text">Status</span>
            <span className="rounded-full bg-green/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-green">
              Platform Owner
            </span>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-text">
            Transfer platform control to a separate Supabase Auth account. Your current
            Platform Admin access will be revoked after the transfer.
          </p>
          {transferError ? <p role="alert" className="text-[11px] font-medium text-orange">{transferError}</p> : null}
          {transferSuccess ? <p role="status" className="text-[11px] text-green">Ownership transferred successfully.</p> : null}
          <button
            type="button"
            onClick={() => setTransferOpen(true)}
            className="inline-flex h-9 items-center rounded-xl bg-blue px-4 text-xs font-semibold text-white transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-blue/60"
          >
            Transfer Ownership
          </button>
        </div>
      </SectionCard>

      {transferOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Transfer Platform Ownership">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-4 shadow-xl sm:p-5">
            <h2 className="text-lg font-semibold text-primary-text">Transfer Platform Ownership?</h2>
            <p className="mt-2 text-xs leading-relaxed text-secondary-text">
              You are transferring control of the entire SaaS platform to a separate account.
              Your current Platform Admin access will be removed after the transfer.
            </p>
            <label className="mt-4 block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-text">
                New owner email
              </span>
              <input
                type="email"
                value={newOwnerEmail}
                onChange={(event) => setNewOwnerEmail(event.target.value)}
                autoComplete="email"
                className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm text-primary-text outline-none focus-visible:ring-2 focus-visible:ring-blue/60"
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setTransferOpen(false)}
                disabled={transferring}
                className="h-9 rounded-xl border border-border px-3 text-xs font-semibold text-secondary-text"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void transferOwnership()}
                disabled={transferring}
                className="h-9 rounded-xl bg-blue px-3 text-xs font-semibold text-white disabled:opacity-60"
              >
                {transferring ? "Transferring…" : "Transfer Ownership"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <SectionCard title="Security model">
        <ul className="list-disc space-y-1.5 pl-4 text-[11px] leading-relaxed text-muted-text">
          <li>
            Platform-admin status lives in <code className="rounded bg-card px-1">profiles.is_platform_admin</code>{" "}
            and is evaluated by the database on every request (RLS + SECURITY DEFINER RPC).
          </li>
          <li>
            Admin visibility is <span className="font-semibold text-primary-text">SELECT-only</span> —
            no insert/update/delete policy exists for platform admins on any business table.
          </li>
          <li>
            The existing tenant wall (member-scoped policies per business) is untouched; business A
            can never read business B, and business users can never read platform tables.
          </li>
          <li>
            Routes under /admin re-verify platform-admin status on every mount; the business
            workspace remains the default landing surface for everyone else.
          </li>
        </ul>
      </SectionCard>
    </div>
  );
}