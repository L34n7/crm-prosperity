"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
  if (status === "cancelado") return `${styles.badge} ${styles.badgeGray}`;
  if (status === "erro") return `${styles.badge} ${styles.badgeRed}`;
  return `${styles.badge} ${styles.badgeGray}`;
}

function envioStatusClass(status?: string | null) {
  if (status === "falha") return `${styles.badge} ${styles.badgeRed}`;
  if (status === "sucesso") return `${styles.badge} ${styles.badgeGreen}`;
  if (status === "processando") return `${styles.badge} ${styles.badgeBlue}`;
  return `${styles.badge} ${styles.badgeGray}`;
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

  const buttons = templatePayload.components.find(
    (item: any) => item.type === "BUTTONS"
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

  const quickReplies =
    buttons?.buttons
      ?.filter((button: any) => button?.type === "QUICK_REPLY")
      ?.map((button: any) => button.text)
      ?.filter(Boolean) || [];

  if (quickReplies.length > 0) {
    partes.push(
      `Botões:\n${quickReplies
        .map((item: string, index: number) => `${index + 1}. ${item}`)
        .join("\n")}`
    );
  }

  return partes.join("\n\n").trim() || "Não foi possível gerar a prévia do template.";
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

  useEffect(() => {
    carregarDisparos();
  }, [filtroStatus]);

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
            </div>
          </header>

          {(erro || sucesso) && (
            <div className={styles.alertArea}>
              {erro && <div className={styles.errorAlert}>{erro}</div>}
              {sucesso && <div className={styles.successAlert}>{sucesso}</div>}
            </div>
          )}

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

                            {disparo.envio_status ? (
                              <span className={envioStatusClass(disparo.envio_status)}>
                                {disparo.envio_label || "Status do envio"}
                              </span>
                            ) : null}
                          </div>

                          <p className={styles.disparoMeta}>
                            Número: <strong>{numero}</strong>
                          </p>

                          <p className={styles.disparoMeta}>
                            Fluxo: {fluxoNome} · Bloco: {blocoTitulo}
                          </p>

                          {disparo.envio_status === "falha" && disparo.envio_erro_amigavel ? (
                            <div className={styles.envioErroBox}>
                              <strong>Falha no envio</strong>
                              <p>{disparo.envio_erro_amigavel}</p>

                              {disparo.envio_erro_tecnico ? (
                                <small>Detalhe técnico: {disparo.envio_erro_tecnico}</small>
                              ) : null}
                            </div>
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

            <div className={styles.detailsBody}>
              <div className={styles.detailGroup}>
                <span>Status</span>
                <strong className={statusClass(disparoSelecionado.status)}>
                  {statusLabel(disparoSelecionado.status)}
                </strong>
              </div>

              <div className={styles.detailGroup}>
                <span>Status do envio WhatsApp</span>
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

              <div className={styles.detailGroup}>
                <span>Número</span>
                <strong>{disparoSelecionado.payload_json?.numero_destino || "-"}</strong>
              </div>

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

              {disparoSelecionado.envio_status === "falha" &&
                disparoSelecionado.envio_erro_amigavel ? (
                <div className={styles.envioErroBox}>
                  <strong>Falha no envio</strong>
                  <p>{disparoSelecionado.envio_erro_amigavel}</p>

                  {disparoSelecionado.envio_erro_tecnico ? (
                    <small>
                      Detalhe técnico: {disparoSelecionado.envio_erro_tecnico}
                    </small>
                  ) : null}
                </div>
              ) : null}

              <div className={styles.payloadBox}>
                <span>Prévia do template</span>

                <pre>
                  {renderizarTextoTemplate(disparoSelecionado.payload_json || {})}
                </pre>
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
            </div>
          </aside>
        )}

        {disparoParaCancelar && (
          <div className={styles.modalOverlay}>
            <div className={styles.modalCard}>
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
                  <strong>Esse disparo não será enviado.</strong>
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