-- ============================================================
-- MIGRATION 017 — Fix admin_delete_business to allow deleting a
-- provisioned business whose only member is an owner.
--
-- Root cause:
--   business_members has a BEFORE DELETE trigger (guard_last_owner_trg
--   from migration 006) that raises "Cannot remove the final owner of
--   a business" when the last remaining owner row is deleted.
--   admin_delete_business (migration 009) deletes from `businesses`,
--   which cascades DELETE onto business_members — so deleting a
--   business that has a single owner member fires the trigger and
--   aborts the whole operation ("Cannot delete owner").
--
-- Fix:
--   Within admin_delete_business, temporarily disable that trigger
--   for the duration of the delete. This is a platform-admin-only,
--   SECURITY DEFINER operation; the trigger's "cannot remove final
--   owner" rule is intended for individual membership removal, NOT for
--   full business teardown initiated by the platform admin.
--
-- Side effects: all per-business rows are removed via ON DELETE
-- CASCADE on business_id references.
-- ============================================================

create or replace function public.admin_delete_business(
  p_business_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  biz_name       text;
  member_count   integer;
begin
  if not public.is_platform_admin() then
    raise insufficient_privilege;
  end if;

  select name into biz_name from public.businesses where id = p_business_id;
  if biz_name is null then
    raise exception 'Business not found';
  end if;

  select count(*) into member_count
  from public.business_members
  where business_id = p_business_id;

  -- Temporarily disable the last-owner guard so the platform admin can
  -- tear down the entire business (including its sole owner). Re-enabled
  -- unconditionally in the EXCEPTION/END block to be safe.
  execute 'alter table public.business_members disable trigger guard_last_owner_trg';

  begin
    delete from public.businesses where id = p_business_id;
  exception
    when others then
      execute 'alter table public.business_members enable trigger guard_last_owner_trg';
      raise;
  end;
  execute 'alter table public.business_members enable trigger guard_last_owner_trg';

  return jsonb_build_object(
    'success', true,
    'business_id', p_business_id,
    'business_name', biz_name,
    'members_deleted', member_count
  );
end;
$$;

grant execute on function public.admin_delete_business(uuid) to authenticated;
