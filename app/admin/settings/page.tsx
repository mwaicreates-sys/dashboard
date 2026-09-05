"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { AdminPageHeader, MigrationNotice, SectionCard } from "../ui";

export default function AdminSettings() {
  const [email, setEmail] = useState<string | null>(null);
  const [rpcDetected, setRpcDetected] = useState<boolean | null>(null);
  const [url, setUrl] = useState<string>("");

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