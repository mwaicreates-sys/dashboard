"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { AdminPageHeader, MigrationNotice, SectionCard } from "../ui";

interface ProfileRow {
  id: string;
  display_name: string | null;
  is_platform_admin: boolean | null;
  created_at: string | null;
}

interface MemberRow {
  business_id: string;
  user_id: string;
  role: string;
  created_at: string | null;
}

interface BusinessRow {
  id: string;
  name: string;
}

const ROLE_STYLE: Record<string, string> = {
  owner: "bg-green/15 text-green",
  admin: "bg-blue/15 text-blue",
  member: "bg-muted-text/15 text-secondary-text",
};

const shortId = (id: string) => (id.length > 10 ? `${id.slice(0, 10)}…` : id);

export default function AdminUsers() {
  const [profiles, setProfiles] = useState<ProfileRow[] | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [businesses, setBusinesses] = useState<BusinessRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const client = getSupabaseBrowserClient();
      if (!client) return;
      const [p, m, b] = await Promise.all([
        client.from("profiles").select("*").order("created_at", { ascending: false }).limit(200),
        client
          .from("business_members")
          .select("business_id,user_id,role,created_at")
          .order("created_at", { ascending: false })
          .limit(500),
        client.from("businesses").select("id,name"),
      ]);
      if (!alive) return;
      if (p.error) setError(p.error.message);
      setProfiles(p.error ? [] : (p.data as ProfileRow[]));
      setMembers(m.error ? [] : (m.data as MemberRow[]));
      setBusinesses(b.error ? [] : (b.data as BusinessRow[]));
    })();
    return () => {
      alive = false;
    };
  }, []);

  const businessName = useMemo(
    () => new Map(businesses.map((b) => [b.id, b.name])),
    [businesses]
  );

  return (
    <div className="space-y-3">
      <AdminPageHeader
        title="Users"
        subtitle="Registered profiles and their business memberships"
      />

      {error ? <MigrationNotice detail={error} /> : null}

      <SectionCard title={`Profiles (${profiles?.length ?? 0})`}>
        {profiles === null ? (
          <p className="text-[11px] text-muted-text">Loading…</p>
        ) : profiles.length === 0 ? (
          <p className="text-[11px] text-muted-text">
            No profiles visible — migration 007 may not be applied yet.
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {profiles.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-primary-text">
                  {p.display_name || "Unnamed user"}
                </span>
                <code className="text-[10px] text-muted-text">{shortId(p.id)}</code>
                {p.is_platform_admin ? (
                  <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-300">
                    Platform admin
                  </span>
                ) : null}
                <span className="text-[10px] text-muted-text">
                  {p.created_at ? p.created_at.slice(0, 10) : "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title={`Memberships (${members.length})`}>
        {members.length === 0 ? (
          <p className="text-[11px] text-muted-text">No memberships found.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {members.map((m, i) => (
              <li key={`${m.business_id}-${m.user_id}-${i}`} className="flex flex-wrap items-center gap-2 py-2">
                <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-primary-text">
                  {businessName.get(m.business_id) ?? shortId(m.business_id)}
                </span>
                <code className="text-[10px] text-muted-text">{shortId(m.user_id)}</code>
                <span
                  className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                    ROLE_STYLE[m.role] ?? "bg-muted-text/15 text-secondary-text"
                  }`}
                >
                  {m.role}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}