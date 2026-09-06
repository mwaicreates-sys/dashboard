-- ============================================================
-- DEMO SEED SCRIPT — existing Demo Business only
-- Idempotent: refreshes only rows owned by this seed.
-- Run in Supabase SQL Editor (service_role required).
-- ============================================================

-- ============================================================
-- PHASE 1: CLEANUP
-- ============================================================
DO $$
DECLARE
  existing_biz_id uuid;
BEGIN
  SELECT id INTO existing_biz_id
  FROM public.businesses
  WHERE slug IN ('demo-business', 'mwai-co-services')
     OR name IN ('Demo Business', 'Mwai & Co. Services')
  ORDER BY CASE
    WHEN slug = 'demo-business' THEN 1
    WHEN name = 'Demo Business' THEN 2
    ELSE 3
  END
  LIMIT 1;
  IF existing_biz_id IS NULL THEN
    RAISE EXCEPTION 'Existing Demo Business not found; refusing to create a new business.';
  END IF;
  RAISE NOTICE 'Refreshing existing demo business: %', existing_biz_id;
END $$;

-- ============================================================
-- PHASE 2: RESOLVE EXISTING BUSINESS
-- ============================================================
-- Store business ID for subsequent inserts
CREATE TEMP TABLE demo_biz (id uuid PRIMARY KEY);
INSERT INTO demo_biz
SELECT id
FROM public.businesses
WHERE slug IN ('demo-business', 'mwai-co-services')
   OR name IN ('Demo Business', 'Mwai & Co. Services')
ORDER BY CASE
  WHEN slug = 'demo-business' THEN 1
  WHEN name = 'Demo Business' THEN 2
  ELSE 3
END
LIMIT 1;

-- ============================================================
-- PHASE 3: CATEGORIES
-- ============================================================
INSERT INTO public.categories (business_id, local_id, name, category_group, type, color, parent_local_id)
SELECT d.id, v.local_id, v.name, v.category_group, v.type, v.color, v.parent_local_id
FROM demo_biz d, (VALUES
  ('inc-1', 'Client Payments',      'income', 'income', '#22c55e', NULL),
  ('inc-2', 'Website Projects',     'income', 'income', '#16a34a', NULL),
  ('inc-3', 'Design Services',      'income', 'income', '#15803d', NULL),
  ('inc-4', 'Consulting',           'income', 'income', '#4ade80', NULL),
  ('inc-5', 'Retainers',            'income', 'income', '#86efac', NULL),
  ('inc-6', 'Other Income',         'income', 'income', '#bbf7d0', NULL),
  ('exp-1',  'Advertising & Marketing', 'expenses', 'expense', '#ef4444', NULL),
  ('exp-2',  'Software & Subscriptions','expenses','expense','#f97316', NULL),
  ('exp-3',  'Internet & Phone',        'bills',  'expense','#eab308', NULL),
  ('exp-4',  'Transport',               'expenses','expense','#84cc16', NULL),
  ('exp-5',  'Office Supplies',         'expenses','expense','#22d3ee', NULL),
  ('exp-6',  'Equipment',               'expenses','expense','#a855f7', NULL),
  ('exp-7',  'Salaries & Contractors',  'expenses','expense','#ec4899', NULL),
  ('exp-8',  'Rent',                    'bills',  'expense','#f43f5e', NULL),
  ('exp-9',  'Utilities',               'bills',  'expense','#fb923c', NULL),
  ('exp-10', 'Meals & Entertainment',   'expenses','expense','#fbbf24', NULL),
  ('exp-11', 'Bank Charges',            'expenses','expense','#94a3b8', NULL),
  ('exp-12', 'Taxes',                   'expenses','expense','#64748b', NULL),
  ('exp-13', 'Miscellaneous',           'expenses','expense','#78716c', NULL),
  ('xfer-1', 'Account Transfer',    'investments', 'expense', '#3B7A9E', NULL),
  ('xfer-2', 'M-Pesa Transfer',     'investments', 'expense', '#4A6FA5', NULL),
  ('xfer-3', 'Investment Transfer', 'investments', 'expense', '#5B8C5A', NULL),
  ('xfer-4', 'Credit Card Payment', 'investments', 'expense', '#7C3AED', NULL)
) AS v(local_id, name, category_group, type, color, parent_local_id);

-- ============================================================
-- PHASE 4: ACCOUNTS
-- ============================================================
INSERT INTO public.accounts (business_id, local_id, name, type, opening_balance, current_balance, currency, institution, active)
SELECT d.id, v.local_id, v.name, v.type, v.opening_balance, v.current_balance, v.currency, v.institution, v.active
FROM demo_biz d, (VALUES
  ('a1', 'KCB Business Account',  'checking',   185000, 1253500, 'KES', 'KCB Bank',     true),
  ('a2', 'M-Pesa Till',           'checking',    42500,  38000,  'KES', 'Safaricom',    true),
  ('a3', 'Office Cash',           'checking',    18000,  22000,  'KES', NULL,           true),
  ('a4', 'Business Credit Card',  'credit',          0,  25000,  'KES', 'KCB Bank',     true),
  ('a5', 'CIC Investment Account','investment', 100000, 155000, 'KES', 'CIC Insurance',true)
) AS v(local_id, name, type, opening_balance, current_balance, currency, institution, active);

-- ============================================================
-- PHASE 5: TRANSACTIONS
-- ============================================================
INSERT INTO public.transactions (
  business_id, local_id, date, account_local_id, to_account_local_id,
  category_local_id, type, amount, description, status, notes, currency
)
SELECT d.id, v.local_id, v.date, v.account_local_id, v.to_account_local_id,
       v.category_local_id, v.type, v.amount, v.description, v.status, v.notes, v.currency
FROM demo_biz d, (VALUES
  ('tx-001', '2026-01-05', 'a1', NULL, 'inc-2',  'income',    85000, 'Website project — ABC Motors',       'cleared', 'Phase 1 website', 'KES'),
  ('tx-002', '2026-01-08', 'a1', NULL, 'exp-2',  'expense',    4500, 'Adobe Creative Cloud',               'cleared', 'Monthly sub', 'KES'),
  ('tx-003', '2026-01-10', 'a1', NULL, 'exp-3',  'expense',    3000, 'Internet & office phone',            'cleared', NULL, 'KES'),
  ('tx-004', '2026-01-12', 'a1', NULL, 'exp-8',  'expense',   25000, 'Office rent — January',              'cleared', NULL, 'KES'),
  ('tx-005', '2026-01-15', 'a1', NULL, 'inc-5',  'income',    75000, 'Monthly retainer — XYZ Corp',       'cleared', NULL, 'KES'),
  ('tx-006', '2026-01-18', 'a2', NULL, 'exp-4',  'expense',    5000, 'Transport — client visits',          'cleared', NULL, 'KES'),
  ('tx-007', '2026-01-20', 'a2', NULL, 'exp-1',  'expense',   15000, 'Facebook / Instagram ads',           'cleared', 'Campaign Jan', 'KES'),
  ('tx-008', '2026-01-22', 'a1', 'a2', 'xfer-2', 'transfer',  50000, 'KCB → M-Pesa float top-up',         'cleared', NULL, 'KES'),
  ('tx-009', '2026-01-25', 'a1', NULL, 'exp-7',  'expense',   35000, 'Contractor — frontend developer',    'cleared', 'Web build', 'KES'),
  ('tx-010', '2026-01-28', 'a1', NULL, 'exp-9',  'expense',    4000, 'Utilities — water & electricity',    'cleared', NULL, 'KES'),
  ('tx-011', '2026-01-30', 'a1', NULL, 'inc-4',  'income',    45000, 'Consulting — Tech Startup advisory', 'cleared', NULL, 'KES'),
  ('tx-012', '2026-02-03', 'a1', NULL, 'inc-2',  'income',   120000, 'Website project — Retail Co',        'cleared', NULL, 'KES'),
  ('tx-013', '2026-02-05', 'a1', NULL, 'exp-2',  'expense',    4500, 'Adobe Creative Cloud',               'cleared', 'Monthly sub', 'KES'),
  ('tx-014', '2026-02-07', 'a1', NULL, 'exp-3',  'expense',    3000, 'Internet & office phone',            'cleared', NULL, 'KES'),
  ('tx-015', '2026-02-10', 'a1', NULL, 'exp-8',  'expense',   25000, 'Office rent — February',             'cleared', NULL, 'KES'),
  ('tx-016', '2026-02-12', 'a1', NULL, 'inc-5',  'income',    75000, 'Monthly retainer — XYZ Corp',       'cleared', NULL, 'KES'),
  ('tx-017', '2026-02-15', 'a2', NULL, 'exp-4',  'expense',    6500, 'Transport — site inspections',       'cleared', NULL, 'KES'),
  ('tx-018', '2026-02-18', 'a4', NULL, 'exp-6',  'expense',   45000, 'Equipment — MacBook Pro',            'cleared', 'Hardware', 'KES'),
  ('tx-019', '2026-02-20', 'a2', NULL, 'exp-1',  'expense',   18000, 'Facebook / Instagram ads',           'cleared', 'Campaign Feb', 'KES'),
  ('tx-020', '2026-02-22', 'a1', 'a2', 'xfer-2', 'transfer',  40000, 'KCB → M-Pesa float top-up',         'cleared', NULL, 'KES'),
  ('tx-021', '2026-02-25', 'a1', NULL, 'exp-7',  'expense',   30000, 'Contractor — UI/UX designer',        'cleared', 'Brand refresh', 'KES'),
  ('tx-022', '2026-02-28', 'a1', NULL, 'inc-3',  'income',    60000, 'Design services — brand identity',   'cleared', NULL, 'KES'),
  ('tx-023', '2026-03-03', 'a1', NULL, 'inc-2',  'income',    95000, 'Website project — Hotel Serena',     'cleared', NULL, 'KES'),
  ('tx-024', '2026-03-05', 'a1', NULL, 'exp-2',  'expense',    4500, 'Adobe Creative Cloud',               'cleared', 'Monthly sub', 'KES'),
  ('tx-025', '2026-03-07', 'a1', NULL, 'exp-3',  'expense',    3000, 'Internet & office phone',            'cleared', NULL, 'KES'),
  ('tx-026', '2026-03-10', 'a1', NULL, 'exp-8',  'expense',   25000, 'Office rent — March',                'cleared', NULL, 'KES'),
  ('tx-027', '2026-03-12', 'a1', NULL, 'inc-5',  'income',    75000, 'Monthly retainer — XYZ Corp',       'cleared', NULL, 'KES'),
  ('tx-028', '2026-03-15', 'a2', NULL, 'exp-4',  'expense',    4500, 'Transport — client meetings',        'cleared', NULL, 'KES'),
  ('tx-029', '2026-03-18', 'a1', NULL, 'exp-2',  'expense',    3500, 'Domain & hosting renewal',           'cleared', 'Annual', 'KES'),
  ('tx-030', '2026-03-20', 'a2', NULL, 'exp-1',  'expense',   12000, 'Facebook / Instagram ads',           'cleared', 'Campaign Mar', 'KES'),
  ('tx-031', '2026-03-22', 'a1', 'a5', 'xfer-3', 'transfer',  30000, 'KCB → CIC Investment',              'cleared', 'Monthly savings', 'KES'),
  ('tx-032', '2026-03-25', 'a1', NULL, 'exp-7',  'expense',   20000, 'Contractor — SEO specialist',        'cleared', NULL, 'KES'),
  ('tx-033', '2026-03-28', 'a1', NULL, 'exp-9',  'expense',    4500, 'Utilities — water & electricity',    'cleared', NULL, 'KES'),
  ('tx-034', '2026-03-30', 'a1', NULL, 'inc-4',  'income',    55000, 'Consulting — Finance Co strategy',   'cleared', NULL, 'KES'),
  ('tx-035', '2026-04-03', 'a1', NULL, 'inc-1',  'income',    25000, 'Maintenance — ABC Motors',           'cleared', NULL, 'KES'),
  ('tx-036', '2026-04-05', 'a1', NULL, 'exp-2',  'expense',    4500, 'Adobe Creative Cloud',               'cleared', 'Monthly sub', 'KES'),
  ('tx-037', '2026-04-07', 'a1', NULL, 'exp-3',  'expense',    3000, 'Internet & office phone',            'cleared', NULL, 'KES'),
  ('tx-038', '2026-04-10', 'a1', NULL, 'exp-8',  'expense',   25000, 'Office rent — April',                'cleared', NULL, 'KES'),
  ('tx-039', '2026-04-12', 'a1', NULL, 'inc-5',  'income',    75000, 'Monthly retainer — XYZ Corp',       'cleared', NULL, 'KES'),
  ('tx-040', '2026-04-15', 'a2', NULL, 'exp-4',  'expense',    5500, 'Transport — field visits',           'cleared', NULL, 'KES'),
  ('tx-041', '2026-04-18', 'a1', NULL, 'exp-2',  'expense',    8000, 'CRM software subscription',          'cleared', 'Monthly', 'KES'),
  ('tx-042', '2026-04-20', 'a2', NULL, 'exp-1',  'expense',   14000, 'Facebook / Instagram ads',           'cleared', 'Campaign Apr', 'KES'),
  ('tx-043', '2026-04-22', 'a4', 'a1', 'xfer-4', 'transfer',  20000, 'Credit card payment — KCB',         'cleared', NULL, 'KES'),
  ('tx-044', '2026-04-25', 'a1', NULL, 'exp-7',  'expense',   15000, 'Contractor — content writer',        'cleared', 'Blog posts', 'KES'),
  ('tx-045', '2026-04-28', 'a3', NULL, 'exp-10', 'expense',    3500, 'Meals — client lunch',               'cleared', NULL, 'KES'),
  ('tx-046', '2026-04-30', 'a1', NULL, 'inc-2',  'income',   150000, 'Website project — StartupHub',       'cleared', 'Large contract', 'KES'),
  ('tx-047', '2026-05-03', 'a1', NULL, 'inc-2',  'income',   110000, 'Website project — Green NGO',        'cleared', NULL, 'KES'),
  ('tx-048', '2026-05-05', 'a1', NULL, 'exp-2',  'expense',    4500, 'Adobe Creative Cloud',               'cleared', 'Monthly sub', 'KES'),
  ('tx-049', '2026-05-07', 'a1', NULL, 'exp-3',  'expense',    3000, 'Internet & office phone',            'cleared', NULL, 'KES'),
  ('tx-050', '2026-05-10', 'a1', NULL, 'exp-8',  'expense',   25000, 'Office rent — May',                  'cleared', NULL, 'KES'),
  ('tx-051', '2026-05-12', 'a1', NULL, 'inc-5',  'income',    75000, 'Monthly retainer — XYZ Corp',       'cleared', NULL, 'KES'),
  ('tx-052', '2026-05-15', 'a2', NULL, 'exp-4',  'expense',    6000, 'Transport — deliveries',             'cleared', NULL, 'KES'),
  ('tx-053', '2026-05-18', 'a4', NULL, 'exp-6',  'expense',   25000, 'Equipment — ultrawide monitor',      'cleared', 'Hardware', 'KES'),
  ('tx-054', '2026-05-20', 'a2', NULL, 'exp-1',  'expense',   16000, 'Facebook / Instagram ads',           'cleared', 'Campaign May', 'KES'),
  ('tx-055', '2026-05-22', 'a1', 'a2', 'xfer-2', 'transfer',  45000, 'KCB → M-Pesa float top-up',         'cleared', NULL, 'KES'),
  ('tx-056', '2026-05-25', 'a1', NULL, 'exp-7',  'expense',   40000, 'Contractor — backend developer',     'cleared', 'API work', 'KES'),
  ('tx-057', '2026-05-28', 'a1', NULL, 'exp-11', 'expense',    2000, 'Bank charges — wire fees',           'cleared', NULL, 'KES'),
  ('tx-058', '2026-05-30', 'a1', NULL, 'inc-4',  'income',    65000, 'Consulting — Law Firm process',      'cleared', NULL, 'KES'),
  ('tx-059', '2026-06-03', 'a1', NULL, 'inc-2',  'income',    78000, 'Website project — Bistro Restaurant','cleared', NULL, 'KES'),
  ('tx-060', '2026-06-05', 'a1', NULL, 'exp-2',  'expense',    4500, 'Adobe Creative Cloud',               'cleared', 'Monthly sub', 'KES'),
  ('tx-061', '2026-06-07', 'a1', NULL, 'exp-3',  'expense',    3000, 'Internet & office phone',            'cleared', NULL, 'KES'),
  ('tx-062', '2026-06-10', 'a1', NULL, 'exp-8',  'expense',   25000, 'Office rent — June',                 'cleared', NULL, 'KES'),
  ('tx-063', '2026-06-12', 'a1', NULL, 'inc-5',  'income',    75000, 'Monthly retainer — XYZ Corp',       'cleared', NULL, 'KES'),
  ('tx-064', '2026-06-15', 'a2', NULL, 'exp-4',  'expense',    5500, 'Transport — vendor runs',            'cleared', NULL, 'KES'),
  ('tx-065', '2026-06-18', 'a1', NULL, 'exp-2',  'expense',    2000, 'VPN & security tools',             'cleared', 'Monthly', 'KES'),
  ('tx-066', '2026-06-20', 'a2', NULL, 'exp-1',  'expense',   13000, 'Facebook / Instagram ads',         'cleared', 'Campaign Jun', 'KES'),
  ('tx-067', '2026-06-22', 'a1', 'a3', 'xfer-1', 'transfer',  10000, 'KCB → Office Cash petty cash',       'cleared', NULL, 'KES'),
  ('tx-068', '2026-06-25', 'a1', NULL, 'exp-7',  'expense',   28000, 'Contractor — UI designer',           'cleared', 'App redesign', 'KES'),
  ('tx-069', '2026-06-28', 'a1', NULL, 'exp-9',  'expense',    4500, 'Utilities — water & electricity',    'cleared', NULL, 'KES'),
  ('tx-070', '2026-06-30', 'a1', NULL, 'inc-3',  'income',    40000, 'Design services — packaging',        'cleared', NULL, 'KES'),
  ('tx-071', '2026-07-03', 'a1', NULL, 'inc-2',  'income',    88000, 'Website project — Sunrise School',   'cleared', NULL, 'KES'),
  ('tx-072', '2026-07-05', 'a1', NULL, 'exp-2',  'expense',    4500, 'Adobe Creative Cloud',               'cleared', 'Monthly sub', 'KES'),
  ('tx-073', '2026-07-07', 'a1', NULL, 'exp-3',  'expense',    3000, 'Internet & office phone',            'cleared', NULL, 'KES'),
  ('tx-074', '2026-07-10', 'a1', NULL, 'exp-8',  'expense',   25000, 'Office rent — July',                 'cleared', NULL, 'KES'),
  ('tx-075', '2026-07-12', 'a1', NULL, 'inc-5',  'income',    75000, 'Monthly retainer — XYZ Corp',       'cleared', NULL, 'KES'),
  ('tx-076', '2026-07-15', 'a2', NULL, 'exp-4',  'expense',    4000, 'Transport — courier & errands',      'cleared', NULL, 'KES'),
  ('tx-077', '2026-07-18', 'a1', NULL, 'exp-2',  'expense',    3500, 'Domain & hosting renewal',           'cleared', 'Annual', 'KES'),
  ('tx-078', '2026-07-20', 'a2', NULL, 'exp-1',  'expense',   11000, 'Facebook / Instagram ads',         'cleared', 'Campaign Jul', 'KES'),
  ('tx-079', '2026-07-22', 'a1', 'a5', 'xfer-3', 'transfer',  25000, 'KCB → CIC Investment',              'cleared', 'Monthly savings', 'KES'),
  ('tx-080', '2026-07-25', 'a1', NULL, 'exp-7',  'expense',   22000, 'Contractor — SEO expert',            'cleared', NULL, 'KES'),
  ('tx-081', '2026-07-28', 'a1', NULL, 'exp-12', 'expense',   18000, 'Monthly PAYE / taxes',               'cleared', NULL, 'KES'),
  ('tx-082', '2026-07-30', 'a1', NULL, 'inc-4',  'income',    70000, 'Consulting — Retail Chain ops',      'cleared', NULL, 'KES'),
  ('tx-083', '2026-08-03', 'a1', NULL, 'inc-1',  'income',    30000, 'Maintenance — Hotel Serena',         'cleared', NULL, 'KES'),
  ('tx-084', '2026-08-05', 'a1', NULL, 'exp-2',  'expense',    4500, 'Adobe Creative Cloud',               'cleared', 'Monthly sub', 'KES'),
  ('tx-085', '2026-08-07', 'a1', NULL, 'exp-3',  'expense',    3000, 'Internet & office phone',            'cleared', NULL, 'KES'),
  ('tx-086', '2026-08-10', 'a1', NULL, 'exp-8',  'expense',   25000, 'Office rent — August',               'cleared', NULL, 'KES'),
  ('tx-087', '2026-08-12', 'a1', NULL, 'inc-5',  'income',    75000, 'Monthly retainer — XYZ Corp',       'cleared', NULL, 'KES'),
  ('tx-088', '2026-08-15', 'a2', NULL, 'exp-4',  'expense',    5000, 'Transport — site visits',            'cleared', NULL, 'KES'),
  ('tx-089', '2026-08-18', 'a1', NULL, 'exp-2',  'expense',    6000, 'Analytics & reporting tools',      'cleared', 'Monthly', 'KES'),
  ('tx-090', '2026-08-20', 'a2', NULL, 'exp-1',  'expense',   15000, 'Facebook / Instagram ads',         'cleared', 'Campaign Aug', 'KES'),
  ('tx-091', '2026-08-22', 'a4', 'a1', 'xfer-4', 'transfer',  25000, 'Credit card payment — KCB',         'cleared', NULL, 'KES'),
  ('tx-092', '2026-08-25', 'a1', NULL, 'exp-7',  'expense',   18000, 'Contractor — content writer',      'cleared', 'Monthly', 'KES'),
  ('tx-093', '2026-08-28', 'a1', NULL, 'exp-9',  'expense',    4500, 'Utilities — water & electricity',    'cleared', NULL, 'KES'),
  ('tx-094', '2026-08-30', 'a1', NULL, 'inc-2',  'income',    92000, 'Website project — City Clinic',      'cleared', NULL, 'KES'),
  ('tx-095', '2026-09-03', 'a1', NULL, 'inc-3',  'income',    35000, 'Design services — new logo',         'cleared', NULL, 'KES'),
  ('tx-096', '2026-09-05', 'a1', NULL, 'exp-2',  'expense',    4500, 'Adobe Creative Cloud',               'cleared', 'Monthly sub', 'KES'),
  ('tx-097', '2026-09-07', 'a1', NULL, 'exp-3',  'expense',    3000, 'Internet & office phone',            'cleared', NULL, 'KES'),
  ('tx-098', '2026-09-10', 'a1', NULL, 'exp-8',  'expense',   25000, 'Office rent — September',            'cleared', NULL, 'KES'),
  ('tx-099', '2026-09-12', 'a1', NULL, 'inc-5',  'income',    75000, 'Monthly retainer — XYZ Corp',       'cleared', NULL, 'KES'),
  ('tx-100', '2026-09-15', 'a2', NULL, 'exp-4',  'expense',    4500, 'Transport — deliveries',           'cleared', NULL, 'KES'),
  ('tx-101', '2026-09-18', 'a3', NULL, 'exp-10', 'expense',    2500, 'Meals — team lunch',                 'cleared', NULL, 'KES'),
  ('tx-102', '2026-09-20', 'a2', NULL, 'exp-1',  'expense',   14000, 'Facebook / Instagram ads',         'cleared', 'Campaign Sep', 'KES'),
  ('tx-103', '2026-09-22', 'a1', 'a2', 'xfer-2', 'transfer',  35000, 'KCB → M-Pesa float top-up',         'cleared', NULL, 'KES'),
  ('tx-104', '2026-09-25', 'a1', NULL, 'exp-7',  'expense',   32000, 'Contractor — senior developer',      'cleared', 'Platform build', 'KES'),
  ('tx-105', '2026-09-28', 'a1', NULL, 'exp-11', 'expense',    1500, 'Bank charges — M-Pesa fees',         'cleared', NULL, 'KES'),
  ('tx-106', '2026-09-30', 'a1', NULL, 'inc-4',  'income',    50000, 'Consulting — Startup advisory',      'cleared', NULL, 'KES')
) AS v(local_id, date, account_local_id, to_account_local_id, category_local_id, type, amount, description, status, notes, currency);

-- ============================================================
-- PHASE 6: BUDGETS
-- ============================================================
INSERT INTO public.budgets (business_id, local_id, category_local_id, period_id, month, planned_amount, actual_amount)
SELECT d.id, v.local_id, v.category_local_id, v.period_id, v.month, v.planned_amount, v.actual_amount
FROM demo_biz d, (VALUES
  ('bud-mkt-jan', 'exp-1', '2026', '2026-01', 30000, 15000),
  ('bud-mkt-feb', 'exp-1', '2026', '2026-02', 30000, 18000),
  ('bud-mkt-mar', 'exp-1', '2026', '2026-03', 30000, 12000),
  ('bud-mkt-apr', 'exp-1', '2026', '2026-04', 30000, 14000),
  ('bud-mkt-may', 'exp-1', '2026', '2026-05', 30000, 16000),
  ('bud-mkt-jun', 'exp-1', '2026', '2026-06', 30000, 13000),
  ('bud-mkt-jul', 'exp-1', '2026', '2026-07', 30000, 11000),
  ('bud-mkt-aug', 'exp-1', '2026', '2026-08', 30000, 15000),
  ('bud-mkt-sep', 'exp-1', '2026', '2026-09', 30000, 29000),
  ('bud-sft-jan', 'exp-2', '2026', '2026-01', 15000,  4500),
  ('bud-sft-feb', 'exp-2', '2026', '2026-02', 15000,  4500),
  ('bud-sft-mar', 'exp-2', '2026', '2026-03', 15000,  4500),
  ('bud-sft-apr', 'exp-2', '2026', '2026-04', 15000, 12500),
  ('bud-sft-may', 'exp-2', '2026', '2026-05', 15000,  4500),
  ('bud-sft-jun', 'exp-2', '2026', '2026-06', 15000,  6500),
  ('bud-sft-jul', 'exp-2', '2026', '2026-07', 15000,  4500),
  ('bud-sft-aug', 'exp-2', '2026', '2026-08', 15000,  8500),
  ('bud-sft-sep', 'exp-2', '2026', '2026-09', 15000,  4500),
  ('bud-trn-jan', 'exp-4', '2026', '2026-01', 12000,  5000),
  ('bud-trn-feb', 'exp-4', '2026', '2026-02', 12000,  6500),
  ('bud-trn-mar', 'exp-4', '2026', '2026-03', 12000,  4500),
  ('bud-trn-apr', 'exp-4', '2026', '2026-04', 12000,  5500),
  ('bud-trn-may', 'exp-4', '2026', '2026-05', 12000,  6000),
  ('bud-trn-jun', 'exp-4', '2026', '2026-06', 12000,  5500),
  ('bud-trn-jul', 'exp-4', '2026', '2026-07', 12000,  4000),
  ('bud-trn-aug', 'exp-4', '2026', '2026-08', 12000,  5000),
  ('bud-trn-sep', 'exp-4', '2026', '2026-09', 12000,  4500),
  ('bud-con-jan', 'exp-7', '2026', '2026-01', 50000, 35000),
  ('bud-con-feb', 'exp-7', '2026', '2026-02', 50000, 30000),
  ('bud-con-mar', 'exp-7', '2026', '2026-03', 50000, 20000),
  ('bud-con-apr', 'exp-7', '2026', '2026-04', 50000, 15000),
  ('bud-con-may', 'exp-7', '2026', '2026-05', 50000, 42000),
  ('bud-con-jun', 'exp-7', '2026', '2026-06', 50000, 28000),
  ('bud-con-jul', 'exp-7', '2026', '2026-07', 50000, 22000),
  ('bud-con-aug', 'exp-7', '2026', '2026-08', 50000, 18000),
  ('bud-con-sep', 'exp-7', '2026', '2026-09', 50000, 32000),
  ('bud-rent-jan', 'exp-8', '2026', '2026-01', 25000, 25000),
  ('bud-rent-feb', 'exp-8', '2026', '2026-02', 25000, 25000),
  ('bud-rent-mar', 'exp-8', '2026', '2026-03', 25000, 25000),
  ('bud-rent-apr', 'exp-8', '2026', '2026-04', 25000, 25000),
  ('bud-rent-may', 'exp-8', '2026', '2026-05', 25000, 25000),
  ('bud-rent-jun', 'exp-8', '2026', '2026-06', 25000, 25000),
  ('bud-rent-jul', 'exp-8', '2026', '2026-07', 25000, 25000),
  ('bud-rent-aug', 'exp-8', '2026', '2026-08', 25000, 25000),
  ('bud-rent-sep', 'exp-8', '2026', '2026-09', 25000, 25000),
  ('bud-util-jan', 'exp-9', '2026', '2026-01',  8000,  4000),
  ('bud-util-feb', 'exp-9', '2026', '2026-02',  8000,  3000),
  ('bud-util-mar', 'exp-9', '2026', '2026-03',  8000,  4500),
  ('bud-util-apr', 'exp-9', '2026', '2026-04',  8000,  3000),
  ('bud-util-may', 'exp-9', '2026', '2026-05',  8000,  3000),
  ('bud-util-jun', 'exp-9', '2026', '2026-06',  8000,  4500),
  ('bud-util-jul', 'exp-9', '2026', '2026-07',  8000,  4500),
  ('bud-util-aug', 'exp-9', '2026', '2026-08',  8000,  4500),
  ('bud-util-sep', 'exp-9', '2026', '2026-09',  8000,  3000),
  ('bud-meal-jan', 'exp-10', '2026', '2026-01',  6000,     0),
  ('bud-meal-feb', 'exp-10', '2026', '2026-02',  6000,     0),
  ('bud-meal-mar', 'exp-10', '2026', '2026-03',  6000,     0),
  ('bud-meal-apr', 'exp-10', '2026', '2026-04',  6000,  3500),
  ('bud-meal-may', 'exp-10', '2026', '2026-05',  6000,     0),
  ('bud-meal-jun', 'exp-10', '2026', '2026-06',  6000,     0),
  ('bud-meal-jul', 'exp-10', '2026', '2026-07',  6000,     0),
  ('bud-meal-aug', 'exp-10', '2026', '2026-08',  6000,     0),
  ('bud-meal-sep', 'exp-10', '2026', '2026-09',  6000,  2500),
  ('bud-tax-jan', 'exp-12', '2026', '2026-01', 10000,  9000),
  ('bud-tax-feb', 'exp-12', '2026', '2026-02', 10000,  9000),
  ('bud-tax-mar', 'exp-12', '2026', '2026-03', 10000, 10800),
  ('bud-tax-apr', 'exp-12', '2026', '2026-04', 10000,  9000),
  ('bud-tax-may', 'exp-12', '2026', '2026-05', 10000,  9000),
  ('bud-tax-jun', 'exp-12', '2026', '2026-06', 10000, 10800),
  ('bud-tax-jul', 'exp-12', '2026', '2026-07', 10000,  9000),
  ('bud-tax-aug', 'exp-12', '2026', '2026-08', 10000,  9000),
  ('bud-tax-sep', 'exp-12', '2026', '2026-09', 10000, 15000)
) AS v(local_id, category_local_id, period_id, month, planned_amount, actual_amount);

-- ============================================================
-- PHASE 7: GOALS
-- ============================================================
INSERT INTO public.goals (business_id, local_id, name, target_amount, current_amount, target_date, status, currency)
SELECT d.id, v.local_id, v.name, v.target_amount, v.current_amount, v.target_date, v.status, v.currency
FROM demo_biz d, (VALUES
  ('goal-1', 'Emergency Fund',     300000, 185000, '2026-12-31', 'on-track',  'KES'),
  ('goal-2', 'New MacBook Pro',     220000, 165000, '2026-08-15', 'active',    'KES'),
  ('goal-3', 'Office Expansion',    500000, 500000, '2026-12-31', 'completed', 'KES'),
  ('goal-4', 'Annual Revenue',     1200000, 1050000, '2026-12-31', 'on-track',  'KES')
) AS v(local_id, name, target_amount, current_amount, target_date, status, currency);

-- ============================================================
-- PHASE 8: PLANNED TRANSACTIONS (Recurring & Upcoming)
-- ============================================================
INSERT INTO public.planned_transactions (
  business_id, local_id, date, account_local_id, to_account_local_id,
  category_local_id, description, amount, type, status, recurrence, currency
)
SELECT d.id, v.local_id, v.date, v.account_local_id, v.to_account_local_id,
       v.category_local_id, v.description, v.amount, v.type, v.status, v.recurrence, v.currency
FROM demo_biz d, (VALUES
  ('p-mkt-oct', '2026-10-01', 'a1', NULL, 'exp-2', 'Adobe Creative Cloud',  4500, 'expense', 'pending', 'monthly', 'KES'),
  ('p-int-oct', '2026-10-01', 'a1', NULL, 'exp-3', 'Internet & phone',       3000, 'expense', 'pending', 'monthly', 'KES'),
  ('p-rent-oct', '2026-10-01', 'a1', NULL, 'exp-8', 'Office rent',            25000, 'expense', 'pending', 'monthly', 'KES'),
  ('p-cont-oct', '2026-10-15', 'a1', NULL, 'exp-7', 'Contractor payment',     15000, 'expense', 'pending', 'monthly', 'KES'),
  ('p-ret-oct', '2026-10-01', 'a1', NULL, 'inc-5', 'Client retainer',       75000, 'income',  'pending', 'monthly', 'KES'),
  ('p-bank-oct', '2026-10-15', 'a1', NULL, 'exp-11', 'Bank charges',           2000, 'expense', 'pending', 'monthly', 'KES'),
  ('p-adb-oct', '2026-10-01', 'a2', NULL, 'exp-1', 'Advertising budget',     15000, 'expense', 'pending', 'monthly', 'KES'),
  ('p-util-oct', '2026-10-15', 'a1', NULL, 'exp-9', 'Utilities',              4000, 'expense', 'pending', 'monthly', 'KES'),
  ('p-license', '2027-01-01', 'a1', NULL, 'exp-2', 'Software license',      18000, 'expense', 'pending', 'yearly',  'KES'),
  ('p-domain', '2027-01-01', 'a1', NULL, 'exp-3', 'Domain renewal',          3500, 'expense', 'pending', 'yearly',  'KES'),
  ('p-chair',  '2026-10-05', 'a1', NULL, 'exp-6', 'Office chair',           12000, 'expense', 'pending', 'once',    'KES'),
  ('p-design', '2026-10-10', 'a1', NULL, 'inc-3', 'Design retainer',       25000, 'income',  'pending', 'once',    'KES')
) AS v(local_id, date, account_local_id, to_account_local_id, category_local_id, description, amount, type, status, recurrence, currency);

-- ============================================================
-- PHASE 9: ACTIVITIES
-- ============================================================
INSERT INTO public.activities (business_id, local_id, title, date, notes, status, due_date, priority, completed_at)
SELECT d.id, v.local_id, v.title, v.date, v.notes, v.status, v.due_date, v.priority, v.completed_at
FROM demo_biz d, (VALUES
  ('act-001', '2026-09-01', 'Follow up with ABC Motors on website launch', 'Sent initial proposal', 'completed', NULL, 'high', '2026-08-30T10:00:00Z'),
  ('act-002', '2026-09-02', 'Send August invoices to clients', '5 invoices pending', 'in-progress', NULL, 'high', NULL),
  ('act-003', '2026-09-05', 'Renew domain registration', 'Domain expires Oct 1', 'pending', '2026-09-15', 'medium', NULL),
  ('act-004', '2026-09-06', 'Review September expenses', 'Compare vs budget', 'pending', NULL, 'medium', NULL),
  ('act-005', '2026-09-08', 'Prepare September financial report', NULL, 'pending', '2026-09-25', 'high', NULL),
  ('act-006', '2026-09-10', 'Pay contractor for website build', 'Outstanding balance', 'pending', '2026-09-12', 'high', NULL),
  ('act-007', '2026-09-12', 'Update portfolio with latest project', 'ABC Motors live', 'pending', NULL, 'low', NULL),
  ('act-008', '2026-09-15', 'Review advertising campaign performance', 'Facebook/Instagram', 'pending', '2026-09-20', 'medium', NULL),
  ('act-009', '2026-09-18', 'Follow up on outstanding invoice from Supplier Co', NULL, 'pending', '2026-09-20', 'high', NULL),
  ('act-010', '2026-09-22', 'Schedule Q4 budget planning session', NULL, 'pending', '2026-10-01', 'medium', NULL),
  ('act-011', '2026-08-25', 'Complete website maintenance for ABC Motors', 'Site fully launched', 'completed', NULL, 'high', '2026-08-28T14:30:00Z'),
  ('act-012', '2026-08-28', 'Deposit freelance income to KCB account', NULL, 'completed', NULL, 'high', '2026-08-28T11:00:00Z')
) AS v(local_id, title, date, notes, status, due_date, priority, completed_at);

-- ============================================================
-- PHASE 10: NOTIFICATIONS
-- ============================================================
INSERT INTO public.notifications (business_id, local_id, title, message, type, status, date, action_label, action_href)
SELECT d.id, v.local_id, v.title, v.message, v.type, v.status, v.date, v.action_label, v.action_href
FROM demo_biz d, (VALUES
  ('notif-001', 'Marketing budget approaching limit', 'September marketing spend is at 97% of monthly budget.', 'budget', 'unread', '2026-09-25', NULL, NULL),
  ('notif-002', 'MacBook savings 75% complete', 'You are 75% towards your MacBook target', 'goal', 'read', '2026-09-01', NULL, NULL),
  ('notif-003', 'Adobe subscription due', 'Monthly Creative Cloud fee of KES 4,500 is due on Oct 1', 'recurring', 'read', '2026-09-28', 'Pay Now', '/entry?account=a1&description=Adobe%20Creative%20Cloud&amount=4500&category=exp-2'),
  ('notif-004', '3 tasks due this week', '1 active rent payment, 1 utility bill, 1 debt payment', 'activity', 'unread', '2026-09-02', NULL, NULL),
  ('notif-005', 'September report ready', 'Download your September financial summary', 'info', 'dismissed', '2026-09-01', 'Download', '/reports?month=2026-09'),
  ('notif-006', 'Budget exceeded', 'Marketing budget exceeded by KES 1,000 in September', 'budget', 'unread', '2026-09-30', NULL, NULL),
  ('notif-007', 'Retainer payment received', 'XYZ Corp monthly retainer of KES 75,000 received', 'info', 'read', '2026-09-12', NULL, NULL)
) AS v(local_id, title, message, type, status, date, action_label, action_href);

-- ============================================================
-- PHASE 11: APP SETTINGS
-- ============================================================
INSERT INTO public.app_settings (business_id, key, value)
SELECT d.id, v.key, v.value
FROM demo_biz d, (VALUES
  ('currency', 'KES'::jsonb),
  ('year', '2026'::jsonb),
  ('todos', '[{"id":"todo-1","text":"Send September invoices","done":true},{"id":"todo-2","text":"Pay Adobe subscription","done":false},{"id":"todo-3","text":"Renew domain","done":false},{"id":"todo-4","text":"Update portfolio","done":false}]'::jsonb),
  ('timezone', '"Africa/Nairobi"'),
  ('dateFormat', '"DD MMM YYYY"'),
  ('financialYear', '"2026-01-01"')
) AS v(key, value);

-- ============================================================
-- PHASE 12: VERIFICATION
-- ============================================================
SELECT '=== SEEDING COMPLETE ===' AS status;

SELECT 'Records after seeding:' AS phase,
  (SELECT count(*) FROM public.businesses WHERE slug = 'mwai-co-services') AS businesses,
  (SELECT count(*) FROM public.business_members WHERE role = 'owner') AS business_owners,
  (SELECT count(*) FROM public.accounts) AS accounts,
  (SELECT sum(opening_balance) FROM public.accounts) AS total_opening,
  (SELECT sum(current_balance) FROM public.accounts) AS total_current,
  (SELECT count(*) FROM public.categories) AS categories,
  (SELECT count(*) FROM public.transactions) AS transactions,
  (SELECT count(*) FROM public.budgets) AS budgets,
  (SELECT count(*) FROM public.goals) AS goals,
  (SELECT count(*) FROM public.planned_transactions WHERE recurrence = 'monthly') AS monthly_recurring,
  (SELECT count(*) FROM public.planned_transactions) AS total_planned,
  (SELECT count(*) FROM public.activities) AS activities,
  (SELECT count(*) FROM public.notifications) AS notifications,
  (SELECT count(*) FROM public.app_settings) AS app_settings;

-- ============================================================
-- PHASE 13: SAMPLE BALANCES (for quick verification)
-- ============================================================
SELECT 'Account balances:' AS info;
SELECT name, opening_balance, current_balance FROM public.accounts ORDER BY type, name;