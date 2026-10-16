"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient as createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  MAX_INTERVALO_FOLLOWUP_MINUTOS,
  normalizarFollowupInatividade,
  type FollowupInatividadeConfig,
  type FollowupTentativaConfig,
  type FollowupTipoEnvio,
  type FollowupUnidadeIntervalo,
} from "@/lib/agentes-ia/followup-config";
import MediaManagerModal, {
  type AbaMidias,
} from "../../fluxos/components/modals/MediaManagerModal";
import type { MidiaOpcao } from "../../fluxos/types";
import styles from "../page.module.css";

type Props = {
  value: FollowupInatividadeConfig;
  onChange: (value: FollowupInatividadeConfig) => void;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
};

function resumoMidias(midias: MidiaOpcao[]) {
  return {
    total: midias.length,
    imagens: midias.filter((item) => item.tipo === "imagem").length,
    videos: midias.filter((item) => item.tipo === "video").length,
    audios: midias.filter((item) => item.tipo === "audio").length,
    arquivos: midias.filter((item) => item.tipo === "arquivo").length,
    tamanhoTotal: midias.reduce(
      (total, item) => total + Number(item.tamanho_bytes || 0),
      0,
    ),
  };
}

function ordinal(indice: number) {
  return indice === 0 ? "1ª" : indice === 1 ? "2ª" : "3ª";
}

function labelTipo(tipo: FollowupTipoEnvio) {
  if (tipo === "texto") return "Texto";
  if (tipo === "audio") return "Áudio";
  return "Agente IA";
}

export default function FollowupInatividadeEditor({
  value,
  onChange,
  onError,
  onSuccess,
}: Props) {
  const [midias, setMidias] = useState<MidiaOpcao[]>([]);
  const [carregandoMidias, setCarregandoMidias] = useState(false);
  const [enviandoAudio, setEnviandoAudio] = useState(false);
  const [indiceUpload, setIndiceUpload] = useState<number | null>(null);
  const [modalAberto, setModalAberto] = useState(false);
  const [abaMidias, setAbaMidias] = useState<AbaMidias>("audio");
  const [confirmandoExclusaoId, setConfirmandoExclusaoId] = useState<string | null>(null);
  const [excluindoId, setExcluindoId] = useState<string | null>(null);

  const config = useMemo(
    () => normalizarFollowupInatividade(value),
    [value],
  );
  const audios = useMemo(
    () => midias.filter((item) => item.tipo === "audio"),
    [midias],
  );
  const resumo = useMemo(() => resumoMidias(midias), [midias]);

  const carregarMidias = useCallback(async () => {
    try {
      setCarregandoMidias(true);
      const response = await fetch("/api/automacoes/midias", {
        cache: "no-store",
      });
      const json = await response.json();
      if (!response.ok || !json?.ok) {
        throw new Error(json?.error || "Não foi possível carregar as mídias.");
      }
      setMidias(Array.isArray(json.midias) ? json.midias : []);
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar as mídias.",
      );
    } finally {
      setCarregandoMidias(false);
    }
  }, [onError]);

  useEffect(() => {
    if (!config.ativo) return;
    void carregarMidias();
  }, [carregarMidias, config.ativo]);

  function atualizar(patch: Partial<FollowupInatividadeConfig>) {
    onChange(normalizarFollowupInatividade({ ...config, ...patch }));
  }

  function atualizarEtapa(
    indice: number,
    patch: Partial<FollowupTentativaConfig>,
  ) {
    const etapas = config.etapas.map((item, atual) =>
      atual === indice ? { ...item, ...patch } : item,
    );
    atualizar({ etapas });
  }

  function alterarUnidade(
    indice: number,
    unidade: FollowupUnidadeIntervalo,
  ) {
    const etapa = config.etapas[indice];
    const minutos = etapa.intervalo_minutos;
    atualizarEtapa(indice, {
      intervalo_unidade: unidade,
      intervalo_valor:
        unidade === "horas"
          ? Math.max(1, Math.min(23, Math.round(minutos / 60)))
          : Math.max(1, Math.min(MAX_INTERVALO_FOLLOWUP_MINUTOS, minutos)),
    });
  }

  function alterarTipo(indice: number, tipo: FollowupTipoEnvio) {
    atualizarEtapa(indice, { tipo });
    if (tipo === "audio" && midias.length === 0) {
      void carregarMidias();
    }
  }

  function selecionarAudio(indice: number, midiaId: string) {
    const selecionada = audios.find((item) => item.id === midiaId) || null;
    atualizarEtapa(indice, {
      midia_id: selecionada?.id || null,
      midia_nome: selecionada?.nome || null,
      midia_url: selecionada?.url || null,
    });
  }

  async function enviarAudio(indice: number, arquivo: File) {
    try {
      setEnviandoAudio(true);
      setIndiceUpload(indice);
      const mimeType = arquivo.type || "audio/mpeg";

      const preparacao = await fetch("/api/automacoes/midias/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acao: "preparar_upload",
          nome: arquivo.name,
          mimeType,
          tamanhoBytes: arquivo.size,
        }),
      });
      const preparacaoJson = await preparacao.json();
      if (!preparacao.ok || !preparacaoJson?.ok) {
        throw new Error(
          preparacaoJson?.error || "Não foi possível preparar o áudio.",
        );
      }

      const upload = preparacaoJson.upload;
      if (!upload?.bucket || !upload?.path || !upload?.token) {
        throw new Error("Dados de upload do áudio inválidos.");
      }

      const supabase = createSupabaseBrowserClient();
      const { error: uploadError } = await supabase.storage
        .from(upload.bucket)
        .uploadToSignedUrl(upload.path, upload.token, arquivo, {
          contentType: mimeType,
          upsert: false,
        });
      if (uploadError) throw new Error(uploadError.message);

      const conclusao = await fetch("/api/automacoes/midias/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acao: "concluir_upload",
          nome: arquivo.name,
          mimeType,
          tamanhoBytes: arquivo.size,
          storagePath: upload.path,
        }),
      });
      const conclusaoJson = await conclusao.json();
      if (!conclusao.ok || !conclusaoJson?.ok) {
        throw new Error(
          conclusaoJson?.error || "Não foi possível concluir o áudio.",
        );
      }

      const midia = conclusaoJson.midia as MidiaOpcao;
      setMidias((atuais) => [
        midia,
        ...atuais.filter((item) => item.id !== midia.id),
      ]);
      atualizarEtapa(indice, {
        tipo: "audio",
        midia_id: midia.id,
        midia_nome: midia.nome,
        midia_url: midia.url,
      });
      onSuccess("Áudio enviado e selecionado para o acompanhamento.");
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : "Não foi possível enviar o áudio.",
      );
    } finally {
      setEnviandoAudio(false);
      setIndiceUpload(null);
    }
  }

  async function excluirMidia(midia: MidiaOpcao) {
    try {
      setExcluindoId(midia.id);
      const response = await fetch("/api/automacoes/midias", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: midia.id }),
      });
      const json = await response.json();
      if (!response.ok || !json?.ok) {
        throw new Error(json?.error || "Não foi possível excluir a mídia.");
      }

      setMidias((atuais) => atuais.filter((item) => item.id !== midia.id));
      const etapas = config.etapas.map((etapa) =>
        etapa.midia_id === midia.id
          ? {
              ...etapa,
              midia_id: null,
              midia_nome: null,
              midia_url: null,
            }
          : etapa,
      );
      atualizar({ etapas });
      setConfirmandoExclusaoId(null);
      onSuccess("Mídia excluída da biblioteca da empresa.");
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : "Não foi possível excluir a mídia.",
      );
    } finally {
      setExcluindoId(null);
    }
  }

  return (
    <>
      <div className={styles.scopeHint} style={{ marginTop: 12 }}>
        <strong>Acompanhamento automático:</strong> configure cada tentativa
        como resposta do Agente IA, texto fixo ou áudio da biblioteca geral da
        empresa. Os intervalos são contados após a tentativa anterior.
      </div>

      <label className={styles.checkRow}>
        <input
          type="checkbox"
          checked={config.ativo}
          onChange={(event) => atualizar({ ativo: event.target.checked })}
        />
        <span>
          <strong>Ativar acompanhamento automático</strong>
          <small>
            É cancelado se o cliente responder, um humano assumir ou a janela
            de atendimento do WhatsApp deixar de permitir o envio.
          </small>
        </span>
      </label>

      {config.ativo && (
        <>
          <div className={styles.formGrid} style={{ marginTop: 10 }}>
            <label className={styles.field}>
              <span>Máximo de tentativas</span>
              <select
                value={config.tentativas}
                onChange={(event) =>
                  atualizar({ tentativas: Number(event.target.value) })
                }
              >
                <option value={1}>1 tentativa</option>
                <option value={2}>2 tentativas</option>
                <option value={3}>3 tentativas</option>
              </select>
            </label>
          </div>

          <div style={{ display: "grid", gap: 12, marginTop: 4 }}>
            {config.etapas.slice(0, config.tentativas).map((etapa, indice) => {
              const audioSelecionado =
                audios.find((item) => item.id === etapa.midia_id) || null;
              const maxIntervalo =
                etapa.intervalo_unidade === "horas"
                  ? 23
                  : MAX_INTERVALO_FOLLOWUP_MINUTOS;

              return (
                <div
                  key={indice}
                  style={{
                    border: "1px solid var(--crm-border)",
                    borderRadius: 14,
                    padding: 12,
                    background: "var(--crm-surface-muted)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      marginBottom: 10,
                    }}
                  >
                    <strong style={{ color: "var(--crm-text-strong)" }}>
                      {ordinal(indice)} tentativa
                    </strong>
                    <span
                      style={{
                        fontSize: 12,
                        color: "var(--crm-text-muted)",
                        fontWeight: 700,
                      }}
                    >
                      {labelTipo(etapa.tipo)}
                    </span>
                  </div>

                  <div className={styles.formGrid}>
                    <label className={styles.field}>
                      <span>
                        {indice === 0
                          ? "Enviar após"
                          : "Enviar após a tentativa anterior"}
                      </span>
                      <input
                        type="number"
                        min={1}
                        max={maxIntervalo}
                        step={etapa.intervalo_unidade === "horas" ? 1 : 5}
                        value={etapa.intervalo_valor}
                        onChange={(event) =>
                          atualizarEtapa(indice, {
                            intervalo_valor: Number(event.target.value),
                          })
                        }
                      />
                    </label>

                    <label className={styles.field}>
                      <span>Unidade</span>
                      <select
                        value={etapa.intervalo_unidade}
                        onChange={(event) =>
                          alterarUnidade(
                            indice,
                            event.target.value as FollowupUnidadeIntervalo,
                          )
                        }
                      >
                        <option value="minutos">Minutos</option>
                        <option value="horas">Horas</option>
                      </select>
                    </label>

                    <label className={styles.field}>
                      <span>Tipo da tentativa</span>
                      <select
                        value={etapa.tipo}
                        onChange={(event) =>
                          alterarTipo(
                            indice,
                            event.target.value as FollowupTipoEnvio,
                          )
                        }
                      >
                        <option value="ia">Agente IA</option>
                        <option value="texto">Texto</option>
                        <option value="audio">Áudio</option>
                      </select>
                    </label>
                  </div>

                  {etapa.tipo === "ia" && (
                    <small className={styles.fieldHint}>
                      A mensagem é criada pelo agente usando o contexto atual,
                      evitando repetir as tentativas anteriores.
                    </small>
                  )}

                  {etapa.tipo === "texto" && (
                    <label className={styles.field} style={{ marginTop: 8 }}>
                      <span>Mensagem da tentativa</span>
                      <textarea
                        rows={3}
                        maxLength={2000}
                        value={etapa.texto}
                        placeholder="Ex.: Oi! Passando para saber se você conseguiu ver minha mensagem anterior."
                        onChange={(event) =>
                          atualizarEtapa(indice, { texto: event.target.value })
                        }
                      />
                    </label>
                  )}

                  {etapa.tipo === "audio" && (
                    <div style={{ display: "grid", gap: 9, marginTop: 8 }}>
                      <label className={styles.field}>
                        <span>Áudio da biblioteca</span>
                        <select
                          value={etapa.midia_id || ""}
                          disabled={carregandoMidias || enviandoAudio}
                          onChange={(event) =>
                            selecionarAudio(indice, event.target.value)
                          }
                        >
                          <option value="">
                            {carregandoMidias
                              ? "Carregando áudios..."
                              : "Selecione um áudio"}
                          </option>
                          {audios.map((audio) => (
                            <option key={audio.id} value={audio.id}>
                              {audio.nome}
                            </option>
                          ))}
                        </select>
                      </label>

                      {(audioSelecionado?.url || etapa.midia_url) && (
                        <audio
                          controls
                          preload="metadata"
                          src={audioSelecionado?.url || etapa.midia_url || ""}
                          style={{ width: "100%", maxWidth: 520 }}
                        />
                      )}

                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          flexWrap: "wrap",
                        }}
                      >
                        <label className={styles.secondaryButton}>
                          {enviandoAudio && indiceUpload === indice
                            ? "Enviando..."
                            : "Subir novo áudio"}
                          <input
                            type="file"
                            accept="audio/*"
                            disabled={enviandoAudio}
                            style={{ display: "none" }}
                            onChange={(event) => {
                              const arquivo = event.target.files?.[0];
                              if (arquivo) void enviarAudio(indice, arquivo);
                              event.target.value = "";
                            }}
                          />
                        </label>

                        <button
                          type="button"
                          className={styles.secondaryButton}
                          onClick={() => {
                            setAbaMidias("audio");
                            setModalAberto(true);
                            void carregarMidias();
                          }}
                        >
                          Gerenciar mídias
                        </button>
                      </div>

                      <small className={styles.fieldHint}>
                        Usa a mesma biblioteca de mídias dos Fluxos. Áudios já
                        importados pela empresa aparecem aqui automaticamente.
                      </small>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <small className={styles.fieldHint}>
            O limite máximo por intervalo é de 23 horas. Se a soma das
            tentativas ultrapassar a janela válida do WhatsApp, a tentativa
            seguinte não será enviada.
          </small>
        </>
      )}

      {modalAberto && (
        <MediaManagerModal
          midias={midias}
          resumo={resumo}
          aba={abaMidias}
          carregando={carregandoMidias}
          podeGerenciar
          confirmandoExclusaoId={confirmandoExclusaoId}
          excluindoId={excluindoId}
          storageClassName=""
          onAbaChange={setAbaMidias}
          onFechar={() => {
            setModalAberto(false);
            setConfirmandoExclusaoId(null);
          }}
          onPedirExclusao={setConfirmandoExclusaoId}
          onConfirmarExclusao={(midia) => void excluirMidia(midia)}
        />
      )}
    </>
  );
}
