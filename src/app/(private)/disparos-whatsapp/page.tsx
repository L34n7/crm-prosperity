"use client";

import { useEffect, useMemo, useState } from "react";
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
  if (!status) return "Sem status";

  switch (status.toLowerCase()) {
    case "ativo":
      return "Ativo";
    case "conectado":
      return "Conectado";
    case "inativo":
      return "Inativo";
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

  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState<ResultadoDisparo[]>([]);
  const [mensagensExpandidas, setMensagensExpandidas] = useState<string[]>([]);

  const [modalConfirmacaoAberto, setModalConfirmacaoAberto] = useState(false);
  const [confirmacaoCobranca, setConfirmacaoCobranca] = useState(false);

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

      const res = await fetch("/api/integracoes-whatsapp", {
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

  async function carregarContatos(busca = "", origem = "") {
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
    carregarContatos("", "");
    carregarHistorico();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      carregarContatos(buscaContato, origemFiltro);
    }, 300);

    return () => clearTimeout(timer);
  }, [buscaContato, origemFiltro]);

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

      setMensagem(`Disparo concluído. Sucesso: ${sucesso}. Falhas: ${falha}.`);

      await carregarHistorico();
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

      setPreviewCusto({
        categoria: String(json.categoria || ""),
        totalSelecionados: Number(json.totalSelecionados || 0),
        totalIsentos: Number(json.totalIsentos || 0),
        totalCobrados: Number(json.totalCobrados || 0),
        valorUnitarioUsd: Number(json.valorUnitarioUsd || 0),
        valorTotalUsd: Number(json.valorTotalUsd || 0),
        cotacaoUsdBrl: Number(json.cotacaoUsdBrl || 0),
        valorTotalBrlEstimado: Number(json.valorTotalBrlEstimado || 0),
        valorTotalBrlMin: Number(json.valorTotalBrlMin || 0),
        valorTotalBrlMax: Number(json.valorTotalBrlMax || 0),
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

  return (
    <>
      <Header
        title="Disparos WhatsApp"
        subtitle="Selecione a integração, o template aprovado e os contatos salvos para disparar mensagens."
      />

      <div className={styles.pageContent}>
        <div className={styles.layout}>
          <section className={styles.formCard}>
            <div className={styles.cardHeader}>
              <div>
                <p className={styles.eyebrow}>Operação</p>
                <h2 className={styles.cardTitle}>Novo disparo</h2>
                <p className={styles.cardSubtitle}>
                  Escolha a integração, selecione o template e defina os contatos.
                </p>
              </div>
            </div>

            {loadingUsuario || loadingIntegracoes ? (
              <div className={styles.emptyState}>Carregando dados...</div>
            ) : !podeDisparar ? (
              <div className={styles.inlineBlock}>
                <div className={styles.errorAlert}>
                  Você não tem permissão para acessar esta funcionalidade.
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className={styles.form}>
                <div className={styles.topGrid}>
                  <div className={styles.field}>
                    <label className={styles.label}>Integração WhatsApp</label>
                    <select
                      value={integracaoId}
                      onChange={(e) => setIntegracaoId(e.target.value)}
                      className={styles.input}
                    >
                      <option value="">Selecione uma integração</option>
                      {integracoes.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.nome_conexao} {item.numero ? `- ${item.numero}` : ""}
                        </option>
                      ))}
                    </select>

                    {integracaoSelecionada ? (
                      <div className={styles.infoBox}>
                        <div>
                          <strong>Status:</strong>{" "}
                          {formatarStatusIntegracao(integracaoSelecionada.status)}
                        </div>
                        <div>
                          <strong>WABA ID:</strong> {integracaoSelecionada.waba_id || "-"}
                        </div>
                      </div>
                    ) : null}
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
                          ? "Selecione a integração primeiro"
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
                  <div className={styles.previewCard}>
                    <div className={styles.previewHeader}>
                      <div>
                        <h3 className={styles.previewTitle}>
                          {templateSelecionado.nome}
                        </h3>
                        <p className={styles.previewSubtitle}>
                          Categoria: {templateSelecionado.categoria} • Idioma:{" "}
                          {templateSelecionado.idioma}
                        </p>
                      </div>

                      <span
                        className={`${styles.badge} ${getTemplateStatusClass(
                          templateSelecionado.status
                        )}`}
                      >
                        {getTemplateStatusLabel(templateSelecionado.status)}
                      </span>
                    </div>

                    <div className={styles.previewGrid}>
                      {extrairHeader(templateSelecionado.payload) ? (
                        <div className={styles.previewBlock}>
                          <span className={styles.previewLabel}>Header</span>
                          <p className={styles.previewText}>
                            {extrairHeader(templateSelecionado.payload)}
                          </p>
                        </div>
                      ) : null}

                      <div className={styles.previewBlock}>
                        <span className={styles.previewLabel}>Body</span>
                        <p className={styles.previewText}>
                          {extrairBody(templateSelecionado.payload)}
                        </p>
                      </div>

                      {extrairFooter(templateSelecionado.payload) ? (
                        <div className={styles.previewBlock}>
                          <span className={styles.previewLabel}>Footer</span>
                          <p className={styles.previewText}>
                            {extrairFooter(templateSelecionado.payload)}
                          </p>
                        </div>
                      ) : null}

                      {extrairQuickReplies(templateSelecionado.payload).length > 0 ? (
                        <div className={styles.previewBlock}>
                          <span className={styles.previewLabel}>Quick replies</span>
                          <div className={styles.quickRepliesList}>
                            {extrairQuickReplies(templateSelecionado.payload).map(
                              (texto, index) => (
                                <span
                                  key={`${texto}-${index}`}
                                  className={styles.contactBadge}
                                >
                                  {texto}
                                </span>
                              )
                            )}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div className={styles.templateHint}>
                      Este template usa <strong>{totalVariaveis}</strong> variável(is).
                      No envio atual, quando houver variáveis, o sistema preenche:
                      <strong> {" {{1}}"}</strong> com o nome do contato e
                      <strong> {" {{2}}"}</strong> com campanha, status lead ou
                      telefone.
                    </div>
                  </div>
                ) : null}

                <div className={styles.searchRow}>
                  <div className={styles.searchFilters}>
                    <div className={styles.field}>
                      <label className={styles.label}>Buscar contatos salvos</label>
                      <input
                        value={buscaContato}
                        onChange={(e) => setBuscaContato(e.target.value)}
                        className={styles.input}
                        placeholder="Busque por nome, telefone, email, campanha..."
                      />
                    </div>

                    <div className={styles.field}>
                      <label className={styles.label}>Filtrar por origem</label>
                      <select
                        value={origemFiltro}
                        onChange={(e) => setOrigemFiltro(e.target.value)}
                        className={styles.input}
                      >
                        <option value="">Todas as origens</option>
                        {origensDisponiveis.map((origem) => (
                          <option key={origem} value={origem}>
                            {origem}
                          </option>
                        ))}
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
                      Adicionar todos filtrados
                    </button>

                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => {
                        setBuscaContato("");
                        setOrigemFiltro("");
                        limparSelecao();
                      }}
                      disabled={contatosSelecionados.length === 0 && !buscaContato && !origemFiltro}
                    >
                      Limpar filtros
                    </button>
                  </div>
                </div>

                <div className={styles.contactsSection}>
                  <div className={styles.contactsColumn}>
                    <div className={styles.contactsHeader}>
                      <h3 className={styles.contactsTitle}>Contatos disponíveis</h3>
                      <span className={styles.contactsCount}>
                        {loadingContatos ? "..." : totalContatosDisponiveis}
                      </span>
                    </div>

                    <div className={styles.contactsList}>
                      {loadingContatos ? (
                        <div className={styles.emptyMiniState}>Carregando contatos...</div>
                      ) : contatosDisponiveis.length === 0 ? (
                        <div className={styles.emptyMiniState}>
                          Nenhum contato disponível.
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
                                className={styles.secondaryButton}
                                onClick={() => adicionarContato(contato)}
                                disabled={!telefoneValido}
                              >
                                Adicionar
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

                {mensagem ? <div className={styles.successAlert}>{mensagem}</div> : null}
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
                      <strong>Categoria:</strong> {previewCusto?.categoria?.toUpperCase()}
                    </span>

                    <span>
                      <strong>Qtd:</strong> {previewCusto?.totalSelecionados}
                    </span>

                    <span>
                      <strong>Isento:</strong> {previewCusto?.totalIsentos}
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
                      Disparar mensagens
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
                <h2 className={styles.cardTitle}>Resultado dos disparos</h2>
                <p className={styles.cardSubtitle}>
                  Os disparos salvos ficam sempre visíveis aqui.
                </p>
              </div>
            </div>

            <div className={styles.resultsSummary}>
              <div className={styles.summaryCard}>
                <span className={styles.summaryLabel}>Total</span>
                <strong className={styles.summaryValue}>{resultado.length}</strong>
              </div>

              <div className={styles.summaryCard}>
                <span className={styles.summaryLabel}>Sucesso</span>
                <strong className={styles.summaryValue}>{totalSucesso}</strong>
              </div>

              <div className={styles.summaryCard}>
                <span className={styles.summaryLabel}>Falhas</span>
                <strong className={styles.summaryValue}>{totalFalha}</strong>
              </div>
            </div>

            {loadingHistorico ? (
              <div className={styles.emptyState}>Carregando histórico...</div>
            ) : resultado.length === 0 ? (
              <div className={styles.emptyState}>
                Nenhum disparo realizado ainda nesta tela.
              </div>
            ) : (
              <div className={styles.resultsList}>
                {resultado.map((item, index) => (
                  <div
                    key={item.id || `${item.numero}-${index}`}
                    className={`${styles.resultItem} ${
                      item.ok ? styles.resultSuccess : styles.resultError
                    }`}
                  >
                  <div className={styles.resultCompactHeader}>
                    <div className={styles.resultCompactMain}>
                      <strong className={styles.resultCompactName}>
                        {item.nome_contato || "Sem nome"} • {item.numero}
                      </strong>

                      <p className={styles.resultCompactMeta}>
                        Template: {item.template_nome || "-"}
                        {item.created_at ? ` • ${formatarDataHora(item.created_at)}` : ""}
                      </p>
                    </div>

                    <span className={styles.resultStatus}>
                      {item.status_label || (item.ok ? "Enviado" : "Falhou")}
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

                    {item.erro ? (
                      <p className={styles.resultCompactError}>
                        Erro: {item.erro}
                      </p>
                    ) : null}
                  </div>
                ))}
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
                      {String(previewCusto?.categoria || templateSelecionado?.categoria || "-").toUpperCase()}
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
                  Valor de referência calculado a partir do total em dólar e da cotação atual.
                </p>
              </div>

              <div className={styles.modalAlert}>
                <strong>Atenção:</strong> a cobrança pode ser processada pela Meta usando a forma de pagamento vinculada à conta comercial. O valor final faturado pode variar em relação à estimativa mostrada nesta tela.
              </div>

              <div className={styles.modalSection}>
                <h4 className={styles.modalSectionTitle}>Informações importantes</h4>

                <ul className={styles.modalList}>
                  <li>O valor em real exibido aqui é uma estimativa e serve apenas como referência.</li>
                  <li>O valor final pode variar conforme cotação do dólar, IOF, impostos, taxas bancárias e regras de faturamento aplicáveis.</li>
                  <li>Conversas isentas não entram no total cobrado.</li>
                  <li>Templates de marketing podem gerar cobrança mesmo quando existir conversa ativa.</li>
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
                Confirmar e disparar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}