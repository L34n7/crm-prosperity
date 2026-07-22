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

export type AssistenteMidia = {
  id: string;
  nome: string;
  tipo: "imagem" | "video" | "audio" | "arquivo";
  url: string;
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
  midia_id: string | null;
  midia_nome: string | null;
  midia_tipo: string | null;
  midia_url: string | null;
  url: string | null;
  botao_texto: string | null;
  opcoes: PlanoAssistenteOpcao[];
  agenda_id?: string | null;
  agenda_nome?: string | null;
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

export type PlanoAssistenteClarificacao = {
  id: string;
  pergunta: string;
  tipo: "selecao" | "texto";
  opcoes: PlanoAssistenteOpcao[];
  valor_sugerido: string | null;
  motivo: string | null;
};

export type PlanoAssistenteFluxos = {
  nome_fluxo: string;
  objetivo: string;
  resumo: string;
  etapas: PlanoAssistenteEtapa[];
  rotas: PlanoAssistenteRota[];
  mensagens_revisadas: PlanoAssistenteMensagemRevisada[];
  variaveis_sugeridas: PlanoAssistenteVariavelSugerida[];
  clarificacoes: PlanoAssistenteClarificacao[];
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
  "midia_imagem",
  "midia_video",
  "midia_audio",
  "midia_arquivo",
  "redirect",
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

const TIPOS_CAPTURA_VALIDOS = new Set([
  "texto",
  "nome",
  "cpf",
  "cnpj",
  "email",
  "telefone",
  "numero",
  "data",
  "cep",
  "moeda",
]);

const ALIASES_TIPO_CAPTURA: Record<string, string> = {
  livre: "texto",
  texto_livre: "texto",
  resposta_livre: "texto",
  string: "texto",
  e_mail: "email",
  phone: "telefone",
  currency: "moeda",
};

function texto(valor: unknown, limite = 1200) {
  return String(valor || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limite);
}

/** Mantém o título dentro do limite de 20 unidades UTF-16 do WhatsApp. */
export function normalizarTituloBotao(valor: unknown) {
  const original = texto(valor, 80);
  if (original.length <= 20) return original;

  let titulo = original.replace(/^[^\p{L}\p{N}]+/u, "");

  if (titulo.length <= 20) return titulo;

  titulo = titulo.replace(/\bfalar com especialista\b/i, "Falar especialista");
  if (titulo.length <= 20) return titulo;

  titulo = titulo.replace(/\bfalar com\b/i, "Falar c/");
  if (titulo.length <= 20) return titulo;

  while (titulo.length > 20) titulo = titulo.slice(0, -1);

  return titulo.replace(/\s+\S*$/, "").trim() || titulo.trim();
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

function contextoIndicaNome(etapa: {
  titulo?: string | null;
  mensagem?: string | null;
  variavel?: string | null;
}) {
  return /\b(nome|chamar|chamo|seu nome|como posso te chamar)\b/i.test(
    `${etapa.titulo || ""} ${etapa.mensagem || ""} ${etapa.variavel || ""}`
  );
}

function normalizarTipoCaptura(etapa: {
  titulo?: string | null;
  mensagem?: string | null;
  variavel?: string | null;
  tipo_captura?: string | null;
}) {
  const informado = normalizarChaveVariavel(etapa.tipo_captura);
  const tipo = ALIASES_TIPO_CAPTURA[informado] || informado;

  if (contextoIndicaNome(etapa) && (!tipo || tipo === "texto")) {
    return "nome";
  }

  return TIPOS_CAPTURA_VALIDOS.has(tipo) ? tipo : "texto";
}

function normalizarVariavelCaptura(etapa: {
  titulo?: string | null;
  mensagem?: string | null;
  variavel?: string | null;
  tipo_captura?: string | null;
}) {
  const variavelInformada = normalizarChaveVariavel(etapa.variavel);
  const tipoCaptura = normalizarTipoCaptura(etapa);

  if (
    variavelInformada &&
    !VARIAVEIS_FIXAS.has(variavelInformada) &&
    variavelInformada !== "resposta" &&
    variavelInformada !== "texto"
  ) {
    return variavelInformada;
  }

  if (tipoCaptura === "nome") return "nome_cliente";
  if (tipoCaptura === "email") return "email_capturado";
  if (tipoCaptura === "telefone") return "telefone_capturado";
  if (tipoCaptura === "cpf") return "cpf_capturado";
  if (tipoCaptura === "cnpj") return "cnpj_capturado";

  return `${tipoCaptura || "resposta"}_capturado`;
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
  if (tipoNo === "enviar_imagem") return "Imagem";
  if (tipoNo === "enviar_video") return "Video";
  if (tipoNo === "enviar_audio") return "Audio";
  if (tipoNo === "enviar_arquivo") return "Arquivo";
  if (tipoNo === "botao_redirect") return "Botao redirect";
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
  if (tipo === "midia_imagem") return "enviar_imagem";
  if (tipo === "midia_video") return "enviar_video";
  if (tipo === "midia_audio") return "enviar_audio";
  if (tipo === "midia_arquivo") return "enviar_arquivo";
  if (tipo === "redirect") return "botao_redirect";
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
  setores: AssistenteSetor[],
  midias: AssistenteMidia[]
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

  if (
    ["enviar_imagem", "enviar_video", "enviar_audio", "enviar_arquivo"].includes(
      tipoNo
    )
  ) {
    const midia = midias.find((item) => item.id === etapa.midia_id);

    return {
      mensagem,
      midia_id: midia?.id || etapa.midia_id || "",
      midia_nome: midia?.nome || etapa.midia_nome || "",
      midia_url: midia?.url || etapa.midia_url || "",
    };
  }

  if (tipoNo === "botao_redirect") {
    return {
      mensagem: mensagem || "Clique no botao abaixo para acessar.",
      botao_texto: texto(etapa.botao_texto, 20) || "Acessar",
      url: texto(etapa.url, 1800),
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
          texto:
            tipo === "pergunta_botoes"
              ? normalizarTituloBotao(opcao.texto)
              : texto(opcao.texto, 80),
        };
      })
    : [];

  const etapaBase = {
    titulo: texto(item.titulo, 120) || null,
    mensagem: texto(item.mensagem, 1800) || null,
    variavel: normalizarChaveVariavel(item.variavel) || null,
    tipo_captura: normalizarChaveVariavel(item.tipo_captura) || null,
  };

  const captura = tipo === "capturar_resposta";

  return {
    ref: normalizarRef(item.ref) || `etapa_${criarId()}`,
    tipo,
    titulo: etapaBase.titulo,
    mensagem: etapaBase.mensagem,
    variavel: captura ? normalizarVariavelCaptura(etapaBase) : etapaBase.variavel,
    tipo_captura: captura
      ? normalizarTipoCaptura(etapaBase)
      : etapaBase.tipo_captura,
    setor_id: texto(item.setor_id, 120) || null,
    setor_nome: texto(item.setor_nome, 120) || null,
    resultado: texto(item.resultado, 40) || null,
    midia_id: texto(item.midia_id, 120) || null,
    midia_nome: texto(item.midia_nome, 240) || null,
    midia_tipo: texto(item.midia_tipo, 40) || null,
    midia_url: texto(item.midia_url, 1800) || null,
    url: texto(item.url, 1800) || null,
    botao_texto: texto(item.botao_texto, 20) || null,
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

const TIPOS_ETAPA_COM_MENSAGEM = new Set([
  "mensagem",
  "pergunta_opcoes",
  "pergunta_botoes",
  "pergunta_livre_ia",
  "redirect",
  "avaliacao",
]);

function textoContemVariavel(valor: unknown, chave: string): boolean {
  if (typeof valor === "string") {
    return new RegExp(`\\{\\{\\s*${chave}\\s*\\}\\}`, "i").test(valor);
  }

  if (Array.isArray(valor)) {
    return valor.some((item) => textoContemVariavel(item, chave));
  }

  if (valor && typeof valor === "object") {
    return Object.values(valor).some((item) =>
      textoContemVariavel(item, chave)
    );
  }

  return false;
}

function personalizarMensagemComVariavel(mensagem: string, chave: string) {
  const placeholder = `{{${chave}}}`;

  if (textoContemVariavel(mensagem, chave)) return mensagem;

  if (/muito prazer!?/i.test(mensagem)) {
    return mensagem.replace(/muito prazer!?/i, `Muito prazer, ${placeholder}!`);
  }

  if (/^(ola|olá)\b/i.test(mensagem.trim())) {
    return mensagem.replace(/^(\s*(?:ola|olá))/i, `$1, ${placeholder}`);
  }

  return `${placeholder}, ${mensagem}`;
}

function normalizarVariaveisCapturaUnicas(
  etapas: PlanoAssistenteEtapa[]
): PlanoAssistenteEtapa[] {
  const usadas = new Set<string>();

  return etapas.map((etapa) => {
    if (etapa.tipo !== "capturar_resposta") return etapa;

    const base = normalizarChaveVariavel(etapa.variavel) || "resposta_capturado";
    let chave = base;
    let indice = 2;

    while (usadas.has(chave)) {
      chave = `${base}_${indice}`;
      indice += 1;
    }

    usadas.add(chave);
    return chave === base ? etapa : { ...etapa, variavel: chave };
  });
}

function garantirUsoCapturas(
  etapas: PlanoAssistenteEtapa[],
  rotas: PlanoAssistenteRota[]
): PlanoAssistenteEtapa[] {
  const adjacencias = new Map<string, string[]>();

  for (const rota of rotas) {
    adjacencias.set(rota.origem, [
      ...(adjacencias.get(rota.origem) || []),
      rota.destino,
    ]);
  }

  const resultado = [...etapas];

  for (const etapa of etapas) {
    if (etapa.tipo !== "capturar_resposta" || !etapa.variavel) {
      continue;
    }

    const visitados = new Set<string>();
    const fila = [...(adjacencias.get(etapa.ref) || [])];
    const alcancaveis: PlanoAssistenteEtapa[] = [];

    while (fila.length > 0) {
      const ref = fila.shift();
      if (!ref || visitados.has(ref)) continue;
      visitados.add(ref);

      const destino = etapas.find((item) => item.ref === ref);
      if (destino) alcancaveis.push(destino);

      fila.push(...(adjacencias.get(ref) || []));
    }

    const usoExiste = alcancaveis.some((destino) =>
      textoContemVariavel(destino.mensagem, etapa.variavel || "")
    );

    if (usoExiste || etapa.tipo_captura !== "nome") continue;

    const destinoParaPersonalizar = alcancaveis.find(
      (destino) =>
        TIPOS_ETAPA_COM_MENSAGEM.has(destino.tipo) &&
        Boolean(destino.mensagem)
    );

    if (!destinoParaPersonalizar) continue;

    const indiceDestino = resultado.findIndex(
      (item) => item.ref === destinoParaPersonalizar.ref
    );

    if (indiceDestino >= 0) {
      resultado[indiceDestino] = {
        ...resultado[indiceDestino],
        mensagem: personalizarMensagemComVariavel(
          resultado[indiceDestino].mensagem || "",
          etapa.variavel
        ),
      };
    }
  }

  return resultado;
}

function criarRefEtapaClonada(
  etapaRef: string,
  opcao: PlanoAssistenteOpcao,
  refsExistentes: Set<string>
) {
  const base = normalizarRef(etapaRef) || "etapa";
  const sufixo = normalizarRef(opcao.id || opcao.texto) || "opcao";
  let ref = `${base}__${sufixo}`;
  let indice = 2;

  while (refsExistentes.has(ref)) {
    ref = `${base}__${sufixo}_${indice}`;
    indice += 1;
  }

  refsExistentes.add(ref);
  return ref;
}

/**
 * Completa rotas ausentes e evita que duas opções de uma mesma pergunta
 * terminem no mesmo bloco. Quando isso acontece, clona o destino e toda a
 * saída imediata do bloco para preservar o caminho daquela opção.
 *
 * A regra é aplicada apenas à proposta da IA. Fluxos editados manualmente
 * continuam podendo convergir intencionalmente para um bloco compartilhado.
 */
export function completarRotasDeOpcoesPlano(
  plano: PlanoAssistenteFluxos,
  opcoes?: { preencherRotasAusentes?: boolean }
): PlanoAssistenteFluxos {
  const preencherRotasAusentes = opcoes?.preencherRotasAusentes !== false;
  const etapas = plano.etapas.map((etapa) => ({
    ...etapa,
    opcoes: [...(etapa.opcoes || [])],
  }));
  const rotas = plano.rotas.map((rota) => ({ ...rota }));
  const refsExistentes = new Set(etapas.map((etapa) => etapa.ref));
  const fila = etapas
    .filter((etapa) =>
      ["pergunta_opcoes", "pergunta_botoes"].includes(etapa.tipo)
    )
    .map((etapa) => etapa.ref);
  const processadas = new Set<string>();

  while (fila.length > 0) {
    const etapaRef = fila.shift();
    if (!etapaRef || processadas.has(etapaRef)) continue;
    processadas.add(etapaRef);

    const indiceEtapa = etapas.findIndex((etapa) => etapa.ref === etapaRef);
    const etapa = indiceEtapa >= 0 ? etapas[indiceEtapa] : null;
    if (!etapa) continue;

    const opcoes = etapa.opcoes || [];
    const saidas = rotas.filter((rota) => rota.origem === etapa.ref);
    const destinoFallback =
      saidas.find((rota) => Boolean(rota.valor))?.destino ||
      saidas[0]?.destino ||
      etapas[indiceEtapa + 1]?.ref;

    if (!destinoFallback) continue;

    for (const opcao of opcoes) {
      const valor = normalizarChaveVariavel(opcao.id || opcao.texto);
      if (!valor) continue;

      const rotasDaOpcao = rotas.filter(
        (rota) =>
          rota.origem === etapa.ref &&
          normalizarChaveVariavel(rota.valor) === valor &&
          !["timeout", "timeout_sem_resposta"].includes(
            normalizarRef(rota.condicao)
          )
      );

      if (rotasDaOpcao.length === 0 && preencherRotasAusentes) {
        rotas.push({
          origem: etapa.ref,
          destino: destinoFallback,
          condicao: "resposta_contem",
          valor,
          rotulo: opcao.texto || valor,
          descricao_ia: null,
          timeout_segundos: null,
        });
        continue;
      }

      // Rotas duplicadas para a mesma resposta devem continuar sendo erro de
      // validação; não transforme uma duplicidade em dois caminhos válidos.
      if (rotasDaOpcao.length !== 1) continue;
    }

    const rotasPorDestino = new Map<string, Array<{
      rota: PlanoAssistenteRota;
      opcao: PlanoAssistenteOpcao;
    }>>();

    for (const opcao of opcoes) {
      const valor = normalizarChaveVariavel(opcao.id || opcao.texto);
      if (!valor) continue;

      const rota = rotas.find(
        (item) =>
          item.origem === etapa.ref &&
          normalizarChaveVariavel(item.valor) === valor &&
          !["timeout", "timeout_sem_resposta"].includes(
            normalizarRef(item.condicao)
          )
      );

      if (!rota) continue;

      rotasPorDestino.set(rota.destino, [
        ...(rotasPorDestino.get(rota.destino) || []),
        { rota, opcao },
      ]);
    }

    for (const [destinoRef, itens] of rotasPorDestino.entries()) {
      if (itens.length <= 1) continue;

      const destinoOriginal = etapas.find((item) => item.ref === destinoRef);
      if (!destinoOriginal) continue;

      // A primeira opção mantém o bloco original; as demais recebem uma
      // cópia para que cada saída da pergunta tenha um destino visual próprio.
      for (let indice = 1; indice < itens.length; indice += 1) {
        const item = itens[indice];
        const novoRef = criarRefEtapaClonada(
          destinoOriginal.ref,
          item.opcao,
          refsExistentes
        );
        const tituloBase = destinoOriginal.titulo || destinoOriginal.tipo;
        const titulo = `${tituloBase} · ${item.opcao.texto || item.opcao.id}`
          .slice(0, 120)
          .trim();

        etapas.push({
          ...destinoOriginal,
          ref: novoRef,
          titulo,
          opcoes: [...(destinoOriginal.opcoes || [])],
        });
        item.rota.destino = novoRef;

        const saidasDestino = rotas.filter(
          (rota) => rota.origem === destinoOriginal.ref
        );

        for (const saida of saidasDestino) {
          rotas.push({
            ...saida,
            origem: novoRef,
            destino:
              saida.destino === destinoOriginal.ref
                ? novoRef
                : saida.destino,
          });
        }

        if (["pergunta_opcoes", "pergunta_botoes"].includes(destinoOriginal.tipo)) {
          fila.push(novoRef);
        }
      }
    }
  }

  return { ...plano, etapas, rotas };
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
    chave: VARIAVEIS_FIXAS.has(chave)
      ? chave === "nome" || chave === "nome_contato"
        ? "nome_cliente"
        : `${chave}_capturado`
      : chave,
    descricao: texto(item.descricao, 280) || null,
  };
}

function normalizarClarificacao(
  valor: unknown
): PlanoAssistenteClarificacao | null {
  const item = objeto(valor);
  const id = normalizarRef(item.id);
  const pergunta = texto(item.pergunta, 500);
  const tipo = item.tipo === "selecao" ? "selecao" : "texto";
  const opcoes = Array.isArray(item.opcoes)
    ? item.opcoes
        .map((opcaoRaw) => {
          const opcao = objeto(opcaoRaw);
          const opcaoId = texto(opcao.id, 80);
          const opcaoTexto = texto(opcao.texto, 160);

          return opcaoId && opcaoTexto
            ? { id: opcaoId, texto: opcaoTexto }
            : null;
        })
        .filter(Boolean)
    : [];

  if (!id || !pergunta) return null;

  return {
    id,
    pergunta,
    tipo,
    opcoes: opcoes as PlanoAssistenteOpcao[],
    valor_sugerido: texto(item.valor_sugerido, 500) || null,
    motivo: texto(item.motivo, 300) || null,
  };
}

export function normalizarPlanoAssistente(
  valor: unknown
): PlanoAssistenteFluxos {
  const item = objeto(valor);
  let etapas: PlanoAssistenteEtapa[] = Array.isArray(item.etapas)
    ? (item.etapas.map(normalizarEtapa).filter(Boolean) as PlanoAssistenteEtapa[])
    : [];
  let rotas = Array.isArray(item.rotas)
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
  const clarificacoes = Array.isArray(item.clarificacoes)
    ? item.clarificacoes
        .map(normalizarClarificacao)
        .filter(Boolean)
        .slice(0, 3)
    : [];

  etapas = normalizarVariaveisCapturaUnicas(
    etapas as PlanoAssistenteEtapa[]
  );
  etapas = garantirUsoCapturas(
    etapas,
    rotas as PlanoAssistenteRota[]
  );

  const rotulosBotoes = new Map<string, string>();
  for (const etapa of etapas) {
    if (etapa.tipo !== "pergunta_botoes") continue;
    for (const opcao of etapa.opcoes) {
      rotulosBotoes.set(
        `${etapa.ref}:${normalizarChaveVariavel(opcao.id)}`,
        opcao.texto
      );
    }
  }
  rotas = (rotas as PlanoAssistenteRota[]).map((rota) => ({
    ...rota,
    rotulo:
      rotulosBotoes.get(
        `${rota.origem}:${normalizarChaveVariavel(rota.valor)}`
      ) || rota.rotulo,
  }));

  return {
    nome_fluxo: texto(item.nome_fluxo, 120),
    objetivo: texto(item.objetivo, 500),
    resumo: texto(item.resumo, 1200),
    etapas,
    rotas: rotas as PlanoAssistenteRota[],
    mensagens_revisadas:
      mensagensRevisadas as PlanoAssistenteMensagemRevisada[],
    variaveis_sugeridas:
      variaveisSugeridas as PlanoAssistenteVariavelSugerida[],
    clarificacoes: clarificacoes as PlanoAssistenteClarificacao[],
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
  setores: AssistenteSetor[],
  midias: AssistenteMidia[]
): AssistenteAutomacaoNo {
  const tipoNo = tipoNoPorEtapa(etapa.tipo);

  return {
    id: criarId(),
    tipo_no: tipoNo,
    titulo: texto(etapa.titulo, 120) || tituloPadraoTipoNo(tipoNo),
    descricao: null,
    posicao_x: 0,
    posicao_y: 0,
    configuracao_json: configuracaoPorEtapa(etapa, tipoNo, setores, midias),
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
  midias?: AssistenteMidia[];
}): ValidacaoAssistenteFluxos {
  const erros: ValidacaoItemAssistente[] = [];
  const avisos: ValidacaoItemAssistente[] = [];
  const nosPorId = new Map(params.nos.map((no) => [no.id, no]));
  const setoresIds = new Set((params.setores || []).map((setor) => setor.id));
  const midiasPorId = new Map(
    (params.midias || []).map((midia) => [midia.id, midia])
  );
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

    if (
      ["enviar_imagem", "enviar_video", "enviar_audio", "enviar_arquivo"].includes(
        no.tipo_no
      )
    ) {
      const midiaId = texto(config.midia_id, 120);
      const midiaUrl = texto(config.midia_url, 1800);
      const midia = midiasPorId.get(midiaId);
      const tipoEsperado =
        no.tipo_no === "enviar_imagem"
          ? "imagem"
          : no.tipo_no === "enviar_video"
            ? "video"
            : no.tipo_no === "enviar_audio"
              ? "audio"
              : "arquivo";

      if (!midiaId || !midiaUrl) {
        erros.push({
          codigo: "MIDIA_AUSENTE",
          mensagem: `O bloco "${no.titulo}" precisa ter uma midia selecionada.`,
          no_id: no.id,
        });
      } else if (
        midiasPorId.size > 0 &&
        (!midia || midia.tipo !== tipoEsperado || midia.url !== midiaUrl)
      ) {
        erros.push({
          codigo: "MIDIA_INVALIDA",
          mensagem: `A midia do bloco "${no.titulo}" nao existe nesta empresa.`,
          no_id: no.id,
        });
      }
    }

    if (no.tipo_no === "botao_redirect") {
      const url = texto(config.url, 1800);
      const botaoTexto = texto(config.botao_texto, 40);
      let urlValida = false;

      try {
        const analisada = new URL(url);
        urlValida = ["http:", "https:"].includes(analisada.protocol);
      } catch {
        urlValida = false;
      }

      if (!urlValida) {
        erros.push({
          codigo: "REDIRECT_URL_INVALIDA",
          mensagem: `O bloco "${no.titulo}" precisa ter uma URL http ou https valida.`,
          no_id: no.id,
        });
      }

      if (!botaoTexto || botaoTexto.length > 20) {
        erros.push({
          codigo: "REDIRECT_BOTAO_INVALIDO",
          mensagem: `O bloco "${no.titulo}" precisa ter texto de botao com ate 20 caracteres.`,
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

      const ids = new Set<string>();
      for (const botao of botoes) {
        const id = texto(botao.id, 160);
        const titulo = texto(botao.titulo, 80);

        if (!id) {
          erros.push({
            codigo: "BOTAO_ID_AUSENTE",
            mensagem: `O bloco "${no.titulo}" possui um botao sem ID.`,
            no_id: no.id,
          });
        } else if (ids.has(id)) {
          erros.push({
            codigo: "BOTAO_ID_DUPLICADO",
            mensagem: `O bloco "${no.titulo}" possui o ID de botao duplicado "${id}".`,
            no_id: no.id,
          });
        }

        if (!titulo) {
          erros.push({
            codigo: "BOTAO_TITULO_AUSENTE",
            mensagem: `O bloco "${no.titulo}" possui um botao sem titulo.`,
            no_id: no.id,
          });
        } else if (titulo.length > 20) {
          erros.push({
            codigo: "BOTAO_TITULO_LONGO",
            mensagem: `O botao "${titulo}" do bloco "${no.titulo}" possui ${titulo.length} caracteres; o limite e 20.`,
            no_id: no.id,
          });
        }

        if (id) ids.add(id);
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
      const tipoCaptura = normalizarChaveVariavel(config.tipo_captura);

      if (VARIAVEIS_FIXAS.has(chave)) {
        erros.push({
          codigo: "VARIAVEL_CAPTURA_FIXA",
          mensagem: `O bloco "${no.titulo}" nao pode salvar a resposta na variavel fixa "${chave}". Use uma variavel personalizada, como "${tipoCaptura === "nome" ? "nome_cliente" : `${tipoCaptura || "resposta"}_capturado`}".`,
          no_id: no.id,
        });
      }

      if (!TIPOS_CAPTURA_VALIDOS.has(tipoCaptura)) {
        erros.push({
          codigo: "TIPO_CAPTURA_INVALIDO",
          mensagem: `O bloco "${no.titulo}" possui um tipo de captura invalido.`,
          no_id: no.id,
        });
      }

      if (
        chave &&
        !variavelUsadaDepoisDoNo({
          noId: no.id,
          chave,
          nos: params.nos,
          conexoes: params.conexoes,
        })
      ) {
        erros.push({
          codigo: "CAPTURA_VARIAVEL_NAO_UTILIZADA",
          mensagem: `A variavel "{{${chave}}}" capturada no bloco "${no.titulo}" nao e utilizada em nenhuma etapa posterior.`,
          no_id: no.id,
        });
      }

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

function variavelUsadaDepoisDoNo(params: {
  noId: string;
  chave: string;
  nos: AssistenteAutomacaoNo[];
  conexoes: AssistenteAutomacaoConexao[];
}) {
  const nosPorId = new Map(params.nos.map((no) => [no.id, no]));
  const saidasPorOrigem = new Map<string, string[]>();

  for (const conexao of params.conexoes) {
    saidasPorOrigem.set(conexao.no_origem_id, [
      ...(saidasPorOrigem.get(conexao.no_origem_id) || []),
      conexao.no_destino_id,
    ]);
  }

  const visitados = new Set<string>();
  const fila = [...(saidasPorOrigem.get(params.noId) || [])];

  while (fila.length > 0) {
    const noId = fila.shift();
    if (!noId || visitados.has(noId)) continue;
    visitados.add(noId);

    const no = nosPorId.get(noId);
    if (no && textoContemVariavel(no.configuracao_json, params.chave)) {
      return true;
    }

    fila.push(...(saidasPorOrigem.get(noId) || []));
  }

  return false;
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
  midias?: AssistenteMidia[];
}): ResultadoCompilacaoAssistente {
  const substituirTudo = params.modo === "criar_fluxo";
  const planoCompilado = substituirTudo
    ? completarRotasDeOpcoesPlano(params.plano, {
        preencherRotasAusentes: false,
      })
    : params.plano;
  const setores = params.setores || [];
  const midias = params.midias || [];
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
      midias,
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
    const etapas = [...planoCompilado.etapas];

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
        midia_id: null,
        midia_nome: null,
        midia_tipo: null,
        midia_url: null,
        url: null,
        botao_texto: null,
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

      const no = criarNo(etapa, setores, midias);
      refs.set(ref, no.id);
      idsCriados.add(no.id);
      novasPorRef.set(ref, no);
      nos = [...nos, no];
    }

    const nosPorId = new Map(nos.map((no) => [no.id, no]));
    const novasConexoes: AssistenteAutomacaoConexao[] = [];
    const rotasResolvidas = planoCompilado.rotas
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
    midias,
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
