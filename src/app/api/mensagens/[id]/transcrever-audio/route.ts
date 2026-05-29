import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { transcreverAudioComIA } from "@/lib/ia/transcrever-audio";
import { baixarAudioWhatsApp } from "@/lib/whatsapp/baixar-audio-whatsapp";

const supabaseAdmin = getSupabaseAdmin();

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: mensagemId } = await context.params;

    const { data: mensagem, error } = await supabaseAdmin
      .from("mensagens")
      .select("id, empresa_id, tipo_mensagem, conteudo, metadata_json")
      .eq("id", mensagemId)
      .maybeSingle();

    if (error || !mensagem) {
      return NextResponse.json(
        { error: "Mensagem não encontrada." },
        { status: 404 }
      );
    }

    if (mensagem.tipo_mensagem !== "audio") {
      return NextResponse.json(
        { error: "Esta mensagem não é um áudio." },
        { status: 400 }
      );
    }

    const transcricaoExistente =
      mensagem.metadata_json?.transcricao_audio?.trim();

    if (transcricaoExistente) {
      return NextResponse.json({
        ok: true,
        transcricao: transcricaoExistente,
        jaExistia: true,
      });
    }

    const mediaId = mensagem.metadata_json?.media_id;

    if (!mediaId) {
      return NextResponse.json(
        { error: "Áudio sem media_id para transcrição." },
        { status: 400 }
      );
    }

    const audioBuffer = await baixarAudioWhatsApp(mediaId);

    const transcricao = await transcreverAudioComIA({
      audioBuffer,
      fileName: mensagem.metadata_json?.filename || "audio.ogg",
      empresaId: mensagem.empresa_id,
      metadata: {
        origem_evento: "transcricao_manual",
        mensagem_id: mensagem.id,
        media_id: mediaId,
      },
    });

    const metadataAtual = mensagem.metadata_json || {};

    const { error: updateError } = await supabaseAdmin
      .from("mensagens")
      .update({
        conteudo: transcricao || mensagem.conteudo || "🎵 Áudio recebido",
        metadata_json: {
          ...metadataAtual,
          transcricao_audio: transcricao || null,
          transcricao_modelo: "gpt-4o-mini-transcribe",
          transcricao_manual: true,
          transcricao_manual_em: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", mensagemId);

    if (updateError) {
      return NextResponse.json(
        { error: "Erro ao salvar transcrição." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      transcricao,
      jaExistia: false,
    });
  } catch (error: any) {
    console.error("[TRANSCRICAO AUDIO] Erro:", error);

    return NextResponse.json(
      { error: error?.message || "Erro ao transcrever áudio." },
      { status: 500 }
    );
  }
}
