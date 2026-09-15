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
 *  • Pull/import and push/upsert are idempotent; deletes are diffed
 *    (rows removed locally are deleted server-side on next push).
 *  • Every function degrades gracefully when Supabase is not configured
 *    or the network fails — the app keeps working locally.
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
import type { SupabaseClient } from "@supabase/supabase-js";

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

/** Cloud sync session status (surfaced through the dashboard context). */
export type CloudSyncState = "idle" | "syncing" | "synced" | "offline" | "error";

/** Full business-scoped state exchanged with the cloud. */
export interface CloudState {
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
type Row = Record<string, unknown>;

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

const activityToRow = (businessId: string, a: Activity, actorUserId?: string | null): Row => ({
  ...baseCols(businessId, a.id),
  title: a.title,
  date: a.date,
  notes: a.notes ?? null,
  status: a.status,
  due_date: a.dueDate ?? null,
  priority: a.priority ?? null,
  completed_at: a.completedAt ?? null,
  actor_user_id: actorUserId,
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

/**
 * Load the full business-scoped state for a tenant. Returns null when
 * Supabase is not configured, nobody is signed in, or any query fails —
 * callers then simply keep local state (graceful offline behavior).
 */
export async function pullBusinessState(
  businessId: string
): Promise<CloudState | null> {
  const client = getSupabaseBrowserClient();
  if (!client) return null;
  try {
    const [
      accounts,
      categories,
      transactions,
      budgets,
      goals,
      planned,
      activities,
      notifications,
      settings,
    ] = await Promise.all([
      client.from("accounts").select("*").eq("business_id", businessId),
      client.from("categories").select("*").eq("business_id", businessId),
      client
        .from("transactions")
        .select("*")
        .eq("business_id", businessId)
        .order("date", { ascending: false }),
      client.from("budgets").select("*").eq("business_id", businessId),
      client.from("goals").select("*").eq("business_id", businessId),
      client
        .from("planned_transactions")
        .select("*")
        .eq("business_id", businessId)
        .order("date"),
      client
        .from("activities")
        .select("*")
        .eq("business_id", businessId)
        .order("date", { ascending: false }),
      client.from("notifications").select("*").eq("business_id", businessId),
      client
        .from("app_settings")
        .select("key, value")
        .eq("business_id", businessId),
    ]);

    const responses = [
      accounts,
      categories,
      transactions,
      budgets,
      goals,
      planned,
      activities,
      notifications,
      settings,
    ];
    if (responses.some((r) => r.error)) return null;

    const settingRows = (settings.data ?? []) as Row[];
    const setting = (key: string): unknown =>
      settingRows.find((r) => String(r.key) === key)?.value;

    const todosValue = setting("todos");
    const yearValue = setting("year");
    const currencyValue = setting("currency");

    return {
      accounts: ((accounts.data ?? []) as Row[]).map(accountFromRow),
      categories: ((categories.data ?? []) as Row[]).map(categoryFromRow),
      transactions: ((transactions.data ?? []) as Row[]).map(transactionFromRow),
      budgets: ((budgets.data ?? []) as Row[]).map(budgetFromRow),
      goals: ((goals.data ?? []) as Row[]).map(goalFromRow),
      plannedTransactions: ((planned.data ?? []) as Row[]).map(plannedFromRow),
      activities: ((activities.data ?? []) as Row[]).map(activityFromRow),
      notifications: ((notifications.data ?? []) as Row[]).map(
        notificationFromRow
      ),
      todos: Array.isArray(todosValue) ? (todosValue as TodoRow[]) : [],
      selectedYear: typeof yearValue === "number" ? yearValue : 0,
      currency:
        typeof currencyValue === "string"
          ? (currencyValue as CurrencyCode)
          : "USD",
    };
  } catch {
    return null;
  }
}

// ------------------------------------------------------------
// Push (app → cloud)
// ------------------------------------------------------------

/**
 * Delete cloud rows that no longer exist locally (local removals are
 * synced as a diff). Never wipes a table when the local set is empty —
 * that would destroy data on a transient empty state.
 */
async function deleteRemoved(
  client: SupabaseClient,
  table: string,
  businessId: string,
  keepIds: string[]
): Promise<void> {
  if (keepIds.length === 0) return;
  const list = `(${keepIds.map((id) => `"${id}"`).join(",")})`;
  await client
    .from(table)
    .delete()
    .eq("business_id", businessId)
    .not("local_id", "in", list);
}

/**
 * Upsert the full business-scoped state. Idempotent — safe to call after
 * every debounced local change. Returns true when everything succeeded.
 *
 * `actorUserId` is passed in by the caller (resolved once at cloud
 * bootstrap) rather than re-fetched here. `client.auth.getUser()` makes a
 * network round-trip to Supabase Auth to revalidate the JWT — an extra
 * request that was previously awaited on EVERY push before any write left
 * the browser. That round-trip was pure latency on the critical path: it
 * only ever fed a denormalized `actor_user_id` label column, never an
 * authorization decision (RLS enforces access from the request's JWT
 * itself, independent of this value). Skipping it shortens how long a
 * push takes to reach the network, shrinking the window in which a tab
 * close can cut it off — see the flush-on-hide logic in dashboardData.tsx.
 */
export async function pushBusinessState(
  businessId: string,
  state: CloudState,
  actorUserId: string | null = null
): Promise<boolean> {
  const client = getSupabaseBrowserClient();
  if (!client) return false;
  try {
    const upsertOpts = { onConflict: "business_id,local_id" } as const;
    const results = await Promise.all([
      client
        .from("accounts")
        .upsert(
          state.accounts.map((a) => accountToRow(businessId, a)),
          upsertOpts
        ),
      client
        .from("categories")
        .upsert(
          state.categories.map((c) => categoryToRow(businessId, c)),
          upsertOpts
        ),
      client
        .from("transactions")
        .upsert(
          state.transactions.map((t) => transactionToRow(businessId, t)),
          upsertOpts
        ),
      client
        .from("budgets")
        .upsert(
          state.budgets.map((b) => budgetToRow(businessId, b)),
          upsertOpts
        ),
      client
        .from("goals")
        .upsert(
          state.goals.map((g) => goalToRow(businessId, g)),
          upsertOpts
        ),
      client
        .from("planned_transactions")
        .upsert(
          state.plannedTransactions.map((p) => plannedToRow(businessId, p)),
          upsertOpts
        ),
      client
        .from("activities")
        .upsert(
          state.activities.map((a) => activityToRow(businessId, a, actorUserId)),
          upsertOpts
        ),
      client
        .from("notifications")
        .upsert(
          state.notifications.map((n) => notificationToRow(businessId, n)),
          upsertOpts
        ),
      client.from("app_settings").upsert(
        [
          { business_id: businessId, key: "todos", value: state.todos },
          { business_id: businessId, key: "year", value: state.selectedYear },
          { business_id: businessId, key: "currency", value: state.currency },
        ],
        { onConflict: "business_id,key" }
      ),
    ]);

    if (results.some((r) => r.error)) return false;

    // Sync local removals (row sets that shrank) — best effort.
    await Promise.all([
      deleteRemoved(client, "accounts", businessId, state.accounts.map((a) => a.id)),
      deleteRemoved(client, "categories", businessId, state.categories.map((c) => c.id)),
      deleteRemoved(client, "transactions", businessId, state.transactions.map((t) => t.id)),
      deleteRemoved(client, "budgets", businessId, state.budgets.map((b) => b.id)),
      deleteRemoved(client, "goals", businessId, state.goals.map((g) => g.id)),
      deleteRemoved(
        client,
        "planned_transactions",
        businessId,
        state.plannedTransactions.map((p) => p.id)
      ),
      deleteRemoved(client, "activities", businessId, state.activities.map((a) => a.id)),
      deleteRemoved(
        client,
        "notifications",
        businessId,
        state.notifications.map((n) => n.id)
      ),
    ]);
    return true;
  } catch {
    return false;
  }
}