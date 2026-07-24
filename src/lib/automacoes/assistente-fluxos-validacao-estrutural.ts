import type {
  AssistenteAutomacaoConexao,
  AssistenteAutomacaoNo,
  ValidacaoItemAssistente,
} from "./assistente-fluxos-base";

type Objeto = Record<string, unknown>;

export type ProblemaEstruturalPlano = {
  codigo: string;
  mensagem: string;
};

function objeto(valor: unknown): Objeto {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Objeto)
    : {};
}

export function normalizarRefEstrutural(valor: unknown) {
  return String(valor || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

/**
 * Valida somente propriedades objetivas que uma maquina pode conferir sem
 * interpretar a intencao do fluxo. Copy, navegacao, FAQ, conversao e coerencia
 * semantica pertencem exclusivamente ao Prompt Mestre e ao modelo.
 */
export function validarPlanoAssistenteEstrutural(
  valor: unknown
): ProblemaEstruturalPlano[] {
  const plano = objeto(valor);
  const etapas = Array.isArray(plano.etapas) ? plano.etapas.map(objeto) : [];
  const rotas = Array.isArray(plano.rotas) ? plano.rotas.map(objeto) : [];
  const problemas: ProblemaEstruturalPlano[] = [];

  if (etapas.length === 0) {
    problemas.push({
      codigo: "ETAPAS_AUSENTES",
      mensagem: "O JSON precisa possuir pelo menos uma etapa.",
    });
    return problemas;
  }

  const refs = new Set<string>();
  let inicios = 0;

  for (const [indice, etapa] of etapas.entries()) {
    const ref = normalizarRefEstrutural(etapa.ref);
    const tipo = String(etapa.tipo || "").trim();

    if (!ref) {
      problemas.push({
        codigo: "REF_AUSENTE",
        mensagem: `A etapa ${indice + 1} nao possui uma ref valida.`,
      });
      continue;
    }

    if (refs.has(ref)) {
      problemas.push({
        codigo: "REF_DUPLICADA",
        mensagem: `A ref "${ref}" foi usada por mais de uma etapa.`,
      });
    }

    refs.add(ref);
    if (tipo === "inicio") inicios += 1;

    const opcoes = Array.isArray(etapa.opcoes)
      ? etapa.opcoes.map(objeto)
      : [];
    const idsOpcoes = new Set<string>();

    for (const [indiceOpcao, opcao] of opcoes.entries()) {
      const id = normalizarRefEstrutural(opcao.id);
      if (!id) {
        problemas.push({
          codigo: "OPCAO_ID_AUSENTE",
          mensagem: `A opcao ${indiceOpcao + 1} da etapa "${ref}" nao possui ID valido.`,
        });
        continue;
      }
      if (idsOpcoes.has(id)) {
        problemas.push({
          codigo: "OPCAO_ID_DUPLICADO",
          mensagem: `A etapa "${ref}" possui o ID de opcao duplicado "${id}".`,
        });
      }
      idsOpcoes.add(id);
    }
  }

  if (inicios !== 1) {
    problemas.push({
      codigo: "INICIO_INVALIDO",
      mensagem: "O JSON precisa possuir exatamente uma etapa do tipo inicio.",
    });
  }

  for (const [indice, rota] of rotas.entries()) {
    const origem = normalizarRefEstrutural(rota.origem);
    const destino = normalizarRefEstrutural(rota.destino);

    if (!origem || !destino) {
      problemas.push({
        codigo: "ROTA_REF_AUSENTE",
        mensagem: `A rota ${indice + 1} nao possui origem e destino validos.`,
      });
      continue;
    }

    if (!refs.has(origem)) {
      problemas.push({
        codigo: "ROTA_ORIGEM_INEXISTENTE",
        mensagem: `A rota ${indice + 1} referencia a origem inexistente "${origem}".`,
      });
    }

    if (!refs.has(destino)) {
      problemas.push({
        codigo: "ROTA_DESTINO_INEXISTENTE",
        mensagem: `A rota ${indice + 1} referencia o destino inexistente "${destino}".`,
      });
    }
  }

  return problemas.filter(
    (problema, indice, todos) =>
      todos.findIndex(
        (item) =>
          item.codigo === problema.codigo && item.mensagem === problema.mensagem
      ) === indice
  );
}

export function validarEstruturaCompiladaEstrutural(params: {
  nos: AssistenteAutomacaoNo[];
  conexoes: AssistenteAutomacaoConexao[];
}): ValidacaoItemAssistente[] {
  const erros: ValidacaoItemAssistente[] = [];
  const idsNos = new Set<string>();
  const idsConexoes = new Set<string>();

  for (const no of params.nos) {
    if (!no.id || !no.tipo_no) {
      erros.push({
        codigo: "NO_INVALIDO",
        mensagem: "Existe um bloco compilado sem ID ou tipo.",
      });
      continue;
    }
    if (idsNos.has(no.id)) {
      erros.push({
        codigo: "NO_ID_DUPLICADO",
        mensagem: `O ID de bloco "${no.id}" esta duplicado.`,
        no_id: no.id,
      });
    }
    idsNos.add(no.id);
  }

  for (const conexao of params.conexoes) {
    if (!conexao.id || !conexao.no_origem_id || !conexao.no_destino_id) {
      erros.push({
        codigo: "CONEXAO_INVALIDA",
        mensagem: "Existe uma conexao compilada sem IDs validos.",
      });
      continue;
    }
    if (idsConexoes.has(conexao.id)) {
      erros.push({
        codigo: "CONEXAO_ID_DUPLICADO",
        mensagem: `O ID de conexao "${conexao.id}" esta duplicado.`,
        conexao_id: conexao.id,
      });
    }
    if (
      !idsNos.has(conexao.no_origem_id) ||
      !idsNos.has(conexao.no_destino_id)
    ) {
      erros.push({
        codigo: "CONEXAO_COM_NO_AUSENTE",
        mensagem: "Existe uma conexao apontando para um bloco ausente.",
        conexao_id: conexao.id,
      });
    }
    idsConexoes.add(conexao.id);
  }

  return erros;
}
