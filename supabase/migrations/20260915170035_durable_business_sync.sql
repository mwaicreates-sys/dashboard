-- Applied to production (utednmplsdnvbocosemr) on 2026-09-15. Purely additive;
-- deploying the new application code still requires retiring old open tabs
-- running the prior snapshot-writer sync path (see docs/persistence-review.md).
-- No existing financial rows, UUIDs, organization relationships, policies or
-- grants on existing tables are rewritten. business_id remains NOT NULL/FK.
begin;

-- The legacy organization schema and business schema coexist. Business-only
-- inserts have no organization; inventing one would grant legacy org access.
alter table public.accounts alter column organization_id drop not null;
alter table public.categories alter column organization_id drop not null;
alter table public.transactions alter column organization_id drop not null;
alter table public.budgets alter column organization_id drop not null;

-- Keep all existing enum labels and values. These are the Entry form's labels.
alter type public.account_type add value if not exists 'checking';
alter type public.account_type add value if not exists 'savings';
alter type public.account_type add value if not exists 'credit';

-- Existing update triggers require these columns. Old rows retain NULL (unknown
-- historical update time); defaults apply only to future inserts.
alter table public.categories add column if not exists updated_at timestamptz;
alter table public.categories alter column updated_at set default now();
alter table public.budgets add column if not exists updated_at timestamptz;
alter table public.budgets alter column updated_at set default now();
alter table public.activities add column if not exists actor_user_id uuid
  references auth.users(id) on delete set null;
alter table public.activities alter column actor_user_id set default auth.uid();

-- One MVCC snapshot, no PostgREST row-limit truncation. SECURITY INVOKER keeps
-- each existing SELECT policy effective, including platform-admin read access.
create or replace function public.read_business_state(p_business_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb := '{}'::jsonb; t text; rows jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.businesses where id = p_business_id
  ) then raise exception 'Business access denied' using errcode = '42501'; end if;
  foreach t in array array['accounts','categories','transactions','budgets',
    'goals','planned_transactions','activities','notifications','app_settings'] loop
    execute format('select coalesce(jsonb_agg(to_jsonb(r) order by r.id), ''[]''::jsonb)
      from public.%I r where business_id = $1', t) into rows using p_business_id;
    result := result || jsonb_build_object(t, rows);
  end loop;
  return result;
end $$;
revoke all on function public.read_business_state(uuid) from public, anon;
grant execute on function public.read_business_state(uuid) to authenticated;

-- Each operation is {table, key, before: complete previously-read row or null,
-- after: writable fields or null}. Only explicit deletions are accepted.
-- The entire call commits or rolls back, including derived balances/budgets.
create or replace function public.apply_business_changes(p_business_id uuid, p_changes jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  op jsonb; t text; k text; key_column text; allowed text[];
  previous jsonb; desired jsonb; current_row jsonb; written jsonb;
  fields text; expressions text; assignments text; changed bigint;
  result jsonb := '[]'::jsonb;
begin
  if auth.uid() is null or not public.is_business_member(p_business_id) then
    raise exception 'Business write access denied' using errcode = '42501';
  end if;
  if jsonb_typeof(p_changes) is distinct from 'array' then
    raise exception 'Changes must be an array' using errcode = '22023';
  end if;
  -- Serializes writes from this API within a tenant, including retry requests.
  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text, 0));
  for op in select value from jsonb_array_elements(p_changes) loop
    t := op->>'table'; k := op->>'key';
    key_column := case when t = 'app_settings' then 'key' else 'local_id' end;
    allowed := case t
      when 'accounts' then array['name','type','opening_balance','current_balance','currency','institution','active']
      when 'categories' then array['name','category_group','type','color','parent_local_id']
      when 'transactions' then array['date','account_local_id','to_account_local_id','category_local_id','planned_local_id','type','amount','description','status','notes','currency']
      when 'budgets' then array['category_local_id','period_id','month','planned_amount','actual_amount']
      when 'goals' then array['name','target_amount','current_amount','target_date','status','currency']
      when 'planned_transactions' then array['date','account_local_id','to_account_local_id','category_local_id','description','amount','type','status','recurrence','currency']
      when 'activities' then array['title','date','notes','status','due_date','priority','completed_at']
      when 'notifications' then array['title','message','type','status','date','action_label','action_href']
      when 'app_settings' then array['value']
      else null end;
    if allowed is null or k is null or k = '' then
      raise exception 'Invalid change target' using errcode = '22023';
    end if;
    if t = 'app_settings' and k not in ('todos','year','currency') then
      raise exception 'Invalid setting' using errcode = '22023';
    end if;
    previous := nullif(op->'before', 'null'::jsonb);
    desired := nullif(op->'after', 'null'::jsonb);
    if desired is not null then
      if jsonb_typeof(desired) <> 'object' or exists (
        select 1 from jsonb_object_keys(desired) c where not (c = any(allowed))
      ) or desired = '{}'::jsonb then
        raise exception 'Invalid writable fields' using errcode = '22023';
      end if;
    end if;
    -- Row locks also protect against concurrent direct REST/legacy updates.
    execute format('select to_jsonb(r) from public.%I r
      where business_id = $1 and %I = $2 for update', t, key_column)
      into current_row using p_business_id, k;
    written := null;
    if desired is null and current_row is null then
      -- Idempotent retry of an acknowledged-or-lost-response deletion.
      null;
    elsif desired is not null and current_row @> desired then
      -- Lost response: identical retry succeeds without another insert/update.
      written := current_row;
    else
      if current_row is distinct from previous then
        raise exception 'Workspace changed elsewhere. Reload before editing this record.'
          using errcode = '40001';
      end if;
      if desired is null then
        execute format('delete from public.%I where business_id = $1 and %I = $2', t, key_column)
          using p_business_id, k;
      elsif current_row is null then
        -- Populate only INSERT fields: database UUID/defaults are preserved.
        -- Legacy budget fields stay required. Supply meaningful values for NEW
        -- business budgets; existing legacy budget values are never rewritten.
        if t = 'budgets' then
          desired := desired || jsonb_build_object(
            'name', desired->>'category_local_id' || ' ' || (desired->>'month'),
            'amount', desired->'planned_amount',
            'period_start', ((desired->>'month') || '-01')::date,
            'period_end', (((desired->>'month') || '-01')::date + interval '1 month - 1 day')::date);
        end if;
        if t = 'transactions' then
          desired := desired || jsonb_build_object('transaction_date', desired->'date');
        end if;
        desired := desired || jsonb_build_object('business_id', p_business_id, key_column, k);
        select string_agg(format('%I', c), ', ' order by c),
          string_agg(format('v.%I', c), ', ' order by c)
          into fields, expressions from jsonb_object_keys(desired) c;
        execute format('insert into public.%I (%s) select %s
          from jsonb_populate_record(null::public.%I, $1) v returning to_jsonb(%I.*)',
          t, fields, expressions, t, t) into written using desired;
      else
        select string_agg(format('%I = v.%I', c, c), ', ' order by c)
          into assignments from jsonb_object_keys(desired) c;
        execute format('update public.%I r set %s
          from jsonb_populate_record(null::public.%I, $1) v
          where r.business_id = $2 and r.%I = $3 returning to_jsonb(r.*)',
          t, assignments, t, key_column) into written using desired, p_business_id, k;
      end if;
      get diagnostics changed = row_count;
      if changed <> 1 then
        raise exception 'Write was not authorized or record disappeared' using errcode = '42501';
      end if;
    end if;
    result := result || jsonb_build_array(jsonb_build_object('table', t, 'key', k, 'row', written));
  end loop;
  return result;
end $$;
revoke all on function public.apply_business_changes(uuid, jsonb) from public, anon;
grant execute on function public.apply_business_changes(uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;
