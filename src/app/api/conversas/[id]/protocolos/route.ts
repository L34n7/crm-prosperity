import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { podeVisualizarConversas } from "@/lib/auth/authorization";

const supabaseAdmin = getSupabaseAdmin();

type ProtocoloRow = {
  id: string;
  conversa_id: string;
  empresa_id: string;
  protocolo: string;
  tipo: "abertura" | "reabertura";
  ativo: boolean;
  started_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

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
      { ok: false, error: "Sem permissão para visualizar protocolos" },
      { status: 403 }
    );
  }

  const { data: conversa, error: conversaError } = await supabaseAdmin
    .from("conversas")
    .select("id, empresa_id")
    .eq("id", id)
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

  if (!usuario.empresa_id || conversa.empresa_id !== usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Você não pode acessar esta conversa" },
      { status: 403 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("conversa_protocolos")
    .select("*")
    .eq("conversa_id", id)
    .eq("empresa_id", usuario.empresa_id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    protocolos: (data ?? []) as ProtocoloRow[],
  });
}