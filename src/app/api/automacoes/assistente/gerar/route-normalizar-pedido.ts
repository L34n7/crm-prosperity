export const LIMITE_PEDIDO_IA = 20_000;

type Objeto = Record<string, unknown>;

function objeto(valor: unknown): Objeto {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? valor as Objeto
    : {};
}

function agendamentoManual(instrucao: string) {
  const texto = instrucao
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  return (
    /melhor dia|melhor horario/.test(texto) &&
    /equipe (confirmara|confirma)|confirmar[aá] seu horario|atendente/.test(texto)
  ) || /agendamento manual|coleta manual/.test(texto);
}

export async function normalizarPedidoAssistente(request: Request) {
  const body = objeto(await request.clone().json().catch(() => ({})));
  const instrucaoOriginal = String(body.instrucao || "").trim();
  const instrucaoLimitada = instrucaoOriginal.slice(0, LIMITE_PEDIDO_IA);

  if (!instrucaoOriginal || String(body.acao || "gerar") !== "preparar") {
    return request;
  }

  const regraAgenda = agendamentoManual(instrucaoLimitada)
    ? [
        "REGRA TECNICA DE INTERPRETACAO:",
        "O pedido descreve agendamento manual. Nao use blocos de agenda automatica do CRM.",
        "Colete somente os dados explicitamente solicitados e encaminhe para atendimento humano confirmar depois.",
      ].join("\n")
    : "";

  const instrucao = [instrucaoLimitada, regraAgenda].filter(Boolean).join("\n\n");

  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: JSON.stringify({
      ...body,
      instrucao,
      instrucao_original: instrucaoLimitada,
      limite_instrucao: LIMITE_PEDIDO_IA,
      modo_agendamento: regraAgenda ? "manual" : "automatico_ou_nao_definido",
    }),
  });
}
