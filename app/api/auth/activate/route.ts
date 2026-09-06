// ============================================================
// /api/auth/activate — owner activation (email + access code).
//
// Replaces the password-signup / email-confirmation flow for provisioned
// business owners. Server-side only:
//
//   1. Validates the access code against business_owner_claims (hashed,
//      bound to the exact provisioned business + owner email, single-use,
//      expiring). Nothing client-supplied is trusted for identity.
//   2. Resolves or creates the REAL Supabase Auth user (service role,
//      server-only) with a throwaway random password — the password is
//      never returned to the client and never stored anywhere; the
//      activation code is the credential.
//   3. Mints a GENUINE Supabase session (password grant through the SSR
//      client) so auth.uid(), RLS, business_members and tenant isolation
//      keep working unchanged. Session persists in cookies.
//   4. Atomically consumes the code (single-use) and attaches the owner
//      to the exact provisioned business (role = owner). Never creates
//      another business.
//
// Requires the service-role key as a server-only env var:
//   SUPABASE_SERVICE_ROLE_KEY   (never NEXT_PUBLIC_*)
// ============================================================

import { createHash, randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

/** sha256 hex — matches the DB-side digest(x, 'sha256') representation. */
function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

interface ClaimRow {
  id: string;
  business_id: string;
  owner_email: string | null;
  owner_name: string | null;
  status: string;
  expires_at: string;
}

export async function POST(request: NextRequest) {
  let email = "";
  let code = "";
  try {
    const body = (await request.json()) as { email?: string; code?: string };
    email = (body.email ?? "").trim().toLowerCase();
    code = (body.code ?? "").trim().toUpperCase();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid request." }, { status: 400 });
  }

  if (!email || !code) {
    return NextResponse.json(
      { ok: false, message: "Enter your business email and the access code." },
      { status: 400 }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !publishableKey || !serviceKey) {
    console.error("Owner activation configuration is incomplete.", {
      hasSupabaseUrl: Boolean(supabaseUrl),
      hasPublishableKey: Boolean(publishableKey),
      hasServiceRoleKey: Boolean(serviceKey),
    });
    return NextResponse.json(
      { ok: false, message: "Authentication service is not configured." },
      { status: 500 }
    );
  }

  // Server-only service-role client: claim validation + admin user ops.
  // NEVER exposed to the browser.
  const service = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1) Look claims up by the normalized code hash. The database stores only
  // the hash; matching email and lifecycle state are checked separately.
  const submittedCodeHash = sha256Hex(code);
  const { data: claimData, error: claimError } = await service
    .from("business_owner_claims")
    .select("id, business_id, owner_email, owner_name, status, expires_at")
    .eq("activation_code_hash", submittedCodeHash)
    .limit(10);

  if (claimError) {
    console.error("Owner activation claim lookup failed.", {
      message: claimError.message,
      code: claimError.code,
      details: claimError.details,
      hint: claimError.hint,
    });
    return NextResponse.json(
      { ok: false, message: "Could not verify the access code." },
      { status: 500 }
    );
  }
  const claims = (claimData as ClaimRow[] | null) ?? [];
  if (claims.length === 0) {
    return NextResponse.json({ ok: false, message: "Invalid access code." }, { status: 401 });
  }

  const claimRow = claims.find(
    (claim) => (claim.owner_email ?? "").trim().toLowerCase() === email
  );
  if (!claimRow) {
    return NextResponse.json(
      { ok: false, message: "The access code does not match this email." },
      { status: 401 }
    );
  }

  // 2) Check the canonical claim lifecycle after the code and email match.
  if (claimRow.status === "used") {
    return NextResponse.json(
      { ok: false, message: "This access code has already been used." },
      { status: 401 }
    );
  }
  if (claimRow.status !== "pending") {
    return NextResponse.json({ ok: false, message: "This access code has been revoked." }, { status: 401 });
  }
  const expiresAt = new Date(claimRow.expires_at).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return NextResponse.json({ ok: false, message: "This access code has expired." }, { status: 401 });
  }
  const { data: business, error: businessError } = await service
    .from("businesses")
    .select("id")
    .eq("id", claimRow.business_id)
    .maybeSingle();
  if (businessError) {
    return NextResponse.json(
      { ok: false, message: "Could not verify the provisioned business." },
      { status: 500 }
    );
  }
  if (!business) {
    return NextResponse.json(
      { ok: false, message: "This business is no longer available." },
      { status: 401 }
    );
  }

  // 3) Resolve or create the REAL Supabase Auth identity for this owner.
  const randomPassword = randomBytes(32).toString("base64");
  let userId: string | null = null;

  const { data: profile } = await service
    .from("profiles")
    .select("id")
    .eq("email", email)
    .limit(1)
    .maybeSingle();
  userId = profile?.id ?? null;

  if (!userId) {
    const { data: created, error: createError } = await service.auth.admin.createUser({
      email,
      password: randomPassword,
      email_confirm: true, // the activation code replaces email confirmation
      user_metadata: { full_name: claimRow.owner_name ?? null },
    });
    if (!createError && created.user) {
      userId = created.user.id;
    } else {
      // The account may already exist (earlier flow / concurrent activation).
      const { data: listed } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const match = listed?.users?.find((u) => (u.email ?? "").toLowerCase() === email);
      if (!match?.id) {
        return NextResponse.json(
          { ok: false, message: "Could not provision the owner account." },
          { status: 500 }
        );
      }
      userId = match.id;
    }
  }

  // A throwaway server-generated password lets the password grant below mint
  // a genuine session. It is never returned to the client and never stored —
  // the access code is the credential the owner actually knows.
  const { error: passwordError } = await service.auth.admin.updateUserById(userId, {
    password: randomPassword,
    email_confirm: true,
  });
  if (passwordError) {
    return NextResponse.json(
      { ok: false, message: "Could not complete activation. Please try again." },
      { status: 500 }
    );
  }

  // 4) Mint a GENUINE persistent Supabase session (cookie-based; refreshed by
  //    proxy.ts on every request). auth.uid() becomes the real owner id, so
  //    RLS, business_members and tenant isolation work unchanged.
  const cookieWrites: Array<{ name: string; value: string; options?: CookieOptions }> = [];
  const ssr = createServerClient(supabaseUrl, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(writes) {
        cookieWrites.push(...writes);
      },
    },
  });

  const { error: signInError } = await ssr.auth.signInWithPassword({
    email,
    password: randomPassword,
  });
  if (signInError) {
    return NextResponse.json(
      { ok: false, message: "Could not sign in the owner account." },
      { status: 500 }
    );
  }

  // 5) Attach the owner before consuming the claim, so a membership failure
  // does not burn a valid code.
  //    Upsert guarantees exactly one membership row per (business, user).
  const { error: memberError } = await service
    .from("business_members")
    .upsert(
      { business_id: claimRow.business_id, user_id: userId, role: "owner" },
      { onConflict: "business_id,user_id" }
    );
  if (memberError) {
    return NextResponse.json(
      { ok: false, message: "Could not attach the owner to the business." },
      { status: 500 }
    );
  }

  // 6) Consume the code atomically only after authentication and membership
  // succeed. The status filter prevents concurrent activations from sharing it.
  const nowIso = new Date().toISOString();
  const { data: consumed, error: consumeError } = await service
    .from("business_owner_claims")
    .update({ status: "used", used_at: nowIso, used_by: userId, consumed_by: userId, consumed_at: nowIso })
    .eq("id", claimRow.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (consumeError || !consumed) {
    return NextResponse.json(
      { ok: false, message: "This access code has already been used." },
      { status: 409 }
    );
  }

  // Keep the provisioned owner contact on the business in sync (same rule as
  // accept_owner_claim). Never creates another business.
  const { error: businessUpdateError } = await service
    .from("businesses")
    .update({ owner_email: email })
    .eq("id", claimRow.business_id);
  if (businessUpdateError) {
    return NextResponse.json(
      { ok: false, message: "Could not update the provisioned business." },
      { status: 500 }
    );
  }

  // 7) Success — session cookies ride on this response; the owner stays logged
  //    in (Supabase refresh-token cookies) until expiry/reauthentication.
  const response = NextResponse.json({ ok: true, business_id: claimRow.business_id });
  for (const { name, value, options } of cookieWrites) {
    response.cookies.set(name, value, options);
  }
  return response;
}