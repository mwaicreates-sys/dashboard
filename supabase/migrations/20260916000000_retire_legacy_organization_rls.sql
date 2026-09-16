-- Phase 4 tenancy reconciliation: retire the legacy organization-model RLS
-- policies on the four financial tables that still carry both tenancy
-- models (accounts, categories, transactions, budgets).
--
-- NOT YET APPLIED. Created locally for review per the Phase 4 production
-- safety rule — inspection + local preparation only.
--
-- ROOT CAUSE (verified live against production before writing this, not
-- assumed — see the Phase 4 report for full query evidence):
--   These four tables each carry TWO separate sets of permissive RLS
--   policies — the current business-model policies (is_business_member)
--   and the original organization-model policies (is_org_member /
--   is_org_admin). PostgreSQL ORs permissive policies together, so EITHER
--   model granting access is sufficient. organization_members currently
--   has 0 rows, so the organization policies are dormant today — but they
--   are live, permissive, and would silently reactivate full ALL-command
--   access to real financial data for anyone ever inserted into
--   organization_members for the one organization these tables reference,
--   completely bypassing business_members-based isolation and invisible
--   to the application's own workspace UI. Flagged Critical/High in the
--   Phase 1 security audit (finding C-1) as a structural risk distinct
--   from the (already-closed, Phase 1) profiles.is_platform_admin
--   vulnerability.
--
-- DATA VERIFIED SAFE (read-only production inspection this session):
--   Exactly ONE organization exists (58340156-4396-4074-b81c-4796253900e9),
--   mapping 1:1 and consistently to exactly ONE business
--   (ff8d0002-627f-4670-b6a5-3a6bb7d5b5d4, "Demo Business") across every
--   row in accounts (5), categories (22), transactions (200) and
--   budgets (156) that has organization_id set — zero ambiguity, zero
--   conflicting pairs, zero cross-tenant mixing, confirmed by direct query
--   grouping every populated (organization_id, business_id) pair per
--   table. organization_members is empty, so no user currently holds ANY
--   access through these policies, and no production write depends on
--   them (apply_business_changes never references organization_id).
--   The DO block below re-proves the "exactly one clean mapping, no
--   ambiguity" condition at migration time and ABORTS rather than guessing
--   if that has changed since this was written — this migration does not
--   rely on the analysis above being re-verified by hand before every run.
--
-- WHAT THIS MIGRATION DOES:
--   Drops the 16 organization-model policies (4 tables x up to 4 commands)
--   that authorize through is_org_member()/is_org_admin().
--   accounts_member_all / categories_member_all / transactions_member_all /
--   budgets_member_all (ALL commands, is_business_member) and each table's
--   platform_admin_select_* (SELECT, current_is_platform_admin()) already
--   fully cover every operation the current application performs on these
--   tables — dropping the organization policies removes zero legitimate
--   access for any real user (verified against the live business_members
--   list before writing this).
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO:
--   - Does NOT touch organization_id values on any row (all 383 rows that
--     carry one keep it — a historical breadcrumb with no remaining
--     functional purpose once these policies are gone; nulling/dropping it
--     has no security upside, is not proven necessary, and is left for a
--     separate, explicitly approved cleanup if ever wanted).
--   - Does NOT drop the organization_id column, its foreign keys, or its
--     indexes (e.g. accounts_org_idx) — safe to leave in place; dropping
--     them is a performance/hygiene concern explicitly out of scope for
--     this phase.
--   - Does NOT touch organizations / organization_members /
--     organization_settings, nor the fully-separate legacy
--     debts/investments/savings_goals/recurring_transactions tables —
--     "unused by the current application" (confirmed, Phase 1 audit) is
--     not the same as "safe to drop from the database"; they may have
--     other legacy consumers this investigation did not rule out.
--   - Does NOT change is_org_member()/is_org_admin() themselves — other
--     legacy policies outside these four tables may still reference them;
--     leaving the functions intact is strictly safer than assuming they're
--     unused elsewhere.
--   - Does NOT touch anything from Phase 1 (profiles lockdown), Phase 2
--     (calculation logic — app code only, nothing here), or Phase 3
--     (cloud sync RPCs — read_business_state/apply_business_changes are
--     untouched; they never referenced organization_id or these policies).
--
-- Idempotent: DROP POLICY IF EXISTS throughout, safe to re-run.
-- Reversible: every dropped policy's exact prior definition is on record
-- in the Phase 1/4 audit output if it ever needs to be recreated.

begin;

-- Self-verifying safety guard: re-prove "at most one organization, mapped
-- unambiguously to at most one business, per table" at migration time
-- rather than trusting the analysis above to still hold. Aborts the whole
-- transaction (fails safely) if that is no longer true instead of guessing.
do $$
declare
  bad_table text;
begin
  select t into bad_table from (
    select 'accounts' as t, count(distinct (organization_id, business_id)) as pairs
      from public.accounts where organization_id is not null
    union all
    select 'categories', count(distinct (organization_id, business_id))
      from public.categories where organization_id is not null
    union all
    select 'transactions', count(distinct (organization_id, business_id))
      from public.transactions where organization_id is not null
    union all
    select 'budgets', count(distinct (organization_id, business_id))
      from public.budgets where organization_id is not null
  ) checks
  where pairs > 1
  limit 1;

  if bad_table is not null then
    raise exception 'Aborting: table % has an ambiguous organization_id -> business_id mapping (more than one distinct pair). This migration only removes redundant authorization policies and assumes a clean 1:1 mapping; it refuses to proceed rather than guess when that assumption no longer holds.', bad_table;
  end if;
end $$;

drop policy if exists accounts_select_member on public.accounts;
drop policy if exists accounts_insert_member on public.accounts;
drop policy if exists accounts_update_member on public.accounts;
drop policy if exists accounts_delete_admin on public.accounts;

drop policy if exists categories_select_member on public.categories;
drop policy if exists categories_insert_member on public.categories;
drop policy if exists categories_update_admin on public.categories;
drop policy if exists categories_delete_admin on public.categories;

drop policy if exists transactions_select_member on public.transactions;
drop policy if exists transactions_insert_member on public.transactions;
drop policy if exists transactions_update_member on public.transactions;
drop policy if exists transactions_delete_member on public.transactions;

drop policy if exists budgets_select_member on public.budgets;
drop policy if exists budgets_insert_member on public.budgets;
drop policy if exists budgets_update_member on public.budgets;
drop policy if exists budgets_delete_member on public.budgets;

commit;
