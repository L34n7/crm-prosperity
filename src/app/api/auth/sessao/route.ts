import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { registrarEventoSessaoUsuario } from "@/lib/auth/session-events";

type SessaoBody = {
  evento?: "login" | "heartbeat" | "logout";
  client_session_id?: string;
};

const supabaseAdmin = getSupabaseAdmin();

function getIp(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  return (
    forwardedFor?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null
  );
}

async function lerBody(request: NextRequest): Promise<SessaoBody> {
  try {
    return (await request.json()) as SessaoBody;
  } catch {
    return {};
  }
}

export async function POST(request: NextRequest) {
  const body = await lerBody(request);
  const evento = body.evento || "heartbeat";
  const clientSessionId = String(body.client_session_id || "").trim();

  if (!["login", "heartbeat", "logout"].includes(evento)) {
    return NextResponse.json(
      { ok: false, error: "Evento de sessao invalido" },
      { status: 400 }
    );
  }

  if (!clientSessionId) {
    return NextResponse.json(
      { ok: false, error: "client_session_id obrigatorio" },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Nao autenticado" },
      { status: 401 }
    );
  }

  const { data: usuario, error } = await supabaseAdmin
    .from("usuarios")
    .select("id, auth_user_id, empresa_id, status")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  if (!usuario) {
    return NextResponse.json(
      { ok: false, error: "Usuario nao encontrado" },
      { status: 404 }
    );
  }

  await registrarEventoSessaoUsuario({
    usuario,
    evento,
    clientSessionId,
    ip: getIp(request),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ ok: true });
}
