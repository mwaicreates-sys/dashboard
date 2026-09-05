import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// ============================================================
// /auth/callback — email-confirmation / magic-link landing.
//
// Exchanges the one-time code in the URL for a session stored in
// cookies, then hands routing to "/" (the DB-driven role router:
// platform admin → /admin, business user → workspace/selector).
// Required because the project has email confirmation enabled.
// ============================================================

/** Only same-origin relative paths are accepted (no open redirects). */
function sanitizeRelative(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = sanitizeRelative(searchParams.get("next"));
  const claimToken = searchParams.get("claim");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.redirect(new URL("/login", origin));
  }

  // Cookie writes are collected and applied to the redirect response
  // (a Route Handler cannot write cookies mid-exchange).
  const cookieWrites: Array<{ name: string; value: string; options?: CookieOptions }> = [];
  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookieWrites.push(...cookiesToSet);
      },
    },
  });

  let exchanged = false;
  if (code) {
    try {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      exchanged = !error;
    } catch {
      exchanged = false;
    }
  }

  const target = exchanged
    ? next
    : `/login?error=${encodeURIComponent(
        "That sign-in link is invalid or has expired. Please sign in again."
      )}`;

  // Carry the owner-claim token through the email-confirmation exchange so a
  // NEW owner who just confirmed their account can still auto-claim the
  // business. It is stripped from the URL (via history.replaceState in
  // LoginForm) once the claim is attempted, keeping it out of the address bar.
  const targetUrl = new URL(target, origin);
  if (claimToken) targetUrl.searchParams.set("claim", claimToken);

  const response = NextResponse.redirect(targetUrl);
  for (const { name, value, options } of cookieWrites) {
    response.cookies.set(name, value, options);
  }
  return response;
}