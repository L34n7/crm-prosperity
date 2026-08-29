import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  SaldoTokensIaEsgotadoError,
} from "@/lib/ia/tokens";
import {
  interpretarIntencoesComIA,
  type IntencaoInterpretacaoIa,
} from "@/lib/ia/interpretar-intencoes";
import { resolverAtribuicaoTransferencia } from "@/lib/conversas/resolver-atribuicao-transferencia";
import { canSendFreeformWhatsAppMessage } from "@/lib/whatsapp/can-send-message";
import { getWhatsAppAccessToken } from "@/lib/whatsapp/access-token";
import { sendWhatsAppMediaMessage } from "@/lib/whatsapp/send-media-message";
import { sendWhatsAppInteractiveCtaUrlMessage } from "@/lib/whatsapp/send-interactive-cta-url-message";
import { sendWhatsAppInteractiveButtonsMessage } from "@/lib/whatsapp/send-interactive-buttons-message";
import { enviarMensagemAutomacao } from "./process-automation-engine-agenda";

const supabaseAdmin = getSupabaseAdmin();
const CONFIANCA_MINIMA_INTENCAO = 0.78;

export type TipoAcaoIntencao =
  | "enviar_texto"
  | "enviar_imagem"
  | "enviar_video"
  | "enviar_audio"
  | "enviar_arquivo"
  | "enviar_botoes"
  | "botao_redirect"
  | "transferir_setor"
  | "parar_fluxo"
  | "encerrar";

export type AcaoIntencao = {
  id?: string;
  tipo: TipoAcaoIntencao;
  configuracao_json?: Record<string, unknown>;
};

type IntencaoRow = {
  id: string;
  empresa_id: string;
  fluxo_id: string;
  titulo: string;
  resposta: string;
  contexto_ia: string;
  status: "ativa" | "pausada";
  ordem: number;
  acoes_json: AcaoIntencao[] | null;
};

type ExecucaoAtiva = {
  id: string;
  fluxo_id: string;
  no_atual_id: string | null;
  status: string;
  conversa_protocolo_id?: string | null;
};

type IntegracaoWhatsApp = {
  id: string;
  phone_number_id: string | null;
  token_ref: string | null;
  config_json: Record<string, unknown> | null;
  status: string | null;
};

export type ResultadoProcessamentoIntencoes = {
  correspondeu: boolean;
  somenteIntencao: boolean;
  mensagemFluxo: string | null;
  interrompeuFluxo: boolean;
  execucaoId: string;
  intencoesExecutadas: string[];
};

function mensagemCompativelComIntencao(tipo: unknown, texto: string) {
  if (!texto.trim()) return false;
  const valor = String(tipo || "").trim().toLowerCase();
  if (!valor) return true;
  return ["text", "texto", "button", "interactive", "botao"].includes(valor);
}

function normalizarAcoes(valor: unknown): AcaoIntencao[] {
  if (!Array.isArray(valor)) return [];

  const permitidas = new Set<TipoAcaoIntencao>([
    "enviar_texto",
    "enviar_imagem",
    "enviar_video",
    "enviar_audio",
    "enviar_arquivo",
    "enviar_botoes",
    "botao_redirect",
    "transferir_setor",
    "parar_fluxo",
    "encerrar",
  ]);

  return valor
    .map((acao) => {
      const item =
        acao && typeof acao === "object" && !Array.isArray(acao)
          ? (acao as Record<string, unknown>)
          : {};
      const tipo = String(item.tipo || "") as TipoAcaoIntencao;
      if (!permitidas.has(tipo)) return null;
      const config =
        item.configuracao_json &&
        typeof item.configuracao_json === "object" &&
        !Array.isArray(item.configuracao_json)
          ? (item.configuracao_json as Record<string, unknown>)
          : {};
      return {
        id: String(item.id || "") || undefined,
        tipo,
        configuracao_json: config,
      } satisfies AcaoIntencao;
    })
    .filter((acao): acao is AcaoIntencao => Boolean(acao));
}

async function buscarIntegracaoConversa(params: {
  empresaId: string;
  conversaId: string;
}) {
  const { data: conversa, error: conversaError } = await supabaseAdmin
    .from("conversas")
    .select("id, integracao_whatsapp_id")
    .eq("id", params.conversaId)
    .eq("empresa_id", params.empresaId)
    .maybeSingle();

  if (conversaError || !conversa?.integracao_whatsapp_id) return null;

  const { data: integracao, error: integracaoError } = await supabaseAdmin
    .from("integracoes_whatsapp")
    .select("id, phone_number_id, token_ref, config_json, status")
    .eq("id", conversa.integracao_whatsapp_id)
    .eq("empresa_id", params.empresaId)
    .maybeSingle();

  if (integracaoError || !integracao) return null;
  return integracao as IntegracaoWhatsApp;
}

async function registrarMensagemAcao(params: {
  empresaId: string;
  conversaId: string;
  execucaoId: string;
  noId: string;
  conteudo: string;
  tipoMensagem: string;
  statusEnvio: "enviada" | "falha";
  mensagemExternaId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const { error } = await supabaseAdmin.from("mensagens").insert({
    empresa_id: params.empresaId,
    conversa_id: params.conversaId,
    remetente_tipo: "sistema",
    conteudo: params.conteudo,
    tipo_mensagem: params.tipoMensagem,
    origem: "automatica",
    status_envio: params.statusEnvio,
    mensagem_externa_id: params.mensagemExternaId || null,
    automacao_execucao_id: params.execucaoId,
    automacao_no_id: params.noId,
    metadata_json: {
      origem_intencao: true,
      ...(params.metadata || {}),
    },
  });

  if (error) {
    console.error("[INTENCOES] Erro ao persistir mensagem da ação:", error);
  }
}

async function obterCanalEnvio(params: {
  empresaId: string;
  conversaId: string;
}) {
  const [integracao, permissao] = await Promise.all([
    buscarIntegracaoConversa(params),
    canSendFreeformWhatsAppMessage({ conversaId: params.conversaId }),
  ]);

  if (!integracao || !integracao.phone_number_id) {
    throw new Error("Integração WhatsApp indisponível para executar a intenção.");
  }

  if (!permissao.podeEnviarMensagemLivre) {
    throw new Error(
      permissao.motivoBloqueio ||
        "A janela de 24 horas está encerrada para mensagens livres."
    );
  }

  const accessToken = getWhatsAppAccessToken(integracao);
  if (!accessToken) {
    throw new Error("Token da integração WhatsApp não encontrado.");
  }

  return {
    phoneNumberId: integracao.phone_number_id,
    accessToken,
  };
}

async function executarAcaoMidia(params: {
  tipo: "enviar_imagem" | "enviar_video" | "enviar_audio" | "enviar_arquivo";
  config: Record<string, unknown>;
  empresaId: string;
  conversaId: string;
  execucaoId: string;
  noId: string;
  numeroDestino: string;
}) {
  const midiaUrl = String(params.config.midia_url || "").trim();
  if (!midiaUrl) throw new Error("Ação de mídia sem arquivo selecionado.");

  const canal = await obterCanalEnvio(params);
  const tipoMensagem =
    params.tipo === "enviar_imagem"
      ? "imagem"
      : params.tipo === "enviar_video"
      ? "video"
      : params.tipo === "enviar_audio"
      ? "audio"
      : "documento";
  const legenda = String(params.config.mensagem || "").trim();
  const nome = String(params.config.midia_nome || "").trim() || null;
  const envio = await sendWhatsAppMediaMessage({
    ...canal,
    to: params.numeroDestino,
    tipoMensagem,
    mediaUrl: midiaUrl,
    caption: legenda || null,
    fileName: tipoMensagem === "documento" ? nome : null,
  });

  await registrarMensagemAcao({
    empresaId: params.empresaId,
    conversaId: params.conversaId,
    execucaoId: params.execucaoId,
    noId: params.noId,
    conteudo: legenda || nome || "Mídia enviada pela intenção.",
    tipoMensagem,
    statusEnvio: envio.ok ? "enviada" : "falha",
    mensagemExternaId: envio.messageId,
    metadata: {
      tipo_midia: tipoMensagem,
      midia_url: midiaUrl,
      midia_nome: nome,
      meta_response: envio.raw,
      erro: envio.error,
    },
  });

  if (!envio.ok) throw new Error(envio.error || "Falha ao enviar mídia.");
}

async function executarAcaoBotoes(params: {
  config: Record<string, unknown>;
  empresaId: string;
  conversaId: string;
  execucaoId: string;
  noId: string;
  numeroDestino: string;
}) {
  const mensagem = String(params.config.mensagem || "").trim();
  const botoesRaw = Array.isArray(params.config.botoes) ? params.config.botoes : [];
  const botoes = botoesRaw
    .map((botao, index) => {
      const item =
        botao && typeof botao === "object" && !Array.isArray(botao)
          ? (botao as Record<string, unknown>)
          : {};
      return {
        id: String(item.id || `intencao_${index + 1}`),
        titulo: String(item.titulo || "").trim(),
      };
    })
    .filter((botao) => botao.titulo)
    .slice(0, 3);

  const canal = await obterCanalEnvio(params);
  const envio = await sendWhatsAppInteractiveButtonsMessage({
    ...canal,
    to: params.numeroDestino,
    body: mensagem,
    buttons: botoes,
  });

  await registrarMensagemAcao({
    empresaId: params.empresaId,
    conversaId: params.conversaId,
    execucaoId: params.execucaoId,
    noId: params.noId,
    conteudo: mensagem,
    tipoMensagem: "botao",
    statusEnvio: envio.ok ? "enviada" : "falha",
    mensagemExternaId: envio.messageId,
    metadata: { botoes, meta_response: envio.raw, erro: envio.error },
  });

  if (!envio.ok) throw new Error(envio.error || "Falha ao enviar botões.");
}

async function executarAcaoRedirect(params: {
  config: Record<string, unknown>;
  empresaId: string;
  conversaId: string;
  execucaoId: string;
  noId: string;
  numeroDestino: string;
}) {
  const mensagem = String(params.config.mensagem || "").trim();
  const botaoTexto = String(params.config.botao_texto || "").trim();
  const url = String(params.config.url || "").trim();
  const canal = await obterCanalEnvio(params);
  const envio = await sendWhatsAppInteractiveCtaUrlMessage({
    ...canal,
    to: params.numeroDestino,
    body: mensagem,
    buttonText: botaoTexto,
    url,
  });

  await registrarMensagemAcao({
    empresaId: params.empresaId,
    conversaId: params.conversaId,
    execucaoId: params.execucaoId,
    noId: params.noId,
    conteudo: mensagem,
    tipoMensagem: "botao",
    statusEnvio: envio.ok ? "enviada" : "falha",
    mensagemExternaId: envio.messageId,
    metadata: {
      botao_texto: botaoTexto,
      url,
      meta_response: envio.raw,
      erro: envio.error,
    },
  });

  if (!envio.ok) throw new Error(envio.error || "Falha ao enviar botão redirect.");
}

async function executarAcaoTransferencia(params: {
  empresaId: string;
  conversaId: string;
  execucao: ExecucaoAtiva;
  config: Record<string, unknown>;
}) {
  const escopoFila =
    String(params.config.escopo_fila || "").trim() === "geral"
      ? "geral"
      : "setor";
  const setorId =
    escopoFila === "geral"
      ? null
      : String(params.config.setor_id || "").trim() || null;
  const atribuicao = await resolverAtribuicaoTransferencia({
    empresaId: params.empresaId,
    setorId,
    escopoFila,
    estrategia: params.config.estrategia_transferencia,
    atendenteId: params.config.atendente_id,
    incluirAdministradores:
      params.config.incluir_administradores_distribuicao,
  });
  const agora = new Date().toISOString();

  await supabaseAdmin
    .from("automacao_execucoes")
    .update({ status: "finalizado", finished_at: agora, updated_at: agora })
    .eq("id", params.execucao.id)
    .eq("empresa_id", params.empresaId)
    .in("status", ["rodando", "aguardando"]);

  const { error } = await supabaseAdmin
    .from("conversas")
    .update({
      setor_id: atribuicao.setorId,
      escopo_fila: atribuicao.escopoFila,
      status: atribuicao.responsavelId ? "em_atendimento" : "fila",
      responsavel_id: atribuicao.responsavelId,
      bot_ativo: false,
      aguardando_atendente: !atribuicao.responsavelId,
      updated_at: agora,
    })
    .eq("id", params.conversaId)
    .eq("empresa_id", params.empresaId);

  if (error) throw error;
}

async function executarAcaoPararFluxo(params: {
  empresaId: string;
  execucaoId: string;
  intencaoId: string;
}) {
  const { error } = await supabaseAdmin.rpc(
    "parar_automacao_execucao_por_intencao",
    {
      p_empresa_id: params.empresaId,
      p_execucao_id: params.execucaoId,
      p_motivo: `intencao:${params.intencaoId}`,
    }
  );

  if (error) throw error;
}

async function executarAcaoEncerrar(params: {
  empresaId: string;
  conversaId: string;
  execucao: ExecucaoAtiva;
}) {
  const agora = new Date().toISOString();

  await supabaseAdmin
    .from("automacao_execucoes")
    .update({ status: "finalizado", finished_at: agora, updated_at: agora })
    .eq("id", params.execucao.id)
    .eq("empresa_id", params.empresaId)
    .in("status", ["rodando", "aguardando"]);

  const { error } = await supabaseAdmin
    .from("conversas")
    .update({
      status: "encerrado_aut",
      bot_ativo: false,
      aguardando_atendente: false,
      closed_at: agora,
      updated_at: agora,
    })
    .eq("id", params.conversaId)
    .eq("empresa_id", params.empresaId);

  if (error) throw error;

  if (params.execucao.conversa_protocolo_id) {
    await supabaseAdmin
      .from("conversa_protocolos")
      .update({ ativo: false, closed_at: agora, updated_at: agora })
      .eq("id", params.execucao.conversa_protocolo_id)
      .eq("empresa_id", params.empresaId)
      .eq("conversa_id", params.conversaId)
      .eq("ativo", true);
  }
}

async function executarAcoesIntencao(params: {
  intencao: IntencaoRow;
  execucao: ExecucaoAtiva;
  empresaId: string;
  conversaId: string;
  numeroDestino: string;
}) {
  const acoesExecutadas: Array<Record<string, unknown>> = [];
  let interrompeuFluxo = false;
  const noId = String(params.execucao.no_atual_id || "").trim();

  if (!noId) {
    throw new Error("Execução ativa sem nó atual para registrar a resposta da intenção.");
  }

  await enviarMensagemAutomacao({
    empresaId: params.empresaId,
    conversaId: params.conversaId,
    numeroDestino: params.numeroDestino,
    conteudo: params.intencao.resposta,
    execucaoId: params.execucao.id,
    noId,
  });
  acoesExecutadas.push({ tipo: "resposta", status: "executada" });

  for (const acao of normalizarAcoes(params.intencao.acoes_json)) {
    const config = acao.configuracao_json || {};

    try {
      if (acao.tipo === "enviar_texto") {
        const mensagem = String(config.mensagem || "").trim();
        if (!mensagem) throw new Error("Texto adicional vazio.");
        await enviarMensagemAutomacao({
          empresaId: params.empresaId,
          conversaId: params.conversaId,
          numeroDestino: params.numeroDestino,
          conteudo: mensagem,
          execucaoId: params.execucao.id,
          noId,
        });
      } else if (
        acao.tipo === "enviar_imagem" ||
        acao.tipo === "enviar_video" ||
        acao.tipo === "enviar_audio" ||
        acao.tipo === "enviar_arquivo"
      ) {
        await executarAcaoMidia({
          tipo: acao.tipo,
          config,
          empresaId: params.empresaId,
          conversaId: params.conversaId,
          execucaoId: params.execucao.id,
          noId,
          numeroDestino: params.numeroDestino,
        });
      } else if (acao.tipo === "enviar_botoes") {
        await executarAcaoBotoes({
          config,
          empresaId: params.empresaId,
          conversaId: params.conversaId,
          execucaoId: params.execucao.id,
          noId,
          numeroDestino: params.numeroDestino,
        });
      } else if (acao.tipo === "botao_redirect") {
        await executarAcaoRedirect({
          config,
          empresaId: params.empresaId,
          conversaId: params.conversaId,
          execucaoId: params.execucao.id,
          noId,
          numeroDestino: params.numeroDestino,
        });
      } else if (acao.tipo === "transferir_setor") {
        await executarAcaoTransferencia({
          empresaId: params.empresaId,
          conversaId: params.conversaId,
          execucao: params.execucao,
          config,
        });
        interrompeuFluxo = true;
      } else if (acao.tipo === "parar_fluxo") {
        await executarAcaoPararFluxo({
          empresaId: params.empresaId,
          execucaoId: params.execucao.id,
          intencaoId: params.intencao.id,
        });
        interrompeuFluxo = true;
      } else if (acao.tipo === "encerrar") {
        await executarAcaoEncerrar({
          empresaId: params.empresaId,
          conversaId: params.conversaId,
          execucao: params.execucao,
        });
        interrompeuFluxo = true;
      }

      acoesExecutadas.push({ tipo: acao.tipo, status: "executada" });
    } catch (error) {
      acoesExecutadas.push({
        tipo: acao.tipo,
        status: "erro",
        erro: error instanceof Error ? error.message : "Erro ao executar ação.",
      });
      throw Object.assign(
        error instanceof Error ? error : new Error("Erro ao executar ação da intenção."),
        { acoesExecutadas }
      );
    }

    if (interrompeuFluxo) break;
  }

  return { acoesExecutadas, interrompeuFluxo };
}

export async function processarIntencoesMensagem(params: {
  empresaId: string;
  conversaId: string;
  contatoId?: string | null;
  mensagemId?: string | null;
  mensagemTexto?: string | null;
  mensagemTipo?: string | null;
  numeroDestino?: string | null;
}): Promise<ResultadoProcessamentoIntencoes | null> {
  const mensagemTexto = String(params.mensagemTexto || "").trim();
  const numeroDestino = String(params.numeroDestino || "").trim();

  if (!mensagemCompativelComIntencao(params.mensagemTipo, mensagemTexto)) {
    return null;
  }

  if (!numeroDestino) return null;

  const { data: execucao, error: execucaoError } = await supabaseAdmin
    .from("automacao_execucoes")
    .select("id, fluxo_id, no_atual_id, status, conversa_protocolo_id")
    .eq("empresa_id", params.empresaId)
    .eq("conversa_id", params.conversaId)
    .in("status", ["aguardando", "rodando"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (execucaoError) {
    console.error("[INTENCOES] Erro ao buscar execução ativa:", execucaoError);
    return null;
  }

  if (!execucao?.fluxo_id) return null;

  const { data: intencoes, error: intencoesError } = await supabaseAdmin
    .from("automacao_intencoes")
    .select("id, empresa_id, fluxo_id, titulo, resposta, contexto_ia, status, ordem, acoes_json")
    .eq("empresa_id", params.empresaId)
    .eq("fluxo_id", execucao.fluxo_id)
    .eq("status", "ativa")
    .order("ordem", { ascending: true })
    .order("created_at", { ascending: true });

  if (intencoesError) {
    console.error("[INTENCOES] Erro ao buscar intenções:", intencoesError);
    return null;
  }

  if (!intencoes?.length) return null;

  const intencoesAtivas = intencoes as IntencaoRow[];

  if (params.mensagemId) {
    const { data: jaProcessada } = await supabaseAdmin
      .from("automacao_intencao_execucoes")
      .select("id")
      .eq("empresa_id", params.empresaId)
      .eq("mensagem_id", params.mensagemId)
      .limit(1);

    if (jaProcessada?.length) {
      return {
        correspondeu: true,
        somenteIntencao: true,
        mensagemFluxo: null,
        interrompeuFluxo: false,
        execucaoId: execucao.id,
        intencoesExecutadas: [],
      };
    }
  }

  let interpretacao;
  try {
    interpretacao = await interpretarIntencoesComIA({
      mensagemCliente: mensagemTexto,
      intencoesDisponiveis: intencoesAtivas.map(
        (intencao): IntencaoInterpretacaoIa => ({
          id: intencao.id,
          titulo: intencao.titulo,
          contexto_ia: intencao.contexto_ia,
        })
      ),
      empresaId: params.empresaId,
      metadata: {
        fluxo_id: execucao.fluxo_id,
        execucao_id: execucao.id,
        conversa_id: params.conversaId,
        mensagem_id: params.mensagemId || null,
      },
    });
  } catch (error) {
    if (error instanceof SaldoTokensIaEsgotadoError) {
      return null;
    }

    console.error("[INTENCOES] Falha na interpretação por IA:", error);
    return null;
  }

  const confiancaPorId = new Map<string, number>();
  for (const correspondencia of interpretacao.correspondencias || []) {
    const id = String(correspondencia.intencao_id || "");
    const confianca = Number(correspondencia.confianca || 0);
    if (!id || confianca < CONFIANCA_MINIMA_INTENCAO) continue;
    confiancaPorId.set(id, Math.max(confiancaPorId.get(id) || 0, confianca));
  }

  const selecionadas = intencoesAtivas.filter((intencao) =>
    confiancaPorId.has(intencao.id)
  );

  if (selecionadas.length === 0) return null;

  const intencoesExecutadas: string[] = [];
  let interrompeuFluxo = false;

  for (const intencao of selecionadas) {
    const confianca = confiancaPorId.get(intencao.id) || 0;
    const { data: logCriado, error: logError } = await supabaseAdmin
      .from("automacao_intencao_execucoes")
      .insert({
        empresa_id: params.empresaId,
        fluxo_id: execucao.fluxo_id,
        intencao_id: intencao.id,
        intencao_titulo: intencao.titulo,
        execucao_id: execucao.id,
        conversa_id: params.conversaId,
        mensagem_id: params.mensagemId || null,
        mensagem_recebida: mensagemTexto,
        confianca,
        acoes_executadas: [],
        status: "processando",
      })
      .select("id")
      .maybeSingle();

    if (logError?.code === "23505") continue;
    if (logError || !logCriado) {
      console.error("[INTENCOES] Erro ao criar log idempotente:", logError);
      continue;
    }

    try {
      const execucaoAcoes = await executarAcoesIntencao({
        intencao,
        execucao: execucao as ExecucaoAtiva,
        empresaId: params.empresaId,
        conversaId: params.conversaId,
        numeroDestino,
      });

      await supabaseAdmin
        .from("automacao_intencao_execucoes")
        .update({
          status: "concluido",
          acoes_executadas: execucaoAcoes.acoesExecutadas,
          updated_at: new Date().toISOString(),
        })
        .eq("id", logCriado.id)
        .eq("empresa_id", params.empresaId);

      intencoesExecutadas.push(intencao.id);
      interrompeuFluxo = interrompeuFluxo || execucaoAcoes.interrompeuFluxo;
    } catch (error) {
      const acoesExecutadas =
        error && typeof error === "object" && "acoesExecutadas" in error
          ? (error as { acoesExecutadas?: unknown }).acoesExecutadas
          : [];
      const mensagemErro =
        error instanceof Error ? error.message : "Erro ao executar intenção.";

      await supabaseAdmin
        .from("automacao_intencao_execucoes")
        .update({
          status: "erro",
          erro: mensagemErro,
          acoes_executadas: Array.isArray(acoesExecutadas)
            ? acoesExecutadas
            : [],
          updated_at: new Date().toISOString(),
        })
        .eq("id", logCriado.id)
        .eq("empresa_id", params.empresaId);

      console.error("[INTENCOES] Falha ao executar intenção:", {
        intencaoId: intencao.id,
        erro: mensagemErro,
      });
    }

    if (interrompeuFluxo) break;
  }

  if (intencoesExecutadas.length === 0 && !interrompeuFluxo) return null;

  const somenteIntencao =
    interrompeuFluxo || interpretacao.somente_intencao === true;
  const mensagemFluxo = somenteIntencao
    ? null
    : String(interpretacao.mensagem_fluxo || mensagemTexto).trim() || mensagemTexto;

  return {
    correspondeu: true,
    somenteIntencao,
    mensagemFluxo,
    interrompeuFluxo,
    execucaoId: execucao.id,
    intencoesExecutadas,
  };
}
