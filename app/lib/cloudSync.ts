"use client";

/**
 * Cloud sync & tenancy bridge (Supabase, multi-tenant SaaS).
 *
 * Connects the app's existing local data model (app/data/model) with the
 * business-scoped Postgres schema (supabase/migrations). Design rules:
 *
 *  • The app keeps its stable string ids ("a1", "tx-42"). They are stored
 *    in local_id — unique per business — so sync never changes how the
 *    app calculates and ids can safely repeat across tenants.
 *  • *_local_id columns carry the original app references (source of
 *    truth). *_id uuid columns are optional relational pointers for
 *    future SQL-side reporting.
 *  • Everything is tenant-scoped by business_id; RLS enforces isolation
 *    server-side, this module only ever queries with an explicit
 *    business_id.
 *  • Reads use one database snapshot. Writes commit only changed rows with
 *    optimistic conflict checks. Failures reach callers; no silent fallback.
 */

import type {
  Account,
  Activity,
  Budget,
  Category,
  Goal,
  Notification,
  PlannedTransaction,
  TodoRow,
  Transaction,
} from "@/data/model/types";
import type { CurrencyCode } from "./currency";
import { getSupabaseBrowserClient } from "./supabase";


// ------------------------------------------------------------
// Public types
// ------------------------------------------------------------

/** A business the signed-in user belongs to. */
export interface BusinessInfo {
  id: string;
  name: string;
  slug: string | null;
  currency: string;
  /** "platform-admin" is assigned ONLY when an authenticated platform
   *  admin is inspecting the workspace (migration 007). It never comes
   *  from business_members and grants nothing beyond RLS read access. */
  role: "owner" | "admin" | "member" | "platform-admin";
}

/** Cloud sync session status (surfaced through the dashboard context).
 *  "conflict" is terminal for the current queue instance — see
 *  CloudSaveQueue: a stale optimistic-concurrency rejection is never
 *  retried automatically (Phase 3), only a reload can recover it. */
export type CloudSyncState = "idle" | "syncing" | "synced" | "offline" | "error" | "conflict";

/** Thrown by pushBusinessState specifically for a 40001 (stale row) reject —
 *  lets callers distinguish "this exact retry can never succeed without a
 *  fresh pull" from an ordinary transient/network failure, instead of
 *  string-matching the error message. */
export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

/** Full business-scoped state exchanged with the cloud. */
export interface CloudState {
  /** Exact cloud rows for optimistic concurrency; never restored from cache. */
  cloudRows?: Record<string, Row[]>;
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
  goals: Goal[];
  plannedTransactions: PlannedTransaction[];
  activities: Activity[];
  notifications: Notification[];
  todos: TodoRow[];
  selectedYear: number;
  currency: CurrencyCode;
}

/** LocalStorage key for the active business selection. */
const ACTIVE_BUSINESS_KEY = "budgeting-dashboard-v2-active-business";

// ------------------------------------------------------------
// Tenancy helpers
// ------------------------------------------------------------

/**
 * Businesses of the signed-in user (via business_members → businesses).
 * Returns null when Supabase is not configured, nobody is signed in, or
 * the query fails — callers treat null as "cloud unavailable".
 */
export async function fetchBusinessesForUser(): Promise<BusinessInfo[] | null> {
  const client = getSupabaseBrowserClient();
  if (!client) return null;
  try {
    const { data: auth } = await client.auth.getUser();
    if (!auth?.user) return null;
    const { data, error } = await client
      .from("business_members")
      .select("role, business:businesses ( id, name, slug, currency )")
      .eq("user_id", auth.user.id);
    if (error || !data) return null;
    return (data as Array<Record<string, unknown>>).map((row) => {
      const b = row.business as Record<string, unknown>;
      return {
        id: String(b.id),
        name: String(b.name ?? "Business"),
        slug: b.slug ? String(b.slug) : null,
        currency: String(b.currency ?? "USD"),
        role: (row.role as BusinessInfo["role"]) ?? "member",
      };
    });
  } catch {
    return null;
  }
}

export function getActiveBusinessId(): string | null {
  try {
    return window.localStorage.getItem(ACTIVE_BUSINESS_KEY);
  } catch {
    return null;
  }
}

export function setActiveBusinessId(id: string): void {
  try {
    window.localStorage.setItem(ACTIVE_BUSINESS_KEY, id);
  } catch {
    /* private mode — selection is session-only */
  }
}

export function clearActiveBusinessId(): void {
  try {
    window.localStorage.removeItem(ACTIVE_BUSINESS_KEY);
  } catch {
    /* ignore */
  }
}

// ------------------------------------------------------------
// Local-data ownership tag + tenant cache clearing.
//
// localStorage holds a snapshot of ONE tenant's data. To guarantee no
// business's data ever leaks into another session or workspace, every
// cloud bootstrap tags the local snapshot with the business id it
// belongs to, and sign-out / business-switching clear it explicitly.
// ------------------------------------------------------------

const OWNER_TAG_KEY = "budgeting-dashboard-v2-cloud-owner";

/** Tenant-scoped storage keys (everything except theme/owner tag). */
const TENANT_KEYS = [
  "accounts",
  "transactions",
  "categories",
  "budgets",
  "goals",
  "planned",
  "todos",
  "year",
  "currency",
  "activities",
  "selectedDay",
  "notifications",
  "dashboardFilter",
] as const;

/** Which business the local snapshot belongs to ("local" = never
 *  synced, null = no snapshot / cleared). */
export function getCloudOwnerTag(): string | null {
  try {
    return window.localStorage.getItem(OWNER_TAG_KEY);
  } catch {
    return null;
  }
}

export function setCloudOwnerTag(businessId: string | null): void {
  try {
    if (businessId) window.localStorage.setItem(OWNER_TAG_KEY, businessId);
    else window.localStorage.removeItem(OWNER_TAG_KEY);
  } catch {
    /* private mode — tag is session-only */
  }
}

/** Remove all tenant-scoped cached data (keeps theme + session keys).
 *  Used on sign-out and business switching so one business's data can
 *  never be shown to, or pushed into, another context. */
export function clearTenantLocalData(): void {
  try {
    for (const key of TENANT_KEYS) {
      window.localStorage.removeItem(`budgeting-dashboard-v2-${key}`);
    }
  } catch {
    /* ignore */
  }
}

/** Coerce optional string columns (null / undefined / "" → undefined). */
function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** A raw Postgres row (snake_case columns). */
export type Row = Record<string, unknown>;

const s = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : fallback;
const num = (v: unknown, fallback = 0): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;
const bool = (v: unknown, fallback = true): boolean =>
  typeof v === "boolean" ? v : fallback;

// ------------------------------------------------------------
// Row → entity (cloud → app)
// ------------------------------------------------------------

const accountFromRow = (r: Row): Account => ({
  id: s(r.local_id),
  name: s(r.name, "Account"),
  type: s(r.type, "checking") as Account["type"],
  openingBalance: num(r.opening_balance),
  currentBalance: num(r.current_balance),
  currency: s(r.currency, "USD"),
  institution: str(r.institution),
  active: bool(r.active),
});

const categoryFromRow = (r: Row): Category => ({
  id: s(r.local_id),
  name: s(r.name, "Category"),
  group: s(r.category_group, "expenses") as Category["group"],
  type: s(r.type, "expense") as Category["type"],
  color: s(r.color, "#94a3b8"),
  parentId: str(r.parent_local_id),
});

const transactionFromRow = (r: Row): Transaction => ({
  id: s(r.local_id),
  date: s(r.date),
  accountId: s(r.account_local_id),
  categoryId: s(r.category_local_id),
  type: s(r.type, "expense") as Transaction["type"],
  amount: num(r.amount),
  description: s(r.description),
  status: s(r.status, "cleared") as Transaction["status"],
  notes: str(r.notes),
  plannedId: str(r.planned_local_id),
  toAccountId: str(r.to_account_local_id),
  currency: str(r.currency),
});

const budgetFromRow = (r: Row): Budget => ({
  id: s(r.local_id),
  categoryId: s(r.category_local_id),
  periodId: s(r.period_id),
  month: s(r.month),
  plannedAmount: num(r.planned_amount),
  actualAmount: num(r.actual_amount),
});

const goalFromRow = (r: Row): Goal => ({
  id: s(r.local_id),
  name: s(r.name, "Goal"),
  targetAmount: num(r.target_amount),
  currentAmount: num(r.current_amount),
  targetDate: s(r.target_date),
  status: s(r.status, "active") as Goal["status"],
  currency: str(r.currency),
});

const plannedFromRow = (r: Row): PlannedTransaction => ({
  id: s(r.local_id),
  date: s(r.date),
  accountId: s(r.account_local_id),
  categoryId: s(r.category_local_id),
  description: s(r.description),
  amount: num(r.amount),
  type: s(r.type, "expense") as PlannedTransaction["type"],
  status: s(r.status, "pending") as PlannedTransaction["status"],
  recurrence: str(r.recurrence) as PlannedTransaction["recurrence"],
  toAccountId: str(r.to_account_local_id),
  currency: str(r.currency),
});

const activityFromRow = (r: Row): Activity => ({
  id: s(r.local_id),
  title: s(r.title),
  date: s(r.date),
  notes: str(r.notes),
  status: s(r.status, "pending") as Activity["status"],
  dueDate: str(r.due_date),
  priority: str(r.priority) as Activity["priority"],
  completedAt: str(r.completed_at),
});

const notificationFromRow = (r: Row): Notification => ({
  id: s(r.local_id),
  title: s(r.title),
  message: s(r.message),
  type: s(r.type, "info") as Notification["type"],
  status: s(r.status, "unread") as Notification["status"],
  date: s(r.date),
  actionLabel: str(r.action_label),
  actionHref: str(r.action_href),
});

// ------------------------------------------------------------
// Entity → row (app → cloud). business_id added by the caller.
// ------------------------------------------------------------

const baseCols = (businessId: string, localId: string) => ({
  business_id: businessId,
  local_id: localId,
});

const accountToRow = (businessId: string, a: Account): Row => ({
  ...baseCols(businessId, a.id),
  name: a.name,
  type: a.type,
  opening_balance: a.openingBalance,
  current_balance: a.currentBalance,
  currency: a.currency,
  institution: a.institution ?? null,
  active: a.active,
});

const categoryToRow = (businessId: string, c: Category): Row => ({
  ...baseCols(businessId, c.id),
  name: c.name,
  category_group: c.group,
  type: c.type,
  color: c.color ?? null,
  parent_local_id: c.parentId ?? null,
});

const transactionToRow = (businessId: string, t: Transaction): Row => ({
  ...baseCols(businessId, t.id),
  date: t.date,
  account_local_id: t.accountId,
  to_account_local_id: t.toAccountId ?? null,
  category_local_id: t.categoryId,
  planned_local_id: t.plannedId ?? null,
  type: t.type,
  amount: t.amount,
  description: t.description,
  status: t.status,
  notes: t.notes ?? null,
  currency: t.currency ?? null,
});

const budgetToRow = (businessId: string, b: Budget): Row => ({
  ...baseCols(businessId, b.id),
  category_local_id: b.categoryId,
  period_id: b.periodId,
  month: b.month,
  planned_amount: b.plannedAmount,
  actual_amount: b.actualAmount,
});

const goalToRow = (businessId: string, g: Goal): Row => ({
  ...baseCols(businessId, g.id),
  name: g.name,
  target_amount: g.targetAmount,
  current_amount: g.currentAmount,
  target_date: g.targetDate,
  status: g.status,
  currency: g.currency ?? null,
});

const plannedToRow = (businessId: string, p: PlannedTransaction): Row => ({
  ...baseCols(businessId, p.id),
  date: p.date,
  account_local_id: p.accountId,
  to_account_local_id: p.toAccountId ?? null,
  category_local_id: p.categoryId,
  description: p.description,
  amount: p.amount,
  type: p.type,
  status: p.status,
  recurrence: p.recurrence ?? null,
  currency: p.currency ?? null,
});

const activityToRow = (businessId: string, a: Activity): Row => ({
  ...baseCols(businessId, a.id),
  title: a.title,
  date: a.date,
  notes: a.notes ?? null,
  status: a.status,
  due_date: a.dueDate ?? null,
  priority: a.priority ?? null,
  completed_at: a.completedAt ?? null,
});

const notificationToRow = (businessId: string, n: Notification): Row => ({
  ...baseCols(businessId, n.id),
  title: n.title,
  message: n.message,
  type: n.type,
  status: n.status,
  date: n.date,
  action_label: n.actionLabel ?? null,
  action_href: n.actionHref ?? null,
});

// ------------------------------------------------------------
// Pull (cloud → app)
// ------------------------------------------------------------

/** One MVCC database snapshot, with exact originals for conflict checks. */
export async function pullBusinessState(businessId: string): Promise<CloudState> {
  const client = getSupabaseBrowserClient();
  if (!client) throw new Error("Supabase is not configured.");
  const { data, error } = await client.rpc("read_business_state", { p_business_id: businessId });
  if (error) throw new Error(`Could not load the workspace (${error.code}).`);
  if (!data || typeof data !== "object") throw new Error("Invalid workspace response.");
  const rows = data as Record<string, Row[]>;
  for (const table of CLOUD_TABLES) {
    if (!Array.isArray(rows[table])) throw new Error(`Missing workspace table: ${table}`);
    if (rows[table].some((row) => row.business_id !== businessId)) {
      throw new Error("Workspace response contains another business.");
    }
  }
  const setting = (key: string) => rows.app_settings.find((r) => r.key === key)?.value;
  return {
    accounts: rows.accounts.map(accountFromRow),
    categories: rows.categories.map(categoryFromRow),
    transactions: rows.transactions.map(transactionFromRow).sort((a, b) => b.date.localeCompare(a.date)),
    budgets: rows.budgets.map(budgetFromRow),
    goals: rows.goals.map(goalFromRow),
    plannedTransactions: rows.planned_transactions.map(plannedFromRow).sort((a, b) => a.date.localeCompare(b.date)),
    activities: rows.activities.map(activityFromRow),
    notifications: rows.notifications.map(notificationFromRow),
    todos: Array.isArray(setting("todos")) ? setting("todos") as TodoRow[] : [],
    selectedYear: typeof setting("year") === "number" ? setting("year") as number : 0,
    currency: typeof setting("currency") === "string" ? setting("currency") as CurrencyCode : "USD",
    cloudRows: rows,
  };
}

export const CLOUD_TABLES = ["accounts", "categories", "transactions", "budgets", "goals",
  "planned_transactions", "activities", "notifications", "app_settings"] as const;

function stateRows(businessId: string, state: CloudState): Record<string, Row[]> {
  return {
    accounts: state.accounts.map((a) => accountToRow(businessId, a)),
    categories: state.categories.map((c) => categoryToRow(businessId, c)),
    transactions: state.transactions.map((t) => transactionToRow(businessId, t)),
    budgets: state.budgets.map((b) => budgetToRow(businessId, b)),
    goals: state.goals.map((g) => goalToRow(businessId, g)),
    planned_transactions: state.plannedTransactions.map((p) => plannedToRow(businessId, p)),
    activities: state.activities.map((a) => activityToRow(businessId, a)),
    notifications: state.notifications.map((n) => notificationToRow(businessId, n)),
    app_settings: [
      { business_id: businessId, key: "todos", value: state.todos },
      { business_id: businessId, key: "year", value: state.selectedYear },
      { business_id: businessId, key: "currency", value: state.currency },
    ],
  };
}

export interface CloudChange { table: string; key: string; before: Row | null; after: Row | null }

/** Compare app values; send the actual database originals as concurrency tokens. */
export function businessChanges(businessId: string, previous: CloudState, next: CloudState): CloudChange[] {
  if (!previous.cloudRows) throw new Error("Cloud hydration must complete before saving.");
  const before = stateRows(businessId, previous), after = stateRows(businessId, next);
  const changes: CloudChange[] = [];
  for (const table of CLOUD_TABLES) {
    const keyField = table === "app_settings" ? "key" : "local_id";
    const oldRows = new Map(before[table].map((r) => [String(r[keyField]), r]));
    const newRows = new Map(after[table].map((r) => [String(r[keyField]), r]));
    for (const key of new Set([...oldRows.keys(), ...newRows.keys()])) {
      const oldRow = oldRows.get(key), newRow = newRows.get(key);
      if (JSON.stringify(oldRow) === JSON.stringify(newRow)) continue;
      const original = previous.cloudRows[table]?.find((r) => r[keyField] === key) ?? null;
      const fields = newRow ? Object.fromEntries(Object.entries(newRow)
        .filter(([name]) => name !== "business_id" && name !== keyField)) : null;
      changes.push({ table, key, before: original, after: fields });
    }
  }
  return changes;
}

/** One atomic, RLS-authorized commit. Failures reach the save operation. */
export async function pushBusinessState(
  businessId: string, state: CloudState, previous: CloudState,
): Promise<CloudState> {
  const changes = businessChanges(businessId, previous, state);
  if (!changes.length) return { ...state, cloudRows: previous.cloudRows };
  const client = getSupabaseBrowserClient();
  if (!client) throw new Error("Supabase is not configured.");
  const { data, error } = await client.rpc("apply_business_changes", {
    p_business_id: businessId, p_changes: changes,
  });
  if (error) {
    if (error.code === "40001") throw new ConflictError("This record changed in another session. Reload before editing it.");
    throw new Error(`Save was not confirmed (${error.code}). Keep this form open and retry.`);
  }
  if (!Array.isArray(data) || data.length !== changes.length) throw new Error("Save confirmation was incomplete. Retry.");
  const rows = { ...previous.cloudRows };
  for (const result of data as { table: string; key: string; row: Row | null }[]) {
    const expected = changes.find((c) => c.table === result.table && c.key === result.key);
    if (!expected || (result.row && result.row.business_id !== businessId)) throw new Error("Invalid save confirmation.");
    const keyField = result.table === "app_settings" ? "key" : "local_id";
    rows[result.table] = (rows[result.table] ?? []).filter((r) => r[keyField] !== result.key);
    if (result.row) rows[result.table].push(result.row);
  }
  return { ...state, cloudRows: rows };
}
