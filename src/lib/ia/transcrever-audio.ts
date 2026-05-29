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
  const transcricao = await openai.audio.transcriptions.create({
    model: modelo,
    file: arquivo,
    language: "pt",
  });

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
