import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const CLASSIFICACOES_LEAD = [
  "novo",
  "qualificado",
  "convertido",
  "perdido",
] as const;

export type ClassificacaoLead = (typeof CLASSIFICACOES_LEAD)[number];
export type ResultadoFluxoLead = "positivo" | "negativo" | "neutro";

export const CLASSIFICACAO_LEAD_LABEL: Record<ClassificacaoLead, string> = {
  novo: "Novo",
  qualificado: "Qualificado",
  convertido: "Convertido",
  perdido: "Perdido",
};

const CLASSIFICACOES_SET = new Set<string>(CLASSIFICACOES_LEAD);

const CLASSIFICACAO_LEGADA_MAP: Record<string, ClassificacaoLead> = {
  cliente: "convertido",
  venda: "convertido",
  vendido: "convertido",
  positivo: "convertido",
  em_atendimento: "qualificado",
  atendimento: "qualificado",
  neutro: "qualificado",
  negativo: "perdido",
};

export function normalizarClassificacaoLead(
  valor: unknown,
  fallback: ClassificacaoLead = "novo"
): ClassificacaoLead {
  const normalizado = String(valor || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_|_$/g, "");

  if (CLASSIFICACOES_SET.has(normalizado)) {
    return normalizado as ClassificacaoLead;
  }

  return CLASSIFICACAO_LEGADA_MAP[normalizado] || fallback;
}

export function classificacaoLeadValida(valor: unknown): valor is ClassificacaoLead {
  return CLASSIFICACOES_SET.has(normalizarClassificacaoLead(valor));
}

export function statusLeadLegadoDaClassificacao(
  classificacao: ClassificacaoLead
) {
  return classificacao === "convertido" ? "cliente" : classificacao;
}

export function classificacaoLeadPorResultadoFluxo(
  resultado: unknown
): ClassificacaoLead | null {
  const valor = String(resultado || "").trim().toLowerCase();

  if (valor === "positivo") return "convertido";
  if (valor === "negativo") return "perdido";
  if (valor === "neutro") return "qualificado";

  return null;
}

export function classificacaoLeadPorEventoRastreamento(
  tipo: unknown,
  resultadoFluxo?: unknown
): ClassificacaoLead | null {
  const tipoNormalizado = String(tipo || "").trim().toLowerCase();

  if (tipoNormalizado === "fluxo_finalizado") {
    return classificacaoLeadPorResultadoFluxo(resultadoFluxo);
  }

  if (
    [
      "lead_criado",
    ].includes(tipoNormalizado)
  ) {
    return "novo";
  }

  if (
    [
      "conversa_iniciada",
      "primeira_mensagem_recebida",
      "lead_qualificado",
      "fluxo_iniciado",
      "fluxo_transferido_atendimento",
    ].includes(tipoNormalizado)
  ) {
    return "qualificado";
  }

  if (
    [
      "venda_realizada",
      "agendamento_criado",
      "agendamento_confirmado",
      "entrada_grupo_confirmada",
      "pagamento_confirmado",
      "objetivo_concluido",
    ].includes(tipoNormalizado)
  ) {
    return "convertido";
  }

  if (
    [
      "venda_perdida",
      "fluxo_incompleto_timeout",
      "sem_interesse",
      "objetivo_nao_concluido",
    ].includes(tipoNormalizado)
  ) {
    return "perdido";
  }

  return null;
}

export async function aplicarClassificacaoLeadContato(params: {
  empresaId: string;
  contatoId?: string | null;
  classificacao: ClassificacaoLead;
  eventoId?: string | null;
  protocoloId?: string | null;
  origem?: string | null;
}) {
  const {
    empresaId,
    contatoId,
    classificacao,
    eventoId = null,
    protocoloId = null,
    origem = null,
  } = params;

  if (!empresaId || !contatoId) {
    return { atualizado: false, motivo: "contato_ausente" as const };
  }

  const agora = new Date().toISOString();
  const supabase = getSupabaseAdmin();
  const statusLead = statusLeadLegadoDaClassificacao(classificacao);
  const { error } = await supabase
    .from("contatos")
    .update({
      classificacao,
      classificacao_atualizada_em: agora,
      classificacao_evento_id: eventoId,
      classificacao_protocolo_id: protocoloId,
      status_lead: statusLead,
      updated_at: agora,
    })
    .eq("empresa_id", empresaId)
    .eq("id", contatoId);

  if (error) {
    throw new Error(
      `Erro ao atualizar classificação do lead${origem ? ` (${origem})` : ""}: ${error.message}`
    );
  }

  return { atualizado: true, classificacao, statusLead };
}
