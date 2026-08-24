import type {
  EscopoIntegracoesFluxo,
  EscopoIntegracoesModo,
  IntegracaoWhatsappOpcao,
  TemplateWhatsappOpcao,
} from "./types";

export function templateWhatsappAprovado(
  template?: TemplateWhatsappOpcao | null
) {
  return String(template?.status || "").trim().toUpperCase() === "APPROVED";
}

export function normalizarEscopoIntegracoesFluxo(
  configuracao?: Record<string, any> | null
): EscopoIntegracoesFluxo {
  const escopo = configuracao?.integracoes_whatsapp || {};
  const idsLegados = [
    ...(Array.isArray(configuracao?.integracoes_whatsapp_ids)
      ? configuracao?.integracoes_whatsapp_ids
      : []),
    configuracao?.integracao_whatsapp_id,
  ];
  const ids = Array.from(
    new Set(
      [
        ...(Array.isArray(escopo?.ids) ? escopo.ids : []),
        ...idsLegados,
      ]
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    )
  );
  const modo =
    String(escopo?.modo || configuracao?.integracoes_whatsapp_modo || "") ===
      "selecionadas" && ids.length > 0
      ? "selecionadas"
      : "todas";

  return {
    modo,
    ids: modo === "selecionadas" ? ids : [],
  };
}

export function montarEscopoIntegracoesFluxo(
  modo: EscopoIntegracoesModo,
  ids: string[]
): EscopoIntegracoesFluxo {
  const idsUnicos = Array.from(
    new Set(ids.map((id) => String(id || "").trim()).filter(Boolean))
  );

  return modo === "selecionadas" && idsUnicos.length > 0
    ? { modo: "selecionadas", ids: idsUnicos }
    : { modo: "todas", ids: [] };
}

export function escoposIntegracaoConflitam(
  atual: EscopoIntegracoesFluxo,
  existente: EscopoIntegracoesFluxo
) {
  if (atual.modo !== "selecionadas" || existente.modo !== "selecionadas") {
    return true;
  }

  const idsExistentes = new Set(existente.ids);
  return atual.ids.some((id) => idsExistentes.has(id));
}

export function rotuloIntegracaoWhatsapp(
  integracao: IntegracaoWhatsappOpcao
) {
  const posicao = integracao.posicao ? `Numero ${integracao.posicao}` : "Numero";
  const nome =
    String(integracao.nome_conexao || "").trim() ||
    String(integracao.numero || "").trim() ||
    "WhatsApp";

  return `${posicao} - ${nome}`;
}

export function normalizarTemplatesPorIntegracao(valor: unknown) {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(valor as Record<string, unknown>)
      .map(([integracaoId, templateId]) => [
        String(integracaoId || "").trim(),
        String(templateId || "").trim(),
      ])
      .filter(([integracaoId, templateId]) => integracaoId && templateId)
  );
}

export function obterIntegracoesDoEscopoFluxo(
  escopo: EscopoIntegracoesFluxo,
  integracoes: IntegracaoWhatsappOpcao[]
) {
  if (escopo.modo !== "selecionadas") return integracoes;

  const ids = new Set(escopo.ids);
  return integracoes.filter((integracao) => ids.has(integracao.id));
}

export function chaveWabaIntegracao(integracao: IntegracaoWhatsappOpcao) {
  return String(integracao.waba_id || "").trim() || `integracao:${integracao.id}`;
}

export function usaTemplatesPorIntegracao(
  integracoes: IntegracaoWhatsappOpcao[]
) {
  return new Set(integracoes.map(chaveWabaIntegracao)).size > 1;
}

export function templateCompativelComIntegracao(
  template: TemplateWhatsappOpcao | null | undefined,
  integracao: IntegracaoWhatsappOpcao
) {
  if (!template) return false;
  if (template.integracao_whatsapp_id === integracao.id) return true;

  const templateWabaId = String(template.waba_id || "").trim();
  const integracaoWabaId = String(integracao.waba_id || "").trim();

  return Boolean(
    templateWabaId &&
      integracaoWabaId &&
      templateWabaId === integracaoWabaId
  );
}
