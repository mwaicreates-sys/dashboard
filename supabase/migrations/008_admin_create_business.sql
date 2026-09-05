-- ============================================================
-- 008_admin_create_business.sql
-- PLATFORM ADMIN — create a business workspace (additive, idempotent).
--
-- Reuses the EXACT creation logic from handle_new_user() (migration 003):
-- a unique slug is derived from the name, the business row is inserted,
-- and the CREATING platform admin becomes its owner (the same rule the
-- signup bootstrap uses: the creator owns their business).
--
-- SECURITY DEFINER: RLS cannot see the "creator is not a member yet"
-- state, so the two inserts run as the function owner. The caller must
-- FIRST pass `is_platform_admin()` — decided entirely by the database.
--
-- No existing policy, table, column, or row is modified.
-- Apply in the Supabase SQL editor (same procedure as 001–007).
-- ============================================================

create or replace function public.admin_create_business(
  p_name text,
  p_currency text default 'USD'
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
  candidate       text;
  n               integer := 0;
begin
  -- Platform admins only — the database decides, never the client.
  if not public.is_platform_admin() then
    raise insufficient_privilege;
  end if;

  base_name := nullif(trim(p_name), '');
  if base_name is null then
    raise exception 'Business name is required';
  end if;

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
  values (initcap(base_name), new_slug, upper(coalesce(nullif(trim(p_currency), ''), 'USD')))
  returning id into new_business_id;

  insert into public.business_members (business_id, user_id, role)
  values (new_business_id, auth.uid(), 'owner');

  return new_business_id;
end;
$$;

grant execute on function public.admin_create_business(text, text) to authenticated;