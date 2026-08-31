import { interpretarDataHorarioAgenda } from "@/lib/agendas/agenda-service";
import {
  condicaoCombinaComCandidatos,
  condicaoPrecisaDeResposta,
  resolverRespostaInterativa,
} from "@/lib/automacoes/resposta-conexao-policy";
import type { AutomationEngineInput } from "@/lib/automacoes/types";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  interceptarMensagemAgenteIa as interceptarMensagemAgenteIaBase,
  processarPendenciaAgenteIa,
} from "./runtime-v3";

const supabaseAdmin = getSupabaseAdmin();

const NOS_RESPOSTA_LIVRE = new Set([
  "capturar_resposta",
  "pergunta_livre_ia",
]);

const NOS_AVALIACAO = new Set([
  "avaliacao",
  "avaliacao_atendimento",
]);

type OpcaoFluxo = {
  id: string;
  titulo: string;
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

function opcoesConfiguradasDoNo(no: any): OpcaoFluxo[] {
  const config = isRecord(no?.configuracao_json) ? no.configuracao_json : {};

  if (no?.tipo_no === "enviar_botoes") {
    const botoes: Record<string, unknown>[] = Array.isArray(config.botoes)
      ? config.botoes.filter(isRecord)
      : [];

    return botoes
      .map((item: Record<string, unknown>) => ({
        id: String(item.id || "").trim(),
        titulo: String(item.titulo || "").trim(),
      }))
      .filter((item: OpcaoFluxo) => Boolean(item.id || item.titulo));
  }

  if (no?.tipo_no === "pergunta_opcoes") {
    const opcoes: Record<string, unknown>[] = Array.isArray(config.opcoes)
      ? config.opcoes.filter(isRecord)
      : [];

    return opcoes
      .map((item: Record<string, unknown>) => ({
        id: String(item.valor || "").trim(),
        titulo: String(item.titulo || "").trim(),
      }))
      .filter((item: OpcaoFluxo) => Boolean(item.id || item.titulo));
  }

  return [];
}

function mensagemCombinaComOpcaoConfigurada(no: any, mensagemTexto: string) {
  const texto = normalizarComparacao(mensagemTexto);
  if (!texto) return false;

  const numeroOpcao = texto.match(/^(?:opcao |numero |n )?#?(\d{1,2})$/)?.[1] || null;

  return opcoesConfiguradasDoNo(no).some((opcao: OpcaoFluxo) => {
    const id = normalizarComparacao(opcao.id);
    const titulo = normalizarComparacao(opcao.titulo);

    if (id && (texto === id || numeroOpcao === id)) return true;
    if (!titulo) return false;
    if (texto === titulo) return true;

    // Mantém o fluxo para variações naturais como
    // "eu quero vender mais" -> botão "Vender mais".
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

  const interpretacao = interpretarDataHorarioAgenda(
    mensagemTexto,
    "America/Sao_Paulo"
  );

  return Boolean(
    interpretacao.data ||
      interpretacao.preferencia ||
      interpretacao.data_invalida_motivo
  );
}

function mensagemCombinaComConexoes(no: any, conexoes: any[], mensagemTexto: string) {
  const resposta = resolverRespostaInterativa(no, mensagemTexto);

  return conexoes.some((conexao: any) => {
    const condicao = isRecord(conexao?.condicao_json)
      ? conexao.condicao_json
      : null;

    if (!condicao || !condicaoPrecisaDeResposta(condicao)) return false;
    return condicaoCombinaComCandidatos(condicao, resposta.candidatos);
  });
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

  if (NOS_RESPOSTA_LIVRE.has(tipoNo)) {
    return Boolean(texto) || Boolean(mensagemTipo);
  }

  if (tipoNo === "interpretar_arquivo_ia") {
    return ["imagem", "documento", "arquivo"].includes(
      normalizarComparacao(mensagemTipo)
    );
  }

  if (NOS_AVALIACAO.has(tipoNo)) {
    return /^[1-5]$/.test(normalizarComparacao(texto));
  }

  if (mensagemPareceRespostaAgenda(no, texto)) return true;
  if (mensagemCombinaComConexoes(no, conexoes, texto)) return true;
  if (mensagemCombinaComOpcaoConfigurada(no, texto)) return true;

  return false;
}

async function mensagemDeveContinuarNoFluxoAtivo(input: AutomationEngineInput) {
  const mensagemTexto = String(input.mensagemTexto || "").trim();
  if (!mensagemTexto && !input.mensagemTipo) return false;

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
    console.error(
      "[AGENTE_IA] Erro ao verificar fluxo ativo antes da arbitragem híbrida:",
      execucaoError
    );
    return false;
  }

  if (!execucao?.no_atual_id || !execucao.fluxo_id) return false;

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
      .select("id, condicao_json, usar_ia, nome, descricao_ia, ordem")
      .eq("empresa_id", input.empresaId)
      .eq("fluxo_id", execucao.fluxo_id)
      .eq("no_origem_id", execucao.no_atual_id)
      .eq("ativo", true)
      .order("ordem", { ascending: true }),
  ]);

  if (noResult.error || conexoesResult.error) {
    console.error("[AGENTE_IA] Erro ao carregar nó do fluxo para arbitragem híbrida:", {
      no: noResult.error,
      conexoes: conexoesResult.error,
    });

    // Se existe uma execução aguardando e houve falha para inspecioná-la,
    // preservamos o fluxo em vez de cancelá-lo por incerteza técnica.
    return true;
  }

  if (!noResult.data) return false;

  const corresponde = mensagemCorrespondeAoNoAtual({
    no: noResult.data,
    conexoes: conexoesResult.data || [],
    mensagemTexto,
    mensagemTipo: input.mensagemTipo || null,
  });

  if (corresponde) {
    console.info("[AGENTE_IA] Fluxo ativo preservado; mensagem corresponde ao nó atual", {
      conversaId: input.conversaId,
      execucaoId: execucao.id,
      fluxoId: execucao.fluxo_id,
      noId: execucao.no_atual_id,
      tipoNo: noResult.data.tipo_no,
    });
  }

  return corresponde;
}

export async function interceptarMensagemAgenteIa(input: AutomationEngineInput) {
  if (await mensagemDeveContinuarNoFluxoAtivo(input)) {
    return null;
  }

  return interceptarMensagemAgenteIaBase(input);
}

export { processarPendenciaAgenteIa };
