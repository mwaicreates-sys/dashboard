// Phase 5 — /api/admin/transfer-ownership repair.
//
// Proves the proposed (NOT YET APPLIED) migration
// supabase/migrations/20260916010000_platform_ownership_transfer_rpc.sql
// against a disposable PGlite database that reproduces the real production
// public.profiles shape plus the ALREADY-APPLIED Phase 1 lockdown trigger
// (supabase/migrations/20260915190000_lock_platform_admin_column.sql,
// applied to production as "lock_platform_admin_column") — never against
// production itself. Confirmed against live production schema (this
// session, via list_migrations/execute_sql) that:
//   - transfer_platform_ownership() does not exist in production
//   - public.audit_events does not exist in production (so the older,
//     unapplied supabase/migrations/022_platform_ownership_transfer.sql,
//     which both writes to audit_events and never sets this migration's
//     Phase-1-bypass flag, could not run against production as-is and is
//     superseded by this migration, not a candidate to resurrect)
//   - public.current_is_platform_admin() and public.profiles.is_platform_admin
//     match what this fixture reproduces
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const LOCKDOWN_PATH = "supabase/migrations/20260915190000_lock_platform_admin_column.sql";
const TRANSFER_PATH = "supabase/migrations/20260916010000_platform_ownership_transfer_rpc.sql";

const ADMIN = "40000000-0000-4000-8000-000000000001";
const TARGET = "40000000-0000-4000-8000-000000000002";
const OUTSIDER = "40000000-0000-4000-8000-000000000003";
const NONEXISTENT = "40000000-0000-4000-8000-000000000099";

async function profilesDatabase() {
  const db = new PGlite();
  await db.exec(`
    create role authenticated; create role anon;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.role() returns text language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.role', true), '')::text $$;

    create table public.profiles (
      id uuid primary key references auth.users(id),
      full_name text,
      email text,
      is_platform_admin boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create or replace function public.current_is_platform_admin()
      returns boolean language sql stable security definer set search_path to 'public' as
      $$ select coalesce((select p.is_platform_admin from public.profiles p where p.id = auth.uid()), false) $$;

    grant usage on schema public, auth to authenticated, anon;
    grant select on auth.users to authenticated;
    grant select, insert, update, delete on all tables in schema public to authenticated;

    insert into auth.users values ('${ADMIN}'), ('${TARGET}'), ('${OUTSIDER}');
    insert into public.profiles (id, email, is_platform_admin) values
      ('${ADMIN}', 'admin@example.invalid', true),
      ('${TARGET}', 'target@example.invalid', false),
      ('${OUTSIDER}', 'outsider@example.invalid', false);
  `);
  return db;
}

async function asUser(db: PGlite, user: string) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user]);
  await db.query("select set_config('request.jwt.claim.role', 'authenticated', false)");
  await db.exec("set role authenticated");
}

describe.sequential("Phase 5 — transfer_platform_ownership RPC (proposed, unapplied migration)", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = await profilesDatabase();
    await db.exec(readFileSync(LOCKDOWN_PATH, "utf8"));
    await db.exec("reset role");
    await db.exec(readFileSync(TRANSFER_PATH, "utf8"));
  });
  afterAll(async () => { await db?.close(); });

  it("REGRESSION layer 1 (grant): a direct authenticated UPDATE of is_platform_admin is still refused at the grant level", async () => {
    await asUser(db, OUTSIDER);
    await expect(
      db.query("update public.profiles set is_platform_admin = true where id = $1", [OUTSIDER])
    ).rejects.toThrow(/permission denied/i);
    await db.query("rollback"); // the failed statement aborts the session's implicit transaction
  });

  it("REGRESSION layer 2 (trigger backstop): even with a hypothetical broad UPDATE grant, the trigger alone still blocks a direct authenticated change — proving the new bypass flag is not general-purpose", async () => {
    await db.exec("reset role");
    await db.exec("grant update on public.profiles to authenticated"); // simulate "a future migration accidentally re-grants broad UPDATE"
    await asUser(db, OUTSIDER);
    await expect(
      db.query("update public.profiles set is_platform_admin = true where id = $1", [OUTSIDER])
    ).rejects.toThrow(/cannot be changed/i);
    await db.query("rollback");
    await db.exec("reset role");
    await db.exec("revoke update on public.profiles from authenticated");
    await db.exec("grant update (full_name, email) on public.profiles to authenticated");
  });

  it("rejects a non-admin caller", async () => {
    await asUser(db, OUTSIDER);
    await expect(
      db.query("select public.transfer_platform_ownership($1)", [TARGET])
    ).rejects.toThrow(/Platform admin access required/i);
    await db.query("rollback");
  });

  it("rejects self-transfer", async () => {
    await asUser(db, ADMIN);
    await expect(
      db.query("select public.transfer_platform_ownership($1)", [ADMIN])
    ).rejects.toThrow(/different owner account/i);
    await db.query("rollback");
  });

  it("rejects a nonexistent target account", async () => {
    await asUser(db, ADMIN);
    await expect(
      db.query("select public.transfer_platform_ownership($1)", [NONEXISTENT])
    ).rejects.toThrow(/Target account not found/i);
    await db.query("rollback");
  });

  it("SUCCESS: transfers ownership — exactly the caller and target rows change, nobody else is touched", async () => {
    await asUser(db, ADMIN);
    const result = await db.query<{ transfer_platform_ownership: { previous_owner: string; new_owner: string } }>(
      "select public.transfer_platform_ownership($1)", [TARGET]
    );
    expect(result.rows[0].transfer_platform_ownership).toEqual({ previous_owner: ADMIN, new_owner: TARGET });

    await db.exec("reset role");
    const rows = await db.query<{ id: string; is_platform_admin: boolean }>(
      "select id, is_platform_admin from public.profiles order by id"
    );
    const byId = Object.fromEntries(rows.rows.map((r) => [r.id, r.is_platform_admin]));
    expect(byId[ADMIN]).toBe(false); // caller loses admin
    expect(byId[TARGET]).toBe(true); // target gains admin
    expect(byId[OUTSIDER]).toBe(false); // untouched
  });

  it("post-transfer: the OLD admin can no longer call the RPC; the NEW admin can", async () => {
    await asUser(db, ADMIN); // ADMIN no longer has the flag after the prior test
    await expect(
      db.query("select public.transfer_platform_ownership($1)", [OUTSIDER])
    ).rejects.toThrow(/Platform admin access required/i);
    await db.query("rollback");

    await asUser(db, TARGET);
    const result = await db.query<{ transfer_platform_ownership: { previous_owner: string; new_owner: string } }>(
      "select public.transfer_platform_ownership($1)", [OUTSIDER]
    );
    expect(result.rows[0].transfer_platform_ownership).toEqual({ previous_owner: TARGET, new_owner: OUTSIDER });
  });
});
