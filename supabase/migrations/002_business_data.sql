-- ============================================================
-- MULTI-TENANT SAAS — STEP 2/5: Business-owned data tables
--
-- Mirrors the application's existing data model exactly
-- (app/data/model/types.ts). Classification:
--   • Business-owned: every table below — scoped by business_id NOT NULL
--   • User-owned:     profiles (001)
--   • Tenancy:        businesses / business_members (001)
--
-- Conventions
--   id          uuid PK — Supabase convention
--   business_id every record belongs to exactly one business (cascade)
--   local_id    the app's stable string id ("a1", "tx-3"). Preserved so
--               existing client data keeps working unchanged; unique
--               per business, so ids can repeat across tenants safely.
--   *_local_id  original app-side string references — the source of
--               truth for the app. *_id uuid columns are best-effort
--               relational pointers (nulled if the target row is
--               hard-deleted; the app soft-deletes accounts).
--   amounts     double precision — the app computes in JS numbers.
-- ============================================================

-- ------------------------------------------------------------
-- Accounts
-- ------------------------------------------------------------
create table if not exists public.accounts (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses (id) on delete cascade,
  local_id        text not null,
  name            text not null,
  type            text not null
                  check (type in ('checking','savings','investment','credit','loan')),
  opening_balance double precision not null default 0,
  current_balance double precision not null default 0,
  currency        text,
  institution     text,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint accounts_business_local_uniq unique (business_id, local_id)
);
create index if not exists accounts_business_idx on public.accounts (business_id);

-- ------------------------------------------------------------
-- Categories
-- ------------------------------------------------------------
create table if not exists public.categories (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses (id) on delete cascade,
  local_id        text not null,
  name            text not null,
  category_group  text not null
                  check (category_group in
                    ('income','savings','investments','bills','expenses','debt')),
  type            text not null check (type in ('income','expense')),
  color           text,
  parent_local_id text,
  parent_id       uuid references public.categories (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint categories_business_local_uniq unique (business_id, local_id)
);
create index if not exists categories_business_idx on public.categories (business_id);

-- ------------------------------------------------------------
-- Transactions
-- ------------------------------------------------------------
create table if not exists public.transactions (
  id                  uuid primary key default gen_random_uuid(),
  business_id         uuid not null references public.businesses (id) on delete cascade,
  local_id            text not null,
  date                date not null,
  account_local_id    text not null,
  account_id          uuid references public.accounts (id) on delete set null,
  to_account_local_id text,
  to_account_id       uuid references public.accounts (id) on delete set null,
  category_local_id   text not null,
  category_id         uuid references public.categories (id) on delete set null,
  planned_local_id    text,
  type                text not null check (type in ('income','expense','transfer')),
  amount              double precision not null check (amount >= 0),
  description         text not null default '',
  status              text not null default 'cleared'
                      check (status in ('pending','cleared','reconciled')),
  notes               text,
  currency            text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint transactions_business_local_uniq unique (business_id, local_id)
);
create index if not exists transactions_business_date_idx
  on public.transactions (business_id, date desc);
create index if not exists transactions_business_account_idx
  on public.transactions (business_id, account_id);
create index if not exists transactions_business_category_idx
  on public.transactions (business_id, category_id);

-- ------------------------------------------------------------
-- Budgets
-- ------------------------------------------------------------
create table if not exists public.budgets (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references public.businesses (id) on delete cascade,
  local_id         text not null,
  category_local_id text not null,
  category_id      uuid references public.categories (id) on delete set null,
  period_id        text not null,
  month            text not null,
  planned_amount   double precision not null default 0,
  actual_amount    double precision not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint budgets_business_local_uniq unique (business_id, local_id)
);
create index if not exists budgets_business_idx on public.budgets (business_id);
create index if not exists budgets_business_month_idx on public.budgets (business_id, month);

-- ------------------------------------------------------------
-- Goals
-- ------------------------------------------------------------
create table if not exists public.goals (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses (id) on delete cascade,
  local_id       text not null,
  name           text not null,
  target_amount  double precision not null default 0,
  current_amount double precision not null default 0,
  target_date    date not null,
  status         text not null default 'active'
                 check (status in ('active','on-track','at-risk','completed','paused')),
  currency       text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint goals_business_local_uniq unique (business_id, local_id)
);
create index if not exists goals_business_idx on public.goals (business_id);

-- ------------------------------------------------------------
-- Planned transactions (recurring / upcoming)
-- ------------------------------------------------------------
create table if not exists public.planned_transactions (
  id                  uuid primary key default gen_random_uuid(),
  business_id         uuid not null references public.businesses (id) on delete cascade,
  local_id            text not null,
  date                date not null,
  account_local_id    text not null,
  account_id          uuid references public.accounts (id) on delete set null,
  to_account_local_id text,
  to_account_id       uuid references public.accounts (id) on delete set null,
  category_local_id   text not null,
  category_id         uuid references public.categories (id) on delete set null,
  description         text not null default '',
  amount              double precision not null check (amount >= 0),
  type                text not null check (type in ('income','expense','transfer')),
  status              text not null default 'pending'
                      check (status in ('pending','completed','cancelled')),
  recurrence          text check (recurrence in ('once','monthly','yearly')),
  currency            text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint planned_transactions_business_local_uniq unique (business_id, local_id)
);
create index if not exists planned_transactions_business_date_idx
  on public.planned_transactions (business_id, date);

-- ------------------------------------------------------------
-- Activities (day-to-day tracking)
-- ------------------------------------------------------------
create table if not exists public.activities (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses (id) on delete cascade,
  local_id     text not null,
  title        text not null,
  date         date not null,
  notes        text,
  status       text not null default 'pending'
               check (status in ('pending','in-progress','completed')),
  due_date     date,
  priority     text check (priority in ('low','medium','high')),
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint activities_business_local_uniq unique (business_id, local_id)
);
create index if not exists activities_business_date_idx
  on public.activities (business_id, date desc);

-- ------------------------------------------------------------
-- Notifications / reminders (stored ones; derived ones are not synced)
-- ------------------------------------------------------------
create table if not exists public.notifications (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses (id) on delete cascade,
  local_id     text not null,
  title        text not null,
  message      text not null default '',
  type         text not null
               check (type in ('activity','budget','recurring','goal','info')),
  status       text not null default 'unread'
               check (status in ('unread','read','dismissed')),
  -- Kept as text: the app stores either an ISO timestamp or a date string.
  date         text not null default '',
  action_label text,
  action_href  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint notifications_business_local_uniq unique (business_id, local_id)
);
create index if not exists notifications_business_idx on public.notifications (business_id);

-- ------------------------------------------------------------
-- App settings — small business-scoped state that is not entity data
-- (todos, selected year, display currency). key/value JSONB so the
-- shape can evolve without migrations.
-- ------------------------------------------------------------
create table if not exists public.app_settings (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  key         text not null,
  value       jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint app_settings_business_key_uniq unique (business_id, key)
);
create index if not exists app_settings_business_idx on public.app_settings (business_id);