import twemoji from "twemoji";

export type Conversa = {
  id: string;
  assunto: string | null;
  status: string;
  bot_ativo?: boolean | null;
  prioridade: string | null;
  canal: string | null;
  origem_atendimento?: string | null;
  historico_importado?: boolean | null;
  historico_importado_em?: string | null;
  integracao_whatsapp_id?: string | null;
  last_message_at: string | null;
  started_at?: string | null;
  created_at?: string | null;
  protocolo?: string | null;
  ultima_mensagem?: string | null;
  unread_count?: number | null;
  tem_disparo_agendado_pendente?: boolean;
  disparo_agendado_pendente?: {
    id: string;
    executar_em: string;
    template_nome: string | null;
  } | null;
  setor_id?: string | null;
  responsavel_id?: string | null;
  favorita?: boolean;
  etiqueta_id?: string | null;
  etiqueta_cor?: string | null;
  etiquetas?: {
    id: string;
    nome: string;
    descricao?: string | null;
    cor: string;
  } | null;
  listas?: {
    id: string;
    nome: string;
  }[];

  contatos: {
    id?: string;
    nome: string | null;
    whatsapp_profile_name?: string | null;
    telefone: string;
    email?: string | null;
    origem?: string | null;
    status_lead?: string | null;
    empresa?: string | null;
    observacoes?: string | null;
    campanha?: string | null;
    rastreamento_campanha_id?: string | null;
    rastreamento_campanhas?: CampanhaRastreamentoContato | null;
  } | null;

  setores: {
    id?: string;
    nome: string;
  } | null;

  responsavel: {
    id?: string;
    nome: string;
  } | null;
};

export type InformacaoCapturaConversa = {
  id: string;
  tipo?: string | null;
  nome_campo?: string | null;
  sequencia?: number | null;
  valor: string;
  capturado_em?: string | null;
};

export const ORDEM_TIPOS_CAPTURA = [
  "nome",
  "cpf",
  "cnpj",
  "data",
  "telefone",
  "numero",
  "email",
  "endereco",
  "cep",
  "observacao",
] as const;

export const ROTULOS_TIPOS_CAPTURA: Record<string, string> = {
  nome: "Nome",
  cpf: "CPF",
  cnpj: "CNPJ",
  data: "Data",
  telefone: "Telefone",
  numero: "Número",
  email: "E-mail",
  endereco: "Endereço",
  cep: "CEP",
  observacao: "Observação",
};

export function normalizarLabelCaptura(valor: string | null | undefined) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function obterTipoCaptura(informacao: InformacaoCapturaConversa) {
  const tipo = normalizarLabelCaptura(informacao.tipo);
  const nomeCampo = normalizarLabelCaptura(informacao.nome_campo)
    .replace(/\s+captura\s*$/, "")
    .replace(/\s+\d+\s*$/, "")
    .trim();

  const normalizarTipo = (valor: string) => {
    if (valor === "texto" || valor === "livre" || valor === "observacoes") {
      return "observacao";
    }
    if (valor === "e mail") return "email";
    return valor;
  };

  const tipoNormalizado = normalizarTipo(tipo);
  if (ORDEM_TIPOS_CAPTURA.includes(tipoNormalizado as (typeof ORDEM_TIPOS_CAPTURA)[number])) {
    return tipoNormalizado;
  }

  const nomeNormalizado = normalizarTipo(nomeCampo);
  if (ORDEM_TIPOS_CAPTURA.includes(nomeNormalizado as (typeof ORDEM_TIPOS_CAPTURA)[number])) {
    return nomeNormalizado;
  }

  return tipoNormalizado || nomeNormalizado || "outro";
}

export function obterRotuloTipoCaptura(informacao: InformacaoCapturaConversa) {
  const tipo = obterTipoCaptura(informacao);
  if (ROTULOS_TIPOS_CAPTURA[tipo]) return ROTULOS_TIPOS_CAPTURA[tipo];

  const nomeOriginal = String(
    informacao.nome_campo || informacao.tipo || "Informação"
  )
    .replace(/[_-]+/g, " ")
    .replace(/\s+captura\s*$/i, "")
    .replace(/\s+\d+\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();

  return nomeOriginal.charAt(0).toUpperCase() + nomeOriginal.slice(1);
}

export function formatarLabelCapturaResumo(informacao: InformacaoCapturaConversa) {
  return `${obterRotuloTipoCaptura(informacao)} captura`;
}

export function formatarLabelCapturaDetalhada(informacao: InformacaoCapturaConversa) {
  const nomeOriginal = String(informacao.nome_campo || "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+captura\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const correspondencia = nomeOriginal.match(/^(.*?)(?:\s+(\d+))?$/);
  const numeroNome = correspondencia?.[2] || "";
  const sequencia =
    numeroNome ||
    (Number(informacao.sequencia || 0) > 0
      ? String(informacao.sequencia)
      : "");

  return `${formatarLabelCapturaResumo(informacao)}${
    sequencia ? ` ${sequencia}` : ""
  }`;
}

export function compararInformacoesCaptura(
  a: InformacaoCapturaConversa,
  b: InformacaoCapturaConversa
) {
  const tipoA = obterTipoCaptura(a);
  const tipoB = obterTipoCaptura(b);
  const ordemA = ORDEM_TIPOS_CAPTURA.indexOf(
    tipoA as (typeof ORDEM_TIPOS_CAPTURA)[number]
  );
  const ordemB = ORDEM_TIPOS_CAPTURA.indexOf(
    tipoB as (typeof ORDEM_TIPOS_CAPTURA)[number]
  );
  const posicaoA = ordemA === -1 ? ORDEM_TIPOS_CAPTURA.length : ordemA;
  const posicaoB = ordemB === -1 ? ORDEM_TIPOS_CAPTURA.length : ordemB;

  if (posicaoA !== posicaoB) return posicaoA - posicaoB;

  const sequenciaA = Number(a.sequencia || 0);
  const sequenciaB = Number(b.sequencia || 0);
  if (sequenciaA !== sequenciaB) return sequenciaA - sequenciaB;

  return formatarLabelCapturaDetalhada(a).localeCompare(
    formatarLabelCapturaDetalhada(b),
    "pt-BR",
    { numeric: true, sensitivity: "base" }
  );
}

export type IntegracaoWhatsappOpcao = {
  id: string;
  nome_conexao: string | null;
  numero: string | null;
  status: string | null;
  posicao?: number | null;
};

export type Mensagem = {
  id: string;
  conversa_id: string;
  remetente_tipo: "contato" | "bot" | "ia" | "usuario" | "sistema";
  remetente_id: string | null;
  conteudo: string;
  tipo_mensagem: string;
  origem: "recebida" | "enviada" | "automatica";
  status_envio: "pendente" | "enviada" | "entregue" | "lida" | "falha";
  created_at: string;
  favorita?: boolean;
  metadata_json?: {
    tipo_original_whatsapp?: string | null;
    botoes?: Array<{
      id?: string | null;
      titulo?: string | null;
      url?: string | null;
      tipo?: string | null;
    }> | null;
    media_id?: string | null;
    mime_type?: string | null;
    sha256?: string | null;
    caption?: string | null;
    filename?: string | null;
    url?: string | null;
    voice?: boolean | null;
    transcricao_audio?: string | null;
    transcricao_modelo?: string | null;
    contacts?: Array<{
      name?: {
        formatted_name?: string;
        first_name?: string;
        last_name?: string;
      };
      phones?: Array<{
        phone?: string;
        wa_id?: string;
        type?: string;
      }>;
      emails?: Array<{
        email?: string;
        type?: string;
      }>;
      addresses?: Array<{
        street?: string;
        city?: string;
        state?: string;
        zip?: string;
        country?: string;
        country_code?: string;
        type?: string;
      }>;
      org?: {
        company?: string;
        department?: string;
        title?: string;
      };
    }> | null;
    location?: {
      latitude?: number | null;
      longitude?: number | null;
      name?: string | null;
      address?: string | null;
    } | null;
    unsupported?: {
      type?: string | null;
      details?: string | null;
    } | null;
    midia_url?: string | null;
    tipo_midia?: string | null;
    legenda?: string | null;
    erro?: unknown;
    meta_response?: unknown;
    whatsapp_status?: {
      error_message?: string | null;
      ultimo_status?: string | null;
      raw_status?: {
        status?: string | null;
        errors?: Array<{
          code?: number | string | null;
          title?: string | null;
          message?: string | null;
          error_data?: {
            details?: string | null;
          } | null;
        }> | null;
      } | null;
    } | null;
  } | null;
};

export type Janela24hConversa = {
  podeEnviarMensagemLivre: boolean;
  ultimaMensagemRecebidaEm: string | null;
  janelaExpiraEm: string | null;
  motivoBloqueio: string | null;
};

export type Janela24hApiPayload = Partial<Janela24hConversa> & {
  pode_enviar_mensagem_livre?: boolean | null;
  ultima_mensagem_recebida_em?: string | null;
  expira_em?: string | null;
  janela_expira_em?: string | null;
  motivo_bloqueio?: string | null;
};

export type LimiteMetaResumo = {
  limite: number;
  usados: number;
  restantes: number;
  percentual: number;
  tier?: string | null;
  origem?: string | null;
  alerta?: "normal" | "amarelo" | "vermelho" | string;
};

export type TelefoneMetaLimite = {
  telefone_normalizado: string;
  ja_contabilizado: boolean;
  impacto: number;
  restantes_apos_envio: number;
  excede_limite: boolean;
  janela_expira_em?: string | null;
};

export type SetorOpcao = {
  id: string;
  nome: string;
};

export type PerfilDinamico = {
  id: string;
  nome: string;
  descricao?: string | null;
  ativo?: boolean;
};

export type UsuarioSetorVinculo = {
  id?: string;
  usuario_id: string;
  setor_id: string;
  is_principal?: boolean;
  created_at?: string;
};

export type UsuarioOpcao = {
  id: string;
  nome: string;
  setor_ids?: string[];
  usuarios_setores?: UsuarioSetorVinculo[];
  permissoes?: string[];
  perfis_dinamicos?: PerfilDinamico[];
};

export type UsuarioLogado = {
  id: string;
  nome?: string | null;
  email?: string | null;
  empresa_id?: string | null;
  setores_ids?: string[];
  usuarios_setores?: UsuarioSetorVinculo[];
  setor_principal_id?: string | null;
  permissoes?: string[];
  perfis_dinamicos?: PerfilDinamico[];
};

export type PoliticaAtendimento = {
  permitir_transferir_sem_assumir?: boolean;
  permitir_transferir_para_mesmo_setor?: boolean;
  limpar_responsavel_ao_transferir?: boolean;
  voltar_fila_ao_transferir?: boolean;

  pode_transferir?: boolean;
  pode_reatribuir?: boolean;
  pode_atribuir?: boolean;
  pode_assumir?: boolean;

  permitir_assumir_conversa_em_fila?: boolean;
  permitir_assumir_conversa_sem_responsavel?: boolean;
  permitir_assumir_conversa_ja_atribuida?: boolean;

  exigir_mesmo_setor_para_reatribuicao?: boolean;
};

export type ListaConversa = {
  id: string;
  nome: string;
  marcada: boolean;
};

export type ListaEmpresa = {
  id: string;
  nome: string;
};

export type ChipRapido =
  | "Todas"
  | "minhas"
  | "favoritos"
  | "fila"
  | "nao_lidas"
  | "sem_responsavel"
  | "urgentes"
  | "robo";

export type TotaisChipsRapidos = {
  Todas: number;
  minhas: number;
  favoritos: number;
  sem_responsavel: number;
  nao_lidas: number;
  robo: number;
};

export const TOTAIS_CHIPS_RAPIDOS_INICIAIS: TotaisChipsRapidos = {
  Todas: 0,
  minhas: 0,
  favoritos: 0,
  sem_responsavel: 0,
  nao_lidas: 0,
  robo: 0,
};

export function normalizarTotalChip(valor: unknown) {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : 0;
}

export function normalizarTotaisChipsRapidos(
  totais?: Partial<TotaisChipsRapidos> | null
): TotaisChipsRapidos {
  return {
    Todas: normalizarTotalChip(totais?.Todas),
    minhas: normalizarTotalChip(totais?.minhas),
    favoritos: normalizarTotalChip(totais?.favoritos),
    sem_responsavel: normalizarTotalChip(totais?.sem_responsavel),
    nao_lidas: normalizarTotalChip(totais?.nao_lidas),
    robo: normalizarTotalChip(totais?.robo),
  };
}

export type EtiquetaEmpresa = {
  id: string;
  nome: string;
  descricao?: string | null;
  cor: string;
  ativo?: boolean;
  ordem?: number;
};

export type EtiquetaForm = {
  nome: string;
  descricao: string;
  cor: string;
};

export type MacroChat = {
  id: string;
  titulo: string;
  conteudo: string;
  ativo?: boolean;
  ordem?: number;
  created_at?: string;
  updated_at?: string;
};

export type MacroForm = {
  titulo: string;
  conteudo: string;
};

export type VariavelGlobal = {
  id: string;
  chave: string;
  valor: string;
  descricao?: string;
  escopo?: string;
  ativo?: boolean;
};

export type VariavelForm = {
  chave: string;
  valor: string;
  descricao: string;
};

export const TEXTO_VARIAVEIS_FIXAS_MACRO =
  "Variáveis fixas: {{nome_contato}}, {{nome_whatsapp}}, {{email_contato}}, {{numero_contato}}, {{campo_contato}}, {{campanha}}, {{origem}}, {{status_lead}}, {{classificacao_lead}}, {{protocolo_atual}} e {{ultimo_protocolo}}.";

export const VARIAVEIS_FIXAS_SISTEMA = [
  {
    chave: "nome_contato",
    exemplo: "{{nome_contato}}",
    descricao: "Nome salvo no cadastro do contato.",
  },
  {
    chave: "nome",
    exemplo: "{{nome}}",
    descricao: "Nome do contato.",
  },
  {
    chave: "nome_whatsapp",
    exemplo: "{{nome_whatsapp}}",
    descricao:
      "Nome do perfil do WhatsApp quando existir; se não existir, usa o nome salvo no contato.",
  },
  {
    chave: "email_contato",
    exemplo: "{{email_contato}}",
    descricao: "E-mail salvo no cadastro do contato.",
  },
  {
    chave: "numero_contato",
    exemplo: "{{numero_contato}}",
    descricao: "Número/telefone salvo no cadastro do contato.",
  },
  {
    chave: "campo_contato",
    exemplo: "{{campo_contato}}",
    descricao: "Campo individual do contato; usa o valor efetivo do cadastro/lista em contexto.",
  },
  {
    chave: "campanha",
    exemplo: "{{campanha}}",
    descricao: "Campanha vinculada ao contato.",
  },
  {
    chave: "origem",
    exemplo: "{{origem}}",
    descricao: "Origem do contato.",
  },
  {
    chave: "status_lead",
    exemplo: "{{status_lead}}",
    descricao: "Classificação atual do lead.",
  },
  {
    chave: "classificacao_lead",
    exemplo: "{{classificacao_lead}}",
    descricao: "Classificação global do lead.",
  },
  {
    chave: "protocolo_atual",
    exemplo: "{{protocolo_atual}}",
    descricao: "Protocolo ativo da conversa atual do contato.",
  },
  {
    chave: "ultimo_protocolo",
    exemplo: "{{ultimo_protocolo}}",
    descricao: "Último protocolo encerrado/inativo do contato.",
  },
];

export const ETIQUETAS_PADRAO = [
  "#60A5FA",
  "#4ADE80",
  "#FACC15",
  "#FB923C",
  "#F87171",
  "#A78BFA",
];


export type AbaPainelDireito =
  | "detalhes"
  | "contato"
  | "historico"
  | "notas"
  | "mensagens_favoritas"
  | "listas"
  | "etiquetas"
  | "macros"
  | "informacoes_captura"
  | "midia_docs_links";

export type NotaConversa = {
  id: string;
  empresa_id: string;
  conversa_id: string;
  autor_id: string;
  conteudo: string;
  created_at: string;
  updated_at: string;
  autor?: {
    id: string;
    nome: string | null;
    email: string | null;
  } | null;
};

export type MidiaAgrupadaItem = {
  id: string;
  tipo: "midia" | "documento" | "link";
  subtipo: string;
  nome: string;
  url: string;
  mimeType: string;
  caption: string | null;
  createdAt: string;
  dateLabel: string;
  isImage: boolean;
  isVideo: boolean;
  isAudio: boolean;
  isPdf: boolean;
};

export type MidiaAgrupadaSecao = {
  data: string;
  itens: MidiaAgrupadaItem[];
};

export type AbaMidiaDocsLinks = "midia" | "documentos" | "links";

export type StatusLeadContato =
  | "novo"
  | "qualificado"
  | "convertido"
  | "perdido";

export type ContatoCompartilhadoMensagem = {
  name?: {
    formatted_name?: string;
    first_name?: string;
    last_name?: string;
  };
  phones?: Array<{
    phone?: string;
    wa_id?: string;
    type?: string;
  }>;
  emails?: Array<{
    email?: string;
    type?: string;
  }>;
  addresses?: Array<{
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
    country_code?: string;
    type?: string;
  }>;
  org?: {
    company?: string;
    department?: string;
    title?: string;
  };
};

export type ContatoCadastroForm = {
  nome: string;
  telefone: string;
  email: string;
  origem: string;
  campanha: string;
  rastreamento_campanha_id: string;
  status_lead: StatusLeadContato;
  observacoes: string;
};

export type CampanhaRastreamentoContato = {
  id: string;
  nome: string;
  status: "ativo" | "inativo";
  rastreamento_origens?: { id: string; nome: string } | null;
};

export function obterNomeCampanhaContato(
  contato: Conversa["contatos"] | null | undefined
) {
  return contato?.rastreamento_campanhas?.nome || contato?.campanha || "";
}

export function limitarTextoCampanha(texto: string, limite = 24) {
  const valor = texto.trim();

  if (valor.length <= limite) return valor;

  return `${valor.slice(0, Math.max(0, limite - 1)).trim()}...`;
}

export function formatarCampanhaRastreamentoContato(
  campanha: CampanhaRastreamentoContato
) {
  const origem = campanha.rastreamento_origens?.nome;
  const status = campanha.status === "inativo" ? " - inativa" : "";

  return origem
    ? `${campanha.nome} (${origem})${status}`
    : `${campanha.nome}${status}`;
}

export function normalizarTelefoneMetaUi(valor?: string | null) {
  return String(valor || "").replace(/\D/g, "");
}

export function formatarNumeroLimiteMetaUi(valor?: number | null) {
  const numero = Number(valor ?? 0);
  return new Intl.NumberFormat("pt-BR").format(
    Number.isFinite(numero) ? numero : 0
  );
}

export function normalizarChaveVariavelMacro(valor: unknown) {
  return String(valor || "")
    .replace(/[{}]/g, "")
    .trim()
    .replace(/^variaveis\./, "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

export function limitarPreviewMacro(texto: string, limite = 96) {
  const valor = texto.replace(/\s+/g, " ").trim();

  if (valor.length <= limite) return valor;

  return `${valor.slice(0, Math.max(0, limite - 3)).trim()}...`;
}

export type ResultadoProtocoloConversa =
  | "em_andamento"
  | "qualificado"
  | "convertido"
  | "perdido"
  | "neutro";

export type ProtocoloConversa = {
  id: string;
  conversa_id: string;
  empresa_id: string;
  protocolo: string;
  tipo: "abertura" | "reabertura";
  ativo: boolean;
  resultado?: ResultadoProtocoloConversa | null;
  started_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type RastreamentoEventoTipoManual =
  | "venda_realizada"
  | "venda_perdida"
  | "lead_qualificado"
  | "agendamento_criado"
  | "agendamento_confirmado"
  | "entrada_grupo_confirmada"
  | "pagamento_confirmado"
  | "objetivo_concluido"
  | "objetivo_nao_concluido"
  | "sem_interesse";

export type ClassificacaoEncerramento =
  | "qualificado"
  | "convertido"
  | "perdido";

export const CLASSIFICACOES_ENCERRAMENTO: Array<{
  value: ClassificacaoEncerramento;
  label: string;
}> = [
  { value: "qualificado", label: "Qualificado" },
  { value: "convertido", label: "Convertido" },
  { value: "perdido", label: "Perdido" },
];

export type RastreamentoEventoConversa = {
  id: string;
  tipo: RastreamentoEventoTipoManual;
  valor: number | null;
  origem_registro: string;
  ocorrido_em: string;
  metadata_json?: {
    conversa_protocolo_id?: string | null;
    protocolo?: string | null;
    observacao?: string | null;
  } | null;
};

export const RASTREAMENTO_EVENTOS_MANUAIS: Array<{
  value: RastreamentoEventoTipoManual;
  label: string;
  exigeValor?: boolean;
}> = [
  { value: "venda_realizada", label: "Venda realizada", exigeValor: true },
  { value: "venda_perdida", label: "Venda perdida" },
  { value: "lead_qualificado", label: "Lead qualificado" },
  { value: "agendamento_criado", label: "Agendamento criado" },
  { value: "agendamento_confirmado", label: "Agendamento confirmado" },
  { value: "entrada_grupo_confirmada", label: "Entrada no grupo confirmada" },
  { value: "pagamento_confirmado", label: "Pagamento confirmado" },
  { value: "objetivo_concluido", label: "Objetivo concluído" },
  { value: "objetivo_nao_concluido", label: "Objetivo não concluído" },
  { value: "sem_interesse", label: "Sem interesse" },
];

export function getEventoRastreamentoLabel(tipo: string) {
  return (
    RASTREAMENTO_EVENTOS_MANUAIS.find((evento) => evento.value === tipo)
      ?.label || tipo
  );
}

export function eventoRastreamentoExigeValor(tipo: string) {
  return RASTREAMENTO_EVENTOS_MANUAIS.some(
    (evento) => evento.value === tipo && evento.exigeValor
  );
}

export function formatarValorRastreamento(valor?: number | null) {
  if (valor === null || valor === undefined) return "";

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valor);
}

export function mensagemTemMidiaExpiravel(msg: Mensagem) {
  if (msg.origem !== "recebida") return false;

  return ["imagem", "audio", "video", "documento"].includes(msg.tipo_mensagem);
}

export function formatarHora(data?: string | null) {
  if (!data) return "";
  return new Date(data).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatarDataCompleta(data?: string | null) {
  if (!data) return "Sem atividade";
  return new Date(data).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatarDataCurtaDisparo(data?: string | null) {
  if (!data) return "";

  return new Date(data).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatarDataSeparador(data?: string | null) {
  if (!data) return "";
  return new Date(data).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function getPrioridadeLabel(prioridade?: string | null) {
  if (!prioridade) return "Normal";

  switch (prioridade) {
    case "baixa":
      return "Baixa";
    case "media":
      return "Média";
    case "alta":
      return "Alta";
    case "urgente":
      return "Urgente";
    default:
      return prioridade;
  }
}

export function getCanalLabel(canal?: string | null) {
  if (!canal) return "Não informado";

  switch (canal) {
    case "whatsapp":
      return "WhatsApp";
    case "instagram":
      return "Instagram";
    case "facebook":
      return "Facebook";
    case "site":
      return "Site";
    case "email":
      return "E-mail";
    default:
      return canal;
  }
}

export function getStatusLabel(status?: string | null) {
  if (!status) return "Sem status";

  switch (status) {
    case "aberta":
      return "Aberta";
    case "fila":
      return "Fila";
    case "bot":
      return "Bot";
    case "em_atendimento":
      return "Em atendimento";
    case "aguardando_cliente":
      return "Aguardando cliente";
    case "encerrado_manual":
      return "Encerrado manualmente";
    case "encerrado_24h":
      return "Encerrado após 24h";
    case "encerrado_aut":
      return "Encerrado pela automação";
    default:
      return status;
  }
}

export function isConversaHistoricoImportadoUi(conversa?: Conversa | null) {
  return (
    conversa?.historico_importado === true ||
    conversa?.origem_atendimento === "historico_coexistence"
  );
}

export function getMensagemConversaEncerrada(status?: string | null) {
  switch (status) {
    case "encerrado_manual":
      return {
        titulo: "Conversa encerrada manualmente",
        texto: (
          <>
            Este atendimento foi encerrado manualmente. Você pode{" "}
            <strong>Reabrir o protocolo atual</strong>,{" "}
            <strong>Abrir um novo protocolo</strong> ou enviar um{" "}
            <strong>Disparo individual</strong> para retomar o contato.
          </>
        ),
        icone: "⛔",
        variante: "warning" as const,
      };

    case "encerrado_aut":
      return {
        titulo: "Conversa encerrada pela automação",
        texto: (
          <>
            Este atendimento foi encerrado automaticamente pelo fluxo. Você pode{" "}
            <strong>Reabrir o protocolo atual</strong>,{" "}
            <strong>Abrir um novo protocolo</strong> ou enviar um{" "}
            <strong>Disparo individual</strong> para continuar o atendimento.
          </>
        ),
        icone: "🤖",
        variante: "warning" as const,
      };


    case "encerrado_24h":
      return {
        titulo: "Janela de 24h encerrada",
        texto: (
          <>
            A janela de 24 horas do WhatsApp expirou sem nova resposta do cliente.
            Para voltar a conversar, envie um template aprovado pelo{" "}
            <strong>Disparo individual</strong>.
          </>
        ),
        icone: "🕒",
        variante: "danger" as const,
      };

    default:
      return {
        titulo: "Conversa encerrada",
        texto: (
          <>
            Esta conversa está encerrada. Verifique as opções disponíveis no
            cabeçalho ou envie um <strong>Disparo individual</strong> para
            retomar o contato.
          </>
        ),
        icone: "⛔",
        variante: "danger" as const,
      };
  }
}

export function getCategoriaLeadProtocoloLabel(resultado?: string | null) {
  switch (String(resultado || "").trim().toLowerCase()) {
    case "convertido":
      return "Convertido";
    case "perdido":
      return "Perdido";
    case "qualificado":
    case "neutro":
      return "Qualificado";
    case "em_andamento":
      return "Em andamento";
    default:
      return "Não informado";
  }
}

export function getRemetenteLabel(remetente: Mensagem["remetente_tipo"]) {
  switch (remetente) {
    case "contato":
      return "Contato";
    case "usuario":
      return "Você";
    case "bot":
      return "Bot";
    case "ia":
      return "IA";
    case "sistema":
      return "Sistema";
    default:
      return remetente;
  }
}

// CRM_DISPARO_CHAT_PRESENTATION_V1
export function getMensagemMetadataDisparo(msg: Mensagem) {
  return (msg.metadata_json || {}) as Record<string, unknown>;
}

export function mensagemEhDisparo(msg: Mensagem) {
  const metadata = getMensagemMetadataDisparo(msg);
  const tipoOriginalMeta = String(
    (msg as Mensagem & { tipo_original_meta?: string | null })
      .tipo_original_meta || ""
  )
    .trim()
    .toLowerCase();
  const tipoOriginalWhatsapp = String(
    metadata.tipo_original_whatsapp || ""
  )
    .trim()
    .toLowerCase();
  const tipoMetadata = String(metadata.tipo || "")
    .trim()
    .toLowerCase();
  const possuiIdentificacaoTemplate = Boolean(
    metadata.template_id || metadata.template_nome
  );

  return (
    msg.tipo_mensagem === "template" ||
    tipoOriginalMeta === "template" ||
    tipoOriginalWhatsapp === "template" ||
    tipoMetadata.includes("disparo_template") ||
    (possuiIdentificacaoTemplate &&
      (msg.origem === "automatica" || msg.origem === "enviada"))
  );
}

export function mensagemDisparoTemBotoes(msg: Mensagem) {
  const metadata = getMensagemMetadataDisparo(msg);
  return Array.isArray(metadata.botoes) && metadata.botoes.length > 0;
}

export function getModoDisparo(msg: Mensagem) {
  const metadata = getMensagemMetadataDisparo(msg);
  const tipo = String(metadata.tipo || "").trim().toLowerCase();
  const origem = String(metadata.origem || "").trim().toLowerCase();
  const disparoTipo = String(metadata.disparo_tipo || "")
    .trim()
    .toLowerCase();

  const manual =
    disparoTipo === "manual" ||
    tipo.includes("individual") ||
    origem.includes("individual") ||
    (msg.remetente_tipo === "usuario" && msg.origem === "enviada");

  return manual ? "manual" : "agendado";
}

export function formatarNomeTemplateDisparo(valor: unknown) {
  const texto = String(valor || "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!texto) return "Disparo";

  return texto
    .split(" ")
    .map((parte) =>
      parte ? parte.charAt(0).toUpperCase() + parte.slice(1).toLowerCase() : parte
    )
    .join(" ");
}

export function obterApresentacaoDisparo(msg: Mensagem) {
  const metadata = getMensagemMetadataDisparo(msg);
  const texto = String(msg.conteudo || "").trim();
  const blocos = texto
    .split(/\n\s*\n/)
    .map((bloco) => bloco.trim())
    .filter(Boolean);
  const primeiroBloco = blocos[0] || "";
  const primeiroBlocoPareceTitulo =
    blocos.length > 1 &&
    primeiroBloco.length <= 90 &&
    !/[.!?]$/.test(primeiroBloco);

  const titulo = primeiroBlocoPareceTitulo
    ? primeiroBloco.replace(/^Header:\s*/i, "").trim()
    : formatarNomeTemplateDisparo(metadata.template_nome);
  const conteudo = primeiroBlocoPareceTitulo
    ? blocos.slice(1).join("\n\n")
    : texto;

  return { titulo, conteudo };
}

export function getStatusEnvioLabel(status: Mensagem["status_envio"]) {
  switch (status) {
    case "pendente":
      return "⏳";
    case "enviada":
      return "✓";
    case "entregue":
      return "✓✓";
    case "lida":
      return "✓✓";
    case "falha":
      return "!! não entregue";
    default:
      return "";
  }
}

export function isRecord(valor: unknown): valor is Record<string, unknown> {
  return !!valor && typeof valor === "object" && !Array.isArray(valor);
}

export function getStringFromRecord(
  valor: Record<string, unknown>,
  chave: string
) {
  const campo = valor[chave];
  return typeof campo === "string" ? campo.trim() : "";
}

export function extrairTextoErroMeta(valor: unknown): string {
  if (typeof valor === "string") return valor.trim();
  if (!isRecord(valor)) return "";

  const payloadErro = isRecord(valor.error) ? valor.error : valor;
  const errorData = isRecord(payloadErro.error_data)
    ? payloadErro.error_data
    : null;

  return (
    (errorData ? getStringFromRecord(errorData, "details") : "") ||
    getStringFromRecord(payloadErro, "message") ||
    getStringFromRecord(payloadErro, "title") ||
    getStringFromRecord(payloadErro, "detail") ||
    getStringFromRecord(payloadErro, "error")
  );
}

export function erroMensagemUtil(texto: string) {
  const valor = texto.trim();
  return valor && valor !== "Media upload error" ? valor : "";
}

export function getMensagemErroEnvio(msg: Mensagem) {
  if (msg.status_envio !== "falha") return "";

  const errosRaw = msg.metadata_json?.whatsapp_status?.raw_status?.errors;
  const erroRaw = Array.isArray(errosRaw) ? errosRaw[0] : null;

  const codigo = erroRaw?.code ? String(erroRaw.code) : "";
  const titulo = erroRaw?.title || erroRaw?.message || "";
  const detalhes = erroRaw?.error_data?.details || "";

  const tituloLower = titulo.toLowerCase();
  const detalhesLower = detalhes.toLowerCase();

  if (codigo === "131053" && detalhesLower.includes("videocodec=hevc")) {
    return "A Meta/WhatsApp recusou este vídeo porque o arquivo está em codec HEVC/H.265. O envio saiu do CRM, mas o WhatsApp não entregou ao contato. Converta o vídeo para MP4 com vídeo H.264/AVC e áudio AAC.";
  }

  if (codigo === "131053") {
    return "A Meta/WhatsApp não conseguiu processar esta mídia. O envio saiu do CRM, mas o WhatsApp recusou ou falhou ao entregar o arquivo. Verifique se a mídia está em formato compatível e dentro do limite permitido.";
  }

  if (
    tituloLower.includes("media upload error") ||
    detalhesLower.includes("media upload error")
  ) {
    return "A mídia foi enviada pelo CRM para a Meta, mas o WhatsApp retornou falha no processamento e não entregou ao contato.";
  }

  const erroDireto = erroMensagemUtil(
    extrairTextoErroMeta(msg.metadata_json?.erro)
  );
  if (erroDireto) {
    return erroDireto;
  }

  const erroMetaResponse = erroMensagemUtil(
    extrairTextoErroMeta(msg.metadata_json?.meta_response)
  );
  if (erroMetaResponse) {
    return erroMetaResponse;
  }

  const erroStatus = erroMensagemUtil(
    msg.metadata_json?.whatsapp_status?.error_message || ""
  );
  if (erroStatus) {
    return erroStatus;
  }

  if (detalhes?.trim()) {
    return `A Meta/WhatsApp recusou esta mensagem: ${detalhes}`;
  }

  if (titulo?.trim()) {
    return `A Meta/WhatsApp retornou falha no envio: ${titulo}`;
  }

  return "A mensagem foi enviada pelo CRM, mas a Meta/WhatsApp retornou falha e não entregou ao contato.";
}

export function mensagemFoiEnviadaPeloSistema(msg: Mensagem) {
  return (
    msg.origem === "enviada" ||
    msg.origem === "automatica" ||
    msg.remetente_tipo === "usuario" ||
    msg.remetente_tipo === "bot" ||
    msg.remetente_tipo === "ia"
  );
}


export function getIniciais(nome?: string | null) {
  const valor = nome?.trim() || "Contato";
  const partes = valor.split(" ").filter(Boolean);

  if (partes.length === 0) return "CT";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();

  return `${partes[0][0]}${partes[1][0]}`.toUpperCase();
}

export function formatarTempoRelativo(data?: string | null) {
  if (!data) return "—";

  const agora = Date.now();
  const referencia = new Date(data).getTime();

  if (Number.isNaN(referencia)) return "—";

  const diffMs = Math.max(agora - referencia, 0);
  const minutos = Math.floor(diffMs / 60000);
  const horas = Math.floor(minutos / 60);
  const dias = Math.floor(horas / 24);

  if (dias > 0) return `${dias}d`;
  if (horas > 0) return `${horas}h`;
  return `${Math.max(minutos, 1)}min`;
}

export function getSlaNivel(conversa?: Conversa | null) {
  if (!conversa?.last_message_at) return "ok";

  const diffMin =
    (Date.now() - new Date(conversa.last_message_at).getTime()) / 60000;

  if (diffMin >= 240) return "critico";
  if (diffMin >= 60) return "alerta";
  return "ok";
}

export function getPreviewConversa(conversa: Conversa) {
  const ultimaMensagem = conversa.ultima_mensagem?.trim();
  if (ultimaMensagem) return ultimaMensagem;

  const assunto = conversa.assunto?.trim();
  if (assunto && assunto !== "Atendimento iniciado via WhatsApp") {
    return assunto;
  }

  return conversa.contatos?.telefone || "Sem prévia";
}

export function getSharedContactName(msg: Mensagem) {
  const primeiro = msg.metadata_json?.contacts?.[0];
  if (!primeiro) return "Contato compartilhado";

  return (
    primeiro.name?.formatted_name ||
    [primeiro.name?.first_name, primeiro.name?.last_name]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    "Contato compartilhado"
  );
}

export function getSharedContactPhones(msg: Mensagem) {
  const primeiro = msg.metadata_json?.contacts?.[0];
  return primeiro?.phones || [];
}

export function getSharedContactEmails(msg: Mensagem) {
  const primeiro = msg.metadata_json?.contacts?.[0];
  return primeiro?.emails || [];
}

export function extrairLinksDoTexto(texto?: string | null) {
  if (!texto) return [];

  const regex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)/gi;
  const encontrados = texto.match(regex) || [];

  return Array.from(
    new Set(
      encontrados.map((item) =>
        item.startsWith("http://") || item.startsWith("https://")
          ? item
          : `https://${item}`
      )
    )
  );
}

export function getLabelMesAno(dataIso: string) {
  return new Date(dataIso).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
}

export function getNomeContatoCompartilhado(contato: ContatoCompartilhadoMensagem) {
  return (
    contato.name?.formatted_name ||
    [contato.name?.first_name, contato.name?.last_name]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    "Contato compartilhado"
  );
}

export function getTelefonePrincipalContatoCompartilhado(
  contato: ContatoCompartilhadoMensagem
) {
  const primeiroTelefone = contato.phones?.[0];
  return primeiroTelefone?.phone || primeiroTelefone?.wa_id || "";
}

export function getEmailPrincipalContatoCompartilhado(
  contato: ContatoCompartilhadoMensagem
) {
  return contato.emails?.[0]?.email || "";
}

export function getIniciaisContatoCompartilhado(contato: ContatoCompartilhadoMensagem) {
  return getIniciais(getNomeContatoCompartilhado(contato));
}


export function converterTextoParaEmojiHtml(texto?: string | null) {
  const valor = texto || "";

  return twemoji.parse(valor, {
    folder: "svg",
    ext: ".svg",
  });
}


export function hexToRgba(hex: string, alpha: number) {
  const valor = hex.replace("#", "");

  if (valor.length !== 6) {
    return `rgba(148, 163, 184, ${alpha})`;
  }

  const numero = parseInt(valor, 16);
  const r = (numero >> 16) & 255;
  const g = (numero >> 8) & 255;
  const b = numero & 255;

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function getTooltipEtiqueta(etiqueta?: {
  nome?: string | null;
  descricao?: string | null;
}) {
  if (!etiqueta?.nome) return "Etiqueta";

  if (etiqueta.descricao?.trim()) {
    return `${etiqueta.nome} — ${etiqueta.descricao}`;
  }

  return etiqueta.nome;
}

export function getUltimaMensagemRecebidaDoContato(mensagens: Mensagem[]) {
  const recebidasDoContato = mensagens
    .filter(
      (msg) =>
        msg.origem === "recebida" && msg.remetente_tipo === "contato"
    )
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

  return recebidasDoContato[0] || null;
}

export function isJanela24hMetaAberta(ultimaMensagem: Mensagem | null) {
  if (!ultimaMensagem?.created_at) return false;

  const agora = Date.now();
  const ultimaInteracao = new Date(ultimaMensagem.created_at).getTime();
  const diffMs = agora - ultimaInteracao;

  return diffMs <= 24 * 60 * 60 * 1000;
}

export function formatarTempoRestanteJanela(createdAt?: string | null) {
  if (!createdAt) return "encerrada";

  const limite = new Date(createdAt).getTime() + 24 * 60 * 60 * 1000;
  const diff = limite - Date.now();

  if (diff <= 0) return "encerrada";

  const horas = Math.floor(diff / (1000 * 60 * 60));
  const minutos = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  return `${horas}h ${minutos}min`;
}

export function normalizarJanela24hConversa(
  valor: unknown
): Janela24hConversa | null {
  if (!valor || typeof valor !== "object") return null;

  const janela = valor as Janela24hApiPayload;
  const ultimaMensagemRecebidaEm =
    janela.ultimaMensagemRecebidaEm ??
    janela.ultima_mensagem_recebida_em ??
    null;
  const janelaExpiraEm =
    janela.janelaExpiraEm ??
    janela.expira_em ??
    janela.janela_expira_em ??
    null;
  const motivoBloqueio =
    janela.motivoBloqueio ?? janela.motivo_bloqueio ?? null;
  const podeEnviarMensagemLivre =
    janela.podeEnviarMensagemLivre ??
    janela.pode_enviar_mensagem_livre ??
    Boolean(janelaExpiraEm && new Date(janelaExpiraEm).getTime() >= Date.now());

  return {
    podeEnviarMensagemLivre: Boolean(podeEnviarMensagemLivre),
    ultimaMensagemRecebidaEm,
    janelaExpiraEm,
    motivoBloqueio,
  };
}

export function montarUrlMidiaMensagem(msg: Mensagem) {
  const mediaId = String(msg.metadata_json?.media_id || "").trim();

  if (mediaId) {
    return `/api/whatsapp/media/${encodeURIComponent(mediaId)}`;
  }

  return (
    msg.metadata_json?.midia_url ||
    msg.metadata_json?.url ||
    null
  );
}
