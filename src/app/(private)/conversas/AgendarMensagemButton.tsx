"use client";

import { ChangeEvent, useMemo, useRef, useState } from "react";
import { Clock3, FilePlus2, Plus, Trash2, X } from "lucide-react";
import styles from "./AgendarMensagemButton.module.css";

type Janela24hLike = {
  ultimaMensagemRecebidaEm: string | null;
  janelaExpiraEm?: string | null;
};

type Props = {
  conversaId: string;
  contatoNome?: string | null;
  texto: string;
  arquivo: File | null;
  podeAgendar: boolean;
  podeAgendarMidia: boolean;
  gravandoAudio: boolean;
  janela24h: Janela24hLike | null;
  onAgendado: (mensagem: string) => void;
};

type ItemExtra =
  | { id: string; tipo: "texto"; conteudo: string }
  | { id: string; tipo: "arquivo"; arquivo: File; legenda: string };

const MARGEM_SEGURANCA_MS = 23 * 60 * 60 * 1000;

function formatarDataHora(valor: Date | string | null) {
  if (!valor) return "Não disponível";
  const data = valor instanceof Date ? valor : new Date(valor);
  if (!Number.isFinite(data.getTime())) return "Não disponível";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(data);
}

function formatarRestante(ms: number) {
  const totalMinutos = Math.max(0, Math.floor(ms / 60000));
  const horas = Math.floor(totalMinutos / 60);
  const minutos = totalMinutos % 60;
  if (horas <= 0) return `${minutos} min`;
  return `${horas}h ${minutos}min`;
}

function idLocal() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function AgendarMensagemButton({
  conversaId,
  contatoNome,
  texto,
  arquivo,
  podeAgendar,
  podeAgendarMidia,
  gravandoAudio,
  janela24h,
  onAgendado,
}: Props) {
  const [aberto, setAberto] = useState(false);
  const [horas, setHoras] = useState(0);
  const [minutos, setMinutos] = useState(30);
  const [itensExtras, setItensExtras] = useState<ItemExtra[]>([]);
  const [novoTexto, setNovoTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const arquivosInputRef = useRef<HTMLInputElement | null>(null);

  const ultimaMensagem = useMemo(() => {
    const valor = janela24h?.ultimaMensagemRecebidaEm;
    if (!valor) return null;
    const data = new Date(valor);
    return Number.isFinite(data.getTime()) ? data : null;
  }, [janela24h?.ultimaMensagemRecebidaEm]);

  const limiteSeguro = useMemo(
    () =>
      ultimaMensagem
        ? new Date(ultimaMensagem.getTime() + MARGEM_SEGURANCA_MS)
        : null,
    [ultimaMensagem]
  );

  const minutosAtraso = Math.max(0, horas * 60 + minutos);
  const executarEm = useMemo(
    () => new Date(Date.now() + minutosAtraso * 60000),
    [minutosAtraso, aberto, horas, minutos]
  );
  const dentroDoLimite =
    !!limiteSeguro && executarEm.getTime() <= limiteSeguro.getTime();
  const restanteSeguro = limiteSeguro
    ? limiteSeguro.getTime() - Date.now()
    : 0;

  const temRascunhoBase = Boolean(arquivo || texto.trim());
  const podeAbrir =
    podeAgendar && temRascunhoBase && !gravandoAudio && restanteSeguro > 0;

  function fechar() {
    if (enviando) return;
    setAberto(false);
    setErro("");
  }

  function adicionarTexto() {
    const conteudo = novoTexto.trim();
    if (!conteudo) return;
    setItensExtras((atuais) => [
      ...atuais,
      { id: idLocal(), tipo: "texto", conteudo },
    ]);
    setNovoTexto("");
  }

  function adicionarArquivos(event: ChangeEvent<HTMLInputElement>) {
    const selecionados = Array.from(event.target.files || []);
    if (!selecionados.length) return;
    setItensExtras((atuais) => [
      ...atuais,
      ...selecionados.map((arquivoSelecionado) => ({
        id: idLocal(),
        tipo: "arquivo" as const,
        arquivo: arquivoSelecionado,
        legenda: "",
      })),
    ]);
    event.target.value = "";
  }

  function removerExtra(id: string) {
    setItensExtras((atuais) => atuais.filter((item) => item.id !== id));
  }

  function atualizarLegendaExtra(id: string, legenda: string) {
    setItensExtras((atuais) =>
      atuais.map((item) =>
        item.id === id && item.tipo === "arquivo"
          ? { ...item, legenda }
          : item
      )
    );
  }

  async function confirmarAgendamento() {
    setErro("");

    if (!podeAgendar || !ultimaMensagem || !limiteSeguro) {
      setErro("A janela de atendimento não está disponível para este contato.");
      return;
    }
    if (minutosAtraso < 1) {
      setErro("Escolha pelo menos 1 minuto para o agendamento.");
      return;
    }
    if (!dentroDoLimite) {
      setErro("O horário escolhido ultrapassa o limite seguro de 23 horas.");
      return;
    }

    const formData = new FormData();
    const arquivos: File[] = [];
    const itens: Array<Record<string, unknown>> = [];

    if (arquivo) {
      if (!podeAgendarMidia) {
        setErro("Você não tem permissão para agendar mídias nesta conversa.");
        return;
      }
      const fileIndex = arquivos.push(arquivo) - 1;
      itens.push({
        tipo: "arquivo",
        file_index: fileIndex,
        legenda: texto.trim() || null,
      });
    } else if (texto.trim()) {
      itens.push({ tipo: "texto", conteudo: texto.trim() });
    }

    for (const item of itensExtras) {
      if (item.tipo === "texto") {
        itens.push({ tipo: "texto", conteudo: item.conteudo });
        continue;
      }
      if (!podeAgendarMidia) {
        setErro("Você não tem permissão para agendar mídias nesta conversa.");
        return;
      }
      const fileIndex = arquivos.push(item.arquivo) - 1;
      itens.push({
        tipo: "arquivo",
        file_index: fileIndex,
        legenda: item.legenda.trim() || null,
      });
    }

    if (!itens.length) {
      setErro("Adicione ao menos uma mensagem para agendar.");
      return;
    }

    formData.append("executar_em", executarEm.toISOString());
    formData.append("itens_json", JSON.stringify(itens));
    arquivos.forEach((item) => formData.append("files", item));

    try {
      setEnviando(true);
      const response = await fetch(
        `/api/conversas/${encodeURIComponent(conversaId)}/agendar-mensagem`,
        { method: "POST", body: formData }
      );
      const data = await response.json();
      if (!response.ok) {
        setErro(data.error || "Não foi possível agendar a mensagem.");
        return;
      }

      setAberto(false);
      setItensExtras([]);
      setNovoTexto("");
      setHoras(0);
      setMinutos(30);
      onAgendado(data.message || "Mensagem agendada com sucesso.");
    } catch {
      setErro("Não foi possível agendar a mensagem.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={styles.scheduleButton}
        onClick={() => {
          setErro("");
          setAberto(true);
        }}
        disabled={!podeAbrir}
        title={
          podeAbrir
            ? "Programar envio"
            : "Digite uma mensagem dentro da janela de atendimento para programar"
        }
        aria-label="Programar envio da mensagem"
      >
        <Clock3 size={18} />
      </button>

      {aberto && (
        <div className={styles.overlay} role="presentation" onMouseDown={fechar}>
          <section
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="agendar-mensagem-titulo"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className={styles.header}>
              <div>
                <span className={styles.eyebrow}>WhatsApp</span>
                <h3 id="agendar-mensagem-titulo">Programar envio</h3>
                <p>{contatoNome || "Contato"}</p>
              </div>
              <button type="button" className={styles.closeButton} onClick={fechar}>
                <X size={18} />
              </button>
            </header>

            <div className={styles.body}>
              <div className={styles.windowNotice}>
                <strong>Janela de atendimento de 24 horas</strong>
                <p>
                  A janela começa na última mensagem recebida do contato. Por segurança,
                  o CRM permite programar mensagens somente até 23 horas após essa mensagem,
                  mantendo 1 hora de margem para processamento.
                </p>
                <div className={styles.windowGrid}>
                  <span>
                    Última mensagem
                    <b>{formatarDataHora(ultimaMensagem)}</b>
                  </span>
                  <span>
                    Limite seguro
                    <b>{formatarDataHora(limiteSeguro)}</b>
                  </span>
                  <span>
                    Tempo disponível
                    <b>{formatarRestante(restanteSeguro)}</b>
                  </span>
                </div>
              </div>

              <div className={styles.section}>
                <label className={styles.sectionTitle}>Enviar daqui a</label>
                <div className={styles.timeRow}>
                  <label>
                    Horas
                    <input
                      type="number"
                      min={0}
                      max={23}
                      value={horas}
                      onChange={(event) =>
                        setHoras(Math.max(0, Math.min(23, Number(event.target.value) || 0)))
                      }
                    />
                  </label>
                  <label>
                    Minutos
                    <input
                      type="number"
                      min={0}
                      max={59}
                      value={minutos}
                      onChange={(event) =>
                        setMinutos(Math.max(0, Math.min(59, Number(event.target.value) || 0)))
                      }
                    />
                  </label>
                  <div className={styles.previewTime}>
                    Envio previsto
                    <strong>{formatarDataHora(executarEm)}</strong>
                  </div>
                </div>
                {!dentroDoLimite && (
                  <p className={styles.inlineError}>
                    Esse horário ultrapassa a margem segura da janela de atendimento.
                  </p>
                )}
              </div>

              <div className={styles.section}>
                <div className={styles.sectionHeading}>
                  <div>
                    <span className={styles.sectionTitle}>Conteúdo programado</span>
                    <small>Os itens serão enviados na ordem exibida.</small>
                  </div>
                </div>

                <div className={styles.itemsList}>
                  <div className={styles.itemCard}>
                    <div className={styles.itemIndex}>1</div>
                    <div className={styles.itemContent}>
                      <strong>{arquivo ? arquivo.name : "Mensagem de texto"}</strong>
                      <span>{arquivo ? texto.trim() || "Sem legenda" : texto.trim()}</span>
                    </div>
                  </div>

                  {itensExtras.map((item, index) => (
                    <div className={styles.itemCard} key={item.id}>
                      <div className={styles.itemIndex}>{index + 2}</div>
                      <div className={styles.itemContent}>
                        {item.tipo === "texto" ? (
                          <>
                            <strong>Mensagem de texto</strong>
                            <span>{item.conteudo}</span>
                          </>
                        ) : (
                          <>
                            <strong>{item.arquivo.name}</strong>
                            <input
                              className={styles.captionInput}
                              value={item.legenda}
                              onChange={(event) =>
                                atualizarLegendaExtra(item.id, event.target.value)
                              }
                              placeholder="Legenda opcional"
                            />
                          </>
                        )}
                      </div>
                      <button
                        type="button"
                        className={styles.removeButton}
                        onClick={() => removerExtra(item.id)}
                        title="Remover item"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>

                <div className={styles.addTextRow}>
                  <textarea
                    value={novoTexto}
                    onChange={(event) => setNovoTexto(event.target.value)}
                    placeholder="Adicionar outra mensagem de texto"
                    rows={2}
                  />
                  <button type="button" onClick={adicionarTexto} disabled={!novoTexto.trim()}>
                    <Plus size={16} />
                    Adicionar
                  </button>
                </div>

                {podeAgendarMidia && (
                  <>
                    <input
                      ref={arquivosInputRef}
                      type="file"
                      multiple
                      className={styles.hiddenInput}
                      onChange={adicionarArquivos}
                    />
                    <button
                      type="button"
                      className={styles.addFileButton}
                      onClick={() => arquivosInputRef.current?.click()}
                    >
                      <FilePlus2 size={16} />
                      Adicionar mídia, áudio ou arquivo
                    </button>
                  </>
                )}
              </div>

              {erro && <div className={styles.errorBox}>{erro}</div>}
            </div>

            <footer className={styles.footer}>
              <button type="button" className={styles.cancelButton} onClick={fechar}>
                Cancelar
              </button>
              <button
                type="button"
                className={styles.confirmButton}
                onClick={confirmarAgendamento}
                disabled={enviando || minutosAtraso < 1 || !dentroDoLimite}
              >
                <Clock3 size={16} />
                {enviando ? "Agendando..." : "Programar envio"}
              </button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
