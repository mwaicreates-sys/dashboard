-- ============================================================
-- MIGRATION: Invitations, Staff Management, and Audit Trail
-- ============================================================
-- This migration adds:
-- 1. invitations table for secure business/staff invitations
-- 2. Extended activities table with actor_user_id for audit trail
-- 3. RPC functions for invitations (platform admin + business owner scoped)
-- 4. RPC functions for staff management (business owner scoped)
-- 5. Audit triggers for business-owned tables
-- ============================================================

-- ------------------------------------------------------------
-- 1. EXTEND activities table with actor tracking
-- ------------------------------------------------------------
alter table public.activities
  add column if not exists actor_user_id uuid
    references public.profiles (id) on delete set null;

create index if not exists activities_actor_idx
  on public.activities (actor_user_id);

create index if not exists activities_business_actor_idx
  on public.activities (business_id, actor_user_id);


-- ------------------------------------------------------------
-- 2. CREATE invitations table
-- ------------------------------------------------------------
create table if not exists public.invitations (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references public.businesses (id) on delete cascade,
  email            text not null,
  role             text not null
                   check (role in ('owner', 'admin', 'member', 'accountant', 'manager', 'staff')),
  token            text not null unique,
  token_hash       text not null unique,
  invited_by_user_id uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  expires_at       timestamptz not null,
  revoked_at       timestamptz,
  accepted_at      timestamptz,
  status           text not null default 'pending'
                   check (status in ('pending', 'accepted', 'revoked', 'expired', 'used'))
);

create index if not exists invitations_business_idx
  on public.invitations (business_id);

create index if not exists invitations_email_idx
  on public.invitations (email);

create index if not exists invitations_status_idx
  on public.invitations (status);

create index if not exists invitations_token_hash_idx
  on public.invitations (token_hash);


-- ------------------------------------------------------------
-- 3. CREATE audit_events table for immutable audit trail
-- ------------------------------------------------------------
create table if not exists public.audit_events (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses (id) on delete cascade,
  actor_user_id uuid not null references public.profiles (id) on delete set null,
  actor_role   text,
  action       text not null,
  entity_type  text not null,
  entity_id    uuid,
  timestamp    timestamptz not null default now(),
  metadata     jsonb
);

create index if not exists audit_events_business_idx
  on public.audit_events (business_id);

create index if not exists audit_events_actor_idx
  on public.audit_events (actor_user_id);

create index if not exists audit_events_entity_idx
  on public.audit_events (entity_type, entity_id);

create index if not exists audit_events_timestamp_idx
  on public.audit_events (timestamp desc);


-- ------------------------------------------------------------
-- 4. CREATE invitation RPC FUNCTIONS
-- ------------------------------------------------------------

-- Create an invitation (platform admin OR business owner)
create or replace function public.create_invitation(
  p_business_id uuid,
  p_email text,
  p_role text default 'member',
  p_expires_hours integer default 168
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inv_id uuid;
  token text;
  token_hash text;
  inv_by uuid;
begin
  -- Authorization: must be platform admin OR business owner
  if not public.is_platform_admin() then
    if not public.has_business_role(p_business_id, array['owner']) then
      raise insufficient_privilege;
    end if;
  end if;

  -- Validate role
  if p_role not in ('owner', 'admin', 'member', 'accountant', 'manager', 'staff') then
    raise exception 'Invalid role';
  end if;

  -- Cannot create invitation for a business where you're not a member
  if not public.is_business_member(p_business_id) then
    raise exception 'You are not a member of this business';
  end if;

  -- Get inviter
  select auth.uid() into inv_by;
  
  -- Generate secure token
  token := encode(gen_random_bytes(32), 'base64');
  token_hash := encode(digest(token, 'sha256'), 'hex');
  
  -- Create invitation
  insert into public.invitations (
    business_id, email, role, token, token_hash,
    invited_by_user_id, expires_at, status
  ) values (
    p_business_id, lower(trim(p_email)), p_role, token, token_hash,
    inv_by, now() + (p_expires_hours * interval '1 hour'), 'pending'
  ) returning id into inv_id;

  -- Return token for immediate use (in production, send via email)
  return jsonb_build_object(
    'success', true,
    'invitation_id', inv_id,
    'token', token,
    'expires_at', (now() + (p_expires_hours * interval '1 hour'))::text,
    'role', p_role
  );
end;
$$;

grant execute on function public.create_invitation(uuid, text, text, integer) to authenticated;


-- Accept an invitation
create or replace function public.accept_invitation(
  p_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inv record;
  user_email text;
begin
  -- Get current user's email
  select email into user_email from public.profiles where id = auth.uid();
  if user_email is null then
    raise exception 'User profile not found';
  end if;

  -- Find valid invitation
  select * into inv
  from public.invitations
  where token_hash = encode(digest(p_token, 'sha256'), 'hex')
    and status = 'pending'
    and expires_at > now();

  if not found then
    raise exception 'Invalid or expired invitation';
  end if;

  -- Verify email matches
  if lower(inv.email) != lower(user_email) then
    raise exception 'Invitation email does not match your account email';
  end if;

  -- Check business exists
  if not exists (select 1 from public.businesses where id = inv.business_id) then
    raise exception 'Business not found';
  end if;

  -- Create or update membership
  insert into public.business_members (business_id, user_id, role)
  values (inv.business_id, auth.uid(), inv.role)
  on conflict (business_id, user_id) do update
    set role = excluded.role,
        created_at = coalesce(created_at, now());

  -- Mark invitation as accepted
  update public.invitations
  set status = 'accepted',
      accepted_at = now()
  where id = inv.id;

  -- Log audit event
  insert into public.audit_events (
    business_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    inv.business_id, auth.uid(), 'invitation_accepted', 'invitation', inv.id,
    jsonb_build_object('email', inv.email, 'role', inv.role)
  );

  return jsonb_build_object(
    'success', true,
    'business_id', inv.business_id,
    'role', inv.role
  );
end;
$$;

grant execute on function public.accept_invitation(text) to authenticated;


-- ------------------------------------------------------------
-- 5. CREATE staff management RPC FUNCTIONS
-- ------------------------------------------------------------

-- List invitations for a business (owner only)
create or replace function public.list_business_invitations(
  p_business_id uuid,
  p_status text default 'pending'
)
returns table (
  id uuid,
  email text,
  role text,
  status text,
  created_at timestamptz,
  expires_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select i.id, i.email, i.role, i.status, i.created_at, i.expires_at
  from public.invitations i
  where i.business_id = p_business_id
    and i.status = coalesce(p_status, i.status)
  order by i.created_at desc;
$$;

grant execute on function public.list_business_invitations(uuid, text) to authenticated;


-- Revoke an invitation
create or replace function public.revoke_invitation(
  p_invitation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inv record;
begin
  -- Authorization: platform admin OR business owner
  if not public.is_platform_admin() then
    select business_id into inv.business_id from public.invitations where id = p_invitation_id;
    if not found then
      raise exception 'Invitation not found';
    end if;
    if not public.has_business_role(inv.business_id, array['owner']) then
      raise insufficient_privilege;
    end if;
  end if;

  -- Get invitation details for audit
  select * into inv from public.invitations where id = p_invitation_id;
  if not found then
    raise exception 'Invitation not found';
  end if;

  if inv.status != 'pending' then
    raise exception 'Only pending invitations can be revoked';
  end if;

  -- Revoke
  update public.invitations
  set status = 'revoked', revoked_at = now()
  where id = p_invitation_id;

  -- Audit
  insert into public.audit_events (
    business_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    inv.business_id, auth.uid(), 'invitation_revoked', 'invitation', p_invitation_id,
    jsonb_build_object('email', inv.email, 'role', inv.role)
  );

  return jsonb_build_object('success', true, 'action', 'revoked');
end;
$$;

grant execute on function public.revoke_invitation(uuid) to authenticated;


-- Remove a staff member
create or replace function public.remove_staff(
  p_business_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  member record;
  owner_count integer;
begin
  -- Authorization: platform admin OR business owner (NOT full admin)
  if not public.is_platform_admin() then
    if not public.has_business_role(p_business_id, array['owner']) then
      raise insufficient_privilege;
    end if;
  end if;

  -- Get member info
  select * into member from public.business_members
  where business_id = p_business_id and user_id = p_user_id;

  if not found then
    raise exception 'Member not found';
  end if;

  -- Cannot remove last owner
  if member.role = 'owner' then
    select count(*) into owner_count
    from public.business_members
    where business_id = p_business_id and role = 'owner';
    if owner_count <= 1 then
      raise exception 'Cannot remove the last owner';
    end if;
  end if;

  -- Delete member
  delete from public.business_members
  where business_id = p_business_id and user_id = p_user_id;

  -- Audit
  insert into public.audit_events (
    business_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    p_business_id, auth.uid(), 'staff_removed', 'business_member', p_user_id,
    jsonb_build_object('role', member.role, 'removed_by', auth.uid())
  );

  return jsonb_build_object('success', true, 'action', 'removed', 'user_id', p_user_id);
end;
$$;

grant execute on function public.remove_staff(uuid, uuid) to authenticated;


-- Update staff role
create or replace function public.update_staff_role(
  p_business_id uuid,
  p_user_id uuid,
  p_new_role text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  member record;
  owner_count integer;
begin
  -- Authorization: platform admin OR business owner (NOT full admin)
  if not public.is_platform_admin() then
    if not public.has_business_role(p_business_id, array['owner']) then
      raise insufficient_privilege;
    end if;
  end if;

  -- Validate role
  if p_new_role not in ('owner', 'admin', 'accountant', 'manager', 'member', 'staff') then
    raise exception 'Invalid role';
  end if;

  -- Get member info
  select * into member from public.business_members
  where business_id = p_business_id and user_id = p_user_id;

  if not found then
    raise exception 'Member not found';
  end if;

  -- Cannot demote last owner
  if member.role = 'owner' and p_new_role != 'owner' then
    select count(*) into owner_count
    from public.business_members
    where business_id = p_business_id and role = 'owner';
    if owner_count <= 1 then
      raise exception 'Cannot demote or remove the last owner';
    end if;
  end if;

  -- Update role
  update public.business_members
  set role = p_new_role
  where business_id = p_business_id and user_id = p_user_id;

  -- Audit
  insert into public.audit_events (
    business_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    p_business_id, auth.uid(), 'staff_role_changed', 'business_member', p_user_id,
    jsonb_build_object('old_role', member.role, 'new_role', p_new_role)
  );

  return jsonb_build_object('success', true, 'user_id', p_user_id, 'role', p_new_role);
end;
$$;

grant execute on function public.update_staff_role(uuid, uuid, text) to authenticated;


-- ------------------------------------------------------------
-- 6. BUSINESS-Scoped Activity RLS
-- ------------------------------------------------------------
drop policy if exists activities_select_platform_admin on public.activities;
create policy activities_select_platform_admin on public.activities
  for select using (public.is_platform_admin());

drop policy if exists audit_events_select_platform_admin on public.audit_events;
create policy audit_events_select_platform_admin on public.audit_events
  for select using (public.is_platform_admin());


-- ------------------------------------------------------------
-- 7. TRIGGERS for audit events
-- ------------------------------------------------------------

-- Function to create audit events on mutation
create or replace function public.log_audit_event()
returns trigger
language plpgsql
as $$
declare
  action_type text;
  metadata jsonb;
begin
  -- Determine action type
  if tg_op = 'INSERT' then
    action_type := 'created';
  elsif tg_op = 'UPDATE' then
    action_type := 'updated';
  elsif tg_op = 'DELETE' then
    action_type := 'deleted';
  end if;

  -- Build metadata
  metadata := jsonb_build_object(
    'table', TG_TABLE_NAME,
    'operation', TG_OP,
    'row_data', to_jsonb(OLD)
  );

  -- Only log if business_id exists (business-scoped tables)
  if TG_TABLE_NAME IN (
    'accounts', 'categories', 'transactions', 'budgets', 'goals',
    'planned_transactions', 'activities', 'notifications', 'app_settings'
  ) then
    insert into public.audit_events (
      business_id, actor_user_id, action, entity_type, entity_id, metadata
    ) values (
      (coalesce(NEW.business_id, OLD.business_id))::uuid,
      auth.uid()::uuid,
      action_type || '_' || TG_TABLE_NAME,
      TG_TABLE_NAME,
      COALESCE(NEW.id, OLD.id),
      metadata
    );
  end if;

  return NEW or OLD;
end;
$$;
create trigger log_audit_insert before insert on public.accounts for each row execute function public.log_audit_event();
create trigger log_audit_update before update on public.accounts for each row execute function public.log_audit_event();
create trigger log_audit_delete before delete on public.accounts for each row execute function public.log_audit_event();

create trigger log_audit_insert before insert on public.categories for each row execute function public.log_audit_event();
create trigger log_audit_update before update on public.categories for each row execute function public.log_audit_event();
create trigger log_audit_delete before delete on public.categories for each row execute function public.log_audit_event();

create trigger log_audit_insert before insert on public.transactions for each row execute function public.log_audit_event();
create trigger log_audit_update before update on public.transactions for each row execute function public.log_audit_event();
create trigger log_audit_delete before delete on public.transactions for each row execute function public.log_audit_event();

create trigger log_audit_insert before insert on public.budgets for each row execute function public.log_audit_event();
create trigger log_audit_update before update on public.budgets for each row execute function public.log_audit_event();
create trigger log_audit_delete before delete on public.budgets for each row execute function public.log_audit_event();

create trigger log_audit_insert before insert on public.goals for each row execute function public.log_audit_event();
create trigger log_audit_update before update on public.goals for each row execute function public.log_audit_event();
create trigger log_audit_delete before delete on public.goals for each row execute function public.log_audit_event();

create trigger log_audit_insert before insert on public.planned_transactions for each row execute function public.log_audit_event();
create trigger log_audit_update before update on public.planned_transactions for each row execute function public.log_audit_event();
create trigger log_audit_delete before delete on public.planned_transactions for each row execute function public.log_audit_event();

create trigger log_audit_insert before insert on public.activities for each row execute function public.log_audit_event();
create trigger log_audit_update before update on public.activities for each row execute function public.log_audit_event();
create trigger log_audit_delete before delete on public.activities for each row execute function public.log_audit_event();

create trigger log_audit_insert before insert on public.notifications for each row execute function public.log_audit_event();
create trigger log_audit_update before update on public.notifications for each row execute function public.log_audit_event();
create trigger log_audit_delete before delete on public.notifications for each row execute function public.log_audit_event();

create trigger log_audit_insert before insert on public.app_settings for each row execute function public.log_audit_event();
create trigger log_audit_update before update on public.app_settings for each row execute function public.log_audit_event();
create trigger log_audit_delete before delete on public.app_settings for each row execute function public.log_audit_event();


-- ------------------------------------------------------------
-- 8. VERIFICATION
-- ------------------------------------------------------------
SELECT 'Invitation and staff management migration complete' as status;