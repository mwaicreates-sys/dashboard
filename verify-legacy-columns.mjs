// verify-legacy-columns.mjs — live proof (read-only) that every legacy
// column the app's sync mappers write actually exists in production.
// Oracle: Postgres resolves the requested column BEFORE the ACL check, so
//   42703 "column does not exist" -> column MISSING
//   42501 "permission denied"     -> column EXISTS (anon is denied reads)
// Never prints the key.
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("./.env.local", import.meta.url), "utf8");
const pick = (k) =>
  (env.match(new RegExp(`^\\s*${k}\\s*=\\s*"?([^"\\r\\n]+)"?`, "m")) || [])[1];
const BASE = pick("NEXT_PUBLIC_SUPABASE_URL");
const KEY = pick("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
if (!BASE || !KEY) { console.error("missing env"); process.exit(1); }

const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const LEGACY = {
  accounts:     ["name", "type", "opening_balance", "current_balance", "currency", "institution"],
  categories:   ["name", "type", "color"],
  transactions: ["type", "amount", "description", "notes"],
};

let bad = 0;
for (const [table, columns] of Object.entries(LEGACY)) {
  for (const c of columns) {
    const r = await fetch(`${BASE}/rest/v1/${table}?select=${c}&limit=1`, { headers: H });
    const body = await r.text();
    let code = ""; try { code = JSON.parse(body).code || ""; } catch {}
    const exists = code === "42501" || r.status === 200;
    if (!exists) bad++;
    console.log(`${table.padEnd(13)}.${c.padEnd(17)} HTTP ${String(r.status).padEnd(4)} ${(code || "-").padEnd(8)} ${exists ? "EXISTS" : "MISSING"}`);
  }
}
console.log(bad ? `\nLEGACY MANIFEST FAIL (${bad})` : "\nLEGACY MANIFEST: all columns live-verified in production");
process.exit(bad ? 1 : 0);