# Migration history — read this before touching this directory

## The short version

**Do not run `supabase db push` or any automatic migration runner against
the existing production project using the files in this directory.**
The historical numbered series (`001_tenancy_core.sql` through
`021_fix_owner_activation_crypto_schema.sql`) is **not** a reliable
replay path for the current production database. Treat this directory
as a historical record, not an executable pipeline, until that baseline
mismatch is deliberately resolved (see below — not attempted in this
release).

## Why the numbered series doesn't match production

Production (`utednmplsdnvbocosemr`) was historically reconciled through
a **separate set of differently-named migrations**, applied directly
(dashboard/MCP), not by replaying `001`–`021` in order. Compare the
local filenames to what's actually in production's applied migration
history:

| Local file (never applied as-is) | What actually ran in production instead |
|---|---|
| `001_tenancy_core.sql` … `006_reconcile_production.sql` | `initial_financial_saas_schema`, `006a_reconcile_tenancy_core`, `006b_reconcile_financial_schema`, `006c_reconcile_missing_tables`, `006d_reconcile_auth_and_rls` |
| `007_platform_admin.sql` | `platform_admin`, `reset_saas_to_platform_admin_only` |
| `009_admin_business_management.sql` | `009_admin_business_management_live_fix` |
| `011_add_business_owner_details.sql` + `012_business_owner_provisioning.sql` | `011_012_business_owner_provisioning_live` |
| `013_remove_auto_business_creation.sql` | `remove_auto_business_creation` |
| `014_admin_create_business_owner_fields.sql` | `014_admin_create_business_owner_fields_fix` |
| `015_owner_activation_code.sql` | `015_owner_activation_code` (matches) |
| `018_reconcile_owner_activation_code.sql` | `018_reconcile_owner_activation_code` (matches) |
| `019_fix_owner_activation_claim_status.sql` / `020_fix_owner_activation_claim_status.sql` | `020_fix_owner_activation_claim_status` |
| `021_fix_owner_activation_crypto_schema.sql` | `021_fix_owner_activation_crypto_schema` (matches) |
| `022_platform_ownership_transfer.sql` | **never applied** — superseded, see below |

This drift predates the 2026-09 repair engagement (production's
reconciliation migrations are dated 2026-08-31 through 2026-09-06,
before that work began). It was discovered and documented during the
final pre-release audit, not introduced by it.

**Practical consequence**: replaying `001`–`021` against the current
production database would very likely fail (`relation already exists`
and similar errors) because production's actual schema was built by
different SQL than these files contain. Even where a local file's
*name* matches a production migration's name, its *content* has not
been re-verified against the deployed version as part of this repair
engagement — only the three migrations listed below were.

## What IS accurate: the 2026-09 repair migrations

These four migrations are exactly what's deployed, verified
byte-for-byte against the live database as of 2026-09-16:

- `20260915170035_durable_business_sync.sql` — applied as
  `durable_business_sync`. The persistence backbone
  (`read_business_state`/`apply_business_changes`).
- `20260915190000_lock_platform_admin_column.sql` — applied as
  `lock_platform_admin_column`. Closes the platform-admin
  privilege-escalation path (Phase 1).
- `20260916000000_retire_legacy_organization_rls.sql` — applied as
  `retire_legacy_organization_rls`. Retires the dormant legacy
  organization-model RLS policies (Phase 4).
- `20260916010000_platform_ownership_transfer_rpc.sql` — applied as
  `platform_ownership_transfer_rpc`. The real, working
  `transfer_platform_ownership()` RPC (Phase 5), replacing the
  never-applied `022_platform_ownership_transfer.sql`.

Going forward, treat *this* set — and production's actual applied
migration history, checked live via `list_migrations`/`execute_sql`
against the real project rather than assumed from filenames — as the
source of truth. Any new migration should be verified the same way
before being trusted.

## `022_platform_ownership_transfer.sql`

Explicitly superseded and made inert (its executable SQL was removed
and replaced with a historical note) in this release. See that file's
header for the full explanation. Do not restore or apply it — use
`20260916010000_platform_ownership_transfer_rpc.sql` instead.

## Resolving the baseline mismatch

Not attempted in this release, by instruction. A future pass should
either (a) rewrite `001`–`021` into an accurate snapshot of what's
actually deployed, or (b) mark them clearly as historical/aspirational
and establish a fresh, verified baseline migration going forward. Until
then, every environment (new dev setups included) should be reconciled
against a live read of production's actual schema, not by trusting
this directory's numbered series to replay correctly.
