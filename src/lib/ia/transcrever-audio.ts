import OpenAI from "openai";
import { toFile } from "openai/uploads";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function transcreverAudioComIA({
  audioBuffer,
  fileName = "audio.ogg",
}: {
  audioBuffer: Buffer;
  fileName?: string;
}) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY não configurada.");
  }

  const arquivo = await toFile(audioBuffer, fileName, {
    type: "audio/ogg",
  });

  const transcricao = await openai.audio.transcriptions.create({
    model: "gpt-4o-mini-transcribe",
    file: arquivo,
    language: "pt",
  });

  return transcricao.text || "";
}