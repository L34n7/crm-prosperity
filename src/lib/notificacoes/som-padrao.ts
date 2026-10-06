"use client";

type AudioContextComCompatibilidade = typeof AudioContext;

let contextoAudio: AudioContext | null = null;
let somHabilitado = false;

function obterAudioContextConstructor(): AudioContextComCompatibilidade | null {
  if (typeof window === "undefined") return null;

  const janela = window as typeof window & {
    webkitAudioContext?: AudioContextComCompatibilidade;
  };

  return window.AudioContext || janela.webkitAudioContext || null;
}

function obterContextoAudio() {
  if (contextoAudio) return contextoAudio;

  const AudioContextConstructor = obterAudioContextConstructor();
  if (!AudioContextConstructor) return null;

  contextoAudio = new AudioContextConstructor();
  return contextoAudio;
}

export async function habilitarSomPadraoNotificacao() {
  const contexto = obterContextoAudio();
  if (!contexto) return false;

  try {
    if (contexto.state === "suspended") {
      await contexto.resume();
    }

    somHabilitado = contexto.state === "running";
    return somHabilitado;
  } catch {
    return false;
  }
}

function criarTom(
  contexto: AudioContext,
  frequencia: number,
  inicio: number,
  duracao: number,
  volume: number,
  tipo: OscillatorType = "triangle"
) {
  const oscilador = contexto.createOscillator();
  const ganho = contexto.createGain();

  oscilador.type = tipo;
  oscilador.frequency.setValueAtTime(frequencia, inicio);

  ganho.gain.setValueAtTime(0.0001, inicio);
  ganho.gain.exponentialRampToValueAtTime(volume, inicio + 0.012);
  ganho.gain.exponentialRampToValueAtTime(
    0.0001,
    inicio + duracao
  );

  oscilador.connect(ganho);
  ganho.connect(contexto.destination);

  oscilador.start(inicio);
  oscilador.stop(inicio + duracao + 0.025);
}

async function prepararContextoParaSom() {
  const contexto = obterContextoAudio();
  if (!contexto) return null;

  if (!somHabilitado || contexto.state !== "running") {
    const habilitado = await habilitarSomPadraoNotificacao();
    if (!habilitado) return null;
  }

  return contexto;
}

export async function tocarSomMensagemChat() {
  const contexto = await prepararContextoParaSom();
  if (!contexto) return;

  const agora = contexto.currentTime + 0.01;

  criarTom(contexto, 659.25, agora, 0.18, 0.12);
  criarTom(contexto, 880, agora + 0.105, 0.2, 0.115);
  criarTom(contexto, 1174.66, agora + 0.225, 0.24, 0.105);
}

export async function tocarSomNotificacaoSistema() {
  const contexto = await prepararContextoParaSom();
  if (!contexto) return;

  const agora = contexto.currentTime + 0.01;

  criarTom(contexto, 880, agora, 0.2, 0.15, "sine");
  criarTom(contexto, 1320, agora, 0.22, 0.08, "triangle");
  criarTom(contexto, 1046.5, agora + 0.17, 0.24, 0.145, "triangle");
  criarTom(contexto, 1568, agora + 0.17, 0.24, 0.075, "sine");
  criarTom(contexto, 1318.51, agora + 0.39, 0.3, 0.13, "triangle");
}

export async function tocarSomPadraoNotificacao() {
  await tocarSomMensagemChat();
}
