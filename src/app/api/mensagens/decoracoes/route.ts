import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { podeVisualizarMensagens } from "@/lib/auth/authorization";
import { usuarioPodeVisualizarConversa as usuarioPodeAcessarConversa } from "@/lib/conversas/visibilidade";

export const dynamic = "force-dynamic";

const supabaseAdmin = getSupabaseAdmin();

type ConversaAcesso = {
  id: string;
  empresa_id: string;
  setor_id: string | null;
  escopo_fila?: string | null;
  responsavel_id: string | null;
  status?: string | null;
  origem_atendimento?: string | null;
  historico_importado?: boolean | null;
  contato_id?: string | null;
  integracao_whatsapp_id?: string | null;
};

type MensagemRow = {
  id: string;
  conversa_id: string;
  conteudo: string | null;
  origem: string | null;
  remetente_tipo: string | null;
  metadata_json: unknown;
};

type ReactionMetadata = {
  emoji?: unknown;
};

type EditHistoryMetadata = {
  conteudo?: unknown;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function booleanValue(value: unknown) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function normalizeMetadata(value: unknown): Record<string, unknown> {
  if (isObject(value)) return value;

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return isObject(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  return {};
}

function normalizeReactions(value: unknown) {
  if (!Array.isArray(value)) return [] as Array<{ emoji: string; count: number }>;

  const grouped = new Map<string, number>();

  for (const item of value) {
    if (!isObject(item)) continue;
    const emoji = stringValue((item as ReactionMetadata).emoji);
    if (!emoji) continue;
    grouped.set(emoji, (grouped.get(emoji) || 0) + 1);
  }

  return Array.from(grouped.entries()).map(([emoji, count]) => ({ emoji, count }));
}

function previousEditedContent(value: unknown) {
  if (!Array.isArray(value)) return null;

  for (let index = value.length - 1; index >= 0; index -= 1) {
    const item = value[index];
    if (!isObject(item)) continue;
    const conteudo = stringValue((item as EditHistoryMetadata).conteudo);
    if (conteudo) return conteudo;
  }

  return null;
}

function normalizeDecoration(message: MensagemRow) {
  const metadata = normalizeMetadata(message.metadata_json);
  const reactions = normalizeReactions(metadata.reacoes_whatsapp);
  const edited = booleanValue(metadata.mensagem_editada_whatsapp);
  const revoked = booleanValue(metadata.mensagem_revogada_whatsapp);

  if (!edited && !revoked && reactions.length === 0) return null;

  const currentContent = stringValue(message.conteudo);
  const previousContent = edited
    ? previousEditedContent(metadata.historico_edicoes_whatsapp)
    : null;
  const deletedContent = revoked
    ? stringValue(metadata.conteudo_antes_revogacao) || currentContent || null
    : null;

  return {
    messageId: message.id,
    reactions,
    edited,
    revoked,
    previousContent,
    currentContent,
    deletedContent,
    outgoing: message.origem === "enviada",
  };
}

export async function GET(request: Request) {
  try {
    const contexto = await getUsuarioContexto();

    if (!contexto.ok) {
      return NextResponse.json(
        { ok: false, error: contexto.error },
        { status: contexto.status },
      );
    }

    const { searchParams } = new URL(request.url);
    const conversaId = String(searchParams.get("conversa_id") || "").trim();

    if (!conversaId) {
      return NextResponse.json(
        { ok: false, error: "conversa_id é obrigatório" },
        { status: 400 },
      );
    }

    const { data: conversa, error: conversaError } = await supabaseAdmin
      .from("conversas")
      .select(
        "id, empresa_id, setor_id, escopo_fila, responsavel_id, status, origem_atendimento, historico_importado, contato_id, integracao_whatsapp_id",
      )
      .eq("id", conversaId)
      .maybeSingle<ConversaAcesso>();

    if (conversaError) {
      return NextResponse.json(
        { ok: false, error: conversaError.message },
        { status: 500 },
      );
    }

    if (!conversa) {
      return NextResponse.json(
        { ok: false, error: "Conversa não encontrada" },
        { status: 404 },
      );
    }

    if (!(await podeVisualizarMensagens(contexto.usuario))) {
      return NextResponse.json(
        { ok: false, error: "Sem permissão para visualizar mensagens" },
        { status: 403 },
      );
    }

    if (!(await usuarioPodeAcessarConversa(contexto.usuario, conversa))) {
      return NextResponse.json(
        { ok: false, error: "Você não pode acessar as mensagens desta conversa" },
        { status: 403 },
      );
    }

    const { data, error } = await supabaseAdmin
      .from("mensagens")
      .select("id, conversa_id, conteudo, origem, remetente_tipo, metadata_json")
      .eq("empresa_id", conversa.empresa_id)
      .eq("conversa_id", conversaId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 },
      );
    }

    const decoracoes = ((data || []) as MensagemRow[])
      .map(normalizeDecoration)
      .filter(Boolean);

    console.info("[WHATSAPP_DECORACOES] carregadas", {
      conversaId,
      mensagensConsultadas: data?.length || 0,
      decoracoes: decoracoes.length,
    });

    return NextResponse.json(
      { ok: true, decoracoes },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        },
      },
    );
  } catch (error) {
    console.error("[WHATSAPP_DECORACOES] erro", error);
    return NextResponse.json(
      { ok: false, error: "Erro ao carregar decorações das mensagens" },
      { status: 500 },
    );
  }
}
