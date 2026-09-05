// ============================================================
// verify-auth-routing.mjs — SaaS auth/routing acceptance harness.
//
// Verifies the multi-tenant acceptance tests that need a REAL
// session (no user is created and nothing is written — password
// sign-ins only):
//
//   Phase A (database = security boundary), per account:
//     A1 identity        — /auth/v1/user accepts the session
//     A2 admin flag      — current_is_platform_admin() RPC
//     A3 memberships     — business_members visible rows = own only
//     A4 data isolation  — every transactions row RLS returns belongs
//                          to one of the caller's businesses, and an
//                          explicit foreign/forged business_id filter
//                          returns NOTHING (acceptance test 7)
//     A5 own profile     — profiles row readable, flag matches A2
//
//   Phase B (edge proxy + server gates), using the exact session
//   cookie @supabase/ssr writes (chunked exactly like
//   createChunks(): 3180-char encodeURIComponent boundaries):
//     B1 logged out        — / → 307 /login            (test 1)
//     B2 business user     — / → /dashboard|/workspaces (tests 2/5)
//     B3 business user     — /dashboard → 200           (test 2)
//     B4 business user     — /admin NOT reachable       (test 6)
//     B5 platform admin    — / → /admin                 (test 4)
//     B6 any session       — /login → 307 /             (no form leak)
//     B7 workspace gate    — business user on /goals → 200
//
// Usage (publishable key only — never a service key):
//   TEST_BUSINESS_EMAIL=... TEST_BUSINESS_PASSWORD=... node verify-auth-routing.mjs
//   TEST_ADMIN_EMAIL=...    TEST_ADMIN_PASSWORD=...     (optional, second account)
//   APP_URL=http://localhost:3000                       (optional, for Phase B)
// ============================================================

import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const PROJECT_REF = BASE ? new URL(BASE).hostname.split(".")[0] : "";

let failures = 0;
const ok = (cond, label, detail = "") => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
};
const sec = (s) => console.log(`\n== ${s} ==`);

/** Port of @supabase/ssr createChunks(): cookie list for a session value. */
function buildAuthCookieHeader(session) {
  const key = `sb-${PROJECT_REF}-auth-token`;
  const value = JSON.stringify(session);
  const encoded = encodeURIComponent(value);
  if (encoded.length <= 3180) return `${key}=${encodeURIComponent(value)}`;
  let rest = encoded;
  const parts = [];
  while (rest.length > 0) {
    let head = rest.slice(0, 3180);
    const lastEscape = head.lastIndexOf("%");
    if (lastEscape > 3180 - 3) head = head.slice(0, lastEscape);
    let seg = "";
    while (head.length > 0) {
      try {
        seg = decodeURIComponent(head);
        break;
      } catch (e) {
        if (e instanceof URIError && head.at(-3) === "%" && head.length > 3) {
          head = head.slice(0, head.length - 3);
        } else {
          throw e;
        }
      }
    }
    parts.push(seg);
    rest = rest.slice(head.length);
  }
  return parts.map((p, i) => `${key}.${i}=${encodeURIComponent(p)}`).join("; ");
}

const api = (path, token, method = "GET") =>
  fetch(`${BASE}${path}`, {
    method,
    headers: { apikey: KEY, Authorization: `Bearer ${token}` },
  });

async function signIn(email, password) {
  const r = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!r.ok) return { error: `${r.status} ${(await r.text()).slice(0, 120)}` };
  return { session: await r.json() };
}

async function checkAccount(label, email, password) {
  sec(`${label} — ${email}`);
  const s = await signIn(email, password);
  if (s.error) {
    ok(false, "password sign-in", s.error);
    return null;
  }
  ok(true, "password sign-in");
  const token = s.session.access_token;

  // A1 identity
  const me = await api("/auth/v1/user", token);
  const meBody = await me.json();
  ok(me.ok && meBody?.id, "A1 session identity resolved", meBody?.email);

  // A2 platform-admin flag via the DB RPC
  const adm = await api("/rest/v1/rpc/current_is_platform_admin", token, "POST");
  const isAdmin = (await adm.json()) === true;
  ok(adm.ok, "A2 current_is_platform_admin() RPC", `isAdmin=${isAdmin}`);

  // A3 memberships — RLS must show ONLY the caller's rows
  const mem = await api(
    "/rest/v1/business_members?select=business_id,user_id,role",
    token
  );
  const memberships = (await mem.json()) ?? [];
  const allMine = memberships.every((m) => m.user_id === meBody.id);
  ok(mem.ok && allMine, `A3 memberships visible = own only (${memberships.length})`);
  const ownIds = memberships.map((m) => m.business_id);

  // A4 data isolation — every visible transactions row is ours; a forged
  // business_id filter never returns foreign rows (acceptance test 7).
  const tx = await api(
    "/rest/v1/transactions?select=local_id,business_id&limit=500",
    token
  );
  const rows = (await tx.json()) ?? [];
  const scoped = rows.every((r) => ownIds.includes(r.business_id));
  ok(tx.ok && scoped, `A4 visible transactions all tenant-scoped (${rows.length} rows)`);
  if (ownIds.length > 0) {
    const foreign =
      ownIds[0] === "00000000-0000-0000-0000-000000000000"
        ? "11111111-1111-1111-1111-111111111111"
        : "00000000-0000-0000-0000-000000000000";
    const forged = await api(
      `/rest/v1/transactions?select=local_id&business_id=eq.${foreign}&limit=5`,
      token
    );
    ok(
      forged.ok && ((await forged.json()) ?? []).length === 0,
      "A4b forged business_id query returns nothing"
    );
  }

  // A5 own profile readable; flag matches the RPC
  const prof = await api(
    `/rest/v1/profiles?select=id,is_platform_admin&id=eq.${meBody.id}`,
    token
  );
  const profRows = (await prof.json()) ?? [];
  ok(
    prof.ok && profRows.length === 1 && profRows[0].is_platform_admin === isAdmin,
    "A5 own profiles row visible, flag matches RPC"
  );

  return { session: s.session, isAdmin };
}

async function checkProxyRouting(session, expectAdmin) {
  sec(`Phase B — proxy routing (${expectAdmin ? "platform admin" : "business user"})`);
  const cookie = buildAuthCookieHeader(session);

  const get = (path) =>
    fetch(`${APP_URL}${path}`, {
      redirect: "manual",
      headers: { Cookie: cookie },
    });

  // B2/B5 entry route
  const root = await get("/");
  const rootLoc = root.headers.get("location") ?? "";
  if (expectAdmin) {
    ok(
      root.status === 307 && rootLoc.endsWith("/admin"),
      "B5 / → /admin for platform admin",
      `${root.status} → ${rootLoc}`
    );
  } else {
    ok(
      root.status === 307 &&
        (rootLoc.endsWith("/dashboard") || rootLoc.endsWith("/workspaces")),
      "B2 / → business workspace or selector",
      `${root.status} → ${rootLoc}`
    );
  }

  // B6 authenticated users never see the login form
  const login = await get("/login");
  ok(
    login.status === 307 && (login.headers.get("location") ?? "").endsWith("/"),
    "B6 /login → / when authenticated",
    `${login.status}`
  );

  // B7 gated business surface reachable with a session
  const goals = await get("/goals");
  ok(goals.status === 200, "B7 /goals renders for the session", `${goals.status}`);

  // B9 CROSS-BUSINESS ISOLATION — the server-rendered workspace HTML must
  // NEVER contain the single-user demo (seed) dataset rows (goals, planned
  // transactions, transactions). Pre-fix, the DashboardProvider initialized
  // from seed data, so /dashboard and /goals HTML included demo rows for
  // every business. Post-fix, business workspaces render empty until the
  // scoped cloud pull loads, so seed markers must be absent.
  const SEED_MARKERS = [
    "Reduce dining out", // seed goal g5
    "Car Loan Payment", // seed planned p5
    "Salary Deposit", // seed planned p2
    "Groceries", // seed planned p3 (also a category)
    "Emergency Fund Transfer", // seed planned p6
  ];
  if (!expectAdmin) {
    const dashHtml = await (await get("/dashboard")).text();
    const goalsHtml = await (await get("/goals")).text();
    const found = [];
    for (const m of SEED_MARKERS) {
      if (dashHtml.includes(m) || goalsHtml.includes(m)) found.push(m);
    }
    ok(
      found.length === 0,
      "B9 no demo/seed data in business workspace HTML",
      found.length ? found.join(", ") : "seed markers absent"
    );
  }

  if (!expectAdmin) {
    // B3/B4 business user: workspace renders; the admin area never leaks
    // admin-only content (the AdminGuard also redirects client-side).
    const dash = await get("/dashboard");
    ok(dash.status === 200, "B3 /dashboard renders", `${dash.status}`);
    for (const p of ["/admin", "/admin/businesses", "/admin/activity", "/admin/profile"]) {
      const res = await get(p);
      const html = await res.text();
      ok(
        res.status === 200 && !html.includes("PLATFORM ADMIN") && !html.includes("Total businesses"),
        `B4 ${p} content is not served to a business user`
      );
    }
  } else {
    // Platform admin can reach every primary admin surface.
    for (const p of ["/admin", "/admin/businesses", "/admin/activity", "/admin/profile"]) {
      const res = await get(p);
      const html = await res.text();
      ok(res.status === 200 && html.includes("PLATFORM ADMIN"), `B8 ${p} renders for the admin`);
    }
  }
}

async function main() {
  console.log("verify-auth-routing — no users are created, no data is written");

  // B1 — logged-out wall (works without any credentials)
  sec("Phase B1 — logged-out wall");
  try {
    const anon = await fetch(`${APP_URL}/`, { redirect: "manual" });
    ok(
      anon.status === 307 && (anon.headers.get("location") ?? "").endsWith("/login"),
      "B1 / → /login when signed out",
      `${anon.status} → ${anon.headers.get("location")}`
    );
  } catch {
    console.log(`  SKIP — app not reachable at ${APP_URL} (start: npm run dev)`);
  }

  const bEmail = process.env.TEST_BUSINESS_EMAIL;
  const bPass = process.env.TEST_BUSINESS_PASSWORD;
  const aEmail = process.env.TEST_ADMIN_EMAIL;
  const aPass = process.env.TEST_ADMIN_PASSWORD;

  if (bEmail && bPass) {
    const b = await checkAccount("Business user", bEmail, bPass);
    if (b && !b.isAdmin) await checkProxyRouting(b.session, false);
  } else {
    console.log(
      "\nSKIP business-user phases — set TEST_BUSINESS_EMAIL / TEST_BUSINESS_PASSWORD"
    );
  }

  if (aEmail && aPass) {
    const a = await checkAccount("Platform admin", aEmail, aPass);
    if (a && a.isAdmin) await checkProxyRouting(a.session, true);
    else if (a) console.log("  NOTE — account is NOT a platform admin; set the DB flag first.");
  } else {
    console.log("SKIP admin phases — set TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD");
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
