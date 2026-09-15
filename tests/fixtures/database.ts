import { PGlite } from "@electric-sql/pglite";
import columns from "./production-columns.json";

export const BUSINESS_A = "10000000-0000-4000-8000-000000000001";
export const BUSINESS_B = "10000000-0000-4000-8000-000000000002";
export const USER_A = "20000000-0000-4000-8000-000000000001";
export const USER_B = "20000000-0000-4000-8000-000000000002";
export const ORG = "30000000-0000-4000-8000-000000000001";

/** Disposable PostgreSQL/WASM database. Schema metadata only; NO production rows. */
export async function legacyDatabase() {
  const db = new PGlite();
  await db.exec(`
    create role authenticated; create role anon;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table public.businesses(id uuid primary key);
    create table public.organizations(id uuid primary key);
    create table public.business_members(business_id uuid, user_id uuid);
    create table public.organization_members(organization_id uuid, user_id uuid);
    create function public.is_business_member(b uuid) returns boolean language sql stable as
      $$ select exists(select 1 from public.business_members where business_id=b and user_id=auth.uid()) $$;
    create function public.is_org_member(o uuid) returns boolean language sql stable as
      $$ select exists(select 1 from public.organization_members where organization_id=o and user_id=auth.uid()) $$;
    create type public.account_type as enum ('cash','bank','mobile_money','credit_card','investment','loan','other');
    create type public.transaction_type as enum ('income','expense','transfer');
    insert into auth.users values ('${USER_A}'), ('${USER_B}');
    insert into public.businesses values ('${BUSINESS_A}'), ('${BUSINESS_B}');
    insert into public.organizations values ('${ORG}');
    insert into public.business_members values ('${BUSINESS_A}','${USER_A}'), ('${BUSINESS_B}','${USER_B}');
    insert into public.organization_members values ('${ORG}','${USER_A}');
    alter table public.businesses enable row level security;
    create policy business_select on public.businesses for select using(public.is_business_member(id));
  `);
  for (const table of [...new Set(columns.map((c) => c.table_name))]) {
    const definition = columns.filter((c) => c.table_name === table).map((c) =>
      `"${c.column_name}" ${c.udt_name} ${c.is_nullable === "NO" ? "not null" : ""}
       ${c.column_default ? `default ${c.column_default}` : ""}`);
    const key = table === "app_settings" ? "key" : "local_id";
    definition.push('primary key (id)', `unique (business_id, ${key})`, 'foreign key (business_id) references public.businesses(id)');
    if (columns.some((c) => c.table_name === table && c.column_name === "organization_id")) {
      definition.push('foreign key (organization_id) references public.organizations(id)');
    }
    await db.exec(`create table public.${table} (${definition.join(",")});
      alter table public.${table} enable row level security;
      create policy ${table}_member_all on public.${table} for all
        using(public.is_business_member(business_id)) with check(public.is_business_member(business_id));`);
    if (["accounts", "categories", "transactions", "budgets"].includes(table)) {
      await db.exec(`create policy legacy_org on public.${table} for all
        using(public.is_org_member(organization_id)) with check(public.is_org_member(organization_id));`);
    }
  }
  await db.exec(`
    alter table public.transactions add constraint transactions_amount_check check (amount >= 0);
    create function public.set_updated_at() returns trigger language plpgsql as
      $$ begin new.updated_at=now(); return new; end $$;
    create trigger set_updated_at before update on public.categories for each row execute function public.set_updated_at();
    create trigger set_updated_at before update on public.budgets for each row execute function public.set_updated_at();
    grant usage on schema public,auth to authenticated,anon;
    grant select,insert,update,delete on all tables in schema public to authenticated;
    grant select on auth.users to authenticated;
    insert into public.accounts (organization_id,business_id,local_id,name,type) values
      ('${ORG}','${BUSINESS_A}','legacy-account','Legacy account','bank');
    insert into public.categories (organization_id,business_id,local_id,name,type,category_group) values
      ('${ORG}','${BUSINESS_A}','legacy-category','Legacy category','expense','expenses');
    insert into public.transactions (organization_id,business_id,local_id,date,account_local_id,category_local_id,type,amount)
      values ('${ORG}','${BUSINESS_A}','legacy-tx','2026-09-01','legacy-account','legacy-category','expense',10);
    insert into public.budgets (organization_id,business_id,local_id,name,amount,period_start,period_end,
      category_local_id,period_id,month,planned_amount) values
      ('${ORG}','${BUSINESS_A}','legacy-budget','Original legacy name',123,'2026-09-01','2026-09-30',
       'legacy-category','2026','2026-09',123);
  `);
  return db;
}

export async function asUser(db: PGlite, user: string) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user]);
  await db.exec("set role authenticated");
}
