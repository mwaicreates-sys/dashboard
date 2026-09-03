// verify-006-status.mjs — read-only live probe: has 006 been applied?
// Distinguishes "table missing" (42P01/PGRST205) from "exists but anon
// denied" (42501/401/403). Never prints the key.
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("./.env.local", import.meta.url), "utf8");
const pick = (k) =>
  (env.match(new RegExp(`^\\s*${k}\\s*=\\s*"?([^"\\r\\n]+)"?`, "m")) || [])[1];
const BASE = pick("NEXT_PUBLIC_SUPABASE_URL") || "https://utednmplsdnvbocosemr.supabase.co";
const KEY = pick("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
if (!KEY) { console.error("no publishable key in .env.local"); process.exit(1); }

const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const tables = [
  "transactions", // control: legacy table -> expect EXISTS + denied
  "businesses", "business_members", "goals", "planned_transactions",
  "activities", "notifications", "app_settings",
];

let applied = 0, missing = 0;
for (const t of tables) {
  const r = await fetch(`${BASE}/rest/v1/${t}?select=*&limit=1`, { headers: H });
  const body = await r.text();
  let code = "";
  try { code = JSON.parse(body).code || ""; } catch {}
  let verdict;
  if (r.status === 200) verdict = "EXISTS + anon-readable (unexpected!)";
  else if (r.status === 404 || code === "PGRST205" || code === "42P01") { verdict = "MISSING (006 not applied)"; missing++; }
  else if (r.status === 401 || r.status === 403 || code === "42501") { verdict = "EXISTS, anon denied (wall) -> applied"; applied++; }
  else verdict = `unexpected status ${r.status} ${code}`;
  console.log(`${t.padEnd(22)} HTTP ${String(r.status).padEnd(4)} ${(code || "-").padEnd(9)} ${verdict}`);
}
console.log(`\nverdict: ${missing === 0 ? "006 APPLIED (or tables pre-exist)" : missing >= 6 ? "006 NOT APPLIED" : "PARTIAL — check above"}`);
