"use client";

import { useState, useEffect, useCallback } from "react";
import { loadFromStorage, saveToStorage } from "@/lib/storage";
import type { ActivityEvent } from "./data";

const LAST_SEEN_KEY = "admin-notifications-last-seen";

/**
 * Tracks which notifications the admin has seen using a last-seen timestamp.
 *
 * - Reads/writes only a timestamp marker (never authorization data).
 * - Compares real event timestamps against the marker.
 * - Survives refresh and navigation (persisted to localStorage).
 * - Compatible with future database-backed read-state.
 *
 * Returns whether there are unseen events and a callback to mark all as seen
 * (called when the notification panel opens).
 */
export function useNotificationState(events: ActivityEvent[]): {
  hasUnread: boolean;
  markSeen: () => void;
} {
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null);

  // Load the marker once on mount.
  useEffect(() => {
    const stored = loadFromStorage<string | null>(LAST_SEEN_KEY, null);
    setLastSeenAt(stored); // eslint-disable-line react-hooks/set-state-in-effect
  }, []);

  // The newest event timestamp, or null if no events.
  const newestAt = events.length > 0 ? events[0].at : null;

  // There's an unseen event if: we have events AND (no marker yet OR
  // the newest event is newer than the marker).
  const hasUnread = !!(
    newestAt &&
    events.length > 0 &&
    (!lastSeenAt || newestAt > lastSeenAt)
  );

  const markSeen = useCallback(() => {
    if (!newestAt) return;
    // Only update if the newest event is actually newer than the marker.
    if (!lastSeenAt || newestAt > lastSeenAt) {
      setLastSeenAt(newestAt);
      saveToStorage(LAST_SEEN_KEY, newestAt);
    }
  }, [newestAt, lastSeenAt]);

  return { hasUnread, markSeen };
}
