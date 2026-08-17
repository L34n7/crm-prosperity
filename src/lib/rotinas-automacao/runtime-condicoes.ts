export type OperadorCondicao =
  | "igual" | "diferente" | "contem" | "nao_contem"
  | "existe" | "nao_existe" | "maior_que" | "menor_que"
  | "em" | "nao_em";

export type CondicaoRotina = {
  automacao_id: string;
  grupo: number;
  ordem: number;
  conjuncao: "and" | "or";
  campo: string;
  operador: OperadorCondicao;
  valor_json: unknown;
};

export type ContextoEvento = {
  mensagem: { id: string; texto: string; tipo: string | null };
  conversa: {
    id: string;
    status: string | null;
    setor_id: string | null;
    responsavel_id: string | null;
    aguardando_atendente: boolean;
    bot_ativo: boolean;
  };
  contato: { id: string | null };
};

function normalizar(valor: unknown) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function campo(contexto: ContextoEvento, caminho: string) {
  let atual: unknown = contexto;
  for (const parte of String(caminho || "").split(".").filter(Boolean)) {
    if (!atual || typeof atual !== "object" || Array.isArray(atual)) return undefined;
    atual = (atual as Record<string, unknown>)[parte];
  }
  return atual;
}

function lista(valor: unknown) {
  if (Array.isArray(valor)) return valor;
  if (typeof valor === "string") return valor.split(",").map((v) => v.trim()).filter(Boolean);
  return valor == null ? [] : [valor];
}

function comparar(atualBruto: unknown, operador: OperadorCondicao, esperadoBruto: unknown) {
  if (operador === "existe") return atualBruto != null && String(atualBruto).trim() !== "";
  if (operador === "nao_existe") return atualBruto == null || String(atualBruto).trim() === "";
  if (operador === "maior_que" || operador === "menor_que") {
    const atual = Number(atualBruto);
    const esperado = Number(esperadoBruto);
    if (!Number.isFinite(atual) || !Number.isFinite(esperado)) return false;
    return operador === "maior_que" ? atual > esperado : atual < esperado;
  }
  if (operador === "em" || operador === "nao_em") {
    const encontrado = lista(esperadoBruto).some((item) => normalizar(item) === normalizar(atualBruto));
    return operador === "em" ? encontrado : !encontrado;
  }
  const atual = normalizar(atualBruto);
  const esperado = normalizar(esperadoBruto);
  if (operador === "igual") return atual === esperado;
  if (operador === "diferente") return atual !== esperado;
  if (operador === "contem") return esperado !== "" && atual.includes(esperado);
  if (operador === "nao_contem") return esperado === "" || !atual.includes(esperado);
  return false;
}

export function avaliarCondicoes(condicoes: CondicaoRotina[], contexto: ContextoEvento) {
  if (!condicoes.length) return true;
  const grupos = new Map<number, CondicaoRotina[]>();
  for (const item of condicoes) grupos.set(item.grupo || 0, [...(grupos.get(item.grupo || 0) || []), item]);

  for (const itens of grupos.values()) {
    let resultado: boolean | null = null;
    for (const item of [...itens].sort((a, b) => a.ordem - b.ordem)) {
      const ok = comparar(campo(contexto, item.campo), item.operador, item.valor_json);
      resultado = resultado == null ? ok : item.conjuncao === "or" ? resultado || ok : resultado && ok;
    }
    if (resultado !== true) return false;
  }
  return true;
}
