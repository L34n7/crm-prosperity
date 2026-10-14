export type TipoProblemaTelefone =
  | "sem_ddd"
  | "sem_ddi"
  | "celular_sem_nono"
  | "prefixo_operadora"
  | "formato_valido_revisao"
  | "tamanho_invalido"
  | "internacional_ou_ambiguo";

export type AnaliseTelefoneRevisao = {
  tipo: TipoProblemaTelefone;
  label: string;
  descricao: string;
  telefoneOriginal: string;
  telefoneLimpo: string;
  sugestao: string | null;
  sugestaoSegura: boolean;
  telefoneRevisarAposSugestao: boolean;
};

export type AcaoCorrecaoTelefone =
  | "aplicar_sugestoes_seguras"
  | "adicionar_ddd"
  | "adicionar_ddd_nono"
  | "adicionar_nono";

const DDDS_VALIDOS = new Set([
  "11", "12", "13", "14", "15", "16", "17", "18", "19",
  "21", "22", "24", "27", "28",
  "31", "32", "33", "34", "35", "37", "38",
  "41", "42", "43", "44", "45", "46", "47", "48", "49",
  "51", "53", "54", "55",
  "61", "62", "63", "64", "65", "66", "67", "68", "69",
  "71", "73", "74", "75", "77", "79",
  "81", "82", "83", "84", "85", "86", "87", "88", "89",
  "91", "92", "93", "94", "95", "96", "97", "98", "99",
]);

export function limparTelefoneParaRevisao(valor: string) {
  return String(valor || "").replace(/\D/g, "");
}

export function dddBrasilValido(ddd: string) {
  return DDDS_VALIDOS.has(String(ddd || "").replace(/\D/g, ""));
}

function primeiroDigitoAssinante(numeroLocal: string) {
  return numeroLocal.slice(0, 1);
}

function pareceFixo(numeroLocal: string) {
  return ["2", "3", "4", "5"].includes(primeiroDigitoAssinante(numeroLocal));
}

function pareceCelularAntigo(numeroLocal: string) {
  return ["6", "7", "8", "9"].includes(primeiroDigitoAssinante(numeroLocal));
}

function montarAnalise(
  parcial: Omit<AnaliseTelefoneRevisao, "telefoneOriginal" | "telefoneLimpo">,
  telefoneOriginal: string,
  telefoneLimpo: string
): AnaliseTelefoneRevisao {
  return {
    ...parcial,
    telefoneOriginal,
    telefoneLimpo,
  };
}

export function analisarTelefoneParaRevisao(
  telefone: string,
  marcadoParaRevisao = false
): AnaliseTelefoneRevisao {
  const original = String(telefone || "");
  let numeros = limparTelefoneParaRevisao(original);

  if (!numeros) {
    return montarAnalise(
      {
        tipo: "tamanho_invalido",
        label: "Telefone inválido",
        descricao: "O contato não possui dígitos suficientes para identificar um telefone.",
        sugestao: null,
        sugestaoSegura: false,
        telefoneRevisarAposSugestao: true,
      },
      original,
      numeros
    );
  }

  if (numeros.startsWith("0055")) {
    const corrigido = numeros.slice(2);

    if (
      (corrigido.length === 12 || corrigido.length === 13) &&
      corrigido.startsWith("55")
    ) {
      return montarAnalise(
        {
          tipo: "prefixo_operadora",
          label: "Prefixo internacional excedente",
          descricao: "O número contém 00 antes do código do Brasil e pode ser normalizado automaticamente.",
          sugestao: corrigido,
          sugestaoSegura: true,
          telefoneRevisarAposSugestao: false,
        },
        original,
        numeros
      );
    }
  }

  if (
    numeros.startsWith("0") &&
    (numeros.length === 13 || numeros.length === 14)
  ) {
    const semOperadora = numeros.slice(3);

    if (
      (semOperadora.length === 10 || semOperadora.length === 11) &&
      dddBrasilValido(semOperadora.slice(0, 2))
    ) {
      const ddd = semOperadora.slice(0, 2);
      const local = semOperadora.slice(2);

      if (local.length === 9) {
        return montarAnalise(
          {
            tipo: "prefixo_operadora",
            label: "Código de operadora",
            descricao: "O número possui 0 + código de operadora antes do DDD.",
            sugestao: `55${semOperadora}`,
            sugestaoSegura: true,
            telefoneRevisarAposSugestao: false,
          },
          original,
          numeros
        );
      }

      if (local.length === 8 && pareceFixo(local)) {
        return montarAnalise(
          {
            tipo: "prefixo_operadora",
            label: "Código de operadora",
            descricao: "O número possui 0 + código de operadora antes de um telefone fixo válido.",
            sugestao: `55${ddd}${local}`,
            sugestaoSegura: true,
            telefoneRevisarAposSugestao: false,
          },
          original,
          numeros
        );
      }

      if (local.length === 8 && pareceCelularAntigo(local)) {
        return montarAnalise(
          {
            tipo: "celular_sem_nono",
            label: "Possível celular sem 9º dígito",
            descricao: "O DDD foi identificado, mas o assinante possui apenas 8 dígitos.",
            sugestao: `55${ddd}9${local}`,
            sugestaoSegura: false,
            telefoneRevisarAposSugestao: false,
          },
          original,
          numeros
        );
      }
    }
  }

  if (numeros.startsWith("55")) {
    if (numeros.length === 13) {
      return montarAnalise(
        {
          tipo: "formato_valido_revisao",
          label: "Formato brasileiro válido",
          descricao: marcadoParaRevisao
            ? "O número já está em formato brasileiro completo e pode sair da revisão."
            : "O número já está em formato brasileiro completo.",
          sugestao: numeros,
          sugestaoSegura: marcadoParaRevisao,
          telefoneRevisarAposSugestao: false,
        },
        original,
        numeros
      );
    }

    if (numeros.length === 12) {
      const ddd = numeros.slice(2, 4);
      const local = numeros.slice(4);

      if (dddBrasilValido(ddd) && pareceFixo(local)) {
        return montarAnalise(
          {
            tipo: "formato_valido_revisao",
            label: "Telefone fixo válido",
            descricao: "O número possui DDI, DDD e 8 dígitos compatíveis com telefone fixo.",
            sugestao: numeros,
            sugestaoSegura: marcadoParaRevisao,
            telefoneRevisarAposSugestao: false,
          },
          original,
          numeros
        );
      }

      if (dddBrasilValido(ddd) && pareceCelularAntigo(local)) {
        return montarAnalise(
          {
            tipo: "celular_sem_nono",
            label: "Possível celular sem 9º dígito",
            descricao: "O DDI e o DDD estão presentes, mas o assinante possui apenas 8 dígitos.",
            sugestao: `55${ddd}9${local}`,
            sugestaoSegura: false,
            telefoneRevisarAposSugestao: false,
          },
          original,
          numeros
        );
      }
    }

    return montarAnalise(
      {
        tipo: "tamanho_invalido",
        label: "Quantidade de dígitos inválida",
        descricao: "O número começa com 55, mas não possui um tamanho brasileiro reconhecido.",
        sugestao: null,
        sugestaoSegura: false,
        telefoneRevisarAposSugestao: true,
      },
      original,
      numeros
    );
  }

  if (numeros.length === 11 && dddBrasilValido(numeros.slice(0, 2))) {
    return montarAnalise(
      {
        tipo: "sem_ddi",
        label: "Sem código do Brasil",
        descricao: "O número possui DDD e celular com 9 dígitos. Falta apenas o 55.",
        sugestao: `55${numeros}`,
        sugestaoSegura: true,
        telefoneRevisarAposSugestao: false,
      },
      original,
      numeros
    );
  }

  if (numeros.length === 10 && dddBrasilValido(numeros.slice(0, 2))) {
    const ddd = numeros.slice(0, 2);
    const local = numeros.slice(2);

    if (pareceFixo(local)) {
      return montarAnalise(
        {
          tipo: "sem_ddi",
          label: "Sem código do Brasil",
          descricao: "O número possui DDD e formato de telefone fixo. Falta apenas o 55.",
          sugestao: `55${numeros}`,
          sugestaoSegura: true,
          telefoneRevisarAposSugestao: false,
        },
        original,
        numeros
      );
    }

    if (pareceCelularAntigo(local)) {
      return montarAnalise(
        {
          tipo: "celular_sem_nono",
          label: "Possível celular sem 9º dígito",
          descricao: "O DDD existe, mas o assinante possui 8 dígitos e parece ser celular antigo.",
          sugestao: `55${ddd}9${local}`,
          sugestaoSegura: false,
          telefoneRevisarAposSugestao: false,
        },
        original,
        numeros
      );
    }
  }

  if (numeros.length === 8 || numeros.length === 9) {
    return montarAnalise(
      {
        tipo: "sem_ddd",
        label: "Sem DDD",
        descricao:
          numeros.length === 9
            ? "O número local possui 9 dígitos e precisa do DDD."
            : "O número local possui 8 dígitos e precisa do DDD; pode ser fixo ou celular antigo.",
        sugestao: null,
        sugestaoSegura: false,
        telefoneRevisarAposSugestao: true,
      },
      original,
      numeros
    );
  }

  if (numeros.length >= 12 && !numeros.startsWith("55")) {
    return montarAnalise(
      {
        tipo: "internacional_ou_ambiguo",
        label: "Internacional ou ambíguo",
        descricao: "O formato não é brasileiro de forma inequívoca. Revise manualmente antes de alterar.",
        sugestao: null,
        sugestaoSegura: false,
        telefoneRevisarAposSugestao: true,
      },
      original,
      numeros
    );
  }

  return montarAnalise(
    {
      tipo: "tamanho_invalido",
      label: "Quantidade de dígitos inválida",
      descricao: "Não foi possível corrigir este número com segurança automaticamente.",
      sugestao: null,
      sugestaoSegura: false,
      telefoneRevisarAposSugestao: true,
    },
    original,
    numeros
  );
}

export function proporCorrecaoTelefone(params: {
  analise: AnaliseTelefoneRevisao;
  acao: AcaoCorrecaoTelefone;
  ddd?: string | null;
}) {
  const { analise, acao } = params;
  const ddd = String(params.ddd || "").replace(/\D/g, "");

  if (acao === "aplicar_sugestoes_seguras") {
    if (!analise.sugestaoSegura || !analise.sugestao) return null;

    return {
      telefone: analise.sugestao,
      telefone_revisar: analise.telefoneRevisarAposSugestao,
    };
  }

  if (acao === "adicionar_ddd") {
    if (
      analise.tipo !== "sem_ddd" ||
      !dddBrasilValido(ddd) ||
      ![8, 9].includes(analise.telefoneLimpo.length)
    ) {
      return null;
    }

    const local = analise.telefoneLimpo;
    const manterRevisao = local.length === 8 && pareceCelularAntigo(local);

    return {
      telefone: `55${ddd}${local}`,
      telefone_revisar: manterRevisao,
    };
  }

  if (acao === "adicionar_ddd_nono") {
    if (
      analise.tipo !== "sem_ddd" ||
      !dddBrasilValido(ddd) ||
      analise.telefoneLimpo.length !== 8 ||
      !pareceCelularAntigo(analise.telefoneLimpo)
    ) {
      return null;
    }

    return {
      telefone: `55${ddd}9${analise.telefoneLimpo}`,
      telefone_revisar: false,
    };
  }

  if (acao === "adicionar_nono") {
    if (
      analise.tipo !== "celular_sem_nono" ||
      !analise.sugestao
    ) {
      return null;
    }

    return {
      telefone: analise.sugestao,
      telefone_revisar: false,
    };
  }

  return null;
}
