# Persistence correction — local review

Prepared September 15, 2026. **No production migration, production data write,
commit, push, or deployment was performed during this implementation.** Production
access in this turn was limited to read-only schema/enum inspection. Test data is
synthetic and runs in a disposable local PostgreSQL/WASM instance (PGlite).

## Exact migration

[20260915170035_durable_business_sync.sql](../supabase/migrations/20260915170035_durable_business_sync.sql)

The file was created with the Supabase CLI. It targets the audited, reconciled
legacy production schema, including its existing `account_type` enum and
organization columns. It is not a replacement for the older migrations and has
not been tested as an installation from an empty production schema.

### Existing rows and relationships

| Change | Existing rows | Future business-only rows |
| --- | --- | --- |
| Make `organization_id` nullable in accounts, categories, transactions and budgets | Every existing value and foreign key is retained. No backfill, reassignment, UPDATE or DELETE. | May have NULL organization_id. No invented organization and no implicit grant of organization access. |
| Keep `business_id` constraints | NOT NULL, foreign keys and per-business unique IDs remain intact. | Tenant is mandatory. |
| Add checking/savings/credit to account enum | Existing labels/values remain unchanged. | Entry's current account types become valid. |
| Add categories/budgets updated_at | Historical values are NULL, not fabricated dates. Existing update triggers can now operate. | Default now(); existing triggers update it on edits. |
| Add activities.actor_user_id | Existing activities remain NULL; no historical actor is inferred. | Default auth.uid(), FK to auth.users with ON DELETE SET NULL. |
| Legacy budget fields | Existing name, amount and period dates are not rewritten, even when business-specific budget fields are edited. | RPC supplies name from category/month, amount from planned_amount and the month's start/end dates. Their NOT NULL constraints remain. |
| Legacy transaction_date | Existing values are untouched by business edits. | RPC initializes it from the entry date. |

New entries in a business that also contains legacy organization rows do not
automatically acquire those rows' organization relationship. A future explicit
business-to-organization mapping would be a separate reviewed change. The current
schema has no authoritative mapping from which to infer one safely.

### RPC security and consistency

- `read_business_state(uuid)` is STABLE and SECURITY INVOKER. It reads one MVCC
  snapshot and returns all nine collections as a single JSON object, avoiding
  PostgREST collection pagination truncation. Existing SELECT policies apply,
  including platform-admin read access.
- `apply_business_changes(uuid,jsonb)` is SECURITY INVOKER, requires auth.uid()
  and the existing is_business_member() authorization check, and uses existing
  table grants/RLS. A read-only platform admin is not given write access.
- The migration changes **no existing RLS policies, table grants, membership
  functions, organization foreign keys, or business/local_id uniqueness**.
- The new functions are executable by authenticated users only, with explicit
  PUBLIC/anon revocation. No new SECURITY DEFINER function is introduced.
- Table and writable-column allowlists prevent arbitrary SQL targets or updates
  to organization_id, business_id, UUID IDs, or legacy fields through the RPC.
- Each request uses a per-business advisory lock plus row locks. Every update
  compares the full originally-read database row; stale changes fail with 40001.
- The entire batch commits or rolls back together, including changed account
  balances and budget actuals. Only explicitly removed local IDs are deleted.
- An identical retry is acknowledged without inserting/updating twice. A failed
  or lost response is retried against the same original snapshot and stable IDs.

The SECURITY INVOKER choice follows the
[Supabase database-function guidance](https://supabase.com/docs/guides/database/functions).
The application invokes the functions through the existing browser client's
[RPC API](https://supabase.com/docs/reference/javascript/rpc), with the user's JWT.

## Exact source changes

| File | Change |
| --- | --- |
| [cloudSync.ts](../app/lib/cloudSync.ts) | Retains entity mappings; switches pull to a consistent snapshot RPC; computes changed rows against the acknowledged state; sends exact original rows for conflicts; propagates errors. Removes full-snapshot upsert/delete synchronization. |
| [cloudSaveQueue.ts](../app/lib/cloudSaveQueue.ts) | New tenant-bound single-writer queue. Dirty state clears only after confirmation. Retains an uncertain batch for idempotent retry before newer edits. Stops accepting work when the session ends. |
| [dashboardData.tsx](../app/lib/dashboardData.tsx) | Does not hydrate business data from localStorage in cloud mode. Instantiates the queue only after successful cloud hydration. Immediately syncs existing CRUD changes. Adds awaited saveEntry and flushCloudChanges, sign-out cancellation, reconnect retry and UUID-based new IDs. |
| [EntryForm.tsx](../app/components/shell/EntryForm.tsx) | Keeps the existing optimistic preview; awaits saveEntry before closing. Stable per-form ID, duplicate-submit guard, pending label, disabled input, and visible failure with retry. Prevents modal dismissal during commit. |
| [CloudAccountCard.tsx](../app/components/shell/CloudAccountCard.tsx) | Flushes before logout, business switch, or opening the selector. Failure prevents navigation and is visible while signed in. Removes misleading device-safety copy. |
| [supabase.ts](../app/lib/supabase.ts) | Removes unconditional keepalive and its request-body limit. Save acknowledgement, not unload events, is the durability boundary. Client/auth configuration is unchanged. |
| [package.json](../package.json), [package-lock.json](../package-lock.json), [vitest.config.mts](../vitest.config.mts) | Adds a reproducible test command and pinned test-only dependencies. Lock resolution also advances transitive PostCSS 8.5.26 to 8.5.28; application dependency declarations are unchanged. |
| [tests](../tests) | Local SQL, queue, startup, and actual Entry/provider behavior tests. Fixture contains schema metadata and synthetic rows, not production financial records or credentials. |

No dashboard/chart layout or financial calculation function was changed. The only
visible behavior changes are the pending/error handling required for an honest
save and safe navigation.

### Startup order

1. Cloud-enabled SSR/client initial state is empty; cached financial rows are not rendered.
2. Auth and business membership resolve using the existing protections.
3. Cloud read must succeed. Failure leaves saving disabled, even after subsequent state changes.
4. Cloud collections replace the provider state; a tenant-bound queue is initialized with the same snapshot.
5. Only subsequent changes become database operations. Hydration itself produces no financial writes.
6. LocalStorage may cache the visible state but never supplies a cloud write baseline.

## Verification

Commands: `npm run test:persistence`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.

- Local SQL tests reproduce the original 23502 missing-organization failure
  before applying the migration to the disposable fixture.
- Test coverage includes legacy row/policy preservation, native writes, fresh
  pulls, duplicate retries, stale concurrent snapshots, atomic rollback after an
  earlier write, overlapping queued saves, two businesses with identical local
  IDs, cross-tenant/anonymous rejection, last-row deletion, and over 1000 records
  with a write payload larger than 64 KiB.
- React tests cover Strict Mode/bootstrap ordering, foreign-cache exclusion,
  failed hydration, delayed/failed Entry saves, stable retry IDs, balance
  recomputation, provider teardown/remount, and blocked logout/switching on failure.
- PostgreSQL tests use production column/default/enum metadata and representative
  business/organization RLS policies. They do not recreate every production
  integration or prove the deployed PostgREST/auth configuration.

| Requested scenario | Evidence and limit |
| --- | --- |
| 1. Refresh after save | Fresh SQL pull and provider remount pass; real browser refresh against migrated Supabase remains unrun. |
| 2. Immediately close/reopen tab | Awaited Save confirmation followed by immediate provider teardown/remount is covered. Real tab-close testing remains unrun. |
| 3. Logout/login | User-role changes, fresh reads and navigation-failure protection covered locally. Real Supabase cookie logout/login remains unrun. |
| 4. Full browser restart | Not run. Requires an authenticated non-production deployment with the migration. |
| 5. Corresponding row exists | Verified in local PostgreSQL after application push; no production test row created. |
| 6. Business isolation | Pass: two users/businesses, same local IDs, different values; unauthorized read/write rejected. |
| 7. Return to original business | Pass in database role-switch/read tests. |
| 8. Write failure is honest | Pass: Entry stays open, error shown, no false close; SQL batch rollback and pending retry tested. |
| 9. No duplication | Pass: repeated pulls, repeated writes after lost acknowledgement, and stable per-form IDs. |

See [test output](persistence-tests.txt), [ESLint output](persistence-eslint.txt),
[TypeScript output](persistence-typescript.txt), and [build output](persistence-build.txt).
The successful TypeScript command emits no diagnostics. ESLint's remaining 14
warnings are in untouched files, including the existing .kilo worktree.

## Limits and conditions before any production rollout

1. **Saved means database acknowledgement received.** Closing the browser while
   the button still says Saving, before the request reaches Supabase, cannot be
   guaranteed durable. The application no longer represents that state as saved.
2. Production remains on its existing schema. These application changes require
   the new RPCs; using them against today's production schema fails closed.
3. **Old open tabs still contain the unsafe snapshot writer.** Existing RLS and
   direct-table permissions are intentionally preserved. A rollout must retire
   old clients under a controlled write pause; applying this schema alone while
   old clients continue writing is unsafe. A deployment-side maintenance/version
   gate, if needed, is separate work requiring review before production use.
4. Perform staging verification with the real Supabase API, deployed RLS,
   auth/session cookies, multiple users, and browser lifecycle scenarios before
   production approval. Review migration history; do not blindly replay 001–022.
5. No schema rollback that reimposes organization_id NOT NULL is safe once native
   business-only rows exist. Do not delete/reassign those rows for rollback.
   Preserve the compatible schema and pause writes if an application rollback is needed.
6. Failed, unconfirmed data remains pending in the current provider/form. It is
   not recovered from cache on a fresh cloud session. Previously lost entries
   are not reconstructed or silently imported.
7. The local .env.local lacks NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Build success
   establishes compilation, not a working authenticated local deployment.
8. npm reports existing vulnerabilities involving Next.js/sharp/js-yaml. No
   framework upgrade or blanket audit fix was folded into this persistence change.

**Review status: local implementation only. Production application remains unapproved.**
