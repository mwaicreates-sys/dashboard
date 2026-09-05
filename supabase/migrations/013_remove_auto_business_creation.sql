-- ============================================================
-- 013_remove_auto_business_creation.sql
-- REMOVE the automatic personal-business bootstrap.
--
-- The prior on_auth_user_created trigger ran handle_new_user(),
-- which (when no pending owner claim matched at signup time) created
-- a NEW business whose name came from the user's email prefix:
--
--     base_name := split_part(coalesce(new.email,'user'),'@',1)
--     insert into public.businesses (...)   -- "geraldmwaike" etc.
--     insert into public.business_members (..., role 'owner')
--
-- In the provisioned-SaaS model this auto-created a SECOND business
-- for an owner who already claimed a provisioned business, because
-- accept_owner_claim marks the claim 'used' BEFORE the user's auth
-- row exists — so the pending-claim guard in handle_new_user can no
-- longer match, and signup fell through to automatic creation.
--
-- This migration makes handle_new_user a pure PROFILE bootstrap:
-- it inserts the profiles row and nothing else. Businesses are only
-- ever created by the platform admin (admin_create_business) and
-- users are attached to them only through the owner-claim flow
-- (generate_owner_claim / accept_owner_claim) or valid memberships.
-- A user with no membership sees the no-access state.
--
-- The trigger on_auth_user_created stays attached to the function
-- (handle_new_user keeps its trigger signature); we only replace the
-- function body. No RLS, tenancy, claim, or admin logic is altered.
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Profile row only. Falling through to business creation is removed:
  -- businesses are provisioned by platform admins; users are attached
  -- to them via owner claims or explicit memberships. A user with no
  -- membership is intentionally left in the no-access state.
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Drop + recreate the trigger to guarantee the LATEST function body is
-- wired up, even if a bootstrap trigger of the same name already fires.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- Verification
-- ------------------------------------------------------------
select '013_remove_auto_business_creation applied' as status;