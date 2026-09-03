-- ============================================================
-- MULTI-TENANT SAAS — STEP 1/5: Tenancy core
-- businesses · business_members · profiles · helper functions
--
-- Run in the Supabase SQL editor, in file order (001 → 005).
-- Every statement is idempotent: safe to re-run.
-- Nothing here drops tables or destroys existing data.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- updated_at maintenance (shared trigger function)
-- ------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ------------------------------------------------------------
-- Membership helpers.
-- SECURITY DEFINER so RLS policies can consult business_members
-- without recursive policy evaluation.
-- ------------------------------------------------------------
create or replace function public.is_business_member(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.business_members m
    where m.business_id = p_business_id
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.has_business_role(p_business_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.business_members m
    where m.business_id = p_business_id
      and m.user_id = auth.uid()
      and m.role = any (p_roles)
  );
$$;

-- ------------------------------------------------------------
-- Businesses (tenants). One row per resold business.
-- ------------------------------------------------------------
create table if not exists public.businesses (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text unique,
  currency   text not null default 'USD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Memberships: auth.users ↔ businesses (owner | admin | member).
-- A user may belong to many businesses — never hardcode 1:1.
-- ------------------------------------------------------------
create table if not exists public.business_members (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        text not null default 'member'
              check (role in ('owner', 'admin', 'member')),
  created_at  timestamptz not null default now(),
  constraint business_members_business_user_uniq unique (business_id, user_id)
);
create index if not exists business_members_user_idx
  on public.business_members (user_id);
create index if not exists business_members_business_idx
  on public.business_members (business_id);

-- Defensive: add the unique constraint if the table pre-existed without it.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'business_members_business_user_uniq'
  ) then
    alter table public.business_members
      add constraint business_members_business_user_uniq unique (business_id, user_id);
  end if;
end $$;

-- ------------------------------------------------------------
-- Profiles — represents the logged-in user (extension of auth.users).
-- The relationship to businesses lives in business_members, keyed by
-- auth.users.id — never by email.
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text,
  full_name  text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Grants for the app's authenticated role
-- ------------------------------------------------------------
grant usage on schema public to authenticated;
grant select, insert, update, delete
  on all tables in schema public
  to authenticated;
grant execute on function public.set_updated_at() to authenticated;