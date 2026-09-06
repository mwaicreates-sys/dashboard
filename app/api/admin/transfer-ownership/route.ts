import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerClient, getServerUser } from "@/lib/serverAuth";

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function safeError(error: { code?: string; message?: string; details?: string; hint?: string }) {
  return {
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  };
}

async function findAuthUserByEmail(
  service: SupabaseClient,
  email: string
) {
  const perPage = 1000;
  for (let page = 1; ; page += 1) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const match = data.users.find(
      (user) => normalizeEmail(user.email ?? "") === email
    );
    if (match) return match;
    if (data.users.length < perPage) return null;
  }
}

export async function POST(request: NextRequest) {
  const requester = await getServerUser();
  const caller = await getSupabaseServerClient();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!requester || !caller || !supabaseUrl || !serviceKey) {
    return NextResponse.json({ ok: false, message: "Authentication is required." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? normalizeEmail(body.email) : "";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, message: "Enter a valid owner email." }, { status: 400 });
  }

  const { data: adminCheck, error: adminCheckError } = await caller.rpc("current_is_platform_admin");
  if (adminCheckError || adminCheck !== true) {
    return NextResponse.json({ ok: false, message: "Platform ownership transfer is not authorized." }, { status: 403 });
  }

  const service = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    let target = await findAuthUserByEmail(service, email);
    let invited = false;

    if (!target) {
      const invitation = await service.auth.admin.inviteUserByEmail(email);
      if (invitation.error || !invitation.data.user) {
        console.error("Platform ownership invitation failed.", safeError(invitation.error ?? { message: "No user returned." }));
        return NextResponse.json(
          { ok: false, message: "Could not prepare the new owner account." },
          { status: 502 }
        );
      }
      target = invitation.data.user;
      invited = true;
    }

    if (target.id === requester.id) {
      return NextResponse.json(
        { ok: false, message: "Choose a different owner account." },
        { status: 400 }
      );
    }

    const { data: transfer, error: transferError } = await caller.rpc(
      "transfer_platform_ownership",
      { p_new_owner_id: target.id }
    );
    if (transferError) {
      console.error("Platform ownership transfer failed.", safeError(transferError));
      return NextResponse.json(
        { ok: false, message: "Could not transfer platform ownership." },
        { status: 409 }
      );
    }

    return NextResponse.json({
      ok: true,
      invited,
      newOwnerEmail: email,
      transfer,
    });
  } catch (error) {
    console.error(
      "Platform ownership transfer request failed.",
      error instanceof Error ? { message: error.message } : { message: "Unknown error" }
    );
    return NextResponse.json(
      { ok: false, message: "Could not transfer platform ownership." },
      { status: 500 }
    );
  }
}
