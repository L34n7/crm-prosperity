"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreVertical, Pencil, Plus, Trash2, X } from "lucide-react";
import { useSearchParams } from "next/navigation";

import styles from "./conversas.module.css";
import timelineStyles from "./ConversationNotesTimeline.module.css";
import {
  formatarDataCompleta,
  type NotaConversa,
} from "./conversation-shared";

const LIMITE_CARACTERES_NOTA = 600;
const HOST_ATTRIBUTE = "data-conversation-notes-timeline-host";
const HIDDEN_ATTRIBUTE = "data-conversation-notes-legacy-hidden";
const PREVIOUS_DISPLAY_ATTRIBUTE = "data-conversation-notes-previous-display";

type ApiResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
  notas?: NotaConversa[];
};

function restaurarConteudoLegado() {
  document.querySelectorAll<HTMLElement>(`[${HIDDEN_ATTRIBUTE}="true"]`).forEach((elemento) => {
    const displayAnterior = elemento.getAttribute(PREVIOUS_DISPLAY_ATTRIBUTE);
    elemento.style.display = displayAnterior ?? "";
    elemento.removeAttribute(HIDDEN_ATTRIBUTE);
    elemento.removeAttribute(PREVIOUS_DISPLAY_ATTRIBUTE);
  });
}

function localizarCorpoPainelNotas() {
  const titulos = Array.from(
    document.getElementsByClassName(styles.rightPanelTitle)
  ) as HTMLElement[];

  const tituloNotas = titulos.find(
    (titulo) => titulo.textContent?.trim().toLocaleLowerCase("pt-BR") === "notas"
  );

  if (!tituloNotas) return null;

  const painel = tituloNotas.closest(`.${styles.rightPanel}`);
  if (!painel) return null;

  return painel.getElementsByClassName(styles.rightPanelBody)[0] as HTMLElement | undefined;
}

export default function ConversationNotesTimelineBridge() {
  const searchParams = useSearchParams();
  const conversaId = searchParams.get("id") || searchParams.get("conversaId") || "";

  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const [painelNotasAtivo, setPainelNotasAtivo] = useState(false);
  const [notas, setNotas] = useState<NotaConversa[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [composerAberto, setComposerAberto] = useState(false);
  const [novaNota, setNovaNota] = useState("");
  const [menuAbertoId, setMenuAbertoId] = useState<string | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [textoEdicao, setTextoEdicao] = useState("");
  const [confirmandoExclusaoId, setConfirmandoExclusaoId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const notasOrdenadas = useMemo(
    () =>
      [...notas].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ),
    [notas]
  );

  useEffect(() => {
    let frame = 0;
    let hostAtual: HTMLElement | null = null;

    const sincronizar = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const corpo = localizarCorpoPainelNotas();

        if (!corpo) {
          restaurarConteudoLegado();
          hostAtual?.remove();
          hostAtual = null;
          setPortalHost(null);
          setPainelNotasAtivo(false);
          return;
        }

        let host = corpo.querySelector<HTMLElement>(`[${HOST_ATTRIBUTE}="true"]`);

        if (!host) {
          host = document.createElement("div");
          host.setAttribute(HOST_ATTRIBUTE, "true");
          host.className = timelineStyles.portalHost;
          corpo.appendChild(host);
        }

        Array.from(corpo.children).forEach((filho) => {
          if (!(filho instanceof HTMLElement) || filho === host) return;
          if (filho.getAttribute(HIDDEN_ATTRIBUTE) === "true") return;

          filho.setAttribute(PREVIOUS_DISPLAY_ATTRIBUTE, filho.style.display || "");
          filho.setAttribute(HIDDEN_ATTRIBUTE, "true");
          filho.style.display = "none";
        });

        if (hostAtual && hostAtual !== host) hostAtual.remove();
        hostAtual = host;
        setPortalHost((atual) => (atual === host ? atual : host));
        setPainelNotasAtivo(true);
      });
    };

    sincronizar();

    const observer = new MutationObserver(sincronizar);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
      restaurarConteudoLegado();
      hostAtual?.remove();
    };
  }, []);

  useEffect(() => {
    setNotas([]);
    setErro("");
    setSucesso("");
    setComposerAberto(false);
    setNovaNota("");
    setMenuAbertoId(null);
    setEditandoId(null);
    setTextoEdicao("");
    setConfirmandoExclusaoId(null);
  }, [conversaId]);

  useEffect(() => {
    if (!menuAbertoId) return;

    const fecharMenu = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      setMenuAbertoId(null);
    };

    document.addEventListener("pointerdown", fecharMenu);
    return () => document.removeEventListener("pointerdown", fecharMenu);
  }, [menuAbertoId]);

  const carregarNotas = useCallback(async () => {
    if (!conversaId || !painelNotasAtivo) return;

    try {
      setCarregando(true);
      setErro("");

      const resposta = await fetch(
        `/api/conversas/${encodeURIComponent(conversaId)}/notas`,
        { cache: "no-store" }
      );
      const data = (await resposta.json().catch(() => ({}))) as ApiResponse;

      if (!resposta.ok || data.ok === false) {
        throw new Error(data.error || "Não foi possível carregar as notas.");
      }

      setNotas(Array.isArray(data.notas) ? data.notas : []);
    } catch (error) {
      setNotas([]);
      setErro(
        error instanceof Error ? error.message : "Não foi possível carregar as notas."
      );
    } finally {
      setCarregando(false);
    }
  }, [conversaId, painelNotasAtivo]);

  useEffect(() => {
    void carregarNotas();
  }, [carregarNotas]);

  async function criarNota() {
    const conteudo = novaNota.trim();
    if (!conversaId || !conteudo || salvando) return;

    try {
      setSalvando(true);
      setErro("");
      setSucesso("");

      const resposta = await fetch(
        `/api/conversas/${encodeURIComponent(conversaId)}/notas`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Origem-Modulo": "conversas",
          },
          body: JSON.stringify({ conteudo }),
        }
      );
      const data = (await resposta.json().catch(() => ({}))) as ApiResponse;

      if (!resposta.ok || data.ok === false) {
        throw new Error(data.error || "Não foi possível criar a nota.");
      }

      setNovaNota("");
      setComposerAberto(false);
      setSucesso(data.message || "Nota criada com sucesso.");
      await carregarNotas();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível criar a nota.");
    } finally {
      setSalvando(false);
    }
  }

  function iniciarEdicao(nota: NotaConversa) {
    setMenuAbertoId(null);
    setConfirmandoExclusaoId(null);
    setEditandoId(nota.id);
    setTextoEdicao(nota.conteudo);
    setErro("");
    setSucesso("");
  }

  async function salvarEdicao(notaId: string) {
    const conteudo = textoEdicao.trim();
    if (!conversaId || !conteudo || salvando) return;

    try {
      setSalvando(true);
      setErro("");
      setSucesso("");

      const resposta = await fetch(
        `/api/conversas/${encodeURIComponent(conversaId)}/notas`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "X-Origem-Modulo": "conversas",
          },
          body: JSON.stringify({ nota_id: notaId, conteudo }),
        }
      );
      const data = (await resposta.json().catch(() => ({}))) as ApiResponse;

      if (!resposta.ok || data.ok === false) {
        throw new Error(data.error || "Não foi possível atualizar a nota.");
      }

      setEditandoId(null);
      setTextoEdicao("");
      setSucesso(data.message || "Nota atualizada com sucesso.");
      await carregarNotas();
    } catch (error) {
      setErro(
        error instanceof Error ? error.message : "Não foi possível atualizar a nota."
      );
    } finally {
      setSalvando(false);
    }
  }

  async function excluirNota(notaId: string) {
    if (!conversaId || salvando) return;

    try {
      setSalvando(true);
      setErro("");
      setSucesso("");

      const resposta = await fetch(
        `/api/conversas/${encodeURIComponent(conversaId)}/notas`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            "X-Origem-Modulo": "conversas",
          },
          body: JSON.stringify({ nota_id: notaId }),
        }
      );
      const data = (await resposta.json().catch(() => ({}))) as ApiResponse;

      if (!resposta.ok || data.ok === false) {
        throw new Error(data.error || "Não foi possível excluir a nota.");
      }

      setConfirmandoExclusaoId(null);
      setMenuAbertoId(null);
      setSucesso(data.message || "Nota excluída com sucesso.");
      await carregarNotas();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível excluir a nota.");
    } finally {
      setSalvando(false);
    }
  }

  if (!portalHost || !painelNotasAtivo || !conversaId) return null;

  return createPortal(
    <div className={timelineStyles.wrapper}>
      <div className={timelineStyles.topbar}>
        <div>
          <strong className={timelineStyles.title}>Linha do tempo</strong>
          <span className={timelineStyles.subtitle}>
            {notas.length === 0
              ? "Nenhuma nota registrada"
              : `${notas.length} ${notas.length === 1 ? "nota registrada" : "notas registradas"}`}
          </span>
        </div>

        <button
          type="button"
          className={timelineStyles.createButton}
          onClick={() => {
            setComposerAberto((aberto) => !aberto);
            setMenuAbertoId(null);
            setConfirmandoExclusaoId(null);
            setEditandoId(null);
            setTextoEdicao("");
            if (composerAberto) setNovaNota("");
          }}
        >
          {composerAberto ? <X size={16} /> : <Plus size={16} />}
          {composerAberto ? "Fechar" : "Criar nota"}
        </button>
      </div>

      {composerAberto && (
        <section className={timelineStyles.composer}>
          <div className={timelineStyles.composerHeader}>
            <label htmlFor="conversation-note-new">Nova nota interna</label>
            <span>{novaNota.length}/{LIMITE_CARACTERES_NOTA}</span>
          </div>

          <textarea
            id="conversation-note-new"
            value={novaNota}
            onChange={(event) => setNovaNota(event.target.value)}
            maxLength={LIMITE_CARACTERES_NOTA}
            rows={5}
            placeholder="Digite uma observação interna sobre esta conversa"
            autoFocus
          />

          <div className={timelineStyles.composerActions}>
            <button
              type="button"
              className={timelineStyles.secondaryButton}
              disabled={salvando}
              onClick={() => {
                setNovaNota("");
                setComposerAberto(false);
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              className={timelineStyles.primaryButton}
              disabled={salvando || !novaNota.trim()}
              onClick={() => void criarNota()}
            >
              {salvando ? "Salvando..." : "Salvar nota"}
            </button>
          </div>
        </section>
      )}

      {erro && <div className={timelineStyles.feedbackError}>{erro}</div>}
      {sucesso && <div className={timelineStyles.feedbackSuccess}>{sucesso}</div>}

      {carregando ? (
        <div className={timelineStyles.emptyState}>Carregando notas...</div>
      ) : notasOrdenadas.length === 0 ? (
        <div className={timelineStyles.emptyState}>
          Nenhuma nota cadastrada para esta conversa ainda.
        </div>
      ) : (
        <div className={timelineStyles.timeline}>
          {notasOrdenadas.map((nota) => {
            const editando = editandoId === nota.id;
            const menuAberto = menuAbertoId === nota.id;
            const confirmandoExclusao = confirmandoExclusaoId === nota.id;
            const foiEditada = Boolean(
              nota.updated_at && nota.updated_at !== nota.created_at
            );

            return (
              <article key={nota.id} className={timelineStyles.timelineItem}>
                <span className={timelineStyles.timelineDot} aria-hidden="true" />

                <div className={timelineStyles.noteCard}>
                  {editando ? (
                    <>
                      <div className={timelineStyles.editHeader}>
                        <strong>Editar nota</strong>
                        <span>{textoEdicao.length}/{LIMITE_CARACTERES_NOTA}</span>
                      </div>

                      <textarea
                        value={textoEdicao}
                        onChange={(event) => setTextoEdicao(event.target.value)}
                        maxLength={LIMITE_CARACTERES_NOTA}
                        rows={5}
                        autoFocus
                      />

                      <div className={timelineStyles.composerActions}>
                        <button
                          type="button"
                          className={timelineStyles.secondaryButton}
                          disabled={salvando}
                          onClick={() => {
                            setEditandoId(null);
                            setTextoEdicao("");
                          }}
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          className={timelineStyles.primaryButton}
                          disabled={salvando || !textoEdicao.trim()}
                          onClick={() => void salvarEdicao(nota.id)}
                        >
                          {salvando ? "Salvando..." : "Salvar"}
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className={timelineStyles.noteHeader}>
                        <div className={timelineStyles.noteMeta}>
                          <strong>{nota.autor?.nome || "Usuário"}</strong>
                          <span>
                            {formatarDataCompleta(nota.created_at)}
                            {foiEditada ? " • editada" : ""}
                          </span>
                        </div>

                        <div
                          className={timelineStyles.menuWrap}
                          ref={menuAberto ? menuRef : undefined}
                        >
                          <button
                            type="button"
                            className={timelineStyles.moreButton}
                            aria-label="Opções da nota"
                            aria-expanded={menuAberto}
                            onClick={() => {
                              setMenuAbertoId(menuAberto ? null : nota.id);
                              setConfirmandoExclusaoId(null);
                            }}
                          >
                            <MoreVertical size={18} />
                          </button>

                          {menuAberto && (
                            <div className={timelineStyles.menu} role="menu">
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => iniciarEdicao(nota)}
                              >
                                <Pencil size={14} />
                                Editar
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                className={timelineStyles.menuDanger}
                                onClick={() => {
                                  setMenuAbertoId(null);
                                  setConfirmandoExclusaoId(nota.id);
                                }}
                              >
                                <Trash2 size={14} />
                                Excluir
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      <p className={timelineStyles.noteText}>{nota.conteudo}</p>

                      {confirmandoExclusao && (
                        <div className={timelineStyles.deleteConfirm}>
                          <p>Tem certeza que deseja excluir esta nota?</p>
                          <div className={timelineStyles.composerActions}>
                            <button
                              type="button"
                              className={timelineStyles.secondaryButton}
                              disabled={salvando}
                              onClick={() => setConfirmandoExclusaoId(null)}
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              className={timelineStyles.dangerButton}
                              disabled={salvando}
                              onClick={() => void excluirNota(nota.id)}
                            >
                              {salvando ? "Excluindo..." : "Excluir"}
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>,
    portalHost
  );
}
