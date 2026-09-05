// ============================================================
// ⚠️  WARNING — THIS SCRIPT WRITES TO THE PRODUCTION DATABASE  ⚠️
//
// DO NOT RUN CASUALLY. It MUTATES the live production Supabase:
//   • creates throwaway auth users (signUp)
//   • INSERTs rows into production tables
//   • DELETEs its own rows afterwards
// Run only when deliberately re-verifying migrations/RLS against
// production — never against a shared or critical environment.
//
// verify-final.mjs — FINAL LIVE VERIFICATION (production Supabase)
// Reads .env.local at runtime. NEVER prints the publishable key.
// (creates throwaway test users; deletes its own data rows)
// ============================================================
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { randomUUID as uuid } from "node:crypto";

const env = Object.fromEntries(
  readFileSync(new URL("./.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const SUPA_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY =
  env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!SUPA_URL || !SUPA_KEY) {
  console.error("FATAL: Supabase env vars not found in .env.local");
  process.exit(2);
}
console.log(`Target: ${SUPA_URL}  (key loaded, ${SUPA_KEY.length} chars — never printed)`);

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};
const skip = (name, why) => {
  results.push({ name, pass: null, detail: why });
  console.log(`SKIP  ${name}  — ${why}`);
};
const sec = (t) => console.log(`\n---- ${t} ----`);

const TABLES = [
  "businesses", "business_members", "profiles", "accounts", "categories",
  "transactions", "budgets", "goals", "planned_transactions",
  "activities", "notifications", "app_settings",
];

// ------------------------------------------------------------
// PHASE 1 — connection · schema existence · anonymous wall
// ------------------------------------------------------------
async function phase1_connection_and_schema() {
  sec("PHASE 1 — connection · schema · anonymous wall");
  let h = null;
  try { h = await fetch(`${SUPA_URL}/auth/v1/health`, { headers: { apikey: SUPA_KEY } }); } catch {}
  check("Auth service reachable", !!h && h.ok, h ? `HTTP ${h.status}` : "network error");

  let visible = 0, walled = 0;
  const missing = [];
  for (const t of TABLES) {
    let r;
    try {
      r = await fetch(`${SUPA_URL}/rest/v1/${t}?select=*&limit=1`, {
        headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
      });
    } catch { missing.push(`${t} (network)`); continue; }
    const body = await r.text();
    if (r.status === 200) visible++;
    else if (body.includes("42501") || body.includes("permission denied")) { visible++; walled++; }
    else if (body.includes("PGRST205") || r.status === 404) missing.push(t);
    else missing.push(`${t} (HTTP ${r.status})`);
  }
  check(
    "All 12 tenant tables exist in production",
    missing.length === 0,
    `${visible}/12 resolve${missing.length ? " — MISSING: " + missing.join(", ") : ""}`
  );
  check(
    "Anonymous wall (RLS + zero anon grants)",
    walled === visible && visible > 0,
    walled ? `${walled}/${visible} tables return permission-denied to anon before any row is reachable` : "anon could read data!"
  );
}
// ------------------------------------------------------------
// PHASE 2 — authentication · signup bootstrap (profile/business/membership)
// ------------------------------------------------------------
async function phase2_auth_bootstrap() {
  sec("PHASE 2 — authentication · signup bootstrap");
  const admin = createClient(SUPA_URL, SUPA_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const email = `vf-final-${Date.now()}@gmail.com`;
  const password = `Vf-${uuid().replace(/-/g, "").slice(0, 12)}!Aa`;
  const { data, error } = await admin.auth.signUp({
    email,
    password,
    options: { data: { full_name: "Verify Final" } },
  });
  if (error) {
    check("Sign up accepted", false, error.message);
    return null;
  }
  check("Sign up accepted", true, `test user ${email}`);
  if (!data.session) {
    skip(
      "Authenticated session",
      "email confirmation is ON — user created but no session returned; confirm via email (or disable confirmations) to unlock live RLS/sync verification"
    );
    return { admin, email, needsConfirm: true };
  }
  const user = data.user;
  const { data: prof } = await admin
    .from("profiles")
    .select("id,email,full_name")
    .eq("id", user.id)
    .maybeSingle();
  check(
    "Profile auto-created by bootstrap trigger",
    !!prof && prof.email === email,
    prof ? `full_name=${JSON.stringify(prof.full_name)}` : "profiles row missing"
  );
  const { data: mem, error: memErr } = await admin
    .from("business_members")
    .select("role, businesses(id,name,slug)")
    .eq("user_id", user.id);
  const m = (mem || [])[0];
  check(
    "Owner membership auto-created",
    !memErr && !!m && m.role === "owner",
    m && m.businesses ? `business "${m.businesses.name}" (${m.businesses.slug})` : memErr?.message || "no membership row"
  );
  check("Exactly one business provisioned for new user", (mem || []).length === 1);
  return { admin, email, password, needsConfirm: false, user, business: m?.businesses, session: data.session };
}
// ------------------------------------------------------------
// PHASE 3 — RLS tenant isolation (authenticated owner A)
// ------------------------------------------------------------
async function phase3_rls_ownerA(ctx) {
  sec("PHASE 3 — RLS · tenant isolation (owner A)");
  if (!ctx || ctx.needsConfirm || !ctx.business) {
    skip("RLS tenant isolation (owner A)", "no authenticated session from phase 2");
    return;
  }
  const { admin, user, business } = ctx;

  const { data: biz } = await admin.from("businesses").select("id,name");
  check(
    "Own business visible · other tenants hidden",
    (biz || []).length === 1 && biz[0].id === business.id,
    `${(biz || []).length} business(es) visible`
  );

  const { data: profs } = await admin.from("profiles").select("id");
  check(
    "Profiles scoped to self",
    (profs || []).length === 1 && profs[0].id === user.id,
    `${(profs || []).length} row(s) visible`
  );

  const { data: mems } = await admin.from("business_members").select("id,user_id");
  const mine = (mems || []).filter((m) => m.user_id === user.id);
  const others = (mems || []).filter((m) => m.user_id !== user.id);
  check(
    "Memberships visible only within own business",
    mine.length === 1 && others.length === 0,
    `self=${mine.length}, foreign=${others.length}`
  );

  const { data: mem0 } = await admin
    .from("business_members")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  const { error: demoteErr } = await admin
    .from("business_members")
    .update({ role: "member" })
    .eq("id", mem0?.id ?? "");
  check(
    "Final-owner lockout guard (demote blocked)",
    !!demoteErr && /final owner/i.test(demoteErr.message),
    demoteErr ? demoteErr.message.slice(0, 90) : "demotion unexpectedly allowed"
  );
  const { data: memBack } = await admin
    .from("business_members")
    .select("role")
    .eq("id", mem0?.id ?? "")
    .maybeSingle();
  check(
    "Owner role intact after blocked demotion",
    memBack?.role === "owner",
    `role=${memBack?.role}`
  );

  const { error: xErr } = await admin.from("transactions").insert({
    business_id: uuid(),
    local_id: "xf-probe",
    date: new Date().toISOString().slice(0, 10),
    account_local_id: "x",
    category_local_id: "x",
    type: "expense",
    amount: 1,
  });
  check(
    "Write into a foreign business blocked by RLS",
    !!xErr && (xErr.code === "42501" || /row-level security/i.test(xErr.message)),
    xErr ? `${xErr.code || ""} ${xErr.message}`.trim().slice(0, 90) : "insert unexpectedly allowed"
  );
}
// ------------------------------------------------------------
// PHASE 4 — cloud sync round-trip (the app's exact contract:
// upsert on business_id+local_id → pull → fidelity)
// ------------------------------------------------------------
async function phase4_sync_roundtrip(ctx) {
  sec("PHASE 4 — cloud sync · round-trip (app contract)");
  if (!ctx || ctx.needsConfirm || !ctx.business) {
    skip("Cloud sync round-trip", "no authenticated session (see phase 2)");
    return;
  }
  const { admin, business } = ctx;
  const B = business.id;
  const today = new Date().toISOString().slice(0, 10);

  const accounts = [
    { business_id: B, local_id: "vf-acc-1", name: "Verify Checking", type: "checking", opening_balance: 1000, current_balance: 1250, currency: "USD", institution: null, active: true },
    { business_id: B, local_id: "vf-acc-2", name: "Verify Savings", type: "savings", opening_balance: 500, current_balance: 500, currency: "USD", institution: "Verify Bank", active: true },
  ];
  const categories = [
    { business_id: B, local_id: "vf-cat-1", name: "Verify Salary", category_group: "income", type: "income", color: "#22c55e", parent_local_id: null },
    { business_id: B, local_id: "vf-cat-2", name: "Verify Rent", category_group: "bills", type: "expense", color: "#ef4444", parent_local_id: null },
  ];
  const transactions = [
    { business_id: B, local_id: "vf-tx-1", date: today, account_local_id: "vf-acc-1", to_account_local_id: null, category_local_id: "vf-cat-1", planned_local_id: null, type: "income", amount: 300, description: "Verify salary", status: "cleared", notes: "round-trip", currency: "USD" },
    { business_id: B, local_id: "vf-tx-2", date: today, account_local_id: "vf-acc-1", to_account_local_id: null, category_local_id: "vf-cat-2", planned_local_id: null, type: "expense", amount: 50, description: "Verify rent", status: "cleared", notes: null, currency: "USD" },
  ];
  const budgets = [
    { business_id: B, local_id: "vf-bud-1", category_local_id: "vf-cat-2", period_id: "2026", month: "2026-08", planned_amount: 400, actual_amount: 50 },
  ];
  const goals = [
    { business_id: B, local_id: "vf-goal-1", name: "Verify Emergency Fund", target_amount: 5000, current_amount: 1250, target_date: "2026-12-31", status: "on-track", currency: "USD" },
  ];
  const planned = [
    { business_id: B, local_id: "vf-plan-1", date: today, account_local_id: "vf-acc-1", to_account_local_id: null, category_local_id: "vf-cat-2", description: "Verify planned rent", amount: 50, type: "expense", status: "pending", recurrence: "monthly", currency: "USD" },
  ];
  const activities = [
    { business_id: B, local_id: "vf-act-1", title: "Verify review budget", date: today, notes: null, status: "pending", due_date: null, priority: "high", completed_at: null },
  ];
  const notifications = [
    { business_id: B, local_id: "vf-notif-1", title: "Verify reminder", message: "sync check", type: "info", status: "unread", date: today, action_label: null, action_href: null },
  ];
  const settings = [
    { business_id: B, key: "currency", value: "USD" },
    { business_id: B, key: "year", value: 2026 },
    { business_id: B, key: "todos", value: [{ id: "vf-todo-1", text: "Verify todo", done: false }] },
  ];

  const upsertAll = async () => {
    const opt = { onConflict: "business_id,local_id" };
    const r = await Promise.all([
      admin.from("accounts").upsert(accounts, opt),
      admin.from("categories").upsert(categories, opt),
      admin.from("transactions").upsert(transactions, opt),
      admin.from("budgets").upsert(budgets, opt),
      admin.from("goals").upsert(goals, opt),
      admin.from("planned_transactions").upsert(planned, opt),
      admin.from("activities").upsert(activities, opt),
      admin.from("notifications").upsert(notifications, opt),
      admin.from("app_settings").upsert(settings, { onConflict: "business_id,key" }),
    ]);
    return r.map((x) => x.error).filter(Boolean);
  };

  const errs = await upsertAll();
  check(
    "Push (upsert) all 9 collections accepted",
    errs.length === 0,
    errs.map((e) => e.message).join("; ").slice(0, 140)
  );

  const pull = async () => {
    const q = (t) => admin.from(t).select("*").eq("business_id", B);
    const [a, c, t, b, g, p, act, n, s] = await Promise.all([
      q("accounts"), q("categories"), q("transactions"), q("budgets"),
      q("goals"), q("planned_transactions"), q("activities"),
      q("notifications"), q("app_settings"),
    ]);
    return { a: a.data || [], c: c.data || [], t: t.data || [], b: b.data || [], g: g.data || [], p: p.data || [], act: act.data || [], n: n.data || [], s: s.data || [] };
  };

  const db = await pull();
  check(
    "Pull returns every pushed row",
    db.a.length === 2 && db.c.length === 2 && db.t.length === 2 && db.b.length === 1 && db.g.length === 1 && db.p.length === 1 && db.act.length === 1 && db.n.length === 1 && db.s.length === 3,
    `a=${db.a.length} c=${db.c.length} t=${db.t.length} b=${db.b.length} g=${db.g.length} p=${db.p.length} act=${db.act.length} n=${db.n.length} s=${db.s.length}`
  );
  const tx1 = db.t.find((x) => x.local_id === "vf-tx-1");
  const curSetting = db.s.find((x) => x.key === "currency");
  check(
    "Values survive the round-trip (amount/date/currency/notes/jsonb)",
    !!tx1 && tx1.amount === 300 && tx1.date === today && tx1.currency === "USD" && tx1.notes === "round-trip" && curSetting?.value === "USD" && db.g[0]?.target_amount === 5000,
    tx1 ? `amount=${tx1.amount} date=${tx1.date} cur=${curSetting?.value} goal=${db.g[0]?.target_amount}` : "row missing"
  );
}
// ------------------------------------------------------------
// PHASE 5 — sync mutations: idempotency · update · diff-delete · RPC
// ------------------------------------------------------------
async function phase5_sync_mutations(ctx) {
  sec("PHASE 5 — sync mutations · idempotency · update · diff-delete · RPC");
  if (!ctx || ctx.needsConfirm || !ctx.business) {
    skip("Sync mutations suite", "no authenticated session (see phase 2)");
    return;
  }
  const { admin, business } = ctx;
  const B = business.id;
  const opt = { onConflict: "business_id,local_id" };
  const today = new Date().toISOString().slice(0, 10);
  const countOf = async (t) => {
    const { count } = await admin
      .from(t).select("*", { count: "exact", head: true }).eq("business_id", B);
    return count ?? 0;
  };

  // 5.1 — idempotent re-push must not duplicate anything
  const before = {
    accounts: await countOf("accounts"),
    transactions: await countOf("transactions"),
    app_settings: await countOf("app_settings"),
  };
  const reErrs = (
    await Promise.all([
      admin.from("accounts").upsert([{ business_id: B, local_id: "vf-acc-1", name: "Verify Checking", type: "checking", opening_balance: 1000, current_balance: 1250, currency: "USD", institution: null, active: true }], opt),
      admin.from("transactions").upsert([{ business_id: B, local_id: "vf-tx-1", date: today, account_local_id: "vf-acc-1", to_account_local_id: null, category_local_id: "vf-cat-1", planned_local_id: null, type: "income", amount: 300, description: "Verify salary", status: "cleared", notes: "round-trip", currency: "USD" }], opt),
      admin.from("app_settings").upsert([
        { business_id: B, key: "currency", value: "USD" },
        { business_id: B, key: "year", value: 2026 },
        { business_id: B, key: "todos", value: [{ id: "vf-todo-1", text: "Verify todo", done: false }] },
      ], { onConflict: "business_id,key" }),
    ])
  ).map((x) => x.error).filter(Boolean);
  check("Idempotent re-push accepted", reErrs.length === 0, reErrs.map((e) => e.message).join("; ").slice(0, 100));
  const after = {
    accounts: await countOf("accounts"),
    transactions: await countOf("transactions"),
    app_settings: await countOf("app_settings"),
  };
  check(
    "Re-push creates zero duplicates (unique-rule dedup)",
    after.accounts === before.accounts &&
      after.transactions === before.transactions &&
      after.app_settings === before.app_settings,
    `accounts ${before.accounts}→${after.accounts}, tx ${before.transactions}→${after.transactions}, settings ${before.app_settings}→${after.app_settings}`
  );

  // 5.2 — update via upsert persists changed values
  const { error: upErr } = await admin.from("transactions").upsert([{ business_id: B, local_id: "vf-tx-1", date: today, account_local_id: "vf-acc-1", to_account_local_id: null, category_local_id: "vf-cat-1", planned_local_id: null, type: "income", amount: 333.33, description: "Verify salary v2", status: "cleared", notes: "updated", currency: "USD" }], opt);
  const { data: upd } = await admin.from("transactions").select("amount,description,notes").eq("business_id", B).eq("local_id", "vf-tx-1").maybeSingle();
  check(
    "Update round-trips (amount/description/notes)",
    !upErr && !!upd && upd.amount === 333.33 && upd.description === "Verify salary v2" && upd.notes === "updated",
    upd ? `amount=${upd.amount}` : upErr?.message || "row missing"
  );

  // 5.3 — diff-delete exactly mirrors the app's deleteRemoved()
  const { error: ddErr } = await admin
    .from("transactions").delete().eq("business_id", B)
    .not("local_id", "in", '("vf-tx-1")');
  const { data: kept } = await admin.from("transactions").select("local_id").eq("business_id", B);
  check(
    "Diff-delete removes only non-kept rows",
    !ddErr && (kept || []).length === 1 && kept[0].local_id === "vf-tx-1",
    ddErr ? ddErr.message.slice(0, 90) : `kept=${(kept || []).map((k) => k.local_id).join(",")}`
  );

  // 5.4 — starter-data RPC is a safe no-op once categories exist
  const { data: rpc0, error: rpc0Err } = await admin.rpc("mark_user_business_initialized", {
    p_business_id: B,
    p_categories: [{ local_id: "vf-cat-9", name: "Would Duplicate", category_group: "income", type: "income" }],
  });
  check(
    "Seeding RPC no-op on initialized business (no duplicates)",
    !rpc0Err && rpc0 === 0,
    rpc0Err ? rpc0Err.message.slice(0, 90) : `inserted=${rpc0}`
  );
  const catCount = await countOf("categories");
  check("Category count unchanged after RPC no-op", catCount === 2, `categories=${catCount}`);

  // 5.5 — RPC is member-gated
  const { error: rpcX } = await admin.rpc("mark_user_business_initialized", {
    p_business_id: uuid(),
    p_categories: [],
  });
  check(
    "Seeding RPC rejects non-member business",
    !!rpcX && /not a member/i.test(rpcX.message),
    rpcX ? rpcX.message.slice(0, 90) : "unexpectedly allowed"
  );
}
// --CHUNK5-END--