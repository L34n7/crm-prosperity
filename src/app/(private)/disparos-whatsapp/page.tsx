"use client";

import { useEffect, useMemo, useState } from "react";
import FeedbackToast from "@/components/FeedbackToast";
import Header from "@/components/Header";
import styles from "./disparos-whatsapp.module.css";
import { can } from "@/lib/permissoes/frontend";

type IntegracaoWhatsApp = {
  id: string;
  nome_conexao: string;
  numero: string | null;
  status: string | null;
  waba_id: string | null;
};

type TemplateButton = {
  type?: string;
  text?: string;
  url?: string;
  phone_number?: string;
};

type TemplateComponent = {
  type: string;
  text?: string;
  format?: string;
  buttons?: TemplateButton[];
};

type WhatsAppTemplate = {
  id: string;
  empresa_id: string;
  integracao_whatsapp_id: string;
  waba_id: string;
  meta_template_id: string | null;
  nome: string;
  categoria: string;
  idioma: string;
  status: string;
  quality_rating: string | null;
  rejeicao_motivo: string | null;
  payload: {
    name?: string;
    category?: string;
    language?: string;
    components?: TemplateComponent[];
  } | null;
  created_at: string;
  updated_at: string;
};

type PerfilDinamico = {
  id: string;
  nome: string;
  descricao?: string | null;
  ativo?: boolean;
};

type UsuarioSetorVinculo = {
  id?: string;
  usuario_id: string;
  setor_id: string;
  is_principal?: boolean;
  created_at?: string;
};

type UsuarioLogado = {
  id: string;
  empresa_id?: string | null;
  setores_ids?: string[];
  usuarios_setores?: UsuarioSetorVinculo[];
  setor_principal_id?: string | null;
  permissoes?: string[];
  perfis_dinamicos?: PerfilDinamico[];
};

type ResultadoDisparo = {
  id?: string;
  created_at?: string;
  numero: string;
  nome_contato?: string | null;
  ok: boolean;
  status?: number | null;
  status_disparo?: string | null;
  status_label?: string | null;
  template_nome?: string | null;
  mensagem_template?: string | null;
  message_id?: string | null;
  conversa_id?: string | null;
  conversa_protocolo_id?: string | null;
  erro?: string | null;
  erro_amigavel?: string | null;
  erro_tecnico?: string | null;
  metadata_json?: any;
  origem_historico?: string | null;
};

type ContatoOpcao = {
  id: string;
  empresa_id: string;
  nome: string | null;
  telefone: string | null;
  email: string | null;
  origem: string | null;
  campanha: string | null;
  status_lead: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type VariavelPersonalizada = {
  id: string;
  chave: string;
  valor: string;
  descricao: string | null;
  escopo: "global" | "disparos" | "fluxos";
  ativo: boolean;
};

type ProtocolosContatoMap = Record<
  string,
  {
    protocolo_atual: string;
    ultimo_protocolo: string;
  }
>;

const VARIAVEIS_FIXAS_SISTEMA = [
  {
    chave: "nome_contato",
    exemplo: "{{nome_contato}}",
    descricao: "Nome salvo no cadastro do contato.",
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
    descricao: "Status atual do lead.",
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

function extrairBody(payload: WhatsAppTemplate["payload"]) {
  const body = payload?.components?.find((item) => item.type === "BODY");
  return body?.text || "";
}

function extrairHeader(payload: WhatsAppTemplate["payload"]) {
  const header = payload?.components?.find((item) => item.type === "HEADER");
  return header?.text || "";
}

function extrairFooter(payload: WhatsAppTemplate["payload"]) {
  const footer = payload?.components?.find((item) => item.type === "FOOTER");
  return footer?.text || "";
}

function extrairQuickReplies(payload: WhatsAppTemplate["payload"]) {
  const buttons = payload?.components?.find((item) => item.type === "BUTTONS");

  return (
    buttons?.buttons
      ?.filter((button) => button?.type === "QUICK_REPLY" && button?.text)
      .map((button) => button.text || "")
      .filter(Boolean) || []
  );
}

function contarVariaveisTemplate(template: WhatsAppTemplate | null) {
  if (!template?.payload?.components?.length) return 0;

  const components = template.payload.components;
  const header = components.find(
    (item) => String(item.type || "").toUpperCase() === "HEADER"
  );
  const body = components.find(
    (item) => String(item.type || "").toUpperCase() === "BODY"
  );
  const buttons = components.find(
    (item) => String(item.type || "").toUpperCase() === "BUTTONS"
  );

  function contarTexto(texto?: string | null) {
    const matches = String(texto || "").match(/\{\{\d+\}\}/g) || [];
    const numeros = matches
      .map((item) => Number(item.replace(/[{}]/g, "")))
      .filter((n) => !Number.isNaN(n));

    if (numeros.length === 0) return 0;
    return Math.max(...numeros);
  }

  const totalButtons = (buttons?.buttons || []).reduce(
    (total, button) =>
      String(button?.type || "").toUpperCase() === "URL"
        ? total + contarTexto(button?.url)
        : total,
    0
  );

  return contarTexto(header?.text) + contarTexto(body?.text) + totalButtons;
}

function substituirPreviewSequencial(
  texto: string,
  variaveis: string[],
  offset: number
) {
  return String(texto || "").replace(/\{\{(\d+)\}\}/g, (_, numero) => {
    const index = offset + Number(numero) - 1;
    return variaveis[index]?.trim() || `{{${numero}}}`;
  });
}

function montarPreviewTemplateDisparo(
  template: WhatsAppTemplate | null,
  variaveis: string[]
) {
  if (!template) return null;

  const components = template.payload?.components || [];
  const header = components.find(
    (item) => String(item.type || "").toUpperCase() === "HEADER"
  );
  const body = components.find(
    (item) => String(item.type || "").toUpperCase() === "BODY"
  );
  const footer = components.find(
    (item) => String(item.type || "").toUpperCase() === "FOOTER"
  );

  let offset = 0;
  const headerTexto = substituirPreviewSequencial(
    header?.text || "",
    variaveis,
    offset
  ).trim();
  offset += contarVariaveisTemplate({
    ...template,
    payload: {
      ...template.payload,
      components: header ? [header] : [],
    },
  });

  const bodyTexto = substituirPreviewSequencial(
    body?.text || "",
    variaveis,
    offset
  ).trim();

  return {
    titulo: headerTexto || template.nome || "Template WhatsApp",
    corpo: bodyTexto || "Template sem conteúdo para prévia.",
    rodape: String(footer?.text || "").trim() || "Equipe de atendimento",
  };
}

function normalizarVariavelTemplate(valor: string) {
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

function normalizarEntradaVariavelTemplate(valor: string) {
  return String(valor || "")
    .replace(/[{}]/g, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+/g, "");
}

function resolverVariavelContato(
  valor: string,
  contato: ContatoOpcao,
  variaveisPersonalizadas: VariavelPersonalizada[] = [],
  protocolosPorContato: ProtocolosContatoMap = {}
) {
  const texto = String(valor || "").trim();
  const chave = normalizarVariavelTemplate(texto);

  if (!texto) return "";

  if (chave === "nome" || chave === "nome_contato" || chave === "contato_nome") {
    return contato.nome || "Cliente";
  }

  if (
    chave === "telefone" ||
    chave === "numero" ||
    chave === "numero_contato" ||
    chave === "contato_numero"
  ) {
    return contato.telefone || "";
  }

  if (chave === "email" || chave === "email_contato" || chave === "contato_email") {
    return contato.email || "";
  }

  if (chave === "campanha") {
    return contato.campanha || contato.status_lead || contato.telefone || "";
  }

  if (chave === "status_lead" || chave === "status") {
    return contato.status_lead || contato.campanha || contato.telefone || "";
  }

  if (chave === "origem") {
    return contato.origem || "";
  }

  if (chave === "protocolo_atual") {
    return protocolosPorContato[contato.id]?.protocolo_atual || "";
  }

  if (chave === "ultimo_protocolo") {
    return protocolosPorContato[contato.id]?.ultimo_protocolo || "";
  }

  const variavelPersonalizada = variaveisPersonalizadas.find(
    (item) => normalizarVariavelTemplate(item.chave) === chave
  );

  if (variavelPersonalizada) {
    return variavelPersonalizada.valor || "";
  }

  return texto;
}

function formatarStatusIntegracao(status?: string | null) {
  if (!status) return "Sem status";

  switch (status.toLowerCase()) {
    case "ativo":
      return "Ativa";
    case "conectado":
      return "Conectada";
    case "inativo":
      return "Inativa";
    default:
      return status;
  }
}

function getTemplateStatusLabel(status: string | null | undefined) {
  if (!status) return "Sem status";

  switch (status.toUpperCase()) {
    case "PENDING":
      return "Em análise";
    case "APPROVED":
      return "Aprovado";
    case "REJECTED":
      return "Rejeitado";
    case "PAUSED":
      return "Pausado";
    case "DISABLED":
      return "Desativado";
    case "ARCHIVED":
      return "Arquivado";
    case "ERRO_ENVIO":
      return "Erro no envio";
    default:
      return status;
  }
}

function formatarCategoriaMeta(categoria: string | null | undefined) {
  switch (String(categoria || "").toUpperCase()) {
    case "UTILITY":
      return "Utilidade";
    case "MARKETING":
      return "Marketing";
    case "AUTHENTICATION":
      return "Autenticação";
    default:
      return categoria || "-";
  }
}

function normalizarMetadataJson(metadata: any) {
  if (!metadata) return null;

  if (typeof metadata === "string") {
    try {
      return JSON.parse(metadata);
    } catch {
      return null;
    }
  }

  return metadata;
}

function obterFeedbackErroDisparo(item: ResultadoDisparo) {
  if (disparoEstaProcessando(item)) return null;
  if (disparoTeveSucesso(item)) return null;

  const metadata = normalizarMetadataJson(item.metadata_json);

  const erroMeta =
    metadata?.whatsapp_status?.raw_status?.errors?.[0] ||
    metadata?.meta_response?.error ||
    null;

  const codigo = Number(erroMeta?.code || 0);

  const mensagemTecnica =
    item.erro_tecnico ||
    item.erro ||
    metadata?.whatsapp_status?.error_message ||
    erroMeta?.message ||
    erroMeta?.title ||
    "Falha ao enviar mensagem.";

  switch (codigo) {
    case 131042:
      return {
        titulo: "Falha por pendência financeira na Meta",
        descricao:
          "A conta WhatsApp Business possui pendências financeiras na Meta. Para regularizar, acesse o Gerenciador de Negócios da Meta, vá em Cobrança/Pagamentos, selecione a conta WhatsApp Business e quite o valor pendente. Depois da confirmação do pagamento, tente enviar o disparo novamente.",        detalhe: mensagemTecnica,
      };

    case 131026:
      return {
        titulo: "Número indisponível no WhatsApp",
        descricao:
          "O número do destinatário pode estar inválido, bloqueado ou indisponível para receber mensagens pelo WhatsApp.",
        detalhe: mensagemTecnica,
      };

    case 470:
      return {
        titulo: "Janela de atendimento encerrada",
        descricao:
          "A janela de 24 horas com este contato foi encerrada. Para iniciar uma nova conversa, envie um template aprovado.",
        detalhe: mensagemTecnica,
      };

    case 368:
      return {
        titulo: "Conta temporariamente bloqueada pela Meta",
        descricao:
          "A Meta bloqueou temporariamente o envio de mensagens desta conta WhatsApp.",
        detalhe: mensagemTecnica,
      };

    default:
      if (item.erro_amigavel) {
        return {
          titulo: "Falha no envio",
          descricao: item.erro_amigavel,
          detalhe: mensagemTecnica,
        };
      }

      return {
        titulo: "Falha no envio",
        descricao: mensagemTecnica,
        detalhe: mensagemTecnica,
      };
  }
}


function getTemplateStatusClass(status: string | null | undefined) {
  if (!status) return styles.badgeGray;

  switch (status.toUpperCase()) {
    case "PENDING":
      return styles.badgeYellow;
    case "APPROVED":
      return styles.badgeGreen;
    case "REJECTED":
      return styles.badgeRed;
    case "PAUSED":
    case "DISABLED":
    case "ARCHIVED":
      return styles.badgeGray;
    default:
      return styles.badgeBlue;
  }
}

function limparNumero(valor: string | null | undefined) {
  return String(valor || "").replace(/\D/g, "");
}

function formatarTelefone(numero: string | null | undefined) {
  const limpo = limparNumero(numero);

  if (!limpo) return "Sem telefone";
  return limpo;
}

function contatoTemTelefoneValido(contato: ContatoOpcao) {
  const telefone = limparNumero(contato.telefone);
  return telefone.length >= 10;
}

function formatarDataHora(data?: string | null) {
  if (!data) return "";

  try {
    return new Date(data).toLocaleString("pt-BR");
  } catch {
    return "";
  }
}

function normalizarStatusDisparo(item: ResultadoDisparo) {
  return String(item.status_disparo || "").toLowerCase().trim();
}

function disparoEstaProcessando(item: ResultadoDisparo) {
  return normalizarStatusDisparo(item) === "processando";
}

function disparoTeveSucesso(item: ResultadoDisparo) {
  return item.ok === true || normalizarStatusDisparo(item) === "sucesso";
}

function disparoTeveFalha(item: ResultadoDisparo) {
  const status = normalizarStatusDisparo(item);

  if (status === "processando") return false;
  if (status === "sucesso") return false;

  return item.ok === false || status === "falha";
}


const ITENS_HISTORICO_POR_PAGINA = 7;

export default function DisparosWhatsAppPage() {
  const [usuarioLogado, setUsuarioLogado] = useState<UsuarioLogado | null>(null);

  const [integracoes, setIntegracoes] = useState<IntegracaoWhatsApp[]>([]);
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [contatos, setContatos] = useState<ContatoOpcao[]>([]);
  const [contatosSelecionados, setContatosSelecionados] = useState<ContatoOpcao[]>([]);

  const [loadingUsuario, setLoadingUsuario] = useState(true);
  const [loadingIntegracoes, setLoadingIntegracoes] = useState(true);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [loadingContatos, setLoadingContatos] = useState(false);
  const [loadingHistorico, setLoadingHistorico] = useState(false);
  const [disparando, setDisparando] = useState(false);
  const [totalContatosDisponiveis, setTotalContatosDisponiveis] = useState(0);

  const [integracaoId, setIntegracaoId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [templateVariavel1, setTemplateVariavel1] = useState("nome_contato");
  const [templateVariavel2, setTemplateVariavel2] = useState("campanha");
  const [templateVariavel3, setTemplateVariavel3] = useState("telefone");
  const [buscaContato, setBuscaContato] = useState("");
  const [origemFiltro, setOrigemFiltro] = useState("");
  const [origensDisponiveis, setOrigensDisponiveis] = useState<string[]>([]);

  const [campanhaFiltro, setCampanhaFiltro] = useState("");
  const [campanhasDisponiveis, setCampanhasDisponiveis] = useState<string[]>([]);

  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState<ResultadoDisparo[]>([]);
  const [mensagensExpandidas, setMensagensExpandidas] = useState<string[]>([]);
  const [paginaHistorico, setPaginaHistorico] = useState(1);

  const [modalConfirmacaoAberto, setModalConfirmacaoAberto] = useState(false);
  const [confirmacaoCobranca, setConfirmacaoCobranca] = useState(false);
  const [modalVariaveisAberto, setModalVariaveisAberto] = useState(false);
  const [variaveisPersonalizadas, setVariaveisPersonalizadas] = useState<
    VariavelPersonalizada[]
  >([]);
  const [loadingVariaveis, setLoadingVariaveis] = useState(false);
  const [salvandoVariavel, setSalvandoVariavel] = useState(false);
  const [novaVariavelChave, setNovaVariavelChave] = useState("");
  const [novaVariavelValor, setNovaVariavelValor] = useState("");
  const [novaVariavelDescricao, setNovaVariavelDescricao] = useState("");
  const [novaVariavelEscopo, setNovaVariavelEscopo] = useState<
    "global" | "disparos" | "fluxos"
  >("global");

  const [filtroHistorico, setFiltroHistorico] = useState<
    "todos" | "sucesso" | "falha" | "processando"
  >("todos");

  const [previewCusto, setPreviewCusto] = useState<{
    categoria: string;
    totalSelecionados: number;
    totalIsentos: number;
    totalCobrados: number;
    valorUnitarioUsd: number;
    valorTotalUsd: number;
    cotacaoUsdBrl: number;
    valorTotalBrlEstimado: number;
    valorTotalBrlMin: number;
    valorTotalBrlMax: number;
    margemMinPercent: number;
    margemMaxPercent: number;
    fonteCotacao?: string;
    cotacaoDataHora?: string | null;
    cotacaoFallback?: boolean;
  } | null>(null);

  const [loadingPreviewCusto, setLoadingPreviewCusto] = useState(false);

  async function carregarUsuarioLogado() {
    try {
      setLoadingUsuario(true);

      const res = await fetch("/api/me", { cache: "no-store" });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Erro ao carregar usuário logado.");
      }

      setUsuarioLogado(data.usuario || null);
    } catch (error: any) {
      setErro(error?.message || "Erro ao carregar usuário logado.");
    } finally {
      setLoadingUsuario(false);
    }
  }

  async function carregarIntegracoes() {
    try {
      setLoadingIntegracoes(true);
      setErro("");

      const res = await fetch("/api/integracoes-whatsapp/listar", {
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao carregar integrações.");
      }

      setIntegracoes(Array.isArray(json.data) ? json.data : []);
    } catch (error: any) {
      setErro(error?.message || "Erro ao carregar integrações.");
    } finally {
      setLoadingIntegracoes(false);
    }
  }

  async function carregarTemplates(integracaoSelecionadaId: string) {
    try {
      if (!integracaoSelecionadaId) {
        setTemplates([]);
        return;
      }

      setLoadingTemplates(true);
      setErro("");

      const res = await fetch(
        `/api/whatsapp/templates?integracao_whatsapp_id=${encodeURIComponent(
          integracaoSelecionadaId
        )}`,
        { cache: "no-store" }
      );

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao carregar templates.");
      }

      const lista = Array.isArray(json.data) ? json.data : [];
      const aprovados = lista.filter(
        (item: WhatsAppTemplate) => item.status?.toUpperCase() === "APPROVED"
      );
      

      setTemplates(aprovados);
    } catch (error: any) {
      setErro(error?.message || "Erro ao carregar templates.");
    } finally {
      setLoadingTemplates(false);
    }
  }

  async function carregarContatos(busca = "", origem = "", campanha = "") {
    try {
      setLoadingContatos(true);
      setErro("");

      const params = new URLSearchParams();

      if (busca.trim()) {
        params.set("busca", busca.trim());
      }

      if (origem.trim()) {
        params.set("origem", origem.trim());
      }

      if (campanha.trim()) {
        params.set("campanha", campanha.trim());
      }

      params.set("pagina", "1");
      params.set("limite", "2000");

      const res = await fetch(`/api/contatos?${params.toString()}`, {
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Erro ao carregar contatos.");
      }

      const lista = Array.isArray(json.contatos) ? json.contatos : [];
      setContatos(lista);
      setOrigensDisponiveis(Array.isArray(json.origens) ? json.origens : []);
      setCampanhasDisponiveis(
        Array.isArray(json.campanhas) ? json.campanhas : []
      );
      setTotalContatosDisponiveis(Number(json.total || 0));

    } catch (error: any) {
      setErro(error?.message || "Erro ao carregar contatos.");
    } finally {
      setLoadingContatos(false);
    }
  }

  async function carregarHistorico() {
    try {
      setLoadingHistorico(true);

      const res = await fetch("/api/whatsapp/disparos/historico?limit=50", {
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao carregar histórico de disparos.");
      }

      setResultado(Array.isArray(json.resultados) ? json.resultados : []);
    } catch (error: any) {
      setErro(error?.message || "Erro ao carregar histórico de disparos.");
    } finally {
      setLoadingHistorico(false);
    }
  }

  useEffect(() => {
    carregarUsuarioLogado();
    carregarIntegracoes();
    carregarContatos("", "", "");
    carregarHistorico();
    carregarVariaveisPersonalizadas();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      carregarContatos(buscaContato, origemFiltro, campanhaFiltro);
    }, 300);

    return () => clearTimeout(timer);
  }, [buscaContato, origemFiltro, campanhaFiltro]);

  useEffect(() => {
    setTemplateId("");
    setMensagem("");
    setErro("");

    if (integracaoId) {
      carregarTemplates(integracaoId);
    } else {
      setTemplates([]);
    }
  }, [integracaoId]);

  const permissoes = usuarioLogado?.permissoes || [];
  const nomesPerfisDinamicos = Array.isArray(usuarioLogado?.perfis_dinamicos)
    ? usuarioLogado.perfis_dinamicos.map((perfil) => perfil.nome)
    : [];

  const ehAdministrador = nomesPerfisDinamicos.includes("Administrador");

  const podeDisparar =
    ehAdministrador ||
    can(permissoes, "whatsapp.disparos.enviar") ||
    can(permissoes, "mensagens.enviar");

  const integracaoSelecionada = useMemo(() => {
    return integracoes.find((item) => item.id === integracaoId) || null;
  }, [integracoes, integracaoId]);

  const templateSelecionado = useMemo(() => {
    return templates.find((item) => item.id === templateId) || null;
  }, [templates, templateId]);

  const totalVariaveis = useMemo(() => {
    return contarVariaveisTemplate(templateSelecionado);
  }, [templateSelecionado]);

  const variaveisTemplate = useMemo(
    () => [templateVariavel1, templateVariavel2, templateVariavel3],
    [templateVariavel1, templateVariavel2, templateVariavel3]
  );

  const previewTemplateSelecionado = useMemo(() => {
    return montarPreviewTemplateDisparo(templateSelecionado, variaveisTemplate);
  }, [templateSelecionado, variaveisTemplate]);

  const contatosDisponiveis = useMemo(() => {
    const idsSelecionados = new Set(contatosSelecionados.map((item) => item.id));
    return contatos.filter((item) => !idsSelecionados.has(item.id));
  }, [contatos, contatosSelecionados]);

  const contatosDisponiveisValidos = useMemo(() => {
    return contatosDisponiveis.filter(contatoTemTelefoneValido);
  }, [contatosDisponiveis]);

  const totalSucesso = useMemo(() => {
    return resultado.filter(disparoTeveSucesso).length;
  }, [resultado]);

  const totalFalha = useMemo(() => {
    return resultado.filter(disparoTeveFalha).length;
  }, [resultado]);

  const totalProcessando = useMemo(() => {
    return resultado.filter(disparoEstaProcessando).length;
  }, [resultado]);

  const resultadoFiltrado = useMemo(() => {
    if (filtroHistorico === "todos") return resultado;

    return resultado.filter((item) => {
      if (filtroHistorico === "falha") {
        return disparoTeveFalha(item);
      }

      if (filtroHistorico === "processando") {
        return disparoEstaProcessando(item);
      }

      if (filtroHistorico === "sucesso") {
        return disparoTeveSucesso(item);
      }

      return true;
    });
  }, [resultado, filtroHistorico]);

  const totalPaginasHistorico = useMemo(() => {
    return Math.max(
      1,
      Math.ceil(resultadoFiltrado.length / ITENS_HISTORICO_POR_PAGINA)
    );
  }, [resultadoFiltrado.length]);

  const resultadoHistoricoPaginado = useMemo(() => {
    const inicio = (paginaHistorico - 1) * ITENS_HISTORICO_POR_PAGINA;
    const fim = inicio + ITENS_HISTORICO_POR_PAGINA;

    return resultadoFiltrado.slice(inicio, fim);
  }, [resultadoFiltrado, paginaHistorico]);

  const primeiroItemHistorico =
    resultadoFiltrado.length === 0
      ? 0
      : (paginaHistorico - 1) * ITENS_HISTORICO_POR_PAGINA + 1;

  const ultimoItemHistorico = Math.min(
    paginaHistorico * ITENS_HISTORICO_POR_PAGINA,
    resultadoFiltrado.length
  );

  function adicionarContato(contato: ContatoOpcao) {
    const telefone = limparNumero(contato.telefone);

    if (!telefone || telefone.length < 10) {
      setErro("Este contato não possui telefone válido para disparo.");
      return;
    }

    setErro("");
    setContatosSelecionados((prev) => {
      if (prev.some((item) => item.id === contato.id)) return prev;
      return [...prev, contato];
    });
  }

  function adicionarTodosDisponiveis() {
    const mapaSelecionados = new Set(contatosSelecionados.map((item) => item.id));

    const novos = contatosDisponiveisValidos.filter(
      (item) => !mapaSelecionados.has(item.id)
    );

    if (novos.length === 0) {
      setErro("Nenhum contato válido disponível para adicionar.");
      return;
    }

    setErro("");
    setContatosSelecionados((prev) => [...prev, ...novos]);
  }

  function removerContato(contatoId: string) {
    setContatosSelecionados((prev) => prev.filter((item) => item.id !== contatoId));
  }

  function limparSelecao() {
    setContatosSelecionados([]);
    setMensagem("");
    setErro("");
  }

  function formatarMoedaBRL(valor?: number | null) {
    return Number(valor || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  }

  function formatarMoedaUSD(valor?: number | null) {
    return `US$ ${Number(valor || 0).toFixed(4)}`;
  }

  function formatarNumeroCotacao(valor?: number | null) {
    return Number(valor || 0).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });
  }

  async function carregarVariaveisPersonalizadas() {
    try {
      setLoadingVariaveis(true);

      const res = await fetch("/api/variaveis", {
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao carregar variáveis.");
      }

      setVariaveisPersonalizadas(
        Array.isArray(json.variaveis) ? json.variaveis : []
      );
    } catch (error: any) {
      setErro(error?.message || "Erro ao carregar variáveis.");
    } finally {
      setLoadingVariaveis(false);
    }
  }

  async function salvarVariavelPersonalizada() {
    try {
      setErro("");
      setMensagem("");

      const chave = normalizarEntradaVariavelTemplate(novaVariavelChave);
      const valor = novaVariavelValor.trim();

      if (!chave) {
        setErro("Informe o nome da variável.");
        return;
      }

      if (!valor) {
        setErro("Informe o valor da variável.");
        return;
      }

      setSalvandoVariavel(true);

      const res = await fetch("/api/variaveis", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chave,
          valor,
          descricao: novaVariavelDescricao.trim(),
          escopo: novaVariavelEscopo,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao salvar variável.");
      }

      setNovaVariavelChave("");
      setNovaVariavelValor("");
      setNovaVariavelDescricao("");
      setNovaVariavelEscopo("global");

      setMensagem("Variável salva com sucesso.");
      await carregarVariaveisPersonalizadas();
    } catch (error: any) {
      setErro(error?.message || "Erro ao salvar variável.");
    } finally {
      setSalvandoVariavel(false);
    }
  }

  async function removerVariavelPersonalizada(id: string) {
    try {
      setErro("");
      setMensagem("");

      const res = await fetch("/api/variaveis", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao remover variável.");
      }

      setMensagem("Variável removida com sucesso.");
      await carregarVariaveisPersonalizadas();
    } catch (error: any) {
      setErro(error?.message || "Erro ao remover variável.");
    }
  }

  function aplicarVariavelNoCampo(chave: string) {
    const valor = normalizarEntradaVariavelTemplate(chave);

    if (!valor) return;

    if (totalVariaveis <= 1) {
      setTemplateVariavel1(valor);
      return;
    }

    if (!templateVariavel1.trim()) {
      setTemplateVariavel1(valor);
      return;
    }

    if (totalVariaveis >= 2 && !templateVariavel2.trim()) {
      setTemplateVariavel2(valor);
      return;
    }

    if (totalVariaveis >= 3 && !templateVariavel3.trim()) {
      setTemplateVariavel3(valor);
      return;
    }

    setTemplateVariavel1(valor);
  }


  function variaveisUsamProtocolo(variaveis: string[]) {
    return variaveis.some((variavel) => {
      const chave = normalizarVariavelTemplate(variavel);

      return chave === "protocolo_atual" || chave === "ultimo_protocolo";
    });
  }

  async function carregarProtocolosDosContatos(
    contatosLista: ContatoOpcao[]
  ): Promise<ProtocolosContatoMap> {
    try {
      if (contatosLista.length === 0) return {};

      const res = await fetch("/api/variaveis/protocolos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contato_ids: contatosLista.map((contato) => contato.id),
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao buscar protocolos dos contatos.");
      }

      return json.protocolos || {};
    } catch (error: any) {
      throw new Error(error?.message || "Erro ao buscar protocolos dos contatos.");
    }
  }


  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setMensagem("");
    setErro("");

    if (!podeDisparar) {
      setErro("Você não tem permissão para realizar disparos.");
      return;
    }

    if (!integracaoId) {
      setErro("Selecione a integração WhatsApp.");
      return;
    }

    if (!templateId) {
      setErro("Selecione o template.");
      return;
    }

    if (contatosSelecionados.length === 0) {
      setErro("Selecione pelo menos um contato.");
      return;
    }

    if (totalVariaveis > 3) {
      setErro("Este template usa mais de 3 variáveis. Use um template com até 3 variáveis para esta tela.");
      return;
    }

    const variaveisObrigatorias = variaveisTemplate
      .slice(0, totalVariaveis)
      .map((item) => normalizarVariavelTemplate(item));

    if (variaveisObrigatorias.some((item) => !item)) {
      setErro("Preencha os campos Variável 1, 2 e 3 exigidos pelo template.");
      return;
    }

    try {
      setDisparando(true);

      const protocolosPorContato = variaveisUsamProtocolo(variaveisObrigatorias)
        ? await carregarProtocolosDosContatos(contatosSelecionados)
        : {};

      const destinatarios = contatosSelecionados.map((contato) => ({
        numero: limparNumero(contato.telefone),
        variaveis:
          totalVariaveis > 0
            ? variaveisObrigatorias.map((variavel) =>
                resolverVariavelContato(
                  variavel,
                  contato,
                  variaveisPersonalizadas,
                  protocolosPorContato
                )
              )
            : [],
      }));

      const res = await fetch("/api/whatsapp/disparos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          integracao_whatsapp_id: integracaoId,
          template_id: templateId,
          destinatarios,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao realizar disparo.");
      }

      const listaResultado = Array.isArray(json.resultados) ? json.resultados : [];

      const sucesso = listaResultado.filter((item: ResultadoDisparo) => item.ok).length;
      const falha = listaResultado.filter((item: ResultadoDisparo) => !item.ok).length;

      setMensagem(
        `Disparo enviado para a Meta. Aguardando confirmação de entrega pelo WhatsApp. Aceitos: ${sucesso}. Falhas imediatas: ${falha}.`
      );

      await carregarHistorico();

      setTimeout(() => {
        carregarHistorico();
      }, 5000);

      setTimeout(() => {
        carregarHistorico();
      }, 12000);

    } catch (error: any) {
      setErro(error?.message || "Erro ao realizar disparo.");
    } finally {
      setDisparando(false);
    }
  }


  async function calcularPreviewCusto(
    categoria: string,
    contatosLista: ContatoOpcao[]
  ) {
    try {
      if (!categoria || contatosLista.length === 0) {
        setPreviewCusto(null);
        return;
      }

      setLoadingPreviewCusto(true);

      const res = await fetch("/api/whatsapp/disparos/custo-preview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          categoria,
          contatos: contatosLista.map((contato) => ({
            id: contato.id,
            telefone: contato.telefone,
          })),
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao calcular custo do disparo.");
      }

      const totalCobrados = Number(json.totalCobrados || 0);
      const valorTotalUsd = Number(json.valorTotalUsd || 0);

      const valorTotalBrlEstimado =
        totalCobrados <= 0 || valorTotalUsd <= 0
          ? 0
          : Number(json.valorTotalBrlEstimado || 0);

      const valorTotalBrlMin =
        totalCobrados <= 0 || valorTotalUsd <= 0
          ? 0
          : Math.max(0, Number(json.valorTotalBrlMin || 0));

      const valorTotalBrlMax =
        totalCobrados <= 0 || valorTotalUsd <= 0
          ? 0
          : Math.max(0, Number(json.valorTotalBrlMax || 0));

      setPreviewCusto({
        categoria: String(json.categoria || ""),
        totalSelecionados: Number(json.totalSelecionados || 0),
        totalIsentos: Number(json.totalIsentos || 0),
        totalCobrados,
        valorUnitarioUsd: Number(json.valorUnitarioUsd || 0),
        valorTotalUsd,
        cotacaoUsdBrl: Number(json.cotacaoUsdBrl || 0),
        valorTotalBrlEstimado,
        valorTotalBrlMin,
        valorTotalBrlMax,
        margemMinPercent: Number(json.margemMinPercent || 0),
        margemMaxPercent: Number(json.margemMaxPercent || 0),
        fonteCotacao: json.fonteCotacao || "",
        cotacaoDataHora: json.cotacaoDataHora || null,
        cotacaoFallback: Boolean(json.cotacaoFallback),
      });
    } catch (error: any) {
      setPreviewCusto(null);
      setErro(error?.message || "Erro ao calcular custo do disparo.");
    } finally {
      setLoadingPreviewCusto(false);
    }
  }

  function alternarMensagemExpandida(chave: string) {
    setMensagensExpandidas((prev) =>
      prev.includes(chave)
        ? prev.filter((item) => item !== chave)
        : [...prev, chave]
    );
  }

  function resumirMensagem(texto?: string | null) {
    const conteudo = String(texto || "").trim();

    if (!conteudo) return "Sem conteúdo";

    const partes = conteudo
      .split(/(?<=[.!?])\s+/)
      .map((item) => item.trim())
      .filter(Boolean);

    if (partes.length === 0) return conteudo;

    return partes[0];
  }

  function formatarBRL(valor: number) {
  return valor < 1
    ? valor.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
        minimumFractionDigits: 3,
      })
    : valor.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      });
}

  async function confirmarEDisparar() {
    if (!confirmacaoCobranca) return;

    setModalConfirmacaoAberto(false);
    setConfirmacaoCobranca(false);

    const fakeEvent = {
      preventDefault: () => {},
    } as React.FormEvent<HTMLFormElement>;

    await handleSubmit(fakeEvent);
  }


  useEffect(() => {
    const categoria = String(templateSelecionado?.categoria || "").toLowerCase();

    if (!categoria || contatosSelecionados.length === 0) {
      setPreviewCusto(null);
      return;
    }

    calcularPreviewCusto(categoria, contatosSelecionados);
  }, [templateSelecionado, contatosSelecionados]);

  useEffect(() => {
    setPaginaHistorico(1);
  }, [resultado.length, filtroHistorico]);

  return (
    <>
      <Header
        title="Disparos WhatsApp"
        subtitle="Selecione a conexão WhatsApp, o template aprovado e os contatos salvos para enviar mensagens."
      />

      <div className={styles.pageContent}>
        <div className={styles.layout}>
          <section className={styles.formCard}>
            <div className={styles.cardHeader}>
              <div className={styles.cardHeaderContent}>
                <div>
                  <p className={styles.eyebrow}>Operação</p>
                  <h2 className={styles.cardTitle}>Novo disparo</h2>
                  <p className={styles.cardSubtitle}>
                    Escolha a conexão, selecione o template e defina os contatos.
                  </p>
                </div>

                <a
                  href="https://business.facebook.com/latest/billing_hub/accounts/details"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.metaPaymentButton}
                >
                  Configurar pagamento na Meta
                </a>
              </div>
            </div>

              {loadingUsuario || loadingIntegracoes ? (
                <div className={styles.emptyState}>Carregando dados...</div>
              ) : !podeDisparar ? (
                <div className={styles.inlineBlock}>
                  <div className={styles.errorAlert}>
                    Você não tem permissão para acessar este recurso.
                  </div>
                </div> 
              ) : (
              <form onSubmit={handleSubmit} className={styles.form}>
                <div className={styles.setupPreviewGrid}>
                  <div className={styles.field}>
                    <div className={styles.setupColumn}>
                      <div className={styles.field}>
                        <label className={styles.label}>Integração WhatsApp</label>
                        <select
                          value={integracaoId} 
                          onChange={(e) => setIntegracaoId(e.target.value)}
                          className={styles.input}
                        >
                          <option value="">Selecione uma conexão</option>
                          {integracoes.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.nome_conexao} {item.numero ? `- ${item.numero}` : ""}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className={styles.field}>
                        <label className={styles.label}>Template aprovado</label>
                        <select
                          value={templateId}
                          onChange={(e) => setTemplateId(e.target.value)}
                          className={styles.input}
                          disabled={!integracaoId || loadingTemplates}
                        >
                          <option value="">
                            {!integracaoId
                              ? "Selecione uma conexão primeiro"
                              : loadingTemplates
                              ? "Carregando templates..."
                              : "Selecione um template"}
                          </option>

                          {templates.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.nome} - {getTemplateStatusLabel(item.status)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    
                    {templateSelecionado ? (
                      <div className={styles.templateInfoBox}>
                        <div>
                          <strong>Categoria:</strong> {formatarCategoriaMeta(templateSelecionado.categoria)}
                        </div>

                        <div className={styles.templateInfoDivider} />

                        <div>
                          <strong>Idioma:</strong> {templateSelecionado.idioma || "-"}
                        </div>
                      </div>
                    ) : null}
                    
                      {totalVariaveis > 0 ? (
                        <>
                          <div className={styles.templateHintRow}>
                            <div className={styles.templateHint}>
                              Este template usa <strong>{totalVariaveis}</strong> variável(is).
                              Variável 1 substitui <strong>{" {{1}}"}</strong>, Variável 2 substitui
                              <strong>{" {{2}}"}</strong> e Variável 3 substitui <strong>{" {{3}}"}</strong>.
                            </div>

                            <button
                              type="button"
                              className={styles.variablesButton}
                              onClick={() => setModalVariaveisAberto(true)}
                            >
                              Gerenciar variáveis
                            </button>
                          </div>

                          <div className={styles.templateVariablesGrid}>
                            <div className={styles.field}>
                              <label className={styles.label}>Variável 1</label>
                              <input
                                value={templateVariavel1}
                                onChange={(e) =>
                                  setTemplateVariavel1(
                                    normalizarEntradaVariavelTemplate(e.target.value)
                                  )
                                }
                                className={styles.input}
                                placeholder="nome_contato"
                              />
                            </div>

                            {totalVariaveis >= 2 ? (
                              <div className={styles.field}>
                                <label className={styles.label}>Variável 2</label>
                                <input
                                  value={templateVariavel2}
                                  onChange={(e) =>
                                    setTemplateVariavel2(
                                      normalizarEntradaVariavelTemplate(e.target.value)
                                    )
                                  }
                                  className={styles.input}
                                  placeholder="campanha"
                                />
                              </div>
                            ) : null}

                            {totalVariaveis >= 3 ? (
                              <div className={styles.field}>
                                <label className={styles.label}>Variável 3</label>
                                <input
                                  value={templateVariavel3}
                                  onChange={(e) =>
                                    setTemplateVariavel3(
                                      normalizarEntradaVariavelTemplate(e.target.value)
                                    )
                                  }
                                  className={styles.input}
                                  placeholder="telefone"
                                />
                              </div>
                            ) : null}
                          </div>
                            <span className={styles.help}>
                              Variáveis fixas: {"{{nome_contato}}"}, {"{{email_contato}}"}, {"{{numero_contato}}"}, {"{{campanha}}"}, {"{{origem}}"}, {"{{status_lead}}"}, {"{{protocolo_atual}}"} e {"{{ultimo_protocolo}}"}.
                            </span>
                        </>
                      ) : null}
                  </div>

                  <aside className={styles.previewSideCard}>
                    <div className={styles.previewTopLine}>
                      <strong>Prévia</strong>
                    </div>

                    {templateSelecionado ? (
                      <>
                        <div className={styles.whatsappPreviewArea}>
                          <div className={styles.whatsappBubble}>
                            <strong className={styles.whatsappPreviewTitle}>
                              {previewTemplateSelecionado?.titulo || templateSelecionado.nome}
                            </strong>

                            <p className={styles.whatsappPreviewText}>
                              {previewTemplateSelecionado?.corpo || extrairBody(templateSelecionado.payload)}
                            </p>

                            <div className={styles.whatsappPreviewMeta}>
                              <span className={styles.whatsappPreviewFooter}>
                                {previewTemplateSelecionado?.rodape || "Equipe de atendimento"}
                              </span>

                              <span className={styles.whatsappPreviewTime}>
                                {new Date().toLocaleTimeString("pt-BR", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>

                            {extrairQuickReplies(templateSelecionado.payload).map((texto, index) => (
                              <div key={`${texto}-${index}`} className={styles.whatsappPreviewButton}>
                                ↩ {texto}
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className={styles.previewEmptyState}>
                        Selecione um template aprovado para visualizar a mensagem do WhatsApp.
                      </div>
                    )}
                  </aside>
                </div>

                <div className={styles.searchRow}>
                  <div className={styles.searchFilters}>
                    <div className={styles.field}>
                      <label className={styles.label}>Buscar contatos salvos</label>
                      <input
                        value={buscaContato}
                        onChange={(e) => setBuscaContato(e.target.value)}
                        className={styles.input}
                        placeholder="Busque por nome, telefone, e-mail, campanha..."
                      />
                    </div>

                    <div className={styles.field}>
                      <label className={styles.label}>Filtrar por origem</label>
                      <select
                        value={origemFiltro}
                        onChange={(e) => setOrigemFiltro(e.target.value)}
                        className={styles.input}
                      >
                      {origensDisponiveis.length > 0 ? (
                        <>
                          <option value="">Todas as origens</option>

                          {origensDisponiveis.map((origem) => (
                            <option key={origem} value={origem}>
                              {origem}
                            </option>
                          ))}
                        </>
                      ) : (
                        <option value="">Nenhuma origem encontrada</option>
                      )}
                      </select>
                    </div>

                    <div className={styles.field}>
                      <label className={styles.label}>Filtrar por campanha</label>
                      <select
                        value={campanhaFiltro}
                        onChange={(e) => setCampanhaFiltro(e.target.value)}
                        className={styles.input}
                      >
                        {campanhasDisponiveis.length > 0 ? (
                          <>
                            <option value="">Todas as campanhas</option>

                            {campanhasDisponiveis.map((campanha) => (
                              <option key={campanha} value={campanha}>
                                {campanha}
                              </option>
                            ))}
                          </>
                        ) : (
                          <option value="">Nenhuma campanha encontrada</option>
                        )}
                      </select>
                    </div>
                  </div>

                  <div className={styles.inlineActions}>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={adicionarTodosDisponiveis}
                      disabled={loadingContatos || contatosDisponiveisValidos.length === 0}
                    >
                      Adicionar filtrados
                    </button>

                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => {
                        setBuscaContato("");
                        setOrigemFiltro("");
                        setCampanhaFiltro("");
                        limparSelecao();
                      }}
                      disabled={
                        contatosSelecionados.length === 0 &&
                        !buscaContato &&
                        !origemFiltro &&
                        !campanhaFiltro
                      }
                    >
                      Limpar filtros
                    </button>
                  </div>
                </div>

                <div className={styles.contactsSection}>
                  <div className={styles.contactsColumn}>
                    <div className={styles.contactsHeader}>
                      <h3 className={styles.contactsTitle}>Contatos salvos</h3>
                      <span className={styles.contactsCount}>
                        {loadingContatos ? "..." : totalContatosDisponiveis}
                      </span>
                    </div>

                    <div className={styles.contactsList}>
                      {loadingContatos ? (
                        <div className={styles.emptyMiniState}>Carregando contatos...</div>
                      ) : contatosDisponiveis.length === 0 ? (
                        <div className={styles.emptyMiniState}>
                          Nenhum contato salvo disponível.
                        </div>
                      ) : (
                        contatosDisponiveis.map((contato) => {
                          const telefoneValido = contatoTemTelefoneValido(contato);

                          return (
                            <div key={contato.id} className={styles.contactCard}>
                              <div className={styles.contactMain}>
                                <strong className={styles.contactName}>
                                  {contato.nome || "Sem nome"}
                                </strong>

                                <p className={styles.contactMeta}>
                                  {formatarTelefone(contato.telefone)}
                                </p>

                                {contato.email ? (
                                  <p className={styles.contactMeta}>{contato.email}</p>
                                ) : null}

                                <div className={styles.contactBadges}>
                                  {contato.origem ? (
                                    <span className={styles.contactBadge}>
                                      {contato.origem}
                                    </span>
                                  ) : null}

                                  {contato.status_lead ? (
                                    <span className={styles.contactBadge}>
                                      {contato.status_lead}
                                    </span>
                                  ) : null}

                                  {contato.campanha ? (
                                    <span className={styles.contactBadge}>
                                      {contato.campanha}
                                    </span>
                                  ) : null}

                                  {!telefoneValido ? (
                                    <span className={styles.contactBadgeWarning}>
                                      Sem telefone válido
                                    </span>
                                  ) : null}
                                </div>
                              </div>

                              <button
                                type="button"
                                className={styles.ButtonAdd}
                                onClick={() => adicionarContato(contato)}
                                disabled={!telefoneValido}
                              >
                                Add
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  <div className={styles.contactsColumn}>
                    <div className={styles.contactsHeader}>
                      <h3 className={styles.contactsTitle}>Selecionados para disparo</h3>
                      <span className={styles.contactsCount}>
                        {contatosSelecionados.length}
                      </span>
                    </div>

                    <div className={styles.contactsList}>
                      {contatosSelecionados.length === 0 ? (
                        <div className={styles.emptyMiniState}>
                          Nenhum contato selecionado.
                        </div>
                      ) : (
                        contatosSelecionados.map((contato) => (
                          <div key={contato.id} className={styles.contactCardSelected}>
                            <div className={styles.contactMain}>
                              <strong className={styles.contactName}>
                                {contato.nome || "Sem nome"}
                              </strong>

                              <p className={styles.contactMeta}>
                                {formatarTelefone(contato.telefone)}
                              </p>

                              {contato.email ? (
                                <p className={styles.contactMeta}>{contato.email}</p>
                              ) : null}


                              <div className={styles.contactBadges}>
                                {contato.origem ? (
                                  <span className={styles.contactBadge}>
                                    {contato.origem}
                                  </span>
                                ) : null}

                                {contato.status_lead ? (
                                  <span className={styles.contactBadge}>
                                    {contato.status_lead}
                                  </span>
                                ) : null}

                                {contato.campanha ? (
                                  <span className={styles.contactBadge}>
                                    {contato.campanha}
                                  </span>
                                ) : null}
                              </div>
                            </div>

                            <button
                              type="button"
                              className={styles.removeButton}
                              onClick={() => removerContato(contato.id)}
                            >
                              Remover
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {mensagem ? (
                  <FeedbackToast
                    success={mensagem}
                    onSuccessDismiss={() => setMensagem("")}
                  />
                ) : null}
                {erro ? <div className={styles.errorAlert}>{erro}</div> : null}

                <div className={styles.submitBar}>
                  {/* ESQUERDA */}
                  <div className={styles.submitLeft}>
                    <span>Contatos: {contatosSelecionados.length}</span>
                    <span>Template: {templateSelecionado?.nome}</span>
                    <span>Variáveis: {totalVariaveis}</span>
                  </div>

                  {/* CENTRO */}
                  <div className={styles.submitCenter}>
                    <span>
                      <strong>Categoria:</strong> {formatarCategoriaMeta(previewCusto?.categoria)}
                    </span>

                    <span>
                      <strong>Qtd.:</strong> {previewCusto?.totalSelecionados}
                    </span>

                    <span>
                      <strong>Isentos:</strong> {previewCusto?.totalIsentos}
                    </span>

                    <span>
                      <strong>Cobrados:</strong> {previewCusto?.totalCobrados}
                    </span>

                    <span>
                      <strong>USD:</strong> {previewCusto?.valorTotalUsd?.toFixed(4)}
                    </span>

                    <span className={styles.totalBrlRange}>
                      <strong>Total:</strong>{" "}
                      R$ {previewCusto?.valorTotalBrlMin?.toFixed(2)} ~ R${" "}
                      {previewCusto?.valorTotalBrlMax?.toFixed(2)}
                    </span>
                  </div>

                  {/* DIREITA */}
                  <div className={styles.submitRight}>
                    <button
                      type="button"
                      className={styles.primaryButton}
                      onClick={() => setModalConfirmacaoAberto(true)}
                      disabled={!templateSelecionado || contatosSelecionados.length === 0 || disparando}
                    >
                      Enviar mensagens
                    </button>
                  </div>
                </div>
              </form>
            )}
          </section>

          <section className={styles.resultsCard}>
            <div className={styles.cardHeader}>
              <div>
                <p className={styles.eyebrow}>Histórico</p>
                <h2 className={styles.cardTitle}>Resultados dos disparos</h2>
                <p className={styles.cardSubtitle}>
                  Os disparos salvos ficam sempre visíveis aqui.
                </p>
              </div> 
            </div>

          <div className={styles.resultsSummary}>
            <button
              type="button"
              className={
                filtroHistorico === "todos"
                  ? `${styles.summaryCard} ${styles.summaryCardActive}`
                  : styles.summaryCard
              }
              onClick={() => setFiltroHistorico("todos")}
            >
              <span className={styles.summaryLabel}>Total</span>
              <strong className={styles.summaryValue}>{resultado.length}</strong>
            </button>

            <button
              type="button"
              className={
                filtroHistorico === "sucesso"
                  ? `${styles.summaryCard} ${styles.summaryCardActive}`
                  : styles.summaryCard
              }
              onClick={() => setFiltroHistorico("sucesso")}
            >
              <span className={styles.summaryLabel}>Enviados</span>
              <strong className={styles.summaryValue}>{totalSucesso}</strong>
            </button>

            <button
              type="button"
              className={
                filtroHistorico === "processando"
                  ? `${styles.summaryCard} ${styles.summaryCardActive}`
                  : styles.summaryCard
              }
              onClick={() => setFiltroHistorico("processando")}
            >
              <span className={styles.summaryLabel}>Pendentes</span>
              <strong className={styles.summaryValue}>{totalProcessando}</strong>
            </button>

            <button
              type="button"
              className={
                filtroHistorico === "falha"
                  ? `${styles.summaryCard} ${styles.summaryCardActive}`
                  : styles.summaryCard
              }
              onClick={() => setFiltroHistorico("falha")}
            >
              <span className={styles.summaryLabel}>Falhas</span>
              <strong className={styles.summaryValue}>{totalFalha}</strong>
            </button>
          </div>

            {loadingHistorico ? (
              <div className={styles.emptyState}>Carregando histórico...</div>
            ) : resultadoFiltrado.length === 0 ? (
              <div className={styles.emptyState}>
                Nenhum disparo encontrado para este filtro.
              </div>
            ) : (
              <div className={styles.resultsList}>
                {resultadoHistoricoPaginado.map((item, index) => (
                  <div
                    key={item.id || `${item.numero}-${index}`}
                    className={`${styles.resultItem} ${
                      disparoEstaProcessando(item)
                        ? styles.resultProcessing
                        : disparoTeveSucesso(item)
                        ? styles.resultSuccess
                        : styles.resultError
                    }`}
                  >
                  <div className={styles.resultCompactHeader}>
                    <div className={styles.resultCompactMain}>
                      <strong className={styles.resultCompactName}>
                        {item.nome_contato || "Sem nome"} • {item.numero}
                      </strong>

                      <p className={styles.resultCompactMeta}>
                        Template: {item.template_nome}
                        {" • "}
                        {formatarDataHora(item.created_at)}

                        {item.origem_historico === "agendado" ? (
                          <>
                            {" • "}
                            <span className={styles.badgeAgendado}>
                              ⏰ Disparo agendado
                            </span>
                          </>
                        ) : null}

                        {item.origem_historico === "individual" ? (
                          <>
                            {" • "}
                            <span className={styles.badgeIndividual}>
                              👤 Disparo individual
                            </span>
                          </>
                        ) : null}
                      </p>
                    </div>

                    <span className={styles.resultStatus}>
                      {item.status_label ||
                        (disparoEstaProcessando(item)
                          ? "Aguardando confirmação"
                          : disparoTeveSucesso(item)
                          ? "Enviado"
                          : "Falha")}
                    </span>
                  </div>

                    {item.mensagem_template ? (
                      (() => {
                        const chaveMensagem = item.id || `${item.numero}-${index}`;
                        const expandida = mensagensExpandidas.includes(chaveMensagem);
                        const mensagemExibida = expandida
                          ? item.mensagem_template
                          : resumirMensagem(item.mensagem_template);

                        return (
                          <div className={styles.resultCompactMessageRow}>
                            <p
                              className={`${styles.resultCompactMessage} ${
                                !expandida ? styles.resultCompactMessageCollapsed : ""
                              }`}
                            >
                              {mensagemExibida}
                            </p>

                            <button
                              type="button"
                              className={styles.expandMessageButton}
                              onClick={() => alternarMensagemExpandida(chaveMensagem)}
                            >
                              {expandida ? "Ocultar" : "Ver mensagem"}
                            </button>
                          </div>
                        );
                      })()
                    ) : null}

                    {(() => {
                      const feedbackErro = obterFeedbackErroDisparo(item);

                      if (!feedbackErro) return null;

                      return (
                        <div className={styles.resultErrorFeedback}>
                          <strong className={styles.resultErrorTitle}>
                            {feedbackErro.titulo}
                          </strong>

                          <p className={styles.resultErrorDescription}>
                            {feedbackErro.descricao}
                          </p>

                          {feedbackErro.detalhe ? (
                            <p className={styles.resultErrorDetail}>
                              Detalhe técnico: {feedbackErro.detalhe}
                            </p>
                          ) : null}
                        </div>
                      );
                    })()}
                  </div>
                ))}
                
                {resultadoFiltrado.length > ITENS_HISTORICO_POR_PAGINA ? (
                  <div className={styles.paginationBar}>
                    <span className={styles.paginationInfo}>
                      Mostrando {primeiroItemHistorico} a {ultimoItemHistorico} de{" "}
                      {resultadoFiltrado.length} disparos
                    </span>

                    <div className={styles.paginationActions}>
                      <button
                        type="button"
                        className={styles.paginationButton}
                        onClick={() => setPaginaHistorico((prev) => Math.max(1, prev - 1))}
                        disabled={paginaHistorico <= 1}
                      >
                        Anterior
                      </button>

                      <span className={styles.paginationCurrent}>
                        Página {paginaHistorico} de {totalPaginasHistorico}
                      </span>

                      <button
                        type="button"
                        className={styles.paginationButton}
                        onClick={() =>
                          setPaginaHistorico((prev) =>
                            Math.min(totalPaginasHistorico, prev + 1)
                          )
                        }
                        disabled={paginaHistorico >= totalPaginasHistorico}
                      >
                        Próxima
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </section>
        </div>
      </div>

      {modalVariaveisAberto && (
        <div
          className={styles.modalOverlay}
          onClick={() => setModalVariaveisAberto(false)}
        >
          <div
            className={styles.modalConfirmacao}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div>
                <p className={styles.modalEyebrow}>Variáveis</p>
                <h3 className={styles.modalTitle}>Gerenciar variáveis</h3>
                <p className={styles.modalSubtitle}>
                  Cadastre variáveis personalizadas e consulte as variáveis fixas disponíveis para disparos e fluxos.
                </p>
              </div>

              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setModalVariaveisAberto(false)}
              >
                ×
              </button>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.modalSection}>
                <h4 className={styles.modalSectionTitle}>Variáveis fixas do sistema</h4>

                <div className={styles.variablesList}>
                  {VARIAVEIS_FIXAS_SISTEMA.map((item) => (
                    <div key={item.chave} className={styles.variableItem}>
                      <div className={styles.variableMain}>
                        <strong className={styles.variableCode}>{item.exemplo}</strong>
                        <p className={styles.variableDescription}>{item.descricao}</p>
                      </div>

                      <button
                        type="button"
                        className={styles.variableUseButton}
                        onClick={() => aplicarVariavelNoCampo(item.chave)}
                      >
                        Usar
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className={styles.modalSection}>
                <h4 className={styles.modalSectionTitle}>Cadastrar variável personalizada</h4>

                <div className={styles.variableFormGrid}>
                  <div className={styles.field}>
                    <label className={styles.label}>Nome da variável</label>
                    <input
                      value={novaVariavelChave}
                      onChange={(e) =>
                        setNovaVariavelChave(
                          normalizarEntradaVariavelTemplate(e.target.value)
                        )
                      }
                      className={styles.input}
                      placeholder="ex: desconto"
                    />
                  </div>

                  <div className={styles.field}>
                    <label className={styles.label}>Valor</label>
                    <input
                      value={novaVariavelValor}
                      onChange={(e) => setNovaVariavelValor(e.target.value)}
                      className={styles.input}
                      placeholder="ex: 20%"
                    />
                  </div>

                  <div className={styles.field}>
                    <label className={styles.label}>Uso</label>
                    <select
                      value={novaVariavelEscopo}
                      onChange={(e) =>
                        setNovaVariavelEscopo(
                          e.target.value as "global" | "disparos" | "fluxos"
                        )
                      }
                      className={styles.input}
                    >
                      <option value="global">Disparos e fluxos</option>
                      <option value="disparos">Somente disparos</option>
                      <option value="fluxos">Somente fluxos</option>
                    </select>
                  </div>
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>Descrição</label>
                  <input
                    value={novaVariavelDescricao}
                    onChange={(e) => setNovaVariavelDescricao(e.target.value)}
                    className={styles.input}
                    placeholder="ex: desconto usado em campanhas promocionais"
                  />
                </div>

                <div className={styles.variablePreviewBox}>
                  A variável será usada assim:{" "}
                  <strong>
                    {"{{"}
                    {normalizarEntradaVariavelTemplate(novaVariavelChave) || "nome_variavel"}
                    {"}}"}
                  </strong>
                </div>

                <div className={styles.variableFormActions}>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={salvarVariavelPersonalizada}
                    disabled={salvandoVariavel}
                  >
                    {salvandoVariavel ? "Salvando..." : "Salvar variável"}
                  </button>
                </div>
              </div>

              <div className={styles.modalSection}>
                <h4 className={styles.modalSectionTitle}>Variáveis cadastradas</h4>

                {loadingVariaveis ? (
                  <div className={styles.emptyMiniState}>Carregando variáveis...</div>
                ) : variaveisPersonalizadas.length === 0 ? (
                  <div className={styles.emptyMiniState}>
                    Nenhuma variável personalizada cadastrada.
                  </div>
                ) : (
                  <div className={styles.variablesList}>
                    {variaveisPersonalizadas.map((item) => (
                      <div key={item.id} className={styles.variableItem}>
                        <div className={styles.variableMain}>
                          <strong className={styles.variableCode}>
                            {"{{"}
                            {item.chave}
                            {"}}"}
                          </strong>

                          <p className={styles.variableDescription}>
                            Valor: <strong>{item.valor}</strong>
                          </p>

                          {item.descricao ? (
                            <p className={styles.variableDescription}>
                              {item.descricao}
                            </p>
                          ) : null}

                          <span className={styles.variableScope}>
                            {item.escopo === "global"
                              ? "Disparos e fluxos"
                              : item.escopo === "disparos"
                              ? "Somente disparos"
                              : "Somente fluxos"}
                          </span>
                        </div>

                        <div className={styles.variableActions}>
                          <button
                            type="button"
                            className={styles.variableUseButton}
                            onClick={() => aplicarVariavelNoCampo(item.chave)}
                          >
                            Usar
                          </button>

                          <button
                            type="button"
                            className={styles.variableDeleteButton}
                            onClick={() => removerVariavelPersonalizada(item.id)}
                          >
                            Remover
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setModalVariaveisAberto(false)}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {modalConfirmacaoAberto && (
        <div className={styles.modalOverlay} onClick={() => setModalConfirmacaoAberto(false)}>
          <div
            className={styles.modalConfirmacao}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div>
                <p className={styles.modalEyebrow}>Confirmação de cobrança</p>
                <h3 className={styles.modalTitle}>Confirmar disparo de mensagens</h3>
                <p className={styles.modalSubtitle}>
                  Revise as informações abaixo antes de continuar. Este envio pode gerar cobrança.
                </p>
              </div>

              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setModalConfirmacaoAberto(false)}
              >
                ×
              </button>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.modalSection}>
                <h4 className={styles.modalSectionTitle}>Resumo do disparo</h4>

                <div className={styles.modalGridResumo}>
                  <div className={styles.modalInfoItem}>
                    <span className={styles.modalInfoLabel}>Template</span>
                    <strong className={styles.modalInfoValue}>
                      {templateSelecionado?.nome || "-"}
                    </strong>
                  </div>

                  <div className={styles.modalInfoItem}>
                    <span className={styles.modalInfoLabel}>Categoria</span>
                    <strong className={styles.modalInfoValue}>
                      {formatarCategoriaMeta(previewCusto?.categoria || templateSelecionado?.categoria)}
                    </strong>
                  </div>

                  <div className={styles.modalInfoItem}>
                    <span className={styles.modalInfoLabel}>Selecionados</span>
                    <strong className={styles.modalInfoValue}>
                      {previewCusto?.totalSelecionados ?? contatosSelecionados.length}
                    </strong>
                  </div>

                  <div className={styles.modalInfoItem}>
                    <span className={styles.modalInfoLabel}>Isentos</span>
                    <strong className={styles.modalInfoValue}>
                      {previewCusto?.totalIsentos ?? 0}
                    </strong>
                  </div>

                  <div className={styles.modalInfoItem}>
                    <span className={styles.modalInfoLabel}>Cobrados</span>
                    <strong className={styles.modalInfoValue}>
                      {previewCusto?.totalCobrados ?? 0}
                    </strong>
                  </div>

                  <div className={styles.modalInfoItem}>
                    <span className={styles.modalInfoLabel}>Total USD</span>
                    <strong className={styles.modalInfoValue}>
                      US$ {(previewCusto?.valorTotalUsd ?? 0).toFixed(4)}
                    </strong>
                  </div>
                </div>
              </div>

              <div className={styles.modalDestaqueFinanceiro}>
                <span className={styles.modalFinanceiroLabel}>Total estimado</span>
                <strong className={styles.modalFinanceiroValor}>
                  R$ {(previewCusto?.valorTotalBrlMin ?? 0).toFixed(2)} ~ R$ {(previewCusto?.valorTotalBrlMax ?? 0).toFixed(2)}
                </strong>
                <p className={styles.modalFinanceiroObs}>
                  Valor de referência calculado a partir do total em USD e da cotação atual.
                </p>
              </div>

              <div className={styles.modalAlert}>
                <strong>Atenção:</strong> a cobrança pode ser processada pela Meta usando o método de pagamento vinculado à conta comercial. O valor final faturado pode variar em relação à estimativa exibida nesta tela.
              </div>

              <div className={styles.modalSection}>
                <h4 className={styles.modalSectionTitle}>Informações importantes</h4>

                <ul className={styles.modalList}>
                  <li>O valor em real exibido aqui é uma estimativa e serve apenas como referência.</li>
                  <li>O valor final pode variar conforme cotação do USD, IOF, impostos, tarifas bancárias e regras de cobrança aplicáveis.</li>
                  <li>Conversas isentas não entram no total cobrado.</li>
                  <li>Templates de marketing podem gerar cobrança mesmo quando existe uma conversa ativa.</li>
                  <li>Após a confirmação, o disparo será iniciado imediatamente.</li>
                </ul>
              </div>

              <label className={styles.modalCheckbox}>
                <input
                  type="checkbox"
                  checked={confirmacaoCobranca}
                  onChange={(e) => setConfirmacaoCobranca(e.target.checked)}
                />
                <span>
                  Li as informações acima e estou ciente de que este disparo pode gerar cobrança.
                </span>
              </label>
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setModalConfirmacaoAberto(false)}
              >
                Cancelar
              </button>

              <button
                type="button"
                className={styles.primaryButton}
                onClick={confirmarEDisparar}
                disabled={!confirmacaoCobranca || disparando}
              >
                Confirmar e enviar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
