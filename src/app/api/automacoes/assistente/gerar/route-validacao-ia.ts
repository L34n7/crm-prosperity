import type { ContextoAssistenteFluxos } from "./route-contexto-ia";

export type UsoResposta = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  total_tokens?: number | null;
  [chave: string]: unknown;
};

export type RespostaOpenAI = {
  id?: string;
  status?: string;
  output_text?: string;
  output?: unknown[];
  usage?: UsoResposta | null;
  incomplete_details?: { reason?: string | null } | null;
  [chave: string]: unknown;
};

type ObjetoJson = Record<string, unknown>;

function texto(valor: unknown, limite = 20000) {
  return String(valor || "").trim().slice(0, limite);
}

function objeto(valor: unknown): ObjetoJson {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as ObjetoJson)
    : {};
}

function normalizar(valor: unknown) {
  return texto(valor)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extrairTextoSaida(resposta: RespostaOpenAI) {
  if (typeof resposta.output_text === "string") {
    return resposta.output_text.trim();
  }

  if (!Array.isArray(resposta.output)) return "";

  const partes: string[] = [];

  for (const item of resposta.output) {
    const conteudos = objeto(item).content;
    if (!Array.isArray(conteudos)) continue;

    for (const conteudo of conteudos) {
      const bloco = objeto(conteudo);
      if (bloco.type === "output_text" && typeof bloco.text === "string") {
        partes.push(bloco.text);
      }
    }
  }

  return partes.join("").trim();
}

export function substituirTextoSaida(resposta: RespostaOpenAI, novoTexto: string) {
  resposta.output_text = novoTexto;

  if (!Array.isArray(resposta.output)) return;

  for (const item of resposta.output) {
    const conteudos = objeto(item).content;
    if (!Array.isArray(conteudos)) continue;

    for (const conteudo of conteudos) {
      const bloco = objeto(conteudo);
      if (bloco.type === "output_text") bloco.text = novoTexto;
    }
  }
}

function extrairSecao(instrucao: string, inicio: RegExp, fim: RegExp) {
  const encontrado = inicio.exec(instrucao);
  if (!encontrado) return "";

  const restante = instrucao.slice(encontrado.index + encontrado[0].length);
  const final = fim.exec(restante);
  return final ? restante.slice(0, final.index) : restante;
}

function limparItemLista(valor: string) {
  return valor
    .replace(/^[-*•]+\s*/, "")
    .replace(/^\d+[.)-]\s*/, "")
    .trim();
}

function extrairOpcoesDaSecao(
  instrucao: string,
  inicio: RegExp,
  fim: RegExp
) {
  const secao = extrairSecao(instrucao, inicio, fim);
  const partes = secao.split(/BOT[ÕO]ES?\s*:?/i);
  if (partes.length < 2) return [];

  return partes
    .slice(1)
    .join("\n")
    .split(/\r?\n/)
    .map(limparItemLista)
    .filter(
      (linha) =>
        linha.length >= 2 &&
        linha.length <= 80 &&
        !/[.!?]$/.test(linha) &&
        !/^(mensagem|como podemos ajudar)/i.test(linha)
    );
}

function extrairOpcoesMenuPrincipal(instrucao: string) {
  return extrairOpcoesDaSecao(
    instrucao,
    /MENU\s+PRINCIPAL/i,
    /PARA\s+CADA\s+PROCEDIMENTO|VALORES|ANTES\s+E\s+DEPOIS/i
  );
}

function extrairOpcoesProcedimento(instrucao: string) {
  return extrairOpcoesDaSecao(
    instrucao,
    /PARA\s+CADA\s+PROCEDIMENTO/i,
    /VALORES|ANTES\s+E\s+DEPOIS|D[ÚU]VIDAS\s+FREQUENTES/i
  );
}

function extrairServicos(instrucao: string) {
  const secao = extrairSecao(
    instrucao,
    /SERVI[ÇC]OS/i,
    /OBJETIVO|MENU\s+PRINCIPAL/i
  );

  return secao
    .split(/\r?\n/)
    .map(limparItemLista)
    .filter(
      (linha) =>
        linha.length >= 3 &&
        linha.length <= 100 &&
        !/^[-–—]+$/.test(linha)
    );
}

const PALAVRAS_IGNORADAS = new Set([
  "para",
  "com",
  "uma",
  "das",
  "dos",
  "facial",
  "tratamento",
  "aplicacao",
  "avaliacao",
]);

function palavrasRelevantes(valor: string) {
  return normalizar(valor)
    .split(" ")
    .filter(
      (palavra) => palavra.length >= 3 && !PALAVRAS_IGNORADAS.has(palavra)
    );
}

function textoCombina(alvo: unknown, esperado: string) {
  const normalizado = normalizar(alvo);
  const palavras = palavrasRelevantes(esperado);
  return palavras.some((palavra) => normalizado.includes(palavra));
}

function opcoesEtapa(etapa: ObjetoJson) {
  return Array.isArray(etapa.opcoes)
    ? etapa.opcoes.map((opcao) => objeto(opcao))
    : [];
}

function encontrarMenuPrincipal(
  etapas: ObjetoJson[],
  opcoesEsperadas: string[]
) {
  const candidatas = etapas.filter((etapa) =>
    ["pergunta_opcoes", "pergunta_botoes"].includes(String(etapa.tipo || ""))
  );

  return candidatas.sort((a, b) => {
    const pontuar = (etapa: ObjetoJson) =>
      opcoesEsperadas.filter((esperada) =>
        opcoesEtapa(etapa).some((opcao) =>
          textoCombina(opcao.texto || opcao.id, esperada)
        )
      ).length;

    return pontuar(b) - pontuar(a);
  })[0];
}

function encontrarMenuProcedimento(
  etapas: ObjetoJson[],
  servico: string,
  opcoesEsperadas: string[]
) {
  const candidatas = etapas.filter((etapa) =>
    ["pergunta_opcoes", "pergunta_botoes"].includes(String(etapa.tipo || ""))
  );

  return candidatas.sort((a, b) => {
    const pontuar = (etapa: ObjetoJson) => {
      const identificacao = `${texto(etapa.titulo, 200)} ${texto(etapa.mensagem, 500)}`;
      const pontosServico = textoCombina(identificacao, servico) ? 10 : 0;
      const pontosOpcoes = opcoesEsperadas.filter((esperada) =>
        opcoesEtapa(etapa).some((opcao) =>
          textoCombina(opcao.texto || opcao.id, esperada)
        )
      ).length;
      return pontosServico + pontosOpcoes;
    };

    return pontuar(b) - pontuar(a);
  })[0];
}

export function validarQualidadePlano(
  resposta: RespostaOpenAI | null,
  contexto: ContextoAssistenteFluxos | undefined
) {
  const problemas: string[] = [];

  if (!resposta) {
    return { valido: false, problemas: ["A resposta nao possui JSON legivel."] };
  }

  if (resposta.status && resposta.status !== "completed") {
    problemas.push(
      `A resposta terminou com status ${texto(resposta.status, 80)}.`
    );
  }

  if (resposta.incomplete_details?.reason) {
    problemas.push(
      `A resposta ficou incompleta: ${texto(resposta.incomplete_details.reason, 120)}.`
    );
  }

  const textoSaida = extrairTextoSaida(resposta);
  let plano: ObjetoJson;

  try {
    plano = objeto(JSON.parse(textoSaida));
  } catch {
    return {
      valido: false,
      problemas: [...problemas, "O JSON foi interrompido ou ficou invalido."],
    };
  }

  const etapas = Array.isArray(plano.etapas)
    ? plano.etapas.map((etapa) => objeto(etapa))
    : [];
  const rotas = Array.isArray(plano.rotas)
    ? plano.rotas.map((rota) => objeto(rota))
    : [];

  for (const etapa of etapas) {
    if (etapa.tipo === "pergunta_botoes" && opcoesEtapa(etapa).length > 3) {
      problemas.push(
        `O bloco "${texto(etapa.titulo, 120) || texto(etapa.ref, 120)}" excede 3 botoes e deve ser pergunta_opcoes.`
      );
    }
  }

  const semprePorOrigem = new Map<string, number>();

  for (const rota of rotas) {
    if (normalizar(rota.condicao) !== "sempre") continue;
    const origem = texto(rota.origem, 160);
    semprePorOrigem.set(origem, (semprePorOrigem.get(origem) || 0) + 1);
  }

  for (const [origem, total] of semprePorOrigem.entries()) {
    if (total > 1) {
      problemas.push(
        `A etapa "${origem}" possui ${total} rotas "sempre"; mantenha somente uma.`
      );
    }
  }

  if (contexto?.modo !== "criar_fluxo") {
    return {
      valido: problemas.length === 0,
      problemas: [...new Set(problemas)].slice(0, 20),
    };
  }

  const instrucao = contexto.instrucaoCompleta;
  const opcoesMenu = extrairOpcoesMenuPrincipal(instrucao);

  if (opcoesMenu.length > 0) {
    const menu = encontrarMenuPrincipal(etapas, opcoesMenu);

    if (!menu) {
      problemas.push("O menu principal solicitado nao foi criado.");
    } else {
      const opcoesCriadas = opcoesEtapa(menu);
      const ausentes = opcoesMenu.filter(
        (esperada) =>
          !opcoesCriadas.some((opcao) =>
            textoCombina(opcao.texto || opcao.id, esperada)
          )
      );

      if (ausentes.length > 0) {
        problemas.push(
          `O menu principal omitiu estas opcoes: ${ausentes.join(", ")}.`
        );
      }

      if (opcoesMenu.length > 3 && menu.tipo !== "pergunta_opcoes") {
        problemas.push(
          "O menu principal possui mais de 3 opcoes e deve usar pergunta_opcoes."
        );
      }
    }
  }

  const instrucaoNormalizada = normalizar(instrucao);

  if (
    instrucaoNormalizada.includes("antes e depois") &&
    !etapas.some((etapa) => etapa.tipo === "midia_imagem")
  ) {
    problemas.push(
      "O pedido de antes e depois exige pelo menos um bloco midia_imagem para confirmar a imagem com o usuario."
    );
  }

  if (/\b(agendar|agendamento|marcar horario|agenda)\b/.test(instrucaoNormalizada)) {
    if (!etapas.some((etapa) => etapa.tipo === "agenda_escolher_horario")) {
      problemas.push(
        "O caminho de agendamento precisa do bloco agenda_escolher_horario."
      );
    }

    if (!etapas.some((etapa) => etapa.tipo === "agenda_criar_agendamento")) {
      problemas.push(
        "O caminho de agendamento precisa do bloco agenda_criar_agendamento."
      );
    }
  }

  if (
    instrucaoNormalizada.includes("abrir localizacao") &&
    !etapas.some((etapa) => etapa.tipo === "redirect")
  ) {
    problemas.push(
      "A opcao Abrir Localizacao precisa de um bloco redirect com o link do mapa."
    );
  }

  if (
    /falar com especialista|falar com atendente|direcionado para um especialista/.test(
      instrucaoNormalizada
    ) &&
    !etapas.some((etapa) => etapa.tipo === "transferir")
  ) {
    problemas.push(
      "O pedido de atendimento humano precisa de uma etapa transferir."
    );
  }

  const servicos = extrairServicos(instrucao);
  const exigeDetalhes =
    instrucaoNormalizada.includes("para cada procedimento") &&
    instrucaoNormalizada.includes("beneficios") &&
    instrucaoNormalizada.includes("cuidados");

  if (exigeDetalhes && servicos.length > 0) {
    for (const servico of servicos) {
      const mensagens = etapas.filter(
        (etapa) =>
          etapa.tipo === "mensagem" &&
          textoCombina(
            `${texto(etapa.titulo, 200)} ${texto(etapa.mensagem, 1800)}`,
            servico
          )
      );

      if (mensagens.length < 3) {
        problemas.push(
          `O procedimento "${servico}" precisa de pelo menos 3 blocos de mensagem para explicacao, beneficios/indicacoes e cuidados/resultados.`
        );
      }
    }

    const opcoesProcedimento = extrairOpcoesProcedimento(instrucao);

    if (opcoesProcedimento.length > 0) {
      for (const servico of servicos) {
        const menuProcedimento = encontrarMenuProcedimento(
          etapas,
          servico,
          opcoesProcedimento
        );

        if (!menuProcedimento) {
          problemas.push(
            `O procedimento "${servico}" precisa de um menu de navegacao.`
          );
          continue;
        }

        const opcoesCriadas = opcoesEtapa(menuProcedimento);
        const ausentes = opcoesProcedimento.filter(
          (esperada) =>
            !opcoesCriadas.some((opcao) =>
              textoCombina(opcao.texto || opcao.id, esperada)
            )
        );

        if (ausentes.length > 0) {
          problemas.push(
            `O menu do procedimento "${servico}" omitiu: ${ausentes.join(", ")}.`
          );
        }

        if (
          opcoesProcedimento.length > 3 &&
          menuProcedimento.tipo !== "pergunta_opcoes"
        ) {
          problemas.push(
            `O menu do procedimento "${servico}" possui mais de 3 opcoes e deve usar pergunta_opcoes.`
          );
        }
      }
    }

    const menusFaq = etapas.filter((etapa) => {
      if (!["pergunta_opcoes", "pergunta_botoes"].includes(String(etapa.tipo || ""))) {
        return false;
      }

      const conteudo = `${texto(etapa.titulo)} ${texto(etapa.mensagem)} ${opcoesEtapa(etapa)
        .map((opcao) => texto(opcao.texto || opcao.id))
        .join(" ")}`;

      return /duvida|frequente|doi|quanto tempo|resultado|sessoes/.test(
        normalizar(conteudo)
      );
    });

    if (menusFaq.length < servicos.length) {
      problemas.push(
        "Crie um menu navegavel de duvidas frequentes para cada procedimento, com respostas em blocos separados."
      );
    }
  }

  return {
    valido: problemas.length === 0,
    problemas: [...new Set(problemas)].slice(0, 20),
  };
}

function numeroUso(valor: unknown) {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : 0;
}

export function somarUsoRespostas(
  primeira: RespostaOpenAI,
  segunda: RespostaOpenAI
) {
  const usoPrimeira = primeira.usage || {};
  const usoSegunda = segunda.usage || {};

  segunda.usage = {
    ...usoSegunda,
    input_tokens:
      numeroUso(usoPrimeira.input_tokens) + numeroUso(usoSegunda.input_tokens),
    output_tokens:
      numeroUso(usoPrimeira.output_tokens) +
      numeroUso(usoSegunda.output_tokens),
    total_tokens:
      numeroUso(usoPrimeira.total_tokens) + numeroUso(usoSegunda.total_tokens),
  };

  return segunda;
}
