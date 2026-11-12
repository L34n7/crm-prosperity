import OpenAI from "openai";
import { toFile } from "openai/uploads";
import {
  extrairUsoTokensIa,
  registrarUsoTokensIa,
  verificarSaldoTokensIa,
} from "@/lib/ia/tokens";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export class OpenAITranscriptionAuthenticationError extends Error {
  readonly code = "OPENAI_TRANSCRIPTION_AUTH";

  constructor() {
    super("A OpenAI recusou a credencial de transcrição. Verifique a configuração do serviço.");
    this.name = "OpenAITranscriptionAuthenticationError";
  }
}

export async function transcreverAudioComIA({
  audioBuffer,
  fileName = "audio.ogg",
  empresaId,
  usuarioId,
  metadata,
}: {
  audioBuffer: Buffer;
  fileName?: string;
  empresaId?: string | null;
  usuarioId?: string | null;
  metadata?: Record<string, any>;
}) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY nao configurada.");
  }

  if (empresaId) {
    await verificarSaldoTokensIa(empresaId);
  }

  const arquivo = await toFile(audioBuffer, fileName, {
    type: "audio/ogg",
  });

  const modelo = "gpt-4o-mini-transcribe";
  let transcricao: Awaited<ReturnType<typeof openai.audio.transcriptions.create>>;
  try {
    transcricao = await openai.audio.transcriptions.create({
      model: modelo,
      file: arquivo,
      language: "pt",
    });
  } catch (error) {
    if (error instanceof OpenAI.AuthenticationError) {
      console.error("[TRANSCRICAO OPENAI] Autenticacao rejeitada pelo provedor:", {
        modelo,
        status: error.status,
      });
      throw new OpenAITranscriptionAuthenticationError();
    }
    throw error;
  }

  if (empresaId) {
    await registrarUsoTokensIa({
      empresaId,
      usuarioId,
      origem: "transcrever_audio",
      modelo,
      uso: extrairUsoTokensIa((transcricao as any).usage),
      metadata: {
        file_name: fileName,
        audio_bytes: audioBuffer.length,
        ...(metadata || {}),
      },
    });
  }

  return transcricao.text || "";
}
