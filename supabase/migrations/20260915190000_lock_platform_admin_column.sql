-- Phase 1 security lockdown: close a confirmed privilege-escalation path.
--
-- ROOT CAUSE (verified live against production before writing this fix):
--   public.profiles is a normal RLS-protected table. The profiles_update_own
--   policy (using/with check: id = auth.uid()) correctly restricts which ROW
--   an authenticated user may touch, but places no restriction on which
--   COLUMNS within that row may change. `authenticated` additionally held a
--   plain table-level UPDATE grant on profiles (GRANT UPDATE ON profiles TO
--   authenticated, with no column list), which implicitly covers every
--   column, including is_platform_admin. The combination let any signed-in
--   user run, via ordinary PostgREST/the app's own client:
--
--     update public.profiles set is_platform_admin = true where id = auth.uid()
--
--   which passes both the grant check and the RLS policy.
--   current_is_platform_admin() (SECURITY DEFINER) trusts this column
--   directly, and every platform_admin_select_* policy across accounts,
--   transactions, budgets, goals, planned_transactions, activities,
--   notifications and business_members trusts that function — so this one
--   writable column was a full cross-business financial-data read bypass,
--   reachable with no application exploit, just the user's own session.
--
--   Confirmed NOT an issue for other users' rows: profiles_update_own's
--   row-level check already prevented updating anyone else's profile row,
--   admin flag or otherwise. The gap was specifically "own row, forbidden
--   column."
--
--   Confirmed no legitimate workflow currently writes is_platform_admin
--   through the `authenticated` role: no RPC in this schema sets it
--   (transfer_platform_ownership, referenced by
--   app/api/admin/transfer-ownership/route.ts, does not exist in this
--   database at all — that route is independently broken, unrelated to
--   this fix, not touched here). handle_new_user() (fires on auth.users
--   insert, SECURITY DEFINER, not invoked as `authenticated`) never sets
--   this column either. The only existing platform admin was set directly
--   as postgres, outside PostgREST.
--
-- FIX — two independent layers (defense in depth), neither of which
-- modifies any existing row or existing admin:
--
--   1. Column-level grant: authenticated may only UPDATE the columns the
--      app actually edits (full_name, email — confirmed against
--      app/components/shell/ProfileTab.tsx's own update payload).
--      is_platform_admin, id, created_at, updated_at, and avatar_url
--      (currently unused by any app code) are no longer updatable by that
--      role at the grant level, regardless of which row RLS would
--      otherwise allow.
--
--   2. A BEFORE INSERT OR UPDATE trigger that hard-blocks any attempt to
--      set/change is_platform_admin specifically while executing as the
--      `authenticated` Postgres role (i.e. via PostgREST using a normal
--      user's JWT). This is the authoritative backstop: it holds even if a
--      future migration accidentally re-grants broad UPDATE on this table,
--      and it also closes the parallel INSERT path (authenticated also
--      held table-level INSERT on profiles; a client could otherwise race
--      handle_new_user() and insert their own profile row with
--      is_platform_admin = true before the trigger-created row exists).
--      service_role and direct postgres/SQL-editor access are unaffected —
--      the check only fires for auth.role() = 'authenticated'.
--
-- Idempotent: safe to re-run (REVOKE/GRANT, CREATE OR REPLACE FUNCTION, and
-- DROP TRIGGER IF EXISTS + CREATE TRIGGER all converge to the same end
-- state). No data is modified — SELECT/INSERT/DELETE on profiles and every
-- other column's UPDATE behavior, every existing RLS policy, and every
-- existing is_platform_admin value are unchanged.

begin;

-- ---- 1. Column-level UPDATE grant, replacing the broad table-level one ----
revoke update on public.profiles from authenticated;
grant update (full_name, email) on public.profiles to authenticated;

comment on column public.profiles.is_platform_admin is
  'Platform-admin flag. NOT client-writable: `authenticated` has no UPDATE '
  'grant on this column (see 20260915190000_lock_platform_admin_column.sql), '
  'and the profiles_guard_platform_admin trigger blocks any attempt to '
  'set/change it while running as the authenticated role. Change only as '
  'postgres or service_role.';

-- ---- 2. Trigger backstop: authoritative even if grants ever regress ----
create or replace function public.guard_platform_admin_column()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.is_platform_admin and coalesce(auth.role(), '') = 'authenticated' then
      raise exception 'is_platform_admin cannot be set through this path' using errcode = '42501';
    end if;
    return new;
  end if;

  -- tg_op = 'UPDATE'
  if new.is_platform_admin is distinct from old.is_platform_admin
     and coalesce(auth.role(), '') = 'authenticated' then
    raise exception 'is_platform_admin cannot be changed through this path' using errcode = '42501';
  end if;
  return new;
end;
$$;

comment on function public.guard_platform_admin_column() is
  'Blocks any INSERT/UPDATE on profiles.is_platform_admin issued by the '
  'authenticated Postgres role (i.e. via PostgREST with a normal user JWT). '
  'service_role and direct postgres access are unaffected. Defense-in-depth '
  'alongside the column-level grant revoke in the same migration.';

drop trigger if exists profiles_guard_platform_admin on public.profiles;
create trigger profiles_guard_platform_admin
  before insert or update on public.profiles
  for each row
  execute function public.guard_platform_admin_column();

commit;
