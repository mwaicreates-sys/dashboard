-- ============================================================
-- MULTI-TENANT SAAS — STEP 3/5: Triggers & new-user bootstrap
-- ============================================================

-- ------------------------------------------------------------
-- Keep updated_at fresh on every tenant-owned table
-- ------------------------------------------------------------
do $$
declare
  t text;
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

-- ------------------------------------------------------------
-- Bootstrap every new auth user:
--   1. a profiles row (id = auth.users.id)
--   2. a personal business (so a fresh signup is instantly usable)
--   3. an owner membership linking the two
-- SECURITY DEFINER: runs as the function owner, bypassing RLS —
-- the user cannot yet be a member of anything.
-- ------------------------------------------------------------
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
  -- 1. profile
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (id) do nothing;

  -- 2. personal business with a unique slug
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

  -- 3. owner membership
  insert into public.business_members (business_id, user_id, role)
  values (new_business_id, new.id, 'owner');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();