import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const auth = await getUsuarioContexto();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const { usuario } = auth;
  if (!usuario.empresa_id || !usuario.permissoes.some((permissao) =>
    permissao === "contatos.visualizar" || permissao === "contatos.editar"
  )) {
    return NextResponse.json({ ok: false, error: "Sem permissão para visualizar classificações." }, { status: 403 });
  }

  const db = getSupabaseAdmin();
  const { data: contato } = await db.from("contatos").select("id")
    .eq("empresa_id", usuario.empresa_id).eq("id", id).maybeSingle();
  if (!contato) return NextResponse.json({ ok: false, error: "Contato não encontrado." }, { status: 404 });

  const { data, error } = await db.from("lead_classificacao_historico")
    .select("id,classificacao_anterior,classificacao_nova,origem,motivo,valor_conversao,criado_em")
    .eq("empresa_id", usuario.empresa_id)
    .eq("contato_id", id)
    .order("criado_em", { ascending: false }).limit(60);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json(
    { ok: true, historico: data || [] },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
