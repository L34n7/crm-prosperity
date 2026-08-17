import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { avaliarCondicoes, type CondicaoRotina, type ContextoEvento } from "./runtime-condicoes";
import { executarAcaoRotina, tituloAcaoRotina, type AcaoRotina } from "./runtime-acoes";

const supabase = getSupabaseAdmin();
const EVENTO = "mensagem.recebida";

export type ProcessarMensagemRecebidaRotinasInput = {
  empresaId: string;
  conversaId: string;
  contatoId?: string | null;
  mensagemId?: string | null;
  mensagemTexto?: string | null;
  mensagemTipo?: string | null;
};

export type ProcessarMensagemRecebidaRotinasResultado = {
  executado: boolean;
  interromperFluxoAtual: boolean;
  execucaoIds: string[];
  erro?: string | null;
};

async function obterExecucao(params: {
  empresaId: string;
  automacaoId: string;
  gatilhoId: string;
  eventoChave: string;
  mensagemId: string;
  contextoJson: Record<string, unknown>;
}) {
  const { data, error } = await supabase
    .from("rotina_automacao_execucoes")
    .upsert({
      empresa_id: params.empresaId,
      automacao_id: params.automacaoId,
      gatilho_id: params.gatilhoId,
      evento_chave: params.eventoChave,
      entidade_tipo: "mensagem",
      entidade_id: params.mensagemId,
      status: "processando",
      contexto_json: params.contextoJson,
    }, { onConflict: "automacao_id,evento_chave", ignoreDuplicates: true })
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (data) return data;

  const { data: existente, error: existenteError } = await supabase
    .from("rotina_automacao_execucoes")
    .select("*")
    .eq("automacao_id", params.automacaoId)
    .eq("evento_chave", params.eventoChave)
    .maybeSingle();
  if (existenteError) throw existenteError;
  if (!existente) throw new Error("Não foi possível obter a execução da automação.");
  return existente;
}

async function obterJob(params: {
  empresaId: string;
  automacaoId: string;
  execucaoId: string;
  acao: AcaoRotina;
  mensagemId: string;
  dependeDeJobId: string | null;
}) {
  const chave = `${params.execucaoId}:${params.acao.id}`;
  const canal = params.acao.tipo_acao.startsWith("whatsapp.")
    ? "whatsapp"
    : params.acao.tipo_acao === "email.enviar"
      ? "email"
      : null;
  const { data, error } = await supabase
    .from("rotina_automacao_jobs")
    .upsert({
      empresa_id: params.empresaId,
      automacao_id: params.automacaoId,
      execucao_id: params.execucaoId,
      acao_id: params.acao.id,
      entidade_tipo: "mensagem",
      entidade_id: params.mensagemId,
      executar_em: new Date().toISOString(),
      status: "pendente",
      chave_idempotencia: chave,
      ordem: params.acao.ordem,
      titulo: tituloAcaoRotina(params.acao.tipo_acao),
      canal,
      depende_de_job_id: params.dependeDeJobId,
      contexto_json: {
        tipo_acao: params.acao.tipo_acao,
        configuracao: params.acao.configuracao_json || {},
      },
    }, { onConflict: "chave_idempotencia", ignoreDuplicates: true })
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (data) return data;

  const { data: existente, error: existenteError } = await supabase
    .from("rotina_automacao_jobs")
    .select("*")
    .eq("chave_idempotencia", chave)
    .maybeSingle();
  if (existenteError) throw existenteError;
  if (!existente) throw new Error("Não foi possível obter a etapa da automação.");
  return existente;
}

async function marcarEvento(eventoId: string | null, empresaId: string, status: string, erro?: string | null) {
  if (!eventoId) return;
  await supabase
    .from("rotina_automacao_eventos")
    .update({ status, erro: erro || null, processado_em: new Date().toISOString() })
    .eq("id", eventoId)
    .eq("empresa_id", empresaId);
}

export async function processarMensagemRecebidaRotinas(
  input: ProcessarMensagemRecebidaRotinasInput,
): Promise<ProcessarMensagemRecebidaRotinasResultado | null> {
  const mensagemId = String(input.mensagemId || "").trim();
  if (!mensagemId) return null;

  try {
    const { data: assinatura, error: assinaturaError } = await supabase
      .from("rotina_automacao_assinaturas")
      .select("id")
      .eq("empresa_id", input.empresaId)
      .eq("evento", EVENTO)
      .maybeSingle();
    if (assinaturaError) {
      console.error("[ROTINA_AUTOMACAO] Falha ao consultar assinatura:", assinaturaError);
      return null;
    }
    if (!assinatura) return null;

    const [gatilhosResult, conversaResult] = await Promise.all([
      supabase
        .from("rotina_automacao_gatilhos")
        .select("id,automacao_id,configuracao_json")
        .eq("empresa_id", input.empresaId)
        .eq("evento", EVENTO)
        .eq("ativo", true),
      supabase
        .from("conversas")
        .select("id,status,setor_id,responsavel_id,aguardando_atendente,bot_ativo,integracao_whatsapp_id")
        .eq("empresa_id", input.empresaId)
        .eq("id", input.conversaId)
        .maybeSingle(),
    ]);
    if (gatilhosResult.error) throw gatilhosResult.error;
    if (conversaResult.error) throw conversaResult.error;
    if (!conversaResult.data) throw new Error("Conversa não encontrada para avaliar a automação.");

    const conversa = conversaResult.data;
    const integracaoConversaId = String(conversa.integracao_whatsapp_id || "").trim();
    const gatilhos = (gatilhosResult.data || []).filter((gatilho) => {
      const configuracao = gatilho.configuracao_json && typeof gatilho.configuracao_json === "object"
        ? gatilho.configuracao_json as Record<string, unknown>
        : {};
      const integracaoAlvo = String(configuracao.integracao_whatsapp_id || "").trim();
      return !integracaoAlvo || integracaoAlvo === integracaoConversaId;
    });
    const automacaoIds = Array.from(new Set(gatilhos.map((item) => item.automacao_id)));
    if (!automacaoIds.length) {
      return { executado: false, interromperFluxoAtual: false, execucaoIds: [] };
    }

    const [automacoesResult, condicoesResult, acoesResult] = await Promise.all([
      supabase.from("rotina_automacoes").select("id,nome").eq("empresa_id", input.empresaId).eq("status", "ativa").in("id", automacaoIds),
      supabase.from("rotina_automacao_condicoes").select("automacao_id,grupo,ordem,conjuncao,campo,operador,valor_json").eq("empresa_id", input.empresaId).in("automacao_id", automacaoIds).order("ordem"),
      supabase.from("rotina_automacao_acoes").select("id,automacao_id,ordem,tipo_acao,configuracao_json,ativo").eq("empresa_id", input.empresaId).eq("ativo", true).in("automacao_id", automacaoIds).order("ordem"),
    ]);
    if (automacoesResult.error) throw automacoesResult.error;
    if (condicoesResult.error) throw condicoesResult.error;
    if (acoesResult.error) throw acoesResult.error;

    if (!(automacoesResult.data || []).length) {
      return { executado: false, interromperFluxoAtual: false, execucaoIds: [] };
    }

    const eventoChave = `${EVENTO}:${mensagemId}`;
    const { data: evento, error: eventoError } = await supabase
      .from("rotina_automacao_eventos")
      .upsert({
        empresa_id: input.empresaId,
        evento: EVENTO,
        evento_chave: eventoChave,
        entidade_tipo: "mensagem",
        entidade_id: mensagemId,
        status: "processando",
        payload_json: {
          mensagem_id: mensagemId,
          conversa_id: input.conversaId,
          contato_id: input.contatoId || null,
          mensagem_tipo: input.mensagemTipo || null,
          integracao_whatsapp_id: integracaoConversaId || null,
        },
        erro: null,
        processado_em: null,
      }, { onConflict: "empresa_id,evento_chave", ignoreDuplicates: true })
      .select("id")
      .maybeSingle();
    if (eventoError) throw eventoError;

    let eventoId = evento?.id || null;
    if (!eventoId) {
      const { data: existente } = await supabase
        .from("rotina_automacao_eventos")
        .select("id")
        .eq("empresa_id", input.empresaId)
        .eq("evento_chave", eventoChave)
        .maybeSingle();
      eventoId = existente?.id || null;
    }

    const contexto: ContextoEvento = {
      mensagem: { id: mensagemId, texto: String(input.mensagemTexto || ""), tipo: input.mensagemTipo || null },
      conversa: {
        id: conversa.id,
        status: conversa.status || null,
        setor_id: conversa.setor_id || null,
        responsavel_id: conversa.responsavel_id || null,
        aguardando_atendente: conversa.aguardando_atendente === true,
        bot_ativo: conversa.bot_ativo === true,
      },
      contato: { id: input.contatoId || null },
    };

    const execucaoIds: string[] = [];
    let interromperFluxoAtual = false;
    let algumaExecutada = false;
    let houveErro = false;

    for (const automacao of automacoesResult.data || []) {
      const gatilho = gatilhos.find((item) => item.automacao_id === automacao.id);
      if (!gatilho) continue;
      const condicoes = (condicoesResult.data || []).filter((item) => item.automacao_id === automacao.id) as CondicaoRotina[];
      if (!avaliarCondicoes(condicoes, contexto)) continue;

      const acoes = (acoesResult.data || []).filter((item) => item.automacao_id === automacao.id) as AcaoRotina[];
      if (!acoes.length) continue;
      algumaExecutada = true;

      const execucao = await obterExecucao({
        empresaId: input.empresaId,
        automacaoId: automacao.id,
        gatilhoId: gatilho.id,
        eventoChave,
        mensagemId,
        contextoJson: {
          evento: EVENTO,
          mensagem_id: mensagemId,
          conversa_id: input.conversaId,
          contato_id: input.contatoId || null,
          integracao_whatsapp_id: integracaoConversaId || null,
        },
      });
      execucaoIds.push(execucao.id);

      if (execucao.status === "concluida") {
        interromperFluxoAtual = interromperFluxoAtual || execucao.resultado_json?.interromper_fluxo_atual === true;
        continue;
      }

      let jobAnteriorId: string | null = null;
      let interromperNestaExecucao = false;
      let erroExecucao: string | null = null;
      const resultados: Array<Record<string, unknown>> = [];

      for (const acao of [...acoes].sort((a, b) => a.ordem - b.ordem)) {
        const job = await obterJob({
          empresaId: input.empresaId,
          automacaoId: automacao.id,
          execucaoId: execucao.id,
          acao,
          mensagemId,
          dependeDeJobId: jobAnteriorId,
        });
        jobAnteriorId = job.id;

        if (job.status === "concluido") {
          resultados.push(job.resultado_json || {});
          if (job.resultado_json?.interromper_fluxo_atual === true) {
            interromperNestaExecucao = true;
            interromperFluxoAtual = true;
          }
          continue;
        }
        if (job.status === "cancelado") continue;

        const { error: processandoError } = await supabase
          .from("rotina_automacao_jobs")
          .update({ status: "processando", tentativas: Number(job.tentativas || 0) + 1, bloqueado_em: new Date().toISOString(), erro: null })
          .eq("id", job.id)
          .eq("empresa_id", input.empresaId);
        if (processandoError) throw processandoError;

        try {
          const resultado = await executarAcaoRotina({
            empresaId: input.empresaId,
            conversaId: input.conversaId,
            automacaoId: automacao.id,
            execucaoId: execucao.id,
            acao,
          });
          resultados.push(resultado);
          if (resultado.interromper_fluxo_atual === true) {
            interromperNestaExecucao = true;
            interromperFluxoAtual = true;
          }
          const { error: concluidoError } = await supabase
            .from("rotina_automacao_jobs")
            .update({ status: "concluido", resultado_json: resultado, executado_em: new Date().toISOString(), bloqueado_em: null, erro: null })
            .eq("id", job.id)
            .eq("empresa_id", input.empresaId);
          if (concluidoError) throw concluidoError;
        } catch (error) {
          erroExecucao = error instanceof Error ? error.message : "Erro ao executar ação da automação.";
          houveErro = true;
          await supabase
            .from("rotina_automacao_jobs")
            .update({ status: "erro", erro: erroExecucao, executado_em: new Date().toISOString(), bloqueado_em: null })
            .eq("id", job.id)
            .eq("empresa_id", input.empresaId);
          break;
        }
      }

      const { error: execucaoFinalError } = await supabase
        .from("rotina_automacao_execucoes")
        .update({
          status: erroExecucao ? "erro" : "concluida",
          resultado_json: { automacao_nome: automacao.nome, interromper_fluxo_atual: interromperNestaExecucao, acoes: resultados },
          erro: erroExecucao,
          finalizada_em: new Date().toISOString(),
        })
        .eq("id", execucao.id)
        .eq("empresa_id", input.empresaId);
      if (execucaoFinalError) throw execucaoFinalError;
    }

    await marcarEvento(
      eventoId,
      input.empresaId,
      houveErro ? "erro" : algumaExecutada ? "processado" : "ignorado",
      houveErro ? "Uma ou mais automações falharam ao processar o evento." : null,
    );

    return {
      executado: algumaExecutada,
      interromperFluxoAtual,
      execucaoIds,
      erro: houveErro ? "Uma ou mais automações falharam." : null,
    };
  } catch (error) {
    console.error("[ROTINA_AUTOMACAO] Falha no runtime de mensagem recebida:", error);
    return null;
  }
}
