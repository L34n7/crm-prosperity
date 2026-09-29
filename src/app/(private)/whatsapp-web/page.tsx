"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  CircleAlert,
  Laptop2,
  Loader2,
  MessageCircle,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Square,
  Wifi,
  WifiOff,
} from "lucide-react";
import Header from "@/components/Header";
import styles from "./page.module.css";

type AgentStatus = {
  ok: boolean;
  browserOpen: boolean;
  whatsappConnected: boolean;
  currentChat: string | null;
  prepared: boolean;
};

type Prepared = {
  ok: boolean;
  confirmationId: string;
  group: string;
  preparedAt: string;
};

type QueueState = "pending" | "ready" | "sent" | "error";
type QueueItem = { group: string; status: QueueState; error?: string };

const AGENT_URL =
  process.env.NEXT_PUBLIC_WHATSAPP_WEB_AGENT_URL || "http://127.0.0.1:3784";
const TOKEN_KEY = "prosperity-whatsapp-web-agent-token";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function WhatsappWebLocalPage() {
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [groups, setGroups] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [queueIndex, setQueueIndex] = useState(-1);
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [busy, setBusy] = useState("");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (!term) return groups;
    return groups.filter((group) =>
      group.toLocaleLowerCase("pt-BR").includes(term),
    );
  }, [groups, search]);

  const activeQueue = queue.length > 0;
  const currentItem = queueIndex >= 0 ? queue[queueIndex] : null;

  useEffect(() => {
    setToken(window.localStorage.getItem(TOKEN_KEY) || "");
  }, []);

  useEffect(() => {
    if (!token.trim()) return;
    const timer = window.setInterval(() => void refreshStatus(false), 5000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function agentRequest<T>(path: string, init?: RequestInit): Promise<T> {
    const cleanToken = token.trim();
    if (!cleanToken) throw new Error("Informe o token do agente local.");

    const response = await fetch(AGENT_URL + path, {
      ...init,
      mode: "cors",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "X-Prosperity-Agent-Token": cleanToken,
        ...(init?.headers || {}),
      },
    });

    const body = (await response.json().catch(() => null)) as
      | (T & { error?: string })
      | null;

    if (!response.ok) {
      throw new Error(body?.error || "Falha ao acessar o agente local.");
    }
    if (!body) throw new Error("Resposta inválida do agente local.");
    return body;
  }

  function clearFeedback() {
    setFeedback("");
    setError("");
  }

  function saveToken(value: string) {
    setToken(value);
    window.localStorage.setItem(TOKEN_KEY, value.trim());
  }

  async function refreshStatus(showFeedback = true) {
    if (!token.trim()) return;
    if (showFeedback) clearFeedback();
    setBusy("status");

    try {
      const next = await agentRequest<AgentStatus>("/status");
      setStatus(next);
      if (showFeedback) setFeedback("Agente local localizado.");
    } catch (nextError) {
      setStatus(null);
      if (showFeedback) {
        setError(
          errorMessage(
            nextError,
            "Não foi possível acessar o agente local nesta máquina.",
          ),
        );
      }
    } finally {
      setBusy("");
    }
  }

  async function openBrowser() {
    clearFeedback();
    setBusy("browser");
    try {
      const next = await agentRequest<AgentStatus>("/browser/start", {
        method: "POST",
        body: "{}",
      });
      setStatus(next);
      setFeedback(
        next.whatsappConnected
          ? "WhatsApp Web já está conectado."
          : "Navegador aberto. Faça a leitura do QR Code.",
      );
    } catch (nextError) {
      setError(errorMessage(nextError, "Não foi possível abrir o navegador."));
    } finally {
      setBusy("");
    }
  }

  async function loadGroups() {
    clearFeedback();
    setBusy("groups");
    try {
      const response = await agentRequest<{ ok: boolean; groups: string[] }>(
        "/groups",
      );
      setGroups(response.groups);
      setSelected((current) =>
        current.filter((group) => response.groups.includes(group)),
      );
      setFeedback(response.groups.length + " grupo(s) encontrado(s).");
      void refreshStatus(false);
    } catch (nextError) {
      setError(errorMessage(nextError, "Não foi possível ler os grupos."));
    } finally {
      setBusy("");
    }
  }

  function toggleGroup(group: string) {
    if (activeQueue) return;
    setSelected((current) =>
      current.includes(group)
        ? current.filter((item) => item !== group)
        : [...current, group],
    );
  }

  async function prepareGroup(group: string, index: number) {
    setBusy("prepare");
    setPrepared(null);
    setQueueIndex(index);

    try {
      const next = await agentRequest<Prepared>("/messages/prepare", {
        method: "POST",
        body: JSON.stringify({ group, message }),
      });
      setPrepared(next);
      setQueue((current) =>
        current.map((item, itemIndex) =>
          itemIndex === index ? { ...item, status: "ready" } : item,
        ),
      );
      setFeedback("Mensagem preparada em “" + group + "”. Revise no navegador.");
    } catch (nextError) {
      const text = errorMessage(nextError, "Falha ao preparar a mensagem.");
      setQueue((current) =>
        current.map((item, itemIndex) =>
          itemIndex === index
            ? { ...item, status: "error", error: text }
            : item,
        ),
      );
      setError(text);
    } finally {
      setBusy("");
    }
  }

  async function startQueue() {
    clearFeedback();

    if (!status?.whatsappConnected) {
      setError("Conecte o WhatsApp Web primeiro.");
      return;
    }
    if (!selected.length) {
      setError("Selecione pelo menos um grupo.");
      return;
    }
    if (!message.trim()) {
      setError("Digite a mensagem.");
      return;
    }

    const nextQueue: QueueItem[] = selected.map((group) => ({
      group,
      status: "pending",
    }));
    setQueue(nextQueue);
    await prepareGroup(nextQueue[0].group, 0);
  }

  async function sendAndAdvance() {
    if (!prepared || queueIndex < 0) return;
    clearFeedback();
    setBusy("send");

    try {
      await agentRequest("/messages/send", {
        method: "POST",
        body: JSON.stringify({ confirmationId: prepared.confirmationId }),
      });

      setQueue((current) =>
        current.map((item, index) =>
          index === queueIndex ? { ...item, status: "sent" } : item,
        ),
      );

      const sentGroup = prepared.group;
      const nextIndex = queueIndex + 1;
      setPrepared(null);

      if (nextIndex < queue.length) {
        setFeedback("Enviado para “" + sentGroup + "”. Preparando o próximo.");
        await prepareGroup(queue[nextIndex].group, nextIndex);
      } else {
        setQueueIndex(-1);
        setFeedback("Sequência concluída.");
      }
    } catch (nextError) {
      setError(errorMessage(nextError, "Não foi possível enviar a mensagem."));
    } finally {
      setBusy("");
    }
  }

  async function cancelQueue() {
    clearFeedback();
    try {
      if (prepared) {
        await agentRequest("/messages/cancel", {
          method: "POST",
          body: JSON.stringify({ confirmationId: prepared.confirmationId }),
        });
      }
    } catch {}

    setPrepared(null);
    setQueue([]);
    setQueueIndex(-1);
    setFeedback("Sequência cancelada.");
  }

  return (
    <>
      <Header
        title="WhatsApp Web local"
        subtitle="Conecte o navegador desta máquina, leia seus grupos e prepare envios controlados."
      />

      <main className={styles.page}>
        <section className={styles.notice}>
          <ShieldCheck size={20} />
          <div>
            <strong>Execução local</strong>
            <p>
              A sessão fica no computador do operador. O agente prepara cada
              mensagem e exige confirmação antes do envio.
            </p>
          </div>
        </section>

        {(feedback || error) && (
          <div className={error ? styles.error : styles.success}>
            {error ? <CircleAlert size={17} /> : <CheckCircle2 size={17} />}
            <span>{error || feedback}</span>
          </div>
        )}

        <section className={styles.connection}>
          <div className={styles.sectionTitle}>
            <div>
              <span>1. Agente local</span>
              <h2>Conectar esta máquina</h2>
            </div>
            <div
              className={
                styles.badge +
                " " +
                (status?.whatsappConnected
                  ? styles.connected
                  : status?.browserOpen
                    ? styles.waiting
                    : styles.offline)
              }
            >
              {status?.whatsappConnected ? (
                <Wifi size={15} />
              ) : status?.browserOpen ? (
                <Laptop2 size={15} />
              ) : (
                <WifiOff size={15} />
              )}
              {status?.whatsappConnected
                ? "WhatsApp conectado"
                : status?.browserOpen
                  ? "Aguardando QR Code"
                  : "Não verificado"}
            </div>
          </div>

          <div className={styles.tokenRow}>
            <label>
              <span>Token local</span>
              <input
                type="password"
                value={token}
                onChange={(event) => saveToken(event.target.value)}
                placeholder="Cole o token exibido no terminal"
                disabled={activeQueue}
              />
            </label>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => void refreshStatus()}
              disabled={!token.trim() || busy === "status"}
            >
              {busy === "status" ? (
                <Loader2 className={styles.spin} size={16} />
              ) : (
                <RefreshCw size={16} />
              )}
              Verificar
            </button>
            <button
              type="button"
              className={styles.primary}
              onClick={() => void openBrowser()}
              disabled={!token.trim() || busy === "browser"}
            >
              {busy === "browser" ? (
                <Loader2 className={styles.spin} size={16} />
              ) : (
                <MessageCircle size={16} />
              )}
              Abrir WhatsApp Web
            </button>
          </div>
        </section>

        <div className={styles.grid}>
          <section className={styles.card}>
            <div className={styles.sectionTitle}>
              <div>
                <span>2. Grupos</span>
                <h2>Grupos encontrados</h2>
              </div>
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => void loadGroups()}
                disabled={!status?.whatsappConnected || busy === "groups" || activeQueue}
                title="Atualizar grupos"
              >
                {busy === "groups" ? (
                  <Loader2 className={styles.spin} size={17} />
                ) : (
                  <RefreshCw size={17} />
                )}
              </button>
            </div>

            <div className={styles.search}>
              <Search size={16} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar grupo"
              />
              <small>{groups.length}</small>
            </div>

            <div className={styles.selectionBar}>
              <button
                type="button"
                onClick={() => setSelected(filtered)}
                disabled={!filtered.length || activeQueue}
              >
                Selecionar visíveis
              </button>
              <button
                type="button"
                onClick={() => setSelected([])}
                disabled={!selected.length || activeQueue}
              >
                Limpar
              </button>
              <span>{selected.length} selecionado(s)</span>
            </div>

            <div className={styles.groupList}>
              {!filtered.length ? (
                <div className={styles.empty}>
                  <MessageCircle size={28} />
                  <strong>Nenhum grupo carregado</strong>
                  <span>Conecte o WhatsApp e atualize a lista.</span>
                </div>
              ) : (
                filtered.map((group) => {
                  const checked = selected.includes(group);
                  return (
                    <button
                      type="button"
                      key={group}
                      className={
                        styles.groupRow +
                        (checked ? " " + styles.groupSelected : "")
                      }
                      onClick={() => toggleGroup(group)}
                      disabled={activeQueue}
                    >
                      <span className={styles.check}>
                        {checked && <CheckCircle2 size={16} />}
                      </span>
                      <span className={styles.avatar}>
                        {group.slice(0, 1).toUpperCase()}
                      </span>
                      <span>{group}</span>
                    </button>
                  );
                })
              )}
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.sectionTitle}>
              <div>
                <span>3. Mensagem</span>
                <h2>Sequência controlada</h2>
              </div>
            </div>

            <label className={styles.message}>
              <span>Mensagem</span>
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Digite a mensagem..."
                maxLength={8000}
                disabled={activeQueue}
              />
              <small>{message.length}/8000</small>
            </label>

            {queue.length > 0 && (
              <div className={styles.queue}>
                {queue.map((item, index) => (
                  <div
                    key={item.group + index}
                    className={
                      styles.queueItem +
                      (index === queueIndex ? " " + styles.current : "")
                    }
                  >
                    <b>{index + 1}</b>
                    <div>
                      <strong>{item.group}</strong>
                      <span>
                        {item.status === "sent"
                          ? "Enviado"
                          : item.status === "ready"
                            ? "Preparado no navegador"
                            : item.status === "error"
                              ? item.error || "Erro"
                              : "Aguardando"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className={styles.actions}>
              {!queue.length ? (
                <button
                  type="button"
                  className={styles.primary}
                  onClick={() => void startQueue()}
                  disabled={
                    !selected.length ||
                    !message.trim() ||
                    !status?.whatsappConnected ||
                    busy === "prepare"
                  }
                >
                  <Send size={16} />
                  Preparar sequência
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className={styles.secondary}
                    onClick={() => void cancelQueue()}
                    disabled={busy === "send" || busy === "prepare"}
                  >
                    <Square size={14} />
                    Cancelar
                  </button>

                  {currentItem?.status === "error" ? (
                    <button
                      type="button"
                      className={styles.primary}
                      onClick={() =>
                        void prepareGroup(currentItem.group, queueIndex)
                      }
                      disabled={busy === "prepare"}
                    >
                      <RefreshCw size={16} />
                      Tentar novamente
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={styles.primary}
                      onClick={() => void sendAndAdvance()}
                      disabled={!prepared || busy === "send" || busy === "prepare"}
                    >
                      {busy === "send" ? (
                        <Loader2 className={styles.spin} size={16} />
                      ) : (
                        <CheckCircle2 size={16} />
                      )}
                      Confirmar envio e avançar
                    </button>
                  )}
                </>
              )}
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
