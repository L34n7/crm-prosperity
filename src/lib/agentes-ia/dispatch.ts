import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { AutomationEngineInput } from "@/lib/automacoes/types";
import { processarPendenciaAgenteIa } from "./processar-pendencia-configurada";
import { marcarConversaComoAtendimentoAgente } from "./estado-atendimento-conversa";
import { calcularDebounceAdaptativo } from "./protecao-automacao-externa";
import {
  calcularProximaAbertura,
  estaDentroHorarioAtendimento,
  normalizarHorarioAtendimento,
} from "./horario-atendimento";
import { publicarPendenciaAgenteIaQstash } from "./fila-agendada";

const supabaseAdmin = getSupabaseAdmin();

type AgenteDespacho = {
  id: string;
  debounce_ms?: number | null;
};

type PendenciaRow = { id: string };

function numeroInteiro(valor: unknown, fallback: number, minimo: number, maximo: number) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return fallback;
  return Math.min(maximo, Math.max(minimo, Math.floor(numero)));
}

async function esperar(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function cancelarFluxosConversacionaisAtivos(empresaId: string, conversaId: string) {
  const { data: execucoes, error } = await supabaseAdmin
    .from("automacao_execucoes")
    .select("id, metadata_json")
    .eq("empresa_id", empresaId)
    .eq("conversa_id", conversaId)
    .in("status", ["rodando", "aguardando"]);
  if (error) throw new Error(error.message);

  const agora = new Date().toISOString();
  for (const execucao of execucoes || []) {
    await supabaseAdmin
      .from("automacao_execucoes")
      .update({
        status: "cancelado",
        finished_at: agora,
        updated_at: agora,
        metadata_json: {
          ...(execucao.metadata_json || {}),
          motivo_cancelamento: "agente_ia_assumiu_conversa",
          cancelado_em: agora,
        },
      })
      .eq("empresa_id", empresaId)
      .eq("id", execucao.id)
      .in("status", ["rodando", "aguardando"]);

    await supabaseAdmin
      .from("automacao_agendamentos")
      .update({ status: "cancelado" })
      .eq("empresa_id", empresaId)
      .eq("execucao_id", execucao.id)
      .eq("status", "pendente");
  }
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

export async function despacharMensagemParaAgente(params: {
  input: AutomationEngineInput;
  agente: AgenteDespacho;
  contatoId?: string | null;
}) {
  const texto = String(params.input.mensagemTexto || "").trim();
  const mensagemId = String(params.input.mensagemId || "").trim() || null;
  if (!texto || !mensagemId) return null;

  const protocoloId = await protocoloAtivoDaConversa(
    params.input.empresaId,
    params.input.conversaId
  );

  const { data: configuracaoAgente, error: configuracaoError } = await supabaseAdmin
    .from("agentes_ia")
    .select("horarios")
    .eq("empresa_id", params.input.empresaId)
    .eq("id", params.agente.id)
    .maybeSingle();
  if (configuracaoError) throw new Error(configuracaoError.message);

  const horario = normalizarHorarioAtendimento(configuracaoAgente?.horarios);
  if (horario.ativo && !estaDentroHorarioAtendimento(horario)) {
    const proximaAbertura = calcularProximaAbertura(horario);
    if (!proximaAbertura) {
      console.error("[AGENTE_IA] Horário ativo sem próxima abertura configurada", {
        agenteId: params.agente.id,
        conversaId: params.input.conversaId,
      });
      return null;
    }

    const { data: pendencia, error: pendenciaError } = await supabaseAdmin.rpc(
      "agente_ia_enfileirar_mensagem_agendada",
      {
        p_empresa_id: params.input.empresaId,
        p_agente_id: params.agente.id,
        p_conversa_id: params.input.conversaId,
        p_contato_id: params.input.contatoId || params.contatoId || null,
        p_numero_destino: params.input.numeroDestino || "",
        p_mensagem_id: mensagemId,
        p_conteudo: texto,
        p_processar_em: proximaAbertura.toISOString(),
      }
    );
    if (pendenciaError || !pendencia) {
      console.error("[AGENTE_IA] Erro ao agendar mensagem fora do horário:", pendenciaError);
      return null;
    }

    const pendenciaId = (pendencia as PendenciaRow).id;
    const delayMs = Math.max(1_000, proximaAbertura.getTime() - Date.now());
    const publicou = await publicarPendenciaAgenteIaQstash(pendenciaId, delayMs);
    if (!publicou) {
      console.warn("[AGENTE_IA] Pendência ficou salva para recuperação pelo cron", {
        pendenciaId,
        processarEm: proximaAbertura.toISOString(),
      });
    }

    // Fora do horário o agente fica agendado como fallback, mas não assume a
    // conversa agora. O motor de automações pode seguir e respeitar também o
    // horário configurado no fluxo correspondente.
    return null;
  }

  await cancelarFluxosConversacionaisAtivos(
    params.input.empresaId,
    params.input.conversaId
  );

  await marcarConversaComoAtendimentoAgente({
    empresaId: params.input.empresaId,
    conversaId: params.input.conversaId,
    agenteId: params.agente.id,
    protocoloId,
  });

  const debounceBaseMs = numeroInteiro(params.agente.debounce_ms, 1200, 250, 10000);
  const debounce = await calcularDebounceAdaptativo({
    empresaId: params.input.empresaId,
    conversaId: params.input.conversaId,
    debounceBaseMs,
    mensagemTipo: params.input.mensagemTipo || null,
  });
  const debounceMs = debounce.debounceMs;

  const { data: pendencia, error: pendenciaError } = await supabaseAdmin.rpc(
    "agente_ia_enfileirar_mensagem",
    {
      p_empresa_id: params.input.empresaId,
      p_agente_id: params.agente.id,
      p_conversa_id: params.input.conversaId,
      p_contato_id: params.input.contatoId || params.contatoId || null,
      p_numero_destino: params.input.numeroDestino || "",
      p_mensagem_id: mensagemId,
      p_conteudo: texto,
      p_debounce_ms: debounceMs,
    }
  );

  if (pendenciaError || !pendencia) {
    console.error("[AGENTE_IA] Erro ao enfileirar mensagem:", pendenciaError);
    return null;
  }

  const pendenciaId = (pendencia as PendenciaRow).id;
  const publicou = await publicarPendenciaAgenteIaQstash(pendenciaId, debounceMs);
  if (!publicou) {
    await esperar(debounceMs + 50);
    await processarPendenciaAgenteIa(pendenciaId, { forcar: true }).catch((error) =>
      console.error("[AGENTE_IA] Falha no processamento inline:", error)
    );
  }

  return {
    ok: true,
    status: "agente_ia_agendado",
    agenteId: params.agente.id,
    pendenciaId,
    debounceMs,
    debounceAdaptativo: debounce.adaptado,
    debounceMotivo: debounce.motivo,
  };
}
