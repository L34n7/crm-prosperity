import { NextRequest, NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { podeVisualizarDisparos } from "@/lib/whatsapp/disparo-permissoes";
import { listarIntegracoesWhatsappPermitidas } from "@/lib/whatsapp/integracoes-multiplas";

const supabaseAdmin = getSupabaseAdmin();

const STATUS_ATIVOS = ["pendente", "enviando"];
const STATUS_TERMINAIS_RECENTES = [
  "concluida",
  "pausada_por_falhas",
  "pausada_por_lista_invalida",
  "pausada_por_erro_meta",
  "pausada_por_conta_bloqueada",
  "cancelada",
  "erro",
];

type CampanhaDisparo = {
  id: string;
  nome: string | null;
  integracao_whatsapp_id: string | null;
  usuario_id: string | null;
  status: string | null;
  template_nome: string | null;
  total_itens: number | null;
  total_pendentes: number | null;
  total_processando: number | null;
  total_enviados: number | null;
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

function inteiro(valor: unknown) {
  const numero = Number(valor || 0);
  return Number.isFinite(numero) ? Math.max(0, Math.trunc(numero)) : 0;
}

function motivoCampanha(campanha: CampanhaDisparo) {
  if (campanha.pausa_motivo || campanha.erro) {
    return campanha.pausa_motivo || campanha.erro;
  }

  switch (campanha.status) {
    case "pausada_por_conta_bloqueada":
      return "A Meta bloqueou ou desativou a conta WhatsApp Business durante o disparo.";
    case "pausada_por_lista_invalida":
      return "A lista apresentou muitos numeros invalidos ou indisponiveis.";
    case "pausada_por_erro_meta":
      return "A Meta retornou erros que exigem pausa operacional.";
    case "pausada_por_falhas":
      return "Muitas mensagens falharam no lote processado.";
    case "cancelada":
      return "O disparo foi cancelado antes de concluir todos os envios.";
    case "erro":
      return "O disparo foi interrompido por erro operacional.";
    default:
      return null;
  }
}

function mapearCampanha(
  campanha: CampanhaDisparo,
  integracoes: Map<string, IntegracaoResumo>
) {
  const total = inteiro(campanha.total_itens);
  const enviados = inteiro(campanha.total_enviados);
  const falhas = inteiro(campanha.total_falhas);
  const cancelados = inteiro(campanha.total_cancelados);
  const pendentes = inteiro(campanha.total_pendentes);
  const processando = inteiro(campanha.total_processando);
  const processados = Math.min(total, enviados + falhas + cancelados);
  const integracao = campanha.integracao_whatsapp_id
    ? integracoes.get(campanha.integracao_whatsapp_id) || null
    : null;

  return {
    id: campanha.id,
    nome: campanha.nome,
    integracao_whatsapp_id: campanha.integracao_whatsapp_id,
    integracao_nome: integracao?.nome_conexao || null,
    integracao_numero: integracao?.numero || null,
    usuario_id: campanha.usuario_id,
    status: campanha.status,
    template_nome: campanha.template_nome,
    total,
    enviados,
    falhas,
    cancelados,
    pendentes,
    processando,
    processados,
    motivo: motivoCampanha(campanha),
    created_at: campanha.created_at,
    updated_at: campanha.updated_at,
    started_at: campanha.started_at,
    paused_at: campanha.paused_at,
    finished_at: campanha.finished_at,
  };
}

export async function GET(request: NextRequest) {
  try {
    const resultadoContexto = await getUsuarioContexto();

    if (!resultadoContexto.ok) {
      return NextResponse.json(
        { ok: false, error: resultadoContexto.error },
        { status: resultadoContexto.status }
      );
    }

    const { usuario } = resultadoContexto;
    const integracaoId =
      request.nextUrl.searchParams.get("integracao_id")?.trim() || "";
    const escopoEmpresa =
      request.nextUrl.searchParams.get("escopo")?.trim() === "empresa";

    if (!usuario?.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuario sem empresa vinculada." },
        { status: 400 }
      );
    }

    if (!podeVisualizarDisparos(usuario)) {
      return NextResponse.json(
        { ok: false, error: "Voce nao tem permissao para visualizar disparos." },
        { status: 403 }
      );
    }

    const acessoIntegracoes = await listarIntegracoesWhatsappPermitidas({
      usuario,
      empresaId: usuario.empresa_id,
    });

    if (integracaoId && !acessoIntegracoes.idsPermitidos.includes(integracaoId)) {
      return NextResponse.json(
        { ok: false, error: "Sem acesso a esta integracao WhatsApp." },
        { status: 403 }
      );
    }

    const bloqueioEscopo = integracaoId
      ? "integracao"
      : escopoEmpresa
      ? "empresa"
      : "usuario";

    if (!integracaoId && acessoIntegracoes.idsPermitidos.length === 0) {
      return NextResponse.json({
        ok: true,
        usuario_id: usuario.id,
        empresa_id: usuario.empresa_id,
        integracao_id: null,
        bloquear_disparos: false,
        bloqueio_escopo: bloqueioEscopo,
        campanha: null,
        campanhas: [],
      });
    }

    const { data: integracoesData } = await supabaseAdmin
      .from("integracoes_whatsapp")
      .select("id, nome_conexao, numero")
      .eq("empresa_id", usuario.empresa_id)
      .in(
        "id",
        integracaoId ? [integracaoId] : acessoIntegracoes.idsPermitidos
      );

    const integracoes = new Map<string, IntegracaoResumo>(
      ((integracoesData || []) as IntegracaoResumo[]).map((item) => [
        item.id,
        item,
      ])
    );

    const campos = `
      id,
      nome,
      integracao_whatsapp_id,
      usuario_id,
      status,
      template_nome,
      total_itens,
      total_pendentes,
      total_processando,
      total_enviados,
      total_falhas,
      total_cancelados,
      pausa_motivo,
      erro,
      created_at,
      updated_at,
      started_at,
      paused_at,
      finished_at
    `;

    let queryAtivas = supabaseAdmin
      .from("whatsapp_disparo_campanhas")
      .select(campos)
      .eq("empresa_id", usuario.empresa_id)
      .in("status", STATUS_ATIVOS);

    if (integracaoId) {
      queryAtivas = queryAtivas.eq("integracao_whatsapp_id", integracaoId);
    } else {
      queryAtivas = queryAtivas.in(
        "integracao_whatsapp_id",
        acessoIntegracoes.idsPermitidos
      );

      if (!escopoEmpresa) {
        queryAtivas = queryAtivas.eq("usuario_id", usuario.id);
      }
    }

    const { data: campanhasAtivas, error: campanhasAtivasError } =
      await queryAtivas.order("created_at", { ascending: false }).limit(25);

    if (campanhasAtivasError) {
      return NextResponse.json(
        {
          ok: false,
          error: `Erro ao buscar disparos em andamento: ${campanhasAtivasError.message}`,
        },
        { status: 500 }
      );
    }

    const ativas = ((campanhasAtivas || []) as CampanhaDisparo[]).map(
      (campanha) => mapearCampanha(campanha, integracoes)
    );

    if (ativas.length > 0) {
      return NextResponse.json({
        ok: true,
        usuario_id: usuario.id,
        empresa_id: usuario.empresa_id,
        integracao_id: integracaoId || null,
        bloquear_disparos: true,
        bloqueio_escopo: bloqueioEscopo,
        campanha: ativas[0],
        campanhas: ativas,
      });
    }

    const atualizadoDepoisDe = new Date(
      Date.now() - 10 * 60 * 1000
    ).toISOString();

    let queryRecentes = supabaseAdmin
      .from("whatsapp_disparo_campanhas")
      .select(campos)
      .eq("empresa_id", usuario.empresa_id)
      .in("status", STATUS_TERMINAIS_RECENTES)
      .gte("updated_at", atualizadoDepoisDe);

    if (integracaoId) {
      queryRecentes = queryRecentes.eq("integracao_whatsapp_id", integracaoId);
    } else {
      queryRecentes = queryRecentes.in(
        "integracao_whatsapp_id",
        acessoIntegracoes.idsPermitidos
      );

      if (!escopoEmpresa) {
        queryRecentes = queryRecentes.eq("usuario_id", usuario.id);
      }
    }

    const { data: campanhasRecentes, error: campanhasRecentesError } =
      await queryRecentes.order("updated_at", { ascending: false }).limit(5);

    if (campanhasRecentesError) {
      return NextResponse.json(
        {
          ok: false,
          error: `Erro ao buscar disparos recentes: ${campanhasRecentesError.message}`,
        },
        { status: 500 }
      );
    }

    const recentes = ((campanhasRecentes || []) as CampanhaDisparo[]).map(
      (campanha) => mapearCampanha(campanha, integracoes)
    );

    return NextResponse.json({
      ok: true,
      usuario_id: usuario.id,
      empresa_id: usuario.empresa_id,
      integracao_id: integracaoId || null,
      bloquear_disparos: false,
      bloqueio_escopo: bloqueioEscopo,
      campanha: recentes[0] || null,
      campanhas: recentes,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao buscar disparos em andamento.",
      },
      { status: 500 }
    );
  }
}
