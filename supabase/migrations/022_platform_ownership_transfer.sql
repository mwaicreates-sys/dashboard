-- ============================================================
-- 022_platform_ownership_transfer.sql
-- Atomic transfer of the identity-based platform-admin role.
-- ============================================================

-- Platform transfers are not tenant events. Keep the existing audit
-- table, but allow a platform event to have no business_id.
alter table public.audit_events
  alter column business_id drop not null;

create or replace function public.transfer_platform_ownership(
  p_new_owner_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous_owner_id uuid := auth.uid();
  v_previous_email text;
  v_new_email text;
  v_previous_is_owner boolean;
begin
  -- Serialize transfers so two open admin sessions cannot both complete.
  perform pg_advisory_xact_lock(742391028);

  select is_platform_admin
    into v_previous_is_owner
    from public.profiles
   where id = v_previous_owner_id
   for update;

  if v_previous_owner_id is null or coalesce(v_previous_is_owner, false) = false then
    raise exception 'Only the current platform owner can transfer ownership'
      using errcode = '42501';
  end if;

  if p_new_owner_id is null or p_new_owner_id = v_previous_owner_id then
    raise exception 'A different owner account is required';
  end if;

  select email
    into v_previous_email
    from public.profiles
   where id = v_previous_owner_id;

  select email
    into v_new_email
    from public.profiles
   where id = p_new_owner_id
   for update;

  if not found then
    raise exception 'The new owner profile is not ready';
  end if;

  -- Promote the destination before revoking the source so the platform
  -- always has an owner, while ending with exactly one active owner.
  update public.profiles
     set is_platform_admin = true
   where id = p_new_owner_id;

  update public.profiles
     set is_platform_admin = false
   where is_platform_admin = true
     and id <> p_new_owner_id;

  insert into public.audit_events (
    business_id,
    actor_user_id,
    actor_role,
    action,
    entity_type,
    entity_id,
    metadata
  ) values (
    null,
    v_previous_owner_id,
    'platform_admin',
    'platform_ownership_transferred',
    'platform_ownership',
    p_new_owner_id,
    jsonb_build_object(
      'previous_owner_id', v_previous_owner_id,
      'previous_owner_email', v_previous_email,
      'new_owner_id', p_new_owner_id,
      'new_owner_email', v_new_email
    )
  );

  return jsonb_build_object(
    'success', true,
    'previous_owner_id', v_previous_owner_id,
    'new_owner_id', p_new_owner_id
  );
end;
$$;

revoke all on function public.transfer_platform_ownership(uuid) from public;
grant execute on function public.transfer_platform_ownership(uuid) to authenticated;
