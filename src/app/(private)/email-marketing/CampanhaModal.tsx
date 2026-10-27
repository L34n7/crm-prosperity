"use client";

import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  Mail,
  Search,
  Send,
  Settings2,
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

  const [modoEnvio, setModoEnvio] = useState<"agora" | "agendar">("agora");
  const [agendadaPara, setAgendadaPara] = useState(datetimeLocalPadrao());
  const [enviando, setEnviando] = useState(false);
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

  const assuntoPreview = useMemo(
    () => renderizarVariaveis(assunto, variaveisAmostra, false),
    [assunto, variaveisAmostra]
  );

  const htmlPreview = useMemo(
    () =>
      renderizarVariaveis(
        String(templateSelecionado?.html || ""),
        variaveisAmostra,
        true
      ),
    [templateSelecionado, variaveisAmostra]
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
          setContatos(data.contatos || []);
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
    setErro("");

    if (etapa === 1) {
      if (!nome.trim() || !templateId || !remetenteId || !assunto.trim()) {
        setErro("Preencha nome, remetente, template e assunto.");
        return false;
      }
    }

    if (etapa === 2) {
      if (audienciaTipo === "listas" && !listaIds.length) {
        setErro("Selecione pelo menos uma lista.");
        return false;
      }

      if (audienciaTipo === "contatos" && !contatosSelecionados.size) {
        setErro("Selecione pelo menos um contato.");
        return false;
      }

      if (!analise || analise.elegiveis <= 0) {
        setErro("A audiência selecionada não possui e-mails elegíveis.");
        return false;
      }
    }

    return true;
  }

  function avancar() {
    if (!validarEtapaAtual()) return;
    setEtapa((atual) => Math.min(4, atual + 1));
  }

  function voltar() {
    setErro("");
    setEtapa((atual) => Math.max(1, atual - 1));
  }

  async function criar(event: FormEvent) {
    event.preventDefault();
    setErro("");

    if (etapa < 4) {
      avancar();
      return;
    }

    let agendamentoIso: string | null = null;

    if (modoEnvio === "agendar") {
      const data = new Date(agendadaPara);

      if (!Number.isFinite(data.getTime()) || data.getTime() <= Date.now()) {
        setErro("Escolha uma data futura para o agendamento.");
        return;
      }

      agendamentoIso = data.toISOString();
    }

    if (!analise || analise.elegiveis <= 0) {
      setErro("A audiência precisa ser analisada antes do envio.");
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
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className={styles.modalHeader}>
            <div>
              <p className={styles.sectionLabel}>NOVA CAMPANHA</p>
              <h2>Criar campanha de e-mail</h2>
              <p>
                Configure o conteúdo, escolha o público e revise a
                personalização antes de enviar.
              </p>
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
                <span>{item.id < etapa ? <Check size={14} /> : item.id}</span>
                <div>
                  <strong>{item.titulo}</strong>
                  <small>{item.subtitulo}</small>
                </div>
              </button>
            ))}
          </div>

          <form className={styles.modalBody} onSubmit={criar}>
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

                {templateSelecionado ? (
                  <div className={styles.templateInlinePreview}>
                    <div>
                      <FileText size={18} />
                      <span>
                        <strong>{templateSelecionado.nome}</strong>
                        <small>{templateSelecionado.assunto}</small>
                      </span>
                    </div>
                    <div className={styles.templateMiniFrame}>
                      <iframe
                        title="Prévia compacta do template"
                        sandbox=""
                        srcDoc={templateSelecionado.html}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {etapa === 2 ? (
              <div className={styles.wizardSection}>
                <div className={styles.formSectionHeader}>
                  <div>
                    <strong>Quem receberá a campanha?</strong>
                    <span>
                      Listas grandes são processadas no servidor; o navegador
                      não precisa carregar todos os contatos.
                    </span>
                  </div>
                  <span className={styles.audienceEstimate}>
                    {analisando
                      ? "Analisando..."
                      : formatarNumero(analise?.elegiveis || 0) + " elegíveis"}
                  </span>
                </div>

                <div className={styles.choiceGrid}>
                  <button
                    type="button"
                    className={
                      audienciaTipo === "todos"
                        ? styles.choiceActive
                        : styles.choiceButton
                    }
                    onClick={() => setAudienciaTipo("todos")}
                  >
                    <Users size={18} />
                    <strong>Todos com e-mail</strong>
                    <small>
                      {formatarNumero(totalContatosComEmail)} cadastrados
                    </small>
                  </button>

                  <button
                    type="button"
                    className={
                      audienciaTipo === "listas"
                        ? styles.choiceActive
                        : styles.choiceButton
                    }
                    onClick={() => setAudienciaTipo("listas")}
                  >
                    <FileText size={18} />
                    <strong>Uma ou mais listas</strong>
                    <small>
                      Une listas e remove e-mails repetidos automaticamente
                    </small>
                  </button>

                  <button
                    type="button"
                    className={
                      audienciaTipo === "contatos"
                        ? styles.choiceActive
                        : styles.choiceButton
                    }
                    onClick={() => setAudienciaTipo("contatos")}
                  >
                    <Mail size={18} />
                    <strong>Contatos específicos</strong>
                    <small>Seleção manual com busca e paginação</small>
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
                  <div className={styles.contactDualPicker}>
                    <div className={styles.contactPickerColumn}>
                      <div className={styles.contactPickerColumnHeader}>
                        <strong>Disponíveis</strong>
                        <span>{formatarNumero(totalBuscaContatos)}</span>
                      </div>

                      <label className={styles.searchBox}>
                        <Search size={17} />
                        <input
                          value={buscaContato}
                          onChange={(event) =>
                            setBuscaContato(event.target.value)
                          }
                          placeholder="Buscar nome, e-mail ou telefone"
                        />
                      </label>

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

                            return (
                              <button
                                key={contato.id}
                                type="button"
                                className={
                                  selecionado
                                    ? styles.contactResultSelected
                                    : styles.contactResult
                                }
                                onClick={() => alternarContato(contato)}
                              >
                                <span>
                                  <strong>{contato.nome || "Sem nome"}</strong>
                                  <small>{contato.email}</small>
                                </span>
                                {selecionado ? <Check size={17} /> : null}
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
                        <span>
                          {formatarNumero(contatosSelecionados.size)}
                        </span>
                      </div>

                      <div className={styles.selectedContactsList}>
                        {contatosSelecionados.size ? (
                          Array.from(contatosSelecionados.values())
                            .slice(0, 150)
                            .map((contato) => (
                              <button
                                key={contato.id}
                                type="button"
                                onClick={() => alternarContato(contato)}
                              >
                                <span>
                                  <strong>
                                    {contato.nome || "Sem nome"}
                                  </strong>
                                  <small>{contato.email}</small>
                                </span>
                                <X size={15} />
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

                      {contatosSelecionados.size ? (
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          onClick={() =>
                            setContatosSelecionados(new Map())
                          }
                        >
                          Remover todos
                        </button>
                      ) : null}
                    </div>
                  </div>
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

                  <div className={styles.campaignPreviewPanel}>
                    <div className={styles.campaignPreviewHeader}>
                      <div>
                        <span>Prévia com contato real</span>
                        <strong>
                          {String(analise?.amostra?.nome || "") ||
                            String(analise?.amostra?.email || "") ||
                            "Nenhuma amostra disponível"}
                        </strong>
                      </div>
                      <small>
                        A prévia usa um destinatário elegível da audiência.
                      </small>
                    </div>

                    <div className={styles.previewSubject}>
                      <span>Assunto</span>
                      <strong>{assuntoPreview || "Sem assunto"}</strong>
                    </div>

                    <iframe
                      title="Prévia personalizada da campanha"
                      sandbox=""
                      srcDoc={htmlPreview}
                    />
                  </div>
                </div>
              </div>
            ) : null}

            {etapa === 4 ? (
              <div className={styles.wizardSection}>
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

                <div className={styles.formSection}>
                  <div className={styles.formSectionHeader}>
                    <div>
                      <strong>Quando enviar</strong>
                      <span>Envie agora ou programe para uma data futura.</span>
                    </div>
                  </div>

                  <div className={styles.choiceGridTwo}>
                    <button
                      type="button"
                      className={
                        modoEnvio === "agora"
                          ? styles.choiceActive
                          : styles.choiceButton
                      }
                      onClick={() => setModoEnvio("agora")}
                    >
                      <Send size={18} />
                      <strong>Enviar agora</strong>
                      <small>Entrar na fila imediatamente</small>
                    </button>

                    <button
                      type="button"
                      className={
                        modoEnvio === "agendar"
                          ? styles.choiceActive
                          : styles.choiceButton
                      }
                      onClick={() => setModoEnvio("agendar")}
                    >
                      <CalendarClock size={18} />
                      <strong>Agendar</strong>
                      <small>Escolher data e hora</small>
                    </button>
                  </div>

                  {modoEnvio === "agendar" ? (
                    <label className={styles.field}>
                      <span>Data e hora</span>
                      <input
                        type="datetime-local"
                        value={agendadaPara}
                        onChange={(event) =>
                          setAgendadaPara(event.target.value)
                        }
                      />
                    </label>
                  ) : null}
                </div>

                <div className={styles.complianceNote}>
                  O CRM removerá automaticamente endereços duplicados,
                  descadastrados, bounces e reclamações antes do envio. Envie
                  somente para contatos para os quais exista base legal ou
                  autorização compatível com a comunicação.
                </div>
              </div>
            ) : null}

            {erro ? <div className={styles.feedbackError}>{erro}</div> : null}

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
                    type="submit"
                    className={styles.primaryButton}
                    disabled={enviando || !analise?.elegiveis}
                  >
                    <Send size={16} />
                    {enviando
                      ? "Preparando campanha..."
                      : modoEnvio === "agora"
                        ? "Confirmar e enviar"
                        : "Confirmar agendamento"}
                  </button>
                )}
              </div>
            </div>
          </form>
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
