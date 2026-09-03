// ============================================================
// Centralized FX / exchange-rate service
//
// REAL foreign-exchange rates only — never invented numbers.
//
// Provider: Open Exchange Rates public endpoint
//   GET https://open.er-api.com/v6/latest/{BASE}
//   -> { result: "success", rates: { CODE: 12.345, ... } }
// Free tier, no API key, CORS-enabled, and covers the currencies
// the app supports (KES, USD, EUR, GBP, CAD, AUD, ZAR, NGN, UGX,
// TZS, JPY, INR, ...). Keep this single provider so the whole app
// agrees on one rate.
//
// Behavior:
//   - Rates are cached (memory + localStorage) and reused while
//     fresh (FX_CACHE_FRESH_MS). No request is fired per render.
//   - getExchangeRate(from, to) checks the cache, else fetches a
//     fresh snapshot for `from`, stores the whole snapshot, and
//     returns the extracted pair with a timestamp.
//   - On API failure the most recent successful cached rate is
//     returned flagged stale. If nothing has ever been fetched the
//     call returns null so the UI can show an honest state instead
//     of fabricating a conversion.
//   - Same-currency pairs always short-circuit at rate 1.
// ============================================================

import { loadFromStorage, saveToStorage } from "@/lib/storage";

export interface FxRate {
  from: string;
  to: string;
  /** Units of `to` per 1 unit of `from` — full provider precision. */
  rate: number;
  /** Epoch ms when the provider data was fetched. */
  timestamp: number;
  /** True when this came from the last successful fetch and is past
   *  the freshness window (still usable, clearly labelled stale). */
  stale?: boolean;
}

export interface FxSnapshot {
  base: string;
  rates: Record<string, number>;
  fetchedAt: number;
}

export interface FxStatus {
  status: "idle" | "loading" | "ready" | "stale" | "partial" | "error";
  from: string;
  to: string;
  /** Epoch ms of the newest successful snapshot used. */
  updatedAt?: number;
  /** Base currencies that could not be resolved (empty when ready/stale). */
  missing: string[];
}

const FX_API = "https://open.er-api.com/v6/latest/";
const CACHE_KEY = "fx-rates-cache";

/** Rates fresher than this are returned from cache — no network call.
 *  5 minutes keeps the app current without hammering the provider. */
export const FX_CACHE_FRESH_MS = 5 * 60 * 1000;
/** A snapshot older than this is dropped entirely (defensive). */
export const FX_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

let memoryCache: Record<string, FxSnapshot> = {};

function loadCache(): void {
  if (Object.keys(memoryCache).length > 0) return;
  const stored = loadFromStorage<Record<string, FxSnapshot> | null>(CACHE_KEY, null);
  if (stored && typeof stored === "object" && stored !== null) {
    memoryCache = stored;
  }
}

function persistCache(): void {
  saveToStorage(CACHE_KEY, memoryCache);
}

/** Extract a rate from a snapshot in the cache. */
function resolveSnapshotRate(from: string, to: string): FxRate | null {
  loadCache();
  const snapshot = memoryCache[from];
  if (!snapshot) return null;
  const rate = snapshot.rates[to];
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) return null;
  const age = Date.now() - snapshot.fetchedAt;
  if (age > FX_CACHE_MAX_AGE_MS) return null;
  return {
    from,
    to,
    rate,
    timestamp: snapshot.fetchedAt,
    stale: age > FX_CACHE_FRESH_MS,
  };
}
/**
 * Best-known rate WITHOUT network access. Never triggers a request.
 * Falls back to the inverse pair (1 / rate(to→from)) so both
 * directions share one fetched snapshot. null when nothing known.
 */
export function getCachedRate(from: string, to: string): FxRate | null {
  if (from === to) return { from, to, rate: 1, timestamp: Date.now() };
  const fwd = resolveSnapshotRate(from, to);
  if (fwd) return fwd;
  const reverse = resolveSnapshotRate(to, from);
  if (reverse && reverse.rate > 0) {
    return {
      from,
      to,
      rate: 1 / reverse.rate,
      timestamp: reverse.timestamp,
      stale: reverse.stale,
    };
  }
  return null;
}

async function fetchSnapshot(base: string): Promise<FxSnapshot | null> {
  try {
    const res = await fetch(`${FX_API}${encodeURIComponent(base)}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.result !== "success" || !data.rates) return null;
    const snapshot: FxSnapshot = {
      base,
      rates: data.rates as Record<string, number>,
      fetchedAt: Date.now(),
    };
    memoryCache[base] = snapshot;
    persistCache();
    return snapshot;
  } catch {
    // Network/CORS failure — handled by the caller via stale/null path.
    return null;
  }
}

/**
 * Centralized rate lookup.
 * 1. Same currency      → { rate: 1 } (no request)
 * 2. Fresh cached rate  → returned immediately (no request)
 * 3. Otherwise          → fetch a fresh snapshot once
 * 4. API failed         → last successful cached rate (flagged stale),
 *                         else null (truly unknown)
 */
export async function getExchangeRate(from: string, to: string): Promise<FxRate | null> {
  if (from === to) return { from, to, rate: 1, timestamp: Date.now() };

  const cached = getCachedRate(from, to);
  if (cached && !cached.stale) return cached;

  const snapshot = await fetchSnapshot(from);
  if (snapshot) {
    const fresh = snapshot.rates[to];
    if (typeof fresh === "number" && Number.isFinite(fresh) && fresh > 0) {
      return { from, to, rate: fresh, timestamp: snapshot.fetchedAt };
    }
  }

  // Provider unavailable for this pair — fall back to the last
  // successful rate (either direction) if one exists.
  if (cached) return cached;
  return getCachedRate(to, from);
}

/**
 * Synchronous, best-known conversion. Returns null when the rate is
 * unknown so callers can surface a graceful state instead of guessing.
 * Same-currency conversions always return the original value.
 */
export function convertAmount(value: number, from: string, to: string): number | null {
  if (from === to) return value;
  const rate = getCachedRate(from, to);
  if (!rate) return null;
  return value * rate.rate;
}

/** "Updated just now" / "Updated 5 minutes ago" style helper. */
export function describeRateAge(timestamp?: number): string {
  if (!timestamp) return "never";
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}