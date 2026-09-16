"use client";

import Link from "next/link";
import { useDashboardData } from "@/lib/dashboardData";

const KPI_HREFS: Record<string, string> = {
  Saved: "/savings",
  Spent: "/outflow",
  Invested: "/investments",
  Debts: "/debts",
};

const KPI_LABELS: Record<string, string> = {
  Saved: "View savings details",
  Spent: "View outflow details",
  Invested: "View investment details",
  Debts: "View debt details",
};

/**
 * Splits a formatted amount like "KSh 919.7K" or "$10.8M" into its
 * currency indicator ("KSh" / "$") and numeric body ("919.7K" / "10.8M").
 *
 * Root cause of the value/ring/label collision this fixes: the gauge
 * used to render the WHOLE formatted string as one line centered inside
 * a fixed 56px circle with no width/overflow containment — fine for a
 * short "$500", but "KSh 919.7K" (10 characters) has no way to fit a
 * circle whose safe (non-ring-overlapping) inscribed area is only ~32px
 * wide, so it visually spilled into the ring stroke and, once it wrapped
 * to a second line, into the label below. Splitting into two short,
 * independently-sized lines — the currency indicator and the compact
 * value — keeps each line well within the safe area regardless of which
 * currency or how large the compact value gets, without needing to guess
 * a shrink factor or truncate a financial number.
 */
function splitCurrencyValue(value: string): { prefix: string; body: string } {
  const match = value.match(/^([^\d]*)(.*)$/);
  const prefix = (match?.[1] ?? "").trim();
  const body = (match?.[2] ?? value).trim() || value;
  return { prefix, body };
}

export function CircularKPI({ label, value, percentage, color }: {
  label: string;
  value: string;
  percentage: number;
  color: string;
}) {
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;
  const { prefix, body } = splitCurrencyValue(value);

  const gauge = (
    <div className="flex flex-col items-center gap-1">
      <div className="relative h-16 w-16 shrink-0">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 80 80">
          <circle
            cx="40"
            cy="40"
            r={radius}
            fill="none"
            stroke="var(--color-border)"
            strokeWidth="5"
          />
          <circle
            cx="40"
            cy="40"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-px px-1.5">
          {prefix ? (
            <span className="whitespace-nowrap text-[8px] font-medium leading-none text-secondary-text">
              {prefix}
            </span>
          ) : null}
          <span className="whitespace-nowrap text-[10px] font-semibold leading-none tabular-nums text-primary-text">
            {body}
          </span>
        </div>
      </div>
      <span className="text-[9px] font-medium uppercase tracking-wider text-secondary-text group-hover:text-primary-text">
        {label}
      </span>
    </div>
  );

  const href = KPI_HREFS[label];
  if (!href) return gauge;

  return (
    <Link
      href={href}
      aria-label={`${label}: ${value} — ${KPI_LABELS[label] ?? "View details"}`}
      className="group flex flex-col items-center rounded focus:outline-none focus-visible:ring-1 focus-visible:ring-blue"
    >
      {gauge}
    </Link>
  );
}

export function KPIGaugeGroup() {
  const { kpis } = useDashboardData();

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {kpis.map((kpi) => (
        <CircularKPI key={kpi.label} {...kpi} />
      ))}
    </div>
  );
}
