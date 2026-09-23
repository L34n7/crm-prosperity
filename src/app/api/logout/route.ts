import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { registrarEventoSessaoUsuario } from "@/lib/auth/session-events";
import {
  ACESSO_TEMPORARIO_EMPRESA_COOKIE,
  encerrarAcessoTemporarioEmpresaAtual,
  getAcessoTemporarioEmpresaCookieOptions,
} from "@/lib/auth/acesso-temporario-empresa";

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

  if (user) {
    try {
      await encerrarAcessoTemporarioEmpresaAtual({
        authUserId: user.id,
      });
    } catch (error) {
      console.error("[LOGOUT] Falha ao encerrar sessão de suporte:", error);
    }
  }

  await supabase.auth.signOut();

  const response = NextResponse.json({
    ok: true,
    message: "Logout realizado com sucesso",
  });

  response.cookies.set(ACESSO_TEMPORARIO_EMPRESA_COOKIE, "", {
    ...getAcessoTemporarioEmpresaCookieOptions(),
    maxAge: 0,
    expires: new Date(0),
  });

  return response;
}
