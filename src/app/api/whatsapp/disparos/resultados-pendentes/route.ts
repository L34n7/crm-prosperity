import { NextResponse } from "next/server";

import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { podeVisualizarDisparos } from "@/lib/whatsapp/disparo-permissoes";
import { listarIntegracoesWhatsappPermitidas } from "@/lib/whatsapp/integracoes-multiplas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseAdmin = getSupabaseAdmin();

type CampanhaResultado = {
  id: string;
  nome: string | null;
  integracao_whatsapp_id: string;
  status: string;
  template_nome: string | null;
  total_itens: number | null;
  total_falhas: number | null;
  total_cancelados: number | null;
  pausa_motivo: string | null;
  erro: string | null;
  created_at: string | null;
  updated_at: string | null;
  started_at: string | null;
  paused_at: string | null;
  finished_at: string | null;
};

type IntegracaoResumo = {
  id: string;
  nome_conexao: string | null;
  numero: string | null;
};

type ConfirmacaoResumo = {
  campanha_id: string;
  total_enviados_confirmados: number | null;
  total_aguardando_confirmacao: number | null;
};

function inteiro(valor: unknown) {
  const numero = Number(valor || 0);
  return Number.isFinite(numero) ? Math.max(0, Math.trunc(numero)) : 0;
}

export async function GET() {
  try {
    const contexto = await getUsuarioContexto();

    if (!contexto.ok) {
      return NextResponse.json(
        { ok: false, error: contexto.error },
        { status: contexto.status }
      );
    }

    const { usuario } = contexto;

    if (!usuario?.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuario sem empresa vinculada." },
        { status: 400 }
      );
    }

    if (!podeVisualizarDisparos(usuario)) {
      return NextResponse.json(
        { ok: false, error: "Sem permissao para visualizar disparos." },
        { status: 403 }
      );
    }

    const acessoIntegracoes = await listarIntegracoesWhatsappPermitidas({
      usuario,
      empresaId: usuario.empresa_id,
    });

    if (acessoIntegracoes.idsPermitidos.length === 0) {
      return NextResponse.json({ ok: true, campanhas: [] });
    }

    const { data: reivindicadas, error: reivindicarError } =
      await supabaseAdmin.rpc("reivindicar_whatsapp_disparo_resultados", {
        p_usuario_id: usuario.id,
        p_empresa_id: usuario.empresa_id,
        p_integracao_ids: acessoIntegracoes.idsPermitidos,
        p_limite: 25,
      });

    if (reivindicarError) {
      throw new Error(
        `Erro ao buscar resultados pendentes: ${reivindicarError.message}`
      );
    }

    const ids = ((Array.isArray(reivindicadas) ? reivindicadas : []) as Array<{
      campanha_id?: string | null;
    }>)
      .map((item) => String(item.campanha_id || "").trim())
      .filter(Boolean);

    if (ids.length === 0) {
      return NextResponse.json({ ok: true, campanhas: [] });
    }

    const [
      { data: campanhasData, error: campanhasError },
      { data: integracoesData, error: integracoesError },
      { data: confirmacoesData, error: confirmacoesError },
    ] = await Promise.all([
      supabaseAdmin
        .from("whatsapp_disparo_campanhas")
        .select(
          [
            "id",
            "nome",
            "integracao_whatsapp_id",
            "status",
            "template_nome",
            "total_itens",
            "total_falhas",
            "total_cancelados",
            "pausa_motivo",
            "erro",
            "created_at",
            "updated_at",
            "started_at",
            "paused_at",
            "finished_at",
          ].join(",")
        )
        .eq("empresa_id", usuario.empresa_id)
        .in("id", ids),
      supabaseAdmin
        .from("integracoes_whatsapp")
        .select("id, nome_conexao, numero")
        .eq("empresa_id", usuario.empresa_id)
        .in("id", acessoIntegracoes.idsPermitidos),
      supabaseAdmin.rpc("resumir_whatsapp_disparo_confirmacoes", {
        p_campanha_ids: ids,
      }),
    ]);

    if (campanhasError) {
      throw new Error(
        `Erro ao carregar resultados das campanhas: ${campanhasError.message}`
      );
    }

    if (integracoesError) {
      throw new Error(
        `Erro ao carregar integracoes das campanhas: ${integracoesError.message}`
      );
    }

    if (confirmacoesError) {
      throw new Error(
        `Erro ao carregar confirmacoes das campanhas: ${confirmacoesError.message}`
      );
    }

    const ordem = new Map(ids.map((id, index) => [id, index]));
    const integracoes = new Map<string, IntegracaoResumo>(
      ((integracoesData || []) as unknown as IntegracaoResumo[]).map((item) => [
        item.id,
        item,
      ])
    );
    const confirmacoes = new Map<string, ConfirmacaoResumo>(
      ((confirmacoesData || []) as unknown as ConfirmacaoResumo[]).map((item) => [
        item.campanha_id,
        item,
      ])
    );

    const campanhas = ((campanhasData || []) as unknown as CampanhaResultado[])
      .sort(
        (a, b) =>
          (ordem.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
          (ordem.get(b.id) ?? Number.MAX_SAFE_INTEGER)
      )
      .map((campanha) => {
        const integracao = integracoes.get(campanha.integracao_whatsapp_id);
        const confirmacao = confirmacoes.get(campanha.id);

        return {
          id: campanha.id,
          nome: campanha.nome,
          integracao_whatsapp_id: campanha.integracao_whatsapp_id,
          integracao_nome: integracao?.nome_conexao || null,
          integracao_numero: integracao?.numero || null,
          status: campanha.status,
          template_nome: campanha.template_nome,
          total: inteiro(campanha.total_itens),
          enviados: inteiro(confirmacao?.total_enviados_confirmados),
          falhas: inteiro(campanha.total_falhas),
          cancelados: inteiro(campanha.total_cancelados),
          aguardando_confirmacao: inteiro(
            confirmacao?.total_aguardando_confirmacao
          ),
          motivo: campanha.pausa_motivo || campanha.erro || null,
          created_at: campanha.created_at,
          updated_at: campanha.updated_at,
          started_at: campanha.started_at,
          paused_at: campanha.paused_at,
          finished_at: campanha.finished_at,
        };
      });

    return NextResponse.json(
      { ok: true, campanhas },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      }
    );
  } catch (error) {
    console.error(
      "[WHATSAPP DISPAROS] Erro ao carregar resultados pendentes:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao carregar resultados pendentes.",
      },
      { status: 500 }
    );
  }
}
