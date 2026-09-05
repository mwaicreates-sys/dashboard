"use client";

import { useState, useEffect } from "react";
import type { ReactNode } from "react";

/** Shared primitives for the platform-admin area.
 *  Uses **Inter** exclusively (no serif) per the admin UX spec.
 *  Design language mirrors the Business Dashboard (rounded-2xl cards,
 *  bg-surface, the same type scale and spacing). */

export function AdminPageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-3">
      <h1 className="font-inter text-[20px] font-bold tracking-tight text-primary-text sm:text-[22px] md:text-[24px] lg:text-[28px]">{title}</h1>
      <p className="mt-0.5 text-[10px] sm:text-[11px] text-secondary-text">{subtitle}</p>
    </div>
  );
}

/** Blank-page / first-time state. */
export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon?: ReactNode;
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface px-4 py-8 sm:px-6 sm:py-10 text-center">
      {icon ? <div className="mb-3 text-muted-text">{icon}</div> : null}
      <p className="font-inter text-base sm:text-lg font-semibold text-primary-text">{title}</p>
      {message ? <p className="mt-1 max-w-sm text-[11px] leading-relaxed text-muted-text">{message}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/** Loading placeholder — matches the card silhouette. */
export function SkeletonBlock({ className = "h-24" }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl border border-border bg-card/60 ${className}`} />;
}

/** Status pill with premium, subtle colors. */
export function StatusPill({
  children,
  tone = "green",
}: {
  children: ReactNode;
  tone?: "green" | "blue" | "muted";
}) {
  const cls =
    tone === "green"
      ? "bg-green/15 text-green"
      : tone === "blue"
      ? "bg-blue/15 text-blue"
      : "bg-muted-text/15 text-secondary-text";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] sm:text-[10px] font-semibold uppercase tracking-wide ${cls}`}
    >
      <span
        className={`h-1 w-1 sm:h-1.5 sm:w-1.5 rounded-full ${
          tone === "green" ? "bg-green" : tone === "blue" ? "bg-blue" : "bg-muted-text/70"
        }`}
      />
      {children}
    </span>
  );
}

export function KpiCard({
  label,
  value,
  sub,
  icon,
  iconBg = "bg-blue/10",
  iconColor = "text-blue",
}: {
  label: string;
  value: string;
  sub?: string;
  icon: ReactNode;
  iconBg?: string;
  iconColor?: string;
}) {
  return (
    <div className="relative rounded-2xl border border-border bg-surface p-3.5 sm:p-4">
      <p className="font-inter text-[12px] sm:text-[14px] font-medium text-secondary-text">{label}</p>
      <p className="mt-1.5 font-inter text-[24px] sm:text-[28px] font-bold leading-none tabular-nums text-primary-text">
        {value}
      </p>
      {sub ? <p className="mt-1.5 text-[11px] sm:text-[12px] text-muted-text">{sub}</p> : null}
      <span
        className={`absolute right-2.5 sm:right-3 top-2.5 sm:top-3 flex h-7 w-7 sm:h-9 sm:w-9 items-center justify-center rounded-xl ${iconBg} ${iconColor}`}
      >
        {icon}
      </span>
    </div>
  );
}

export function SectionCard({
  title,
  children,
  actions,
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-3 sm:p-4 md:p-5">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h2 className="font-inter text-[11px] sm:text-[12px] font-semibold uppercase tracking-[0.12em] text-secondary-text">
          {title}
        </h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

/**
 * Shown when the platform-admin schema (migration 007) is not applied
 * yet, or the signed-in account has not been designated an admin.
 */
export function MigrationNotice({ detail }: { detail?: string }) {
  return (
    <div className="rounded-2xl border border-orange/40 bg-orange/[0.06] p-3.5 sm:p-4">
      <p className="text-xs font-semibold text-orange">Platform-admin access not detected</p>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-text">
        Some platform data is not visible. Apply{" "}
        <code className="rounded bg-card px-1">supabase/migrations/007_platform_admin.sql</code>{" "}
        in the Supabase SQL editor, then designate the first admin:
      </p>
      <pre className="mt-1.5 overflow-x-auto rounded-lg bg-card p-2 text-[10px] leading-relaxed text-secondary-text">{`update public.profiles
   set is_platform_admin = true
 where id = (select id from auth.users where email = 'you@example.com');`}</pre>
      {detail ? <p className="mt-1 text-[10px] text-muted-text">{detail}</p> : null}
    </div>
  );
}

/** "Good morning / afternoon / evening" — computed after mount to avoid hydration drift. */
export function useGreeting(): string {
  const [greeting, setGreeting] = useState("");
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const h = new Date().getHours();
    setGreeting(h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening");
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */
  return greeting;
}

/** Compact relative time ("2 min ago"). */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const s = Math.max(1, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Short absolute date, e.g. "Sep 4, 2026". */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}