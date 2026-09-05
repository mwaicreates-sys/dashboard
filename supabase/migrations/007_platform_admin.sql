-- ============================================================
-- 007_platform_admin.sql
-- PLATFORM ADMIN (SaaS operator) — additive, idempotent, safe.
--
-- Introduces the platform-admin concept WITHOUT touching any
-- existing tenancy model, policy, or row:
--   * profiles.is_platform_admin boolean (default false)
--   * is_platform_admin() / current_is_platform_admin() helpers
--   * additive SELECT policies so an authorized platform admin can
--     administer businesses / members / profiles and VIEW any
--     business workspace (read-only).
--
-- Existing member-scoped (tenant-wall) policies are left untouched.
-- No INSERT/UPDATE/DELETE policy is granted to platform admins:
-- admin workspace viewing is deliberately READ-ONLY at the database
-- level, so an admin can never silently act as a business owner.
--
-- Apply in the Supabase SQL editor (same procedure as 001-006).
-- Re-running this file is safe.
-- ============================================================

-- 1) Flag on profiles -----------------------------------------------
alter table public.profiles
  add column if not exists is_platform_admin boolean not null default false;

-- 2) Helpers ---------------------------------------------------------
create or replace function public.is_platform_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select p.is_platform_admin from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

-- Self-check RPC: callable by any authenticated client, definer-run so
-- it works even if profile self-select policies change later.
create or replace function public.current_is_platform_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.is_platform_admin();
$$;

grant execute on function public.current_is_platform_admin() to authenticated, anon;
grant execute on function public.is_platform_admin() to authenticated, anon;

-- 3) Additive read policies (platform admins only) -------------------
drop policy if exists businesses_select_platform_admin on public.businesses;
create policy businesses_select_platform_admin on public.businesses
  for select using (public.is_platform_admin());

drop policy if exists business_members_select_platform_admin on public.business_members;
create policy business_members_select_platform_admin on public.business_members
  for select using (public.is_platform_admin());

drop policy if exists profiles_select_platform_admin on public.profiles;
create policy profiles_select_platform_admin on public.profiles
  for select using (public.is_platform_admin());

-- Read-only visibility into every business workspace:
drop policy if exists accounts_select_platform_admin on public.accounts;
create policy accounts_select_platform_admin on public.accounts
  for select using (public.is_platform_admin());

drop policy if exists categories_select_platform_admin on public.categories;
create policy categories_select_platform_admin on public.categories
  for select using (public.is_platform_admin());

drop policy if exists transactions_select_platform_admin on public.transactions;
create policy transactions_select_platform_admin on public.transactions
  for select using (public.is_platform_admin());

drop policy if exists budgets_select_platform_admin on public.budgets;
create policy budgets_select_platform_admin on public.budgets
  for select using (public.is_platform_admin());

drop policy if exists goals_select_platform_admin on public.goals;
create policy goals_select_platform_admin on public.goals
  for select using (public.is_platform_admin());

drop policy if exists planned_transactions_select_platform_admin on public.planned_transactions;
create policy planned_transactions_select_platform_admin on public.planned_transactions
  for select using (public.is_platform_admin());

drop policy if exists activities_select_platform_admin on public.activities;
create policy activities_select_platform_admin on public.activities
  for select using (public.is_platform_admin());

drop policy if exists notifications_select_platform_admin on public.notifications;
create policy notifications_select_platform_admin on public.notifications
  for select using (public.is_platform_admin());

drop policy if exists app_settings_select_platform_admin on public.app_settings;
create policy app_settings_select_platform_admin on public.app_settings
  for select using (public.is_platform_admin());

-- 4) Designate the first platform admin (run MANUALLY, once — this
--    migration intentionally does NOT modify any user's data):
--
--    update public.profiles
--       set is_platform_admin = true
--     where id = (select id from auth.users where email = 'you@example.com');
-- ============================================================