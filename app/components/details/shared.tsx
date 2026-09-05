"use client";

import Link from "next/link";

export function BackToDashboard() {
  return (
    <Link
      href="/dashboard"
      className="rounded border border-border bg-card px-2 py-1 text-[11px] text-secondary-text hover:bg-light-border focus:outline-none focus:ring-1 focus:ring-blue"
    >
      ← Dashboard
    </Link>
  );
}

export function DetailHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h1 className="text-2xl font-semibold text-primary-text leading-tight">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-0.5 text-[11px] text-secondary-text">{subtitle}</p>
        ) : null}
      </div>
      <BackToDashboard />
    </div>
  );
}

export function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded border border-border bg-card p-2.5">
      <p className="text-[10px] uppercase tracking-wider text-secondary-text">{label}</p>
      <p className="mt-0.5 text-lg font-semibold text-primary-text tabular-nums">{value}</p>
      {sub ? <p className="text-[10px] text-muted-text">{sub}</p> : null}
    </div>
  );
}

export function BreakdownTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: Array<Record<string, string | number>>;
}) {
  return (
    <div className="overflow-x-auto rounded border border-border">
      <table className="w-full text-left text-[11px]">
        <thead>
          <tr className="border-b border-border bg-card">
            {headers.map((h) => (
              <th key={h} className="px-2 py-1.5 font-medium text-muted-text">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx} className="border-b border-light-border last:border-b-0">
              {headers.map((h) => (
                <td key={h} className="px-2 py-1.5 text-primary-text tabular-nums">
                  {row[h] as string}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ProgressBar({ value, total, color = "bg-teal" }: { value: number; total: number; color?: string }) {
  const pct = total > 0 ? Math.min((value / total) * 100, 100) : 0;
  return (
    <div className="h-1.5 w-full rounded-full bg-border">
      <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
