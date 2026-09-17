"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

import { solicitarAtualizacaoSaldoTokensIa } from "@/lib/ia/tokens-client-events";

import styles from "./conversas.module.css";
import {
  formatarCampanhaRastreamentoContato,
  converterTextoParaEmojiHtml,
  hexToRgba,
  type CampanhaRastreamentoContato,
} from "./conversation-shared";

export type AudioMessagePlayerProps = {
  src: string;
  mimeType?: string;
  isOutgoing?: boolean;
  isVoice?: boolean;
  fileName?: string | null;
};

export function formatarTempoAudio(segundos: number) {
  if (!Number.isFinite(segundos) || segundos < 0) return "00:00";

  const mins = Math.floor(segundos / 60);
  const secs = Math.floor(segundos % 60);

  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function AudioMessagePlayer({
  src,
  mimeType = "",
  isOutgoing = false,
  isVoice = false,
  fileName = null,
}: AudioMessagePlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const barraRef = useRef<HTMLDivElement | null>(null);

  const [tocando, setTocando] = useState(false);
  const [tempoAtual, setTempoAtual] = useState(0);
  const [duracao, setDuracao] = useState(0);
  const [velocidade, setVelocidade] = useState(1);
  const [arrastando, setArrastando] = useState(false);
  const [erroAudio, setErroAudio] = useState(false);

  const barrasWave = useMemo(() => {
    return Array.from({ length: 40 }, (_, i) => {
      const base = [8, 14, 22, 12, 18, 10, 24, 11, 16, 20, 12, 26];
      return base[i % base.length];
    });
  }, []);

  const containerClass = isOutgoing
    ? styles.audioPlayerOutgoing
    : styles.audioPlayerIncoming;

  const textClass = isOutgoing
    ? styles.audioPlayerTextOutgoing
    : styles.audioPlayerTextIncoming;

  const pillClass = isOutgoing
    ? styles.audioPlayerPillOutgoing
    : styles.audioPlayerPillIncoming;

  const waveActiveClass = isOutgoing
    ? styles.audioWaveBarActiveOutgoing
    : styles.audioWaveBarActiveIncoming;

  const waveInactiveClass = isOutgoing
    ? styles.audioWaveBarInactiveOutgoing
    : styles.audioWaveBarInactiveIncoming;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    setErroAudio(false);
    setTocando(false);
    setTempoAtual(0);
    setDuracao(0);

    audio.load();
  }, [src]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const atualizarDuracao = () => {
      const novaDuracao = audio.duration;
      if (Number.isFinite(novaDuracao) && novaDuracao > 0) {
        setDuracao(novaDuracao);
      }
    };

    const atualizarTempo = () => {
      if (!arrastando) {
        setTempoAtual(audio.currentTime || 0);
      }
    };

    const aoTerminar = () => {
      setTocando(false);
      setTempoAtual(0);
      audio.currentTime = 0;
    };

    const aoPause = () => {
      setTocando(false);
    };

    const aoPlay = () => {
      setTocando(true);
    };

    audio.addEventListener("loadedmetadata", atualizarDuracao);
    audio.addEventListener("durationchange", atualizarDuracao);
    audio.addEventListener("canplay", atualizarDuracao);
    audio.addEventListener("timeupdate", atualizarTempo);
    audio.addEventListener("ended", aoTerminar);
    audio.addEventListener("pause", aoPause);
    audio.addEventListener("play", aoPlay);

    return () => {
      audio.removeEventListener("loadedmetadata", atualizarDuracao);
      audio.removeEventListener("durationchange", atualizarDuracao);
      audio.removeEventListener("canplay", atualizarDuracao);
      audio.removeEventListener("timeupdate", atualizarTempo);
      audio.removeEventListener("ended", aoTerminar);
      audio.removeEventListener("pause", aoPause);
      audio.removeEventListener("play", aoPlay);
    };
  }, [arrastando]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = velocidade;
  }, [velocidade]);

  async function alternarPlay() {
    const audio = audioRef.current;
    if (!audio) return;

    if (tocando) {
      audio.pause();
      return;
    }

    try {
      await audio.play();
    } catch {
      setTocando(false);
    }
  }

  function alterarTempo(delta: number) {
    const audio = audioRef.current;
    if (!audio || !duracao) return;

    const proximoTempo = Math.min(
      Math.max((audio.currentTime || 0) + delta, 0),
      duracao
    );

    audio.currentTime = proximoTempo;
    setTempoAtual(proximoTempo);
  }

  function calcularTempoPelaPosicao(clientX: number) {
    const barra = barraRef.current;
    if (!barra || !duracao) return null;

    const rect = barra.getBoundingClientRect();
    const posicaoX = clientX - rect.left;
    const porcentagem = Math.min(Math.max(posicaoX / rect.width, 0), 1);

    return porcentagem * duracao;
  }

  function irParaTempo(clientX: number) {
    const audio = audioRef.current;
    if (!audio) return;

    const novoTempo = calcularTempoPelaPosicao(clientX);
    if (novoTempo == null) return;

    audio.currentTime = novoTempo;
    setTempoAtual(novoTempo);
  }

  function onMouseDownBarra(e: React.MouseEvent<HTMLDivElement>) {
    setArrastando(true);
    irParaTempo(e.clientX);
  }

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!arrastando) return;
      irParaTempo(e.clientX);
    }

    function onMouseUp() {
      if (!arrastando) return;
      setArrastando(false);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [arrastando, duracao]);

  function alternarVelocidade() {
    setVelocidade((atual) => {
      if (atual === 1) return 1.5;
      if (atual === 1.5) return 2;
      return 1;
    });
  }


  const progresso = duracao > 0 ? Math.min((tempoAtual / duracao) * 100, 100) : 0;
  const barrasAtivas = Math.round((progresso / 100) * barrasWave.length);

  return (
    <div className={containerClass}>
      <audio
        key={src}
        ref={audioRef}
        preload="metadata"
        src={src}
        onError={() => {
          setErroAudio(true);
          setTocando(false);
        }}
      >
        {mimeType ? <source src={src} type={mimeType} /> : null}
      </audio>

      {erroAudio && (
        <div className={`${styles.audioTimeInfo} ${textClass}`}>
          Não foi possível reproduzir este áudio. Tente baixar o arquivo.
        </div>
      )}

      <div className={styles.audioPlayerTopRow}>
        <div className={styles.audioPlayerTopLeft}>
          {isVoice && <span className={pillClass}>Voz</span>}

          {fileName && !isVoice && (
            <span className={pillClass} title={fileName}>
              {fileName}
            </span>
          )}
        </div>

        <a
          href={src}
          download={fileName || "audio"}
          className={`${styles.audioDownloadLink} ${textClass}`}
          title="Baixar áudio"
        >
          ⬇ Baixar
        </a>
      </div>

      <div className={styles.audioPlayerMainRow}>
        <button
          type="button"
          onClick={alternarPlay}
          className={styles.audioPlayButton}
          title={tocando ? "Pausar áudio" : "Reproduzir áudio"}
        >
          {tocando ? "❚❚" : "▶"}
        </button>

        <div
          ref={barraRef}
          onMouseDown={onMouseDownBarra}
          className={styles.audioWave}
          title="Clique ou arraste para avançar"
        >
          {barrasWave.map((altura, index) => {
            const ativa = index < barrasAtivas;
            const animando = tocando && ativa;

            return (
              <div
                key={index}
                className={`${styles.audioWaveBar} ${
                  ativa ? waveActiveClass : waveInactiveClass
                } ${animando ? styles.audioWaveBarAnimating : ""}`}
                style={{ height: `${altura}px` }}
              />
            );
          })}
        </div>

        <button
          type="button"
          onClick={alternarVelocidade}
          className={styles.audioSpeedButton}
          title="Alterar velocidade"
        >
          {velocidade}x
        </button>
      </div>

      <div className={styles.audioPlayerBottomRow}>
        <div className={styles.audioPlayerActions}>
          <button
            type="button"
            onClick={() => alterarTempo(-5)}
            className={`${styles.audioActionButton} ${textClass}`}
            title="Voltar 5 segundos"
          >
            ⟲ 5s
          </button>

          <button
            type="button"
            onClick={() => alterarTempo(5)}
            className={`${styles.audioActionButton} ${textClass}`}
            title="Adiantar 5 segundos"
          >
            5s ⟳
          </button>
        </div>

        <div className={`${styles.audioTimeInfo} ${textClass}`}>
          <span>{formatarTempoAudio(tempoAtual)}</span>
          <span>/</span>
          <span>{formatarTempoAudio(duracao)}</span>
        </div>
      </div>
    </div>
  );
}

export function CampoContatoEditavel({
  label,
  valorInicial,
  editando,
  multiline = false,
  onEditar,
  onCancelar,
  onSalvar,
  onExcluir,
  podeEditar = true,
}: {
  label: string;
  valorInicial: string;
  editando: boolean;
  multiline?: boolean;
  onEditar: () => void;
  onCancelar: () => void;
  onSalvar: (valor: string) => void;
  onExcluir?: () => void;
  podeEditar?: boolean;
}) {
  const [valor, setValor] = useState(valorInicial);

  useEffect(() => {
    setValor(valorInicial);
  }, [valorInicial]);

  return (
    <div className={styles.whatsInfoRow}>
      <span className={styles.whatsInfoLabel}>{label}</span>

      {editando ? (
        <div className={styles.infoEditBlock}>
          {multiline ? (
            <textarea
              className={styles.inlineTextarea}
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              rows={4}
              autoFocus
            />
          ) : (
            <input
              className={styles.inlineInput}
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              autoFocus
            />
          )}

          <div className={styles.infoEditActions}>
            {onExcluir && (
              <button
                type="button"
                className={styles.inlineCancelButton}
                style={{
                  marginRight: "auto",
                  color: "var(--crm-danger-strong)",
                  borderColor: "var(--crm-ui-private-border-rgb-220-38-38-0-3)",
                }}
                onClick={onExcluir}
              >
                Excluir
              </button>
            )}

            <button
              type="button"
              className={styles.inlineCancelButton}
              onClick={() => {
                setValor(valorInicial);
                onCancelar();
              }}
            >
              Cancelar
            </button>

            <button
              type="button"
              className={styles.inlineSaveButton}
              onClick={() => onSalvar(valor)}
            >
              Salvar
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.infoValueRow}>
          <span className={styles.whatsInfoValue}>
            {valorInicial || "Não informado"}
          </span>

          {podeEditar && (
            <button
              type="button"
              className={styles.editIconButton}
              onClick={onEditar}
            >
              ✎
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function CampanhaContatoEditavel({
  valorInicial,
  campanhaIdInicial,
  campanhas,
  editando,
  onEditar,
  onCancelar,
  onSalvar,
  podeEditar = true,
}: {
  valorInicial: string;
  campanhaIdInicial: string;
  campanhas: CampanhaRastreamentoContato[];
  editando: boolean;
  onEditar: () => void;
  onCancelar: () => void;
  onSalvar: (campanhaId: string) => void;
  podeEditar?: boolean;
}) {
  const valorLegado = "__campanha_legada__";
  const campanhaSelectInicial =
    campanhaIdInicial || (valorInicial ? valorLegado : "");
  const [campanhaId, setCampanhaId] = useState(campanhaSelectInicial);

  useEffect(() => {
    setCampanhaId(campanhaSelectInicial);
  }, [campanhaSelectInicial]);

  return (
    <div className={styles.whatsInfoRow}>
      <span className={styles.whatsInfoLabel}>Campanha</span>

      {editando ? (
        <div className={styles.infoEditBlock}>
          <select
            className={styles.inlineSelect}
            value={campanhaId}
            onChange={(event) => setCampanhaId(event.target.value)}
            autoFocus
          >
            {valorInicial && !campanhaIdInicial ? (
              <option value={valorLegado}>{valorInicial} (campanha antiga)</option>
            ) : (
              <option value="">Sem campanha</option>
            )}

            {valorInicial && !campanhaIdInicial && (
              <option value="">Sem campanha</option>
            )}

            {campanhas.map((campanha) => (
              <option key={campanha.id} value={campanha.id}>
                {formatarCampanhaRastreamentoContato(campanha)}
              </option>
            ))}
          </select>

          <div className={styles.infoEditActions}>
            <button
              type="button"
              className={styles.inlineCancelButton}
              onClick={() => {
                setCampanhaId(campanhaSelectInicial);
                onCancelar();
              }}
            >
              Cancelar
            </button>

            <button
              type="button"
              className={styles.inlineSaveButton}
              onClick={() => {
                if (campanhaId === valorLegado) {
                  onCancelar();
                  return;
                }

                onSalvar(campanhaId);
              }}
            >
              Salvar
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.infoValueRow}>
          <span className={styles.whatsInfoValue}>
            {valorInicial || "Não informado"}
          </span>

          {podeEditar && (
            <button
              type="button"
              className={styles.editIconButton}
              onClick={onEditar}
            >
              ✎
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function TranscricaoAudioBox({
  mensagemId,
  textoInicial,
  isOutgoing,
  podeGerar,
  onTranscricaoSalva,
}: {
  mensagemId: string;
  textoInicial: string;
  isOutgoing: boolean;
  podeGerar: boolean;
  onTranscricaoSalva: (mensagemId: string, transcricao: string) => void;
}) {
  const [aberta, setAberta] = useState(false);
  const [texto, setTexto] = useState(textoInicial || "");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  const textoGrande = texto.length > 120;

  if (!texto.trim() && !podeGerar) return null;

  async function abrirOuGerarTranscricao() {
    setErro("");

    if (texto.trim()) {
      setAberta((prev) => !prev);
      return;
    }

    try {
      setCarregando(true);

      const res = await fetch(`/api/mensagens/${mensagemId}/transcrever-audio`, {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        setErro(data.error || "Erro ao transcrever áudio.");
        return;
      }

      const transcricao = data.transcricao || "";

      setTexto(transcricao);
      setAberta(true);
      onTranscricaoSalva(mensagemId, transcricao);

      if (!data.jaExistia) {
        solicitarAtualizacaoSaldoTokensIa();
      }
    } catch {
      setErro("Erro ao transcrever áudio.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div
      className={`${styles.audioTranscriptionBox} ${
        isOutgoing
          ? styles.audioTranscriptionBoxOutgoing
          : styles.audioTranscriptionBoxIncoming
      }`}
    >
      <button
        type="button"
        onClick={abrirOuGerarTranscricao}
        disabled={carregando}
        className={styles.audioTranscriptionToggle}
      >
      {carregando
        ? "Transcrevendo..."
        : aberta
        ? "Ocultar transcrição"
        : texto.trim()
        ? "Ver transcrição"
        : "Gerar transcrição"}
      </button>

      {erro && <p className={styles.messageText}>{erro}</p>}

      {aberta && texto.trim() && (
        <p
          className={`${styles.messageText} ${
            textoGrande
              ? styles.audioTranscriptionTextLarge
              : styles.audioTranscriptionText
          }`}
        >
          <TextoComEmoji texto={texto} />
        </p>
      )}
    </div>
  );
}

export const TextoComEmoji = React.memo(function TextoComEmoji({
  texto,
}: {
  texto?: string | null;
}) {
  const html = useMemo(() => {
    return converterTextoParaEmojiHtml(texto);
  }, [texto]);

  return <span dangerouslySetInnerHTML={{ __html: html }} />;
});

export function EtiquetaCor({
  etiqueta,
  className = "",
  mostrarTooltip = true,
}: {
  etiqueta?: {
    nome?: string | null;
    descricao?: string | null;
    cor?: string | null;
  } | null;
  className?: string;
  mostrarTooltip?: boolean;
}) {
  if (!etiqueta?.cor) return null;

  return (
    <span className={`${styles.etiquetaTooltipWrap} ${className}`}>
      <span
        className={styles.etiquetaTagPremium}
        style={
          {
            "--tag-bg-1": hexToRgba(etiqueta.cor, 0.26),
            "--tag-bg-2": hexToRgba(etiqueta.cor, 0.48),
            "--tag-border": hexToRgba(etiqueta.cor, 0.34),
          } as React.CSSProperties
        }
      >
        <span className={styles.etiquetaTagHolePremium} />
        <span className={styles.etiquetaTagGlow} />
      </span>

      {mostrarTooltip && (
        <span className={styles.etiquetaTooltip}>
          <strong>{etiqueta.nome || "Etiqueta"}</strong>
          {etiqueta.descricao ? <small>{etiqueta.descricao}</small> : null}
        </span>
      )}
    </span>
  );
}
