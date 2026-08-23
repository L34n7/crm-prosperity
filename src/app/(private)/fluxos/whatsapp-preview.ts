import type { Edge, Node } from "@xyflow/react";
import type {
  PreviewTemplateWhatsapp,
  TemplateWhatsappOpcao,
} from "./types";
import {
  EXEMPLOS_VARIAVEIS_PREVIA_WHATSAPP,
  LIMITE_MENSAGENS_PREVIA_WHATSAPP,
  TIPO_NO_PERGUNTA_LIVRE_IA,
} from "./constants";
import {
  labelTipoNo,
  opcoesRespostaDoNo,
  tituloVisivelCard,
} from "./utils";

export type TipoMensagemPreviaWhatsapp =
  | "bot"
  | "contato"
  | "sistema"
  | "seletor"
  | "divisoria";

export type OpcaoJornadaPreviaWhatsapp = {
  edgeId: string;
  texto: string;
  selecionada: boolean;
};

export type MensagemPreviaWhatsapp = {
  id: string;
  tipo: TipoMensagemPreviaWhatsapp;
  texto: string;
  titulo?: string;
  rodape?: string;
  botoes?: string[];
  midiaTipo?: "imagem" | "video" | "audio" | "arquivo";
  delayLabel?: string;
  sourceNodeId?: string;
  opcoesJornada?: OpcaoJornadaPreviaWhatsapp[];
};

export type PreviaWhatsappFluxo = {
  mensagens: MensagemPreviaWhatsapp[];
  totalBlocos: number;
  totalRotas: number;
  truncado: boolean;
};

export type EncerramentoInatividadePreviaWhatsapp = {
  quantidade: number;
  unidade: "minutos" | "horas";
  mensagem: string;
};

type EdgeDataConexao = {
  condicao_json?: Record<string, unknown>;
};

export function templateWhatsappAprovado(
  template?: TemplateWhatsappOpcao | null
) {
  return String(template?.status || "").trim().toUpperCase() === "APPROVED";
}

export function contarVariaveisTextoTemplate(texto?: string | null) {
  const matches = String(texto || "").match(/\{\{\d+\}\}/g) || [];
  const numeros = matches
    .map((item) => Number(item.replace(/[{}]/g, "")))
    .filter((numero) => Number.isFinite(numero));

  return numeros.length > 0 ? Math.max(...numeros) : 0;
}

export function contarVariaveisTemplateWhatsapp(
  template?: TemplateWhatsappOpcao | null
) {
  const components = Array.isArray(template?.payload?.components)
    ? template?.payload?.components
    : [];

  const header = components.find(
    (item: any) => String(item?.type || "").toUpperCase() === "HEADER"
  );
  const body = components.find(
    (item: any) => String(item?.type || "").toUpperCase() === "BODY"
  );
  const buttons = components.find(
    (item: any) => String(item?.type || "").toUpperCase() === "BUTTONS"
  );

  const totalHeader = contarVariaveisTextoTemplate(header?.text);
  const totalBody = contarVariaveisTextoTemplate(body?.text);
  const totalButtons = (buttons?.buttons || []).reduce(
    (total: number, button: any) => {
      if (String(button?.type || "").toUpperCase() !== "URL") return total;
      return total + contarVariaveisTextoTemplate(button?.url);
    },
    0
  );

  return totalHeader + totalBody + totalButtons;
}

export function templateWhatsappTemCabecalhoMidia(
  template?: TemplateWhatsappOpcao | null
) {
  const components = Array.isArray(template?.payload?.components)
    ? template?.payload?.components
    : [];
  const header = components.find(
    (item: any) => String(item?.type || "").toUpperCase() === "HEADER"
  );
  const formatoHeader = String(header?.format || "").toUpperCase();

  return ["IMAGE", "VIDEO", "DOCUMENT"].includes(formatoHeader);
}

export function contarVariaveisObrigatoriasPreenchidas(
  variaveis: string[] | string,
  totalObrigatorio: number
) {
  const linhas = Array.isArray(variaveis)
    ? variaveis
    : obterLinhasVariaveisTemplate(variaveis);

  return linhas
    .slice(0, totalObrigatorio)
    .map((item) => String(item || "").trim())
    .filter(Boolean).length;
}

export function obterLinhasVariaveisTemplate(valor: string) {
  const linhas = String(valor || "").split("\n");
  return [linhas[0] || "", linhas[1] || "", linhas[2] || ""];
}

export function normalizarEntradaVariavelTemplate(valor: string) {
  return String(valor || "")
    .replace(/[{}]/g, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+/g, "");
}

export function atualizarLinhaVariavelTemplate(
  valorAtual: string,
  index: number,
  novoValor: string
) {
  const linhas = obterLinhasVariaveisTemplate(valorAtual);
  linhas[index] = normalizarEntradaVariavelTemplate(novoValor);
  return linhas.join("\n");
}

export function preencherPrimeiraLinhaVariavelTemplate(
  valorAtual: string,
  novoValor: string
) {
  const linhas = obterLinhasVariaveisTemplate(valorAtual);
  const indiceVazio = linhas.findIndex((item) => !item.trim());
  linhas[indiceVazio >= 0 ? indiceVazio : 0] =
    normalizarEntradaVariavelTemplate(novoValor);
  return linhas.join("\n");
}

function substituirVariaveisPreviewTemplate(
  texto: string,
  variaveis: string[],
  offset: number
) {
  return String(texto || "").replace(/\{\{(\d+)\}\}/g, (_, numero) => {
    const index = offset + Number(numero) - 1;
    return variaveis[index]?.trim() || `{{${numero}}}`;
  });
}

export function montarPreviewTemplateWhatsapp(
  template: TemplateWhatsappOpcao | null,
  variaveisRaw: string
): PreviewTemplateWhatsapp | null {
  if (!template) return null;

  const variaveis = obterLinhasVariaveisTemplate(variaveisRaw);
  const components = Array.isArray(template.payload?.components)
    ? template.payload.components
    : [];
  const header = components.find(
    (item: any) => String(item?.type || "").toUpperCase() === "HEADER"
  );
  const body = components.find(
    (item: any) => String(item?.type || "").toUpperCase() === "BODY"
  );
  const footer = components.find(
    (item: any) => String(item?.type || "").toUpperCase() === "FOOTER"
  );
  const buttons = components.find(
    (item: any) => String(item?.type || "").toUpperCase() === "BUTTONS"
  );

  let offset = 0;
  const headerText = substituirVariaveisPreviewTemplate(
    header?.text || "",
    variaveis,
    offset
  ).trim();
  offset += contarVariaveisTextoTemplate(header?.text);

  const bodyText = substituirVariaveisPreviewTemplate(
    body?.text || "",
    variaveis,
    offset
  ).trim();

  const quickReplies =
    buttons?.buttons
      ?.filter((button: any) => button?.type === "QUICK_REPLY" && button?.text)
      .map((button: any) => String(button.text || "").trim())
      .filter(Boolean) || [];

  return {
    titulo: headerText || template.nome || "Template WhatsApp",
    corpo: bodyText || "Template sem texto para previsualizacao.",
    rodape: String(footer?.text || "").trim() || "Equipe de atendimento",
    botoes: quickReplies,
  };
}

function textoPreviaWhatsapp(valor: unknown, fallback = "") {
  const texto = String(valor ?? "").trim();
  return texto || fallback;
}

function aplicarVariaveisDemoPreviaWhatsapp(texto: string) {
  return String(texto || "").replace(
    /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
    (match, chave) =>
      EXEMPLOS_VARIAVEIS_PREVIA_WHATSAPP[String(chave).toLowerCase()] || match
  );
}

function criarMensagemPreviaWhatsapp(
  id: string,
  tipo: TipoMensagemPreviaWhatsapp,
  texto: string,
  extras?: Omit<MensagemPreviaWhatsapp, "id" | "tipo" | "texto">
): MensagemPreviaWhatsapp {
  return {
    id,
    tipo,
    texto: aplicarVariaveisDemoPreviaWhatsapp(texto),
    ...extras,
  };
}

function formatarDelayPreviaWhatsapp(segundos: unknown) {
  const totalSegundos = Number(segundos);

  if (!Number.isFinite(totalSegundos) || totalSegundos <= 0) return "";
  if (totalSegundos < 60) return `apos ${Math.floor(totalSegundos)}s`;

  const minutos = Math.round(totalSegundos / 60);
  if (minutos < 60) return `apos ${minutos} min`;

  const horas = Math.round(minutos / 60);
  return `apos ${horas} h`;
}

function formatarTempoAgendamentoPreviaWhatsapp(
  configuracao: Record<string, unknown>
) {
  const quantidade = Math.max(1, Number(configuracao.tempo_quantidade || 1));
  const unidade = String(configuracao.tempo_unidade || "horas");
  const unidadeSingular = unidade === "dias" ? "dia" : "hora";
  const unidadePlural = unidade === "dias" ? "dias" : "horas";

  return `${quantidade} ${quantidade === 1 ? unidadeSingular : unidadePlural}`;
}

function formatarTempoInatividadePreviaWhatsapp(
  encerramento: EncerramentoInatividadePreviaWhatsapp
) {
  const quantidade = Math.max(1, Number(encerramento.quantidade || 1));
  const unidadeSingular =
    encerramento.unidade === "minutos" ? "minuto" : "hora";
  const unidadePlural =
    encerramento.unidade === "minutos" ? "minutos" : "horas";

  return `${quantidade} ${quantidade === 1 ? unidadeSingular : unidadePlural}`;
}

function variaveisTemplatePreviaWhatsapp(valor: unknown) {
  if (Array.isArray(valor)) {
    return valor.map((item) => String(item || "").trim()).join("\n");
  }

  return String(valor || "");
}

function templatePorIdPreviaWhatsapp(
  templates: TemplateWhatsappOpcao[],
  templateId: unknown
) {
  const id = String(templateId || "");
  if (!id) return null;

  return templates.find((template) => template.id === id) || null;
}

function montarMensagemTemplatePreviaWhatsapp(
  id: string,
  template: TemplateWhatsappOpcao | null,
  variaveis: unknown
): MensagemPreviaWhatsapp {
  const preview = montarPreviewTemplateWhatsapp(
    template,
    variaveisTemplatePreviaWhatsapp(variaveis)
  );

  if (!preview) {
    return criarMensagemPreviaWhatsapp(
      id,
      "bot",
      "Template WhatsApp ainda nao selecionado."
    );
  }

  return criarMensagemPreviaWhatsapp(id, "bot", preview.corpo, {
    titulo: preview.titulo,
    rodape: preview.rodape,
    botoes: preview.botoes,
  });
}

function botoesTextoPreviaWhatsapp(valor: unknown, campoTitulo = "titulo") {
  if (!Array.isArray(valor)) return [];

  return valor
    .map((item) =>
      textoPreviaWhatsapp((item as Record<string, unknown>)?.[campoTitulo])
    )
    .filter(Boolean)
    .slice(0, 6);
}

function mensagensDoNodePreviaWhatsapp(
  node: Node,
  templatesWhatsapp: TemplateWhatsappOpcao[]
) {
  const tipoNo = String(node.data?.tipo_no || "");
  const configuracao = (node.data?.configuracao_json || {}) as Record<
    string,
    unknown
  >;
  const delayLabel = formatarDelayPreviaWhatsapp(node.data?.delay_segundos);
  const tituloNodeAtual = textoPreviaWhatsapp(
    node.data?.titulo,
    labelTipoNo(tipoNo)
  );
  const idBase = node.id;
  const mensagem = textoPreviaWhatsapp(configuracao.mensagem);
  const mensagemPadrao = (fallback: string) =>
    textoPreviaWhatsapp(configuracao.mensagem, fallback);

  if (tipoNo === "inicio") return [];

  if (tipoNo === "enviar_texto") {
    return [
      criarMensagemPreviaWhatsapp(
        `${idBase}-texto`,
        "bot",
        mensagemPadrao("Digite a mensagem aqui."),
        { delayLabel }
      ),
    ];
  }

  if (tipoNo === "pergunta_opcoes") {
    return [
      criarMensagemPreviaWhatsapp(
        `${idBase}-pergunta`,
        "bot",
        mensagemPadrao("Escolha uma opcao:"),
        {
          botoes: botoesTextoPreviaWhatsapp(configuracao.opcoes),
          delayLabel,
        }
      ),
    ];
  }

  if (tipoNo === TIPO_NO_PERGUNTA_LIVRE_IA) {
    return [
      criarMensagemPreviaWhatsapp(
        `${idBase}-pergunta-ia`,
        "bot",
        mensagemPadrao("Como posso te ajudar?"),
        { delayLabel }
      ),
    ];
  }

  if (tipoNo === "enviar_botoes") {
    return [
      criarMensagemPreviaWhatsapp(
        `${idBase}-botoes`,
        "bot",
        mensagemPadrao("Escolha uma opcao:"),
        {
          botoes: botoesTextoPreviaWhatsapp(configuracao.botoes),
          delayLabel,
        }
      ),
    ];
  }

  if (tipoNo === "botao_redirect") {
    return [
      criarMensagemPreviaWhatsapp(
        `${idBase}-redirect`,
        "bot",
        mensagemPadrao("Clique no botao abaixo para acessar."),
        {
          botoes: [textoPreviaWhatsapp(configuracao.botao_texto, "Acessar")],
          delayLabel,
        }
      ),
    ];
  }

  if (
    tipoNo === "enviar_imagem" ||
    tipoNo === "enviar_video" ||
    tipoNo === "enviar_audio" ||
    tipoNo === "enviar_arquivo"
  ) {
    const midiaTipo =
      tipoNo === "enviar_imagem"
        ? "imagem"
        : tipoNo === "enviar_video"
          ? "video"
          : tipoNo === "enviar_audio"
            ? "audio"
            : "arquivo";
    const fallback =
      midiaTipo === "imagem"
        ? "Imagem enviada pelo atendimento."
        : midiaTipo === "video"
          ? "Video enviado pelo atendimento."
          : midiaTipo === "audio"
            ? "Audio enviado pelo atendimento."
            : "Arquivo enviado pelo atendimento.";

    return [
      criarMensagemPreviaWhatsapp(
        `${idBase}-midia`,
        "bot",
        mensagem || fallback,
        {
          titulo: textoPreviaWhatsapp(configuracao.midia_nome, tituloNodeAtual),
          midiaTipo,
          delayLabel,
        }
      ),
    ];
  }

  if (tipoNo === "avaliacao") {
    const notaMinima = Math.max(0, Number(configuracao.nota_minima ?? 1));
    const notaMaxima = Math.max(
      notaMinima,
      Number(configuracao.nota_maxima ?? 5)
    );
    const notas = Array.from(
      { length: Math.min(6, notaMaxima - notaMinima + 1) },
      (_, index) => String(notaMinima + index)
    );

    return [
      criarMensagemPreviaWhatsapp(
        `${idBase}-avaliacao`,
        "bot",
        mensagemPadrao("De 1 a 5, como voce avalia este atendimento?"),
        { botoes: notas, delayLabel }
      ),
    ];
  }

  if (tipoNo === "capturar_resposta") {
    return [
      criarMensagemPreviaWhatsapp(
        `${idBase}-captura`,
        "bot",
        mensagemPadrao("Me informe seu nome, por favor."),
        { delayLabel }
      ),
    ];
  }

  if (tipoNo === "transferir_setor") {
    return [
      criarMensagemPreviaWhatsapp(
        `${idBase}-transferir`,
        "sistema",
        "Atendimento transferido para a equipe responsavel."
      ),
    ];
  }

  if (tipoNo === "encerrar") {
    const mensagens: MensagemPreviaWhatsapp[] = [];

    if (mensagem) {
      mensagens.push(
        criarMensagemPreviaWhatsapp(`${idBase}-encerrar-msg`, "bot", mensagem, {
          delayLabel,
        })
      );
    }

    mensagens.push(
      criarMensagemPreviaWhatsapp(
        `${idBase}-encerrar`,
        "sistema",
        "Fluxo encerrado."
      )
    );

    return mensagens;
  }

  if (tipoNo === "agendar_disparo") {
    const template = templatePorIdPreviaWhatsapp(
      templatesWhatsapp,
      configuracao.template_id
    );

    return [
      criarMensagemPreviaWhatsapp(
        `${idBase}-agendamento-info`,
        "sistema",
        `Disparo agendado para daqui a ${formatarTempoAgendamentoPreviaWhatsapp(
          configuracao
        )}.`
      ),
      montarMensagemTemplatePreviaWhatsapp(
        `${idBase}-template`,
        template,
        configuracao.variaveis
      ),
    ];
  }

  if (tipoNo === "agenda_buscar_agendamento") {
    return [
      criarMensagemPreviaWhatsapp(
        `${idBase}-agenda-busca`,
        "bot",
        textoPreviaWhatsapp(
          configuracao.mensagem_encontrado || configuracao.mensagem,
          "Encontrei seu agendamento para {{agenda_data}} às {{agenda_hora}}."
        ),
        { delayLabel }
      ),
    ];
  }

  if (tipoNo === "agenda_escolher_horario") {
    return [
      criarMensagemPreviaWhatsapp(
        `${idBase}-agenda-escolha`,
        "bot",
        mensagemPadrao(
          "Qual dia voce quer marcar? Pode responder: hoje, amanha, dia 22, 22/05 ou sexta-feira."
        ),
        { delayLabel }
      ),
      criarMensagemPreviaWhatsapp(
        `${idBase}-agenda-horarios`,
        "bot",
        textoPreviaWhatsapp(
          configuracao.mensagem_listar_horarios,
          "Para {{agenda_data_nova}}, estes horários estão disponíveis.\n\nResponda com o número da opção desejada ou informe outra data:"
        ),
        { botoes: ["14:00", "14:30", "15:00"] }
      ),
    ];
  }

  if (
    tipoNo === "agenda_criar_agendamento" ||
    tipoNo === "agenda_remarcar_agendamento" ||
    tipoNo === "agenda_cancelar_agendamento"
  ) {
    const mensagens: MensagemPreviaWhatsapp[] = [
      criarMensagemPreviaWhatsapp(
        `${idBase}-agenda-confirmacao`,
        "bot",
        mensagemPadrao(
          tipoNo === "agenda_cancelar_agendamento"
            ? "Pronto, seu horario de {{agenda_data}} as {{agenda_hora}} foi cancelado."
            : tipoNo === "agenda_remarcar_agendamento"
              ? "Remarcado! Seu horario agora ficou para {{agenda_data}} as {{agenda_hora}}."
              : "Agendado! Seu horario ficou marcado para {{agenda_data}} as {{agenda_hora}}."
        ),
        { delayLabel }
      ),
    ];

    if (
      tipoNo === "agenda_criar_agendamento" &&
      configuracao.lembrete_agendamento_ativo &&
      configuracao.lembrete_agendamento_whatsapp
    ) {
      const template = templatePorIdPreviaWhatsapp(
        templatesWhatsapp,
        configuracao.lembrete_agendamento_template_id
      );

      mensagens.push(
        criarMensagemPreviaWhatsapp(
          `${idBase}-agenda-lembrete-info`,
          "sistema",
          "Lembrete WhatsApp programado para antes do horario."
        ),
        montarMensagemTemplatePreviaWhatsapp(
          `${idBase}-agenda-lembrete-template`,
          template,
          configuracao.lembrete_agendamento_variaveis
        )
      );
    }

    return mensagens;
  }

  if (tipoNo === "interpretar_arquivo_ia") {
    return [
      criarMensagemPreviaWhatsapp(
        `${idBase}-arquivo-ia`,
        "bot",
        mensagemPadrao("Envie o arquivo para analise."),
        { delayLabel }
      ),
    ];
  }

  if (mensagem) {
    return [
      criarMensagemPreviaWhatsapp(`${idBase}-mensagem`, "bot", mensagem, {
        delayLabel,
      }),
    ];
  }

  return [
    criarMensagemPreviaWhatsapp(
      `${idBase}-sistema`,
      "sistema",
      `${labelTipoNo(tipoNo)}: ${tituloNodeAtual}`
    ),
  ];
}

function condicaoPreviaWhatsapp(edge: Edge, nodeOrigem?: Node | null) {
  const data = edge.data as
    | {
        condicao_json?: Record<string, unknown>;
        rotulo?: string | null;
        usar_ia?: boolean;
      }
    | undefined;
  const condicao = data?.condicao_json || {};
  const tipo = String(condicao.tipo || "");

  if (!tipo || tipo === "sempre") return null;

  if (tipo === "timeout_sem_resposta") {
    const quantidade = Number(condicao.tempo_quantidade || 0);
    const unidade = String(condicao.tempo_unidade || "");
    const texto =
      quantidade > 0 && unidade
        ? `Sem resposta em ${quantidade} ${unidade}.`
        : "Sem resposta do contato.";

    return criarMensagemPreviaWhatsapp(`${edge.id}-timeout`, "sistema", texto);
  }

  const valor = textoPreviaWhatsapp(condicao.valor);
  const opcao =
    valor && nodeOrigem
      ? opcoesRespostaDoNo(nodeOrigem).find((item) => item.valor === valor)
      : null;
  const texto =
    textoPreviaWhatsapp(opcao?.titulo) ||
    textoPreviaWhatsapp(data?.rotulo) ||
    valor ||
    textoPreviaWhatsapp(typeof edge.label === "string" ? edge.label : "") ||
    "Resposta do contato";

  return criarMensagemPreviaWhatsapp(`${edge.id}-resposta`, "contato", texto);
}

function rotuloOpcaoJornadaPreviaWhatsapp(
  edge: Edge,
  nodeOrigem: Node | null | undefined,
  nodeDestino: Node | null | undefined,
  index: number
) {
  const data = edge.data as
    | {
        condicao_json?: Record<string, unknown>;
        rotulo?: string | null;
      }
    | undefined;
  const condicao = data?.condicao_json || {};
  const tipo = String(condicao.tipo || "");

  if (tipo === "timeout_sem_resposta") {
    const quantidade = Number(condicao.tempo_quantidade || 0);
    const unidade = String(condicao.tempo_unidade || "");

    return quantidade > 0 && unidade
      ? `Sem resposta em ${quantidade} ${unidade}`
      : "Sem resposta";
  }

  const valor = textoPreviaWhatsapp(condicao.valor);
  const opcao =
    valor && nodeOrigem
      ? opcoesRespostaDoNo(nodeOrigem).find((item) => item.valor === valor)
      : null;
  const destino = nodeDestino ? tituloVisivelCard(nodeDestino.data) : "";

  return (
    textoPreviaWhatsapp(opcao?.titulo) ||
    textoPreviaWhatsapp(data?.rotulo) ||
    valor ||
    textoPreviaWhatsapp(typeof edge.label === "string" ? edge.label : "") ||
    destino ||
    `Caminho ${index + 1}`
  );
}

function ordenarNodesPreviaWhatsapp(nodes: Node[]) {
  return [...nodes].sort((a, b) => {
    const y = (a.position?.y || 0) - (b.position?.y || 0);
    if (Math.abs(y) > 20) return y;

    return (a.position?.x || 0) - (b.position?.x || 0);
  });
}

export function montarPreviaWhatsappFluxo(
  nodes: Node[],
  edges: Edge[],
  templatesWhatsapp: TemplateWhatsappOpcao[],
  respostasSelecionadas: Record<string, string>,
  encerramentoInatividade?: EncerramentoInatividadePreviaWhatsapp | null
): PreviaWhatsappFluxo {
  const totalBlocos = nodes.filter(
    (node) => String(node.data?.tipo_no || "") !== "inicio"
  ).length;
  const mensagens: MensagemPreviaWhatsapp[] = [];
  const nodesOrdenados = ordenarNodesPreviaWhatsapp(nodes);
  const inicio =
    nodes.find((node) => String(node.data?.tipo_no || "") === "inicio") ||
    nodesOrdenados[0] ||
    null;
  const nodesPorId = new Map(nodes.map((node) => [node.id, node]));
  const indiceEdge = new Map(edges.map((edge, index) => [edge.id, index]));
  const edgesPorOrigem = new Map<string, Edge[]>();

  for (const edge of edges) {
    const lista = edgesPorOrigem.get(edge.source) || [];
    lista.push(edge);
    edgesPorOrigem.set(edge.source, lista);
  }

  for (const [origem, lista] of edgesPorOrigem) {
    edgesPorOrigem.set(
      origem,
      [...lista].sort((a, b) => {
        const condicaoA = (
          (a.data as EdgeDataConexao | undefined)?.condicao_json || {}
        ).tipo;
        const condicaoB = (
          (b.data as EdgeDataConexao | undefined)?.condicao_json || {}
        ).tipo;

        if (condicaoA === "sempre" && condicaoB !== "sempre") return -1;
        if (condicaoA !== "sempre" && condicaoB === "sempre") return 1;

        const destinoA = nodesPorId.get(a.target);
        const destinoB = nodesPorId.get(b.target);
        const y = (destinoA?.position?.y || 0) - (destinoB?.position?.y || 0);
        if (Math.abs(y) > 20) return y;

        const x = (destinoA?.position?.x || 0) - (destinoB?.position?.x || 0);
        if (Math.abs(x) > 20) return x;

        return (indiceEdge.get(a.id) || 0) - (indiceEdge.get(b.id) || 0);
      })
    );
  }

  const visitados = new Set<string>();
  let truncado = false;

  function adicionarMensagem(mensagem: MensagemPreviaWhatsapp) {
    if (mensagens.length >= LIMITE_MENSAGENS_PREVIA_WHATSAPP) {
      truncado = true;
      return;
    }

    mensagens.push(mensagem);
  }

  function caminhar(node: Node | null | undefined, viaEdge?: Edge) {
    if (!node) return;

    if (viaEdge) {
      const origem = nodesPorId.get(viaEdge.source) || null;
      const mensagemCondicao = condicaoPreviaWhatsapp(viaEdge, origem);

      if (mensagemCondicao) adicionarMensagem(mensagemCondicao);
    }

    if (visitados.has(node.id)) {
      adicionarMensagem(
        criarMensagemPreviaWhatsapp(
          `${viaEdge?.id || node.id}-retorno-loop`,
          "sistema",
          `Retorna para "${tituloVisivelCard(
            node.data
          )}". Esta jornada repete esse trecho ate outra resposta ser selecionada.`
        )
      );
      return;
    }

    visitados.add(node.id);

    for (const mensagem of mensagensDoNodePreviaWhatsapp(
      node,
      templatesWhatsapp
    )) {
      adicionarMensagem(mensagem);
    }

    const saidas = edgesPorOrigem.get(node.id) || [];
    if (saidas.length === 0) return;

    const edgeSelecionada =
      saidas.find((edge) => edge.id === respostasSelecionadas[node.id]) ||
      saidas[0];
    if (!edgeSelecionada) return;

    if (saidas.length > 1) {
      adicionarMensagem({
        id: `${node.id}-seletor-jornada`,
        tipo: "seletor",
        texto: "Respostas para visualizar",
        sourceNodeId: node.id,
        opcoesJornada: saidas.map((edge, index) => {
          const destino = nodesPorId.get(edge.target) || null;

          return {
            edgeId: edge.id,
            texto: rotuloOpcaoJornadaPreviaWhatsapp(
              edge,
              node,
              destino,
              index
            ),
            selecionada: edge.id === edgeSelecionada.id,
          };
        }),
      });
    }

    caminhar(nodesPorId.get(edgeSelecionada.target), edgeSelecionada);
  }

  caminhar(inicio);

  if (encerramentoInatividade) {
    const tempoInatividade =
      formatarTempoInatividadePreviaWhatsapp(encerramentoInatividade);

    adicionarMensagem({
      id: "encerramento-inatividade-divisoria",
      tipo: "divisoria",
      texto: `Encerramento por inatividade - ${tempoInatividade} sem resposta`,
    });

    adicionarMensagem(
      criarMensagemPreviaWhatsapp(
        "encerramento-inatividade-mensagem",
        "bot",
        encerramentoInatividade.mensagem,
        { delayLabel: `apos ${tempoInatividade}` }
      )
    );

    adicionarMensagem(
      criarMensagemPreviaWhatsapp(
        "encerramento-inatividade-fim",
        "sistema",
        "Fluxo encerrado por inatividade."
      )
    );
  }

  return {
    mensagens,
    totalBlocos,
    totalRotas: edges.length,
    truncado,
  };
}
