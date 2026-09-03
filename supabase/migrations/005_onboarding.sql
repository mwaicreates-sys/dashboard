-- ============================================================
-- MULTI-TENANT SAAS — STEP 5/5: Onboarding helper
--
-- A freshly bootstrapped business starts empty. The client uses this
-- to decide whether to seed starter data (default accounts and the
-- app's standard categories) for a business's first run.
-- ============================================================

create or replace function public.mark_user_business_initialized(
  p_business_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  is_new boolean;
begin
  -- Only members of the business may initialize it
  if not public.is_business_member(p_business_id) then
    raise insufficient_privilege;
  end if;

  select not exists (
    select 1 from public.accounts
    where business_id = p_business_id
  )
  into is_new;

  if is_new then
    -- Seed the app's default category set (mirrors app/data/seed.ts).
    -- Local ids keep the app's string references intact.
    insert into public.categories
      (business_id, local_id, name, category_group, type)
    values
      (p_business_id, 'salary',      'Salary',      'income',      'income'),
      (p_business_id, 'freelance',   'Freelance',   'income',      'income'),
      (p_business_id, 'business',    'Business',    'income',      'income'),
      (p_business_id, 'other-income','Other Income','income',      'income'),
      (p_business_id, 'rent',        'Rent',        'bills',       'expense'),
      (p_business_id, 'utilities',   'Utilities',   'bills',       'expense'),
      (p_business_id, 'internet',    'Internet',    'bills',       'expense'),
      (p_business_id, 'phone',       'Phone',       'bills',       'expense'),
      (p_business_id, 'insurance',   'Insurance',   'bills',       'expense'),
      (p_business_id, 'groceries',   'Groceries',   'expenses',    'expense'),
      (p_business_id, 'transport',   'Transport',   'expenses',    'expense'),
      (p_business_id, 'dining',      'Dining Out',  'expenses',    'expense'),
      (p_business_id, 'shopping',    'Shopping',    'expenses',    'expense'),
      (p_business_id, 'health',      'Health',      'expenses',    'expense'),
      (p_business_id, 'education',   'Education',   'expenses',    'expense'),
      (p_business_id, 'entertainment','Entertainment','expenses',  'expense'),
      (p_business_id, 'emergency',   'Emergency Fund', 'savings',  'expense'),
      (p_business_id, 'vacation',    'Vacation',    'savings',     'expense'),
      (p_business_id, 'stocks',      'Stocks',      'investments', 'expense'),
      (p_business_id, 'retirement',  'Retirement',  'investments', 'expense'),
      (p_business_id, 'crypto',      'Crypto',      'investments', 'expense'),
      (p_business_id, 'loan-payment','Loan Payment','debt',        'expense'),
      (p_business_id, 'credit-card', 'Credit Card', 'debt',        'expense')
    on conflict (business_id, local_id) do nothing;

    insert into public.app_settings (business_id, key, value)
    values (p_business_id, 'initialized', 'true'::jsonb)
    on conflict (business_id, key) do nothing;
  end if;

  return is_new;
end;
$$;