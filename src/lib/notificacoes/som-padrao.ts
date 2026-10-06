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

  // Soft Duo: curto, limpo e discreto para mensagens frequentes.
  criarTom(contexto, 698.46, agora, 0.13, 0.05, "sine");
  criarTom(contexto, 880, agora + 0.075, 0.15, 0.045, "sine");
}

function criarNotaEncorpada(
  contexto: AudioContext,
  frequencia: number,
  inicio: number,
  duracao: number,
  volume: number
) {
  const camadas: Array<[number, number]> = [
    [0.5, 0.1],
    [1, 1],
    [2, 0.3],
    [3, 0.1],
  ];

  const ecos: Array<[number, number]> = [
    [0, 1],
    [0.055, 0.22],
    [0.11, 0.12],
    [0.19, 0.06],
  ];

  ecos.forEach(([atraso, intensidadeEco]) => {
    camadas.forEach(([multiplicador, intensidadeCamada]) => {
      criarTom(
        contexto,
        frequencia * multiplicador,
        inicio + atraso,
        duracao,
        volume * intensidadeCamada * intensidadeEco,
        "sine"
      );
    });
  });
}

export async function tocarSomNotificacaoSistema() {
  const contexto = await prepararContextoParaSom();
  if (!contexto) return;

  const agora = contexto.currentTime + 0.01;

  // Warm Premium: duas notas encorpadas, com a segunda sustentada e cauda longa.
  criarNotaEncorpada(contexto, 523.25, agora, 0.34, 0.17);
  criarNotaEncorpada(contexto, 659.25, agora + 0.3, 1.42, 0.19);
}

export async function tocarSomPadraoNotificacao() {
  await tocarSomMensagemChat();
}
