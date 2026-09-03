// verify-contract.mjs — static cross-check: every column the app's sync
// mappers write must exist in 006_reconcile_production.sql OR in the
// legacy production schema (columns verified live via the 42703/42501
// error oracle; see verify-legacy-columns.mjs). Catches mapper/schema
// typos BEFORE the migration is applied to production.
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("./supabase/migrations/006_reconcile_production.sql", import.meta.url), "utf8");
const ts  = readFileSync(new URL("./app/lib/cloudSync.ts", import.meta.url), "utf8");

// Legacy columns already present in production (live-verified).
const LEGACY = {
  accounts:      ["name", "type", "opening_balance", "current_balance", "currency", "institution"],
  categories:    ["name", "type", "color"],
  transactions:  ["type", "amount", "description", "notes"],
};

const cols = {};
const addCols = (t, list) => { cols[t] = new Set([...(cols[t] || []), ...list]); };

// CREATE TABLE blocks (column lines are exactly two-space indented)
for (const m of sql.matchAll(/create table if not exists public\.(\w+)\s*\(([\s\S]*?)\n\);/g)) {
  addCols(m[1], [...m[2].matchAll(/^ {2}(\w+)\s/gm)].map((x) => x[1]));
}
// ALTER TABLE ... ADD COLUMN IF NOT EXISTS blocks (multi-line lists)
for (const m of sql.matchAll(/alter table public\.(\w+)([\s\S]*?);/g)) {
  const names = [...m[2].matchAll(/add column if not exists (\w+)/g)].map((x) => x[1]);
  if (names.length) addCols(m[1], names);
}

// Legacy columns already present in production (live-verified).
for (const [t, list] of Object.entries(LEGACY)) addCols(t, list);

const mappers = {
  accountToRow: "accounts",
  categoryToRow: "categories",
  transactionToRow: "transactions",
  budgetToRow: "budgets",
  goalToRow: "goals",
  plannedToRow: "planned_transactions",
  activityToRow: "activities",
  notificationToRow: "notifications",
};
const KNOWN = new Set(["business_id", "local_id"]);
let failures = 0;

for (const [fn, table] of Object.entries(mappers)) {
  const m = ts.match(new RegExp(`const ${fn} = \\([\\s\\S]*?\\n\\}\\);`));
  if (!m) { console.log(`${fn}: MAPPER NOT FOUND`); failures++; continue; }
  const keys = [...m[0].matchAll(/^ {2}(\w+):/gm)].map((x) => x[1]).filter((k) => !KNOWN.has(k));
  const missing = keys.filter((k) => !cols[table]?.has(k));
  if (missing.length) { console.log(`${table.padEnd(22)} MISSING IN 006 -> ${missing.join(", ")}`); failures++; }
  else console.log(`${table.padEnd(22)} OK  (${keys.length} app columns all present)`);
}

for (const k of ["key", "value"]) {
  if (!cols.app_settings?.has(k)) { console.log(`app_settings: MISSING ${k}`); failures++; }
}
console.log(`${"app_settings".padEnd(22)} OK  (key/value present)`);

console.log(failures ? `\nCONTRACT FAIL (${failures})` : "\nCONTRACT CHECK: PASS — cloudSync.ts ⇄ 006 aligned");
process.exit(failures ? 1 : 0);
