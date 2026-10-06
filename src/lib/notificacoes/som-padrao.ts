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
  volume: number
) {
  const oscilador = contexto.createOscillator();
  const ganho = contexto.createGain();

  oscilador.type = "sine";
  oscilador.frequency.setValueAtTime(frequencia, inicio);

  ganho.gain.setValueAtTime(0.0001, inicio);
  ganho.gain.exponentialRampToValueAtTime(volume, inicio + 0.018);
  ganho.gain.exponentialRampToValueAtTime(
    0.0001,
    inicio + duracao
  );

  oscilador.connect(ganho);
  ganho.connect(contexto.destination);

  oscilador.start(inicio);
  oscilador.stop(inicio + duracao + 0.025);
}

export async function tocarSomPadraoNotificacao() {
  const contexto = obterContextoAudio();
  if (!contexto) return;

  if (!somHabilitado || contexto.state !== "running") {
    const habilitado = await habilitarSomPadraoNotificacao();
    if (!habilitado) return;
  }

  const agora = contexto.currentTime + 0.01;

  criarTom(contexto, 784, agora, 0.16, 0.075);
  criarTom(contexto, 1046.5, agora + 0.105, 0.2, 0.065);
}
