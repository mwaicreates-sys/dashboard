-- ============================================================
-- 015_owner_activation_code.sql
-- OWNER ACTIVATION (email + access code → persistent Supabase session)
--
-- Reuses the EXISTING business_owner_claims infrastructure (same table,
-- same claim/token rows). Adds a human-friendly activation code to each
-- claim so a provisioned owner can activate with:
--
--     owner email + access code (e.g. LUM-4K7Q2M9XRT)
--
-- ...instead of password signup / email confirmation. The code is stored
-- ONLY as a sha256 hash (activation_code_hash) — never plaintext.
--
-- Semantics preserved:
--   * bound to the exact business + owner email
--   * single active code per business+email (new codes retire old ones)
--   * single use (consumed_at / consumed_by recorded on activation)
--   * expiry supported (existing expires_at)
--
-- The internal 256-bit claim token is still generated (claim-link flow
-- keeps working); the owner-facing login is the email + code flow.
-- No RLS changes. No handle_new_user changes. No auto business creation.
-- ============================================================

alter table public.business_owner_claims
  add column if not exists activation_code_hash text,
  add column if not exists consumed_by uuid,
  add column if not exists consumed_at timestamptz;

create index if not exists business_owner_claims_activation_code_hash_idx
  on public.business_owner_claims (activation_code_hash);

-- ------------------------------------------------------------
-- Generate (or regenerate) the owner activation code for a business.
-- Returns the internal claim token AND the owner-facing activation code.
-- Authorization mirrors generate_owner_claim exactly.
-- ------------------------------------------------------------
create or replace function public.generate_owner_activation_code(
  p_business_id uuid,
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email      text;
  v_name       text;
  v_token      text;
  v_token_hash text;
  v_code       text;
  v_code_hash  text;
  v_expires    timestamptz;
  v_claim_id   uuid;
begin
  -- Authorization: must be platform admin OR business owner
  if not public.is_platform_admin() then
    if not public.has_business_role(p_business_id, array['owner']) then
      raise insufficient_privilege;
    end if;
  end if;

  -- The business must exist (provisioned).
  if not exists (select 1 from public.businesses where id = p_business_id) then
    raise exception 'Business not found';
  end if;

  v_email := lower(trim(p_email));
  if v_email is null or v_email = '' then
    raise exception 'Email is required';
  end if;

  -- Owner name comes from the business record (set by admin_create_business).
  select owner_name into v_name from public.businesses where id = p_business_id;

  -- Only ONE active code per business+email: retire any still-pending
  -- claims for this owner before issuing the new one.
  update public.business_owner_claims
     set status = 'expired'
   where business_id = p_business_id
     and lower(email) = v_email
     and status = 'pending';

  -- Internal 256-bit token (kept for the claim-link flow).
  v_token      := encode(gen_random_bytes(32), 'base64');
  v_token_hash := encode(digest(v_token, 'sha256'), 'hex');

  -- Human-readable activation code: LUM- + 10 chars from a 62-char
  -- alphabet (base64 body, stripped of +/=), uppercase for typing.
  -- ~59 bits of entropy — not guessable.
  v_code := 'LUM-' || upper(translate(encode(gen_random_bytes(12), 'base64'), '+/=', ''));
  while length(v_code) < 14 loop
    v_code := 'LUM-' || upper(translate(encode(gen_random_bytes(12), 'base64'), '+/=', ''));
  end loop;
  v_code_hash := encode(digest(v_code, 'sha256'), 'hex');

  v_expires := now() + interval '168 hours';

  insert into public.business_owner_claims (
    business_id, email, name, token, token_hash,
    activation_code_hash, expires_at, status
  ) values (
    p_business_id, v_email, v_name, v_token, v_token_hash,
    v_code_hash, v_expires, 'pending'
  ) returning id into v_claim_id;

  -- Keep the owner contact info on the business in sync (same rule as
  -- generate_owner_claim) so provisioning metadata is never stale.
  update public.businesses
     set owner_name  = coalesce(owner_name, v_name),
         owner_email = v_email
   where id = p_business_id;

  return jsonb_build_object(
    'claim_id',        v_claim_id,
    'business_id',     p_business_id,
    'email',           v_email,
    'token',           v_token,
    'activation_code', v_code,
    'expires_at',      v_expires
  );
end;
$$;

grant execute on function public.generate_owner_activation_code(uuid, text) to authenticated;

-- Legacy admin_create_business overloads (migrations 008/009: name/currency
-- only, no owner fields) are removed so PostgREST can only ever resolve the
-- 4-argument version above. The app has always called it with named
-- parameters matching the 4-arg signature.
drop function if exists public.admin_create_business(text, text);

-- ------------------------------------------------------------
-- Verification
-- ------------------------------------------------------------
select '015_owner_activation_code applied' as status;