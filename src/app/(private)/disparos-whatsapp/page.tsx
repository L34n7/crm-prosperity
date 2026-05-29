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

  const textos = template.payload.components
    .map((item) => item.text || "")
    .join(" ");

  const matches = textos.match(/\{\{\d+\}\}/g) || [];
  const numeros = matches
    .map((item) => Number(item.replace(/[{}]/g, "")))
    .filter((n) => !Number.isNaN(n));

  if (numeros.length === 0) return 0;
  return Math.max(...numeros);
}

function formatarStatusIntegracao(status?: string | null) {
  if (!status) return "No status";

  switch (status.toLowerCase()) {
    case "ativo":
      return "Active";
    case "conectado":
      return "Connected";
    case "inativo":
      return "Inactive";
    default:
      return status;
  }
}

function getTemplateStatusLabel(status: string | null | undefined) {
  if (!status) return "No status";

  switch (status.toUpperCase()) {
    case "PENDING":
      return "Under review";
    case "APPROVED":
      return "Approved";
    case "REJECTED":
      return "Rejected";
    case "PAUSED":
      return "Paused";
    case "DISABLED":
      return "Disabled";
    case "ARCHIVED":
      return "Archived";
    case "ERRO_ENVIO":
      return "Delivery error";
    default:
      return status;
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
  if (item.ok) return null;

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

  if (!limpo) return "No phone number";
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

  const contatosDisponiveis = useMemo(() => {
    const idsSelecionados = new Set(contatosSelecionados.map((item) => item.id));
    return contatos.filter((item) => !idsSelecionados.has(item.id));
  }, [contatos, contatosSelecionados]);

  const contatosDisponiveisValidos = useMemo(() => {
    return contatosDisponiveis.filter(contatoTemTelefoneValido);
  }, [contatosDisponiveis]);

  const totalSucesso = useMemo(() => {
    return resultado.filter((item) => item.ok).length;
  }, [resultado]);

  const totalFalha = useMemo(() => {
    return resultado.filter((item) => !item.ok).length;
  }, [resultado]);

  const totalProcessando = useMemo(() => {
    return resultado.filter((item) => item.status_disparo === "processando").length;
  }, [resultado]);

  const resultadoFiltrado = useMemo(() => {
    if (filtroHistorico === "todos") return resultado;

    return resultado.filter((item) => {
      if (filtroHistorico === "falha") {
        return item.status_disparo === "falha";
      }

      if (filtroHistorico === "processando") {
        return item.status_disparo === "processando";
      }

      if (filtroHistorico === "sucesso") {
        return item.status_disparo === "sucesso";
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

    try {
      setDisparando(true);

      const destinatarios = contatosSelecionados.map((contato) => ({
        numero: limparNumero(contato.telefone),
        variaveis:
          totalVariaveis > 0
            ? [
                contato.nome || "Cliente",
                contato.campanha || contato.status_lead || contato.telefone || "",
              ].slice(0, totalVariaveis)
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
        title="WhatsApp Broadcasts"
        subtitle="Select the WhatsApp connection, approved template, and saved contacts to send messages."
      />

      <div className={styles.pageContent}>
        <div className={styles.layout}>
          <section className={styles.formCard}>
            <div className={styles.cardHeader}>
              <div>
                <p className={styles.eyebrow}>Operation</p>
                <h2 className={styles.cardTitle}>New broadcast</h2>
                <p className={styles.cardSubtitle}>
                  Choose the connection, select the template, and define the contacts.
                </p>
              </div>
            </div>

              {loadingUsuario || loadingIntegracoes ? (
                <div className={styles.emptyState}>Loading data...</div>
              ) : !podeDisparar ? (
                <div className={styles.inlineBlock}>
                  <div className={styles.errorAlert}>
                    You do not have permission to access this feature.
                  </div>
                </div> 
              ) : (
              <form onSubmit={handleSubmit} className={styles.form}>
                <div className={styles.setupPreviewGrid}>
                  <div className={styles.field}>
                    <div className={styles.setupColumn}>
                      <div className={styles.field}>
                        <label className={styles.label}>WhatsApp Integration</label>
                        <select
                          value={integracaoId} 
                          onChange={(e) => setIntegracaoId(e.target.value)}
                          className={styles.input}
                        >
                          <option value="">Select a connection</option>
                          {integracoes.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.nome_conexao} {item.numero ? `- ${item.numero}` : ""}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className={styles.field}>
                        <label className={styles.label}>Approved template</label>
                        <select
                          value={templateId}
                          onChange={(e) => setTemplateId(e.target.value)}
                          className={styles.input}
                          disabled={!integracaoId || loadingTemplates}
                        >
                          <option value="">
                            {!integracaoId
                              ? "Select a connection first"
                              : loadingTemplates
                              ? "Loading templates..."
                              : "Select a template"}
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
                          <strong>Category:</strong> {templateSelecionado.categoria || "-"}
                        </div>

                        <div className={styles.templateInfoDivider} />

                        <div>
                          <strong>Language:</strong> {templateSelecionado.idioma || "-"}
                        </div>
                      </div>
                    ) : null}
                    
                      <div className={styles.templateHint}>
                        This template uses <strong>{totalVariaveis}</strong> variable(s).
                        In the current send, when variables exist, the system fills:
                        <strong> {" {{1}}"}</strong> with the contact name and
                        <strong> {" {{2}}"}</strong> with campaign, lead status, or phone number.
                      </div>
                  </div>

                  <aside className={styles.previewSideCard}>
                    <div className={styles.previewTopLine}>
                      <strong>Preview</strong>
                    </div>

                    {templateSelecionado ? (
                      <>
                        <div className={styles.whatsappPreviewArea}>
                          <div className={styles.whatsappBubble}>
                            <strong className={styles.whatsappPreviewTitle}>
                              {extrairHeader(templateSelecionado.payload) || templateSelecionado.nome}
                            </strong>

                            <p className={styles.whatsappPreviewText}>
                              {extrairBody(templateSelecionado.payload)}
                            </p>

                            <div className={styles.whatsappPreviewMeta}>
                              <span className={styles.whatsappPreviewFooter}>
                                {extrairFooter(templateSelecionado.payload) || "Equipe de atendimento"}
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
                        Select an approved template to preview the WhatsApp message.
                      </div>
                    )}
                  </aside>
                </div>

                <div className={styles.searchRow}>
                  <div className={styles.searchFilters}>
                    <div className={styles.field}>
                      <label className={styles.label}>Search saved contacts</label>
                      <input
                        value={buscaContato}
                        onChange={(e) => setBuscaContato(e.target.value)}
                        className={styles.input}
                        placeholder="Search by name, phone, email, campaign..."
                      />
                    </div>

                    <div className={styles.field}>
                      <label className={styles.label}>Filter by source</label>
                      <select
                        value={origemFiltro}
                        onChange={(e) => setOrigemFiltro(e.target.value)}
                        className={styles.input}
                      >
                      {origensDisponiveis.length > 0 ? (
                        <>
                          <option value="">All sources</option>

                          {origensDisponiveis.map((origem) => (
                            <option key={origem} value={origem}>
                              {origem}
                            </option>
                          ))}
                        </>
                      ) : (
                        <option value="">No sources found</option>
                      )}
                      </select>
                    </div>

                    <div className={styles.field}>
                      <label className={styles.label}>Filter by campaign</label>
                      <select
                        value={campanhaFiltro}
                        onChange={(e) => setCampanhaFiltro(e.target.value)}
                        className={styles.input}
                      >
                        {campanhasDisponiveis.length > 0 ? (
                          <>
                            <option value="">All campaigns</option>

                            {campanhasDisponiveis.map((campanha) => (
                              <option key={campanha} value={campanha}>
                                {campanha}
                              </option>
                            ))}
                          </>
                        ) : (
                          <option value="">No campaigns found</option>
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
                      Add all filtered
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
                      Clear filters
                    </button>
                  </div>
                </div>

                <div className={styles.contactsSection}>
                  <div className={styles.contactsColumn}>
                    <div className={styles.contactsHeader}>
                      <h3 className={styles.contactsTitle}>Saved Contacts</h3>
                      <span className={styles.contactsCount}>
                        {loadingContatos ? "..." : totalContatosDisponiveis}
                      </span>
                    </div>

                    <div className={styles.contactsList}>
                      {loadingContatos ? (
                        <div className={styles.emptyMiniState}>Loading contacts...</div>
                      ) : contatosDisponiveis.length === 0 ? (
                        <div className={styles.emptyMiniState}>
                          No saved contacts available.
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
                                      No valid phone number
                                    </span>
                                  ) : null}
                                </div>
                              </div>

                              <button
                                type="button"
                                className={styles.secondaryButton}
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
                      <h3 className={styles.contactsTitle}>Selected for Dismissal</h3>
                      <span className={styles.contactsCount}>
                        {contatosSelecionados.length}
                      </span>
                    </div>

                    <div className={styles.contactsList}>
                      {contatosSelecionados.length === 0 ? (
                        <div className={styles.emptyMiniState}>
                          No contacts selected.
                        </div>
                      ) : (
                        contatosSelecionados.map((contato) => (
                          <div key={contato.id} className={styles.contactCardSelected}>
                            <div className={styles.contactMain}>
                              <strong className={styles.contactName}>
                                {contato.nome || "Unnamed"}
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
                              Remove
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
                    <span>Contacts: {contatosSelecionados.length}</span>
                    <span>Template: {templateSelecionado?.nome}</span>
                    <span>Variables: {totalVariaveis}</span>
                  </div>

                  {/* CENTRO */}
                  <div className={styles.submitCenter}>
                    <span>
                      <strong>Category:</strong> {previewCusto?.categoria?.toUpperCase()}
                    </span>

                    <span>
                      <strong>Qty:</strong> {previewCusto?.totalSelecionados}
                    </span>

                    <span>
                      <strong>Exempt:</strong> {previewCusto?.totalIsentos}
                    </span>

                    <span>
                      <strong>Charged:</strong> {previewCusto?.totalCobrados}
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
                      Send messages
                    </button>
                  </div>
                </div>
              </form>
            )}
          </section>

          <section className={styles.resultsCard}>
            <div className={styles.cardHeader}>
              <div>
                <p className={styles.eyebrow}>History</p>
                <h2 className={styles.cardTitle}>Discharge Results</h2>
                <p className={styles.cardSubtitle}>
                  Saved discharges are always visible here.
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
              <span className={styles.summaryLabel}>Delivered</span>
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
              <span className={styles.summaryLabel}>Pending</span>
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
              <span className={styles.summaryLabel}>Failed</span>
              <strong className={styles.summaryValue}>{totalFalha}</strong>
            </button>
          </div>

            {loadingHistorico ? (
              <div className={styles.emptyState}>Loading history...</div>
            ) : resultadoFiltrado.length === 0 ? (
              <div className={styles.emptyState}>
                No discharges found for this filter.
              </div>
            ) : (
              <div className={styles.resultsList}>
                {resultadoHistoricoPaginado.map((item, index) => (
                  <div
                    key={item.id || `${item.numero}-${index}`}
                    className={`${styles.resultItem} ${
                      item.ok ? styles.resultSuccess : styles.resultError
                    }`}
                  >
                  <div className={styles.resultCompactHeader}>
                    <div className={styles.resultCompactMain}>
                      <strong className={styles.resultCompactName}>
                        {item.nome_contato || "Unnamed"} • {item.numero}
                      </strong>

                      <p className={styles.resultCompactMeta}>
                        Template: {item.template_nome}
                        {" • "}
                        {formatarDataHora(item.created_at)}

                        {item.origem_historico === "agendado" ? (
                          <>
                            {" • "}
                            <span className={styles.badgeAgendado}>
                              ⏰ Scheduled Discharge
                            </span>
                          </>
                        ) : null}
                      </p>
                    </div>

                    <span className={styles.resultStatus}>
                      {item.status_label || (item.ok ? "Sent" : "Failed")}
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
                              {expandida ? "Hide" : "View message"}
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
                              Technical detail: {feedbackErro.detalhe}
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
                      Showing  {primeiroItemHistorico} a {ultimoItemHistorico} de{" "}
                      {resultadoFiltrado.length} broadcasts
                    </span>

                    <div className={styles.paginationActions}>
                      <button
                        type="button"
                        className={styles.paginationButton}
                        onClick={() => setPaginaHistorico((prev) => Math.max(1, prev - 1))}
                        disabled={paginaHistorico <= 1}
                      >
                        Previous
                      </button>

                      <span className={styles.paginationCurrent}>
                        Page {paginaHistorico} of {totalPaginasHistorico}
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
                        Next
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </section>
        </div>
      </div>
      {modalConfirmacaoAberto && (
        <div className={styles.modalOverlay} onClick={() => setModalConfirmacaoAberto(false)}>
          <div
            className={styles.modalConfirmacao}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div>
                <p className={styles.modalEyebrow}>Charging Confirmation</p>
                <h3 className={styles.modalTitle}>Confirm Message Discharge</h3>
                <p className={styles.modalSubtitle}>
                  Review the information below before continuing. This send may generate a charge.
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
                <h4 className={styles.modalSectionTitle}>Broadcast Summary</h4>

                <div className={styles.modalGridResumo}>
                  <div className={styles.modalInfoItem}>
                    <span className={styles.modalInfoLabel}>Template</span>
                    <strong className={styles.modalInfoValue}>
                      {templateSelecionado?.nome || "-"}
                    </strong>
                  </div>

                  <div className={styles.modalInfoItem}>
                    <span className={styles.modalInfoLabel}>Category</span>
                    <strong className={styles.modalInfoValue}>
                      {String(previewCusto?.categoria || templateSelecionado?.categoria || "-").toUpperCase()}
                    </strong>
                  </div>

                  <div className={styles.modalInfoItem}>
                    <span className={styles.modalInfoLabel}>Selected</span>
                    <strong className={styles.modalInfoValue}>
                      {previewCusto?.totalSelecionados ?? contatosSelecionados.length}
                    </strong>
                  </div>

                  <div className={styles.modalInfoItem}>
                    <span className={styles.modalInfoLabel}>Exempt</span>
                    <strong className={styles.modalInfoValue}>
                      {previewCusto?.totalIsentos ?? 0}
                    </strong>
                  </div>

                  <div className={styles.modalInfoItem}>
                    <span className={styles.modalInfoLabel}>Charged</span>
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
                <span className={styles.modalFinanceiroLabel}>Estimated Total</span>
                <strong className={styles.modalFinanceiroValor}>
                  R$ {(previewCusto?.valorTotalBrlMin ?? 0).toFixed(2)} ~ R$ {(previewCusto?.valorTotalBrlMax ?? 0).toFixed(2)}
                </strong>
                <p className={styles.modalFinanceiroObs}>
                  Reference value calculated from the total in USD and the current exchange rate.
                </p>
              </div>

              <div className={styles.modalAlert}>
                <strong>Attention:</strong> the charge may be processed by Meta using the payment method linked to the commercial account. The final invoiced value may vary in relation to the estimate shown on this screen.
              </div>

              <div className={styles.modalSection}>
                <h4 className={styles.modalSectionTitle}>Important Information</h4>

                <ul className={styles.modalList}>
                  <li>The value in Brazilian Real displayed here is an estimate and serves only as a reference.</li>
                  <li>The final value may vary according to the USD exchange rate, IOF, taxes, banking fees and applicable billing rules.</li>
                  <li>Exempt conversations do not enter the charged total.</li>
                  <li>Marketing templates may generate charges even when there is an active conversation.</li>
                  <li>After confirmation, the broadcast will be initiated immediately.</li>
                </ul>
              </div>

              <label className={styles.modalCheckbox}>
                <input
                  type="checkbox"
                  checked={confirmacaoCobranca}
                  onChange={(e) => setConfirmacaoCobranca(e.target.checked)}
                />
                <span>
                  I have read the information above and I am aware that this broadcast may generate a charge.
                </span>
              </label>
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setModalConfirmacaoAberto(false)}
              >
                Cancel
              </button>

              <button
                type="button"
                className={styles.primaryButton}
                onClick={confirmarEDisparar}
                disabled={!confirmacaoCobranca || disparando}
              >
                Confirm and Send
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
