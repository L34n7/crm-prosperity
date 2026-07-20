import { randomUUID } from "crypto";

export type ModoAssistenteFluxos =
  | "criar_fluxo"
  | "adicionar_etapa"
  | "melhorar_mensagens"
  | "analisar_fluxo";

export type AssistenteAutomacaoNo = {
  id: string;
  tipo_no: string;
  titulo: string;
  descricao: string | null;
  posicao_x: number;
  posicao_y: number;
  configuracao_json: Record<string, unknown>;
  delay_segundos: number | null;
};

export type AssistenteAutomacaoConexao = {
  id: string;
  no_origem_id: string;
  no_destino_id: string;
  rotulo: string | null;
  ordem: number;
  condicao_json: Record<string, unknown>;
  usar_ia?: boolean;
  descricao_ia?: string | null;
};

export type AssistenteSetor = {
  id: string;
  nome: string;
};

export type AssistenteVariavel = {
  chave: string;
  descricao?: string | null;
  origem?: string | null;
};

export type PlanoAssistenteOpcao = {
  id: string;
  texto: string;
};

export type PlanoAssistenteEtapa = {
  ref: string;
  tipo: string;
  titulo: string | null;
  mensagem: string | null;
  variavel: string | null;
  tipo_captura: string | null;
  setor_id: string | null;
  setor_nome: string | null;
  resultado: string | null;
  opcoes: PlanoAssistenteOpcao[];
};

export type PlanoAssistenteRota = {
  origem: string;
  destino: string;
  condicao: string;
  valor: string | null;
  rotulo: string | null;
  descricao_ia: string | null;
  timeout_segundos: number | null;
};

export type PlanoAssistenteMensagemRevisada = {
  ref: string;
  mensagem: string;
  motivo: string | null;
};

export type PlanoAssistenteVariavelSugerida = {
  chave: string;
  descricao: string | null;
};

export type PlanoAssistenteFluxos = {
  nome_fluxo: string;
  objetivo: string;
  resumo: string;
  etapas: PlanoAssistenteEtapa[];
  rotas: PlanoAssistenteRota[];
  mensagens_revisadas: PlanoAssistenteMensagemRevisada[];
  variaveis_sugeridas: PlanoAssistenteVariavelSugerida[];
  avisos: string[];
};

export type ValidacaoItemAssistente = {
  codigo: string;
  mensagem: string;
  no_id?: string;
  conexao_id?: string;
};

export type ValidacaoAssistenteFluxos = {
  valido: boolean;
  erros: ValidacaoItemAssistente[];
  avisos: ValidacaoItemAssistente[];
};

export type ResultadoCompilacaoAssistente = {
  nos: AssistenteAutomacaoNo[];
  conexoes: AssistenteAutomacaoConexao[];
  resumo: string;
  variaveis_sugeridas: PlanoAssistenteVariavelSugerida[];
  validacao: ValidacaoAssistenteFluxos;
  estatisticas: {
    blocos: number;
    conexoes: number;
    variaveis_sugeridas: number;
    blocos_criados: number;
    mensagens_revisadas: number;
  };
};

const ESPACO_HORIZONTAL = 360;
const ESPACO_VERTICAL = 180;
const LIMITE_DELAY_SEGUNDOS = 23 * 60 * 60;

const TIPOS_ETAPA_PERMITIDOS = new Set([
  "inicio",
  "mensagem",
  "pergunta_opcoes",
  "pergunta_botoes",
  "pergunta_livre_ia",
  "capturar_resposta",
  "transferir",
  "encerrar",
  "avaliacao",
]);

const VARIAVEIS_FIXAS = new Set([
  "nome",
  "nome_contato",
  "contato_nome",
  "nome_whatsapp",
  "whatsapp_nome",
  "telefone",
  "numero",
  "numero_contato",
  "email",
  "email_contato",
  "campanha",
  "status",
  "status_lead",
  "origem",
  "protocolo_atual",
  "ultimo_protocolo",
]);

function texto(valor: unknown, limite = 1200) {
  return String(valor || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limite);
}

function objeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
}

function normalizarComparacao(valor: unknown) {
  return texto(valor, 260)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizarRef(valor: unknown) {
  return normalizarComparacao(valor)
    .replace(/[^a-z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function normalizarChaveVariavel(valor: unknown) {
  return String(valor || "")
    .replace(/[{}]/g, "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function numeroInteiro(valor: unknown, fallback: number | null) {
  const numero = Number(valor);
  return Number.isFinite(numero) ? Math.floor(numero) : fallback;
}

function clamp(valor: number, minimo: number, maximo: number) {
  return Math.max(minimo, Math.min(maximo, valor));
}

function criarId() {
  return randomUUID();
}

function tituloPadraoTipoNo(tipoNo: string) {
  if (tipoNo === "inicio") return "Inicio";
  if (tipoNo === "enviar_texto") return "Mensagem";
  if (tipoNo === "pergunta_opcoes") return "Pergunta";
  if (tipoNo === "pergunta_livre_ia") return "Pergunta aberta IA";
  if (tipoNo === "enviar_botoes") return "Pergunta com botoes";
  if (tipoNo === "capturar_resposta") return "Capturar resposta";
  if (tipoNo === "transferir_setor") return "Transferir setor";
  if (tipoNo === "encerrar") return "Encerrar";
  if (tipoNo === "avaliacao") return "Avaliacao";
  return "Bloco";
}

function tipoNoPorEtapa(tipo: string) {
  if (tipo === "inicio") return "inicio";
  if (tipo === "mensagem") return "enviar_texto";
  if (tipo === "pergunta_opcoes") return "pergunta_opcoes";
  if (tipo === "pergunta_botoes") return "enviar_botoes";
  if (tipo === "pergunta_livre_ia") return "pergunta_livre_ia";
  if (tipo === "capturar_resposta") return "capturar_resposta";
  if (tipo === "transferir") return "transferir_setor";
  if (tipo === "encerrar") return "encerrar";
  if (tipo === "avaliacao") return "avaliacao";
  return "enviar_texto";
}

function tipoNoEsperaResposta(tipoNo: string) {
  return [
    "pergunta_opcoes",
    "pergunta_livre_ia",
    "enviar_botoes",
    "capturar_resposta",
    "avaliacao",
  ].includes(tipoNo);
}

function baseTentativas() {
  return {
    max_tentativas_invalidas: 3,
    max_tentativas_sem_resposta: 3,
    acao_excesso_tentativas: "transferir_atendimento",
    setor_excesso_tentativas: null,
    mensagem_excesso_tentativas:
      "Nao consegui continuar o atendimento automatico. Vou te encaminhar para um atendente.",
    notificar_excesso_tentativas: true,
    notificar_email_excesso_tentativas: true,
  };
}

function normalizarOpcoes(
  etapa: PlanoAssistenteEtapa,
  limite: number
): PlanoAssistenteOpcao[] {
  const opcoes = Array.isArray(etapa.opcoes) ? etapa.opcoes : [];

  return opcoes
    .slice(0, limite)
    .map((opcao, index) => {
      const id =
        normalizarChaveVariavel(opcao.id) ||
        normalizarChaveVariavel(opcao.texto) ||
        `opcao_${index + 1}`;
      const titulo = texto(opcao.texto, 40) || `Opcao ${index + 1}`;

      return { id, texto: titulo };
    })
    .filter((opcao) => opcao.id && opcao.texto);
}

function buscarSetor(etapa: PlanoAssistenteEtapa, setores: AssistenteSetor[]) {
  const setorId = texto(etapa.setor_id, 120);
  const setorNome = normalizarComparacao(etapa.setor_nome);

  if (setorId) {
    const porId = setores.find((setor) => setor.id === setorId);
    if (porId) return porId;
  }

  if (setorNome) {
    const porNome = setores.find(
      (setor) => normalizarComparacao(setor.nome) === setorNome
    );
    if (porNome) return porNome;
  }

  return setores.length === 1 ? setores[0] : null;
}

function configuracaoPorEtapa(
  etapa: PlanoAssistenteEtapa,
  tipoNo: string,
  setores: AssistenteSetor[]
) {
  const mensagem = texto(etapa.mensagem, 1800);

  if (tipoNo === "inicio") {
    return {};
  }

  if (tipoNo === "enviar_texto") {
    return {
      mensagem: mensagem || "Ola! Vou te ajudar por aqui.",
      delay_segundos: 3,
    };
  }

  if (tipoNo === "pergunta_opcoes") {
    const opcoes = normalizarOpcoes(etapa, 10);

    return {
      mensagem: mensagem || "Escolha uma opcao:",
      delay_segundos: 3,
      opcoes:
        opcoes.length > 0
          ? opcoes.map((opcao) => ({
              valor: opcao.id,
              titulo: opcao.texto,
            }))
          : [
              { valor: "opcao_1", titulo: "Opcao 1" },
              { valor: "opcao_2", titulo: "Opcao 2" },
            ],
      ...baseTentativas(),
    };
  }

  if (tipoNo === "enviar_botoes") {
    const opcoes = normalizarOpcoes(etapa, 3);

    return {
      mensagem: mensagem || "Escolha uma opcao:",
      delay_segundos: 3,
      botoes:
        opcoes.length > 0
          ? opcoes.map((opcao) => ({
              id: opcao.id,
              titulo: opcao.texto,
            }))
          : [
              { id: "sim", titulo: "Sim" },
              { id: "nao", titulo: "Nao" },
            ],
      ...baseTentativas(),
    };
  }

  if (tipoNo === "pergunta_livre_ia") {
    return {
      mensagem: mensagem || "Como posso te ajudar?",
      delay_segundos: 3,
      ...baseTentativas(),
    };
  }

  if (tipoNo === "capturar_resposta") {
    const variavel = normalizarChaveVariavel(etapa.variavel) || "resposta";
    const tipoCaptura =
      normalizarChaveVariavel(etapa.tipo_captura) || "texto";

    return {
      mensagem: mensagem || "Me informe essa informacao, por favor.",
      variavel,
      tipo_captura: tipoCaptura,
      obrigatorio: true,
      mensagem_erro:
        "Nao consegui identificar essa informacao. Por favor, envie novamente.",
      max_tentativas: 3,
      ...baseTentativas(),
    };
  }

  if (tipoNo === "transferir_setor") {
    const setor = buscarSetor(etapa, setores);

    return {
      mensagem: mensagem || "Vou te encaminhar para um atendente.",
      setor_id: setor?.id || "",
    };
  }

  if (tipoNo === "encerrar") {
    const resultado = ["positivo", "negativo", "neutro"].includes(
      String(etapa.resultado || "")
    )
      ? String(etapa.resultado)
      : "positivo";

    return {
      mensagem,
      resultado_fluxo: resultado,
      valor_conversao_tipo: "sem_valor",
    };
  }

  if (tipoNo === "avaliacao") {
    return {
      mensagem: mensagem || "De 1 a 5, como voce avalia este atendimento?",
      nota_minima: 1,
      nota_maxima: 5,
      solicitar_comentario: false,
      mensagem_comentario:
        "Obrigado! Agora escreva um comentario sobre seu atendimento.",
      mensagem_erro: "Por favor, responda com uma nota de 1 a 5.",
      ...baseTentativas(),
    };
  }

  return { mensagem };
}

function normalizarEtapa(valor: unknown): PlanoAssistenteEtapa | null {
  const item = objeto(valor);
  const tipo = texto(item.tipo, 80);

  if (!TIPOS_ETAPA_PERMITIDOS.has(tipo)) return null;

  const opcoes = Array.isArray(item.opcoes)
    ? item.opcoes.map((opcaoRaw) => {
        const opcao = objeto(opcaoRaw);
        return {
          id: texto(opcao.id, 80),
          texto: texto(opcao.texto, 80),
        };
      })
    : [];

  return {
    ref: normalizarRef(item.ref) || `etapa_${criarId()}`,
    tipo,
    titulo: texto(item.titulo, 120) || null,
    mensagem: texto(item.mensagem, 1800) || null,
    variavel: normalizarChaveVariavel(item.variavel) || null,
    tipo_captura: normalizarChaveVariavel(item.tipo_captura) || null,
    setor_id: texto(item.setor_id, 120) || null,
    setor_nome: texto(item.setor_nome, 120) || null,
    resultado: texto(item.resultado, 40) || null,
    opcoes,
  };
}

function normalizarRota(valor: unknown): PlanoAssistenteRota | null {
  const item = objeto(valor);
  const origem = normalizarRef(item.origem);
  const destino = normalizarRef(item.destino);

  if (!origem || !destino) return null;

  const timeout = numeroInteiro(item.timeout_segundos, null);

  return {
    origem,
    destino,
    condicao: texto(item.condicao, 80) || "sempre",
    valor: texto(item.valor, 160) || null,
    rotulo: texto(item.rotulo, 120) || null,
    descricao_ia: texto(item.descricao_ia, 500) || null,
    timeout_segundos: timeout,
  };
}

function normalizarMensagemRevisada(
  valor: unknown
): PlanoAssistenteMensagemRevisada | null {
  const item = objeto(valor);
  const ref = normalizarRef(item.ref);
  const mensagem = texto(item.mensagem, 1800);

  if (!ref || !mensagem) return null;

  return {
    ref,
    mensagem,
    motivo: texto(item.motivo, 300) || null,
  };
}

function normalizarVariavelSugerida(
  valor: unknown
): PlanoAssistenteVariavelSugerida | null {
  const item = objeto(valor);
  const chave = normalizarChaveVariavel(item.chave);

  if (!chave) return null;

  return {
    chave,
    descricao: texto(item.descricao, 280) || null,
  };
}

export function normalizarPlanoAssistente(
  valor: unknown
): PlanoAssistenteFluxos {
  const item = objeto(valor);
  const etapas = Array.isArray(item.etapas)
    ? item.etapas.map(normalizarEtapa).filter(Boolean)
    : [];
  const rotas = Array.isArray(item.rotas)
    ? item.rotas.map(normalizarRota).filter(Boolean)
    : [];
  const mensagensRevisadas = Array.isArray(item.mensagens_revisadas)
    ? item.mensagens_revisadas
        .map(normalizarMensagemRevisada)
        .filter(Boolean)
    : [];
  const variaveisSugeridas = Array.isArray(item.variaveis_sugeridas)
    ? item.variaveis_sugeridas
        .map(normalizarVariavelSugerida)
        .filter(Boolean)
    : [];

  return {
    nome_fluxo: texto(item.nome_fluxo, 120),
    objetivo: texto(item.objetivo, 500),
    resumo: texto(item.resumo, 1200),
    etapas: etapas as PlanoAssistenteEtapa[],
    rotas: rotas as PlanoAssistenteRota[],
    mensagens_revisadas:
      mensagensRevisadas as PlanoAssistenteMensagemRevisada[],
    variaveis_sugeridas:
      variaveisSugeridas as PlanoAssistenteVariavelSugerida[],
    avisos: Array.isArray(item.avisos)
      ? item.avisos.map((aviso) => texto(aviso, 300)).filter(Boolean)
      : [],
  };
}

function clonarNo(no: AssistenteAutomacaoNo): AssistenteAutomacaoNo {
  return {
    ...no,
    descricao: no.descricao || null,
    posicao_x: Math.round(Number(no.posicao_x || 0)),
    posicao_y: Math.round(Number(no.posicao_y || 0)),
    delay_segundos:
      no.tipo_no === "inicio"
        ? null
        : no.delay_segundos == null
          ? null
          : clamp(Number(no.delay_segundos || 0), 0, LIMITE_DELAY_SEGUNDOS),
    configuracao_json: objeto(no.configuracao_json),
  };
}

function clonarConexao(
  conexao: AssistenteAutomacaoConexao,
  ordem: number
): AssistenteAutomacaoConexao {
  return {
    id: conexao.id,
    no_origem_id: conexao.no_origem_id,
    no_destino_id: conexao.no_destino_id,
    rotulo: conexao.rotulo || null,
    ordem,
    condicao_json: objeto(conexao.condicao_json),
    usar_ia: conexao.usar_ia === true,
    descricao_ia: conexao.descricao_ia || null,
  };
}

function criarNo(
  etapa: PlanoAssistenteEtapa,
  setores: AssistenteSetor[]
): AssistenteAutomacaoNo {
  const tipoNo = tipoNoPorEtapa(etapa.tipo);

  return {
    id: criarId(),
    tipo_no: tipoNo,
    titulo: texto(etapa.titulo, 120) || tituloPadraoTipoNo(tipoNo),
    descricao: null,
    posicao_x: 0,
    posicao_y: 0,
    configuracao_json: configuracaoPorEtapa(etapa, tipoNo, setores),
    delay_segundos: tipoNo === "inicio" ? null : 3,
  };
}

function condicaoPorRota(rota: PlanoAssistenteRota, tipoOrigem: string) {
  const condicao = normalizarRef(rota.condicao);
  const valor = texto(rota.valor, 160);

  if (condicao === "timeout" || condicao === "timeout_sem_resposta") {
    const timeoutSegundos = clamp(
      numeroInteiro(rota.timeout_segundos, 5 * 60) || 5 * 60,
      5 * 60,
      LIMITE_DELAY_SEGUNDOS
    );

    return {
      condicao_json: {
        tipo: "timeout_sem_resposta",
        timeout_segundos: timeoutSegundos,
        tempo_quantidade: Math.max(1, Math.round(timeoutSegundos / 60)),
        tempo_unidade: "minutos",
        status_envio: "qualquer",
      },
      usar_ia: false,
    };
  }

  if (condicao === "ia" || condicao === "intencao_ia") {
    return {
      condicao_json: {
        tipo: "resposta_contem",
        ...(valor ? { valor } : {}),
      },
      usar_ia: true,
    };
  }

  if (
    condicao === "resposta_igual" ||
    condicao === "resposta_contem" ||
    condicao === "resposta_inicia_com" ||
    condicao === "resposta_regex"
  ) {
    return {
      condicao_json: {
        tipo: condicao,
        ...(valor ? { valor } : {}),
      },
      usar_ia: false,
    };
  }

  if (valor && tipoNoEsperaResposta(tipoOrigem)) {
    return {
      condicao_json: {
        tipo: "resposta_contem",
        valor,
      },
      usar_ia: false,
    };
  }

  return {
    condicao_json: {
      tipo: "sempre",
    },
    usar_ia: false,
  };
}

function criarConexao(
  rota: PlanoAssistenteRota,
  origem: AssistenteAutomacaoNo,
  destino: AssistenteAutomacaoNo,
  ordem: number
): AssistenteAutomacaoConexao {
  const { condicao_json: condicaoJson, usar_ia: usarIa } = condicaoPorRota(
    rota,
    origem.tipo_no
  );
  const sempre = condicaoJson.tipo === "sempre";
  const timeout = condicaoJson.tipo === "timeout_sem_resposta";
  const rotulo =
    rota.rotulo ||
    (sempre
      ? "Sempre seguir"
      : timeout
        ? "Sem resposta"
        : rota.valor || destino.titulo || "Condicao");

  return {
    id: criarId(),
    no_origem_id: origem.id,
    no_destino_id: destino.id,
    rotulo,
    ordem,
    condicao_json: condicaoJson,
    usar_ia: usarIa,
    descricao_ia:
      usarIa && rota.descricao_ia
        ? rota.descricao_ia
        : usarIa
          ? `Use esta conexao quando a intencao do cliente estiver relacionada a "${rotulo}".`
          : null,
  };
}

function adicionarRefsExistentes(
  refs: Map<string, string>,
  nos: AssistenteAutomacaoNo[]
) {
  for (const no of nos) {
    refs.set(normalizarRef(no.id), no.id);
    refs.set(normalizarRef(no.titulo), no.id);
  }
}

function resolverNoPorRef(
  ref: string,
  refs: Map<string, string>,
  nosPorId: Map<string, AssistenteAutomacaoNo>
) {
  const id = refs.get(normalizarRef(ref)) || ref;
  return nosPorId.get(id) || null;
}

function aplicarMensagensRevisadas(params: {
  plano: PlanoAssistenteFluxos;
  nos: AssistenteAutomacaoNo[];
}) {
  const refs = new Map<string, string>();
  adicionarRefsExistentes(refs, params.nos);

  let total = 0;
  const nos = params.nos.map((no) => {
    const revisao = params.plano.mensagens_revisadas.find(
      (item) => refs.get(item.ref) === no.id || item.ref === normalizarRef(no.id)
    );

    if (!revisao) return no;

    total += 1;

    const configuracao: Record<string, unknown> = {
      ...no.configuracao_json,
      mensagem: revisao.mensagem,
    };

    if (no.tipo_no === "agenda_buscar_agendamento") {
      configuracao.mensagem_encontrado = revisao.mensagem;
    }

    return {
      ...no,
      configuracao_json: configuracao,
    };
  });

  return { nos, total };
}

function ordenarConexoes(conexoes: AssistenteAutomacaoConexao[]) {
  return conexoes.map((conexao, index) => ({
    ...conexao,
    ordem: index + 1,
  }));
}

function chavePosicao(x: number, y: number) {
  return `${Math.round(x / 40)}:${Math.round(y / 40)}`;
}

function posicaoLivre(
  xInicial: number,
  yInicial: number,
  ocupadas: Set<string>
) {
  let x = xInicial;
  let y = yInicial;
  let tentativas = 0;

  while (ocupadas.has(chavePosicao(x, y)) && tentativas < 80) {
    y += ESPACO_VERTICAL;
    tentativas += 1;

    if (tentativas % 8 === 0) {
      x += ESPACO_HORIZONTAL;
      y = yInicial;
    }
  }

  ocupadas.add(chavePosicao(x, y));
  return { x, y };
}

function aplicarLayout(params: {
  nos: AssistenteAutomacaoNo[];
  conexoes: AssistenteAutomacaoConexao[];
  idsCriados: Set<string>;
  substituirTudo: boolean;
}) {
  const ocupadas = new Set<string>();
  const nosPorId = new Map(params.nos.map((no) => [no.id, no]));

  for (const no of params.nos) {
    if (!params.substituirTudo && !params.idsCriados.has(no.id)) {
      ocupadas.add(chavePosicao(no.posicao_x, no.posicao_y));
    }
  }

  if (params.substituirTudo) {
    const inicio =
      params.nos.find((no) => no.tipo_no === "inicio") || params.nos[0];
    const nivelPorId = new Map<string, number>();
    const fila: string[] = [];

    if (inicio) {
      nivelPorId.set(inicio.id, 0);
      fila.push(inicio.id);
    }

    while (fila.length > 0) {
      const id = fila.shift()!;
      const nivel = nivelPorId.get(id) || 0;

      for (const conexao of params.conexoes.filter(
        (item) => item.no_origem_id === id
      )) {
        if (nivelPorId.has(conexao.no_destino_id)) continue;

        nivelPorId.set(conexao.no_destino_id, nivel + 1);
        fila.push(conexao.no_destino_id);
      }
    }

    let nivelFallback = 0;

    for (const no of params.nos) {
      if (!nivelPorId.has(no.id)) {
        nivelFallback += 1;
        nivelPorId.set(no.id, nivelFallback);
      }
    }

    const grupos = new Map<number, AssistenteAutomacaoNo[]>();

    for (const no of params.nos) {
      const nivel = nivelPorId.get(no.id) || 0;
      grupos.set(nivel, [...(grupos.get(nivel) || []), no]);
    }

    for (const [nivel, nosNivel] of grupos.entries()) {
      const offset = ((nosNivel.length - 1) * ESPACO_VERTICAL) / 2;

      nosNivel.forEach((no, index) => {
        no.posicao_x = nivel * ESPACO_HORIZONTAL;
        no.posicao_y = Math.round(index * ESPACO_VERTICAL - offset);
        ocupadas.add(chavePosicao(no.posicao_x, no.posicao_y));
      });
    }

    return;
  }

  const maxX = params.nos.reduce(
    (maior, no) =>
      params.idsCriados.has(no.id) ? maior : Math.max(maior, no.posicao_x),
    0
  );
  const maxY = params.nos.reduce(
    (maior, no) =>
      params.idsCriados.has(no.id) ? maior : Math.max(maior, no.posicao_y),
    0
  );

  for (const no of params.nos.filter((item) => params.idsCriados.has(item.id))) {
    const entrada = params.conexoes.find(
      (conexao) => conexao.no_destino_id === no.id
    );
    const origem = entrada ? nosPorId.get(entrada.no_origem_id) : null;
    const baseX = origem ? origem.posicao_x + ESPACO_HORIZONTAL : maxX + ESPACO_HORIZONTAL;
    const baseY = origem ? origem.posicao_y : maxY + ESPACO_VERTICAL;
    const posicao = posicaoLivre(baseX, baseY, ocupadas);

    no.posicao_x = posicao.x;
    no.posicao_y = posicao.y;
  }
}

export function validarFluxoAssistente(params: {
  nos: AssistenteAutomacaoNo[];
  conexoes: AssistenteAutomacaoConexao[];
  setores?: AssistenteSetor[];
  variaveis?: AssistenteVariavel[];
}): ValidacaoAssistenteFluxos {
  const erros: ValidacaoItemAssistente[] = [];
  const avisos: ValidacaoItemAssistente[] = [];
  const nosPorId = new Map(params.nos.map((no) => [no.id, no]));
  const setoresIds = new Set((params.setores || []).map((setor) => setor.id));
  const variaveis = new Set(
    (params.variaveis || [])
      .map((variavel) => normalizarChaveVariavel(variavel.chave))
      .filter(Boolean)
  );

  const inicios = params.nos.filter((no) => no.tipo_no === "inicio");

  if (inicios.length !== 1) {
    erros.push({
      codigo: "INICIO_INVALIDO",
      mensagem: "O fluxo deve possuir exatamente um bloco de inicio.",
    });
  }

  const inicio = inicios[0];

  if (
    inicio &&
    !params.conexoes.some((conexao) => conexao.no_origem_id === inicio.id)
  ) {
    erros.push({
      codigo: "INICIO_SEM_CONEXAO",
      mensagem: "O bloco de inicio precisa estar conectado.",
      no_id: inicio.id,
    });
  }

  if (
    inicio &&
    params.conexoes.filter((conexao) => conexao.no_origem_id === inicio.id)
      .length > 1
  ) {
    erros.push({
      codigo: "INICIO_COM_MULTIPLAS_ROTAS",
      mensagem: "O bloco de inicio deve possuir apenas uma conexao de saida.",
      no_id: inicio.id,
    });
  }

  if (
    !params.nos.some((no) =>
      ["encerrar", "transferir_setor"].includes(no.tipo_no)
    )
  ) {
    erros.push({
      codigo: "SEM_ENCERRAMENTO",
      mensagem: "Adicione pelo menos um bloco de encerramento ou transferencia.",
    });
  }

  for (const conexao of params.conexoes) {
    if (!nosPorId.has(conexao.no_origem_id) || !nosPorId.has(conexao.no_destino_id)) {
      erros.push({
        codigo: "CONEXAO_COM_NO_AUSENTE",
        mensagem: "Existe uma conexao apontando para um bloco ausente.",
        conexao_id: conexao.id,
      });
    }
  }

  for (const no of params.nos) {
    const entradas = params.conexoes.filter(
      (conexao) => conexao.no_destino_id === no.id
    );
    const saidas = params.conexoes.filter(
      (conexao) => conexao.no_origem_id === no.id
    );
    const config = no.configuracao_json || {};

    if (no.tipo_no !== "inicio" && entradas.length === 0) {
      erros.push({
        codigo: "BLOCO_SEM_ENTRADA",
        mensagem: `O bloco "${no.titulo}" nao esta conectado ao fluxo.`,
        no_id: no.id,
      });
    }

    if (
      !["encerrar", "transferir_setor"].includes(no.tipo_no) &&
      saidas.length === 0
    ) {
      erros.push({
        codigo: "BLOCO_SEM_SAIDA",
        mensagem: `O bloco "${no.titulo}" nao possui conexao de saida.`,
        no_id: no.id,
      });
    }

    if (no.tipo_no === "enviar_texto" && !texto(config.mensagem)) {
      erros.push({
        codigo: "MENSAGEM_VAZIA",
        mensagem: `O bloco "${no.titulo}" precisa ter uma mensagem.`,
        no_id: no.id,
      });
    }

    if (no.tipo_no === "transferir_setor") {
      const setorId = texto(config.setor_id, 120);

      if (!setorId) {
        erros.push({
          codigo: "SETOR_AUSENTE",
          mensagem: `O bloco "${no.titulo}" precisa ter um setor destino.`,
          no_id: no.id,
        });
      } else if (setoresIds.size > 0 && !setoresIds.has(setorId)) {
        erros.push({
          codigo: "SETOR_INVALIDO",
          mensagem: `O setor do bloco "${no.titulo}" nao existe nesta empresa.`,
          no_id: no.id,
        });
      }
    }

    if (no.tipo_no === "enviar_botoes") {
      const botoes = Array.isArray(config.botoes) ? config.botoes : [];

      if (botoes.length > 3) {
        erros.push({
          codigo: "BOTOES_LIMITE",
          mensagem: `O bloco "${no.titulo}" possui mais de 3 botoes.`,
          no_id: no.id,
        });
      }
    }

    if (no.tipo_no === "pergunta_livre_ia") {
      const saidasIa = saidas.filter((conexao) => conexao.usar_ia === true);

      if (saidasIa.length === 0) {
        erros.push({
          codigo: "PERGUNTA_IA_SEM_ROTAS",
          mensagem: `O bloco "${no.titulo}" precisa ter pelo menos uma rota por IA.`,
          no_id: no.id,
        });
      }
    }

    if (["pergunta_opcoes", "enviar_botoes"].includes(no.tipo_no)) {
      const campo = no.tipo_no === "pergunta_opcoes" ? "opcoes" : "botoes";
      const opcoes = Array.isArray(config[campo]) ? config[campo] : [];
      const saidasPorValor = new Map<string, AssistenteAutomacaoConexao[]>();

      for (const conexao of saidas) {
        const valor = texto(conexao.condicao_json?.valor, 160);

        if (!valor) continue;

        saidasPorValor.set(valor, [
          ...(saidasPorValor.get(valor) || []),
          conexao,
        ]);
      }

      const rotasIncondicionais = saidas.filter(
        (conexao) => conexao.condicao_json?.tipo === "sempre"
      );

      for (const conexao of rotasIncondicionais) {
        erros.push({
          codigo: "PERGUNTA_COM_ROTA_INCONDICIONAL",
          mensagem: `O bloco "${no.titulo}" possui uma rota incondicional. Cada resposta deve ter sua propria rota.`,
          no_id: no.id,
          conexao_id: conexao.id,
        });
      }

      for (const opcao of opcoes) {
        const valor = texto(
          no.tipo_no === "pergunta_opcoes" ? opcao.valor : opcao.id,
          160
        );
        const rotasDaOpcao = valor ? saidasPorValor.get(valor) || [] : [];

        if (valor && rotasDaOpcao.length === 0) {
          erros.push({
            codigo: "OPCAO_SEM_ROTA",
            mensagem: `A opcao "${opcao.titulo || valor}" do bloco "${no.titulo}" precisa ter uma rota.`,
            no_id: no.id,
          });
        } else if (rotasDaOpcao.length > 1) {
          erros.push({
            codigo: "OPCAO_COM_ROTAS_DUPLICADAS",
            mensagem: `A opcao "${opcao.titulo || valor}" do bloco "${no.titulo}" possui mais de uma rota.`,
            no_id: no.id,
            conexao_id: rotasDaOpcao[1]?.id,
          });
        }
      }
    }

    if (tipoNoEsperaResposta(no.tipo_no)) {
      const temTimeout = saidas.some(
        (conexao) => conexao.condicao_json?.tipo === "timeout_sem_resposta"
      );

      if (!temTimeout) {
        avisos.push({
          codigo: "SEM_TIMEOUT",
          mensagem: `O bloco "${no.titulo}" nao possui rota para ausencia de resposta.`,
          no_id: no.id,
        });
      }
    }

    if (no.tipo_no === "capturar_resposta") {
      const chave = normalizarChaveVariavel(config.variavel);

      if (chave && !VARIAVEIS_FIXAS.has(chave) && !variaveis.has(chave)) {
        avisos.push({
          codigo: "VARIAVEL_NOVA",
          mensagem: `A variavel "${chave}" sera criada em tempo de execucao se ainda nao existir.`,
          no_id: no.id,
        });
      }
    }
  }

  const rotas = new Set<string>();

  for (const conexao of params.conexoes) {
    const chave = JSON.stringify({
      origem: conexao.no_origem_id,
      destino: conexao.no_destino_id,
      tipo: conexao.condicao_json?.tipo || "",
      valor: conexao.condicao_json?.valor || "",
    });

    if (rotas.has(chave)) {
      avisos.push({
        codigo: "ROTA_DUPLICADA",
        mensagem: "Existe uma rota duplicada entre os mesmos blocos.",
        conexao_id: conexao.id,
      });
    }

    rotas.add(chave);
  }

  if (temCiclo(params.nos, params.conexoes)) {
    avisos.push({
      codigo: "RISCO_LOOP",
      mensagem: "O fluxo possui um ciclo. Confirme se ha uma saida clara para encerramento.",
    });
  }

  return {
    valido: erros.length === 0,
    erros,
    avisos,
  };
}

function temCiclo(
  nos: AssistenteAutomacaoNo[],
  conexoes: AssistenteAutomacaoConexao[]
) {
  const adj = new Map<string, string[]>();

  for (const no of nos) {
    adj.set(no.id, []);
  }

  for (const conexao of conexoes) {
    adj.set(conexao.no_origem_id, [
      ...(adj.get(conexao.no_origem_id) || []),
      conexao.no_destino_id,
    ]);
  }

  const visitando = new Set<string>();
  const visitados = new Set<string>();

  function dfs(id: string): boolean {
    if (visitando.has(id)) return true;
    if (visitados.has(id)) return false;

    visitando.add(id);

    for (const destino of adj.get(id) || []) {
      if (dfs(destino)) return true;
    }

    visitando.delete(id);
    visitados.add(id);
    return false;
  }

  return nos.some((no) => dfs(no.id));
}

export function compilarPlanoAssistente(params: {
  modo: ModoAssistenteFluxos;
  plano: PlanoAssistenteFluxos;
  fluxoAtual?: {
    nos?: AssistenteAutomacaoNo[];
    conexoes?: AssistenteAutomacaoConexao[];
  } | null;
  setores?: AssistenteSetor[];
  variaveis?: AssistenteVariavel[];
}): ResultadoCompilacaoAssistente {
  const substituirTudo = params.modo === "criar_fluxo";
  const setores = params.setores || [];
  const nosBase = substituirTudo
    ? []
    : (params.fluxoAtual?.nos || []).map(clonarNo);
  const conexoesBase = substituirTudo
    ? []
    : (params.fluxoAtual?.conexoes || []).map((conexao, index) =>
        clonarConexao(conexao, index + 1)
      );

  if (params.modo === "analisar_fluxo") {
    const validacao = validarFluxoAssistente({
      nos: nosBase,
      conexoes: conexoesBase,
      setores,
      variaveis: params.variaveis || [],
    });

    return {
      nos: nosBase,
      conexoes: conexoesBase,
      resumo: params.plano.resumo || "Analise do fluxo atual.",
      variaveis_sugeridas: params.plano.variaveis_sugeridas,
      validacao,
      estatisticas: {
        blocos: nosBase.length,
        conexoes: conexoesBase.length,
        variaveis_sugeridas: params.plano.variaveis_sugeridas.length,
        blocos_criados: 0,
        mensagens_revisadas: 0,
      },
    };
  }

  let mensagensRevisadas = 0;
  let nos = nosBase;
  let conexoes = conexoesBase;

  if (params.modo === "melhorar_mensagens") {
    const resultado = aplicarMensagensRevisadas({
      plano: params.plano,
      nos,
    });

    nos = resultado.nos;
    mensagensRevisadas = resultado.total;
  } else {
    const etapas = [...params.plano.etapas];

    if (substituirTudo && !etapas.some((etapa) => etapa.tipo === "inicio")) {
      etapas.unshift({
        ref: "inicio",
        tipo: "inicio",
        titulo: "Inicio",
        mensagem: null,
        variavel: null,
        tipo_captura: null,
        setor_id: null,
        setor_nome: null,
        resultado: null,
        opcoes: [],
      });
    }

    const refs = new Map<string, string>();
    adicionarRefsExistentes(refs, nos);

    const idsCriados = new Set<string>();
    const novasPorRef = new Map<string, AssistenteAutomacaoNo>();

    for (const etapa of etapas) {
      const ref = normalizarRef(etapa.ref);

      if (!ref || refs.has(ref)) continue;

      const no = criarNo(etapa, setores);
      refs.set(ref, no.id);
      idsCriados.add(no.id);
      novasPorRef.set(ref, no);
      nos = [...nos, no];
    }

    const nosPorId = new Map(nos.map((no) => [no.id, no]));
    const novasConexoes: AssistenteAutomacaoConexao[] = [];
    const rotasResolvidas = params.plano.rotas
      .map((rota) => ({
        rota,
        origem: resolverNoPorRef(rota.origem, refs, nosPorId),
        destino: resolverNoPorRef(rota.destino, refs, nosPorId),
      }))
      .filter(
        (item): item is {
          rota: PlanoAssistenteRota;
          origem: AssistenteAutomacaoNo;
          destino: AssistenteAutomacaoNo;
        } => Boolean(item.origem && item.destino)
      );

    if (params.modo === "adicionar_etapa") {
      const origensPlanejadas = new Set(
        rotasResolvidas.map((item) => item.origem.id)
      );
      const origensComTimeoutPlanejado = new Set(
        rotasResolvidas
          .filter((item) =>
            ["timeout", "timeout_sem_resposta"].includes(
              normalizarRef(item.rota.condicao)
            )
          )
          .map((item) => item.origem.id)
      );

      // No modo de edicao, as rotas retornadas pela IA representam o novo
      // desenho das saidas desses blocos. Substituir as rotas antigas evita
      // manter caminhos concorrentes ao inserir um desvio entre blocos.
      conexoes = conexoes.filter((conexao) => {
        if (!origensPlanejadas.has(conexao.no_origem_id)) return true;

        const timeoutExistente =
          conexao.condicao_json?.tipo === "timeout_sem_resposta";

        return (
          timeoutExistente &&
          !origensComTimeoutPlanejado.has(conexao.no_origem_id)
        );
      });
    }

    for (const { rota, origem, destino } of rotasResolvidas) {

      const jaExiste = [...conexoes, ...novasConexoes].some(
        (conexao) =>
          conexao.no_origem_id === origem.id &&
          conexao.no_destino_id === destino.id &&
          texto(conexao.condicao_json?.valor, 160) === texto(rota.valor, 160)
      );

      if (jaExiste) continue;

      novasConexoes.push(
        criarConexao(rota, origem, destino, conexoes.length + novasConexoes.length + 1)
      );
    }

    if (substituirTudo && novasConexoes.length === 0 && nos.length > 1) {
      for (let index = 0; index < nos.length - 1; index += 1) {
        novasConexoes.push({
          id: criarId(),
          no_origem_id: nos[index].id,
          no_destino_id: nos[index + 1].id,
          rotulo: "Sempre seguir",
          ordem: novasConexoes.length + 1,
          condicao_json: { tipo: "sempre" },
          usar_ia: false,
          descricao_ia: null,
        });
      }
    }

    conexoes = ordenarConexoes([...conexoes, ...novasConexoes]);

    aplicarLayout({
      nos,
      conexoes,
      idsCriados: substituirTudo
        ? new Set(nos.map((no) => no.id))
        : idsCriados,
      substituirTudo,
    });

    // Preserve the map to keep TypeScript aware that refs were deliberately
    // compiled even when a model returned only routes to existing nodes.
    void novasPorRef;
  }

  const validacao = validarFluxoAssistente({
    nos,
    conexoes,
    setores,
    variaveis: params.variaveis || [],
  });

  return {
    nos,
    conexoes,
    resumo:
      params.plano.resumo ||
      (params.modo === "melhorar_mensagens"
        ? "Mensagens revisadas pela IA."
        : "Proposta de fluxo gerada pela IA."),
    variaveis_sugeridas: params.plano.variaveis_sugeridas,
    validacao,
    estatisticas: {
      blocos: nos.length,
      conexoes: conexoes.length,
      variaveis_sugeridas: params.plano.variaveis_sugeridas.length,
      blocos_criados: substituirTudo
        ? nos.length
        : nos.length - nosBase.length,
      mensagens_revisadas: mensagensRevisadas,
    },
  };
}
