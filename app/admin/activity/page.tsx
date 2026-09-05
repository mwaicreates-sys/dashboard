"use client";

import { useEffect, useState } from "react";
import { ActivityIcon } from "@/components/shell/icons";
import { fetchAdminActivity, type ActivityEvent } from "../data";
import { ActivityFeed } from "../activity-feed";
import { EmptyState, MigrationNotice, SectionCard, SkeletonBlock } from "../ui";

export default function AdminActivityPage() {
  const [events, setEvents] = useState<ActivityEvent[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const list = await fetchAdminActivity();
      if (!alive) return;
      if (!list) setError(true);
      setEvents(list);
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="space-y-4">
      <header>
        <p className="font-inter text-[10px] font-semibold uppercase tracking-[0.18em] text-[#64748B]">
          Platform Admin
        </p>
        <h1 className="mt-1 font-inter text-2xl font-bold tracking-tight text-primary-text md:text-[1.75rem]">
          Activity
        </h1>
        <p className="mt-1 text-sm text-[#64748B]">
          Business and membership events across the platform.
        </p>
      </header>

      {error ? <MigrationNotice detail="Could not load platform activity." /> : null}

      {!events && !error ? (
        <>
          <SkeletonBlock className="h-24" />
          <SkeletonBlock className="h-24" />
        </>
      ) : null}

      {events && events.length === 0 ? (
        <EmptyState
          icon={<ActivityIcon className="h-6 w-6" />}
          title="No activity yet"
          message="Business and membership events will appear here."
        />
      ) : null}

      {events && events.length > 0 ? (
        <SectionCard title={`Activity (${events.length})`}>
          <ActivityFeed events={events} showDate />
        </SectionCard>
      ) : null}
    </div>
  );
}