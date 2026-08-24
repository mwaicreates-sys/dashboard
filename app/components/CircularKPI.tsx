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

export function CircularKPI({ label, value, percentage, color }: {
  label: string;
  value: string;
  percentage: number;
  color: string;
}) {
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  const gauge = (
    <div className="flex flex-col items-center gap-0.5">
      <div className="relative h-14 w-14">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 80 80">
          <circle
            cx="40"
            cy="40"
            r={radius}
            fill="none"
            stroke="#E2E0D9"
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
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[11px] font-semibold text-primary-text">{value}</span>
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
    <div className="flex items-center justify-center gap-4">
      {kpis.map((kpi) => (
        <CircularKPI key={kpi.label} {...kpi} />
      ))}
    </div>
  );
}
