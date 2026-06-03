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
  const atualizacao: Record<string, string | null> = {};

  if (body?.nome !== undefined) {
    const nome = String(body.nome || "").trim();

    if (nome.length < 2) {
      return NextResponse.json(
        { ok: false, error: "Informe o nome da origem." },
        { status: 400 }
      );
    }

    atualizacao.nome = nome;
  }

  if (body?.descricao !== undefined) {
    atualizacao.descricao = String(body.descricao || "").trim() || null;
  }

  if (body?.status !== undefined) {
    const status = String(body.status || "");

    if (!["ativo", "inativo"].includes(status)) {
      return NextResponse.json(
        { ok: false, error: "Status invalido." },
        { status: 400 }
      );
    }

    atualizacao.status = status;
  }

  if (Object.keys(atualizacao).length === 0) {
    return NextResponse.json(
      { ok: false, error: "Nenhum campo valido enviado." },
      { status: 400 }
    );
  }

  const { data, error } = await getSupabaseAdmin()
    .from("rastreamento_origens")
    .update({
      ...atualizacao,
      updated_by: acesso.usuario.id,
    })
    .eq("empresa_id", acesso.usuario.empresa_id)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    const mensagem =
      error.code === "23505"
        ? "Ja existe uma origem com esse nome."
        : error.message;

    return NextResponse.json({ ok: false, error: mensagem }, { status: 400 });
  }

  return NextResponse.json({ ok: true, origem: data });
}
