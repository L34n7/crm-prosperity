"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import FeedbackToast from "@/components/FeedbackToast";
import Header from "@/components/Header";
import styles from "./disparos-agendados.module.css";

type StatusDisparo = "todos" | "pendente" | "executado" | "cancelado" | "erro";

type DisparoAgendado = {
  id: string;
  execucao_id: string | null;
  fluxo_id: string | null;
  no_id: string | null;
  tipo_agendamento: string;
  executar_em: string;
  status: "pendente" | "executado" | "cancelado" | "erro";
  payload_json: Record<string, any>;
  created_at: string;
  executed_at: string | null;
  automacao_fluxos?: {
    id: string;
    nome: string;
  } | null;
  automacao_nos?: {
    id: string;
    titulo: string;
    tipo_no: string;
  } | null;
  envio_status?: "falha" | "sucesso" | "processando" | null;
  envio_label?: string | null;
  envio_message_id?: string | null;
  envio_erro_codigo_meta?: number | string | null;
  envio_erro_tecnico?: string | null;
  envio_erro_amigavel?: string | null;
};

function formatarData(valor?: string | null) {
  if (!valor) return "-";

  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(valor));
  } catch {
    return "-";
  }
}

function statusLabel(status: string) {
  if (status === "pendente") return "Pendente";
  if (status === "executado") return "Executado";
  if (status === "cancelado") return "Cancelado";
  if (status === "erro") return "Erro";
  return status;
}

function statusClass(status: string) {
  if (status === "pendente") return `${styles.badge} ${styles.badgeBlue}`;
  if (status === "executado") return `${styles.badge} ${styles.badgeGreen}`;
  if (status === "cancelado") return `${styles.badge} ${styles.badgeCancel}`;
  if (status === "erro") return `${styles.badge} ${styles.badgeRed}`;
  return `${styles.badge} ${styles.badgeCancel}`;
}

function envioStatusClass(status?: string | null) {
  if (status === "falha") return `${styles.badge} ${styles.badgeRed}`;
  if (status === "sucesso") return `${styles.badge} ${styles.badgeGreen}`;
  if (status === "processando") return `${styles.badge} ${styles.badgeBlue}`;
  return `${styles.badge} ${styles.badgeYellow}`;
}

function renderizarTextoTemplate(payload: Record<string, any>) {
  const templatePayload = payload?.template_payload;

  if (!templatePayload?.components?.length) {
    if (payload?.conteudo_renderizado) {
      return String(payload.conteudo_renderizado);
    }

    if (payload?.template_nome) {
      return `Template: ${payload.template_nome}`;
    }

    return "Não foi possível gerar a prévia do template.";
  }

  const variaveis = Array.isArray(payload?.variaveis_resolvidas)
    ? payload.variaveis_resolvidas
    : Array.isArray(payload?.variaveis)
    ? payload.variaveis
    : [];

  function substituirVariaveis(texto: string) {
    return String(texto || "").replace(/\{\{(\d+)\}\}/g, (_, numero) => {
      const index = Number(numero) - 1;
      return variaveis[index] || `{{${numero}}}`;
    });
  }

  const partes: string[] = [];

  const header = templatePayload.components.find(
    (item: any) => item.type === "HEADER"
  );

  const body = templatePayload.components.find(
    (item: any) => item.type === "BODY"
  );

  const footer = templatePayload.components.find(
    (item: any) => item.type === "FOOTER"
  );

  if (header?.text) {
    partes.push(`📌 ${substituirVariaveis(header.text)}`);
  }

  if (body?.text) {
    partes.push(substituirVariaveis(body.text));
  }

  if (footer?.text) {
    partes.push(substituirVariaveis(footer.text));
  }

  return partes.join("\n\n").trim() || "Não foi possível gerar a prévia do template.";
}


function extrairPreviewTemplateCompleto(payload: any) {
  const components = Array.isArray(payload?.components)
    ? payload.components
    : [];

  const header = components.find(
    (item: any) => String(item.type || "").toUpperCase() === "HEADER"
  );

  const body = components.find(
    (item: any) => String(item.type || "").toUpperCase() === "BODY"
  );

  const footer = components.find(
    (item: any) => String(item.type || "").toUpperCase() === "FOOTER"
  );

  const buttons = components.find(
    (item: any) => String(item.type || "").toUpperCase() === "BUTTONS"
  );

  const partes: string[] = [];

  if (header?.text) {
    partes.push(header.text);
  }

  if (body?.text) {
    partes.push(body.text);
  }

  if (footer?.text) {
    partes.push(footer.text);
  }

  return partes.join("\n\n");
}

function limparNumero(valor: string | null | undefined) {
  return String(valor || "").replace(/\D/g, "");
}

function formatarTelefone(numero: string | null | undefined) {
  const limpo = limparNumero(numero);

  if (!limpo) return "Sem telefone";
  return limpo;
}

function contatoTemTelefoneValido(contato: any) {
  const telefone = limparNumero(contato.telefone);
  return telefone.length >= 10;
}

export default function DisparosAgendadosPage() {
  const [disparos, setDisparos] = useState<DisparoAgendado[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<StatusDisparo>("todos");

  const [disparoSelecionado, setDisparoSelecionado] =
    useState<DisparoAgendado | null>(null);

  const [disparoParaCancelar, setDisparoParaCancelar] =
    useState<DisparoAgendado | null>(null);

  const [cancelando, setCancelando] = useState(false);
  const [modalNovoDisparo, setModalNovoDisparo] = useState(false);
  const [integracoes, setIntegracoes] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);

  const [integracaoSelecionada, setIntegracaoSelecionada] = useState("");
  const [templateSelecionado, setTemplateSelecionado] = useState("");

  const [agendamentoData, setAgendamentoData] = useState("");
  const [agendamentoHora, setAgendamentoHora] = useState("");

  const [loadingModal, setLoadingModal] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [contatos, setContatos] = useState<any[]>([]);
  const [contatosSelecionados, setContatosSelecionados] = useState<any[]>([]);
  const [buscaContato, setBuscaContato] = useState("");
  const [salvandoDisparo, setSalvandoDisparo] = useState(false);

  const [loadingContatos, setLoadingContatos] = useState(false);
  const [totalContatosDisponiveis, setTotalContatosDisponiveis] = useState(0);
  const [origemFiltro, setOrigemFiltro] = useState("");
  const [origensDisponiveis, setOrigensDisponiveis] = useState<string[]>([]);
  const [campanhaFiltro, setCampanhaFiltro] = useState("");
  const [campanhasDisponiveis, setCampanhasDisponiveis] = useState<string[]>([]);

  const [erroModal, setErroModal] = useState("");
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

  async function carregarDisparos() {
    try {
      setCarregando(true);
      setErro("");
      setSucesso("");

      const params = new URLSearchParams();

      if (filtroStatus !== "todos") {
        params.set("status", filtroStatus);
      }

      if (busca.trim()) {
        params.set("busca", busca.trim());
      }

      const query = params.toString();
      const res = await fetch(`/api/disparos-agendados${query ? `?${query}` : ""}`, {
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao carregar disparos agendados.");
      }

      setDisparos(json.disparos || []);
    } catch (error: any) {
      setErro(error?.message || "Erro ao carregar disparos agendados.");
    } finally {
      setCarregando(false);
    }
  }

  async function cancelarDisparo() {
    if (!disparoParaCancelar) return;

    try {
      setCancelando(true);
      setErro("");
      setSucesso("");

      const res = await fetch(
        `/api/disparos-agendados/${disparoParaCancelar.id}/cancelar`,
        {
          method: "PATCH",
        }
      );

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao cancelar disparo.");
      }

      setSucesso("Disparo cancelado com sucesso.");
      setDisparoParaCancelar(null);
      setDisparoSelecionado(null);

      await carregarDisparos();
    } catch (error: any) {
      setErro(error?.message || "Erro ao cancelar disparo.");
    } finally {
      setCancelando(false);
    }
  }

  async function carregarDadosModalDisparo() {
    try {
      setLoadingModal(true);

      const [resIntegracoes] = await Promise.all([
        fetch("/api/integracoes-whatsapp/listar", { cache: "no-store" })
      ]);

      const jsonIntegracoes = await resIntegracoes.json();

      if (jsonIntegracoes.ok) {
        setIntegracoes(jsonIntegracoes.data || []);
      }

    } catch (error) {
      console.error(error);
    } finally {
      setLoadingModal(false);
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

  async function carregarTemplates(integracaoId: string) {
    try {
      if (!integracaoId) {
        setTemplates([]);
        return;
      }

      setLoadingTemplates(true);
      setErro("");

      const res = await fetch(
        `/api/whatsapp/templates?integracao_whatsapp_id=${encodeURIComponent(
          integracaoId
        )}`,
        { cache: "no-store" }
      );

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao carregar templates.");
      }

      const lista = Array.isArray(json.data) ? json.data : [];

      const aprovados = lista.filter(
        (item: any) => String(item.status || "").toUpperCase() === "APPROVED"
      );

      setTemplates(aprovados);
    } catch (error: any) {
      setErro(error?.message || "Erro ao carregar templates.");
    } finally {
      setLoadingTemplates(false);
    }
  }

  async function criarDisparoAgendado() {
    try {
      setErroModal("");

      if (!integracaoSelecionada) {
        setErroModal("Selecione uma integração.");
        return;
      }

      if (!templateSelecionado) {
        setErroModal("Selecione um template.");
        return;
      }

      if (!agendamentoData || !agendamentoHora) {
        setErroModal("Selecione data e hora.");
        return;
      }

      if (contatosSelecionados.length === 0) {
        setErroModal("Selecione pelo menos um contato.");
        return;
      }

      setSalvandoDisparo(true);
      setErro("");
      setSucesso("");

      const executar_em = new Date(
        `${agendamentoData}T${agendamentoHora}:00`
      ).toISOString();

      const res = await fetch(
        "/api/disparos-agendados/criar",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            integracao_whatsapp_id: integracaoSelecionada,
            template_id: templateSelecionado,
            executar_em,
            contatos: contatosSelecionados.map((contato) => ({
              id: contato.id,
              nome: contato.nome,
              telefone: limparNumero(contato.telefone),
            })),
          }),
        }
      );

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(
          json.error || "Erro ao criar disparo."
        );
      }

      setSucesso("Disparo agendado com sucesso.");

      setModalNovoDisparo(false);

      setIntegracaoSelecionada("");
      setTemplateSelecionado("");
      setAgendamentoData("");
      setAgendamentoHora("");
      setContatosSelecionados([]);
      setBuscaContato("");

      await carregarDisparos();
    } catch (error: any) {
        setErroModal(
          error?.message ||
          "Erro ao criar disparo."
        );
    } finally {
      setSalvandoDisparo(false);
    }
  }

  useEffect(() => {
    carregarDisparos();
  }, [filtroStatus]);


  useEffect(() => {
    setTemplateSelecionado("");

    if (integracaoSelecionada) {
      carregarTemplates(integracaoSelecionada);
    } else {
      setTemplates([]);
    }
  }, [integracaoSelecionada]);


  useEffect(() => {
    if (!modalNovoDisparo) return;

    const timer = setTimeout(() => {
      carregarContatos(buscaContato, origemFiltro, campanhaFiltro);
    }, 300);

    return () => clearTimeout(timer);
  }, [buscaContato, origemFiltro, campanhaFiltro, modalNovoDisparo]);


  const metricas = useMemo(() => {
    const total = disparos.length;
    const pendentes = disparos.filter((item) => item.status === "pendente").length;
    const executados = disparos.filter((item) => item.status === "executado").length;
    const erros = disparos.filter((item) => item.status === "erro").length;

    return {
      total,
      pendentes,
      executados,
      erros,
    };
  }, [disparos]);

  const contatosDisponiveis = useMemo(() => {
    const idsSelecionados = new Set(
      contatosSelecionados.map((item) => item.id)
    );

    return contatos.filter((item) => !idsSelecionados.has(item.id));
  }, [contatos, contatosSelecionados]);

  const contatosDisponiveisValidos = useMemo(() => {
    return contatosDisponiveis.filter(contatoTemTelefoneValido);
  }, [contatosDisponiveis]);

  function adicionarContato(contato: any) {
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
    const mapaSelecionados = new Set(
      contatosSelecionados.map((item) => item.id)
    );

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
    setContatosSelecionados((prev) =>
      prev.filter((item) => item.id !== contatoId)
    );
  }

  function limparSelecao() {
    setContatosSelecionados([]);
    setErro("");
  }

  async function calcularPreviewCustoAgendamento(
    categoria: string,
    contatosLista: any[]
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
            telefone: limparNumero(contato.telefone),
          })),
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao calcular custo do agendamento.");
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
      setErro(error?.message || "Erro ao calcular custo do agendamento.");
    } finally {
      setLoadingPreviewCusto(false);
    }
  }

  const templateAtual =
    templates.find(
      (item) => item.id === templateSelecionado
    ) || null;

  const previewTemplate = templateAtual
    ? extrairPreviewTemplateCompleto(templateAtual.payload) ||
      "Template sem conteúdo para prévia."
    : "Selecione um template.";


  useEffect(() => {
    const categoria = String(templateAtual?.categoria || "").toLowerCase();

    if (!modalNovoDisparo || !categoria || contatosSelecionados.length === 0) {
      setPreviewCusto(null);
      return;
    }

    calcularPreviewCustoAgendamento(categoria, contatosSelecionados);
  }, [
    modalNovoDisparo,
    templateAtual?.id,
    templateAtual?.categoria,
    contatosSelecionados,
  ]);
   
  return (
    <>
      <Header
        title="Disparos agendados"
        subtitle="Acompanhe, gerencie e cancele disparos de templates WhatsApp criados pelos fluxos de automação."
      />

      <main className={styles.pageContent}>
        <aside className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <p className={styles.eyebrow}>Automação</p>
            <h1 className={styles.sidebarTitle}>Disparos</h1>
            <p className={styles.sidebarSubtitle}>
              Filtre os disparos agendados por status.
            </p>
          </div>

          <div className={styles.sidebarFilters}>
            <input
              className={styles.input}
              placeholder="Buscar template, telefone..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  carregarDisparos();
                }
              }}
            />

            <button
              type="button"
              className={styles.primaryButton}
              onClick={carregarDisparos}
            >
              Buscar
            </button>
          </div>

          <div className={styles.statusList}>
            {[
              { value: "todos", label: "Todos" },
              { value: "pendente", label: "Pendentes" },
              { value: "executado", label: "Executados" },
              { value: "cancelado", label: "Cancelados" },
              { value: "erro", label: "Erro" },
            ].map((item) => (
              <button
                key={item.value}
                type="button"
                className={
                  filtroStatus === item.value
                    ? styles.statusItemActive
                    : styles.statusItem
                }
                onClick={() => setFiltroStatus(item.value as StatusDisparo)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </aside>

        <section className={styles.mainPanel}>
          <header className={styles.editorHeader}>
            <div>
              <p className={styles.eyebrow}>Agenda de templates</p>
              <h2 className={styles.editorTitle}>Disparos agendados</h2>
              <p className={styles.editorSubtitle}>
                Visualize disparos criados pelos blocos de automação.
              </p>
            </div>

          <div className={styles.headerActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={carregarDisparos}
                disabled={carregando}
              >
                {carregando ? "Atualizando..." : "Atualizar"}
              </button>
                
              <button
                type="button"
                className={styles.primaryButton}
                onClick={async () => {
                  setModalNovoDisparo(true);
                  setErroModal("");
                  await carregarDadosModalDisparo();
                  setCampanhaFiltro("");
                  await carregarContatos("", "", "");
                }}
              >
                + Novo disparo
              </button>
            </div>
          </header>

          {(erro || sucesso) && (
            <div className={styles.alertArea}>
              {erro && <div className={styles.errorAlert}>{erro}</div>}
            </div>
          )}
          <FeedbackToast
            success={sucesso}
            onSuccessDismiss={() => setSucesso("")}
          />

          <div className={styles.metricsGrid}>
            <div className={styles.metricCard}>
              <span>Total</span>
              <strong>{metricas.total}</strong>
            </div>

            <div className={styles.metricCard}>
              <span>Pendentes</span>
              <strong>{metricas.pendentes}</strong>
            </div>

            <div className={styles.metricCard}>
              <span>Executados</span>
              <strong>{metricas.executados}</strong>
            </div>

            <div className={styles.metricCard}>
              <span>Erros</span>
              <strong>{metricas.erros}</strong>
            </div>
          </div>

          <div className={styles.listArea}>
            {carregando ? (
              <div className={styles.emptyState}>Carregando disparos...</div>
            ) : disparos.length === 0 ? (
              <div className={styles.emptyState}>
                Nenhum disparo agendado encontrado.
              </div>
            ) : (
              <div className={styles.disparosList}>
                {disparos.map((disparo) => {
                  const payload = disparo.payload_json || {};
                  const templateNome = payload.template_nome || "Template";
                  const numero = payload.numero_destino || "-";
                  const fluxoNome = disparo.automacao_fluxos?.nome || "Fluxo não encontrado";
                  const blocoTitulo =
                    disparo.automacao_nos?.titulo ||
                    payload.automacao_no_titulo ||
                    "Bloco não encontrado";

                  return (
                    <article
                      key={disparo.id}
                      className={styles.disparoCard}
                      onClick={() => setDisparoSelecionado(disparo)}
                    >
                      <div className={styles.disparoMain}>
                        <div className={styles.disparoIcon}>📨</div>

                        <div className={styles.disparoInfo}>
                          <div className={styles.disparoTop}>
                            <strong className={styles.disparoTitle}>
                              {templateNome}
                            </strong>

                            <span className={statusClass(disparo.status)}>
                              {statusLabel(disparo.status)}
                            </span>
                          </div>

                          <p className={styles.disparoMeta}>
                            Número: <strong>{numero}</strong>
                          </p>

                          <p className={styles.disparoMeta}>
                            Fluxo: {fluxoNome} · Bloco: {blocoTitulo}
                          </p>

                          {disparo.envio_status === "falha" && disparo.envio_erro_amigavel ? (
                            <details
                              className={styles.envioErroDetails}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <summary className={styles.envioErroSummary}>
                                <span>Falha no envio</span>
                                <small>Ver detalhes</small>
                              </summary>

                              <div className={styles.envioErroBox}>
                                <p>{disparo.envio_erro_amigavel}</p>

                                {disparo.envio_erro_tecnico ? (
                                  <small>Detalhe técnico: {disparo.envio_erro_tecnico}</small>
                                ) : null}
                              </div>
                            </details>
                          ) : null}
                        </div>
                      </div>

                      <div className={styles.disparoActions}>
                        {payload.conversa_id && (
                          <Link
                            href={`/conversas?conversaId=${payload.conversa_id}`}
                            className={styles.secondaryButton}
                            onClick={(e) => e.stopPropagation()}
                          >
                            Abrir conversa
                          </Link>
                        )}

                        {disparo.status === "pendente" && (
                          <button
                            type="button"
                            className={styles.dangerButton}
                            onClick={(e) => {
                              e.stopPropagation();
                              setDisparoParaCancelar(disparo);
                            }}
                          >
                            Cancelar
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {disparoSelecionado && (
          <aside className={styles.detailsPanel}>
            <div className={styles.propertiesHeader}>
              <div>
                <p className={styles.eyebrow}>Detalhes</p>
                <h3 className={styles.propertiesTitle}>Disparo agendado</h3>
              </div>

              <button
                type="button"
                className={styles.closePanelButton}
                onClick={() => setDisparoSelecionado(null)}
              >
                ×
              </button>
            </div>

            <div className={styles.detailsSection}>
              <h4 className={styles.detailsSectionTitle}>Resumo</h4>

              <div className={styles.detailsGrid}>
                <div className={styles.detailGroup}>
                  <span>Status</span>
                  <strong className={statusClass(disparoSelecionado.status)}>
                    {statusLabel(disparoSelecionado.status)}
                  </strong>
                </div>

                <div className={styles.detailGroup}>
                  <span>Status do envio</span>
                  <strong className={envioStatusClass(disparoSelecionado.envio_status)}>
                    {disparoSelecionado.envio_label || "Ainda não enviado"}
                  </strong>
                </div>

                <div className={styles.detailGroup}>
                  <span>Template</span>
                  <strong>{disparoSelecionado.payload_json?.template_nome || "-"}</strong>
                </div>

                <div className={styles.detailGroup}>
                  <span>Idioma</span>
                  <strong>{disparoSelecionado.payload_json?.template_idioma || "-"}</strong>
                </div>
              </div>
            </div>

            <div className={styles.detailsSection}>
              <h4 className={styles.detailsSectionTitle}>Destino</h4>

              <div className={styles.detailGroup}>
                <span>Número</span>
                <strong>{disparoSelecionado.payload_json?.numero_destino || "-"}</strong>
              </div>
            </div>

            <div className={styles.detailsSection}>
              <h4 className={styles.detailsSectionTitle}>Origem da automação</h4>

              <div className={styles.detailGroup}>
                <span>Fluxo</span>
                <strong>{disparoSelecionado.automacao_fluxos?.nome || "-"}</strong>
              </div>

              <div className={styles.detailGroup}>
                <span>Bloco</span>
                <strong>
                  {disparoSelecionado.automacao_nos?.titulo ||
                    disparoSelecionado.payload_json?.automacao_no_titulo ||
                    "-"}
                </strong>
              </div>
            </div>

            <div className={styles.detailsSection}>
              <h4 className={styles.detailsSectionTitle}>Datas</h4>

              <div className={styles.detailsGrid}>
                <div className={styles.detailGroup}>
                  <span>Criado em</span>
                  <strong>{formatarData(disparoSelecionado.created_at)}</strong>
                </div>

                <div className={styles.detailGroup}>
                  <span>Agendado para</span>
                  <strong>{formatarData(disparoSelecionado.executar_em)}</strong>
                </div>

                <div className={styles.detailGroup}>
                  <span>Executado em</span>
                  <strong>{formatarData(disparoSelecionado.executed_at)}</strong>
                </div>
              </div>
            </div>

            {disparoSelecionado.envio_status === "falha" &&
            disparoSelecionado.envio_erro_amigavel ? (
              <details className={styles.envioErroDetailsSelect}>
                <summary className={styles.envioErroSummary}>
                  <span>Falha no envio</span>
                  <small>Ver detalhes</small>
                </summary>

                <div className={styles.envioErroBox}>
                  <p>{disparoSelecionado.envio_erro_amigavel}</p>

                  {disparoSelecionado.envio_erro_tecnico ? (
                    <small>Detalhe técnico: {disparoSelecionado.envio_erro_tecnico}</small>
                  ) : null}
                </div>
              </details>
            ) : null}

            <div className={styles.detailGroupPrev}>
              <span>Prévia do template</span>

              <div className={styles.whatsappPreviewArea}>
                <div className={styles.whatsappBubble}>
                  <strong className={styles.whatsappPreviewTitle}>
                    {disparoSelecionado.payload_json?.template_nome || "Template WhatsApp"}
                  </strong>

                  <p className={styles.whatsappPreviewText}>
                    {renderizarTextoTemplate(disparoSelecionado.payload_json || {})}
                  </p>

                  <div className={styles.whatsappPreviewMeta}>
                    <p className={styles.whatsappPreviewFooter}>
                      Equipe de atendimento
                    </p>

                    <p className={styles.whatsappPreviewTime}>
                      {formatarData(disparoSelecionado.executar_em)}
                    </p>
                  </div>

                  {disparoSelecionado.payload_json?.template_payload?.components
                    ?.find((item: any) => String(item.type || "").toUpperCase() === "BUTTONS")
                    ?.buttons?.map((botao: any, index: number) => (
                      <div key={index} className={styles.whatsappPreviewButton}>
                        ↩ {botao.text || "Botão"}
                      </div>
                    ))}
                </div>
              </div>
            </div>

            {disparoSelecionado.status === "pendente" && (
              <button
                type="button"
                className={styles.dangerButtonFull}
                onClick={() => setDisparoParaCancelar(disparoSelecionado)}
              >
                Cancelar disparo
              </button>
            )}
          </aside>
        )}

        {modalNovoDisparo ? (
          <div
            className={styles.modalOverlay}
            onClick={() => setModalNovoDisparo(false)}
          >
            <div
              className={`${styles.modalCard} ${styles.modalDisparoCard}`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={styles.modalHeader}>
                <div>
                  <p className={styles.eyebrow}>WhatsApp</p>

                  <h2 className={styles.modalTitle}>
                    Agendar disparo
                  </h2>

                  <p className={styles.modalSubtitle}>
                    Crie um disparo agendado manual de template WhatsApp.
                  </p>
                </div>

                <button
                  type="button"
                  className={styles.closePanelButton}
                  onClick={() => {
                    setErroModal("");
                    setModalNovoDisparo(false);
                  }}
                >
                  ×
                </button>
              </div>

              <div className={styles.modalBody}>
                {erroModal && (
                  <div className={styles.errorAlert}>
                    {erroModal}
                  </div>
                )}
                {loadingModal ? (
                  <div className={styles.emptyState}>
                    Carregando dados do disparo...
                  </div>
                ) : (
                <div className={styles.disparoModalGrid}>
                  <div className={styles.disparoModalMain}>
                    <div className={styles.formSection}>
                      <div className={styles.formSectionHeader}>
                        <h3>Configurações</h3>
                        <p>Selecione integração, template e agendamento.</p>
                      </div>

                      <div className={styles.formGrid}>
                        <div className={styles.fieldGroup}>
                          <label className={styles.label}>
                            Integração WhatsApp
                          </label>

                          <select
                            className={styles.input}
                            value={integracaoSelecionada}
                            onChange={(e) => {
                              setIntegracaoSelecionada(e.target.value);
                              setTemplateSelecionado("");
                            }}
                          >
                            <option value="">Selecionar integração</option>

                            {integracoes.map((integracao) => (
                              <option
                                key={integracao.id}
                                value={integracao.id}
                              >
                              {integracao.nome_conexao
                                ? `${integracao.nome_conexao} • ${integracao.numero || "Sem número"}`
                                : integracao.numero || "Integração sem nome"}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className={styles.fieldGroup}>
                          <label className={styles.label}>
                            Template
                          </label>

                          <select
                            className={styles.input}
                            value={templateSelecionado}
                            onChange={(e) => setTemplateSelecionado(e.target.value)}
                          >
                            <option value="">Selecionar template</option>

                            {integracaoSelecionada && !loadingTemplates && templates.length === 0 && (
                              <option value="" disabled>
                                Nenhum template aprovado para esta integração
                              </option>
                            )}

                            {templates.map((template) => (
                              <option
                                key={template.id}
                                value={template.id}
                              >
                                {template.nome} • {template.idioma}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className={styles.fieldGroup}>
                          <label className={styles.label}>
                            Data
                          </label>

                        <input
                          type="date"
                          className={styles.input}
                          value={agendamentoData}
                          onChange={(e) => setAgendamentoData(e.target.value)}
                        />
                        </div>

                        <div className={styles.fieldGroup}>
                          <label className={styles.label}>
                            Hora
                          </label>

                          <input
                            type="time"
                            className={styles.input}
                            value={agendamentoHora}
                            onChange={(e) => setAgendamentoHora(e.target.value)}
                          />
                        </div>
                      </div>
                    </div>

                    <div className={styles.formSection}>
                      <div className={styles.formSectionHeader}>
                        <h3>Destinatários</h3>
                        <p>Selecione quem receberá o disparo.</p>
                      </div>

                        <div className={styles.contactsSearchRow}>
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
                            <option value="">
                              {origensDisponiveis.length > 0
                                ? "Todas as origens"
                                : "Sem origens"}
                            </option>

                              {origensDisponiveis.map((origem) => (
                                <option key={origem} value={origem}>
                                  {origem}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className={styles.field}>
                            <label className={styles.label}>Filtrar por campanha</label>

                            <select
                              value={campanhaFiltro}
                              onChange={(e) => setCampanhaFiltro(e.target.value)}
                              className={styles.input}
                            >
                            <option value="">
                              {campanhasDisponiveis.length > 0
                                ? "Todas as campanhas"
                                : "Sem campanhas"}
                            </option>

                            {campanhasDisponiveis.map((campanha) => (
                              <option key={campanha} value={campanha}>
                                {campanha}
                              </option>
                            ))}
                            </select>
                          </div>
                        </div>
                    </div>

                    <div className={styles.contactsSection}>
                      <div className={styles.contactsColumn}>
                        <div className={styles.contactsHeader}>
                          <h3 className={styles.contactsTitle}>
                            Disponíveis
                          </h3>

                          <div className={styles.contactsHeaderActions}>
                            <button
                              type="button"
                              className={styles.contactsMiniButton}
                              onClick={adicionarTodosDisponiveis}
                              disabled={contatosDisponiveisValidos.length === 0}
                            >
                              Add todos
                            </button>

                            <span className={styles.contactsCount}>
                              {contatosDisponiveis.length}
                            </span>
                          </div>
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
                                      {contato.nome || contato.telefone || "Sem nome"}
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
                          <h3 className={styles.contactsTitle}>
                            Selecionados
                          </h3>

                          <div className={styles.contactsHeaderActions}>
                            <button
                              type="button"
                              className={styles.contactsMiniButton}
                              onClick={() => setContatosSelecionados([])}
                              disabled={contatosSelecionados.length === 0}
                            >
                              Remover todos
                            </button>

                            <span className={styles.contactsCount}>
                              {contatosSelecionados.length}
                            </span>
                          </div>
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
                                      {contato.nome || contato.telefone || "Sem nome"}
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
                                  className={styles.secondaryButton}
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
                  </div>

                  <aside className={styles.disparoPreviewSidebar}>
                    <div className={styles.previewCard}>
                      <span className={styles.previewBadge}>Prévia</span>

                      <div className={styles.whatsappPreviewArea}>
                        <div className={styles.whatsappBubble}>
                          <strong className={styles.whatsappPreviewTitle}>
                            {templateAtual?.nome || "Template WhatsApp"}
                          </strong>

                          <p className={styles.whatsappPreviewText}>
                            {templateAtual
                              ? previewTemplate
                              : "Selecione um template para visualizar a mensagem."}
                          </p>

                          <div className={styles.whatsappPreviewMeta}>
                            <span className={styles.whatsappPreviewFooter}>
                              Equipe de atendimento
                            </span>

                            <span className={styles.whatsappPreviewTime}>
                              {agendamentoHora || "--:--"}
                            </span>
                          </div>

                          {templateAtual?.payload?.components
                            ?.find((item: any) => item.type === "BUTTONS")
                            ?.buttons?.map((botao: any, index: number) => (
                              <div key={index} className={styles.whatsappPreviewButton}>
                                ↩ {botao.text || "Botão"}
                              </div>
                            ))}
                        </div>
                      </div>
                    </div>

                    <div className={styles.scheduleCard}>
                      <span className={styles.scheduleLabel}>
                        Agendamento
                      </span>

                      <strong className={styles.scheduleDate}>
                        {agendamentoData && agendamentoHora
                          ? `${agendamentoData} às ${agendamentoHora}`
                          : "Nenhuma data selecionada"}
                      </strong>

                      <p className={styles.scheduleDescription}>
                        O disparo será enviado automaticamente
                        na data configurada.
                      </p>
                    </div>
                                        
                    {templateAtual && contatosSelecionados.length > 0 && (
                      <div className={styles.disparoCustoBox}>
                        <div className={styles.disparoCustoHeader}>
                          <span className={styles.disparoCustoEyebrow}>
                            Estimativa de cobrança
                          </span>

                          <span className={styles.disparoCustoCategoria}>
                            {String(previewCusto?.categoria || templateAtual?.categoria || "-").toUpperCase()}
                          </span>
                        </div>

                        <div className={styles.disparoCustoMain}>
                          <div className={styles.disparoCustoValorPrincipal}>
                            {loadingPreviewCusto
                              ? "Calculando..."
                              : `R$ ${(previewCusto?.valorTotalBrlMin ?? 0).toFixed(2)} ~ R$ ${(previewCusto?.valorTotalBrlMax ?? 0).toFixed(2)}`}
                          </div>

                          <div className={styles.disparoCustoMetaLinha}>
                            <span>
                              <strong>USD:</strong>{" "}
                              {`US$ ${(previewCusto?.valorTotalUsd ?? 0).toFixed(4)}`}
                            </span>

                            <span>
                              <strong>Cobrados:</strong>{" "}
                              {previewCusto?.totalCobrados ?? 0}
                            </span>

                            <span>
                              <strong>Isentos:</strong>{" "}
                              {previewCusto?.totalIsentos ?? 0}
                            </span>
                          </div>
                        </div>

                        <div className={styles.disparoCustoAviso}>
                          A cobrança pode ser processada pela Meta usando o método de pagamento
                          vinculado à conta empresarial. O valor final pode variar conforme câmbio,
                          impostos, IOF, taxas e regras de cobrança.
                        </div>
                      </div>
                    )}

                  </aside>
                </div>
                )}
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => setModalNovoDisparo(false)}
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={criarDisparoAgendado}
                  disabled={salvandoDisparo}
                >
                  {salvandoDisparo
                    ? "Agendando..."
                    : "Agendar disparo"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {disparoParaCancelar && (
          <div className={styles.modalOverlay}>
            <div className={`${styles.modalCard} ${styles.modalDisparoCard}`}>
              <div className={styles.modalHeader}>
                <div>
                  <p className={styles.eyebrow}>Cancelar disparo</p>
                  <h3 className={styles.modalTitle}>Confirmar cancelamento</h3>
                </div>

                <button
                  type="button"
                  className={styles.closePanelButton}
                  onClick={() => setDisparoParaCancelar(null)}
                >
                  ×
                </button>
              </div>

              <div className={styles.modalBody}>
                <div className={styles.warningBox}>
                  <strong>Cancelando esse disparo não será enviado.</strong>
                  <p>
                    O template{" "}
                    <strong>
                      {disparoParaCancelar.payload_json?.template_nome || "selecionado"}
                    </strong>{" "}
                    está agendado para{" "}
                    <strong>{formatarData(disparoParaCancelar.executar_em)}</strong>.
                  </p>
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => setDisparoParaCancelar(null)}
                >
                  Voltar
                </button>

                <button
                  type="button"
                  className={styles.dangerButton}
                  onClick={cancelarDisparo}
                  disabled={cancelando}
                >
                  {cancelando ? "Cancelando..." : "Cancelar disparo"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
