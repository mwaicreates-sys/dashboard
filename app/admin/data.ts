"use client";

// ============================================================
// Platform-admin data helpers (client-side, RLS-authorized).
//
// Every query runs with the signed-in user's session through the
// migration-007 SELECT policies. Nothing new is invented from the
// schema:
//   • Active business  = has any transaction or activity created in
//                        the last 30 days (derived, not stored).
//   • Platform activity = real events reconstructed from existing
//                        timestamps: businesses.created_at
//                        ("Business created") and
//                        business_members.created_at ("Member added").
// ============================================================

import { getSupabaseBrowserClient } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface BusinessRow {
  id: string;
  name: string;
  slug: string | null;
  currency: string;
  created_at: string | null;
  owner_name?: string | null;
  owner_email?: string | null;
  activation_code?: string | null;
}

export interface BusinessMeta extends BusinessRow {
  members: number;
  ownerEmail: string | null;
  ownerName: string | null;
  active: boolean;
  accessCode: string | null;
  accessCodeStatus: "pending" | "used" | "revoked" | null;
}

export interface ActivityEvent {
  id: string;
  kind: "business" | "member";
  title: string;
  subject: string;
  at: string;
}

export interface OverviewData {
  businessCount: number;
  activeBusinessCount: number;
  userCount: number;
  recentEventCount: number;
  recentBusinesses: Array<{ id: string; name: string; ownerEmail: string | null; created_at: string | null }>;
  feed: ActivityEvent[];
}

export interface MemberDetail {
  user_id: string;
  role: string;
  email: string | null;
  full_name: string | null;
  created_at: string | null;
}

export interface BusinessDetailData {
  business: BusinessMeta | null;
  members: MemberDetail[];
  activities: Array<{
    id: string;
    title: string;
    date: string;
    status: string;
    notes: string | null;
    due_date: string | null;
    created_at: string | null;
  }>;
}

const DAY = 24 * 60 * 60 * 1000;

/** Distinct business ids with any transaction/activity created since `since`. */
async function recentActiveIds(
  client: SupabaseClient,
  sinceIso: string
): Promise<Set<string>> {
  const [tx, act] = await Promise.all([
    client.from("transactions").select("business_id").gte("created_at", sinceIso).limit(5000),
    client.from("activities").select("business_id").gte("created_at", sinceIso).limit(5000),
  ]);
  const ids = new Set<string>();
  for (const r of (tx.data ?? []) as Array<{ business_id: string }>) if (r.business_id) ids.add(r.business_id);
  for (const r of (act.data ?? []) as Array<{ business_id: string }>) if (r.business_id) ids.add(r.business_id);
  return ids;
}

async function ownerMap(
  client: SupabaseClient,
  members: Array<{ business_id: string; user_id: string; role: string }>
): Promise<Map<string, { email: string | null; name: string | null }>> {
  const owners = members.filter((m) => m.role === "owner");
  const map = new Map<string, { email: string | null; name: string | null }>();
  if (owners.length === 0) return map;
  const ids = Array.from(new Set(owners.map((m) => m.user_id)));
  const prof = await client
    .from("profiles")
    .select("id,email,full_name")
    .in("id", ids)
    .limit(500);
  const byUid = new Map((prof.data ?? []).map((p) => [p.id as string, p as { email: string | null; full_name: string | null }]));
  for (const m of owners) {
    const p = byUid.get(m.user_id);
    map.set(m.business_id, { email: p?.email ?? null, name: p?.full_name ?? null });
  }
  return map;
}

async function claimedOwnerMap(
  client: SupabaseClient,
  businesses: BusinessRow[]
): Promise<Map<string, { email: string | null; name: string | null }>> {
  const map = new Map<string, { email: string | null; name: string | null }>();
  const bizIds = businesses.map((b) => b.id).filter(Boolean) as string[];
  
  for (const biz of businesses) {
    if (biz.owner_name && biz.owner_email) {
      map.set(biz.id, { email: biz.owner_email, name: biz.owner_name });
    }
  }
  return map;
}

/** All businesses with member counts, owner emails, and 30-day activity. */
export async function fetchAdminBusinesses(): Promise<BusinessMeta[] | null> {
  const client = getSupabaseBrowserClient();
  if (!client) return null;
  try {
    const [b, m, activeIds] = await Promise.all([
      client.from("businesses").select("id,name,slug,currency,created_at,owner_name,owner_email").order("name"),
      client.from("business_members").select("business_id,user_id,role,created_at"),
      recentActiveIds(client, new Date(Date.now() - 30 * DAY).toISOString()),
    ]);
    if (b.error || m.error) return null;
    const businesses = b.data as BusinessRow[];
    const members = m.data as Array<{ business_id: string; user_id: string; role: string }>;
    const ownerFromMembers = await ownerMap(client, members);
    const ownerFromClaim = await claimedOwnerMap(client, businesses);

    const counts = new Map<string, number>();
    for (const mem of members) counts.set(mem.business_id, (counts.get(mem.business_id) ?? 0) + 1);

    return businesses.map((row) => {
      const fromMember = ownerFromMembers.get(row.id);
      const fromClaim = ownerFromClaim.get(row.id);
      const ownerEmail = fromMember?.email ?? fromClaim?.email ?? null;
      const ownerName = fromMember?.name ?? fromClaim?.name ?? null;
      return {
        ...row,
        members: counts.get(row.id) ?? 0,
        ownerEmail,
        ownerName,
        active: activeIds.has(row.id),
        accessCode: row.activation_code ?? null,
        accessCodeStatus: null,
      };
    });
  } catch {
    return null;
  }
}
/** Platform overview: counts + recent businesses + recent activity feed. */
export async function fetchAdminOverview(): Promise<OverviewData | null> {
  const client = getSupabaseBrowserClient();
  if (!client) return null;
  try {
    const since30 = new Date(Date.now() - 30 * DAY).toISOString();
    const since7 = new Date(Date.now() - 7 * DAY).toISOString();

    const [bizCount, userCount, activeIds, recentBiz, allBiz, members, recentTx, recentAct, recentNotif] =
      await Promise.all([
        client.from("businesses").select("*", { count: "exact", head: true }),
        client.from("profiles").select("*", { count: "exact", head: true }),
        recentActiveIds(client, since30),
        client.from("businesses").select("id,name,created_at").order("created_at", { ascending: false }).limit(5),
        client.from("businesses").select("id,name"),
        client.from("business_members").select("business_id,user_id,role,created_at"),
        client.from("transactions").select("*", { count: "exact", head: true }).gte("created_at", since7),
        client.from("activities").select("*", { count: "exact", head: true }).gte("created_at", since7),
        client.from("notifications").select("*", { count: "exact", head: true }).gte("created_at", since7),
      ]);

    const nameById = new Map((allBiz.data ?? []).map((b) => [b.id as string, b.name as string]));
    const owner = await ownerMap(client, (members.data ?? []) as Array<{ business_id: string; user_id: string; role: string }>);

    const recentBusinesses = ((recentBiz.data ?? []) as Array<{ id: string; name: string; created_at: string | null }>).map(
      (b) => ({ ...b, ownerEmail: owner.get(b.id)?.email ?? null })
    );

    const feed: ActivityEvent[] = [
      ...((recentBiz.data ?? []) as Array<{ id: string; name: string; created_at: string | null }>).map((b) => ({
        id: `biz-${b.id}`,
        kind: "business" as const,
        title: "Business created",
        subject: b.name,
        at: b.created_at ?? "",
      })),
      ...((members.data ?? []) as Array<{ business_id: string; user_id: string; created_at: string | null }>).map((m) => ({
        id: `mem-${m.business_id}-${m.user_id}`,
        kind: "member" as const,
        title: "Member added",
        subject: nameById.get(m.business_id) ?? "Workspace",
        at: m.created_at ?? "",
      })),
    ]
      .filter((e) => e.at)
      .sort((a, b) => (a.at < b.at ? 1 : -1))
      .slice(0, 6);

    return {
      businessCount: bizCount.count ?? 0,
      activeBusinessCount: activeIds.size,
      userCount: userCount.count ?? 0,
      recentEventCount: (recentTx.count ?? 0) + (recentAct.count ?? 0) + (recentNotif.count ?? 0),
      recentBusinesses,
      feed,
    };
  } catch {
    return null;
  }
}
/** One business with its members and recent activities. */
export async function fetchAdminBusinessDetail(id: string): Promise<BusinessDetailData | null> {
  const client = getSupabaseBrowserClient();
  if (!client) return null;
  try {
    const [biz, members, activities, claim] = await Promise.all([
      client.from("businesses").select("id,name,slug,currency,created_at,owner_name,owner_email").eq("id", id).maybeSingle(),
      client.from("business_members").select("business_id,user_id,role,created_at").eq("business_id", id),
      client.from("activities").select("id,local_id,title,date,status,notes,due_date,created_at").eq("business_id", id).order("date", { ascending: false }).limit(50),
      client
        .from("business_owner_claims")
        .select("status,created_at")
        .eq("business_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (biz.error || !biz.data) return { business: null, members: [], activities: [] };

    const mrows = members.data as Array<{ business_id: string; user_id: string; role: string; created_at: string | null }>;
    const activeIds = await recentActiveIds(client, new Date(Date.now() - 30 * DAY).toISOString());
    const ownerFromMembers = await ownerMap(client, mrows);
    const bizData = biz.data as BusinessRow;
    
    let ownerEmail = ownerFromMembers.get(id)?.email ?? bizData.owner_email ?? null;
    let ownerName = ownerFromMembers.get(id)?.name ?? bizData.owner_name ?? null;

    const uids = Array.from(new Set(mrows.map((m) => m.user_id)));
    const prof = uids.length
      ? await client.from("profiles").select("id,email,full_name").in("id", uids).limit(500)
      : { data: [] };
    const byUid = new Map((prof.data ?? []).map((p) => [p.id as string, p as { email: string | null; full_name: string | null }]));

    const base = biz.data as BusinessRow;
    const meta: BusinessMeta = {
      ...base,
      members: mrows.length,
      ownerEmail,
      ownerName,
      active: activeIds.has(id),
      accessCode: base.activation_code ?? null,
      accessCodeStatus: (claim.data?.status as BusinessMeta["accessCodeStatus"]) ?? null,
    };

    return {
      business: meta,
      members: mrows.map((m) => ({
        user_id: m.user_id,
        role: m.role,
        email: byUid.get(m.user_id)?.email ?? null,
        full_name: byUid.get(m.user_id)?.full_name ?? null,
        created_at: m.created_at,
      })),
      activities: (activities.data ?? []) as BusinessDetailData["activities"],
    };
  } catch {
    return null;
  }
}

/**
 * All businesses with owner email — used by the global search dropdown.
 * Lightweight: only fields needed for search + result display.
 * RLS-authorized via migration-007 SELECT policy.
 */
export async function fetchAllBusinessesForSearch(): Promise<
  Array<{ id: string; name: string; ownerEmail: string | null }>
> {
  const client = getSupabaseBrowserClient();
  if (!client) return [];
  try {
    const [biz, members] = await Promise.all([
      client.from("businesses").select("id,name").order("name", { ascending: true }).limit(500),
      client.from("business_members").select("business_id,user_id,role").eq("role", "owner").limit(500),
    ]);
    if (biz.error || members.error) return [];
    const ownerUidByBiz = new Map<string, string>();
    for (const m of (members.data ?? []) as Array<{ business_id: string; user_id: string }>) {
      ownerUidByBiz.set(m.business_id, m.user_id);
    }
    const uids = Array.from(ownerUidByBiz.values());
    const prof = uids.length
      ? await client.from("profiles").select("id,email").in("id", uids).limit(500)
      : { data: [] };
    const emailByUid = new Map((prof.data ?? []).map((p) => [p.id as string, p.email as string]));
    return ((biz.data ?? []) as Array<{ id: string; name: string }>).map((b) => ({
      id: b.id,
      name: b.name,
      ownerEmail: emailByUid.get(ownerUidByBiz.get(b.id) ?? "") ?? null,
    }));
  } catch {
    return [];
  }
}

/** Full platform activity feed (business + membership events). */
export async function fetchAdminActivity(): Promise<ActivityEvent[] | null> {
  const client = getSupabaseBrowserClient();
  if (!client) return null;
  try {
    const [biz, members] = await Promise.all([
      client.from("businesses").select("id,name,created_at").order("created_at", { ascending: false }).limit(100),
      client.from("business_members").select("business_id,user_id,created_at").order("created_at", { ascending: false }).limit(200),
    ]);
    if (biz.error || members.error) return null;
    const nameById = new Map((biz.data ?? []).map((b) => [b.id as string, b.name as string]));
    const events: ActivityEvent[] = [
      ...((biz.data ?? []) as Array<{ id: string; name: string; created_at: string | null }>).map((b) => ({
        id: `biz-${b.id}`,
        kind: "business" as const,
        title: "Business created",
        subject: b.name,
        at: b.created_at ?? "",
      })),
      ...((members.data ?? []) as Array<{ business_id: string; user_id: string; created_at: string | null }>).map((m) => ({
        id: `mem-${m.business_id}-${m.user_id}`,
        kind: "member" as const,
        title: "Member added",
        subject: nameById.get(m.business_id) ?? "Workspace",
        at: m.created_at ?? "",
      })),
    ]
      .filter((e) => e.at)
      .sort((a, b) => (a.at < b.at ? 1 : -1))
      .slice(0, 60);
    return events;
  } catch {
    return null;
  }
}