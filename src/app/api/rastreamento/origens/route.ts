import { NextResponse } from "next/server";
import { obterAcessoRastreamento } from "@/lib/rastreamento/api";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  const acesso = await obterAcessoRastreamento("rastreamento.visualizar");

  if (!acesso.ok) {
    return NextResponse.json(
      { ok: false, error: acesso.error },
      { status: acesso.status }
    );
  }

  const { data, error } = await getSupabaseAdmin()
    .from("rastreamento_origens")
    .select("*")
    .eq("empresa_id", acesso.usuario.empresa_id)
    .order("nome", { ascending: true });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, origens: data || [] });
}

export async function POST(request: Request) {
  const acesso = await obterAcessoRastreamento("rastreamento.gerenciar");

  if (!acesso.ok) {
    return NextResponse.json(
      { ok: false, error: acesso.error },
      { status: acesso.status }
    );
  }

  const body = await request.json();
  const nome = String(body?.nome || "").trim();
  const descricao = String(body?.descricao || "").trim() || null;

  if (nome.length < 2) {
    return NextResponse.json(
      { ok: false, error: "Informe o nome da origem." },
      { status: 400 }
    );
  }

  const { data, error } = await getSupabaseAdmin()
    .from("rastreamento_origens")
    .insert({
      empresa_id: acesso.usuario.empresa_id,
      nome,
      descricao,
      created_by: acesso.usuario.id,
      updated_by: acesso.usuario.id,
    })
    .select("*")
    .single();

  if (error) {
    const mensagem =
      error.code === "23505"
        ? "Ja existe uma origem com esse nome."
        : error.message;

    return NextResponse.json({ ok: false, error: mensagem }, { status: 400 });
  }

  return NextResponse.json({ ok: true, origem: data }, { status: 201 });
}
