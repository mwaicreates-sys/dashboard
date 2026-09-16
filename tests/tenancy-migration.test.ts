// Phase 4 — tenancy + production schema reconciliation regression tests.
//
// Proves the proposed (NOT YET APPLIED) migration
// supabase/migrations/20260916000000_retire_legacy_organization_rls.sql
// against a disposable PGlite database built from the real production
// schema/policy shape (tests/fixtures/database.ts) — never against
// production itself.
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { legacyDatabase, asUser, BUSINESS_A, BUSINESS_B, USER_A, USER_B, ORG } from "./fixtures/database";

const MIGRATION_PATH = "supabase/migrations/20260916000000_retire_legacy_organization_rls.sql";
const DURABLE_SYNC_PATH = "supabase/migrations/20260915170035_durable_business_sync.sql";

async function snapshot(db: PGlite) {
  const tables = ["accounts", "categories", "transactions", "budgets"];
  const result: Record<string, unknown> = {};
  for (const t of tables) {
    result[t] = (await db.query(`select to_jsonb(r) - 'updated_at' as row from public.${t} r order by id`)).rows;
  }
  return result;
}

describe.sequential("Phase 4 — retire legacy organization RLS (proposed, unapplied migration)", () => {
  let db: PGlite;
  const OUTSIDER = "20000000-0000-4000-8000-000000000003"; // org member of ORG, NOT a business_members row anywhere

  beforeAll(async () => {
    db = await legacyDatabase();
    await db.exec(readFileSync(DURABLE_SYNC_PATH, "utf8"));
    // A user in organization_members for ORG but never added to
    // business_members for BUSINESS_A — the exact "dormant risk" actor from
    // the Phase 1/4 audit: if anyone is ever inserted into
    // organization_members, they get in through the legacy policy alone.
    await db.exec(`insert into auth.users values ('${OUTSIDER}');
      insert into public.organization_members values ('${ORG}','${OUTSIDER}');`);
  });
  afterAll(async () => { await db?.close(); });

  it("PRE-migration: proves the dormant risk is real in this fixture — an org-only member (not a business member) can already read BUSINESS_A's legacy data", async () => {
    await asUser(db, OUTSIDER);
    const rows = await db.query("select id from public.accounts where business_id = $1", [BUSINESS_A]);
    expect(rows.rows.length).toBeGreaterThan(0); // confirms the risk this migration closes is not hypothetical
  });

  it("captures the exact before-state for accounts/categories/transactions/budgets", async () => {
    (globalThis as unknown as { __before?: unknown }).__before = await snapshot(db);
  });

  it("applies the proposed migration without the safety guard aborting (mapping is unambiguous)", async () => {
    await db.exec("reset role"); // the prior test left the session as `authenticated`; DROP POLICY needs the owning role
    await expect(db.exec(readFileSync(MIGRATION_PATH, "utf8"))).resolves.toBeDefined();
  });

  it("DATA PRESERVATION: every row, amount, currency and business/organization link is byte-identical after the migration", async () => {
    const before = (globalThis as unknown as { __before: unknown }).__before;
    const after = await snapshot(db);
    expect(after).toEqual(before); // no financial record disappeared, no amount/currency/ownership changed
  });

  it("the 16 legacy organization policies are gone; the business-model policies are untouched", async () => {
    const policies = await db.query<{ tablename: string; policyname: string }>(
      "select tablename, policyname from pg_policies where tablename in ('accounts','categories','transactions','budgets') order by 1,2"
    );
    const names = policies.rows.map((r) => r.policyname);
    for (const legacy of [
      "accounts_select_member", "accounts_insert_member", "accounts_update_member", "accounts_delete_admin",
      "categories_select_member", "categories_insert_member", "categories_update_admin", "categories_delete_admin",
      "transactions_select_member", "transactions_insert_member", "transactions_update_member", "transactions_delete_member",
      "budgets_select_member", "budgets_insert_member", "budgets_update_member", "budgets_delete_member",
    ]) {
      expect(names).not.toContain(legacy);
    }
    for (const table of ["accounts", "categories", "transactions", "budgets"]) {
      expect(names).toContain(`${table}_member_all`);
    }
  });

  it("SECURITY REGRESSION (closes the dormant risk): the same org-only outsider can no longer read BUSINESS_A's data", async () => {
    await asUser(db, OUTSIDER);
    const rows = await db.query("select id from public.accounts where business_id = $1", [BUSINESS_A]);
    expect(rows.rows).toHaveLength(0); // the exact access from the PRE-migration test above is now gone
  });

  it("SECURITY REGRESSION: ordinary cross-business isolation still holds (Business B cannot read/write Business A)", async () => {
    await asUser(db, USER_B);
    const readRows = await db.query("select id from public.accounts where business_id = $1", [BUSINESS_A]);
    expect(readRows.rows).toHaveLength(0);
    const upd = await db.query("update public.accounts set name='pwned' where business_id=$1 returning id", [BUSINESS_A]);
    expect(upd.rows).toHaveLength(0);
  });

  it("PERSISTENCE REGRESSION: a legitimate business member's real read/write (via the actual RPCs) still works post-migration", async () => {
    // Calls the RPCs directly via SQL, matching persistence.test.ts's own
    // transport pattern — this proves the RPCs themselves still function
    // correctly against the post-migration schema, independent of the JS
    // client layer (which Phase 4 does not touch).
    const rpc = async (name: string, args: Record<string, unknown>) => {
      try {
        const values = name === "read_business_state" ? [args.p_business_id] : [args.p_business_id, JSON.stringify(args.p_changes)];
        const sql = name === "read_business_state" ? "select public.read_business_state($1::uuid) as data"
          : "select public.apply_business_changes($1::uuid,$2::jsonb) as data";
        const result = await db.query<{ data: unknown }>(sql, values);
        return { data: result.rows[0].data, error: null as unknown };
      } catch (error) { return { data: null, error }; }
    };
    await asUser(db, USER_A);
    const before = await rpc("read_business_state", { p_business_id: BUSINESS_A });
    expect(before.error).toBeNull();
    const changes = [{ table: "accounts", key: "post-migration-account", before: null, after: {
      name: "New after migration", type: "checking", opening_balance: 0, current_balance: 0, currency: "USD", active: true,
    } }];
    const after = await rpc("apply_business_changes", { p_business_id: BUSINESS_A, p_changes: changes });
    expect(after.error).toBeNull();
    const restored = await rpc("read_business_state", { p_business_id: BUSINESS_A });
    const accounts = (restored.data as { accounts: Array<{ local_id: string }> }).accounts;
    expect(accounts.some((a) => a.local_id === "post-migration-account")).toBe(true);
  });

  it("is idempotent — re-running the migration is a safe no-op", async () => {
    await db.exec("reset role");
    await expect(db.exec(readFileSync(MIGRATION_PATH, "utf8"))).resolves.toBeDefined();
  });
});

describe("Phase 4 — the migration's safety guard actually aborts on ambiguous data", () => {
  it("refuses to proceed when a table has more than one distinct organization_id -> business_id pair", async () => {
    const db2 = await legacyDatabase();
    await db2.exec(readFileSync(DURABLE_SYNC_PATH, "utf8"));
    // Manufacture the exact ambiguity the guard exists to catch: the same
    // organization now also linked to a SECOND business on one row.
    await db2.exec(`insert into public.accounts (organization_id,business_id,local_id,name,type) values
      ('${ORG}','${BUSINESS_B}','ambiguous-account','Ambiguous','bank');`);
    await expect(db2.exec(readFileSync(MIGRATION_PATH, "utf8"))).rejects.toThrow(/ambiguous organization_id/i);
    // The failed transaction leaves the session in Postgres's "aborted"
    // state until explicitly rolled back — do that before querying again.
    await db2.query("rollback");
    // Confirm the abort was a real transaction rollback — the legacy
    // policies must still be present, not partially dropped.
    const policies = await db2.query<{ policyname: string }>(
      "select policyname from pg_policies where tablename='accounts' and policyname='accounts_select_member'"
    );
    expect(policies.rows).toHaveLength(1);
    await db2.close();
  });
});
