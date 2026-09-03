"use client";

import { useMemo, useState, FormEvent } from "react";
import { useDashboardData } from "@/lib/dashboardData";
import { Activity, ActivityStatus } from "@/data/model/types";
import { todayISO, getWeekRange, relativeDayLabel, shortDayLabel } from "@/lib/dates";
import { PlusIcon, PencilIcon, TrashIcon, NotesIcon } from "./icons";
import { GoalsProgress } from "./GoalsProgress";

type Filter = "all" | "today" | "upcoming" | "week" | "overdue" | "completed";

const STATUS_OPTIONS: ActivityStatus[] = ["pending", "in-progress", "completed"];

const STATUS_LABEL: Record<ActivityStatus, string> = {
  pending: "Pending",
  "in-progress": "In progress",
  completed: "Done",
};

export function ActivityTab() {
  const { activities, addActivity, updateActivity, deleteActivity } = useDashboardData();

  const today = todayISO();
  const [filter, setFilter] = useState<Filter>("all");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDate, setEditDate] = useState(today);
  const [editNotes, setEditNotes] = useState("");
  const [editStatus, setEditStatus] = useState<ActivityStatus>("pending");
  const [addDue, setAddDue] = useState("");
  const [editDue, setEditDue] = useState("");

  const filtered = useMemo(() => {
    const sorted = [...activities].sort(
      (a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)
    );
    if (filter === "today") return sorted.filter((a) => a.date === today);
    if (filter === "week") {
      const { start, end } = getWeekRange(today);
      return sorted.filter((a) => a.date >= start && a.date <= end);
    }
    if (filter === "upcoming") {
      return sorted.filter((a) => a.date > today && a.status !== "completed");
    }
    if (filter === "overdue") {
      const isOverdue = (a: Activity) =>
        a.status !== "completed" && (a.dueDate ?? a.date) < today;
      return sorted.filter(isOverdue);
    }
    if (filter === "completed") {
      return sorted.filter((a) => a.status === "completed");
    }
    return sorted;
  }, [activities, filter, today]);

  const groups = useMemo(() => {
    const map = new Map<string, Activity[]>();
    for (const a of filtered) {
      const list = map.get(a.date) ?? [];
      list.push(a);
      map.set(a.date, list);
    }
    return [...map.entries()];
  }, [filtered]);

  const doneCount = activities.filter((a) => a.status === "completed").length;
  const pendingCount = activities.length - doneCount;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    addActivity({
      title: trimmed,
      date: date || today,
      notes: showNotes && notes.trim() ? notes.trim() : undefined,
      dueDate: addDue || undefined,
      status: "pending",
    });
    setTitle("");
    setNotes("");
    setAddDue("");
    setShowNotes(false);
  };

  const startEdit = (a: Activity) => {
    setEditingId(a.id);
    setEditTitle(a.title);
    setEditDate(a.date);
    setEditNotes(a.notes ?? "");
    setEditStatus(a.status);
    setEditDue(a.dueDate ?? "");
  };

  const saveEdit = (id: string) => {
    const trimmed = editTitle.trim();
    if (!trimmed) return;
    updateActivity(id, {
      title: trimmed,
      date: editDate || today,
      notes: editNotes.trim() ? editNotes.trim() : undefined,
      status: editStatus,
      dueDate: editDue || undefined,
    });
    setEditingId(null);
  };

  const toggleDone = (a: Activity) => {
    updateActivity(a.id, {
      status: a.status === "completed" ? "pending" : "completed",
    });
  };

  return (
    <div className="space-y-3">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-text">
            Activity
          </p>
          <h1 className="mt-1 font-serif text-[2.1rem] font-semibold leading-none text-primary-text md:text-4xl">
            Day-by-day
          </h1>
          <p className="mt-1.5 text-xs text-secondary-text">
            {pendingCount} open · {doneCount} completed — add what happened, when it happened
          </p>
        </div>
      </header>

      {/* Quick add */}
      <form onSubmit={submit} className="rounded-2xl border border-border bg-surface p-3 md:p-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What did you do today?"
            aria-label="Activity title"
            className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-card px-3 text-sm text-primary-text outline-none transition-colors placeholder:text-muted-text focus-visible:ring-2 focus-visible:ring-blue/60"
          />
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-label="Activity date"
              className="h-10 rounded-xl border border-border bg-card px-3 text-xs text-primary-text outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue/60"
            />
            <input
              type="date"
              value={addDue}
              onChange={(e) => setAddDue(e.target.value)}
              aria-label="Due date (optional)"
              title="Due date (optional)"
              className={`h-10 rounded-xl border bg-card px-3 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue/60 ${
                addDue ? "border-border text-primary-text" : "border-dashed border-border text-muted-text"
              }`}
            />
            <button
              type="submit"
              aria-label="Add activity"
              className="flex h-10 w-11 items-center justify-center rounded-xl bg-blue text-white transition-colors hover:bg-blue/90 focus-visible:ring-2 focus-visible:ring-blue/60 active:scale-[0.97]"
            >
              <PlusIcon className="h-5 w-5" strokeWidth={2.2} />
            </button>
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setShowNotes((s) => !s)}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium text-secondary-text transition-colors hover:bg-card focus-visible:ring-2 focus-visible:ring-blue/60"
          >
            <NotesIcon className="h-3.5 w-3.5" />
            {showNotes ? "Hide" : "Add"} notes
          </button>
          <span className="text-[10px] text-muted-text">Enter ↵ to add</span>
        </div>
        {showNotes ? (
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Details, context, follow-ups…"
            aria-label="Activity notes"
            className="mt-2 w-full rounded-xl border border-border bg-card px-3 py-2 text-xs text-primary-text outline-none transition-colors placeholder:text-muted-text focus-visible:ring-2 focus-visible:ring-blue/60"
          />
        ) : null}
      </form>

      {/* Filters */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1 rounded-full border border-border bg-surface p-0.5">
          {(
            [
              { id: "all", label: "All" },
              { id: "today", label: "Today" },
              { id: "upcoming", label: "Upcoming" },
              { id: "week", label: "This week" },
              { id: "overdue", label: "Overdue" },
              { id: "completed", label: "Done" },
            ] as Array<{ id: Filter; label: string }>
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`rounded-full px-3.5 py-1.5 text-[11px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-blue/60 ${
                filter === f.id
                  ? "bg-primary-text/[0.07] text-primary-text dark:bg-white/10"
                  : "text-muted-text hover:text-secondary-text"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className="text-[10px] text-muted-text">{filtered.length} shown</span>
      </div>

      {/* Timeline */}
      {groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center">
          <p className="text-sm font-medium text-secondary-text">Nothing here yet</p>
          <p className="mt-1 text-xs text-muted-text">
            Add your first activity above — keep it quick, keep it real.
          </p>
        </div>
      ) : (
        <section className="space-y-3">
          {groups.map(([dateKey, items]) => (
            <div key={dateKey}>
              <div className="mb-1.5 flex items-center gap-2 px-1">
                <span className="h-1.5 w-1.5 rounded-full bg-blue" />
                <span className="text-xs font-semibold text-primary-text">
                  {relativeDayLabel(dateKey, today)}
                </span>
                <span className="text-[10px] tabular-nums text-muted-text">
                  {shortDayLabel(dateKey, Number(today.slice(0, 4)))} · {items.length}
                </span>
              </div>
              <div className="overflow-hidden rounded-2xl border border-border bg-surface">
                {items.map((a, i) =>
                  editingId === a.id ? (
                    <div
                      key={a.id}
                      className={`space-y-2 p-3 ${i > 0 ? "border-t border-light-border" : ""}`}
                    >
                      <input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        aria-label="Edit title"
                        className="h-9 w-full rounded-lg border border-border bg-card px-3 text-xs text-primary-text outline-none focus-visible:ring-2 focus-visible:ring-blue/60"
                      />
                      <div className="flex flex-wrap gap-2">
                        <input
                          type="date"
                          value={editDate}
                          onChange={(e) => setEditDate(e.target.value)}
                          aria-label="Edit date"
                          className="h-9 rounded-lg border border-border bg-card px-3 text-xs text-primary-text outline-none focus-visible:ring-2 focus-visible:ring-blue/60"
                        />
                        <input
                          type="date"
                          value={editDue}
                          onChange={(e) => setEditDue(e.target.value)}
                          aria-label="Edit due date"
                          title="Due date"
                          className={`h-9 rounded-lg bg-card px-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue/60 ${
                            editDue ? "border border-border text-primary-text" : "border border-dashed border-border text-muted-text"
                          }`}
                        />
                        <select
                          value={editStatus}
                          onChange={(e) => setEditStatus(e.target.value as ActivityStatus)}
                          aria-label="Edit status"
                          className="h-9 rounded-lg border border-border bg-card px-2 text-xs text-primary-text outline-none focus-visible:ring-2 focus-visible:ring-blue/60"
                        >
                          {STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s}>
                              {STATUS_LABEL[s]}
                            </option>
                          ))}
                        </select>
                      </div>
                      <textarea
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        rows={2}
                        placeholder="Notes…"
                        aria-label="Edit notes"
                        className="w-full rounded-lg border border-border bg-card px-3 py-2 text-xs text-primary-text outline-none focus-visible:ring-2 focus-visible:ring-blue/60"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => saveEdit(a.id)}
                          className="rounded-lg bg-blue px-3 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-blue/90"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="rounded-lg border border-border bg-card px-3 py-1.5 text-[11px] text-secondary-text transition-colors hover:bg-light-border"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      key={a.id}
                      className={`flex items-start gap-3 p-3 ${i > 0 ? "border-t border-light-border" : ""}`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleDone(a)}
                        aria-label={a.status === "completed" ? "Mark as open" : "Mark as complete"}
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors focus-visible:ring-2 focus-visible:ring-blue/60 ${
                          a.status === "completed"
                            ? "border-green bg-green text-white"
                            : "border-muted-text/50 hover:border-green"
                        }`}
                      >
                        {a.status === "completed" ? (
                          <span className="text-[10px] font-bold">✓</span>
                        ) : null}
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <span
                            className={`min-w-0 text-[13px] leading-snug ${
                              a.status === "completed"
                                ? "text-muted-text line-through"
                                : "font-medium text-primary-text"
                            }`}
                          >
                            {a.title}
                          </span>
                          <div className="flex shrink-0 items-center gap-1">
                            <span className="rounded-full bg-card px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-secondary-text">
                              {STATUS_LABEL[a.status]}
                            </span>
                            <button
                              type="button"
                              onClick={() => startEdit(a)}
                              aria-label="Edit activity"
                              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-text transition-colors hover:bg-card hover:text-primary-text focus-visible:ring-2 focus-visible:ring-blue/60"
                            >
                              <PencilIcon className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteActivity(a.id)}
                              aria-label="Delete activity"
                              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-text transition-colors hover:bg-card hover:text-orange focus-visible:ring-2 focus-visible:ring-blue/60"
                            >
                              <TrashIcon className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                        {a.dueDate && a.status !== "completed" ? (
                          <p
                            className={`mt-0.5 text-[10px] font-medium ${
                              a.dueDate < today ? "text-orange" : "text-muted-text"
                            }`}
                          >
                            {a.dueDate < today ? "Overdue" : "Due"} · {relativeDayLabel(a.dueDate, today)}
                          </p>
                        ) : null}
                        {a.notes ? (
                          <p className="mt-1 text-[11px] leading-relaxed text-muted-text">{a.notes}</p>
                        ) : null}
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>
          ))}
        </section>
      )}

      {/* ── Goals ─────────────────────────────────────────────── */}
      <GoalsProgress />
    </div>
  );
}