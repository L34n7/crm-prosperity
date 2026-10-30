import { NextRequest, NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import {
  empresaPrecisaConfirmarPrograma,
  registrarAceitePrograma,
  VERSAO_ACEITE_PROGRAMA,
} from "@/lib/contratos/programa-aceite";

export async function POST(request: NextRequest) {
  const resultado = await getUsuarioContexto({
    ignorarAcessoTemporario: true,
  });

  if (!resultado.ok) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status },
    );
  }

  const { usuario } = resultado;
  if (!usuario.is_admin || !usuario.empresa_id) {
    return NextResponse.json(
      {
        ok: false,
        error: "Somente o administrador responsável pode confirmar estas condições.",
      },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => null);
  if (
    !body ||
    body.confirmado !== true ||
    body.versao !== VERSAO_ACEITE_PROGRAMA
  ) {
    return NextResponse.json(
      { ok: false, error: "Confirmação expressa e versão atual são obrigatórias." },
      { status: 400 },
    );
  }

  try {
    const pendente = await empresaPrecisaConfirmarPrograma(usuario.empresa_id);
    if (!pendente) {
      return NextResponse.json({
        ok: true,
        versao: VERSAO_ACEITE_PROGRAMA,
        ja_confirmado: true,
      });
    }

    const ip =
      request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip")?.trim() ||
      null;
    const userAgent = request.headers.get("user-agent")?.slice(0, 500) || null;

    const registro = await registrarAceitePrograma({
      empresaId: usuario.empresa_id,
      usuarioId: usuario.id,
      ip: ip?.slice(0, 80) || null,
      userAgent,
    });

    return NextResponse.json({
      ok: true,
      versao: registro.versao_termos,
      confirmado_em: registro.aceito_em,
      confirmado_em_local: new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "America/Sao_Paulo",
      }).format(new Date(registro.aceito_em)),
    });
  } catch (error) {
    console.error("[CONTRATOS] Falha ao registrar aceite do programa:", error);
    return NextResponse.json(
      { ok: false, error: "Não foi possível salvar o aceite. Tente novamente." },
      { status: 500 },
    );
  }
}
