import {
  INSTRUCAO_ARQUITETURA_FLUXOS,
  VERSAO_PROMPT_MESTRE_FLUXOS,
} from "./route-arquitetura-fluxos-ia.ts";

export const VERSAO_REFORCO_COPY_FAQ_FLUXOS =
  "crm-prosperity-copy-faq-v1-2026-07-25";

const INSTRUCAO_REFORCO_COPY_FAQ_FLUXOS = `
======================================================================
ADENDO OBRIGATORIO — FAQ ESPECIFICO E COPY SEGMENTADA
VERSAO: ${VERSAO_REFORCO_COPY_FAQ_FLUXOS}
======================================================================

Este adendo complementa o Prompt Mestre e e obrigatorio.
Ele existe para impedir respostas genericas de FAQ e mensagens longas demais.
Em caso de orientacao generica anterior, aplique a regra mais especifica deste adendo.
O schema, os tipos tecnicos e os recursos reais continuam tendo prioridade.

======================================================================
REGRA 1 — MATRIZ INTERNA DE FAQ
======================================================================

Antes de criar etapas e rotas de qualquer FAQ, monte silenciosamente uma matriz com:
- contexto do FAQ;
- ID da opcao;
- texto da pergunta;
- intencao semantica;
- ref exclusiva da resposta;
- objetivo exato da resposta;
- ref do menu posterior daquele contexto.

Exemplo interno correto:
- faq_servico_dor -> resposta_faq_servico_dor;
- faq_servico_duracao -> resposta_faq_servico_duracao;
- faq_servico_resultado -> resposta_faq_servico_resultado;
- faq_servico_manutencao -> resposta_faq_servico_manutencao.

Para N perguntas semanticamente diferentes, crie N blocos de resposta dedicados.
Cada rota de pergunta deve apontar para a resposta correspondente.
Nao use uma unica resposta compartilhada para perguntas diferentes.
Nao use refs genericas como resposta_faq para concentrar todo o FAQ.

E expressamente proibido ligar perguntas diferentes ao mesmo destino quando elas tratam de:
- dor;
- duracao;
- prazo para perceber resultado;
- quantidade de sessoes;
- recorrencia;
- naturalidade;
- seguranca;
- manutencao;
- preco;
- elegibilidade;
- documentos;
- entrega;
- garantia;
- disponibilidade.

Mesmo quando a resposta exigir avaliacao individual, ela deve responder primeiro a pergunta concreta.
Uma frase generica como "cada pessoa e diferente" nao constitui resposta suficiente.

======================================================================
REGRA 2 — CONTEUDO DAS RESPOSTAS DE FAQ
======================================================================

Toda resposta de FAQ deve seguir esta ordem:
1. responder diretamente a pergunta na primeira frase;
2. explicar de forma curta o principal fator que pode variar;
3. informar limite, cuidado ou dependencia sem inventar dados;
4. encaminhar para uma decisao posterior coerente.

Quando o pedido nao fornecer um numero exato, nao invente.
Ainda assim, responda de forma especifica.

Exemplo ruim para "O tratamento doi?":
- "Cada paciente pode ter uma percepcao diferente. A avaliacao e importante."

Exemplo melhor:
- "Pode haver desconforto leve, mas a intensidade depende da tecnica e da sensibilidade de cada pessoa. Na avaliacao, a especialista explica os cuidados usados para tornar o procedimento mais confortavel."

Exemplo ruim para "Quanto tempo dura o resultado?":
- "Cada paciente e unico e precisa de avaliacao."

Exemplo melhor quando nao existe prazo fornecido:
- "A duracao varia conforme o procedimento, o organismo e os cuidados posteriores. A especialista define uma expectativa individual durante a avaliacao, sem prometer um prazo fixo antes de conhecer o caso."

Nao transforme todas as respostas em convite para avaliacao.
A resposta precisa entregar valor antes do CTA.
Nao repita exatamente o mesmo texto em FAQs diferentes.
Nao copie a descricao_ia como mensagem ao cliente.

======================================================================
REGRA 3 — PERGUNTAS DUPLICADAS OU SOBREPOSTAS
======================================================================

Antes de finalizar cada menu de FAQ, compare as perguntas entre si.
Remova ou una perguntas que representam a mesma intencao.

Exemplos de duplicidade:
- "Quanto tempo dura?" e "Quanto tempo dura o Botox?" no mesmo FAQ;
- "Quando vejo resultado?" e "Em quanto tempo aparece o resultado?";
- "Precisa de manutencao?" e "Tem que fazer retoque?", quando o contexto indica a mesma resposta.

Mantenha apenas a formulacao mais clara.
Use o espaco liberado para uma duvida realmente diferente somente quando houver base no pedido.
Nao invente uma nova pergunta tecnica apenas para completar quantidade.

======================================================================
REGRA 4 — NAVEGACAO DEPOIS DA RESPOSTA
======================================================================

A resposta dedicada pode seguir por rota sempre para um menu posterior curto.
Esse menu posterior deve preservar o contexto do FAQ.

Padrao recomendado:
faq_servico
-> resposta_faq_servico_dor
-> menu_pos_faq_servico

faq_servico
-> resposta_faq_servico_duracao
-> menu_pos_faq_servico

O menu_pos_faq_servico pode oferecer:
- Outras duvidas: retorna para faq_servico;
- Agendar ou proximo passo: segue para a jornada correspondente;
- Voltar ao servico: retorna ao menu contextual do servico.

Nao use um menu_pos_faq global quando isso fizer o cliente perder o contexto.
Nao retorne automaticamente ao texto introdutorio do produto ou servico.
Nao envie automaticamente para agendamento depois de responder uma duvida.

======================================================================
REGRA 5 — UMA MENSAGEM, UM OBJETIVO DE COMUNICACAO
======================================================================

Cada bloco mensagem deve cumprir um objetivo principal.
Nao concentre em uma unica mensagem todos estes assuntos:
- explicacao;
- beneficios;
- indicacoes;
- funcionamento;
- cuidados;
- duracao;
- recuperacao;
- resultados;
- CTA.

A divisao em mais blocos e obrigatoria quando ocorrer qualquer condicao:
- o conteudo possui cinco ou mais secoes tematicas;
- a mensagem estimada ultrapassa aproximadamente 700 caracteres;
- existem mais de seis itens de lista;
- existem mais de quatro paragrafos com funcoes diferentes;
- o usuario pede para separar telas;
- a leitura no WhatsApp ficaria cansativa em uma unica tela.

Uma mensagem nunca deve ultrapassar aproximadamente 900 caracteres, salvo texto literal indivisivel exigido pelo usuario.
Quando um texto literal longo precisar ser preservado, divida-o em ordem, sem omitir trechos e sem alterar o sentido.

Evite o extremo oposto:
- nao crie uma mensagem para cada frase;
- nao crie blocos com apenas titulo ou uma linha sem funcao;
- nao fragmente uma ideia unica em varias notificacoes desnecessarias.

Faixa preferencial por mensagem informativa:
- aproximadamente 250 a 650 caracteres;
- dois a cinco paragrafos curtos; ou
- uma introducao curta e tres a seis itens de lista.

======================================================================
REGRA 6 — PAGINAS COMPLETAS DE PRODUTO, SERVICO OU PROCEDIMENTO
======================================================================

Quando o pedido exigir explicacao, beneficios, indicacoes, cuidados, duracao, recuperacao e resultados, crie no minimo tres blocos de mensagem antes do menu de acoes.

Estrutura recomendada:
1. apresentacao_<item>
   - o que e;
   - principal proposta de valor;
   - para quem pode fazer sentido.

2. beneficios_indicacoes_<item>
   - beneficios;
   - indicacoes;
   - funcionamento essencial quando aplicavel.

3. cuidados_resultados_<item>
   - cuidados ou requisitos;
   - duracao ou prazo sem inventar;
   - recuperacao ou entrega;
   - resultados esperados sem promessas.

4. menu_<item>
   - proximas acoes;
   - FAQ;
   - valores;
   - midia;
   - agendamento;
   - retorno.

Conecte os blocos informativos em sequencia com rotas sempre.
Somente o ultimo bloco informativo deve levar ao menu de decisao.
Nao repita CTA em todos os blocos.
Nao repita o nome completo do item em cada mensagem.
Nao omita conteudo para reduzir a quantidade de etapas.

Se o pedido contiver menos conteudo, use dois blocos quando isso melhorar a leitura.
Se houver apenas uma ideia curta, mantenha um bloco.
A quantidade de blocos deve acompanhar a quantidade real de informacao.

======================================================================
REGRA 7 — QUALIDADE DA COPY
======================================================================

Escreva para leitura em WhatsApp:
- abra com a informacao mais importante;
- use frases diretas;
- use paragrafos curtos;
- use listas somente quando facilitarem a comparacao;
- use subtitulos curtos quando houver mudanca de assunto;
- preserve espacos e quebras de linha;
- evite linguagem burocratica;
- evite adjetivos vazios;
- evite repetir "personalizado", "exclusivo", "premium" e "especialista" sem necessidade;
- evite repetir o mesmo CTA em telas consecutivas;
- adapte o vocabulario ao publico;
- mantenha elegancia sem parecer artificial;
- nao invente beneficios, garantias, prazos ou resultados;
- nao escreva texto generico que serviria para qualquer empresa quando o contexto permite ser especifico.

Cada mensagem deve se conectar naturalmente com a anterior.
A primeira frase nao deve repetir a ultima frase do bloco anterior.
O ultimo bloco informativo deve preparar a escolha seguinte sem pressionar o cliente.
Menus devem ter mensagem curta e orientada a decisao.

Quando o usuario fornecer uma copy literal:
- preserve os fatos e o sentido;
- preserve frases marcadas como exatas;
- pode melhorar pontuacao e quebras apenas quando o pedido permitir;
- nao substitua a copy por um resumo mais pobre;
- divida em blocos quando for longa, mantendo a ordem.

======================================================================
REGRA 8 — CHECKLIST ESPECIFICO ANTES DA RESPOSTA
======================================================================

Execute silenciosamente este checklist alem do checklist principal:

FAQ
[ ] Conte o numero de opcoes de pergunta de cada FAQ.
[ ] Conte o numero de refs de resposta dedicadas daquele FAQ.
[ ] Os numeros sao iguais para perguntas semanticamente diferentes.
[ ] Nenhuma pergunta diferente compartilha o mesmo bloco de resposta.
[ ] Toda resposta inicia respondendo exatamente a pergunta.
[ ] Nenhuma resposta e apenas uma evasiva generica.
[ ] Perguntas duplicadas foram removidas ou unificadas.
[ ] Cada resposta segue para navegacao coerente com o mesmo contexto.

COPY
[ ] Nenhuma mensagem concentra cinco ou mais assuntos independentes.
[ ] Mensagens estimadas acima de 700 caracteres foram avaliadas para divisao.
[ ] Mensagens acima de 900 caracteres foram divididas, salvo literal indivisivel.
[ ] Servicos com sete categorias de conteudo possuem pelo menos tres blocos informativos.
[ ] Cada bloco possui objetivo proprio e titulo semantico.
[ ] Nenhum conteudo obrigatorio foi perdido durante a divisao.
[ ] Nao existem blocos minusculos sem funcao.
[ ] CTAs nao foram repetidos em todos os blocos.
[ ] A leitura completa forma uma sequencia natural.

Se qualquer item falhar, corrija as etapas e rotas antes de devolver o JSON.
Nao registre a falha em avisos.
Nao espere o backend corrigir.
`.trim();

export type AgendaAssistente = {
  id: string;
  nome: string;
  descricao: string | null;
  timezone: string | null;
  duracao_minutos: number | null;
  janela_dias: number | null;
};

export type MidiaAssistente = {
  id: string;
  nome: string;
  tipo: "imagem" | "video" | "audio" | "arquivo";
  url: string;
};

export type ContextoAssistenteFluxos = {
  ativo: true;
  modo: string;
  instrucaoCompleta: string;
  agendas: AgendaAssistente[];
  midias: MidiaAssistente[];
  empresaId?: string | null;
  usuarioId?: string | null;
  sessaoId?: string | null;
};

type ObjetoJson = Record<string, unknown>;

const TIPOS_AGENDA = [
  "agenda_escolher_horario",
  "agenda_criar_agendamento",
  "agenda_buscar_agendamento",
  "agenda_remarcar_agendamento",
  "agenda_cancelar_agendamento",
];

const ESTRATEGIAS_DISTRIBUICAO = [
  "fila_setor",
  "atendente_especifico",
  "rodizio_aleatorio",
  "menos_conversas",
];

function objeto(valor: unknown): ObjetoJson {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as ObjetoJson)
    : {};
}

function localizarMensagem(
  payload: ObjetoJson,
  role: "system" | "user"
): ObjetoJson | null {
  if (!Array.isArray(payload.input)) return null;
  const mensagem = payload.input.find((item) => objeto(item).role === role);
  return mensagem ? objeto(mensagem) : null;
}

function textoConteudoMensagem(mensagem: ObjetoJson | null) {
  if (!mensagem) return "";
  if (typeof mensagem.content === "string") return mensagem.content;
  if (!Array.isArray(mensagem.content)) return "";

  return mensagem.content
    .map(objeto)
    .filter((item) => item.type === "input_text")
    .map((item) => String(item.text || ""))
    .join("");
}

function definirConteudoMensagem(mensagem: ObjetoJson | null, texto: string) {
  if (!mensagem) return;
  mensagem.content = texto;
}

function contextoOriginal(payload: ObjetoJson) {
  const bruto = textoConteudoMensagem(localizarMensagem(payload, "user"));
  try {
    return objeto(JSON.parse(bruto));
  } catch {
    return {};
  }
}

function modoPrompt(modo: string) {
  return [
    "",
    "======================================================================",
    "CONTRATO DESTA EXECUCAO",
    "======================================================================",
    `Modo solicitado: ${modo}.`,
    `Versao do Prompt Mestre: ${VERSAO_PROMPT_MESTRE_FLUXOS}.`,
    `Versao do reforco de FAQ e copy: ${VERSAO_REFORCO_COPY_FAQ_FLUXOS}.`,
    "Planeje e revise internamente, mas responda uma unica vez.",
    "Nao gere clarificacoes. Use clarificacoes: [].",
    "Nao dependa de reparo, revisao ou interpretacao posterior do backend.",
    "O schema JSON estrito enviado no response_format e o contrato formal da resposta.",
  ].join("\n");
}

function substituirPromptSistema(
  payload: ObjetoJson,
  contexto: ContextoAssistenteFluxos
) {
  const mensagem = localizarMensagem(payload, "system");
  definirConteudoMensagem(
    mensagem,
    `${INSTRUCAO_ARQUITETURA_FLUXOS}\n\n${INSTRUCAO_REFORCO_COPY_FAQ_FLUXOS}${modoPrompt(contexto.modo)}`
  );
}

function organizarContextoUsuario(
  payload: ObjetoJson,
  contexto: ContextoAssistenteFluxos
) {
  const mensagem = localizarMensagem(payload, "user");
  if (!mensagem) return;

  const raiz = contextoOriginal(payload);
  const recursos = objeto(raiz.recursos);
  const fluxoAtual = objeto(raiz.fluxo_atual);

  const conteudoOrganizado = {
    secao_solicitacao_usuario: {
      titulo: "SOLICITACAO DO USUARIO",
      texto: contexto.instrucaoCompleta,
      regra:
        "Preserve todos os requisitos explicitos. Nao resuma, nao omita e nao reinterpretar para simplificar.",
    },
    secao_empresa: {
      titulo: "EMPRESA",
      dados: objeto(raiz.empresa),
    },
    secao_recursos_disponiveis: {
      titulo: "RECURSOS DISPONIVEIS",
      setores: Array.isArray(recursos.setores) ? recursos.setores : [],
      agendas: contexto.agendas,
      midias: contexto.midias,
      variaveis: Array.isArray(recursos.variaveis) ? recursos.variaveis : [],
      regra:
        "IDs desta secao sao a unica fonte valida. Nao invente setor, agenda, midia ou variavel existente.",
    },
    secao_fluxo_atual: {
      titulo: "FLUXO ATUAL",
      aplicavel: contexto.modo !== "criar_fluxo",
      dados:
        contexto.modo !== "criar_fluxo" && Object.keys(fluxoAtual).length > 0
          ? fluxoAtual
          : null,
    },
    secao_schema_json: {
      titulo: "SCHEMA JSON",
      fornecido_em: "response_format.text.format.schema",
      nome: "plano_assistente_fluxos",
      strict: true,
      regra:
        "Responda exclusivamente no schema. Nao adicione campos e nao remova campos obrigatorios.",
    },
    secao_contrato_saida: {
      titulo: "CONTRATO DE SAIDA",
      modo: contexto.modo,
      uma_unica_resposta: true,
      planejamento_interno: true,
      revisao_interna: true,
      planejamento_posterior_no_sistema: false,
      revisao_posterior_no_sistema: false,
      reparo_semantico_no_sistema: false,
      clarificacoes: [],
      formato: "JSON final completo",
    },
  };

  definirConteudoMensagem(mensagem, JSON.stringify(conteudoOrganizado));
}

function expandirSchemaEtapas(payload: ObjetoJson) {
  const text = objeto(payload.text);
  const format = objeto(text.format);
  const schema = objeto(format.schema);
  const propriedadesRaiz = objeto(schema.properties);
  const etapas = objeto(propriedadesRaiz.etapas);
  const items = objeto(etapas.items);
  const propriedadesEtapa = objeto(items.properties);
  const tipo = objeto(propriedadesEtapa.tipo);
  const tipos = Array.isArray(tipo.enum) ? [...tipo.enum] : [];

  for (const tipoAgenda of TIPOS_AGENDA) {
    if (!tipos.includes(tipoAgenda)) tipos.push(tipoAgenda);
  }

  tipo.enum = tipos;
  propriedadesEtapa.tipo = tipo;
  propriedadesEtapa.agenda_id = { type: ["string", "null"] };
  propriedadesEtapa.agenda_nome = { type: ["string", "null"] };
  propriedadesEtapa.estrategia_transferencia = {
    type: ["string", "null"],
    enum: [...ESTRATEGIAS_DISTRIBUICAO, null],
  };
  propriedadesEtapa.atendente_id = { type: ["string", "null"] };
  propriedadesEtapa.setor_excesso_tentativas = {
    type: ["string", "null"],
  };
  propriedadesEtapa.estrategia_excesso_tentativas = {
    type: ["string", "null"],
    enum: [...ESTRATEGIAS_DISTRIBUICAO, null],
  };
  propriedadesEtapa.atendente_excesso_tentativas = {
    type: ["string", "null"],
  };
  items.properties = propriedadesEtapa;

  const obrigatorios = Array.isArray(items.required)
    ? [...items.required]
    : [];

  for (const campo of [
    "agenda_id",
    "agenda_nome",
    "estrategia_transferencia",
    "atendente_id",
    "setor_excesso_tentativas",
    "estrategia_excesso_tentativas",
    "atendente_excesso_tentativas",
  ]) {
    if (!obrigatorios.includes(campo)) obrigatorios.push(campo);
  }

  items.required = obrigatorios;
  etapas.items = items;
  propriedadesRaiz.etapas = etapas;
  schema.properties = propriedadesRaiz;
  format.schema = schema;
  text.format = format;
  payload.text = text;
}

export function prepararPayloadAssistente(params: {
  body: Record<string, unknown>;
  limite: number;
  contexto: ContextoAssistenteFluxos;
}) {
  const payload = structuredClone(params.body);
  const limiteAtual = Number(payload.max_output_tokens || 0);

  payload.max_output_tokens = Math.max(
    Number.isFinite(limiteAtual) ? limiteAtual : 0,
    params.limite
  );

  expandirSchemaEtapas(payload);
  substituirPromptSistema(payload, params.contexto);
  organizarContextoUsuario(payload, params.contexto);

  return payload;
}
