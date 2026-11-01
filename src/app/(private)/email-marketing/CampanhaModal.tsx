"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  Ban,
  ChevronLeft,
  ChevronRight,
  FileText,
  Mail,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import GerenciarVariaveisModal, {
  type VariavelPersonalizadaCompartilhada,
} from "@/components/variaveis/GerenciarVariaveisModal";
import {
  aplicarFallbacksVariaveis,
  renderizarVariaveis,
  type VariaveisEmailMarketing,
} from "@/lib/email-marketing/conteudo";
import {
  VARIAVEIS_FIXAS_SISTEMA,
  extrairChavesVariaveis,
} from "@/lib/variaveis/catalogo";
import type { EmailTemplateItem } from "./TemplateModal";
import styles from "./email-marketing.module.css";

export type EmailRemetenteItem = {
  id: string;
  empresa_id: string | null;
  escopo: string;
  nome: string;
  email: string;
  dominio: string;
  provider: string;
  provider_domain_id: string | null;
  status: string;
  is_default: boolean;
};

export type EmailListaAudiencia = {
  id: string;
  nome: string;
  total_contatos: number;
  total_emails: number;
  created_at: string | null;
};

type ContatoBusca = {
  id: string;
  nome: string | null;
  email: string;
  telefone: string;
  empresa?: string | null;
  origem?: string | null;
  campanha?: string | null;
  interesse?: string | null;
  campo_contato?: string | null;
  status_lead?: string | null;
  classificacao?: string | null;
  whatsapp_profile_name?: string | null;
  supressao_motivo?: string | null;
};

type AnaliseAudiencia = {
  total_registros: number;
  sem_email_valido: number;
  emails_validos: number;
  emails_unicos: number;
  duplicados: number;
  suprimidos: number;
  elegiveis: number;
  conflitos_campo_contato: number;
  amostra?: Record<string, unknown>;
};

type Props = {
  templates: EmailTemplateItem[];
  remetentes: EmailRemetenteItem[];
  listas: EmailListaAudiencia[];
  totalContatosComEmail: number;
  onClose: () => void;
  onCreated: () => void | Promise<void>;
};

const ETAPAS = [
  { id: 1, titulo: "Conteúdo", subtitulo: "Campanha e template" },
  { id: 2, titulo: "Público", subtitulo: "Listas e contatos" },
  { id: 3, titulo: "Personalização", subtitulo: "Variáveis e prévia" },
  { id: 4, titulo: "Revisar", subtitulo: "Agendar ou enviar" },
];

function datetimeLocalPadrao() {
  const data = new Date(Date.now() + 60 * 60 * 1000);
  const local = new Date(data.getTime() - data.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function numero(valor: unknown) {
  return Math.max(0, Number(valor || 0));
}

function formatarNumero(valor: number) {
  return new Intl.NumberFormat("pt-BR").format(Math.max(0, valor || 0));
}

export default function CampanhaModal({
  templates,
  remetentes,
  listas,
  totalContatosComEmail,
  onClose,
  onCreated,
}: Props) {
  const templateInicial = templates[0] || null;
  const remetenteInicial =
    remetentes.find(
      (item) => item.is_default && item.status === "verificado"
    ) ||
    remetentes.find((item) => item.status === "verificado") ||
    null;

  const [etapa, setEtapa] = useState(1);
  const wizardWorkspaceRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!window.matchMedia("(max-width: 700px)").matches) return;
    if (wizardWorkspaceRef.current) wizardWorkspaceRef.current.scrollTop = 0;
  }, [etapa]);

  const [nome, setNome] = useState("");
  const [templateId, setTemplateId] = useState(templateInicial?.id || "");
  const [assunto, setAssunto] = useState(templateInicial?.assunto || "");
  const [remetenteId, setRemetenteId] = useState(remetenteInicial?.id || "");

  const [audienciaTipo, setAudienciaTipo] = useState<
    "todos" | "listas" | "contatos"
  >("todos");
  const [listaIds, setListaIds] = useState<string[]>([]);
  const [buscaLista, setBuscaLista] = useState("");

  const [buscaContato, setBuscaContato] = useState("");
  const [paginaContatos, setPaginaContatos] = useState(1);
  const [totalPaginasContatos, setTotalPaginasContatos] = useState(1);
  const [totalBuscaContatos, setTotalBuscaContatos] = useState(0);
  const [contatos, setContatos] = useState<ContatoBusca[]>([]);
  const [contatosSelecionados, setContatosSelecionados] = useState<
    Map<string, ContatoBusca>
  >(new Map());
  const [carregandoContatos, setCarregandoContatos] = useState(false);

  const [analise, setAnalise] = useState<AnaliseAudiencia | null>(null);
  const [analisando, setAnalisando] = useState(false);
  const [erroAnalise, setErroAnalise] = useState("");

  const [variaveisPersonalizadas, setVariaveisPersonalizadas] = useState<
    VariavelPersonalizadaCompartilhada[]
  >([]);
  const [fallbacks, setFallbacks] = useState<Record<string, string>>({});
  const [modalVariaveis, setModalVariaveis] = useState(false);

  const [modoEnvio, setModoEnvio] = useState<"agora" | "agendar" | null>(null);
  const [agendadaPara, setAgendadaPara] = useState(datetimeLocalPadrao());
  const [confirmacaoFinal, setConfirmacaoFinal] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState("");

  const templateSelecionado = useMemo(
    () => templates.find((item) => item.id === templateId) || null,
    [templateId, templates]
  );

  const remetenteSelecionado = useMemo(
    () => remetentes.find((item) => item.id === remetenteId) || null,
    [remetenteId, remetentes]
  );

  const listasFiltradas = useMemo(() => {
    const termo = buscaLista.trim().toLocaleLowerCase("pt-BR");

    if (!termo) return listas;

    return listas.filter((item) =>
      item.nome.toLocaleLowerCase("pt-BR").includes(termo)
    );
  }, [buscaLista, listas]);

  const listasSelecionadas = useMemo(
    () =>
      listaIds
        .map((id) => listas.find((item) => item.id === id))
        .filter((item): item is EmailListaAudiencia => Boolean(item)),
    [listaIds, listas]
  );

  const chavesUsadas = useMemo(
    () =>
      extrairChavesVariaveis(
        assunto,
        templateSelecionado?.html,
        templateSelecionado?.texto
      ),
    [assunto, templateSelecionado]
  );

  const catalogoVariaveis = useMemo(() => {
    const mapa = new Map(
      VARIAVEIS_FIXAS_SISTEMA.map((item) => [item.chave, item])
    );

    variaveisPersonalizadas.forEach((item) => {
      mapa.set(item.chave, {
        chave: item.chave,
        exemplo: "{{" + item.chave + "}}",
        descricao: item.descricao || "Variável personalizada da empresa.",
        categoria: "Personalizada" as const,
      });
    });

    return mapa;
  }, [variaveisPersonalizadas]);

  const valoresPersonalizados = useMemo(
    () =>
      Object.fromEntries(
        variaveisPersonalizadas.map((item) => [item.chave, item.valor || ""])
      ),
    [variaveisPersonalizadas]
  );

  const variaveisAmostra = useMemo(() => {
    const amostra = (analise?.amostra || {}) as Record<string, unknown>;
    const nomeContato = String(amostra.nome || "");
    const nomeWhatsapp = String(amostra.nome_whatsapp || nomeContato);
    const email = String(amostra.email || "");
    const telefone = String(amostra.telefone || "");
    const classificacao = String(amostra.classificacao || "");
    const statusLead = String(amostra.status_lead || "");

    let mapa: VariaveisEmailMarketing = {
      ...valoresPersonalizados,
      nome: nomeContato,
      nome_contato: nomeContato,
      contato_nome: nomeContato,
      nome_whatsapp: nomeWhatsapp,
      whatsapp_nome: nomeWhatsapp,
      nome_perfil_whatsapp: nomeWhatsapp,
      perfil_whatsapp_nome: nomeWhatsapp,
      nome_captura: nomeWhatsapp || nomeContato,
      primeiro_nome_captura:
        (nomeWhatsapp || nomeContato).split(/\s+/).filter(Boolean)[0] || "",
      email,
      email_contato: email,
      contato_email: email,
      telefone,
      numero: telefone,
      numero_contato: telefone,
      contato_numero: telefone,
      telefone_contato: telefone,
      contato_telefone: telefone,
      empresa: String(amostra.empresa || ""),
      campo_contato: String(amostra.campo_contato || ""),
      variavel_contato: String(amostra.campo_contato || ""),
      interesse: String(amostra.interesse || ""),
      campanha: String(amostra.campanha || ""),
      origem: String(amostra.origem || ""),
      status: statusLead,
      status_lead: statusLead,
      classificacao,
      classificacao_lead: classificacao,
      lead_classificacao: classificacao,
      protocolo_atual: "",
      ultimo_protocolo: "",
    };

    for (const [chave, valor] of Object.entries(valoresPersonalizados)) {
      mapa[chave] = renderizarVariaveis(valor, mapa, false);
    }

    mapa = aplicarFallbacksVariaveis(mapa, fallbacks);
    return mapa;
  }, [analise, fallbacks, valoresPersonalizados]);

  const amostraRealDisponivel = Boolean(
    String(analise?.amostra?.email || "").trim()
  );
  const variaveisPreview = useMemo<VariaveisEmailMarketing>(
    () =>
      amostraRealDisponivel
        ? variaveisAmostra
        : {
            ...variaveisAmostra,
            nome: "Cliente",
            nome_contato: "Cliente",
            contato_nome: "Cliente",
            nome_whatsapp: "Cliente",
            nome_captura: "Cliente",
            primeiro_nome_captura: "Cliente",
            email: "cliente@exemplo.com",
            email_contato: "cliente@exemplo.com",
          },
    [amostraRealDisponivel, variaveisAmostra]
  );

  const assuntoPreview = useMemo(
    () => renderizarVariaveis(assunto, variaveisPreview, false),
    [assunto, variaveisPreview]
  );

  const htmlPreview = useMemo(
    () =>
      renderizarVariaveis(
        String(templateSelecionado?.html || ""),
        variaveisPreview,
        true
      ),
    [templateSelecionado, variaveisPreview]
  );

  useEffect(() => {
    if (templateSelecionado) {
      setAssunto(templateSelecionado.assunto);
    }
  }, [templateId, templateSelecionado]);

  useEffect(() => {
    let ativo = true;

    async function carregarVariaveis() {
      try {
        const response = await fetch("/api/variaveis", { cache: "no-store" });
        const data = await response.json();

        if (!ativo) return;

        if (response.ok && data?.ok) {
          setVariaveisPersonalizadas(
            Array.isArray(data.variaveis) ? data.variaveis : []
          );
        }
      } catch {
        // A campanha continua funcional apenas com variáveis fixas.
      }
    }

    void carregarVariaveis();

    return () => {
      ativo = false;
    };
  }, []);

  useEffect(() => {
    if (audienciaTipo !== "contatos") return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setCarregandoContatos(true);

      try {
        const response = await fetch(
          "/api/email-marketing/audiencia?limite=30&pagina=" +
            paginaContatos +
            "&busca=" +
            encodeURIComponent(buscaContato),
          {
            cache: "no-store",
            signal: controller.signal,
          }
        );
        const data = await response.json();

        if (response.ok && data?.ok) {
          const encontrados: ContatoBusca[] = data.contatos || [];
          setContatos(encontrados);
          const bloqueados = new Set(
            encontrados
              .filter((item) => Boolean(item.supressao_motivo))
              .map((item) => item.id)
          );
          if (bloqueados.size) {
            setContatosSelecionados((atuais) => {
              const novo = new Map(atuais);
              for (const id of bloqueados) novo.delete(id);
              return novo.size === atuais.size ? atuais : novo;
            });
          }
          setTotalPaginasContatos(
            Math.max(1, Number(data.paginacao?.total_paginas || 1))
          );
          setTotalBuscaContatos(Number(data.paginacao?.total || 0));
        } else {
          setContatos([]);
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setContatos([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setCarregandoContatos(false);
        }
      }
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [audienciaTipo, buscaContato, paginaContatos]);

  useEffect(() => {
    setPaginaContatos(1);
  }, [buscaContato]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      if (audienciaTipo === "listas" && !listaIds.length) {
        setAnalise(null);
        setErroAnalise("");
        return;
      }

      if (audienciaTipo === "contatos" && !contatosSelecionados.size) {
        setAnalise(null);
        setErroAnalise("");
        return;
      }

      setAnalisando(true);
      setErroAnalise("");

      try {
        const response = await fetch("/api/email-marketing/audiencia", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            modo: audienciaTipo,
            lista_ids: audienciaTipo === "listas" ? listaIds : [],
            contato_ids:
              audienciaTipo === "contatos"
                ? Array.from(contatosSelecionados.keys())
                : [],
          }),
          signal: controller.signal,
        });
        const data = await response.json();

        if (!response.ok || !data?.ok) {
          throw new Error(
            data?.error || "Não foi possível analisar a audiência."
          );
        }

        setAnalise({
          total_registros: numero(data.analise?.total_registros),
          sem_email_valido: numero(data.analise?.sem_email_valido),
          emails_validos: numero(data.analise?.emails_validos),
          emails_unicos: numero(data.analise?.emails_unicos),
          duplicados: numero(data.analise?.duplicados),
          suprimidos: numero(data.analise?.suprimidos),
          elegiveis: numero(data.analise?.elegiveis),
          conflitos_campo_contato: numero(
            data.analise?.conflitos_campo_contato
          ),
          amostra: data.analise?.amostra || {},
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setAnalise(null);
        setErroAnalise(
          error instanceof Error
            ? error.message
            : "Não foi possível analisar a audiência."
        );
      } finally {
        if (!controller.signal.aborted) {
          setAnalisando(false);
        }
      }
    }, 300);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [audienciaTipo, listaIds, contatosSelecionados]);

  function alternarLista(id: string) {
    setListaIds((atuais) =>
      atuais.includes(id)
        ? atuais.filter((item) => item !== id)
        : [...atuais, id]
    );
  }

  function alternarContato(contato: ContatoBusca) {
    if (contato.supressao_motivo) return;
    setContatosSelecionados((atual) => {
      const novo = new Map(atual);

      if (novo.has(contato.id)) {
        novo.delete(contato.id);
      } else {
        novo.set(contato.id, contato);
      }

      return novo;
    });
  }

  function validarEtapaAtual() {
    setAviso("");
    setErro("");

    if (etapa === 1) {
      if (!nome.trim() || !templateId || !remetenteId || !assunto.trim()) {
        setAviso("Preencha nome, remetente, template e assunto para continuar.");
        return false;
      }
    }

    if (etapa === 2) {
      if (audienciaTipo === "listas" && !listaIds.length) {
        setAviso("Selecione pelo menos uma lista para continuar.");
        return false;
      }

      if (audienciaTipo === "contatos" && !contatosSelecionados.size) {
        setAviso("Selecione pelo menos um contato para continuar.");
        return false;
      }

      if (!analise || analise.elegiveis <= 0) {
        setAviso("A audiência selecionada não possui e-mails elegíveis.");
        return false;
      }
    }

    return true;
  }

  function avancar() {
    if (!validarEtapaAtual()) return;

    if (etapa === 3) {
      setModoEnvio(null);
      setConfirmacaoFinal(false);
    }

    setEtapa((atual) => Math.min(4, atual + 1));
  }

  function voltar() {
    setAviso("");
    setErro("");
    setConfirmacaoFinal(false);
    setEtapa((atual) => Math.max(1, atual - 1));
  }

  async function criar() {
    setAviso("");
    setErro("");

    if (etapa !== 4) return;

    if (!modoEnvio) {
      setAviso("Escolha se deseja enviar agora ou agendar a campanha.");
      return;
    }

    if (!confirmacaoFinal) {
      setAviso("Confirme a revisão final antes de enviar ou agendar.");
      return;
    }

    let agendamentoIso: string | null = null;

    if (modoEnvio === "agendar") {
      const data = new Date(agendadaPara);

      if (!Number.isFinite(data.getTime()) || data.getTime() <= Date.now()) {
        setAviso("Escolha uma data e hora futuras para o agendamento.");
        return;
      }

      agendamentoIso = data.toISOString();
    }

    if (!analise || analise.elegiveis <= 0) {
      setAviso("A audiência precisa ser analisada antes do envio.");
      return;
    }

    setEnviando(true);

    try {
      const response = await fetch("/api/email-marketing/campanhas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: nome.trim(),
          assunto: assunto.trim(),
          template_id: templateId,
          remetente_id: remetenteId,
          audiencia_tipo: audienciaTipo,
          lista_ids: audienciaTipo === "listas" ? listaIds : [],
          contato_ids:
            audienciaTipo === "contatos"
              ? Array.from(contatosSelecionados.keys())
              : [],
          variaveis_fallbacks: fallbacks,
          agendada_para: agendamentoIso,
          confirmar_envio: true,
        }),
      });
      const data = await response.json();

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Não foi possível criar a campanha.");
      }

      await onCreated();
      onClose();
    } catch (error) {
      setErro(
        error instanceof Error
          ? error.message
          : "Não foi possível criar a campanha."
      );
    } finally {
      setEnviando(false);
    }
  }

  const resumoPublico =
    audienciaTipo === "todos"
      ? "Todos os contatos com e-mail"
      : audienciaTipo === "listas"
        ? listasSelecionadas.map((item) => item.nome).join(", ")
        : formatarNumero(contatosSelecionados.size) + " contato(s) selecionado(s)";

  return (
    <>
      <div className={styles.modalOverlay} onMouseDown={onClose}>
        <div
          className={[
            styles.modalCard,
            styles.campaignModal,
            styles.campaignWizardModal,
          ].join(" ")}
          data-campaign-step={etapa}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className={[styles.modalHeader, styles.wizardCompactModalHeader].join(" ")}>
            <div className={styles.wizardCompactTitle}>
              <span>NOVA CAMPANHA</span>
              <h2>Criar campanha de e-mail</h2>
            </div>
            <button
              type="button"
              className={styles.iconButton}
              onClick={onClose}
              aria-label="Fechar"
            >
              <X size={18} />
            </button>
          </div>

          <div className={styles.wizardWorkspace} ref={wizardWorkspaceRef}>
            <aside className={styles.wizardPreviewSidebar} aria-label="Pré-visualização do e-mail">
              <div className={styles.wizardPreviewCompactTop}>
                <strong>Prévia do e-mail</strong>
                <span>
                  {amostraRealDisponivel
                    ? `Exemplo 1 dos contatos: ${String(analise?.amostra?.nome || analise?.amostra?.email || "Contato")}`
                    : "Exemplo 1 dos contatos: Cliente de exemplo"}
                </span>
              </div>
              <div className={styles.wizardPreviewMetadata}>
                <div className={styles.wizardPreviewMetadataItem} title={remetenteSelecionado?.email || "Selecione um remetente"}>
                  <span>Remetente:</span>
                  <strong>
                    {remetenteSelecionado?.email || "Selecione um remetente"}
                  </strong>
                </div>
                <div className={styles.wizardPreviewMetadataItem} title={assuntoPreview || "Defina o assunto do e-mail"}>
                  <span>Assunto:</span>
                  <strong>{assuntoPreview || "Defina o assunto do e-mail"}</strong>
                </div>
              </div>
              <div className={styles.wizardPreviewDocument}>
                {templateSelecionado?.html ? (
                  <iframe
                    title="Prévia completa do e-mail"
                    sandbox=""
                    srcDoc={htmlPreview}
                  />
                ) : (
                  <div className={styles.wizardPreviewEmpty}>
                    <FileText size={26} />
                    <strong>Selecione um template</strong>
                    <span>O conteúdo do e-mail aparecerá aqui.</span>
                  </div>
                )}
              </div>
            </aside>

            <div className={styles.wizardMainColumn}>
              <div className={styles.wizardSteps}>
                {ETAPAS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={
                  item.id === etapa
                    ? styles.wizardStepActive
                    : item.id < etapa
                      ? styles.wizardStepDone
                      : styles.wizardStep
                }
                onClick={() => {
                  if (item.id < etapa) setEtapa(item.id);
                }}
              >
                <span>{item.id < etapa ? <Check size={14} /> : item.id}<span className={styles.wizardStepTotal}>/4</span></span>
                <div>
                  <strong>{item.titulo}</strong>
                  <small>{item.subtitulo}</small>
                </div>
                </button>
              ))}
            </div>

          <form
            className={styles.modalBody}
            onSubmit={(event) => event.preventDefault()}
          >
            <div className={styles.wizardScrollArea}>
            {etapa === 1 ? (
              <div className={styles.wizardSection}>
                <div className={styles.formGridTwo}>
                  <label className={styles.field}>
                    <span>Nome da campanha</span>
                    <input
                      value={nome}
                      onChange={(event) => setNome(event.target.value)}
                      placeholder="Ex.: Campanha outubro"
                      maxLength={160}
                    />
                  </label>

                  <label className={styles.field}>
                    <span>Remetente</span>
                    <select
                      value={remetenteId}
                      onChange={(event) => setRemetenteId(event.target.value)}
                    >
                      <option value="">Selecione</option>
                      {remetentes
                        .filter((item) => item.status === "verificado")
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.nome + " <" + item.email + ">"}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>

                <div className={styles.formGridTwo}>
                  <label className={styles.field}>
                    <span>Template</span>
                    <select
                      value={templateId}
                      onChange={(event) => setTemplateId(event.target.value)}
                    >
                      <option value="">Selecione</option>
                      {templates.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.nome}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className={styles.field}>
                    <span>Assunto</span>
                    <input
                      value={assunto}
                      onChange={(event) => setAssunto(event.target.value)}
                      placeholder="Assunto da mensagem"
                      maxLength={250}
                    />
                  </label>
                </div>

              </div>
            ) : null}

            {etapa === 2 ? (
              <div className={styles.wizardSection}>
                <div className={styles.formSectionHeader}>
                  <div>
                    <strong>Quem receberá a campanha?</strong>
                    <span>Escolha uma opção de público abaixo.</span>
                  </div>
                  <span className={styles.audienceEstimate}>
                    {analisando
                      ? "Analisando..."
                      : formatarNumero(analise?.elegiveis || 0) + " elegíveis"}
                  </span>
                </div>

                <div className={styles.audienceModeSelector} role="group" aria-label="Tipo de público">
                  <button
                    type="button"
                    aria-pressed={audienciaTipo === "todos"}
                    className={audienciaTipo === "todos" ? styles.audienceModeActive : styles.audienceModeOption}
                    onClick={() => setAudienciaTipo("todos")}
                  >
                    <Users size={18} aria-hidden="true" />
                    <span>
                      <strong>Todos</strong>
                      <small>{formatarNumero(totalContatosComEmail)} com e-mail</small>
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={audienciaTipo === "listas"}
                    className={audienciaTipo === "listas" ? styles.audienceModeActive : styles.audienceModeOption}
                    onClick={() => setAudienciaTipo("listas")}
                  >
                    <FileText size={18} aria-hidden="true" />
                    <span>
                      <strong>Listas</strong>
                      <small>Uma ou mais listas</small>
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={audienciaTipo === "contatos"}
                    className={audienciaTipo === "contatos" ? styles.audienceModeActive : styles.audienceModeOption}
                    onClick={() => setAudienciaTipo("contatos")}
                  >
                    <Mail size={18} aria-hidden="true" />
                    <span>
                      <strong>Contatos</strong>
                      <small>Seleção manual</small>
                    </span>
                  </button>
                </div>

                {audienciaTipo === "listas" ? (
                  <div className={styles.audiencePicker}>
                    <div className={styles.audiencePickerHeader}>
                      <label className={styles.searchBox}>
                        <Search size={17} />
                        <input
                          value={buscaLista}
                          onChange={(event) => setBuscaLista(event.target.value)}
                          placeholder="Buscar lista"
                        />
                      </label>
                      <span>
                        {listaIds.length} lista(s) selecionada(s)
                      </span>
                    </div>

                    <div className={styles.multiListGrid}>
                      {listasFiltradas.map((lista) => {
                        const selecionada = listaIds.includes(lista.id);
                        const prioridade = listaIds.indexOf(lista.id) + 1;

                        return (
                          <button
                            key={lista.id}
                            type="button"
                            className={
                              selecionada
                                ? styles.multiListCardSelected
                                : styles.multiListCard
                            }
                            onClick={() => alternarLista(lista.id)}
                          >
                            <span
                              className={
                                selecionada
                                  ? styles.checkboxSelected
                                  : styles.checkbox
                              }
                            >
                              {selecionada ? <Check size={13} /> : null}
                            </span>
                            <div>
                              <strong>{lista.nome}</strong>
                              <small>
                                {formatarNumero(lista.total_emails)} com e-mail
                              </small>
                            </div>
                            {selecionada ? (
                              <em>Prioridade {prioridade}</em>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>

                    {listaIds.length > 1 ? (
                      <div className={styles.infoNote}>
                        Se o mesmo destinatário estiver em mais de uma lista, ele
                        receberá somente uma vez. Para{" "}
                        <strong>{"{{campo_contato}}"}</strong>, a primeira lista
                        selecionada tem prioridade.
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {audienciaTipo === "contatos" ? (
                  <section className={styles.audienceContactSection}>
                    <div className={styles.audienceContactSectionHeader}>
                      <strong>Selecione os contatos</strong>
                      <span>Clique em um contato para adicionar ou remover.</span>
                    </div>
                    <div className={styles.contactDualPicker}>
                    <div className={styles.contactPickerColumn}>
                      <div className={styles.contactPickerColumnHeader}>
                        <strong>Disponíveis</strong>
                        <span>{formatarNumero(totalBuscaContatos)}</span>
                      </div>

                      <div className={styles.contactPickerToolbar}>
                        <label className={styles.searchBox}>
                          <Search size={17} />
                          <input
                            value={buscaContato}
                            onChange={(event) => setBuscaContato(event.target.value)}
                            placeholder="Buscar nome, e-mail ou telefone"
                          />
                        </label>
                        <p className={styles.contactBlockedHint}>
                          Descadastrados e bloqueados não podem ser selecionados.
                        </p>
                      </div>

                      <div className={styles.contactResults}>
                        {carregandoContatos ? (
                          <div className={styles.inlineMuted}>
                            Buscando contatos...
                          </div>
                        ) : contatos.length ? (
                          contatos.map((contato) => {
                            const selecionado = contatosSelecionados.has(
                              contato.id
                            );
                            const motivo = String(
                              contato.supressao_motivo || ""
                            ).toLowerCase();
                            const bloqueado = Boolean(motivo);
                            const descadastrado = motivo === "descadastro";

                            return (
                              <button
                                key={contato.id}
                                type="button"
                                disabled={bloqueado}
                                title={
                                  bloqueado
                                    ? descadastrado
                                      ? "Este contato optou por não receber e-mails."
                                      : "Endereço bloqueado para campanhas de e-mail."
                                    : undefined
                                }
                                className={
                                  bloqueado
                                    ? styles.contactResultBlocked
                                    : selecionado
                                      ? styles.contactResultSelected
                                      : styles.contactResult
                                }
                                onClick={() => alternarContato(contato)}
                              >
                                <span>
                                  <strong>{contato.nome || "Sem nome"}</strong>
                                  <small>{contato.email}</small>
                                </span>
                                {bloqueado ? (
                                  <span className={styles.contactBlockedBadge}>
                                    <Ban size={13} />
                                    {descadastrado ? "Descadastrado" : "Bloqueado"}
                                  </span>
                                ) : selecionado ? (
                                  <Check size={17} />
                                ) : null}
                              </button>
                            );
                          })
                        ) : (
                          <div className={styles.inlineMuted}>
                            Nenhum contato encontrado.
                          </div>
                        )}
                      </div>

                      <div className={styles.paginationMini}>
                        <button
                          type="button"
                          onClick={() =>
                            setPaginaContatos((atual) =>
                              Math.max(1, atual - 1)
                            )
                          }
                          disabled={paginaContatos <= 1}
                        >
                          <ChevronLeft size={15} />
                        </button>
                        <span>
                          Página {paginaContatos} de {totalPaginasContatos}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setPaginaContatos((atual) =>
                              Math.min(totalPaginasContatos, atual + 1)
                            )
                          }
                          disabled={paginaContatos >= totalPaginasContatos}
                        >
                          <ChevronRight size={15} />
                        </button>
                      </div>
                    </div>

                    <div className={styles.contactPickerColumn}>
                      <div className={styles.contactPickerColumnHeader}>
                        <strong>Selecionados</strong>
                        <div className={styles.audienceSelectedActions}>
                          <span>{formatarNumero(contatosSelecionados.size)}</span>
                          {contatosSelecionados.size ? (
                            <button type="button" onClick={() => setContatosSelecionados(new Map())}>
                              Limpar
                            </button>
                          ) : null}
                        </div>
                      </div>

                      <div className={styles.selectedContactsList}>
                        {contatosSelecionados.size ? (
                          Array.from(contatosSelecionados.values())
                            .slice(0, 150)
                            .map((contato) => (
                              <button
                                key={contato.id}
                                type="button"
                                title="Clique para retirar este contato da seleção"
                                onClick={() => alternarContato(contato)}
                              >
                                <span>
                                  <strong>{contato.nome || "Sem nome"}</strong>
                                  <small>{contato.email}</small>
                                </span>
                                <Check size={16} aria-hidden="true" />
                              </button>
                            ))
                        ) : (
                          <div className={styles.inlineMuted}>
                            Nenhum contato selecionado.
                          </div>
                        )}

                        {contatosSelecionados.size > 150 ? (
                          <div className={styles.inlineMuted}>
                            +{" "}
                            {formatarNumero(
                              contatosSelecionados.size - 150
                            )}{" "}
                            selecionados não exibidos aqui.
                          </div>
                        ) : null}
                      </div>


                    </div>
                    </div>
                  </section>
                ) : null}

                {erroAnalise ? (
                  <div className={styles.feedbackError}>{erroAnalise}</div>
                ) : null}

                {analise ? (
                  <div className={styles.audienceAnalysisGrid}>
                    <div>
                      <span>Registros encontrados</span>
                      <strong>
                        {formatarNumero(analise.total_registros)}
                      </strong>
                    </div>
                    <div>
                      <span>E-mails únicos</span>
                      <strong>{formatarNumero(analise.emails_unicos)}</strong>
                    </div>
                    <div>
                      <span>Duplicados removidos</span>
                      <strong>{formatarNumero(analise.duplicados)}</strong>
                    </div>
                    <div>
                      <span>Sem e-mail válido</span>
                      <strong>
                        {formatarNumero(analise.sem_email_valido)}
                      </strong>
                    </div>
                    <div>
                      <span>Suprimidos</span>
                      <strong>{formatarNumero(analise.suprimidos)}</strong>
                    </div>
                    <div className={styles.audienceAnalysisPrimary}>
                      <span>Receberão a campanha</span>
                      <strong>{formatarNumero(analise.elegiveis)}</strong>
                    </div>
                  </div>
                ) : null}

                {analise?.conflitos_campo_contato ? (
                  <div className={styles.warningNote}>
                    {formatarNumero(analise.conflitos_campo_contato)} e-mail(s)
                    possuem valores diferentes para{" "}
                    <strong>{"{{campo_contato}}"}</strong> entre as listas. Será
                    usado o valor da lista com maior prioridade.
                  </div>
                ) : null}
              </div>
            ) : null}

            {etapa === 3 ? (
              <div className={styles.wizardSection}>
                <div className={styles.personalizationHeader}>
                  <div>
                    <strong>Variáveis usadas no template</strong>
                    <span>
                      Confira como os dados serão resolvidos e defina valores
                      alternativos quando necessário.
                    </span>
                  </div>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => setModalVariaveis(true)}
                  >
                    <Settings2 size={16} />
                    Gerenciar variáveis
                  </button>
                </div>

                <div className={styles.personalizationGrid}>
                  <div className={styles.variablesConfigPanel}>
                    {chavesUsadas.length ? (
                      chavesUsadas.map((chave) => {
                        const catalogo = catalogoVariaveis.get(chave);
                        const valorAmostra = String(
                          variaveisAmostra[chave] ?? ""
                        );
                        const personalizada =
                          catalogo?.categoria === "Personalizada";

                        return (
                          <div
                            className={styles.variableConfigCard}
                            key={chave}
                          >
                            <div className={styles.variableConfigHeader}>
                              <div>
                                <strong>{"{{" + chave + "}}"}</strong>
                                <span>
                                  {catalogo?.descricao ||
                                    "Variável não cadastrada no catálogo."}
                                </span>
                              </div>
                              <em>
                                {personalizada
                                  ? "Personalizada"
                                  : "Contato"}
                              </em>
                            </div>

                            <div className={styles.variableSampleValue}>
                              <span>Valor na prévia</span>
                              <strong>
                                {valorAmostra || "Sem valor na amostra"}
                              </strong>
                            </div>

                            {!personalizada ? (
                              <label className={styles.field}>
                                <span>Se estiver vazio, usar</span>
                                <input
                                  value={fallbacks[chave] || ""}
                                  onChange={(event) =>
                                    setFallbacks((atual) => ({
                                      ...atual,
                                      [chave]: event.target.value,
                                    }))
                                  }
                                  placeholder="Valor alternativo opcional"
                                />
                              </label>
                            ) : null}
                          </div>
                        );
                      })
                    ) : (
                      <div className={styles.inlineMuted}>
                        Este template não utiliza variáveis.
                      </div>
                    )}
                  </div>

                </div>
              </div>
            ) : null}

            {etapa === 4 ? (
              <div className={styles.wizardSection}>
                <div className={styles.reviewHero}>
                  <div className={styles.reviewHeroIcon}>
                    <Sparkles size={21} />
                  </div>
                  <div className={styles.reviewHeroContent}>
                    <span>REVISÃO FINAL</span>
                    <strong>Sua campanha está pronta para ser programada</strong>
                    <small>
                      Confira os dados abaixo e escolha como deseja publicar.
                      Nada será enviado sem sua confirmação.
                    </small>
                  </div>
                  <div className={styles.reviewHeroMetric}>
                    <span>Destinatários finais</span>
                    <strong>{formatarNumero(analise?.elegiveis || 0)}</strong>
                  </div>
                </div>

                <div className={styles.reviewGrid}>
                  <section className={styles.reviewCard}>
                    <span>Campanha</span>
                    <strong>{nome}</strong>
                    <small>{assuntoPreview || assunto}</small>
                  </section>

                  <section className={styles.reviewCard}>
                    <span>Remetente</span>
                    <strong>{remetenteSelecionado?.nome || "—"}</strong>
                    <small>{remetenteSelecionado?.email || "—"}</small>
                  </section>

                  <section className={styles.reviewCard}>
                    <span>Público</span>
                    <strong>
                      {formatarNumero(analise?.elegiveis || 0)} destinatários
                    </strong>
                    <small>{resumoPublico || "—"}</small>
                  </section>

                  <section className={styles.reviewCard}>
                    <span>Deduplicação</span>
                    <strong>
                      {formatarNumero(analise?.duplicados || 0)} removidos
                    </strong>
                    <small>
                      E-mails repetidos recebem somente uma mensagem.
                    </small>
                  </section>
                </div>

                <div className={styles.audienceAnalysisGrid}>
                  <div>
                    <span>Encontrados</span>
                    <strong>
                      {formatarNumero(analise?.total_registros || 0)}
                    </strong>
                  </div>
                  <div>
                    <span>Únicos</span>
                    <strong>
                      {formatarNumero(analise?.emails_unicos || 0)}
                    </strong>
                  </div>
                  <div>
                    <span>Duplicados</span>
                    <strong>
                      {formatarNumero(analise?.duplicados || 0)}
                    </strong>
                  </div>
                  <div>
                    <span>Sem e-mail</span>
                    <strong>
                      {formatarNumero(analise?.sem_email_valido || 0)}
                    </strong>
                  </div>
                  <div>
                    <span>Suprimidos</span>
                    <strong>
                      {formatarNumero(analise?.suprimidos || 0)}
                    </strong>
                  </div>
                  <div className={styles.audienceAnalysisPrimary}>
                    <span>Total final</span>
                    <strong>
                      {formatarNumero(analise?.elegiveis || 0)}
                    </strong>
                  </div>
                </div>

                <div className={styles.guidanceNote}>
                  <AlertTriangle size={19} />
                  <div>
                    <strong>Escolha como deseja publicar a campanha</strong>
                    <span>
                      A campanha só será criada depois que você escolher uma
                      opção e confirmar a revisão final.
                    </span>
                  </div>
                </div>

                <div className={styles.sendDecisionPanel}>
                  <div className={styles.formSectionHeader}>
                    <div>
                      <strong>Quando enviar?</strong>
                      <span>
                        Escolha o envio imediato ou programe uma data e hora.
                      </span>
                    </div>
                  </div>

                  <div className={styles.sendChoiceGrid}>
                    <button
                      type="button"
                      className={
                        modoEnvio === "agora"
                          ? styles.sendChoiceActive
                          : styles.sendChoiceButton
                      }
                      onClick={() => {
                        setModoEnvio("agora");
                        setConfirmacaoFinal(false);
                        setAviso("");
                      }}
                    >
                      <span className={styles.sendChoiceIcon}>
                        <Send size={20} />
                      </span>
                      <span>
                        <strong>Enviar agora</strong>
                        <small>
                          A campanha entra na fila somente após a confirmação.
                        </small>
                      </span>
                      {modoEnvio === "agora" ? (
                        <Check size={18} className={styles.sendChoiceCheck} />
                      ) : null}
                    </button>

                    <button
                      type="button"
                      className={
                        modoEnvio === "agendar"
                          ? styles.sendChoiceActive
                          : styles.sendChoiceButton
                      }
                      onClick={() => {
                        setModoEnvio("agendar");
                        setConfirmacaoFinal(false);
                        setAviso("");
                      }}
                    >
                      <span className={styles.sendChoiceIcon}>
                        <CalendarClock size={20} />
                      </span>
                      <span>
                        <strong>Agendar envio</strong>
                        <small>
                          Defina o dia e o horário antes de confirmar.
                        </small>
                      </span>
                      {modoEnvio === "agendar" ? (
                        <Check size={18} className={styles.sendChoiceCheck} />
                      ) : null}
                    </button>
                  </div>

                  {modoEnvio === "agendar" ? (
                    <div className={styles.schedulePanel}>
                      <label className={styles.field}>
                        <span>Data e hora do envio</span>
                        <input
                          type="datetime-local"
                          value={agendadaPara}
                          onChange={(event) => {
                            setAgendadaPara(event.target.value);
                            setConfirmacaoFinal(false);
                          }}
                        />
                        <small>
                          O processamento começará a partir do horário
                          selecionado.
                        </small>
                      </label>
                    </div>
                  ) : null}
                </div>

                {modoEnvio ? (
                  <label className={styles.finalConfirmation}>
                    <input
                      type="checkbox"
                      checked={confirmacaoFinal}
                      onChange={(event) =>
                        setConfirmacaoFinal(event.target.checked)
                      }
                    />
                    <span className={styles.finalConfirmationBox}>
                      {confirmacaoFinal ? <Check size={14} /> : null}
                    </span>
                    <span className={styles.finalConfirmationText}>
                      <strong>
                        Confirmo que revisei a campanha e desejo{" "}
                        {modoEnvio === "agora"
                          ? "enviá-la agora"
                          : "agendá-la na data selecionada"}
                        .
                      </strong>
                      <small>
                        Esta é a confirmação final. Nenhum envio acontece antes
                        desta etapa.
                      </small>
                    </span>
                    <ShieldCheck size={21} />
                  </label>
                ) : null}

                <div className={styles.complianceNote}>
                  <AlertTriangle size={18} />
                  <div>
                    <strong>Boas práticas de envio</strong>
                    <span>
                      O CRM removerá automaticamente endereços duplicados,
                      descadastrados, bounces e reclamações antes do envio.
                      Envie somente para contatos com base legal ou autorização
                      compatível com a comunicação.
                    </span>
                  </div>
                </div>
              </div>
            ) : null}

            {aviso ? (
              <div className={styles.feedbackWarning}>
                <AlertTriangle size={18} />
                <span>{aviso}</span>
              </div>
            ) : null}

            {erro ? <div className={styles.feedbackError}>{erro}</div> : null}
            </div>

            <div className={styles.wizardFooter}>
              <div>
                {etapa > 1 ? (
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={voltar}
                    disabled={enviando}
                  >
                    <ChevronLeft size={16} />
                    Voltar
                  </button>
                ) : null}
              </div>

              <div className={styles.modalFooterActions}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={onClose}
                  disabled={enviando}
                >
                  Cancelar
                </button>

                {etapa < 4 ? (
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={avancar}
                    disabled={
                      enviando ||
                      (etapa === 2 && (analisando || !analise?.elegiveis))
                    }
                  >
                    Continuar
                    <ChevronRight size={16} />
                  </button>
                ) : (
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={() => void criar()}
                    disabled={
                      enviando ||
                      !analise?.elegiveis ||
                      !modoEnvio ||
                      !confirmacaoFinal
                    }
                  >
                    {modoEnvio === "agendar" ? (
                      <CalendarClock size={16} />
                    ) : (
                      <Send size={16} />
                    )}
                    {enviando
                      ? "Preparando campanha..."
                      : modoEnvio === "agora"
                        ? "Enviar campanha agora"
                        : modoEnvio === "agendar"
                          ? "Agendar campanha"
                          : "Escolha como enviar"}
                  </button>
                )}
              </div>
            </div>
          </form>
            </div>
          </div>
        </div>
      </div>

      <GerenciarVariaveisModal
        aberto={modalVariaveis}
        onClose={() => setModalVariaveis(false)}
        onAtualizadas={setVariaveisPersonalizadas}
      />
    </>
  );
}
