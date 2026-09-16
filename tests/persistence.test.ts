import { readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { legacyDatabase, asUser, BUSINESS_A, BUSINESS_B, USER_A, USER_B, ORG } from "./fixtures/database";
import type { CloudState } from "@/lib/cloudSync";

const transport = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ getSupabaseBrowserClient: () => transport }));
import { pullBusinessState, pushBusinessState, businessChanges, ConflictError } from "@/lib/cloudSync";
import { CloudSaveQueue } from "@/lib/cloudSaveQueue";

let db: PGlite;
let original: unknown;
let policies: unknown;
const tables = ["accounts", "categories", "transactions", "budgets"];
async function preservedRows() {
  const result: Record<string, unknown> = {};
  for (const t of tables) result[t] = (await db.query(`select to_jsonb(r) ${["categories", "budgets"].includes(t) ? "- 'updated_at'" : ""} as row from public.${t} r order by id`)).rows;
  return result;
}
async function getPolicies() { return (await db.query("select * from pg_policies order by tablename,policyname")).rows; }

beforeAll(async () => {
  db = await legacyDatabase();
  original = await preservedRows(); policies = await getPolicies();
  // Reproduce the audited production failure in the disposable database first.
  await expect(db.query(`insert into public.transactions
    (business_id,local_id,date,account_local_id,category_local_id,type,amount)
    values ($1,'pre-migration-probe','2026-09-15','legacy-account','legacy-category','expense',1)`,
    [BUSINESS_A])).rejects.toMatchObject({ code: "23502" });
  await db.exec(readFileSync("supabase/migrations/20260915170035_durable_business_sync.sql", "utf8"));
  transport.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    try {
      const values = name === "read_business_state" ? [args.p_business_id] : [args.p_business_id, JSON.stringify(args.p_changes)];
      const sql = name === "read_business_state" ? "select public.read_business_state($1::uuid) as data"
        : "select public.apply_business_changes($1::uuid,$2::jsonb) as data";
      const result = await db.query<{ data: unknown }>(sql, values);
      return { data: result.rows[0].data, error: null };
    } catch (error) { return { data: null, error }; }
  });
});
afterAll(async () => { await db?.close(); });

function entry(state: CloudState, id: string, amount = 7): CloudState {
  return { ...state, transactions: [...state.transactions, {
    id, date: "2026-09-15", accountId: "legacy-account", categoryId: "legacy-category",
    type: "expense", amount, description: id, status: "cleared", currency: "KES",
  }] };
}

describe.sequential("real PostgreSQL migration and application persistence path", () => {
  it("preserves every legacy row and all policies; adds compatible enum labels", async () => {
    expect(await preservedRows()).toEqual(original);
    expect(await getPolicies()).toEqual(policies);
    const labels = await db.query<{ enumlabel: string }>("select enumlabel from pg_enum where enumtypid='public.account_type'::regtype");
    expect(labels.rows.map((r) => r.enumlabel)).toEqual(expect.arrayContaining(["bank", "checking", "savings", "credit"]));
  });

  it("commits an entry and retrieves it through a fresh cloud pull", async () => {
    await asUser(db, USER_A);
    const before = await pullBusinessState(BUSINESS_A);
    const after = await pushBusinessState(BUSINESS_A, entry(before, "test-entry"), before);
    expect(after.transactions.some((t) => t.id === "test-entry")).toBe(true);
    const restored = await pullBusinessState(BUSINESS_A);
    expect(restored.transactions.find((t) => t.id === "test-entry")?.amount).toBe(7);
    expect(restored.cloudRows?.transactions.find((r) => r.local_id === "test-entry")?.organization_id).toBeNull();
    expect(restored.cloudRows?.transactions.find((r) => r.local_id === "legacy-tx")?.organization_id).toBe(ORG);
  });

  it("makes retries idempotent after an acknowledgement is lost", async () => {
    const before = await pullBusinessState(BUSINESS_A), next = entry(before, "retry-entry");
    await pushBusinessState(BUSINESS_A, next, before);
    await pushBusinessState(BUSINESS_A, next, before);
    for (let i = 0; i < 3; i++) {
      const restored = await pullBusinessState(BUSINESS_A);
      expect(restored.transactions.filter((t) => t.id === "retry-entry")).toHaveLength(1);
      expect(businessChanges(BUSINESS_A, restored, restored)).toEqual([]);
    }
  });

  it("does not delete new cloud records missing from a stale snapshot", async () => {
    const oldTab = await pullBusinessState(BUSINESS_A);
    await pushBusinessState(BUSINESS_A, entry(oldTab, "other-tab"), oldTab);
    await pushBusinessState(BUSINESS_A, entry(oldTab, "this-tab"), oldTab);
    const restored = await pullBusinessState(BUSINESS_A);
    expect(restored.transactions.map((t) => t.id)).toEqual(expect.arrayContaining(["other-tab", "this-tab"]));
  });

  it("rejects a stale edit and rolls back the entire batch", async () => {
    const before = await pullBusinessState(BUSINESS_A);
    const edit = (amount: number) => ({ ...before, transactions: before.transactions.map((t) => t.id === "test-entry" ? { ...t, amount } : t) });
    await pushBusinessState(BUSINESS_A, edit(8), before);
    await expect(pushBusinessState(BUSINESS_A, entry(edit(9), "must-rollback"), before)).rejects.toThrow("another session");
    const restored = await pullBusinessState(BUSINESS_A);
    expect(restored.transactions.find((t) => t.id === "test-entry")?.amount).toBe(8);
    expect(restored.transactions.some((t) => t.id === "must-rollback")).toBe(false);
  });

  it("TEST J / conflict typing (Phase 3): a stale-row rejection is a real ConflictError, not a generic Error — CloudSaveQueue's stale-retry-loop fix depends on this exact type", async () => {
    // Uses its own dedicated record (not test-entry, which later tests in
    // this sequential suite depend on) so this test doesn't disturb
    // downstream fixture state.
    const before = await pullBusinessState(BUSINESS_A);
    await pushBusinessState(BUSINESS_A, entry(before, "conflict-typing-record", 1), before);
    const tabA = await pullBusinessState(BUSINESS_A); // Tab A and Tab B both at revision N
    const tabB = tabA;
    const editAmount = (state: CloudState, amount: number) => ({
      ...state, transactions: state.transactions.map((t) => t.id === "conflict-typing-record" ? { ...t, amount } : t),
    });
    await pushBusinessState(BUSINESS_A, editAmount(tabA, 2), tabA); // Tab A saves → revision N+1
    try {
      // Tab B still thinks it's at revision N — must be rejected, not
      // silently overwrite Tab A's already-committed N+1.
      await pushBusinessState(BUSINESS_A, editAmount(tabB, 3), tabB);
      expect.unreachable("expected a conflict rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictError);
    }
    const restored = await pullBusinessState(BUSINESS_A);
    expect(restored.transactions.find((t) => t.id === "conflict-typing-record")?.amount).toBe(2); // Tab A's write wins; Tab B never applied
  });

  it("supports new accounts/categories/budgets and updates legacy rows without changing org links", async () => {
    const before = await pullBusinessState(BUSINESS_A);
    const next: CloudState = { ...before,
      accounts: [...before.accounts, { id: "new-account", name: "New savings", type: "savings", openingBalance: 0, currentBalance: 0, currency: "KES", active: true }],
      categories: before.categories.map((c) => ({ ...c, color: "#112233" })),
      budgets: [...before.budgets.map((b) => ({ ...b, actualAmount: 10 })), { id: "new-budget", categoryId: "legacy-category", periodId: "2026", month: "2026-09", plannedAmount: 40, actualAmount: 0 }],
      activities: [{ id: "new-activity", title: "Test", date: "2026-09-15", status: "pending" }],
    };
    await pushBusinessState(BUSINESS_A, next, before);
    const restored = await pullBusinessState(BUSINESS_A);
    const budget = restored.cloudRows?.budgets.find((r) => r.local_id === "legacy-budget");
    expect(budget).toMatchObject({ organization_id: ORG, name: "Original legacy name", amount: 123 });
    expect(restored.accounts.find((a) => a.id === "new-account")?.type).toBe("savings");
    expect(restored.cloudRows?.activities[0].actor_user_id).toBe(USER_A);
  });

  it("enforces tenant isolation, including a malicious tenant-column payload", async () => {
    await asUser(db, USER_B);
    await expect(pullBusinessState(BUSINESS_A)).rejects.toThrow();
    const before = await pullBusinessState(BUSINESS_B);
    expect(before.transactions).toHaveLength(0);
    const ownState: CloudState = { ...entry(before, "test-entry", 99),
      accounts: [{ id: "legacy-account", name: "B account", type: "checking", openingBalance: 0, currentBalance: 0, currency: "USD", active: true }],
      categories: [{ id: "legacy-category", name: "B category", type: "expense", group: "expenses", color: "#000000" }],
    };
    await pushBusinessState(BUSINESS_B, ownState, before);
    expect((await pullBusinessState(BUSINESS_B)).transactions.map((t) => t.amount)).toEqual([99]);
    const forbidden = await transport.rpc("apply_business_changes", { p_business_id: BUSINESS_A, p_changes: [] });
    expect(forbidden.error.code).toBe("42501");
    const payload = await transport.rpc("apply_business_changes", { p_business_id: BUSINESS_B, p_changes: [
      { table: "accounts", key: "malicious", before: null, after: { business_id: BUSINESS_A, organization_id: ORG } },
    ] });
    expect(payload.error.code).toBe("22023");
    await asUser(db, USER_A);
    expect((await pullBusinessState(BUSINESS_A)).transactions.find((t) => t.id === "test-entry")?.amount).toBe(8);
  });

  it("supports deleting the final row and retries the deletion safely", async () => {
    const before = await pullBusinessState(BUSINESS_A), next = { ...before, activities: [] };
    await pushBusinessState(BUSINESS_A, next, before);
    await pushBusinessState(BUSINESS_A, next, before);
    expect((await pullBusinessState(BUSINESS_A)).activities).toEqual([]);
  });

  it("rolls back an earlier account change when the transaction write fails", async () => {
    const before = await pullBusinessState(BUSINESS_A);
    const invalid = entry(before, "invalid-negative", -1);
    invalid.accounts = before.accounts.map((a) => ({ ...a, currentBalance: a.currentBalance + 999 }));
    await expect(pushBusinessState(BUSINESS_A, invalid, before)).rejects.toThrow("not confirmed");
    const after = await pullBusinessState(BUSINESS_A);
    expect(after.accounts).toEqual(before.accounts);
    expect(after.transactions.some((t) => t.id === "invalid-negative")).toBe(false);
  });

  it("serializes overlapping saves and commits edits arriving during a write", async () => {
    const before = await pullBusinessState(BUSINESS_A);
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    let active = 0, peak = 0;
    const push = vi.fn(async (id: string, next: CloudState, previous: CloudState) => {
      active++; peak = Math.max(peak, active);
      await gate;
      try { return await pushBusinessState(id, next, previous); } finally { active--; }
    });
    const queue = new CloudSaveQueue(BUSINESS_A, before, vi.fn(), push);
    const first = entry(before, "serial-first"); queue.observe(first);
    const flush1 = queue.flush();
    queue.observe(entry(first, "serial-second")); const flush2 = queue.flush();
    expect(flush1).toBe(flush2); release(); await flush2;
    expect(peak).toBe(1); expect(queue.pending).toBe(false);
    expect(push).toHaveBeenCalledTimes(2);
  });

  it("retrieves more than 1000 rows and saves a payload larger than keepalive permits", async () => {
    const before = await pullBusinessState(BUSINESS_A);
    const next = { ...before, transactions: [...before.transactions,
      ...Array.from({ length: 1001 }, (_, index) => ({ id: `large-${index}`, date: "2026-09-15", accountId: "legacy-account", categoryId: "legacy-category",
        type: "expense" as const, amount: 1, description: "Large dataset " + "x".repeat(80), status: "cleared" as const }))] };
    expect(JSON.stringify(businessChanges(BUSINESS_A, before, next)).length).toBeGreaterThan(65536);
    await pushBusinessState(BUSINESS_A, next, before);
    const after = await pullBusinessState(BUSINESS_A);
    expect(after.transactions).toHaveLength(next.transactions.length);
    expect(after.transactions.some((t) => t.id === "large-1000")).toBe(true);
  });

  it("rejects unauthenticated calls", async () => {
    await db.exec("reset role; set role anon");
    const result = await transport.rpc("read_business_state", { p_business_id: BUSINESS_A });
    expect(result.error.code).toBe("42501");
    await asUser(db, USER_A);
  });

  it("TEST H (Phase 3): a record created by another session after this client's hydration is never deleted by an unrelated local push", async () => {
    // Client 1 hydrates first (its snapshot does not contain what client 2
    // is about to create — this is the exact "stale local snapshot" shape
    // the audit flagged, not the already-covered "two additions" case).
    const client1Baseline = await pullBusinessState(BUSINESS_A);
    // Client 2 (a separate session/tab) independently creates a new record.
    const client2Before = await pullBusinessState(BUSINESS_A);
    await pushBusinessState(BUSINESS_A, entry(client2Before, "other-session-record"), client2Before);
    // Client 1 now makes its own, entirely unrelated, local edit and pushes
    // — using its OLD baseline, which never knew "other-session-record"
    // existed. If deletion were driven by "absent from my local snapshot"
    // (the pre-rewrite bug class), this push would delete it.
    await pushBusinessState(BUSINESS_A, entry(client1Baseline, "client1-record"), client1Baseline);
    const restored = await pullBusinessState(BUSINESS_A);
    expect(restored.transactions.some((t) => t.id === "other-session-record")).toBe(true);
    expect(restored.transactions.some((t) => t.id === "client1-record")).toBe(true);
  });

  it("keeps failed writes dirty and retries the exact uncertain batch before newer edits", async () => {
    const before = await pullBusinessState(BUSINESS_A);
    const status = vi.fn(); let loseResponse = true;
    const push = vi.fn(async (id: string, state: CloudState, previous: CloudState) => {
      const saved = await pushBusinessState(id, state, previous);
      if (loseResponse) { loseResponse = false; throw new Error("response lost"); }
      return saved;
    });
    const queue = new CloudSaveQueue(BUSINESS_A, before, status, push);
    const first = entry(before, "queue-entry"); queue.observe(first);
    await expect(queue.flush()).rejects.toThrow("response lost");
    expect(queue.pending).toBe(true); expect(status).toHaveBeenLastCalledWith("error");
    queue.observe(entry(first, "queued-later")); await queue.flush();
    expect(push.mock.calls[1][1]).toBe(first);
    expect(queue.pending).toBe(false);
    expect((await pullBusinessState(BUSINESS_A)).transactions.filter((t) => t.id === "queue-entry")).toHaveLength(1);
  });
});
