-- ============================================================
-- MIGRATION: Business Owner Provisioning
-- ============================================================
-- Provides a simple token-based flow for owner provisioning:
-- 1. Platform admin creates business with owner info
-- 2. System generates a claim token (stored in business_owner_claims)
-- 3. Owner visits the app with the token (/login?claim=TOKEN)
-- 4. Owner signs up (or already has account)
-- 5. System auto-creates membership and assigns role
-- ============================================================

-- ------------------------------------------------------------
-- 1. Business owner claims table
-- ------------------------------------------------------------
create table if not exists public.business_owner_claims (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses (id) on delete cascade,
  email        text not null,
  name         text,
  token        text not null unique,
  token_hash   text not null unique,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  used_at      timestamptz,
  status       text not null default 'pending'
               check (status in ('pending', 'used', 'expired'))
);

create index if not exists business_owner_claims_business_idx
  on public.business_owner_claims (business_id);

create index if not exists business_owner_claims_email_idx
  on public.business_owner_claims (email);

create index if not exists business_owner_claims_status_idx
  on public.business_owner_claims (status);

create index if not exists business_owner_claims_token_hash_idx
  on public.business_owner_claims (token_hash);

-- ------------------------------------------------------------
-- 2. Generate claim token for business owner
-- Also sets owner_name and owner_email on the business immediately
-- ------------------------------------------------------------
create or replace function public.generate_owner_claim(
  p_business_id uuid,
  p_email text,
  p_name text default null,
  p_expires_hours integer default 168
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  claim_token text;
  token_hash  text;
  claim_id    uuid;
begin
  -- Authorization: must be platform admin OR business owner
  if not public.is_platform_admin() then
    if not public.has_business_role(p_business_id, array['owner']) then
      raise insufficient_privilege;
    end if;
  end if;

  -- Validate business exists
  if not exists (select 1 from public.businesses where id = p_business_id) then
    raise exception 'Business not found';
  end if;

  -- Validate email
  if p_email is null or trim(p_email) = '' then
    raise exception 'Email is required';
  end if;

  -- Generate secure token
  claim_token := encode(gen_random_bytes(32), 'base64');
  token_hash := encode(digest(claim_token, 'sha256'), 'hex');

  -- Insert claim
  insert into public.business_owner_claims (
    business_id, email, name, token, token_hash, expires_at, status
  ) values (
    p_business_id, lower(trim(p_email)), p_name, claim_token, token_hash,
    now() + (p_expires_hours * interval '1 hour'), 'pending'
  );

  -- Update business with owner info immediately
  update public.businesses
  set owner_name = p_name,
      owner_email = lower(trim(p_email))
  where id = p_business_id;

  return claim_token;
end;
$$;

grant execute on function public.generate_owner_claim(uuid, text, text, integer) to authenticated;

-- ------------------------------------------------------------
-- 3. Accept owner claim (call during signup/signin)
-- ------------------------------------------------------------
create or replace function public.accept_owner_claim(
  p_token text,
  p_user_id uuid,
  p_user_email text,
  p_user_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  claim record;
begin
  -- Find valid claim
  select * into claim
  from public.business_owner_claims
  where token_hash = encode(digest(p_token, 'sha256'), 'hex')
    and status = 'pending'
    and expires_at > now();

  if not found then
    raise exception 'Invalid or expired claim token';
  end if;

  -- Verify email matches
  if lower(claim.email) != lower(p_user_email) then
    raise exception 'Claim email does not match your account email';
  end if;

  -- Check business exists
  if not exists (select 1 from public.businesses where id = claim.business_id) then
    raise exception 'Business not found';
  end if;

  -- Create or update membership as owner
  insert into public.business_members (business_id, user_id, role)
  values (claim.business_id, p_user_id, 'owner')
  on conflict (business_id, user_id) do update
    set role = excluded.role,
        created_at = coalesce(created_at, now());

  -- Update business with owner info
  update public.businesses
  set owner_name = coalesce(claim.name, owner_name),
      owner_email = claim.email
  where id = claim.business_id;

  -- Mark claim as used
  update public.business_owner_claims
  set status = 'used', used_at = now()
  where id = claim.id;

  return jsonb_build_object(
    'success', true,
    'business_id', claim.business_id
  );
end;
$$;

grant execute on function public.accept_owner_claim(text, uuid, text, text) to authenticated;

-- ------------------------------------------------------------
-- 4. Update handle_new_user to check for pending owner claims
-- This prevents auto-creating personal business for claimed owners
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
  pending_claim   record;
begin
  -- 1. profile
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (id) do nothing;

  -- Check if user has a pending owner claim
  select * into pending_claim
  from public.business_owner_claims
  where email = lower(new.email)
    and status = 'pending'
    and expires_at > now();

  if found then
    -- User has a pending claim - skip personal business creation
    -- The claim will be accepted separately via accept_owner_claim
    return new;
  end if;

  -- 2. personal business with a unique slug (only for non-claimed users)
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
  n := 0;
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

-- ------------------------------------------------------------
-- 5. Verification
-- ------------------------------------------------------------
SELECT 'Business owner provisioning migration complete' as status;