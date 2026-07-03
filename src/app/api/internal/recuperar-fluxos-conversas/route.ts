import { NextResponse } from "next/server";
import {
  getRequestAuditMetadata,
  registrarLogAuditoriaSeguro,
} from "@/lib/auditoria/logs";
import { recuperarFluxoConversaPorUltimaMensagem } from "@/lib/automacoes/recuperar-fluxo-conversa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function autorizado(request: Request) {
  const secret = process.env.CRON_SECRET;
  return (
    !!secret &&
    request.headers.get("authorization") === `Bearer ${secret}`
  );
}

export async function POST(request: Request) {
  if (!autorizado(request)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const body = (await request.json()) as {
      conversa_ids?: unknown;
      confirmar?: unknown;
    };
    const conversaIds = Array.isArray(body.conversa_ids)
      ? Array.from(
          new Set(
            body.conversa_ids
              .map((item) => String(item || "").trim())
              .filter((item) => UUID_REGEX.test(item))
          )
        ).slice(0, 50)
      : [];

    if (body.confirmar !== true) {
      return NextResponse.json(
        {
          ok: false,
          error: "Confirmação obrigatória. Envie confirmar: true.",
        },
        { status: 400 }
      );
    }

    if (conversaIds.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Informe ao menos uma conversa válida." },
        { status: 400 }
      );
    }

    const auditMeta = getRequestAuditMetadata(request);
    const resultados = [];

    for (const conversaId of conversaIds) {
      try {
        const resultado = await recuperarFluxoConversaPorUltimaMensagem({
          conversaId,
          origem: "rota_interna_suporte",
        });
        resultados.push(resultado);

        if (resultado.empresaId) {
          await registrarLogAuditoriaSeguro({
            empresa_id: resultado.empresaId,
            categoria: "sistema",
            entidade: "conversa",
            entidade_id: conversaId,
            acao: "recuperar_fluxo_apos_falha_webhook",
            descricao:
              "Tentativa interna de iniciar o fluxo usando a última mensagem recebida.",
            detalhes: {
              iniciado: resultado.iniciado,
              motivo: resultado.motivo,
              automation_status:
                "automationStatus" in resultado
                  ? resultado.automationStatus
                  : null,
              automation_execucao_id:
                "automationExecucaoId" in resultado
                  ? resultado.automationExecucaoId
                  : null,
            },
            metadata: {
              origem: "rota_interna_suporte",
              mensagem_id:
                "mensagemId" in resultado ? resultado.mensagemId : null,
            },
            ...auditMeta,
          });
        }
      } catch (error) {
        resultados.push({
          ok: false,
          iniciado: false,
          conversaId,
          empresaId: null,
          motivo: "erro_inesperado",
          error:
            error instanceof Error ? error.message : "Erro desconhecido.",
        });
      }
    }

    return NextResponse.json({
      ok: resultados.some((resultado) => resultado.iniciado === true),
      total: resultados.length,
      iniciados: resultados.filter(
        (resultado) => resultado.iniciado === true
      ).length,
      ignorados: resultados.filter(
        (resultado) =>
          resultado.iniciado !== true && resultado.motivo !== "erro_inesperado"
      ).length,
      erros: resultados.filter(
        (resultado) => resultado.motivo === "erro_inesperado"
      ).length,
      resultados,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro ao recuperar fluxos.",
      },
      { status: 500 }
    );
  }
}
