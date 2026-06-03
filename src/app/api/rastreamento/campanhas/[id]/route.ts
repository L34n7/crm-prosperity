import { NextResponse } from "next/server";
import { obterAcessoRastreamento } from "@/lib/rastreamento/api";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const acesso = await obterAcessoRastreamento("rastreamento.gerenciar");

  if (!acesso.ok) {
    return NextResponse.json(
      { ok: false, error: acesso.error },
      { status: acesso.status }
    );
  }

  const { id } = await context.params;
  const body = await request.json();
  const status = String(body?.status || "");

  if (!["ativo", "inativo"].includes(status)) {
    return NextResponse.json(
      { ok: false, error: "Status invalido." },
      { status: 400 }
    );
  }

  const { data, error } = await getSupabaseAdmin()
    .from("rastreamento_campanhas")
    .update({
      status,
      updated_by: acesso.usuario.id,
    })
    .eq("empresa_id", acesso.usuario.empresa_id)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, campanha: data });
}
