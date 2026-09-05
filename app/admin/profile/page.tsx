"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { clearActiveBusinessId, clearTenantLocalData, setCloudOwnerTag } from "@/lib/cloudSync";
import { clearAdminViewing } from "@/lib/platformAdmin";
import { ProfileIcon } from "@/components/shell/icons";
import { SectionCard, StatusPill, formatDate } from "../ui";

export default function AdminProfilePage() {
  const [email, setEmail] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [memberSince, setMemberSince] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const client = getSupabaseBrowserClient();
      if (!client) return;
      const { data } = await client.auth.getUser();
      const uid = data.user?.id;
      const userEmail = data.user?.email ?? null;
      if (!alive) return;
      setEmail(userEmail);
      if (uid) {
        const prof = await client.from("profiles").select("full_name,created_at").eq("id", uid).maybeSingle();
        if (!alive) return;
        const row = prof.data as { full_name?: string | null; created_at?: string | null } | null;
        setName(row?.full_name ?? null);
        setMemberSince(row?.created_at ?? null);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const signOut = async () => {
    if (busy) return;
    setBusy(true);
    const client = getSupabaseBrowserClient();
    await client?.auth.signOut();
    // Tenant isolation: never leave cached business data behind.
    clearTenantLocalData();
    setCloudOwnerTag(null);
    clearActiveBusinessId();
    clearAdminViewing();
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/login");
  };

  const initial = (name ?? email ?? "A").slice(0, 1).toUpperCase();

  return (
    <div className="space-y-4">
      <header>
        <p className="font-inter text-[10px] font-semibold uppercase tracking-[0.18em] text-[#64748B]">
          Platform Admin
        </p>
        <h1 className="mt-1 font-inter text-2xl font-bold tracking-tight text-primary-text md:text-[1.75rem]">
          Profile
        </h1>
        <p className="mt-1 text-sm text-[#64748B]">Your platform account.</p>
      </header>

      <section className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-4 md:p-5">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-500/15 font-inter text-lg font-bold text-violet-600 dark:text-violet-300">
          {initial}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-[15px] font-semibold text-primary-text">
              {name ?? email ?? "Platform Administrator"}
            </p>
            <StatusPill>Platform Administrator</StatusPill>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-text">{email ?? "Loading…"}</p>
        </div>
      </section>

      <SectionCard title="Account">
        <dl className="space-y-3 text-[13px]">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-text">Email</dt>
            <dd className="truncate font-medium text-primary-text">{email ?? "—"}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-text">Platform role</dt>
            <dd className="font-medium text-primary-text">Platform Administrator</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-text">Member since</dt>
            <dd className="font-medium text-primary-text">{formatDate(memberSince)}</dd>
          </div>
        </dl>
      </SectionCard>

      <SectionCard title="Security">
        <p className="text-[11px] leading-relaxed text-muted-text">
          You are signed in as a platform administrator. Signing out returns you to the
          secure login page — no business data is kept on this device.
        </p>
        <button
          type="button"
          onClick={() => void signOut()}
          disabled={busy}
          className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-xs font-semibold text-secondary-text transition-colors hover:bg-card hover:text-primary-text disabled:opacity-50"
        >
          <ProfileIcon className="h-4 w-4" />
          {busy ? "Signing out…" : "Sign out"}
        </button>
      </SectionCard>
    </div>
  );
}