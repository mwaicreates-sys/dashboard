-- ============================================================
-- MULTI-TENANT SAAS — STEP 4/5: Row Level Security
--
-- Isolation model: a row is visible/writable ONLY when the caller
-- is a member of the owning business. This is the core tenant wall —
-- every business-owned table uses the same predicate.
--
-- business_members / businesses / profiles use user-scoped policies.
-- Enable-all-first, then create policies (idempotent re-runs).
-- ============================================================

alter table public.businesses           enable row level security;
alter table public.business_members     enable row level security;
alter table public.profiles             enable row level security;
alter table public.accounts             enable row level security;
alter table public.categories           enable row level security;
alter table public.transactions         enable row level security;
alter table public.budgets              enable row level security;
alter table public.goals                enable row level security;
alter table public.planned_transactions enable row level security;
alter table public.activities           enable row level security;
alter table public.notifications        enable row level security;
alter table public.app_settings         enable row level security;

-- ------------------------------------------------------------
-- businesses — only members see their own businesses;
-- owners/admins update them; creation happens through the
-- on_auth_user_created bootstrap (and later invite flows).
-- ------------------------------------------------------------
drop policy if exists businesses_select on public.businesses;
create policy businesses_select
  on public.businesses for select
  using (public.is_business_member(id));

drop policy if exists businesses_update on public.businesses;
create policy businesses_update
  on public.businesses for update
  using (public.has_business_role(id, array['owner','admin']))
  with check (public.has_business_role(id, array['owner','admin']));

drop policy if exists businesses_insert on public.businesses;
create policy businesses_insert
  on public.businesses for insert
  with check (
    auth.uid() is not null
    and not exists (
      select 1 from public.business_members m
      where m.user_id = auth.uid()
    )
  );

-- ------------------------------------------------------------
-- business_members — members can see co-members; owners/admins
-- manage memberships. Self-insert is blocked by businesses_insert's
-- "no memberships yet" rule, so tenant joins happen via invites.
-- ------------------------------------------------------------
drop policy if exists business_members_select on public.business_members;
create policy business_members_select
  on public.business_members for select
  using (
    user_id = auth.uid()
    or public.is_business_member(business_id)
  );

drop policy if exists business_members_insert on public.business_members;
create policy business_members_insert
  on public.business_members for insert
  with check (
    public.has_business_role(business_id, array['owner','admin'])
  );

drop policy if exists business_members_update on public.business_members;
create policy business_members_update
  on public.business_members for update
  using (public.has_business_role(business_id, array['owner','admin']))
  with check (public.has_business_role(business_id, array['owner','admin']));

drop policy if exists business_members_delete on public.business_members;
create policy business_members_delete
  on public.business_members for delete
  using (
    public.has_business_role(business_id, array['owner'])
    or user_id = auth.uid()
  );

-- ------------------------------------------------------------
-- profiles — a user sees and edits only their own profile.
-- ------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select
  on public.profiles for select
  using (id = auth.uid());

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert
  on public.profiles for insert
  with check (id = auth.uid());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- ------------------------------------------------------------
-- Business-owned tables — identical tenant wall on every one:
--   select/update/delete → any member of the owning business
--   insert               → any member (authorship tracked app-side)
-- ------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'accounts','categories','transactions','budgets','goals',
    'planned_transactions','activities','notifications','app_settings'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format(
      'create policy %I on public.%I for select
       using (public.is_business_member(business_id))',
      t || '_select', t);

    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format(
      'create policy %I on public.%I for insert
       with check (public.is_business_member(business_id))',
      t || '_insert', t);

    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format(
      'create policy %I on public.%I for update
       using (public.is_business_member(business_id))
       with check (public.is_business_member(business_id))',
      t || '_update', t);

    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format(
      'create policy %I on public.%I for delete
       using (public.is_business_member(business_id))',
      t || '_delete', t);
  end loop;
end $$;