import { NextRequest, NextResponse } from "next/server";
import {
  getUsuarioContexto,
  type UsuarioContexto,
} from "@/lib/auth/get-usuario-contexto";
import {
  getRequestAuditMetadata,
  registrarLogAuditoriaSeguro,
} from "@/lib/auditoria/logs";
import { cancelarCampanhaDisparo } from "@/lib/whatsapp/disparo-fila";
import { podeRealizarDisparos } from "@/lib/whatsapp/disparo-permissoes";

type UsuarioCancelamento = Pick<
  UsuarioContexto,
  "assinatura" | "permissoes"
>;

function podeCancelarDisparo(usuario: UsuarioCancelamento) {
  if (usuario.assinatura?.status === "bloqueada") return false;

  return podeRealizarDisparos(usuario);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const contexto = await getUsuarioContexto();

    if (!contexto.ok) {
      return NextResponse.json(
        { ok: false, error: contexto.error },
        { status: contexto.status }
      );
    }

    const { usuario } = contexto;
    const { id } = await params;

    if (!usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuario sem empresa vinculada." },
        { status: 400 }
      );
    }

    if (!podeCancelarDisparo(usuario)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Voce nao tem permissao para cancelar disparos.",
        },
        { status: 403 }
      );
    }

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "Campanha nao informada." },
        { status: 400 }
      );
    }

    let motivo = "";

    try {
      const body = (await request.json()) as { motivo?: unknown };
      motivo = String(body?.motivo || "").trim().slice(0, 500);
    } catch {
      motivo = "";
    }

    const resultado = await cancelarCampanhaDisparo({
      campanhaId: id,
      empresaId: usuario.empresa_id,
      usuarioId: usuario.id,
      motivo,
    });

    if (!resultado.ok) {
      const naoEncontrada = resultado.motivo === "campanha_nao_encontrada";

      return NextResponse.json(
        {
          ok: false,
          error: naoEncontrada
            ? "Campanha de disparo nao encontrada."
            : "Esta campanha nao esta mais em processamento.",
          motivo: resultado.motivo,
          status_campanha: resultado.status,
        },
        { status: naoEncontrada ? 404 : 409 }
      );
    }

    const auditMeta = getRequestAuditMetadata(request);

    await registrarLogAuditoriaSeguro({
      empresa_id: usuario.empresa_id,
      categoria: "disparos",
      entidade: "disparo",
      entidade_id: id,
      acao: "disparo_em_massa_cancelado",
      descricao: "Disparo em massa cancelado manualmente",
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      usuario_email: usuario.email,
      depois: {
        campanha_id: id,
        status: resultado.status,
        motivo: resultado.motivo,
        resumo: resultado.resumo,
      },
      ip: auditMeta.ip,
      user_agent: auditMeta.user_agent,
    });

    return NextResponse.json({
      ok: true,
      campanha_id: id,
      status: resultado.status,
      motivo: resultado.motivo,
      resumo: resultado.resumo,
      message: "Disparo em massa cancelado.",
    });
  } catch (error) {
    console.error("[CANCELAR DISPARO EM MASSA] Erro:", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao cancelar disparo.",
      },
      { status: 500 }
    );
  }
}
