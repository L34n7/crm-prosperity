import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { transcreverAudioComIA } from "@/lib/ia/transcrever-audio";
import { baixarAudioWhatsApp } from "@/lib/whatsapp/baixar-audio-whatsapp";
import { getUsuarioBasico } from "@/lib/auth/get-usuario-contexto";
import { getWhatsAppAccessToken } from "@/lib/whatsapp/access-token";

const supabaseAdmin = getSupabaseAdmin();

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const contexto = await getUsuarioBasico();

    if (!contexto.ok) {
      return NextResponse.json(
        { error: contexto.error },
        { status: contexto.status }
      );
    }

    if (!contexto.usuario.empresa_id) {
      return NextResponse.json(
        { error: "Usuário sem empresa vinculada." },
        { status: 400 }
      );
    }

    const { id: mensagemId } = await context.params;

    const { data: mensagem, error } = await supabaseAdmin
      .from("mensagens")
      .select(
        "id, empresa_id, conversa_id, tipo_mensagem, conteudo, metadata_json"
      )
      .eq("id", mensagemId)
      .eq("empresa_id", contexto.usuario.empresa_id)
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

    const { data: conversa } = await supabaseAdmin
      .from("conversas")
      .select("integracao_whatsapp_id")
      .eq("id", mensagem.conversa_id)
      .eq("empresa_id", contexto.usuario.empresa_id)
      .maybeSingle();
    const { data: integracao } = conversa?.integracao_whatsapp_id
      ? await supabaseAdmin
          .from("integracoes_whatsapp")
          .select("token_ref, config_json")
          .eq("id", conversa.integracao_whatsapp_id)
          .eq("empresa_id", contexto.usuario.empresa_id)
          .maybeSingle()
      : { data: null };
    const audioBuffer = await baixarAudioWhatsApp(
      mediaId,
      integracao ? getWhatsAppAccessToken(integracao) : null
    );

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
  } catch (error: unknown) {
    console.error("[TRANSCRICAO AUDIO] Erro:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao transcrever áudio.",
      },
      { status: 500 }
    );
  }
}
