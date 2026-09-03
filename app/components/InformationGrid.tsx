"use client";

import Link from "next/link";
import { TopOutflowTable } from "./CompactTable";
import { TopSpendingsTable } from "./CompactTable";

const cardLink =
  "group block rounded border border-border bg-card p-2.5 cursor-pointer transition-colors hover:border-secondary-text/50 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue";

/**
 * Financial-analysis information only. To-Do / Goals live in the Activity
 * tab; this grid intentionally excludes productivity widgets.
 */
export function InformationGrid() {
  return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
      <Link
        href="/outflow"
        aria-label="Top 20 Outflow — view outflow details"
        className={cardLink}
      >
        <TopOutflowTable />
      </Link>
      <Link
        href="/outflow"
        aria-label="Top 20 Spendings — view spending details"
        className={cardLink}
      >
        <TopSpendingsTable />
      </Link>
    </div>
  );
}
