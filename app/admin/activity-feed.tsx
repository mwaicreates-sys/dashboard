"use client";

import { ActivityIcon } from "@/components/shell/icons";
import { BuildingIcon } from "./icons";
import { formatDate, timeAgo } from "./ui";
import type { ActivityEvent } from "./data";

/**
 * Shared platform activity list — reuses the exact row pattern from the
 * Business Dashboard feed. Events come from real timestamps only
 * (businesses.created_at / business_members.created_at).
 */
export function ActivityFeed({
  events,
  showDate = false,
}: {
  events: ActivityEvent[];
  showDate?: boolean;
}) {
  return (
    <ul className="divide-y divide-border/60">
      {events.map((e) => (
        <li key={e.id} className="flex items-start gap-3 py-2.5">
          <span
            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
              e.kind === "business"
                ? "bg-blue/10 text-blue"
                : "bg-teal/10 text-teal"
            }`}
          >
            {e.kind === "business" ? (
              <BuildingIcon className="h-4 w-4" />
            ) : (
              <ActivityIcon className="h-4 w-4" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-inter text-[14px] font-medium text-primary-text">{e.title}</span>
            <span className="block truncate text-[13px] text-secondary-text">{e.subject}</span>
          </span>
          <span className="shrink-0 text-right">
            <span className="block text-[13px] text-muted-text">{timeAgo(e.at)}</span>
            {showDate ? (
              <span className="block text-[10px] text-muted-text/70">{formatDate(e.at)}</span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}