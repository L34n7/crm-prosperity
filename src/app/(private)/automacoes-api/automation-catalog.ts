export type Categoria =
  | "agenda"
  | "conversas"
  | "contatos"
  | "imoveis"
  | "integracoes"
  | "sistema";

export type StatusRotina = "rascunho" | "ativa" | "pausada" | "erro";
export type Operador =
  | "igual"
  | "diferente"
  | "contem"
  | "nao_contem"
  | "existe"
  | "nao_existe"
  | "maior_que"
  | "menor_que"
  | "em"
  | "nao_em";

export type Gatilho = {
  id?: string;
  tipo: "evento" | "data_relativa" | "agendamento" | "webhook" | "manual";
  evento: string;
  entidade_tipo?: string | null;
  offset_minutos?: number | null;
  offset_referencia?: string | null;
  configuracao_json: Record<string, unknown>;
  ativo?: boolean;
};

export type Condicao = {
  id?: string;
  grupo: number;
  ordem: number;
  conjuncao: "and" | "or";
  campo: string;
  operador: Operador;
  valor_json: unknown;
  configuracao_json?: Record<string, unknown>;
};

export type Acao = {
  id?: string;
  ordem: number;
  tipo_acao: string;
  configuracao_json: Record<string, unknown>;
  ativo?: boolean;
};

export type Rotina = {
  id: string;
  nome: string;
  descricao: string | null;
  categoria: Categoria;
  status: StatusRotina;
  origem_tipo: string;
  origem_id: string | null;
  configuracao_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  gatilhos: Gatilho[];
  condicoes: Condicao[];
  acoes: Acao[];
  metricas: {
    execucoes_30_dias: number;
    concluidas_30_dias: number;
    erros_30_dias: number;
  };
};

export type Opcao = { id: string; nome: string; status?: string; ativo?: boolean };
export type Template = Opcao & {
  integracao_whatsapp_id: string;
  idioma?: string | null;
  categoria?: string | null;
  payload?: Record<string, unknown> | null;
};
export type IntegracaoWhatsapp = {
  id: string;
  nome_conexao: string;
  numero: string | null;
  status: string;
};
export type UsuarioAutomacao = {
  id: string;
  nome: string | null;
  is_administrador: boolean;
  setor_ids: string[];
};
export type IntegracaoApi = {
  id: string;
  nome: string;
  tipo?: string;
  base_url?: string;
  codigo_empresa?: string | null;
  status: string;
  ultimo_teste_em?: string | null;
  ultimo_erro?: string | null;
};

export type Opcoes = {
  calendarios: Opcao[];
  fluxos: Opcao[];
  templates: Template[];
  integracoes_whatsapp: IntegracaoWhatsapp[];
  etiquetas: Opcao[];
  setores: Opcao[];
  usuarios: UsuarioAutomacao[];
  integracoes_api: IntegracaoApi[];
};

export type Metricas = {
  total_rotinas: number;
  rotinas_ativas: number;
  com_erro: number;
  execucoes_30_dias: number;
  taxa_execucao: number | null;
};

export type FormRotina = {
  id?: string;
  nome: string;
  descricao: string;
  categoria: Categoria;
  status: "rascunho" | "ativa" | "pausada";
  gatilho: Gatilho;
  condicoes: Condicao[];
  acoes: Acao[];
};

export const metricasVazias: Metricas = {
  total_rotinas: 0,
  rotinas_ativas: 0,
  com_erro: 0,
  execucoes_30_dias: 0,
  taxa_execucao: null,
};

export const opcoesVazias: Opcoes = {
  calendarios: [],
  fluxos: [],
  templates: [],
  integracoes_whatsapp: [],
  etiquetas: [],
  setores: [],
  usuarios: [],
  integracoes_api: [],
};

export const categorias: Array<{ id: Categoria; nome: string; descricao: string }> = [
  { id: "agenda", nome: "Agenda", descricao: "Agendamentos, confirmações e status." },
  { id: "conversas", nome: "Conversas", descricao: "Fila, responsável e atendimento." },
  { id: "contatos", nome: "Contatos", descricao: "Cadastro, campos e etiquetas." },
  { id: "imoveis", nome: "Imóveis", descricao: "Criação, atualização e disponibilidade." },
  { id: "integracoes", nome: "Integrações", descricao: "Horários, webhooks e APIs externas." },
  { id: "sistema", nome: "Sistema", descricao: "Rotinas internas e execução manual." },
];

export const gatilhosPorCategoria: Record<
  Categoria,
  Array<{ evento: string; nome: string; tipo: Gatilho["tipo"] }>
> = {
  agenda: [
    { evento: "agenda.agendamento_criado", nome: "Agendamento criado", tipo: "evento" },
    { evento: "agenda.agendamento_confirmado", nome: "Agendamento confirmado", tipo: "evento" },
    { evento: "agenda.agendamento_reagendado", nome: "Agendamento reagendado", tipo: "evento" },
    { evento: "agenda.agendamento_cancelado", nome: "Agendamento cancelado", tipo: "evento" },
    { evento: "agenda.agendamento_realizado", nome: "Agendamento realizado", tipo: "evento" },
    { evento: "agenda.antes_inicio", nome: "Antes do início do agendamento", tipo: "data_relativa" },
    { evento: "agenda.depois_fim", nome: "Depois do fim do agendamento", tipo: "data_relativa" },
  ],
  conversas: [
    { evento: "mensagem.recebida", nome: "Mensagem recebida", tipo: "evento" },
    { evento: "conversa.criada", nome: "Conversa criada", tipo: "evento" },
    { evento: "conversa.assumida", nome: "Conversa assumida", tipo: "evento" },
    { evento: "conversa.transferida", nome: "Conversa transferida", tipo: "evento" },
    { evento: "conversa.encerrada", nome: "Conversa encerrada", tipo: "evento" },
    { evento: "conversa.sem_resposta", nome: "Conversa sem resposta", tipo: "data_relativa" },
  ],
  contatos: [
    { evento: "contato.criado", nome: "Contato criado", tipo: "evento" },
    { evento: "contato.atualizado", nome: "Contato atualizado", tipo: "evento" },
    { evento: "contato.etiqueta_adicionada", nome: "Etiqueta adicionada", tipo: "evento" },
  ],
  imoveis: [
    { evento: "imovel.criado", nome: "Imóvel criado", tipo: "evento" },
    { evento: "imovel.atualizado", nome: "Imóvel atualizado", tipo: "evento" },
    { evento: "imovel.indisponivel", nome: "Imóvel ficou indisponível", tipo: "evento" },
  ],
  integracoes: [
    { evento: "integracao.agendamento", nome: "Horário programado", tipo: "agendamento" },
    { evento: "integracao.webhook_recebido", nome: "Webhook recebido", tipo: "webhook" },
  ],
  sistema: [{ evento: "sistema.manual", nome: "Execução manual", tipo: "manual" }],
};

export const camposPorCategoria: Record<Categoria, Array<{ value: string; label: string }>> = {
  agenda: [
    { value: "agenda.status", label: "Status do agendamento" },
    { value: "agenda.confirmacao_status", label: "Status da confirmação" },
    { value: "agenda.calendario_id", label: "Calendário" },
    { value: "agenda.responsavel_id", label: "Responsável" },
    { value: "contato.telefone", label: "Telefone do contato" },
  ],
  conversas: [
    { value: "mensagem.texto", label: "Texto da mensagem" },
    { value: "mensagem.tipo", label: "Tipo da mensagem" },
    { value: "conversa.status", label: "Status da conversa" },
    { value: "conversa.setor_id", label: "Setor" },
    { value: "conversa.responsavel_id", label: "Responsável" },
    { value: "conversa.aguardando_atendente", label: "Aguardando atendente" },
  ],
  contatos: [
    { value: "contato.etiqueta_id", label: "Etiqueta" },
    { value: "contato.origem", label: "Origem" },
    { value: "contato.telefone", label: "Telefone" },
    { value: "contato.email", label: "E-mail" },
  ],
  imoveis: [
    { value: "imovel.status", label: "Status do imóvel" },
    { value: "imovel.tipo", label: "Tipo do imóvel" },
    { value: "imovel.finalidade", label: "Finalidade" },
    { value: "imovel.origem", label: "Origem" },
  ],
  integracoes: [
    { value: "integracao.status", label: "Status da integração" },
    { value: "payload.evento", label: "Evento recebido" },
    { value: "payload.status", label: "Status do payload" },
  ],
  sistema: [
    { value: "sistema.empresa_id", label: "Empresa" },
    { value: "sistema.horario", label: "Horário" },
  ],
};

export const operadores: Array<{ value: Operador; label: string }> = [
  { value: "igual", label: "exata" },
  { value: "diferente", label: "é diferente de" },
  { value: "contem", label: "contém" },
  { value: "nao_contem", label: "não contém" },
  { value: "existe", label: "existe" },
  { value: "nao_existe", label: "não existe" },
  { value: "maior_que", label: "é maior que" },
  { value: "menor_que", label: "é menor que" },
  { value: "em", label: "está em" },
  { value: "nao_em", label: "não está em" },
];

export const acoesDisponiveis = [
  { value: "fluxo.iniciar", label: "Iniciar fluxo" },
  { value: "fluxo.interromper", label: "Interromper fluxo atual" },
  { value: "whatsapp.enviar_mensagem", label: "Enviar mensagem" },
  { value: "whatsapp.enviar_template", label: "Enviar disparo WhatsApp" },
  { value: "email.enviar", label: "Enviar e-mail" },
  { value: "notificacao.responsavel", label: "Notificar responsável" },
  { value: "contato.adicionar_etiqueta", label: "Adicionar etiqueta" },
  { value: "conversa.transferir_setor", label: "Transferir conversa" },
  { value: "agenda.atualizar_status", label: "Alterar status do agendamento" },
  { value: "integracao.consultar_api", label: "Consultar API externa" },
];

export const variaveisWhatsappSugeridas = [
  "nome_contato",
  "nome_whatsapp",
  "email_contato",
  "numero_contato",
  "campanha",
  "origem",
  "status_lead",
  "classificacao_lead",
  "protocolo_atual",
  "ultimo_protocolo",
] as const;

export function novoFormulario(): FormRotina {
  return {
    nome: "",
    descricao: "",
    categoria: "agenda",
    status: "pausada",
    gatilho: {
      tipo: "evento",
      evento: "agenda.agendamento_criado",
      entidade_tipo: "agenda_agendamento",
      configuracao_json: {},
      ativo: true,
    },
    condicoes: [],
    acoes: [{ ordem: 0, tipo_acao: "notificacao.responsavel", configuracao_json: {}, ativo: true }],
  };
}

export function statusLabel(status: StatusRotina) {
  if (status === "ativa") return "Ativa";
  if (status === "pausada") return "Pausada";
  if (status === "rascunho") return "Rascunho";
  return "Com erro";
}

export function categoriaLabel(categoria: Categoria) {
  return categorias.find((item) => item.id === categoria)?.nome || categoria;
}

export function gatilhoLabel(gatilho?: Gatilho) {
  if (!gatilho) return "Sem gatilho";
  for (const itens of Object.values(gatilhosPorCategoria)) {
    const encontrado = itens.find((item) => item.evento === gatilho.evento);
    if (encontrado) return encontrado.nome;
  }
  return gatilho.evento;
}

export function acaoLabel(tipo: string) {
  return acoesDisponiveis.find((item) => item.value === tipo)?.label || tipo;
}

export function formatarData(valor?: string | null) {
  if (!valor) return "Ainda não executada";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(
    new Date(valor),
  );
}

export function valorComoTexto(valor: unknown) {
  if (valor === null || valor === undefined) return "";
  if (["string", "number", "boolean"].includes(typeof valor)) return String(valor);
  return JSON.stringify(valor);
}

export function multiplicadorUnidade(unidade: string) {
  if (unidade === "dias") return 1440;
  if (unidade === "horas") return 60;
  return 1;
}

export function unidadeOffset(gatilho: Gatilho) {
  const configurada = String(gatilho.configuracao_json.offset_unidade || "");
  if (["minutos", "horas", "dias"].includes(configurada)) return configurada;
  const minutos = Math.abs(Number(gatilho.offset_minutos || 60));
  if (minutos % 1440 === 0) return "dias";
  if (minutos % 60 === 0) return "horas";
  return "minutos";
}

export function quantidadeOffset(gatilho: Gatilho) {
  const unidade = unidadeOffset(gatilho);
  return Math.max(
    1,
    Math.round(Math.abs(Number(gatilho.offset_minutos || 60)) / multiplicadorUnidade(unidade)),
  );
}

export function configuracaoPadraoAcao(tipo: string): Record<string, unknown> {
  if (tipo === "agenda.atualizar_status") return { status: "confirmado" };
  if (tipo === "whatsapp.enviar_mensagem") return { mensagem: "" };
  if (tipo === "whatsapp.enviar_template") {
    return { integracao_whatsapp_id: "", template_id: "", variaveis: [] };
  }
  if (tipo === "conversa.transferir_setor") {
    return {
      escopo_fila: "setor",
      setor_id: "",
      estrategia_transferencia: "fila_setor",
      atendente_id: "",
      incluir_administradores_distribuicao: false,
    };
  }
  return {};
}
