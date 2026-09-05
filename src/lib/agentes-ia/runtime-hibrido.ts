import { interpretarDataHorarioAgenda } from "@/lib/agendas/agenda-service";
import { validarCaptura } from "@/lib/automacoes/captura-normalizacao";
import {
  condicaoCombinaComCandidatos,
  condicaoPrecisaDeResposta,
  resolverRespostaInterativa,
} from "@/lib/automacoes/resposta-conexao-policy";
import { gatilhoCombinaComMensagem } from "@/lib/automacoes/match-trigger";
import type { AutomacaoGatilho, AutomationEngineInput } from "@/lib/automacoes/types";
import { interpretarConexaoComIA } from "@/lib/ia/interpretar-conexao";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { despacharMensagemParaAgente } from "./dispatch";
import { processarPendenciaAgenteIa } from "./processar-pendencia-configurada";

const supabaseAdmin = getSupabaseAdmin();
const CONFIANCA_MINIMA_IA_FLUXO = 0.7;

const NOS_AVALIACAO = new Set(["avaliacao", "avaliacao_atendimento"]);

type OpcaoFluxo = { id: string; titulo: string };

type AgenteRoteamento = {
  id: string;
  empresa_id: string;
  nome: string;
  status: string;
  modo_atendimento?: "economico" | "geral" | string | null;
  fluxos_ids?: string[] | null;
  fallback_exclusivo?: boolean | null;
  integracoes_whatsapp_ids?: string[] | null;
  debounce_ms?: number | null;
  created_at?: string | null;
};

type GatilhoAgente = {
  id: string;
  agente_id: string;
  tipo_gatilho: string;
  valor: string | null;
  condicao: string | null;
  ativo: boolean;
};

type ExecucaoFluxoAtivo = {
  id: string;
  fluxo_id: string;
  no_atual_id: string;
};

function normalizarComparacao(valor: unknown) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isRecord(valor: unknown): valor is Record<string, unknown> {
  return Boolean(valor) && typeof valor === "object" && !Array.isArray(valor);
}

function conversaEstaComHumano(conversa: any) {
  if (!conversa) return true;
  if (conversa.aguardando_atendente === true) return true;
  return (
    conversa.bot_ativo !== true &&
    ["fila", "em_atendimento"].includes(String(conversa.status || ""))
  );
}

function agentePermiteIntegracao(agente: AgenteRoteamento, integracaoId?: string | null) {
  const ids = Array.isArray(agente.integracoes_whatsapp_ids)
    ? agente.integracoes_whatsapp_ids.filter(Boolean)
    : [];
  return ids.length === 0 || (!!integracaoId && ids.includes(integracaoId));
}

function agenteEconomicoPermiteFluxo(agente: AgenteRoteamento, fluxoId: string) {
  const ids = Array.isArray(agente.fluxos_ids) ? agente.fluxos_ids.filter(Boolean) : [];
  return ids.length === 0 || ids.includes(fluxoId);
}

function opcoesConfiguradasDoNo(no: any): OpcaoFluxo[] {
  const config = isRecord(no?.configuracao_json) ? no.configuracao_json : {};

  if (no?.tipo_no === "enviar_botoes") {
    const botoes: Record<string, unknown>[] = Array.isArray(config.botoes)
      ? config.botoes.filter(isRecord)
      : [];
    return botoes
      .map((item) => ({
        id: String(item.id || "").trim(),
        titulo: String(item.titulo || "").trim(),
      }))
      .filter((item) => Boolean(item.id || item.titulo));
  }

  if (no?.tipo_no === "pergunta_opcoes") {
    const opcoes: Record<string, unknown>[] = Array.isArray(config.opcoes)
      ? config.opcoes.filter(isRecord)
      : [];
    return opcoes
      .map((item) => ({
        id: String(item.valor || "").trim(),
        titulo: String(item.titulo || "").trim(),
      }))
      .filter((item) => Boolean(item.id || item.titulo));
  }

  return [];
}

function mensagemCombinaComOpcaoConfigurada(no: any, mensagemTexto: string) {
  const texto = normalizarComparacao(mensagemTexto);
  if (!texto) return false;

  const numeroOpcao = texto.match(/^(?:opcao |numero |n )?#?(\d{1,2})$/)?.[1] || null;
  return opcoesConfiguradasDoNo(no).some((opcao) => {
    const id = normalizarComparacao(opcao.id);
    const titulo = normalizarComparacao(opcao.titulo);
    if (id && (texto === id || numeroOpcao === id)) return true;
    if (!titulo) return false;
    if (texto === titulo) return true;
    return titulo.length >= 4 && texto.includes(titulo);
  });
}

function mensagemPareceRespostaAgenda(no: any, mensagemTexto: string) {
  const tipoNo = String(no?.tipo_no || "");
  if (!tipoNo.startsWith("agenda_")) return false;

  const texto = normalizarComparacao(mensagemTexto);
  if (!texto) return false;
  if (/^(?:opcao )?#?\d{1,2}$/.test(texto)) return true;
  if (/^(?:sim|pode ser|confirmo|confirmar|quero|ok|certo)$/.test(texto)) return true;

  const interpretacao = interpretarDataHorarioAgenda(mensagemTexto, "America/Sao_Paulo");
  return Boolean(
    interpretacao.data ||
      interpretacao.preferencia ||
      interpretacao.data_invalida_motivo
  );
}

function mensagemCombinaComConexoes(no: any, conexoes: any[], mensagemTexto: string) {
  const resposta = resolverRespostaInterativa(no, mensagemTexto);
  return conexoes.some((conexao) => {
    const condicao = isRecord(conexao?.condicao_json) ? conexao.condicao_json : null;
    if (!condicao || !condicaoPrecisaDeResposta(condicao)) return false;
    return condicaoCombinaComCandidatos(condicao, resposta.candidatos);
  });
}

function mensagemCapturaValida(no: any, mensagemTexto: string) {
  const config = isRecord(no?.configuracao_json) ? no.configuracao_json : {};
  const tipoCaptura = String(config.tipo_captura || "texto").trim().toLowerCase();
  return validarCaptura(tipoCaptura, mensagemTexto).valido;
}

function mensagemCorrespondeAoNoAtual(params: {
  no: any;
  conexoes: any[];
  mensagemTexto: string;
  mensagemTipo?: string | null;
}) {
  const { no, conexoes, mensagemTexto, mensagemTipo } = params;
  const tipoNo = String(no?.tipo_no || "");
  const texto = String(mensagemTexto || "").trim();
  if (!tipoNo) return false;

  if (tipoNo === "capturar_resposta") return mensagemCapturaValida(no, texto);
  if (tipoNo === "interpretar_arquivo_ia") {
    return ["imagem", "documento", "arquivo"].includes(normalizarComparacao(mensagemTipo));
  }
  if (NOS_AVALIACAO.has(tipoNo)) return /^[1-5]$/.test(normalizarComparacao(texto));
  if (mensagemPareceRespostaAgenda(no, texto)) return true;
  if (mensagemCombinaComConexoes(no, conexoes, texto)) return true;
  if (mensagemCombinaComOpcaoConfigurada(no, texto)) return true;
  return false;
}

async function iaInterpretativaMantemFluxo(params: {
  input: AutomationEngineInput;
  execucao: ExecucaoFluxoAtivo;
  no: any;
  conexoes: any[];
}) {
  const conexoesComIA = params.conexoes.filter((conexao) => conexao?.usar_ia === true);
  if (conexoesComIA.length === 0) return false;

  const respostaInterativa = resolverRespostaInterativa(params.no, params.input.mensagemTexto);
  const mensagemParaInterpretacao =
    respostaInterativa.textoSemantico || String(params.input.mensagemTexto || "");

  try {
    const resultadoIA = await interpretarConexaoComIA({
      mensagemCliente: mensagemParaInterpretacao,
      conexoesDisponiveis: conexoesComIA.map((conexao) => ({
        id: String(conexao.id),
        nome: String(conexao.rotulo || "Conexão sem nome") || null,
        descricao_ia: conexao.descricao_ia || null,
      })),
      empresaId: params.input.empresaId,
      metadata: {
        execucao_id: params.execucao.id,
        fluxo_id: params.execucao.fluxo_id,
        no_id: params.execucao.no_atual_id,
        origem: "arbitragem_hibrida_fluxo_agente",
      },
    });

    const encontrada = conexoesComIA.find(
      (conexao) => conexao.id === resultadoIA.conexao_id
    );
    return Boolean(encontrada && resultadoIA.confianca >= CONFIANCA_MINIMA_IA_FLUXO);
  } catch (error) {
    console.error(
      "[AGENTE_IA] Falha na IA interpretativa do fluxo; preservando a arbitragem econômica:",
      error
    );
    return false;
  }
}

async function avaliarFluxoAguardando(input: AutomationEngineInput) {
  const { data: execucao, error: execucaoError } = await supabaseAdmin
    .from("automacao_execucoes")
    .select("id, fluxo_id, no_atual_id, status")
    .eq("empresa_id", input.empresaId)
    .eq("conversa_id", input.conversaId)
    .eq("status", "aguardando")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (execucaoError) {
    console.error("[AGENTE_IA] Erro ao verificar fluxo aguardando:", execucaoError);
    return { ativo: true as const, deveContinuar: true as const, execucao: null };
  }
  if (!execucao?.no_atual_id || !execucao.fluxo_id) {
    return { ativo: false as const, deveContinuar: false as const, execucao: null };
  }

  const [noResult, conexoesResult] = await Promise.all([
    supabaseAdmin
      .from("automacao_nos")
      .select("id, tipo_no, configuracao_json")
      .eq("empresa_id", input.empresaId)
      .eq("fluxo_id", execucao.fluxo_id)
      .eq("id", execucao.no_atual_id)
      .eq("ativo", true)
      .maybeSingle(),
    supabaseAdmin
      .from("automacao_conexoes")
      .select("id, condicao_json, usar_ia, rotulo, descricao_ia, ordem")
      .eq("empresa_id", input.empresaId)
      .eq("fluxo_id", execucao.fluxo_id)
      .eq("no_origem_id", execucao.no_atual_id)
      .eq("ativo", true)
      .order("ordem", { ascending: true }),
  ]);

  if (noResult.error || conexoesResult.error) {
    console.error("[AGENTE_IA] Erro ao inspecionar fluxo para arbitragem:", {
      no: noResult.error,
      conexoes: conexoesResult.error,
    });
    return { ativo: true as const, deveContinuar: true as const, execucao };
  }

  if (!noResult.data) {
    return { ativo: true as const, deveContinuar: false as const, execucao };
  }

  const conexoes = conexoesResult.data || [];
  const correspondeDiretamente = mensagemCorrespondeAoNoAtual({
    no: noResult.data,
    conexoes,
    mensagemTexto: input.mensagemTexto,
    mensagemTipo: input.mensagemTipo || null,
  });
  if (correspondeDiretamente) {
    return { ativo: true as const, deveContinuar: true as const, execucao };
  }

  const mantemPelaIa = await iaInterpretativaMantemFluxo({
    input,
    execucao: {
      id: execucao.id,
      fluxo_id: execucao.fluxo_id,
      no_atual_id: execucao.no_atual_id,
    },
    no: noResult.data,
    conexoes,
  });

  return { ativo: true as const, deveContinuar: mantemPelaIa, execucao };
}

async function protocoloAtivoDaConversa(empresaId: string, conversaId: string) {
  const { data, error } = await supabaseAdmin
    .from("conversa_protocolos")
    .select("id")
    .eq("empresa_id", empresaId)
    .eq("conversa_id", conversaId)
    .eq("ativo", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.id || null;
}

function gatilhoAgenteCombina(gatilho: GatilhoAgente, mensagemTexto: string) {
  return gatilhoCombinaComMensagem(
    {
      id: gatilho.id,
      empresa_id: "",
      fluxo_id: "",
      tipo_gatilho: gatilho.tipo_gatilho,
      valor: gatilho.valor,
      condicao: gatilho.condicao,
      ativo: gatilho.ativo,
    } as AutomacaoGatilho,
    mensagemTexto
  );
}

async function selecionarAgenteGeral(params: {
  agentes: AgenteRoteamento[];
  integracaoId?: string | null;
  mensagemTexto: string;
}) {
  const candidatos = params.agentes.filter(
    (agente) =>
      agente.modo_atendimento === "geral" &&
      agentePermiteIntegracao(agente, params.integracaoId)
  );
  if (!candidatos.length) return null;

  const ids = candidatos.map((agente) => agente.id);
  const { data: gatilhos, error } = await supabaseAdmin
    .from("agente_ia_gatilhos")
    .select("id, agente_id, tipo_gatilho, valor, condicao, ativo, created_at")
    .eq("ativo", true)
    .in("agente_id", ids)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[AGENTE_IA] Erro ao buscar palavras-chave dos agentes:", error);
  } else {
    for (const agente of candidatos) {
      const combinou = (gatilhos || [])
        .filter((gatilho) => gatilho.agente_id === agente.id)
        .some((gatilho) => gatilhoAgenteCombina(gatilho as GatilhoAgente, params.mensagemTexto));
      if (combinou) return agente;
    }
  }

  return candidatos.find((agente) => agente.fallback_exclusivo === true) || null;
}

export async function interceptarMensagemAgenteIa(input: AutomationEngineInput) {
  const texto = String(input.mensagemTexto || "").trim();
  const mensagemId = String(input.mensagemId || "").trim();
  if (!texto || !mensagemId) return null;

  const { data: conversa, error: conversaError } = await supabaseAdmin
    .from("conversas")
    .select(
      "id, contato_id, status, responsavel_id, bot_ativo, aguardando_atendente, integracao_whatsapp_id, agente_ia_id, agente_ia_protocolo_id, agente_ia_fallback_ativo"
    )
    .eq("id", input.conversaId)
    .eq("empresa_id", input.empresaId)
    .maybeSingle();
  if (conversaError || !conversa || conversaEstaComHumano(conversa)) return null;

  const integracaoId = input.integracaoWhatsappId || conversa.integracao_whatsapp_id || null;
  const protocoloId = await protocoloAtivoDaConversa(input.empresaId, input.conversaId);

  if (
    conversa.agente_ia_fallback_ativo === true &&
    conversa.agente_ia_protocolo_id &&
    conversa.agente_ia_protocolo_id === protocoloId
  ) {
    return null;
  }

  const { data: agentes, error: agentesError } = await supabaseAdmin
    .from("agentes_ia")
    .select(
      "id, empresa_id, nome, status, modo_atendimento, fluxos_ids, fallback_exclusivo, integracoes_whatsapp_ids, debounce_ms, created_at"
    )
    .eq("empresa_id", input.empresaId)
    .eq("status", "ativo")
    .order("created_at", { ascending: true });
  if (agentesError) {
    console.error("[AGENTE_IA] Erro ao buscar agentes ativos:", agentesError);
    return null;
  }

  const ativos = (agentes || []) as AgenteRoteamento[];
  const agenteAfinidade =
    conversa.agente_ia_id && conversa.agente_ia_protocolo_id === protocoloId
      ? ativos.find(
          (agente) =>
            agente.id === conversa.agente_ia_id &&
            agentePermiteIntegracao(agente, integracaoId)
        ) || null
      : null;

  if (agenteAfinidade) {
    return despacharMensagemParaAgente({
      input,
      agente: agenteAfinidade,
      contatoId: conversa.contato_id,
    });
  }

  if (conversa.agente_ia_id || conversa.agente_ia_fallback_ativo) {
    await supabaseAdmin
      .from("conversas")
      .update({
        agente_ia_id: null,
        agente_ia_protocolo_id: protocoloId,
        agente_ia_fallback_ativo: false,
      })
      .eq("empresa_id", input.empresaId)
      .eq("id", input.conversaId);
  }

  const fluxo = await avaliarFluxoAguardando(input);
  if (fluxo.ativo && fluxo.deveContinuar) {
    return null;
  }

  if (fluxo.ativo && fluxo.execucao?.fluxo_id) {
    const agenteEconomico = ativos.find(
      (agente) =>
        agente.modo_atendimento === "economico" &&
        agentePermiteIntegracao(agente, integracaoId) &&
        agenteEconomicoPermiteFluxo(agente, fluxo.execucao!.fluxo_id)
    );

    if (!agenteEconomico) return null;

    return despacharMensagemParaAgente({
      input,
      agente: agenteEconomico,
      contatoId: conversa.contato_id,
    });
  }

  const agenteGeral = await selecionarAgenteGeral({
    agentes: ativos,
    integracaoId,
    mensagemTexto: texto,
  });
  if (!agenteGeral) return null;

  return despacharMensagemParaAgente({
    input,
    agente: agenteGeral,
    contatoId: conversa.contato_id,
  });
}

export { processarPendenciaAgenteIa };