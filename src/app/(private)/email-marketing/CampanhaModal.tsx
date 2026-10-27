"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  Check,
  FileText,
  Mail,
  Search,
  Send,
  Users,
  X,
} from "lucide-react";
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
};

type Props = {
  templates: EmailTemplateItem[];
  remetentes: EmailRemetenteItem[];
  listas: EmailListaAudiencia[];
  totalContatosComEmail: number;
  onClose: () => void;
  onCreated: () => void | Promise<void>;
};

function datetimeLocalPadrao() {
  const data = new Date(Date.now() + 60 * 60 * 1000);
  const local = new Date(data.getTime() - data.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
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

  const [nome, setNome] = useState("");
  const [templateId, setTemplateId] = useState(templateInicial?.id || "");
  const [assunto, setAssunto] = useState(templateInicial?.assunto || "");
  const [remetenteId, setRemetenteId] = useState(remetenteInicial?.id || "");
  const [audienciaTipo, setAudienciaTipo] = useState<
    "todos" | "lista" | "contatos"
  >("todos");
  const [listaId, setListaId] = useState(listas[0]?.id || "");
  const [buscaContato, setBuscaContato] = useState("");
  const [contatos, setContatos] = useState<ContatoBusca[]>([]);
  const [contatosSelecionados, setContatosSelecionados] = useState<
    Map<string, ContatoBusca>
  >(new Map());
  const [carregandoContatos, setCarregandoContatos] = useState(false);
  const [modoEnvio, setModoEnvio] = useState<"agora" | "agendar">("agora");
  const [agendadaPara, setAgendadaPara] = useState(datetimeLocalPadrao());
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  const templateSelecionado = useMemo(
    () => templates.find((item) => item.id === templateId) || null,
    [templateId, templates]
  );

  const listaSelecionada = useMemo(
    () => listas.find((item) => item.id === listaId) || null,
    [listaId, listas]
  );

  const estimativa =
    audienciaTipo === "todos"
      ? totalContatosComEmail
      : audienciaTipo === "lista"
        ? Number(listaSelecionada?.total_emails || 0)
        : contatosSelecionados.size;

  useEffect(() => {
    if (templateSelecionado) {
      setAssunto(templateSelecionado.assunto);
    }
  }, [templateId, templateSelecionado]);

  useEffect(() => {
    if (audienciaTipo !== "contatos") return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setCarregandoContatos(true);

      try {
        const response = await fetch(
          "/api/email-marketing/audiencia?limite=30&busca=" +
            encodeURIComponent(buscaContato),
          {
            cache: "no-store",
            signal: controller.signal,
          }
        );
        const data = await response.json();

        if (response.ok && data?.ok) {
          setContatos(data.contatos || []);
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
  }, [audienciaTipo, buscaContato]);

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

  async function criar(event: FormEvent) {
    event.preventDefault();
    setErro("");

    if (!templates.length) {
      setErro("Crie pelo menos um template antes da campanha.");
      return;
    }

    if (!nome.trim() || !templateId || !remetenteId || !assunto.trim()) {
      setErro("Preencha nome, template, remetente e assunto.");
      return;
    }

    if (audienciaTipo === "lista" && !listaId) {
      setErro("Selecione uma lista.");
      return;
    }

    if (audienciaTipo === "contatos" && !contatosSelecionados.size) {
      setErro("Selecione pelo menos um contato.");
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
          lista_id: audienciaTipo === "lista" ? listaId : null,
          contato_ids:
            audienciaTipo === "contatos"
              ? Array.from(contatosSelecionados.keys())
              : [],
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

  return (
    <div className={styles.modalOverlay} onMouseDown={onClose}>
      <div
        className={[styles.modalCard, styles.campaignModal].join(" ")}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <div>
            <p className={styles.sectionLabel}>NOVA CAMPANHA</p>
            <h2>Criar campanha de e-mail</h2>
            <p>
              Escolha conteúdo, público e horário. O envio será processado em
              fila e respeitará a lista de supressão.
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

        <form className={styles.modalBody} onSubmit={criar}>
          <div className={styles.formGridTwo}>
            <label className={styles.field}>
              <span>Nome da campanha</span>
              <input
                value={nome}
                onChange={(event) => setNome(event.target.value)}
                placeholder="Ex.: Convite outubro"
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
            <div className={styles.compactPreview}>
              <FileText size={17} />
              <div>
                <strong>{templateSelecionado.nome}</strong>
                <span>
                  O conteúdo será personalizado com as variáveis de cada
                  contato.
                </span>
              </div>
            </div>
          ) : null}

          <div className={styles.formSection}>
            <div className={styles.formSectionHeader}>
              <div>
                <strong>Público</strong>
                <span>Escolha quem receberá esta campanha.</span>
              </div>
              <span className={styles.audienceEstimate}>
                {estimativa} e-mail(s)
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
                <small>{totalContatosComEmail} contatos disponíveis</small>
              </button>

              <button
                type="button"
                className={
                  audienciaTipo === "lista"
                    ? styles.choiceActive
                    : styles.choiceButton
                }
                onClick={() => setAudienciaTipo("lista")}
              >
                <FileText size={18} />
                <strong>Lista</strong>
                <small>Usar uma lista já cadastrada</small>
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
                <strong>Contatos</strong>
                <small>Selecionar pessoas específicas</small>
              </button>
            </div>

            {audienciaTipo === "lista" ? (
              <label className={styles.field}>
                <span>Lista de contatos</span>
                <select
                  value={listaId}
                  onChange={(event) => setListaId(event.target.value)}
                >
                  <option value="">Selecione</option>
                  {listas.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nome +
                        " — " +
                        item.total_emails +
                        " com e-mail"}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {audienciaTipo === "contatos" ? (
              <div className={styles.contactPicker}>
                <label className={styles.searchBox}>
                  <Search size={17} />
                  <input
                    value={buscaContato}
                    onChange={(event) => setBuscaContato(event.target.value)}
                    placeholder="Buscar por nome, e-mail ou telefone"
                  />
                </label>

                {contatosSelecionados.size ? (
                  <div className={styles.selectedContacts}>
                    {Array.from(contatosSelecionados.values()).map((contato) => (
                      <button
                        key={contato.id}
                        type="button"
                        onClick={() => alternarContato(contato)}
                        title="Remover"
                      >
                        {contato.nome || contato.email}
                        <X size={13} />
                      </button>
                    ))}
                  </div>
                ) : null}

                <div className={styles.contactResults}>
                  {carregandoContatos ? (
                    <div className={styles.inlineMuted}>Buscando contatos...</div>
                  ) : contatos.length ? (
                    contatos.map((contato) => {
                      const selecionado = contatosSelecionados.has(contato.id);

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
                      Nenhum contato com e-mail encontrado.
                    </div>
                  )}
                </div>
              </div>
            ) : null}
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
                  onChange={(event) => setAgendadaPara(event.target.value)}
                />
              </label>
            ) : null}
          </div>

          <div className={styles.campaignSummary}>
            <div>
              <span>Destinatários estimados</span>
              <strong>{estimativa}</strong>
            </div>
            <div>
              <span>Envio</span>
              <strong>{modoEnvio === "agora" ? "Agora" : "Agendado"}</strong>
            </div>
            <div>
              <span>Descadastro</span>
              <strong>Automático</strong>
            </div>
          </div>

          <div className={styles.complianceNote}>
            Envie apenas para contatos para os quais sua empresa possui base
            legal ou autorização compatível com a comunicação. Endereços
            suprimidos serão removidos automaticamente.
          </div>

          {erro ? <div className={styles.feedbackError}>{erro}</div> : null}

          <div className={styles.modalFooter}>
            <span />
            <div className={styles.modalFooterActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={onClose}
                disabled={enviando}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className={styles.primaryButton}
                disabled={enviando || estimativa <= 0 || !templates.length}
              >
                <Send size={16} />
                {enviando
                  ? "Preparando..."
                  : modoEnvio === "agora"
                    ? "Criar e enviar"
                    : "Agendar campanha"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
