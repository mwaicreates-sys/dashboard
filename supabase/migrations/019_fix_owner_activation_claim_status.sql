-- ============================================================
-- MIGRATION 019 — Fix activation claim status for production.
--
-- Production permits only pending, used, and revoked claim statuses.
-- Replacing a pending activation code therefore revokes the prior claim.
-- This migration only replaces the RPC definition; it does not execute it,
-- generate a code, create a claim, or modify existing rows.
-- ============================================================

create or replace function public.generate_owner_activation_code(
  p_business_id uuid,
  p_email text
)
returns text
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

  -- Revoke only the prior pending claim for this business and owner email.
  update public.business_owner_claims
     set status = 'revoked'
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
  );

  update public.businesses
     set owner_name = coalesce(owner_name, v_name),
         owner_email = v_email,
         activation_code = v_code
   where id = p_business_id;

  return v_code;
end;
$$;

grant execute on function public.generate_owner_activation_code(uuid, text) to authenticated;

select '019_fix_owner_activation_claim_status applied' as status;
