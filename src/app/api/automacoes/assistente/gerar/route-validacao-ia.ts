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

function normalizarRef(valor: unknown) {
  return normalizar(valor)
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
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
  const marcador = /^\s*(?:depois\s+adicionar\s+os\s+)?bot[õo]es?\s*:?\s*$/im.exec(
    secao
  );

  if (!marcador) return [];

  return secao
    .slice(marcador.index + marcador[0].length)
    .split(/\r?\n/)
    .map(limparItemLista)
    .filter(
      (linha) =>
        linha.length >= 2 &&
        linha.length <= 80 &&
        !/^[-–—]+$/.test(linha) &&
        !/[.!?]$/.test(linha) &&
        !/^(mensagem|como podemos ajudar)/i.test(linha)
    );
}

function extrairOpcoesMenuPrincipal(instrucao: string) {
  return extrairOpcoesDaSecao(
    instrucao,
    /^\s*MENU\s+PRINCIPAL\s*$/im,
    /^\s*PARA\s+CADA\s+PROCEDIMENTO\s*$/im
  );
}

function extrairOpcoesProcedimento(instrucao: string) {
  return extrairOpcoesDaSecao(
    instrucao,
    /^\s*PARA\s+CADA\s+PROCEDIMENTO\s*$/im,
    /^\s*VALORES\s*$/im
  );
}

function extrairServicos(instrucao: string) {
  const secao = extrairSecao(
    instrucao,
    /^\s*SERVI[ÇC]OS\s*$/im,
    /^\s*OBJETIVO\s*$/im
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
  return palavras.length > 0 && palavras.some((palavra) => normalizado.includes(palavra));
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
  const classificadas = etapas
    .filter((etapa) =>
      ["pergunta_opcoes", "pergunta_botoes"].includes(String(etapa.tipo || ""))
    )
    .map((etapa) => ({
      etapa,
      pontos: opcoesEsperadas.filter((esperada) =>
        opcoesEtapa(etapa).some((opcao) =>
          textoCombina(opcao.texto || opcao.id, esperada)
        )
      ).length,
    }))
    .sort((a, b) => b.pontos - a.pontos);

  return classificadas[0]?.pontos > 0 ? classificadas[0].etapa : null;
}

function encontrarMenuProcedimento(
  etapas: ObjetoJson[],
  servico: string,
  opcoesEsperadas: string[]
) {
  const classificadas = etapas
    .filter((etapa) =>
      ["pergunta_opcoes", "pergunta_botoes"].includes(String(etapa.tipo || ""))
    )
    .map((etapa) => {
      const identificacao = `${texto(etapa.titulo, 200)} ${texto(etapa.mensagem, 500)}`;
      const identificaServico = textoCombina(identificacao, servico);
      const pontosOpcoes = opcoesEsperadas.filter((esperada) =>
        opcoesEtapa(etapa).some((opcao) =>
          textoCombina(opcao.texto || opcao.id, esperada)
        )
      ).length;

      return {
        etapa,
        identificaServico,
        pontos: (identificaServico ? 10 : 0) + pontosOpcoes,
      };
    })
    .sort((a, b) => b.pontos - a.pontos);

  const melhor = classificadas[0];
  if (!melhor) return null;
  if (melhor.identificaServico) return melhor.etapa;
  return melhor.pontos >= Math.min(3, opcoesEsperadas.length) ? melhor.etapa : null;
}

function criarRefUnica(base: string, refs: Set<string>) {
  const prefixo = normalizarRef(base) || "etapa";
  let ref = prefixo;
  let indice = 2;

  while (refs.has(ref)) {
    ref = `${prefixo}_${indice}`;
    indice += 1;
  }

  refs.add(ref);
  return ref;
}

function dividirMensagemDetalhes(mensagem: string, servico: string) {
  const fragmentos = texto(mensagem, 6000)
    .replace(/\s*[•▪◦]\s*/g, "\n")
    .replace(/([.!?])\s+(?=[A-ZÀ-Ý0-9])/g, "$1\n")
    .split(/\r?\n+/)
    .map((parte) => parte.trim().replace(/^[-–—]+\s*/, ""))
    .filter((parte) => parte.length >= 3);

  if (fragmentos.length >= 3) {
    const grupos: string[][] = [[], [], []];

    fragmentos.forEach((fragmento, indice) => {
      const grupo = Math.min(
        2,
        Math.floor((indice * 3) / Math.max(1, fragmentos.length))
      );
      grupos[grupo].push(fragmento);
    });

    const titulos = [
      `✨ ${servico} — Visão geral`,
      `🤍 ${servico} — Benefícios e indicações`,
      `🩺 ${servico} — Cuidados e resultados`,
    ];

    return grupos.map((grupo, indice) =>
      grupo.length > 0
        ? `${titulos[indice]}\n${grupo.map((item) => `• ${item}`).join("\n")}`
        : titulos[indice]
    );
  }

  return [
    mensagem,
    `🤍 ${servico} — Benefícios e indicações\n• O protocolo é definido após uma avaliação individual.\n• A indicação considera os objetivos e as características de cada paciente.`,
    `🩺 ${servico} — Cuidados e resultados\n• Duração, recuperação e resultados variam conforme o protocolo e a resposta individual.\n• A especialista orientará todos os cuidados antes e depois do procedimento.`,
  ];
}

function expandirDetalhesProcedimentos(
  plano: ObjetoJson,
  instrucao: string
) {
  const instrucaoNormalizada = normalizar(instrucao);
  const exigeDetalhes =
    instrucaoNormalizada.includes("para cada procedimento") &&
    instrucaoNormalizada.includes("beneficios") &&
    instrucaoNormalizada.includes("cuidados");

  if (!exigeDetalhes) return false;

  const etapas = Array.isArray(plano.etapas)
    ? plano.etapas.map((etapa) => objeto(etapa))
    : [];
  let rotas = Array.isArray(plano.rotas)
    ? plano.rotas.map((rota) => objeto(rota))
    : [];
  const refs = new Set(etapas.map((etapa) => texto(etapa.ref, 160)).filter(Boolean));
  let alterado = false;

  for (const servico of extrairServicos(instrucao)) {
    const mensagens = etapas.filter(
      (etapa) =>
        etapa.tipo === "mensagem" &&
        textoCombina(
          `${texto(etapa.titulo, 200)} ${texto(etapa.mensagem, 1800)}`,
          servico
        )
    );

    if (mensagens.length >= 3) continue;

    const base =
      mensagens.find(
        (etapa) =>
          !/duvida|faq|frequente|resposta/i.test(
            `${texto(etapa.titulo)} ${texto(etapa.mensagem)}`
          )
      ) || mensagens[0];

    if (!base) continue;

    const baseRef = texto(base.ref, 160);
    if (!baseRef) continue;

    const partes = dividirMensagemDetalhes(texto(base.mensagem, 6000), servico);
    const faltantes = Math.max(0, 3 - mensagens.length);
    if (faltantes === 0) continue;

    if (mensagens.length === 1) {
      base.titulo = `${servico} — Visão geral`;
      base.mensagem = partes[0];
    }

    const novasEtapas: ObjetoJson[] = [];

    for (let indice = 0; indice < faltantes; indice += 1) {
      const parteIndice = Math.min(2, 3 - faltantes + indice);
      const ref = criarRefUnica(
        `${baseRef}_${parteIndice === 1 ? "beneficios" : "cuidados"}`,
        refs
      );

      novasEtapas.push({
        ...base,
        ref,
        tipo: "mensagem",
        titulo:
          parteIndice === 1
            ? `${servico} — Benefícios e indicações`
            : `${servico} — Cuidados e resultados`,
        mensagem: partes[parteIndice],
        opcoes: [],
      });
    }

    if (novasEtapas.length === 0) continue;

    const saidasOriginais = rotas.filter(
      (rota) => texto(rota.origem, 160) === baseRef
    );
    rotas = rotas.filter((rota) => texto(rota.origem, 160) !== baseRef);

    let origemAtual = baseRef;

    for (const novaEtapa of novasEtapas) {
      const destino = texto(novaEtapa.ref, 160);
      rotas.push({
        origem: origemAtual,
        destino,
        condicao: "sempre",
        valor: null,
        rotulo: "Continuar",
        descricao_ia: null,
        timeout_segundos: null,
      });
      origemAtual = destino;
      etapas.push(novaEtapa);
    }

    for (const saida of saidasOriginais) {
      rotas.push({ ...saida, origem: origemAtual });
    }

    alterado = true;
  }

  if (alterado) {
    plano.etapas = etapas;
    plano.rotas = rotas;
  }

  return alterado;
}

function normalizarEstruturaPlano(plano: ObjetoJson, instrucao: string) {
  const etapas = Array.isArray(plano.etapas)
    ? plano.etapas.map((etapa) => objeto(etapa))
    : [];
  let rotas = Array.isArray(plano.rotas)
    ? plano.rotas.map((rota) => objeto(rota))
    : [];
  let alterado = false;

  for (const etapa of etapas) {
    if (etapa.tipo === "pergunta_botoes" && opcoesEtapa(etapa).length > 3) {
      etapa.tipo = "pergunta_opcoes";
      alterado = true;
    }
  }

  const sempreVistos = new Set<string>();
  const rotasNormalizadas = rotas.filter((rota) => {
    if (normalizar(rota.condicao) !== "sempre") return true;

    const origem = texto(rota.origem, 160);
    if (!origem || !sempreVistos.has(origem)) {
      if (origem) sempreVistos.add(origem);
      return true;
    }

    alterado = true;
    return false;
  });

  rotas = rotasNormalizadas;
  plano.etapas = etapas;
  plano.rotas = rotas;

  if (expandirDetalhesProcedimentos(plano, instrucao)) {
    alterado = true;
  }

  if (alterado) {
    const avisos = Array.isArray(plano.avisos)
      ? plano.avisos.map((aviso) => texto(aviso, 500)).filter(Boolean)
      : [];

    plano.avisos = [
      ...avisos,
      "A estrutura foi normalizada automaticamente para respeitar limites de menus, conexoes lineares e detalhamento dos procedimentos.",
    ];
  }

  return alterado;
}

export function repararRespostaPlano(
  resposta: RespostaOpenAI,
  contexto: ContextoAssistenteFluxos | undefined
) {
  const textoSaida = extrairTextoSaida(resposta);
  if (!textoSaida) return resposta;

  try {
    const plano = objeto(JSON.parse(textoSaida));
    const alterado = normalizarEstruturaPlano(
      plano,
      contexto?.instrucaoCompleta || ""
    );

    if (alterado) {
      substituirTextoSaida(resposta, JSON.stringify(plano));
    }
  } catch {
    // A validacao posterior continua responsavel por relatar JSON interrompido.
  }

  return resposta;
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

  const refsEtapas = new Set(
    etapas.map((etapa) => texto(etapa.ref, 160)).filter(Boolean)
  );
  const refsDuplicadas = etapas
    .map((etapa) => texto(etapa.ref, 160))
    .filter((ref, indice, todas) => ref && todas.indexOf(ref) !== indice);

  if (refsDuplicadas.length > 0) {
    problemas.push(
      `Existem etapas com referencias duplicadas: ${[...new Set(refsDuplicadas)].join(", ")}.`
    );
  }

  for (const rota of rotas) {
    const origem = texto(rota.origem, 160);
    const destino = texto(rota.destino, 160);

    if (!refsEtapas.has(origem) || !refsEtapas.has(destino)) {
      problemas.push(
        `A rota ${origem || "sem origem"} -> ${destino || "sem destino"} referencia um bloco inexistente.`
      );
    }
  }

  const inicio = etapas.find((etapa) => etapa.tipo === "inicio");

  if (!inicio) {
    problemas.push("O fluxo precisa de um bloco Inicio.");
  } else {
    const alcancaveis = new Set<string>();
    const pendentes = [texto(inicio.ref, 160)];

    while (pendentes.length > 0) {
      const atual = pendentes.shift();
      if (!atual || alcancaveis.has(atual)) continue;
      alcancaveis.add(atual);

      for (const rota of rotas) {
        if (texto(rota.origem, 160) !== atual) continue;
        const destino = texto(rota.destino, 160);
        if (destino && refsEtapas.has(destino) && !alcancaveis.has(destino)) {
          pendentes.push(destino);
        }
      }
    }

    for (const etapa of etapas) {
      const ref = texto(etapa.ref, 160);
      if (ref && !alcancaveis.has(ref)) {
        problemas.push(
          `O bloco "${texto(etapa.titulo, 120) || ref}" nao esta conectado ao fluxo.`
        );
      }
    }
  }

  for (const etapa of etapas) {
    if (
      !["pergunta_opcoes", "pergunta_botoes"].includes(String(etapa.tipo || ""))
    ) {
      continue;
    }

    const origem = texto(etapa.ref, 160);
    const rotasEtapa = rotas.filter(
      (rota) => texto(rota.origem, 160) === origem
    );

    for (const opcao of opcoesEtapa(etapa)) {
      const id = texto(opcao.id, 160);
      const titulo = texto(opcao.texto || opcao.titulo || opcao.id, 120);
      const idNormalizado = normalizarRef(id);
      const tituloNormalizado = normalizarRef(titulo);
      const possuiRota = rotasEtapa.some((rota) => {
        const valor = normalizarRef(rota.valor);
        const rotulo = normalizarRef(rota.rotulo);
        return Boolean(
          (idNormalizado && (valor === idNormalizado || rotulo === idNormalizado)) ||
            (tituloNormalizado &&
              (valor === tituloNormalizado || rotulo === tituloNormalizado))
        );
      });

      if (!possuiRota) {
        problemas.push(
          `A opcao "${titulo || id || "sem titulo"}" do bloco "${texto(etapa.titulo, 120) || origem}" precisa ter uma rota.`
        );
      }
    }
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
      if (
        !["pergunta_opcoes", "pergunta_botoes"].includes(
          String(etapa.tipo || "")
        )
      ) {
        return false;
      }

      const conteudo = `${texto(etapa.titulo)} ${texto(etapa.mensagem)} ${opcoesEtapa(
        etapa
      )
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
