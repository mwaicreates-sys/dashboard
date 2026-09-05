"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ActivityIcon, ChevronRightIcon, PlusIcon, TrashIcon } from "@/components/shell/icons";
import { BuildingIcon, XIcon } from "../icons";
import { fetchAdminBusinesses, fetchAdminActivity, type BusinessMeta, type ActivityEvent } from "../data";
import { EmptyState, MigrationNotice, SkeletonBlock, StatusPill, formatDate } from "../ui";
import { ActivityFeed } from "../activity-feed";
import { CreateBusinessModal } from "../create-business";
import { getSupabaseBrowserClient } from "@/lib/supabase";

export default function AdminBusinesses() {
  const router = useRouter();
  const [rows, setRows] = useState<BusinessMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [activity, setActivity] = useState<ActivityEvent[] | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchAdminBusinesses().then((list) => {
      if (!alive) return;
      if (!list) setError("Could not load businesses.");
      setRows(list);
    });
    void fetchAdminActivity().then((events) => {
      if (!alive) return;
      if (!events) setActivityError("Could not load activity.");
      setActivity(events);
    });
    // Realtime: keep the Admin business list in sync with inserts/deletes
    // from other sessions (e.g. another admin creating a business).
    let realtime = true;
    const client = getSupabaseBrowserClient();
    if (client) {
      const channel = client
        .channel("public:businesses")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "businesses" },
          () => {
            if (!realtime) return;
            void fetchAdminBusinesses().then((list) => {
              if (!realtime) return;
              setRows(list);
              setError(null);
            });
          },
        )
        .subscribe();
      return () => {
        realtime = false;
        client.removeChannel(channel);
        alive = false;
      };
    }
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!rows) return rows;
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        (b.slug ?? "").toLowerCase().includes(q) ||
        (b.ownerEmail ?? "").toLowerCase().includes(q)
    );
  }, [rows, query]);

  const showEmpty = rows !== null && rows.length === 0;
  const showNoResults = rows !== null && rows.length > 0 && (filtered?.length ?? 0) === 0;
  const deleting = isDeleting;
  const deletingBusiness = rows?.find((b) => b.id === deletingId);
  const showDeleteModal = deletingId !== null && deletingBusiness !== undefined;

  const confirmDelete = async () => {
    if (!deletingId) return;
    const client = getSupabaseBrowserClient();
    if (!client) return;
    setDeleteError(null);
    setIsDeleting(true);
    try {
      const { data, error: rpcError } = await client.rpc("admin_delete_business", {
        p_business_id: deletingId,
      });
      if (rpcError) {
        console.error("admin_delete_business RPC error:", rpcError);
        setDeleteError(rpcError.message);
      } else {
        console.log("admin_delete_business success:", data);
        const idToRemove = deletingId;
        setDeletingId(null);
        setDeleteError(null);
        setRows((prev) => prev?.filter((b) => b.id !== idToRemove) ?? null);
      }
    } catch (e) {
      console.error("admin_delete_business exception:", e);
      const msg = e instanceof Error ? e.message : "Unknown error";
      setDeleteError(`Could not delete the business: ${msg}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const cancelDelete = () => {
    setDeletingId(null);
    setDeleteError(null);
    setIsDeleting(false);
  };

return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-inter text-[10px] font-semibold uppercase tracking-[0.18em] text-[#64748B]">
            Platform Admin
          </p>
          <h1 className="mt-1 font-inter text-2xl font-bold tracking-tight text-primary-text md:text-[1.75rem]">
            Businesses
          </h1>
          <p className="mt-1 text-sm text-[#64748B]">Every workspace on the platform.</p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-blue px-3.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-blue/60"
        >
          <PlusIcon className="h-4 w-4" />
          New business
        </button>
      </header>

      {error ? <MigrationNotice detail={error} /> : null}

      <div className="relative">
        <Magnifier className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-text" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search businesses"
          aria-label="Search businesses"
          className="h-10 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-sm text-primary-text outline-none transition-colors placeholder:text-muted-text focus-visible:ring-2 focus-visible:ring-violet-500/60"
        />
      </div>

      {rows === null && !error ? (
        <div className="space-y-2.5">
          <SkeletonBlock className="h-14" />
          <SkeletonBlock className="h-14" />
          <SkeletonBlock className="h-14" />
        </div>
      ) : null}

      {showEmpty || showNoResults ? (
        <EmptyState
          icon={<BuildingIcon className="h-6 w-6" />}
          title={showEmpty ? "No businesses yet" : "No matching businesses"}
          message={showEmpty ? "Create your first business to get started." : "Try a different search."}
          action={
            showEmpty ? (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-blue px-3.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
              >
                <PlusIcon className="h-4 w-4" />
                Create business
              </button>
            ) : undefined
          }
        />
      ) : null}

      {filtered && filtered.length > 0 ? (
        <>
          <div className="hidden overflow-hidden rounded-2xl border border-border bg-surface md:block">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-border/80 text-[10px] uppercase tracking-wider text-muted-text">
                  <th className="px-4 py-2.5 font-inter text-[10px] font-semibold uppercase tracking-wider text-secondary-text">Business</th>
                  <th className="px-4 py-2.5 font-inter text-[10px] font-semibold uppercase tracking-wider text-secondary-text">Owner</th>
                  <th className="px-4 py-2.5 font-inter text-[10px] font-semibold uppercase tracking-wider text-secondary-text">Status</th>
                  <th className="px-4 py-2.5 font-inter text-[10px] font-semibold uppercase tracking-wider text-secondary-text">Created</th>
                  <th className="w-10 px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filtered.map((b) => (
                  <tr
                    key={b.id}
                    onClick={() => router.push(`/admin/businesses/${b.id}`)}
                    className="cursor-pointer transition-colors hover:bg-card/60"
                  >
                    <td className="px-4 py-3 font-inter font-semibold text-primary-text">
                      <Link
                        href={`/admin/businesses/${b.id}`}
                        className="outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60"
                      >
                        {b.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-secondary-text">{b.ownerEmail ?? "—"}</td>
                    <td className="px-4 py-3">
                      <StatusPill>{b.active ? "Active" : "Idle"}</StatusPill>
                    </td>
                    <td className="px-4 py-3 text-muted-text">{formatDate(b.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingId(b.id);
                        }}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-text transition-colors hover:bg-card hover:text-orange focus-visible:ring-2 focus-visible:ring-orange/50"
                        aria-label={`Delete ${b.name}`}
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-2.5 md:hidden">
            {filtered.map((b) => (
              <div key={b.id} className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4">
                <Link
                  href={`/admin/businesses/${b.id}`}
                  className="flex-1"
                >
                  <span className="flex items-center gap-2">
                    <span className="truncate font-inter text-[13px] font-semibold text-primary-text">{b.name}</span>
                    <StatusPill>{b.active ? "Active" : "Idle"}</StatusPill>
                  </span>
                  <span className="mt-0.5 block text-[11px] text-muted-text">
                    {b.ownerEmail ?? "No owner"}
                  </span>
                </Link>
                <ChevronRightIcon className="h-4 w-4 shrink-0 text-muted-text" />
                <button
                  type="button"
                  onClick={() => setDeletingId(b.id)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-muted-text transition-colors hover:bg-card hover:text-orange focus-visible:ring-2 focus-visible:ring-orange/50"
                  aria-label={`Delete ${b.name}`}
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {/* Recent platform activity */}
      <div className="mt-6">
        {activityError ? (
          <p className="text-[11px] text-orange">{activityError}</p>
        ) : activity === null ? (
          <div className="space-y-2.5">
            <SkeletonBlock className="h-12" />
            <SkeletonBlock className="h-12" />
          </div>
        ) : activity.length === 0 ? (
          <EmptyState
            icon={<ActivityIcon className="h-5 w-5" />}
            title="No activity yet"
            message="Business and membership events will appear here."
          />
        ) : (
          <ActivityFeed events={activity} />
        )}
      </div>

      <CreateBusinessModal open={creating} onClose={() => setCreating(false)} />

      {showDeleteModal ? (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-3 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Delete business"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) cancelDelete();
          }}
        >
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-inter text-lg font-bold text-primary-text">Delete business</h2>
                <p className="mt-0.5 text-[11px] text-muted-text">
                  This will permanently delete {deletingBusiness.name} and all its data.
                </p>
              </div>
              <button
                type="button"
                onClick={cancelDelete}
                aria-label="Close"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-text transition-colors hover:bg-card hover:text-primary-text"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>
            {deleteError ? (
              <p role="alert" className="mt-3 text-[11px] font-medium leading-relaxed text-orange">
                {deleteError}
              </p>
            ) : null}
            <div className="mt-4 flex gap-2 pt-1">
              <button
                type="button"
                onClick={cancelDelete}
                className="h-10 flex-1 rounded-xl border border-border text-xs font-semibold text-secondary-text transition-colors hover:bg-card hover:text-primary-text"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="h-10 flex-1 rounded-xl bg-orange text-xs font-semibold text-white transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-orange/50 disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete business"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Magnifier({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.8-3.8" />
    </svg>
  );
}