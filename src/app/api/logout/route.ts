import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { registrarEventoSessaoUsuario } from "@/lib/auth/session-events";

const supabaseAdmin = getSupabaseAdmin();

async function lerBody(request: Request) {
  try {
    return (await request.json()) as { client_session_id?: string };
  } catch {
    return {};
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const body = await lerBody(request);
  const clientSessionId = String(body.client_session_id || "").trim();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user && clientSessionId) {
    const { data: usuario } = await supabaseAdmin
      .from("usuarios")
      .select("id, auth_user_id, empresa_id")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (usuario) {
      await registrarEventoSessaoUsuario({
        usuario,
        evento: "logout",
        clientSessionId,
        userAgent: request.headers.get("user-agent"),
      });
    }
  }

  await supabase.auth.signOut();

  return NextResponse.json({
    ok: true,
    message: "Logout realizado com sucesso",
  });
}
