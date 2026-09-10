import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { qstash } from "@/lib/qstash/client";
import { canSendFreeformWhatsAppMessage } from "@/lib/whatsapp/can-send-message";
import { getWhatsAppAccessToken } from "@/lib/whatsapp/access-token";
import { sendWhatsAppTextMessage } from "@/lib/whatsapp/send-text-message";
import { uploadWhatsAppMedia } from "@/lib/whatsapp/upload-media";
import { sendWhatsAppMediaMessage } from "@/lib/whatsapp/send-media-message";
import { aplicarAssinaturaWhatsapp } from "@/lib/whatsapp/message-signature";

export const TIPO_AGENDAMENTO_MENSAGEM_MANUAL = "mensagem_manual";
export const BUCKET_MENSAGENS_AGENDADAS = "whatsapp-agendamentos";
export const LIMITE_SEGURO_JANELA_MS = 23 * 60 * 60 * 1000;

const supabaseAdmin = getSupabaseAdmin();
const require = createRequire(import.meta.url);

type ItemTexto = {
  tipo: "texto";
  conteudo: string;
};

type ItemArquivo = {
  tipo: "arquivo";
  tipo_mensagem: "imagem" | "audio" | "video" | "documento";
  storage_bucket: string;
  storage_path: string;
  mime_type: string;
  filename: string;
  legenda?: string | null;
};

export type ItemMensagemAgendada = ItemTexto | ItemArquivo;

export type PayloadMensagemAgendada = {
  origem?: string;
  origem_disparo?: string;
  conversa_id?: string;
  contato_id?: string;
  contato_nome?: string;
  conversa_protocolo_id?: string | null;
  integracao_whatsapp_id?: string;
  numero_destino?: string;
  usuario_id?: string | null;
  usuario_nome?: string | null;
  assinatura_whatsapp?: string | null;
  itens?: ItemMensagemAgendada[];
  ultima_mensagem_recebida_em?: string | null;
  limite_janela_seguranca_em?: string | null;
  agendamento_grupo_id?: string;
  template_nome?: string;
  tipo_label?: string;
  conteudo_preview?: string;
  resultado_envio?: Record<string, unknown> | null;
  erro?: string | null;
  [key: string]: unknown;
};

type AgendamentoRow = {
  id: string;
  empresa_id: string;
  executar_em: string;
  status: string;
  payload_json: PayloadMensagemAgendada | null;
  locked_at?: string | null;
};

function detectarTipoMensagemPorMime(mimeType: string) {
  if (mimeType.startsWith("image/")) return "imagem" as const;
  if (mimeType.startsWith("audio/")) return "audio" as const;
  if (mimeType.startsWith("video/")) return "video" as const;
  return "documento" as const;
}

function conteudoPadrao(tipo: ItemArquivo["tipo_mensagem"], filename?: string | null) {
  if (tipo === "imagem") return "📷 Imagem";
  if (tipo === "audio") return "🎵 Áudio";
  if (tipo === "video") return "🎥 Vídeo";
  return filename ? `📄 Documento: ${filename}` : "📄 Documento";
}

function suportaLegenda(tipo: ItemArquivo["tipo_mensagem"]) {
  return tipo === "imagem" || tipo === "video" || tipo === "documento";
}

function normalizarCaminhoRootPlaceholder(caminho: string) {
  const cwd = process.cwd();
  if (caminho.startsWith("\\ROOT\\")) return path.join(cwd, caminho.replace(/^\\ROOT\\/, ""));
  if (caminho.startsWith("/ROOT/")) return path.join(cwd, caminho.replace(/^\/ROOT\//, ""));
  if (caminho.startsWith("ROOT\\")) return path.join(cwd, caminho.replace(/^ROOT\\/, ""));
  if (caminho.startsWith("ROOT/")) return path.join(cwd, caminho.replace(/^ROOT\//, ""));
  return caminho;
}

async function getFfmpegBinaryPath() {
  const resolved = require("ffmpeg-static");
  if (!resolved || typeof resolved !== "string") {
    throw new Error("Não foi possível localizar o binário do FFmpeg.");
  }
  const caminho = normalizarCaminhoRootPlaceholder(resolved);
  await fs.access(caminho);
  return caminho;
}

async function converterAudioWebmParaM4a(file: File): Promise<File> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "crm-agendado-audio-"));
  const inputPath = path.join(tmpDir, "input.webm");
  const outputPath = path.join(tmpDir, "output.m4a");

  try {
    await fs.writeFile(inputPath, buffer);
    const ffmpegBinary = await getFfmpegBinaryPath();
    await new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn(ffmpegBinary, [
        "-i", inputPath,
        "-vn",
        "-ac", "1",
        "-ar", "44100",
        "-c:a", "aac",
        "-b:a", "128k",
        "-movflags", "+faststart",
        "-f", "mp4",
        "-y", outputPath,
      ]);
      let stderr = "";
      ffmpeg.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
      ffmpeg.on("error", reject);
      ffmpeg.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Falha ao converter áudio. Código ${code}. ${stderr}`));
      });
    });
    const convertido = await fs.readFile(outputPath);
    return new File([convertido], `audio-${Date.now()}.m4a`, { type: "audio/mp4" });
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function prepararArquivo(file: File) {
  if (file.type === "audio/webm" || file.name.toLowerCase().endsWith(".webm")) {
    return converterAudioWebmParaM4a(file);
  }
  return file;
}

function obterBaseUrlAplicacao() {
  const preview = process.env.VERCEL_ENV !== "production";
  const host = preview
    ? process.env.VERCEL_URL || process.env.NEXT_PUBLIC_APP_URL
    : process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (!host) return "";
  return (host.startsWith("http") ? host : `https://${host}`).replace(/\/$/, "");
}

function obterUrlWorker() {
  const configurada = process.env.QSTASH_WHATSAPP_MENSAGEM_AGENDADA_WORKER_URL;
  if (configurada) return configurada;
  const base = obterBaseUrlAplicacao();
  return base ? `${base}/api/worker/whatsapp-mensagem-agendada` : "";
}

function extrairMessageIdQstash(resultado: unknown) {
  if (!resultado || typeof resultado !== "object") return null;
  const registro = resultado as Record<string, unknown>;
  return String(registro.messageId || registro.message_id || "").trim() || null;
}

export async function limparArquivosMensagemAgendada(payload?: PayloadMensagemAgendada | null) {
  const arquivos = (payload?.itens || []).filter(
    (item): item is ItemArquivo => item.tipo === "arquivo" && Boolean(item.storage_path)
  );
  if (!arquivos.length) return;

  const porBucket = new Map<string, string[]>();
  for (const arquivo of arquivos) {
    const bucket = arquivo.storage_bucket || BUCKET_MENSAGENS_AGENDADAS;
    const paths = porBucket.get(bucket) || [];
    paths.push(arquivo.storage_path);
    porBucket.set(bucket, paths);
  }

  for (const [bucket, paths] of porBucket) {
    const { error } = await supabaseAdmin.storage.from(bucket).remove(paths);
    if (error) {
      console.warn("[MENSAGEM AGENDADA] Falha ao limpar arquivos:", { bucket, error: error.message });
    }
  }
}

async function finalizarComErro(agendamento: AgendamentoRow, mensagem: string) {
  await supabaseAdmin
    .from("automacao_agendamentos")
    .update({
      status: "erro",
      executed_at: new Date().toISOString(),
      locked_at: null,
      payload_json: {
        ...(agendamento.payload_json || {}),
        erro: mensagem,
        erro_em: new Date().toISOString(),
      },
    })
    .eq("id", agendamento.id);
  await limparArquivosMensagemAgendada(agendamento.payload_json);
}

async function inserirMensagem(params: {
  agendamento: AgendamentoRow;
  payload: PayloadMensagemAgendada;
  conteudo: string;
  tipoMensagem: string;
  tipoOriginalMeta?: string | null;
  messageId: string | null;
  metadata: Record<string, unknown>;
}) {
  const { error } = await supabaseAdmin.from("mensagens").insert({
    empresa_id: params.agendamento.empresa_id,
    conversa_id: params.payload.conversa_id,
    conversa_protocolo_id: params.payload.conversa_protocolo_id || null,
    remetente_tipo: "usuario",
    remetente_id: params.payload.usuario_id || null,
    conteudo: params.conteudo,
    tipo_mensagem: params.tipoMensagem,
    tipo_original_meta: params.tipoOriginalMeta || null,
    origem: "enviada",
    status_envio: "enviada",
    mensagem_externa_id: params.messageId,
    metadata_json: {
      ...params.metadata,
      agendamento_id: params.agendamento.id,
      origem_agendamento: "conversa",
    },
  });
  if (error) throw new Error(`Mensagem enviada, mas não foi possível registrar no CRM: ${error.message}`);
}

export async function processarMensagemManualAgendadaPorId(agendamentoId: string) {
  const agora = new Date().toISOString();
  const { data: agendamento, error: lockError } = await supabaseAdmin
    .from("automacao_agendamentos")
    .update({ status: "executando", locked_at: agora })
    .eq("id", agendamentoId)
    .eq("tipo_agendamento", TIPO_AGENDAMENTO_MENSAGEM_MANUAL)
    .eq("status", "pendente")
    .select("id, empresa_id, executar_em, status, payload_json, locked_at")
    .maybeSingle<AgendamentoRow>();

  if (lockError) throw new Error(lockError.message);
  if (!agendamento) return { ok: true, ignorado: true, motivo: "agendamento_nao_pendente" };

  const payload = agendamento.payload_json || {};

  try {
    if (!payload.conversa_id || !payload.contato_id || !payload.integracao_whatsapp_id) {
      throw new Error("Agendamento sem dados suficientes da conversa.");
    }
    if (!Array.isArray(payload.itens) || payload.itens.length === 0) {
      throw new Error("Agendamento sem mensagens para enviar.");
    }

    const janela = await canSendFreeformWhatsAppMessage({ conversaId: payload.conversa_id });
    if (!janela.ultimaMensagemRecebidaEm) {
      throw new Error("Não foi encontrada mensagem recente do contato para calcular a janela de atendimento.");
    }
    const limiteSeguro = new Date(janela.ultimaMensagemRecebidaEm).getTime() + LIMITE_SEGURO_JANELA_MS;
    if (!janela.podeEnviarMensagemLivre || Date.now() > limiteSeguro) {
      throw new Error("Envio cancelado: a margem segura de 23 horas da janela de atendimento foi encerrada.");
    }

    const [{ data: conversa, error: conversaError }, { data: contato, error: contatoError }, { data: integracao, error: integracaoError }] = await Promise.all([
      supabaseAdmin
        .from("conversas")
        .select("id, empresa_id, bot_ativo, historico_importado, integracao_whatsapp_id")
        .eq("id", payload.conversa_id)
        .eq("empresa_id", agendamento.empresa_id)
        .maybeSingle(),
      supabaseAdmin
        .from("contatos")
        .select("id, telefone")
        .eq("id", payload.contato_id)
        .eq("empresa_id", agendamento.empresa_id)
        .maybeSingle(),
      supabaseAdmin
        .from("integracoes_whatsapp")
        .select("id, status, phone_number_id, token_ref, config_json")
        .eq("id", payload.integracao_whatsapp_id)
        .eq("empresa_id", agendamento.empresa_id)
        .maybeSingle(),
    ]);

    if (conversaError || !conversa) throw new Error("Conversa não encontrada no momento do envio.");
    if (contatoError || !contato?.telefone) throw new Error("Contato ou telefone não encontrado no momento do envio.");
    if (integracaoError || !integracao) throw new Error("Integração WhatsApp não encontrada no momento do envio.");
    if (conversa.historico_importado) throw new Error("A conversa passou a ser somente leitura.");
    if (conversa.bot_ativo) throw new Error("A automação foi ativada nesta conversa antes do horário programado.");
    if (integracao.status !== "ativa") throw new Error("A integração WhatsApp está inativa.");

    const phoneNumberId = integracao.phone_number_id || process.env.WHATSAPP_PHONE_NUMBER_ID || "";
    const accessToken = getWhatsAppAccessToken(integracao);
    if (!phoneNumberId || !accessToken) throw new Error("Configuração do WhatsApp incompleta.");

    const resultados: Array<Record<string, unknown>> = [];
    let ultimoConteudo = "Mensagem agendada";

    for (const [indice, item] of payload.itens.entries()) {
      if (item.tipo === "texto") {
        const conteudo = aplicarAssinaturaWhatsapp(item.conteudo, payload.assinatura_whatsapp || "");
        const envio = await sendWhatsAppTextMessage({
          phoneNumberId,
          accessToken,
          to: contato.telefone,
          body: conteudo,
        });
        if (!envio.ok) throw new Error(envio.error || `Falha ao enviar a mensagem ${indice + 1}.`);

        await inserirMensagem({
          agendamento,
          payload,
          conteudo,
          tipoMensagem: "texto",
          messageId: envio.messageId,
          metadata: {
            enviado_via_whatsapp: true,
            integracao_whatsapp_id: integracao.id,
            assinatura_whatsapp: payload.assinatura_whatsapp || null,
            envio_meta: envio.raw,
          },
        });
        ultimoConteudo = conteudo;
        resultados.push({ ordem: indice + 1, tipo: "texto", message_id: envio.messageId });
        continue;
      }

      const { data: blob, error: downloadError } = await supabaseAdmin.storage
        .from(item.storage_bucket || BUCKET_MENSAGENS_AGENDADAS)
        .download(item.storage_path);
      if (downloadError || !blob) throw new Error(`Não foi possível recuperar o arquivo ${item.filename}.`);

      let file = new File([await blob.arrayBuffer()], item.filename, {
        type: item.mime_type || blob.type || "application/octet-stream",
      });
      file = await prepararArquivo(file);
      const mimeType = file.type || item.mime_type || "application/octet-stream";
      const tipoMensagem = detectarTipoMensagemPorMime(mimeType);
      const upload = await uploadWhatsAppMedia({ phoneNumberId, accessToken, file });
      if (!upload.ok || !upload.mediaId) throw new Error(upload.error || `Falha ao preparar o arquivo ${item.filename}.`);

      const legendaOriginal = String(item.legenda || "").trim();
      const legendaFinal = suportaLegenda(tipoMensagem)
        ? aplicarAssinaturaWhatsapp(legendaOriginal, payload.assinatura_whatsapp || "")
        : legendaOriginal;
      const envio = await sendWhatsAppMediaMessage({
        phoneNumberId,
        accessToken,
        to: contato.telefone,
        tipoMensagem,
        mediaId: upload.mediaId,
        caption: legendaFinal || null,
        fileName: file.name || item.filename || null,
      });
      if (!envio.ok) throw new Error(envio.error || `Falha ao enviar o arquivo ${item.filename}.`);

      const conteudo = legendaFinal || conteudoPadrao(tipoMensagem, file.name || item.filename);
      const tipoOriginalMeta = tipoMensagem === "imagem" ? "image" : tipoMensagem === "audio" ? "audio" : tipoMensagem === "video" ? "video" : "document";

      await inserirMensagem({
        agendamento,
        payload,
        conteudo,
        tipoMensagem,
        tipoOriginalMeta,
        messageId: envio.messageId,
        metadata: {
          tipo_original_whatsapp: tipoOriginalMeta,
          media_id: upload.mediaId,
          mime_type: mimeType,
          caption: legendaFinal || null,
          caption_original: legendaOriginal || null,
          filename: file.name || item.filename,
          voice: false,
          url: null,
          whatsapp: { upload_meta: upload.raw, envio_meta: envio.raw },
        },
      });
      ultimoConteudo = conteudo;
      resultados.push({ ordem: indice + 1, tipo: tipoMensagem, message_id: envio.messageId });
    }

    const finalizadoEm = new Date().toISOString();
    await Promise.all([
      supabaseAdmin
        .from("conversas")
        .update({
          status: "aguardando_cliente",
          last_message_at: finalizadoEm,
          last_message: ultimoConteudo,
          last_outbound_message_at: finalizadoEm,
          last_message_direction: "outbound",
          unread_count: 0,
        })
        .eq("id", payload.conversa_id)
        .eq("empresa_id", agendamento.empresa_id),
      supabaseAdmin
        .from("automacao_agendamentos")
        .update({
          status: "executado",
          executed_at: finalizadoEm,
          locked_at: null,
          payload_json: {
            ...payload,
            resultado_envio: {
              itens: resultados,
              total: resultados.length,
              executado_em: finalizadoEm,
              message_id: resultados.at(-1)?.message_id || null,
            },
            erro: null,
          },
        })
        .eq("id", agendamento.id),
    ]);

    await limparArquivosMensagemAgendada(payload);
    return { ok: true, agendamentoId, enviados: resultados.length };
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : "Falha ao processar mensagem agendada.";
    console.error("[MENSAGEM AGENDADA] Falha:", { agendamentoId, erro: mensagem });
    await finalizarComErro(agendamento, mensagem);
    return { ok: false, agendamentoId, error: mensagem };
  }
}

export async function enfileirarMensagensManuaisAgendadasVencidas(params?: { limite?: number }) {
  const limite = Math.max(1, Math.min(params?.limite || 100, 500));
  const agora = new Date();
  const bloqueioExpirado = new Date(agora.getTime() - 5 * 60 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from("automacao_agendamentos")
    .select("id, empresa_id, executar_em, status, payload_json, locked_at")
    .eq("tipo_agendamento", TIPO_AGENDAMENTO_MENSAGEM_MANUAL)
    .eq("status", "pendente")
    .lte("executar_em", agora.toISOString())
    .or(`locked_at.is.null,locked_at.lt.${bloqueioExpirado}`)
    .order("executar_em", { ascending: true })
    .limit(limite);

  if (error) throw new Error(`Erro ao buscar mensagens agendadas: ${error.message}`);
  const agendamentos = (data || []) as AgendamentoRow[];
  const url = obterUrlWorker();
  const podeUsarQstash = Boolean(process.env.QSTASH_TOKEN && url);
  let enfileirados = 0;
  let processadosDireto = 0;
  let erros = 0;

  for (const agendamento of agendamentos) {
    try {
      if (!podeUsarQstash) {
        const resultado = await processarMensagemManualAgendadaPorId(agendamento.id);
        if (resultado.ok) processadosDireto += 1;
        else erros += 1;
        continue;
      }

      const resultado = await qstash.publishJSON({
        url,
        body: { agendamentoId: agendamento.id },
        retries: 2,
        retryDelay: "30000 * (1 + retried)",
        timeout: 60,
        deduplicationId: `whatsapp-mensagem-agendada-${agendamento.id}`,
        label: `whatsapp-mensagem-agendada-${agendamento.empresa_id}`,
      });
      const messageId = extrairMessageIdQstash(resultado);
      if (!messageId) throw new Error("QStash não retornou messageId.");

      const payload = agendamento.payload_json || {};
      await supabaseAdmin
        .from("automacao_agendamentos")
        .update({
          locked_at: new Date().toISOString(),
          payload_json: {
            ...payload,
            qstash_message_id: messageId,
            qstash_publicado_em: new Date().toISOString(),
          },
        })
        .eq("id", agendamento.id)
        .eq("status", "pendente");
      enfileirados += 1;
    } catch (errorPublicacao) {
      erros += 1;
      console.error("[MENSAGEM AGENDADA] Falha ao enfileirar:", {
        agendamentoId: agendamento.id,
        erro: errorPublicacao,
      });
    }
  }

  return {
    encontrados: agendamentos.length,
    enfileirados,
    processados_direto: processadosDireto,
    erros,
  };
}
