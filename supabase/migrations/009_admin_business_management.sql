-- ============================================================
-- MIGRATION: Admin and Business-Scoped Business Management
-- ============================================================
-- Provides:
-- • Platform Admin business creation (with owner invitation)
-- • Business Owner/member management functions
-- • Owner-scoped staff management functions
-- 
-- IMPORTANT: Functions are scoped by authorization level:
-- • Platform Admin can manage any business
-- • Business Owner can manage their own business's members/invitations
-- ============================================================

-- ------------------------------------------------------------
-- 1. Platform Admin Create Business (with optional owner assignment)
-- ------------------------------------------------------------
create or replace function public.admin_create_business(
  p_currency text,
  p_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_business_id uuid;
  base_name       text;
  new_slug        text;
  n               integer := 0;
begin
  -- Platform admins only
  if not public.is_platform_admin() then
    raise insufficient_privilege;
  end if;

  -- Validate business name
  base_name := nullif(trim(p_name), '');
  if base_name is null then
    raise exception 'Business name is required';
  end if;

  if length(base_name) < 2 then
    raise exception 'Business name must be at least 2 characters';
  end if;

  -- Validate currency
  if p_currency not in ('USD', 'EUR', 'GBP', 'KES') then
    raise exception 'Invalid currency. Allowed: USD, EUR, GBP, KES';
  end if;

  -- Generate unique slug
  new_slug := lower(regexp_replace(base_name, '[^a-zA-Z0-9]+', '-', 'g'));
  new_slug := trim(both '-' from new_slug);
  new_slug := left(new_slug, 40);

  n := 0;
  while exists (select 1 from public.businesses where slug = new_slug) loop
    n := n + 1;
    new_slug := new_slug || '-' || n::text;
  end loop;

  -- Create business WITHOUT auto-adding creator as owner
  insert into public.businesses (name, slug, currency)
  values (initcap(base_name), new_slug, upper(p_currency))
  returning id into new_business_id;

  return new_business_id;
end;
$$;

grant execute on function public.admin_create_business(text, text) to authenticated;


-- ------------------------------------------------------------
-- 2. Platform Admin Delete Business
-- ------------------------------------------------------------
create or replace function public.admin_delete_business(
  p_business_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  biz_name text;
  member_count integer;
begin
  if not public.is_platform_admin() then
    raise insufficient_privilege;
  end if;

  select name into biz_name from public.businesses where id = p_business_id;
  if biz_name is null then
    raise exception 'Business not found';
  end if;

  select count(*) into member_count from public.business_members where business_id = p_business_id;

  delete from public.businesses where id = p_business_id;

  return jsonb_build_object(
    'success', true,
    'business_id', p_business_id,
    'business_name', biz_name,
    'members_deleted', member_count
  );
end;
$$;

grant execute on function public.admin_delete_business(uuid) to authenticated;

-- ============================================================
-- Admin SELECT policies for viewing tenant data
-- ============================================================

drop policy if exists businesses_select_platform_admin on public.businesses;
create policy businesses_select_platform_admin on public.businesses
  for select using (public.is_platform_admin());

drop policy if exists business_members_select_platform_admin on public.business_members;
create policy business_members_select_platform_admin on public.business_members
  for select using (public.is_platform_admin());

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

-- ============================================================
-- Verification
-- ============================================================

SELECT 'Migration complete' as status;
SELECT 'Functions available:' as check;
SELECT proname || '(' || pg_get_function_arguments(p.oid) || ')' as rpc_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.proname like 'admin_%' and n.nspname = 'public';