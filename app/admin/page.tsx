"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { ChevronRightIcon } from "@/components/shell/icons";
import { BuildingIcon, UserIcon, UserPlusIcon } from "./icons";
import { fetchAdminOverview, type OverviewData } from "./data";
import { ActivityFeed } from "./activity-feed";
import {
  EmptyState,
  KpiCard,
  MigrationNotice,
  SectionCard,
  SkeletonBlock,
  formatDate,
  useGreeting,
} from "./ui";

const BLUE = "bg-blue/10";
const BLUE_TEXT = "text-blue";
const TEAL = "bg-teal/10";
const TEAL_TEXT = "text-teal";
const GREEN = "bg-green/10";
const GREEN_TEXT = "text-green";
const ORANGE = "bg-orange/10";
const ORANGE_TEXT = "text-orange";

export default function AdminDashboard() {
  const greeting = useGreeting();
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const client = getSupabaseBrowserClient();
      if (!client) return;
      const auth = await client.auth.getUser();
      if (!alive) return;
      const uid = auth.data.user?.id;

      // Parallel: profile + overview are independent once we have uid.
      const [prof, overview] = await Promise.all([
        uid ? client.from("profiles").select("full_name").eq("id", uid).maybeSingle() : Promise.resolve({ data: null, error: null }),
        fetchAdminOverview(),
      ]);

      if (!alive) return;
      if (prof && !prof.error && prof.data && typeof (prof.data as { full_name?: string | null }).full_name === "string") {
        setName((prof.data as { full_name: string }).full_name);
      }
      if (!overview) setError("Platform data is not visible with this account right now.");
      setData(overview);
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="space-y-4">
      {/* Greeting header */}
      <header>
        <p className="font-inter text-[10px] font-semibold uppercase tracking-[0.14em] text-secondary-text sm:text-[11px]">
          Platform Admin
        </p>
        <h1 className="mt-1.5 font-inter text-[22px] font-bold tracking-tight text-primary-text sm:text-[26px] md:text-[28px] lg:text-[32px]">
          {greeting ? `${greeting}${name ? `, ${name}` : ""}` : "Platform overview"}
        </h1>
        <p className="mt-1 text-[12px] sm:text-[13px] font-medium text-secondary-text">
          A snapshot of every workspace on the platform.
        </p>
      </header>

      {error ? <MigrationNotice detail={error} /> : null}

      {!data && !error ? (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <SkeletonBlock className="h-20 sm:h-24" />
            <SkeletonBlock className="h-20 sm:h-24" />
            <SkeletonBlock className="h-20 sm:h-24" />
            <SkeletonBlock className="h-20 sm:h-24" />
          </div>
          <SkeletonBlock className="h-40 sm:h-44" />
          <SkeletonBlock className="h-40 sm:h-44" />
        </>
      ) : null}

      {data ? (
        <>
          {/* KPI metrics grid */}
          <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <KpiCard
              label="Total Businesses"
              value={String(data.businessCount)}
              sub="On the platform"
              icon={<BuildingIcon className="h-3 w-3 sm:h-4 w-4" />}
              iconBg={BLUE}
              iconColor={BLUE_TEXT}
            />
            <KpiCard
              label="Active Businesses"
              value={String(data.activeBusinessCount)}
              sub="Activity in the last 30 days"
              icon={<UserPlusIcon className="h-3 w-3 sm:h-4 w-4" />}
              iconBg={TEAL}
              iconColor={TEAL_TEXT}
            />
            <KpiCard
              label="Total Users"
              value={String(data.userCount)}
              sub="Registered accounts"
              icon={<UserIcon className="h-3 w-3 sm:h-4 w-4" />}
              iconBg={GREEN}
              iconColor={GREEN_TEXT}
            />
            <KpiCard
              label="Recent Activity"
              value={String(data.recentEventCount)}
              sub="Events in the last 7 days"
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 sm:h-4 w-4">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M7.5 12.6l3 3 6-6.5" />
                </svg>
              }
              iconBg={ORANGE}
              iconColor={ORANGE_TEXT}
            />
          </section>

          {/* Businesses + Recent Activity — two-column grid */}
          <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
            {/* Businesses section */}
            <SectionCard
              title="Businesses"
              actions={
                <Link
                  href="/admin/businesses"
                  className="text-[11px] sm:text-[12px] font-medium text-blue transition-colors duration-150 hover:text-blue/80"
                >
                  View all →
                </Link>
              }
            >
              {data.recentBusinesses.length === 0 ? (
                <EmptyState title="No businesses yet" message="When a workspace is created it will appear here." />
              ) : (
                <ul className="divide-y divide-border/60">
                  {data.recentBusinesses.map((b) => (
                    <li key={b.id}>
                      <Link href={`/admin/businesses/${b.id}`} className="group flex items-center gap-2.5 py-2 sm:py-2.5">
                        <span className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl bg-blue/10 text-blue">
                          <BuildingIcon className="h-4 w-4 sm:h-[18px] w-[18px]" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-inter text-[13px] sm:text-[14px] font-semibold text-primary-text">
                            {b.name}
                          </span>
                          <span className="block truncate text-[11px] sm:text-[12px] text-secondary-text">
                            {b.ownerEmail ?? "No owner"}
                          </span>
                        </span>
                        <span className="hidden text-[11px] sm:text-[12px] text-muted-text sm:block">
                          {formatDate(b.created_at)}
                        </span>
                        <ChevronRightIcon className="h-3 w-3 sm:h-4 w-4 shrink-0 text-muted-text transition-transform duration-150 group-hover:translate-x-0.5" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            {/* Recent activity section */}
            <SectionCard title="Recent Activity">
              {data.feed.length === 0 ? (
                <EmptyState
                  title="No recent activity"
                  message="Platform events will appear here as businesses and users interact with the system."
                />
              ) : (
                <ActivityFeed events={data.feed} />
              )}
            </SectionCard>
          </div>
        </>
      ) : null}
    </div>
  );
}