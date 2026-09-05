"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronRightIcon } from "@/components/shell/icons";
import { ArrowLeftIcon, BuildingIcon } from "../../icons";
import { fetchAdminBusinessDetail, type BusinessDetailData } from "../../data";
import { EmptyState, SkeletonBlock, StatusPill, formatDate } from "../../ui";
import { enterBusinessAsAdmin } from "@/lib/platformAdmin";
import { getActiveBusinessId } from "@/lib/cloudSync";

type TabId = "overview" | "activity" | "settings";
const TABS: Array<{ id: TabId; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "activity", label: "Activity" },
  { id: "settings", label: "Settings" },
];

export default function BusinessDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [data, setData] = useState<BusinessDetailData | null>(null);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<TabId>("overview");

  useEffect(() => {
    let alive = true;
    (async () => {
      const d = await fetchAdminBusinessDetail(id);
      if (!alive) return;
      if (!d) setError(true);
      setData(d);
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  const business = data?.business ?? null;

  if (error) {
    return (
      <div className="space-y-4">
        <BackLink />
        <EmptyState
          title="Business not found"
          message="It may have been deleted, or this account cannot view it."
        />
      </div>
    );
  }
  if (!data || !business) {
    return (
      <div className="space-y-4">
        <BackLink />
        <SkeletonBlock className="h-32" />
        <SkeletonBlock className="h-64" />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <BackLink />

      <header className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-4 md:p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue/10 text-blue">
            <BuildingIcon className="h-5 w-5" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-inter text-xl font-bold tracking-tight text-primary-text">{business.name}</h1>
              <StatusPill>{business.active ? "Active" : "Idle"}</StatusPill>
            </div>
            <p className="mt-0.5 text-[11px] text-muted-text">
              Business workspace · {business.currency}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => enterBusinessAsAdmin(id, business.name, getActiveBusinessId())}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-blue px-4 text-xs font-semibold text-white transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-blue/60"
        >
          Open Workspace
          <ChevronRightIcon className="h-4 w-4" />
        </button>
      </header>

      <div className="flex w-full max-w-md gap-1 rounded-xl border border-border bg-surface p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? "page" : undefined}
            className={`flex-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition-colors ${
              tab === t.id ? "bg-card text-primary-text" : "text-muted-text hover:text-secondary-text"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" ? <OverviewSection data={data} /> : null}
      {tab === "activity" ? <ActivitySection data={data} /> : null}
      {tab === "settings" ? <SettingsSection business={business} /> : null}
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/admin/businesses"
      className="inline-flex items-center gap-1 text-xs font-medium text-muted-text transition-colors hover:text-primary-text"
    >
      <ArrowLeftIcon className="h-3.5 w-3.5" />
      Businesses
    </Link>
  );
}

function OverviewSection({ data }: { data: BusinessDetailData }) {
  const b = data.business;
  if (!b) return null;
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-surface p-4 md:p-5">
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <DetailRow label="Owner" value={b.ownerEmail ?? b.ownerName ?? "—"} />
        <DetailRow label="Currency" value={b.currency || "—"} />
        <DetailRow label="Slug" value={b.slug ?? "—"} />
        <DetailRow label="Created" value={formatDate(b.created_at)} />
      </dl>
    </section>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-2.5 last:border-0">
      <dt className="text-[11px] uppercase tracking-wider text-muted-text">{label}</dt>
      <dd className="mt-0.5 text-[13px] font-medium text-primary-text">{value}</dd>
    </div>
  );
}

function ActivitySection({ data }: { data: BusinessDetailData }) {
  const STATUS_STYLE: Record<string, string> = {
    pending: "bg-muted-text/15 text-secondary-text",
    "in-progress": "bg-blue/15 text-blue",
    completed: "bg-green/15 text-green",
  };
  return (
    <section className="rounded-2xl border border-border bg-surface p-4 md:p-5">
      <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-secondary-text">
        Activity ({data.activities.length})
      </h2>
      {data.activities.length === 0 ? (
        <EmptyState title="No activity" message="This workspace has no tracked activity yet." />
      ) : (
        <ul className="divide-y divide-border/60">
          {data.activities.map((a) => (
            <li key={a.id} className="flex items-start gap-3 py-2.5">
              <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-blue" />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium text-primary-text">{a.title}</span>
                {a.notes ? <span className="mt-0.5 block truncate text-[11px] text-muted-text">{a.notes}</span> : null}
                <span className="mt-0.5 block text-[11px] text-muted-text">{a.date}</span>
              </span>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                  STATUS_STYLE[a.status] ?? "bg-muted-text/15 text-secondary-text"
                }`}
              >
                {a.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SettingsSection({ business }: { business: NonNullable<BusinessDetailData["business"]> }) {
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-surface p-4 md:p-5">
      <h2 className="text-[10px] font-semibold uppercase tracking-wider text-secondary-text">
        Workspace details
      </h2>
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <DetailRow label="Name" value={business.name} />
        <DetailRow label="Slug" value={business.slug ?? "—"} />
        <DetailRow label="Currency" value={business.currency || "—"} />
        <DetailRow label="Created" value={formatDate(business.created_at)} />
      </dl>
      <p className="text-[10px] leading-relaxed text-muted-text">
        Settings for this workspace are managed by its members inside the business
        application. Platform admins have read-only access here.
      </p>
    </section>
  );
}