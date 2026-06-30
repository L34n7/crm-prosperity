import type {
  CampoCadastro,
  CampoCadastroTipo,
} from "@/lib/cadastros/form-schema";

export type CampoPersonalizadoRow = {
  id: string;
  empresa_id: string;
  escopo: "pessoa" | "paciente";
  chave: string;
  nome: string;
  tipo: CampoCadastroTipo;
  obrigatorio: boolean;
  opcoes: unknown;
  ordem: number;
  ativo: boolean;
};

function estaVazio(valor: unknown) {
  return (
    valor === null ||
    valor === undefined ||
    valor === "" ||
    (typeof valor === "string" && valor.trim() === "")
  );
}

function normalizarValorCampo(
  campo: Pick<CampoCadastro, "nome" | "tipo" | "opcoes">,
  valor: unknown
) {
  if (estaVazio(valor)) return null;

  if (campo.tipo === "numero") {
    const numero =
      typeof valor === "number"
        ? valor
        : Number(String(valor).replace(",", "."));

    if (!Number.isFinite(numero)) {
      throw new Error(`${campo.nome} deve ser um número válido.`);
    }

    return numero;
  }

  if (campo.tipo === "booleano") {
    if (typeof valor === "boolean") return valor;
    if (valor === "true" || valor === "1") return true;
    if (valor === "false" || valor === "0") return false;
    throw new Error(`${campo.nome} deve ser verdadeiro ou falso.`);
  }

  if (campo.tipo === "data") {
    const texto = String(valor).trim();
    const data = new Date(`${texto}T00:00:00`);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(texto) || Number.isNaN(data.getTime())) {
      throw new Error(`${campo.nome} deve ser uma data válida.`);
    }

    return texto;
  }

  const texto = String(valor).trim();

  if (campo.tipo === "select") {
    const opcoes = Array.isArray(campo.opcoes)
      ? campo.opcoes.map((item) => String(item))
      : [];

    if (opcoes.length > 0 && !opcoes.includes(texto)) {
      throw new Error(`${campo.nome} possui uma opção inválida.`);
    }
  }

  return texto;
}

export function validarDadosPersonalizados(params: {
  valores: unknown;
  campos: Array<
    Pick<
      CampoCadastro,
      "chave" | "nome" | "tipo" | "obrigatorio" | "opcoes"
    >
  >;
}) {
  const entrada =
    params.valores &&
    !Array.isArray(params.valores) &&
    typeof params.valores === "object"
      ? (params.valores as Record<string, unknown>)
      : {};
  const saida: Record<string, unknown> = {};

  for (const campo of params.campos) {
    const valor = entrada[campo.chave];

    if (campo.obrigatorio && estaVazio(valor)) {
      throw new Error(`${campo.nome} é obrigatório.`);
    }

    const valorNormalizado = normalizarValorCampo(campo, valor);

    if (valorNormalizado !== null) {
      saida[campo.chave] = valorNormalizado;
    }
  }

  return saida;
}

