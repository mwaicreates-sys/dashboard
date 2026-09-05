import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// ============================================================
// Edge proxy (Next.js 16's middleware) — the session gate.
//
// Every route is protected by default; only /login and the auth
// callback are public. The gate VALIDATES the Supabase session
// with the Auth server (never trusting the bare cookie) and
// refreshes rotated session cookies on the way through.
//
// The proxy only answers "is there a valid session?". Which POV
// a session gets (platform admin vs business workspace) is
// decided from DATABASE state inside the app (server components
// + RLS) — never here, never in the client, never in localStorage.
// ============================================================

/** Routes that never require a session. */
const PUBLIC_PATHS = new Set(["/login", "/auth/callback", "/api/auth/activate"]);

export async function proxy(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  // Supabase not configured → keep the designed local-only behavior
  // (app/lib/supabase.ts degrades the same way).
  if (!supabaseUrl || !supabaseKey) return NextResponse.next({ request });

  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // Refreshed tokens must reach both the app (forwarded request
        // cookies) and the browser (Set-Cookie on the response).
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser() validates the token against the Auth server — unlike
  // getSession(), it cannot be satisfied by a crafted cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // 1) Unauthenticated visitor on any protected route → /login.
  //    No dashboard exposure, no workspace is assumed or created.
  if (!user && !PUBLIC_PATHS.has(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // 2) Authenticated user on /login → "/" (the DB-driven role router
  //    decides: platform admin → /admin, business user → workspace).
  //    /auth/callback is deliberately NOT redirected — it must run to
  //    exchange the email-confirmation code for a session.
  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except Next internals and static assets.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|webmanifest)$).*)",
  ],
};