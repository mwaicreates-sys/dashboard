"use client";

import { useState, useEffect, useRef } from "react";
import { BellIcon, BuildingIcon, CheckIcon } from "./icons";
import { timeAgo } from "./ui";
import { useNotificationState } from "./useNotificationState";
import type { ActivityEvent } from "./data";

/**
 * Admin notification popover — uses real platform activity data as the
 * source of notifications.
 *
 * Read-state: tracks a last-seen timestamp marker. The bell indicator
 * appears ONLY when there are events newer than the marker. Opening the
 * panel marks all current events as seen (updates the marker).
 *
 * Close: click outside, Escape, or the X button.
 */
export function NotificationPopover({ events }: { events: ActivityEvent[] }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { hasUnread, markSeen } = useNotificationState(events);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const hasNotifications = events.length > 0;

  const handleToggle = () => {
    if (!open) {
      // Opening the panel marks everything as seen.
      markSeen();
    }
    setOpen((o) => !o);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        aria-label="Notifications"
        aria-expanded={open}
        className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-border text-secondary-text transition-colors duration-150 hover:bg-card hover:text-primary-text"
      >
        <BellIcon className="h-[18px] w-[18px]" />
        {hasUnread ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-blue" />
          </span>
        ) : null}
      </button>

      {open && (
        <div 
          className="dropdown-enter absolute right-0 top-full z-50 mt-2 w-full max-w-xs sm:w-80 origin-top-right rounded-2xl border border-border bg-surface shadow-lg"
          style={{ 
            maxWidth: '320px',
            insetInlinePadding: 'max(0.75rem, env(safe-area-inset-left), env(safe-area-inset-right))'
          }}
        >
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
            <h2 className="font-inter text-sm font-semibold text-primary-text">Notifications</h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close notifications"
              className="flex h-6 w-6 items-center justify-center rounded-lg text-muted-text transition-colors duration-100 hover:bg-card hover:text-primary-text"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3.5 w-3.5"
                aria-hidden="true"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {!hasNotifications ? (
              <div className="px-4 py-8 text-center">
                <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-card">
                  <CheckIcon className="h-5 w-5 text-green" />
                </span>
                <p className="mt-3 font-inter text-sm font-medium text-primary-text">
                  No notifications
                </p>
                <p className="mt-1 text-[11px] text-muted-text">
                  You&apos;re all caught up.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border/60">
                {events.slice(0, 20).map((e) => (
                  <li key={e.id} className="flex items-start gap-3 px-4 py-2.5">
                    <span
                      className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                        e.kind === "business"
                          ? "bg-blue/10 text-blue"
                          : "bg-teal/10 text-teal"
                      }`}
                    >
                      <BuildingIcon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-inter text-[13px] sm:text-[14px] font-medium text-primary-text">
                        {e.title}
                      </span>
                      <span className="block text-sm sm:text-[13px] text-muted-text break-words">
                        {e.subject}
                      </span>
                    </span>
                    <span className="shrink-0 text-[13px] text-muted-text whitespace-nowrap">
                      {timeAgo(e.at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {hasNotifications ? (
            <div className="border-t border-border/60 px-4 py-2.5">
              <a
                href="/admin/activity"
                onClick={() => setOpen(false)}
                className="block text-center text-[13px] font-medium text-blue transition-colors duration-100 hover:text-blue/80"
              >
                View all activity →
              </a>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}