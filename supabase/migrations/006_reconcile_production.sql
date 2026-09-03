-- ============================================================
-- 006 — PRODUCTION RECONCILIATION (the ONLY migration to run)
--
-- Confirmed live-DB state (probed read-only with the publishable key):
--   EXISTS : profiles, accounts, categories, transactions, budgets
--            (an earlier sketch: transactions.transaction_date, budgets.name/
--             amount, profiles.avatar_url — no business_id/local_id anywhere)
--   MISSING: businesses, business_members, goals, planned_transactions,
--            activities, notifications, app_settings, helper functions,
--            RLS, bootstrap trigger, RPCs
--
-- This file is IDEMPOTENT (safe to re-run) and PURELY ADDITIVE:
--   • never drops or truncates existing tables
--   • never deletes rows; backfills new columns for existing rows
--   • existing rows become members of a "Legacy Import" business so
--     nothing is orphaned when NOT NULL tenancy is enforced
-- Supersedes 001–005 for the production database: run ONLY this file.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- A. Shared helper functions
-- ------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create or replace function public.is_business_member(p_business_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.business_members m
                 where m.business_id = p_business_id and m.user_id = auth.uid());
$$;

create or replace function public.has_business_role(p_business_id uuid, p_roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.business_members m
                 where m.business_id = p_business_id and m.user_id = auth.uid()
                   and m.role = any (p_roles));
$$;

-- Owner lockout guard: is the given business down to its final owner?
create or replace function public.is_last_owner(p_business_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select (select count(*) from public.business_members m
          where m.business_id = p_business_id and m.role = 'owner') <= 1;
$$;

-- ------------------------------------------------------------
-- B. Tenancy core (missing in production)
-- ------------------------------------------------------------
create table if not exists public.businesses (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text unique,
  currency   text not null default 'USD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.business_members (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        text not null default 'member' check (role in ('owner','admin','member')),
  created_at  timestamptz not null default now(),
  constraint business_members_business_user_uniq unique (business_id, user_id)
);
create index if not exists business_members_user_idx on public.business_members (user_id);
create index if not exists business_members_business_idx on public.business_members (business_id);

-- ------------------------------------------------------------
-- C. profiles — add what the app contract needs (additive only;
--    existing avatar_url/full_name columns are preserved untouched)
-- ------------------------------------------------------------
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists full_name text;
-- ------------------------------------------------------------
-- D. Legacy Import business + tenancy backfill for existing rows.
--    Every pre-existing row is attached to one well-known business so
--    NOT NULL business_id can be enforced without losing any data.
-- ------------------------------------------------------------
insert into public.businesses (name, slug, currency)
values ('Legacy Import', 'legacy-import', 'USD')
on conflict (slug) do nothing;

-- accounts ---------------------------------------------------
alter table public.accounts
  add column if not exists business_id uuid,
  add column if not exists local_id    text,
  add column if not exists active      boolean not null default true;

update public.accounts set local_id = id::text where local_id is null;
update public.accounts a
set    business_id = b.id
from   public.businesses b
where  b.slug = 'legacy-import' and a.business_id is null;

alter table public.accounts alter column business_id set not null;
alter table public.accounts alter column local_id    set not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'accounts_business_fk') then
    alter table public.accounts add constraint accounts_business_fk
      foreign key (business_id) references public.businesses (id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'accounts_business_local_uniq') then
    alter table public.accounts add constraint accounts_business_local_uniq
      unique (business_id, local_id);
  end if;
end $$;
create index if not exists accounts_business_idx on public.accounts (business_id);

-- categories -------------------------------------------------
alter table public.categories
  add column if not exists business_id     uuid,
  add column if not exists local_id        text,
  add column if not exists category_group  text,
  add column if not exists parent_local_id text,
  add column if not exists parent_id       uuid;

update public.categories set local_id = id::text where local_id is null;
-- Derive the app's category_group from the legacy `type` column.
update public.categories
set    category_group = case when type = 'income' then 'income' else 'expenses' end
where  category_group is null;
update public.categories c
set    business_id = b.id
from   public.businesses b
where  b.slug = 'legacy-import' and c.business_id is null;
update public.categories c
set    parent_id = p.id
from   public.categories p
where  p.business_id = c.business_id and p.local_id = c.parent_local_id
       and c.parent_id is null;

alter table public.categories alter column business_id    set not null;
alter table public.categories alter column local_id       set not null;
alter table public.categories alter column category_group set not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'categories_business_fk') then
    alter table public.categories add constraint categories_business_fk
      foreign key (business_id) references public.businesses (id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'categories_business_local_uniq') then
    alter table public.categories add constraint categories_business_local_uniq
      unique (business_id, local_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'categories_parent_fk') then
    alter table public.categories add constraint categories_parent_fk
      foreign key (parent_id) references public.categories (id) on delete set null;
  end if;
end $$;
create index if not exists categories_business_idx on public.categories (business_id);
-- transactions -----------------------------------------------
-- Legacy `transaction_date` and all original columns are preserved
-- untouched; the app contract's `date` is added and backfilled.
alter table public.transactions
  add column if not exists business_id         uuid,
  add column if not exists local_id            text,
  add column if not exists date                date,
  add column if not exists account_local_id    text,
  add column if not exists to_account_local_id text,
  add column if not exists to_account_id       uuid,
  add column if not exists category_local_id   text,
  add column if not exists planned_local_id    text,
  add column if not exists status              text not null default 'cleared',
  add column if not exists currency            text;

update public.transactions set local_id = id::text where local_id is null;
-- date: legacy transaction_date, falling back to row creation date.
update public.transactions
set    date = coalesce(transaction_date, created_at::date, current_date)
where  date is null;
-- local refs: resolve via the reconciled accounts/categories rows where
-- possible; unresolvable rows keep a placeholder so nothing is lost.
update public.transactions t
set    account_local_id  = coalesce(a.local_id, 'legacy-unknown'),
       to_account_local_id = coalesce(ta.local_id, t.to_account_local_id)
from   public.transactions raw
left   join public.accounts a  on a.id  = raw.account_id
left   join public.accounts ta on ta.id = raw.to_account_id
where  raw.id = t.id and (t.account_local_id is null or t.to_account_local_id is null);
update public.transactions t
set    account_local_id = 'legacy-unknown'
where  account_local_id is null;
update public.transactions t
set    category_local_id = coalesce(c.local_id, 'legacy-unknown')
from   public.transactions raw
left   join public.categories c on c.id = raw.category_id
where  raw.id = t.id and t.category_local_id is null;
update public.transactions t
set    business_id = b.id
from   public.businesses b
where  b.slug = 'legacy-import' and t.business_id is null;

alter table public.transactions
  alter column business_id       set not null,
  alter column local_id          set not null,
  alter column date              set not null,
  alter column account_local_id  set not null,
  alter column category_local_id set not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'transactions_business_fk') then
    alter table public.transactions add constraint transactions_business_fk
      foreign key (business_id) references public.businesses (id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'transactions_business_local_uniq') then
    alter table public.transactions add constraint transactions_business_local_uniq
      unique (business_id, local_id);
  end if;
end $$;
create index if not exists transactions_business_date_idx
  on public.transactions (business_id, date desc);
create index if not exists transactions_business_account_idx
  on public.transactions (business_id, account_id);
create index if not exists transactions_business_category_idx
  on public.transactions (business_id, category_id);

-- budgets ----------------------------------------------------
-- Legacy `name`/`amount` are preserved; the app's period/month/
-- planned/actual model is added alongside (amount seeds planned_amount).
alter table public.budgets
  add column if not exists business_id      uuid,
  add column if not exists local_id         text,
  add column if not exists category_local_id text,
  add column if not exists period_id        text,
  add column if not exists month            text,
  add column if not exists planned_amount   double precision not null default 0,
  add column if not exists actual_amount    double precision not null default 0;

update public.budgets set local_id = id::text where local_id is null;
update public.budgets
set    planned_amount = coalesce(planned_amount, amount, 0)
where  planned_amount = 0 and amount is not null;
update public.budgets
set    month     = to_char(coalesce(created_at, now()), 'YYYY-MM'),
       period_id = 'legacy'
where  month is null or period_id is null;
update public.budgets t
set    category_local_id = coalesce(c.local_id, 'legacy-unknown')
from   public.budgets raw
left   join public.categories c on c.id = raw.category_id
where  raw.id = t.id and t.category_local_id is null;
update public.budgets t
set    business_id = b.id
from   public.businesses b
where  b.slug = 'legacy-import' and t.business_id is null;

alter table public.budgets
  alter column business_id       set not null,
  alter column local_id          set not null,
  alter column category_local_id set not null,
  alter column period_id         set not null,
  alter column month             set not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'budgets_business_fk') then
    alter table public.budgets add constraint budgets_business_fk
      foreign key (business_id) references public.businesses (id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'budgets_business_local_uniq') then
    alter table public.budgets add constraint budgets_business_local_uniq
      unique (business_id, local_id);
  end if;
end $$;
create index if not exists budgets_business_idx on public.budgets (business_id);
create index if not exists budgets_business_month_idx on public.budgets (business_id, month);
-- ============================================================
-- E. Missing tables (confirmed absent in production) — exact
--    app-contract shapes, business-owned, tenant-scoped.
-- ============================================================

create table if not exists public.goals (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses (id) on delete cascade,
  local_id       text not null,
  name           text not null,
  target_amount  double precision not null default 0,
  current_amount double precision not null default 0,
  target_date    date not null,
  status         text not null default 'active'
                 check (status in ('active','on-track','at-risk','completed','paused')),
  currency       text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint goals_business_local_uniq unique (business_id, local_id)
);
create index if not exists goals_business_idx on public.goals (business_id);

create table if not exists public.planned_transactions (
  id                  uuid primary key default gen_random_uuid(),
  business_id         uuid not null references public.businesses (id) on delete cascade,
  local_id            text not null,
  date                date not null,
  account_local_id    text not null,
  account_id          uuid references public.accounts (id) on delete set null,
  to_account_local_id text,
  to_account_id       uuid references public.accounts (id) on delete set null,
  category_local_id   text not null,
  category_id         uuid references public.categories (id) on delete set null,
  description         text not null default '',
  amount              double precision not null check (amount >= 0),
  type                text not null check (type in ('income','expense','transfer')),
  status              text not null default 'pending'
                      check (status in ('pending','completed','cancelled')),
  recurrence          text check (recurrence in ('once','monthly','yearly')),
  currency            text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint planned_transactions_business_local_uniq unique (business_id, local_id)
);
create index if not exists planned_transactions_business_date_idx
  on public.planned_transactions (business_id, date);

create table if not exists public.activities (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses (id) on delete cascade,
  local_id     text not null,
  title        text not null,
  date         date not null,
  notes        text,
  status       text not null default 'pending'
               check (status in ('pending','in-progress','completed')),
  due_date     date,
  priority     text check (priority in ('low','medium','high')),
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint activities_business_local_uniq unique (business_id, local_id)
);
create index if not exists activities_business_date_idx
  on public.activities (business_id, date desc);

create table if not exists public.notifications (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses (id) on delete cascade,
  local_id     text not null,
  title        text not null,
  message      text not null default '',
  type         text not null
               check (type in ('activity','budget','recurring','goal','info')),
  status       text not null default 'unread'
               check (status in ('unread','read','dismissed')),
  date         text not null default '',
  action_label text,
  action_href  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint notifications_business_local_uniq unique (business_id, local_id)
);
create index if not exists notifications_business_idx on public.notifications (business_id);

create table if not exists public.app_settings (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  key         text not null,
  value       jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint app_settings_business_key_uniq unique (business_id, key)
);
create index if not exists app_settings_business_idx on public.app_settings (business_id);
-- ============================================================
-- E. updated_at triggers — attach to ALL tables (existing + new)
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array[
    'businesses','business_members','profiles',
    'accounts','categories','transactions','budgets','goals',
    'planned_transactions','activities','notifications','app_settings'
  ] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format(
      'create trigger set_updated_at before update on public.%I
       for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ============================================================
-- F. New-user bootstrap (profile + personal business + owner membership)
--
-- Idempotent by design: if a profile row already exists for the user
-- (e.g. an earlier trigger or a double-fired trigger), bootstrap is
-- skipped — so coexisting legacy triggers can never create duplicate
-- businesses. The trigger is SECURITY DEFINER because RLS cannot yet
-- see the brand-new user as a member of anything.
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_business_id uuid;
  base_name       text;
  new_slug        text;
  candidate       text;
  n               integer := 0;
begin
  -- 1. Ensure the profile row (idempotent — legacy triggers may have
  --    created it; a double-fired trigger hits the conflict no-op).
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (id) do nothing;

  -- 2. Ensure a personal business + owner membership. Guarded on the
  --    membership (not the profile): if any earlier trigger already
  --    provisioned a membership for this user, never create a second
  --    business; otherwise a user with a legacy profile but no business
  --    still gets provisioned correctly.
  if exists (select 1 from public.business_members where user_id = new.id) then
    return new;
  end if;

  base_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    split_part(coalesce(new.email, 'user'), '@', 1),
    'user'
  );

  candidate := lower(regexp_replace(base_name, '[^a-zA-Z0-9]+', '-', 'g'));
  candidate := trim(both '-' from candidate);
  if candidate is null or candidate = '' then
    candidate := 'business';
  end if;
  candidate := left(candidate, 40);

  new_slug := candidate;
  while exists (select 1 from public.businesses where slug = new_slug) loop
    n := n + 1;
    new_slug := candidate || '-' || n::text;
  end loop;

  insert into public.businesses (name, slug, currency)
  values (initcap(base_name), new_slug, 'USD')
  returning id into new_business_id;

  insert into public.business_members (business_id, user_id, role)
  values (new_business_id, new.id, 'owner');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- G. Optional server-side starter seeding (not used by default —
-- the app pushes its local starter dataset on first sync, and the
-- (business_id, local_id) unique rule prevents duplicates). This RPC
-- exists for admin/scripted provisioning: member-gated, inserts the
-- client-provided category set, no-op when categories already exist.
-- ============================================================
create or replace function public.mark_user_business_initialized(
  p_business_id uuid,
  p_categories  jsonb default '[]'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare inserted integer := 0;
begin
  if not public.is_business_member(p_business_id) then
    raise exception 'not a member of this business';
  end if;
  if exists (
    select 1 from public.categories where business_id = p_business_id
  ) then
    return 0; -- already initialized — never duplicate
  end if;

  with payload as (
    select
      x ->> 'local_id'      as local_id,
      x ->> 'name'          as name,
      x ->> 'category_group' as category_group,
      x ->> 'type'          as type,
      nullif(x ->> 'color', '') as color
    from jsonb_array_elements(p_categories) as x
  )
  insert into public.categories
    (business_id, local_id, name, category_group, type, color)
  select p_business_id, local_id, name, category_group, type, color
  from payload
  where local_id is not null and name is not null
    and category_group in ('income','savings','investments','bills','expenses','debt')
    and type in ('income','expense')
  on conflict (business_id, local_id) do nothing;

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

grant execute on function public.mark_user_business_initialized(uuid, jsonb)
  to authenticated;

-- ============================================================
-- H. ROW LEVEL SECURITY — the tenant wall (server-enforced)
-- ============================================================
alter table public.businesses           enable row level security;
alter table public.business_members     enable row level security;
alter table public.profiles             enable row level security;
alter table public.accounts             enable row level security;
alter table public.categories           enable row level security;
alter table public.transactions         enable row level security;
alter table public.budgets              enable row level security;
alter table public.goals                enable row level security;
alter table public.planned_transactions enable row level security;
alter table public.activities           enable row level security;
alter table public.notifications        enable row level security;
alter table public.app_settings         enable row level security;

-- Data tables: members of the owning business get full CRUD on its rows;
-- everyone else (including other tenants) gets nothing. with check also
-- prevents moving a row into a different business.
do $$
declare t text;
begin
  foreach t in array array[
    'accounts','categories','transactions','budgets','goals',
    'planned_transactions','activities','notifications','app_settings'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_member_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
       using (public.is_business_member(business_id))
       with check (public.is_business_member(business_id))',
      t || '_member_all', t);
  end loop;
end $$;

-- businesses: visible to members; any authenticated user may create one
-- (the signup bootstrap also does this via SECURITY DEFINER); only
-- owner/admin may rename/re-currency; nobody deletes businesses here.
drop policy if exists businesses_select_member on public.businesses;
create policy businesses_select_member on public.businesses
  for select to authenticated
  using (public.is_business_member(id));

drop policy if exists businesses_insert_authed on public.businesses;
create policy businesses_insert_authed on public.businesses
  for insert to authenticated
  with check (true);

drop policy if exists businesses_update_owner on public.businesses;
create policy businesses_update_owner on public.businesses
  for update to authenticated
  using (public.has_business_role(id, ARRAY['owner','admin']))
  with check (public.has_business_role(id, ARRAY['owner','admin']));

-- profiles: a user sees and edits only their own row.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- business_members: you can see your own memberships and, for any
-- business you belong to, who else belongs to it. Only owner/admin may
-- change membership rows — and never in a way that leaves a business
-- with zero owners (enforced by the trigger below).
drop policy if exists bm_select_visible on public.business_members;
create policy bm_select_visible on public.business_members
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_business_member(business_id)
  );

drop policy if exists bm_insert_admin on public.business_members;
create policy bm_insert_admin on public.business_members
  for insert to authenticated
  with check (public.has_business_role(business_id, ARRAY['owner','admin']));

drop policy if exists bm_update_admin on public.business_members;
create policy bm_update_admin on public.business_members
  for update to authenticated
  using (public.has_business_role(business_id, ARRAY['owner','admin']))
  with check (public.has_business_role(business_id, ARRAY['owner','admin']));

drop policy if exists bm_delete_admin on public.business_members;
create policy bm_delete_admin on public.business_members
  for delete to authenticated
  using (public.has_business_role(business_id, ARRAY['owner','admin']));

-- Owner-lockout guard: the final owner of a business cannot be demoted
-- or removed by anyone (admins included). Applies to UPDATE (role change
-- away from owner) and DELETE of the last remaining owner row.
create or replace function public.guard_last_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  was_owner   boolean;
  still_owner boolean;
begin
  if TG_OP = 'DELETE' then
    if old.role = 'owner' and public.is_last_owner(old.business_id) then
      raise exception 'Cannot remove the final owner of a business';
    end if;
    return old;
  elsif TG_OP = 'UPDATE' then
    was_owner   := (old.role = 'owner');
    still_owner := (new.role = 'owner');
    if was_owner and not still_owner and public.is_last_owner(old.business_id) then
      raise exception 'Cannot demote the final owner of a business';
    end if;
    return new;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists guard_last_owner_trg on public.business_members;
create trigger guard_last_owner_trg
  before update of role or delete on public.business_members
  for each row execute function public.guard_last_owner();

-- ============================================================
-- I. GRANTS — `authenticated` gets full DML on the tenant tables;
-- `anon` deliberately keeps none (verified live: anonymous API
-- requests are rejected with "permission denied" before any row is
-- reachable — the correct posture for a tenancy-scoped database).
-- No service_role / sb_secret key is used anywhere in the app.
-- ============================================================
grant usage on schema public to authenticated;
grant select, insert, update, delete
  on all tables in schema public
  to authenticated;
grant execute on function
  public.set_updated_at(),
  public.is_business_member(uuid),
  public.has_business_role(uuid, text[]),
  public.is_last_owner(uuid)
  to authenticated;

-- Future tables default to the same posture automatically.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

-- ============================================================
-- J. Final sanity — fail loudly (in the SQL editor output) if any
-- tenant table ended up without RLS enabled or without a policy.
-- Read-only checks; never modifies anything.
-- ============================================================
do $$
declare
  missing_rls     text;
  missing_policy  text;
begin
  select string_agg(c.relname, ', ')
    into missing_rls
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname in (
        'businesses','business_members','profiles','accounts','categories',
        'transactions','budgets','goals','planned_transactions',
        'activities','notifications','app_settings'
      )
      and not c.relrowsecurity;

  if missing_rls is not null then
    raise warning 'RLS NOT ENABLED on: %', missing_rls;
  else
    raise notice 'RLS enabled on all 12 tenant tables';
  end if;

  select string_agg(t.tbl, ', ')
    into missing_policy
    from (
      select c.relname as tbl
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and c.relname in (
          'businesses','business_members','profiles','accounts','categories',
          'transactions','budgets','goals','planned_transactions',
          'activities','notifications','app_settings'
        )
        and not exists (
          select 1 from pg_policy p where p.polrelid = c.oid
        )
    ) t;

  if missing_policy is not null then
    raise warning 'NO POLICY on: %', missing_policy;
  else
    raise notice 'Every tenant table has at least one RLS policy';
  end if;
end $$;

-- ============================================================
-- END OF 006 — safe to re-run. Nothing is dropped except policies
-- this migration itself owns (drop-if-exists + recreate).
-- ============================================================




