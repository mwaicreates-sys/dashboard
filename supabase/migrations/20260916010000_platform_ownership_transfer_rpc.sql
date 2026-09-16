-- Phase 5: repair /api/admin/transfer-ownership, which has called a
-- nonexistent RPC (transfer_platform_ownership) since it was written.
--
-- NOT YET APPLIED. Local preparation only, per the Phase 5 production
-- safety rule — created for review, requires separate approval to apply.
--
-- INTENDED SEMANTICS (recovered from existing code, not guessed):
--   app/admin/settings/page.tsx's own UI copy is unambiguous: "Transfer
--   platform control to a separate Supabase Auth account. Your current
--   Platform Admin access will be revoked after the transfer" and "You are
--   transferring control of the entire SaaS platform to a separate
--   account." This is PLATFORM ownership (profiles.is_platform_admin),
--   not business ownership (business_members.role) — the two are
--   unrelated concepts in this schema and this route only ever touches
--   the former. The route (app/api/admin/transfer-ownership/route.ts)
--   already resolves/invites the target Supabase Auth user and calls
--   caller.rpc("transfer_platform_ownership", { p_new_owner_id }) under
--   the caller's own session — it expects exactly one RPC that flips the
--   flag on both accounts atomically. Nothing else in the app references
--   this RPC or infers a different meaning.
--
-- INTERACTION WITH THE PHASE 1 LOCKDOWN (why this can't be a plain UPDATE):
--   Phase 1's profiles_guard_platform_admin trigger blocks any change to
--   is_platform_admin while the request's JWT role is 'authenticated' —
--   correctly, since that closed a real privilege-escalation bug. But it
--   means even a well-authorized SECURITY DEFINER RPC calling UPDATE
--   directly would ALSO be blocked, because auth.role() reflects the
--   original request's JWT role regardless of the function's security
--   context. This migration extends the guard with a narrow, explicit
--   bypass: a transaction-local flag that ONLY this specific function
--   sets, immediately before the two UPDATEs, and clears immediately
--   after. A direct PostgREST UPDATE from an ordinary authenticated user
--   — the actual attack this guard exists to stop — never sets this flag,
--   so that protection is completely unchanged. Only code that goes
--   through transfer_platform_ownership() can ever move the flag while
--   authenticated.
--
-- AUTHORIZATION (checked inside the function, not left to the caller):
--   - auth.uid() must be set and public.current_is_platform_admin() must
--     be true for the CALLER — re-verified here independently of RLS,
--     matching the existing pattern in admin_create_business() etc.
--   - p_new_owner_id must be a real profiles row and must not equal the
--     caller (no-op self-transfer is rejected, matching the route's own
--     existing guard at app/api/admin/transfer-ownership/route.ts:76-81).
--   - Exactly two rows change: the target gains admin, the caller loses
--     it. No other profile is touched — this is a handoff between the
--     specific caller and the specific target, not a "wipe every admin"
--     operation (nothing in the UI copy or route implies the latter, and
--     assuming it would be a materially different, riskier semantic).
--
-- Idempotent: CREATE OR REPLACE. Reversible: a second call with the
-- arguments swapped un-does it (equivalent to running the transfer again
-- in the other direction), or is_platform_admin can be restored directly
-- as postgres/service_role per the Phase 1 migration's own documented
-- escape hatch.

begin;

create or replace function public.guard_platform_admin_column()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.is_platform_admin
       and coalesce(auth.role(), '') = 'authenticated'
       and coalesce(current_setting('app.platform_ownership_transfer_in_progress', true), '') <> 'true' then
      raise exception 'is_platform_admin cannot be set through this path' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.is_platform_admin is distinct from old.is_platform_admin
     and coalesce(auth.role(), '') = 'authenticated'
     and coalesce(current_setting('app.platform_ownership_transfer_in_progress', true), '') <> 'true' then
    raise exception 'is_platform_admin cannot be changed through this path' using errcode = '42501';
  end if;
  return new;
end;
$$;

comment on function public.guard_platform_admin_column() is
  'Blocks any INSERT/UPDATE on profiles.is_platform_admin issued by the authenticated Postgres role (i.e. via PostgREST with a normal user JWT), EXCEPT while transfer_platform_ownership() is executing its two UPDATEs (a transaction-local flag it alone sets). service_role and direct postgres access are unaffected either way.';

create or replace function public.transfer_platform_ownership(p_new_owner_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  target_exists boolean;
begin
  if caller is null or not public.current_is_platform_admin() then
    raise exception 'Platform admin access required' using errcode = '42501';
  end if;
  if p_new_owner_id is null then
    raise exception 'A new owner account is required' using errcode = '22023';
  end if;
  if p_new_owner_id = caller then
    raise exception 'Choose a different owner account' using errcode = '22023';
  end if;
  select exists(select 1 from public.profiles where id = p_new_owner_id) into target_exists;
  if not target_exists then
    raise exception 'Target account not found' using errcode = '22023';
  end if;

  perform set_config('app.platform_ownership_transfer_in_progress', 'true', true);
  update public.profiles set is_platform_admin = true where id = p_new_owner_id;
  update public.profiles set is_platform_admin = false where id = caller;
  perform set_config('app.platform_ownership_transfer_in_progress', 'false', true);

  return jsonb_build_object('previous_owner', caller, 'new_owner', p_new_owner_id);
end;
$$;

revoke all on function public.transfer_platform_ownership(uuid) from public, anon;
grant execute on function public.transfer_platform_ownership(uuid) to authenticated;

comment on function public.transfer_platform_ownership(uuid) is
  'Platform-ownership handoff for /api/admin/transfer-ownership. Caller must already be platform admin; grants is_platform_admin to p_new_owner_id and revokes it from the caller, atomically. Touches exactly those two rows.';

commit;
