-- ============================================================
-- 014_admin_create_business_owner_fields.sql
-- Make admin_create_business persist the owner name and owner email.
--
-- The live businesses table has owner_name / owner_email columns
-- (migration 011), but admin_create_business (migration 009) only
-- accepted p_currency + p_name and inserted name/slug/currency —
-- so the owner fields were never saved by the RPC itself.
--
-- The Admin UI ("New Business") already collects and sends:
--   business name  -> p_name
--   currency       -> p_currency
--   owner name     -> p_owner_name
--   owner email    -> p_owner_email   (from its ownerName/ownerEmail inputs)
--
-- This migration redefines the function to accept the same parameter
-- names the app uses and to persist all four business fields, with the
-- owner email normalized to lowercase. It does NOT change the token/claim
-- flow (generate_owner_claim / accept_owner_claim), RLS, the admin
-- authorization check, handle_new_user(), or business routing. The
-- business name always comes from the admin; it is never derived from
-- the owner email, and no extra business or membership is created.
-- ============================================================

create or replace function public.admin_create_business(
  p_currency text,
  p_name text,
  p_owner_name text default null,
  p_owner_email text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_business_id  uuid;
  base_name        text;
  new_slug         text;
  owner_name_clean text;
  owner_email_clean text;
  n                integer := 0;
begin
  -- Platform admins only — the database decides, never the client.
  if not public.is_platform_admin() then
    raise insufficient_privilege;
  end if;

  -- Validate business name (never derived from the email).
  base_name := nullif(trim(p_name), '');
  if base_name is null then
    raise exception 'Business name is required';
  end if;

  if length(base_name) < 2 then
    raise exception 'Business name must be at least 2 characters';
  end if;

  -- Validate currency.
  if p_currency not in ('USD', 'EUR', 'GBP', 'KES') then
    raise exception 'Invalid currency. Allowed: USD, EUR, GBP, KES';
  end if;

  -- Normalize owner fields (email lowercase, trimmed).
  owner_name_clean := nullif(trim(coalesce(p_owner_name, '')), '');
  owner_email_clean := nullif(lower(trim(coalesce(p_owner_email, ''))), '');

  -- Generate unique slug.
  new_slug := lower(regexp_replace(base_name, '[^a-zA-Z0-9]+', '-', 'g'));
  new_slug := trim(both '-' from new_slug);
  new_slug := left(new_slug, 40);

  n := 0;
  while exists (select 1 from public.businesses where slug = new_slug) loop
    n := n + 1;
    new_slug := new_slug || '-' || n::text;
  end loop;

  -- Create business WITHOUT auto-adding creator as owner. Persist the
  -- owner name and owner email (normalized) so the provisioning/claim
  -- flow can rely on them.
  insert into public.businesses (name, slug, currency, owner_name, owner_email)
  values (initcap(base_name), new_slug, upper(p_currency), owner_name_clean, owner_email_clean)
  returning id into new_business_id;

  return new_business_id;
end;
$$;

grant execute on function public.admin_create_business(text, text, text, text) to authenticated;

-- ------------------------------------------------------------
-- Verification
-- ------------------------------------------------------------
select '014_admin_create_business_owner_fields applied' as status;