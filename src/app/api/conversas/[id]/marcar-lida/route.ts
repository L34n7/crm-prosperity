import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { podeVisualizarConversas } from "@/lib/auth/authorization";

const supabaseAdmin = getSupabaseAdmin();

type UltimaMensagemRow = {
  created_at: string;
};

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: conversaId } = await context.params;

    const resultado = await getUsuarioContexto();

    if (!resultado.ok) {
      return NextResponse.json(
        { ok: false, error: resultado.error },
        { status: resultado.status }
      );
    }

    const { usuario } = resultado;

    if (!(await podeVisualizarConversas(usuario))) {
      return NextResponse.json(
        { ok: false, error: "Sem permissão para visualizar conversas" },
        { status: 403 }
      );
    }

    if (!usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada" },
        { status: 400 }
      );
    }

    const { data: conversa, error: conversaError } = await supabaseAdmin
      .from("conversas")
      .select("id, empresa_id")
      .eq("id", conversaId)
      .eq("empresa_id", usuario.empresa_id)
      .maybeSingle();

    if (conversaError) {
      return NextResponse.json(
        { ok: false, error: conversaError.message },
        { status: 500 }
      );
    }

    if (!conversa) {
      return NextResponse.json(
        { ok: false, error: "Conversa não encontrada" },
        { status: 404 }
      );
    }

    const { data: ultimaMensagem, error: ultimaMensagemError } = await supabaseAdmin
      .from("mensagens")
      .select("created_at")
      .eq("empresa_id", usuario.empresa_id)
      .eq("conversa_id", conversaId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<UltimaMensagemRow>();

    if (ultimaMensagemError) {
      return NextResponse.json(
        { ok: false, error: ultimaMensagemError.message },
        { status: 500 }
      );
    }

    const momentoLeitura = ultimaMensagem?.created_at ?? null;
    const agora = new Date().toISOString();

    const { error: upsertError } = await supabaseAdmin
      .from("conversa_leituras")
      .upsert(
        {
          empresa_id: usuario.empresa_id,
          conversa_id: conversaId,
          usuario_id: usuario.id,
          ultima_mensagem_lida_at: momentoLeitura,
          updated_at: agora,
        },
        {
          onConflict: "conversa_id,usuario_id",
        }
      );

    if (upsertError) {
      return NextResponse.json(
        { ok: false, error: upsertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Conversa marcada como lida.",
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Erro ao marcar conversa como lida." },
      { status: 500 }
    );
  }
}