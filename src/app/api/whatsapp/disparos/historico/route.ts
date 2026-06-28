import { NextRequest, NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { podeVisualizarDisparos } from "@/lib/whatsapp/disparo-permissoes";

const supabaseAdmin = getSupabaseAdmin();

const STATUS_CAMPANHAS_INTERROMPIDAS = [
  "pausada_por_falhas",
  "pausada_por_lista_invalida",
  "pausada_por_erro_meta",
  "pausada_por_conta_bloqueada",
  "cancelada",
  "erro",
];

type CampanhaDisparoHistorico = {
  id: string;
  nome?: string | null;
  integracao_whatsapp_id?: string | null;
  status?: string | null;
  template_nome?: string | null;
  template_idioma?: string | null;
  total_itens?: number | null;
  total_pendentes?: number | null;
  total_processando?: number | null;
  total_enviados?: number | null;
  total_falhas?: number | null;
  total_cancelados?: number | null;
  pausa_motivo?: string | null;
  erro?: string | null;
  metadata_json?: unknown;
  created_at?: string | null;
  updated_at?: string | null;
  paused_at?: string | null;
  finished_at?: string | null;
};

function numeroInteiro(valor: unknown) {
  const numero = Number(valor || 0);
  return Number.isFinite(numero) ? Math.max(0, Math.trunc(numero)) : 0;
}

function normalizarMetadata(valor: unknown): Record<string, unknown> {
  if (!valor) return {};

  if (typeof valor === "string") {
    try {
      const parsed = JSON.parse(valor);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed
        : {};
    } catch {
      return {};
    }
  }

  return typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
}

function traduzirPausaCampanhaDisparo(
  status?: string | null,
  motivo?: string | null,
  erro?: string | null
) {
  const detalhe = motivo || erro;

  if (detalhe) return detalhe;

  switch (status) {
    case "pausada_por_conta_bloqueada":
      return "O disparo em massa foi cancelado porque a Meta sinalizou bloqueio ou desativacao da conta WhatsApp Business.";

    case "pausada_por_lista_invalida":
      return "O disparo em massa foi cancelado porque a lista apresentou muitos numeros invalidos ou indisponiveis.";

    case "pausada_por_erro_meta":
      return "O disparo em massa foi cancelado porque a Meta retornou erros que exigem pausa operacional.";

    case "pausada_por_falhas":
      return "O disparo em massa foi cancelado automaticamente porque muitas mensagens falharam no lote processado.";

    case "cancelada":
      return "O disparo em massa foi cancelado antes de concluir todos os envios.";

    default:
      return "O disparo em massa foi interrompido para proteger a conta WhatsApp e a estabilidade do sistema.";
  }
}

function traduzirErroMetaWhatsApp(
  codigo?: number | string | null,
  erroTecnico?: string | null
) {
  const code = Number(codigo || 0);

  switch (code) {
    case 131031:
      return "A conta WhatsApp Business foi bloqueada ou desativada pela Meta. Enquanto o numero estiver banido/bloqueado, nao e possivel enviar mensagens por essa integracao. Acesse o Gerenciador do WhatsApp na Meta e solicite uma analise se acreditar que foi um engano.";

    case 131042:
      return "A conta WhatsApp Business possui pendências financeiras na Meta. Acesse o Gerenciador de Negócios da Meta, entre em Cobrança/Pagamentos, selecione a conta WhatsApp Business e regularize o pagamento pendente. Após a confirmação do pagamento, tente enviar o disparo novamente.";

    case 131026:
      return "O número do destinatário está inválido, indisponível ou não pode receber mensagens pelo WhatsApp.";

    case 470:
      return "A janela de atendimento de 24 horas foi encerrada. Envie um template aprovado para iniciar uma nova conversa.";

    case 368:
      return "A conta WhatsApp está temporariamente bloqueada pela Meta.";

    default:
      return erroTecnico || "Falha ao enviar mensagem pelo WhatsApp.";
  }
}

async function buscarCampanhasFiltroHistorico(empresaId: string) {
  const { data, error } = await supabaseAdmin
    .from("whatsapp_disparo_campanhas")
    .select(
      `
        id,
        nome,
        template_nome,
        total_itens,
        created_at,
        status
      `
    )
    .eq("empresa_id", empresaId)
    .order("created_at", { ascending: false })
    .limit(150);

  if (error) {
    console.error(
      "[HISTORICO DISPAROS] Erro ao buscar campanhas para filtro:",
      error
    );
    return [];
  }

  return data || [];
}

export async function GET(req: NextRequest) {
  try {
    const resultadoContexto = await getUsuarioContexto();

    if (!resultadoContexto.ok) {
      return NextResponse.json(
        { ok: false, error: resultadoContexto.error },
        { status: resultadoContexto.status }
      );
    }

    const { usuario } = resultadoContexto;

    if (!usuario?.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada." },
        { status: 400 }
      );
    }

    if (!podeVisualizarDisparos(usuario)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Voce nao tem permissao para visualizar disparos.",
        },
        { status: 403 }
      );
    }

    const searchParams = req.nextUrl.searchParams;
    const limitParam = Number(searchParams.get("limit") || "50");
    const campanhaFiltroId =
      searchParams.get("campanha_id")?.trim() ||
      searchParams.get("campanha_disparo_id")?.trim() ||
      "";

    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(limitParam, 1), 200)
      : 50;

    let queryLogs = supabaseAdmin
      .from("whatsapp_disparos_logs")
      .select(`
        id,
        campanha_disparo_id,
        conversa_id,
        conversa_protocolo_id,
        contato_id,
        integracao_whatsapp_id,
        numero,
        nome_contato,
        template_nome,
        template_idioma,
        mensagem,
        status,
        erro,
        status_http,
        message_id,
        metadata_json,
        created_at
      `)
      .eq("empresa_id", usuario.empresa_id)
      .order("created_at", { ascending: false });

    if (campanhaFiltroId) {
      queryLogs = queryLogs.eq("campanha_disparo_id", campanhaFiltroId);
    }

    const { data, error } = await queryLogs.limit(limit);

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: `Erro ao buscar histórico de disparos: ${error.message}`,
        },
        { status: 500 }
      );
    }

    const { data: mensagensAgendadas, error: mensagensAgendadasError } =
      campanhaFiltroId
        ? { data: [], error: null }
        : await supabaseAdmin
            .from("mensagens")
            .select(`
        id,
        empresa_id,
        conversa_id,
        conversa_protocolo_id,
        conteudo,
        status_envio,
        mensagem_externa_id,
        metadata_json,
        created_at,
        updated_at,
        automacao_execucao_id,
        automacao_no_id
      `)
            .eq("empresa_id", usuario.empresa_id)
            .eq("tipo_mensagem", "template")
            .eq("origem", "automatica")
            .eq("metadata_json->>tipo", "disparo_template_agendado")
            .order("created_at", { ascending: false })
            .limit(limit);

  if (mensagensAgendadasError) {
    console.error(
      "[HISTÓRICO DISPAROS] Erro ao buscar mensagens agendadas:",
      mensagensAgendadasError
    );
  }

    let queryCampanhasInterrompidas = supabaseAdmin
        .from("whatsapp_disparo_campanhas")
        .select(
          `
          id,
          nome,
          integracao_whatsapp_id,
          status,
          template_nome,
          template_idioma,
          total_itens,
          total_pendentes,
          total_processando,
          total_enviados,
          total_falhas,
          total_cancelados,
          pausa_motivo,
          erro,
          metadata_json,
          created_at,
          updated_at,
          paused_at,
          finished_at
        `
        )
        .eq("empresa_id", usuario.empresa_id)
        .in("status", STATUS_CAMPANHAS_INTERROMPIDAS)
        .order("updated_at", { ascending: false });

    if (campanhaFiltroId) {
      queryCampanhasInterrompidas =
        queryCampanhasInterrompidas.eq("id", campanhaFiltroId);
    }

    const { data: campanhasInterrompidas, error: campanhasInterrompidasError } =
      await queryCampanhasInterrompidas.limit(limit);

    if (campanhasInterrompidasError) {
      console.error(
        "[HISTORICO DISPAROS] Erro ao buscar campanhas interrompidas:",
        campanhasInterrompidasError
      );
    }

    const messageIds = Array.from(
      new Set(
        (data || [])
          .map((item: any) => item.message_id)
          .filter((messageId: any): messageId is string => Boolean(messageId))
      )
    );

    let mensagensPorMessageId = new Map<string, any>();

    if (messageIds.length > 0) {
      const { data: mensagensData, error: mensagensError } = await supabaseAdmin
        .from("mensagens")
        .select(`
          mensagem_externa_id,
          metadata_json,
          status_envio
        `)
        .eq("empresa_id", usuario.empresa_id)
        .in("mensagem_externa_id", messageIds);

      if (!mensagensError && mensagensData) {
        mensagensPorMessageId = new Map(
          mensagensData.map((mensagem: any) => [
            mensagem.mensagem_externa_id,
            mensagem,
          ])
        );
      }
    }

    const campanhasIdsLogs = Array.from(
      new Set(
        (data || [])
          .map((item: any) => item.campanha_disparo_id)
          .filter((campanhaId: any): campanhaId is string =>
            Boolean(campanhaId)
          )
      )
    );
    const campanhasPorId = new Map<string, CampanhaDisparoHistorico>();

    if (campanhasIdsLogs.length > 0) {
      const { data: campanhasData, error: campanhasError } =
        await supabaseAdmin
          .from("whatsapp_disparo_campanhas")
          .select(
            `
              id,
              nome,
              template_nome,
              template_idioma,
              total_itens,
              created_at
            `
          )
          .eq("empresa_id", usuario.empresa_id)
          .in("id", campanhasIdsLogs);

      if (!campanhasError && campanhasData) {
        for (const campanha of campanhasData as CampanhaDisparoHistorico[]) {
          campanhasPorId.set(campanha.id, campanha);
        }
      }
    }

    const resultados = (data || []).map((item: any) => {
      const mensagemVinculada = item.message_id
        ? mensagensPorMessageId.get(item.message_id)
        : null;

      const metadataLog =
        typeof item.metadata_json === "string"
          ? (() => {
              try {
                return JSON.parse(item.metadata_json);
              } catch {
                return {};
              }
            })()
          : item.metadata_json || {};

      const metadataMensagem =
        typeof mensagemVinculada?.metadata_json === "string"
          ? (() => {
              try {
                return JSON.parse(mensagemVinculada.metadata_json);
              } catch {
                return {};
              }
            })()
          : mensagemVinculada?.metadata_json || {};

      const metadataFinal = {
        ...metadataLog,
        ...metadataMensagem,
        log_metadata: metadataLog,
        mensagem_metadata: metadataMensagem,
      };

      const statusMensagem = mensagemVinculada?.status_envio || null;

      const rawStatus = metadataFinal?.whatsapp_status?.raw_status || null;
      const erroMeta =
        rawStatus?.errors?.[0] ||
        metadataFinal?.meta_error ||
        metadataFinal?.meta_response?.error ||
        null;

      const codigoErroMeta = erroMeta?.code || null;

      const erroTecnico =
        metadataFinal?.whatsapp_status?.error_message ||
        erroMeta?.error_data?.details ||
        erroMeta?.message ||
        erroMeta?.title ||
        item.erro ||
        null;

      const erroAmigavel = traduzirErroMetaWhatsApp(
        codigoErroMeta,
        erroTecnico
      );

      const statusFinal:
        | "falha"
        | "sucesso"
        | "processando"
        | "pendente" =
        statusMensagem === "falha"
          ? "falha"
          : statusMensagem === "enviada" ||
            statusMensagem === "entregue" ||
            statusMensagem === "lida"
          ? "sucesso"
          : item.status === "falha"
          ? "falha"
          : item.status === "sucesso"
          ? "sucesso"
          : item.status === "processando"
          ? "processando"
          : "pendente";

      const tipoLog = String(
        metadataLog?.tipo || metadataFinal?.tipo || ""
      ).toLowerCase();

      const origemLog = String(
        metadataLog?.origem || metadataFinal?.origem || ""
      ).toLowerCase();

      const origemHistorico =
        tipoLog === "disparo_template_individual" || origemLog === "individual"
          ? "individual"
          : tipoLog === "disparo_template_agendado" || origemLog === "agendado"
          ? "agendado"
          : "manual";

      const campanhaId = item.campanha_disparo_id || null;
      const campanhaLog = campanhaId ? campanhasPorId.get(campanhaId) : null;

      return {
        id: item.id,
        campanha_id: campanhaId,
        campanha_nome: campanhaLog?.nome || null,
        created_at: item.created_at,
        conversa_id: item.conversa_id || null,
        conversa_protocolo_id: item.conversa_protocolo_id || null,
        contato_id: item.contato_id || null,
        integracao_whatsapp_id: item.integracao_whatsapp_id || null,
        numero: item.numero || "-",
        nome_contato: item.nome_contato || "Sem nome",
        template_nome: item.template_nome || "-",
        template_idioma: item.template_idioma || null,
        mensagem_template: item.mensagem || "Sem conteúdo",
        status_disparo: statusFinal,
        status_label:
          statusFinal === "sucesso"
            ? statusMensagem === "lida"
              ? "Lida"
              : statusMensagem === "entregue"
              ? "Entregue"
              : "Enviado"
            : statusFinal === "processando"
            ? "Aguardando confirmação"
            : statusFinal === "pendente"
            ? "Pendente"
            : "Falhou",
        status_http: item.status_http || null,
        message_id: item.message_id || null,
        erro: erroTecnico,
        erro_amigavel: erroAmigavel,
        erro_codigo_meta: codigoErroMeta,
        metadata_json: metadataFinal,
        origem_historico: origemHistorico,
        ok: statusFinal === "sucesso",
      };
    });


    
    const resultadosAgendados = (mensagensAgendadas || []).map((mensagem: any) => {
      const metadata = mensagem.metadata_json || {};
      const whatsappStatus = metadata.whatsapp_status || {};
      const rawStatus = whatsappStatus.raw_status || {};
      const erroMeta = rawStatus.errors?.[0] || null;

      const codigoErroMeta = erroMeta?.code || null;

      const erroTecnico =
        whatsappStatus.error_message ||
        erroMeta?.message ||
        erroMeta?.title ||
        null;

      const statusFinal:
        | "falha"
        | "sucesso"
        | "processando"
        | "pendente" =
        mensagem.status_envio === "falha"
          ? "falha"
          : mensagem.status_envio === "enviada" ||
            mensagem.status_envio === "entregue" ||
            mensagem.status_envio === "lida"
          ? "sucesso"
          : mensagem.status_envio === "processando"
          ? "processando"
          : "pendente";

      return {
        id: mensagem.id,
        campanha_id: null,
        campanha_nome: null,
        created_at: mensagem.created_at,
        conversa_id: mensagem.conversa_id || null,
        conversa_protocolo_id: mensagem.conversa_protocolo_id || null,
        contato_id: metadata.contato_id || null,
        numero: metadata.numero_destino || "-",
        nome_contato: metadata.nome_contato || "Sem nome",
        template_nome: metadata.template_nome || "-",
        template_idioma: metadata.template_idioma || null,
        mensagem_template:
          metadata.conteudo_renderizado || mensagem.conteudo || "Sem conteúdo",
        status_disparo: statusFinal,
        status_label:
          statusFinal === "sucesso"
            ? mensagem.status_envio === "lida"
              ? "Lida"
              : mensagem.status_envio === "entregue"
              ? "Entregue"
              : "Enviado"
            : statusFinal === "processando"
            ? "Aguardando confirmação"
            : statusFinal === "pendente"
            ? "Pendente"
            : "Falhou",
        status_http: null,
        message_id: mensagem.mensagem_externa_id || null,
        erro: erroTecnico,
        erro_amigavel: traduzirErroMetaWhatsApp(codigoErroMeta, erroTecnico),
        erro_codigo_meta: codigoErroMeta,
        metadata_json: metadata,
        ok: statusFinal === "sucesso",
        origem_historico: "agendado",
      };
    });

    const resultadosCampanhasInterrompidas = (
      (campanhasInterrompidas || []) as CampanhaDisparoHistorico[]
    ).map((campanha) => {
      const totalItens = numeroInteiro(campanha.total_itens);
      const totalPendentes = numeroInteiro(campanha.total_pendentes);
      const totalProcessando = numeroInteiro(campanha.total_processando);
      const totalEnviados = numeroInteiro(campanha.total_enviados);
      const totalFalhas = numeroInteiro(campanha.total_falhas);
      const totalCanceladosBanco = numeroInteiro(campanha.total_cancelados);
      const totalCancelados = Math.max(
        totalCanceladosBanco + totalPendentes + totalProcessando,
        0
      );

      const dataReferencia =
        campanha.paused_at ||
        campanha.finished_at ||
        campanha.updated_at ||
        campanha.created_at ||
        new Date().toISOString();

      const motivo = traduzirPausaCampanhaDisparo(
        campanha.status,
        campanha.pausa_motivo,
        campanha.erro
      );

      const metadataCampanha = normalizarMetadata(campanha.metadata_json);

      return {
        id: `campanha-${campanha.id}`,
        campanha_id: campanha.id,
        campanha_nome: campanha.nome || null,
        created_at: dataReferencia,
        conversa_id: null,
        conversa_protocolo_id: null,
        contato_id: null,
        integracao_whatsapp_id: campanha.integracao_whatsapp_id || null,
        numero: `${totalItens} contatos`,
        nome_contato: "Disparo em massa",
        template_nome: campanha.template_nome || "-",
        template_idioma: campanha.template_idioma || null,
        mensagem_template: motivo,
        status_disparo: "falha",
        status_label: "Disparo em massa cancelado",
        status_http: null,
        message_id: null,
        erro: campanha.erro || campanha.pausa_motivo || null,
        erro_amigavel: motivo,
        erro_codigo_meta: null,
        metadata_json: {
          ...metadataCampanha,
          tipo: "campanha_disparo_pausada",
          campanha_id: campanha.id,
          campanha_nome: campanha.nome || null,
          status_campanha: campanha.status || null,
          total_itens: totalItens,
          total_enviados: totalEnviados,
          total_falhas: totalFalhas,
          total_cancelados: totalCancelados,
          total_pendentes: totalPendentes,
          total_processando: totalProcessando,
          pausa_motivo: campanha.pausa_motivo || null,
        },
        origem_historico: "campanha_pausada",
        ok: false,
        status_campanha: campanha.status || null,
        total_itens: totalItens,
        total_enviados: totalEnviados,
        total_falhas: totalFalhas,
        total_cancelados: totalCancelados,
        pausa_motivo: campanha.pausa_motivo || null,
      };
    });

    const messageIdsLogs = new Set(
      resultados
        .map((item: any) => item.message_id)
        .filter(Boolean)
    );

    const resultadosAgendadosSemDuplicar = resultadosAgendados.filter(
      (item: any) => !item.message_id || !messageIdsLogs.has(item.message_id)
    );

    const todosResultados = [
      ...resultados,
      ...resultadosAgendadosSemDuplicar,
      ...resultadosCampanhasInterrompidas,
    ]
      .sort(
        (a: any, b: any) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
      .slice(0, limit);

    return NextResponse.json({
      ok: true,
      total: todosResultados.length,
      resultados: todosResultados,
      campanhas: await buscarCampanhasFiltroHistorico(usuario.empresa_id),
    });

  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Erro interno ao buscar histórico.",
      },
      { status: 500 }
    );
  }
}
