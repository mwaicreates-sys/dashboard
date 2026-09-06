-- ============================================================
-- MIGRATION 018 — Reconcile owner activation-code persistence.
--
-- Migration 015 was recorded as applied in production, but the
-- businesses.activation_code column and its plaintext persistence were
-- missing there. The admin UI reads that column when displaying an
-- existing code, while activation verifies the hash on the claim.
--
-- Existing claim hashes are preserved. A hash cannot be converted back
-- into its original plaintext code, so this migration only makes newly
-- generated codes retrievable and keeps their plaintext/hash pair aligned.
--
-- Production uses the reconciled claim columns owner_email, owner_name,
-- token_hash, activation_code_hash, expires_at, and status. Do not
-- reintroduce the legacy email/name/token columns from migration 012.
-- ============================================================

alter table public.businesses
  add column if not exists activation_code text;

create index if not exists businesses_activation_code_idx
  on public.businesses (activation_code);

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
  if not public.current_is_platform_admin() then
    if not public.has_business_role(p_business_id, array['owner']) then
      raise insufficient_privilege;
    end if;
  end if;

  if not exists (select 1 from public.businesses where id = p_business_id) then
    raise exception 'Business not found';
  end if;

  v_email := lower(trim(p_email));
  if v_email is null or v_email = '' then
    raise exception 'Email is required';
  end if;

  select owner_name into v_name
  from public.businesses
  where id = p_business_id;

  -- Only the newly issued claim is active; do not alter unrelated history.
  update public.business_owner_claims
     set status = 'expired'
   where business_id = p_business_id
     and lower(trim(owner_email)) = v_email
     and status = 'pending';

  v_token      := encode(gen_random_bytes(32), 'base64');
  v_token_hash := encode(digest(v_token, 'sha256'), 'hex');

  v_code := 'LUM-' || upper(translate(encode(gen_random_bytes(12), 'base64'), '+/=', ''));
  while length(v_code) < 14 loop
    v_code := 'LUM-' || upper(translate(encode(gen_random_bytes(12), 'base64'), '+/=', ''));
  end loop;
  v_code_hash := encode(digest(v_code, 'sha256'), 'hex');

  v_expires := now() + interval '168 hours';

  insert into public.business_owner_claims (
    business_id, owner_email, owner_name, token_hash,
    activation_code_hash, expires_at, status
  ) values (
    p_business_id, v_email, v_name, v_token_hash,
    v_code_hash, v_expires, 'pending'
  ) returning id into v_claim_id;

  -- Keep the exact returned plaintext beside the hash for admin retrieval.
  update public.businesses
     set owner_name = coalesce(owner_name, v_name),
         owner_email = v_email,
         activation_code = v_code
   where id = p_business_id;

  return jsonb_build_object(
    'claim_id', v_claim_id,
    'business_id', p_business_id,
    'email', v_email,
    'activation_code', v_code,
    'expires_at', v_expires
  );
end;
$$;

grant execute on function public.generate_owner_activation_code(uuid, text) to authenticated;

select '018_reconcile_owner_activation_code applied' as status;
