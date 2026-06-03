import { NextResponse } from "next/server";
import { obterAcessoRastreamento } from "@/lib/rastreamento/api";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const TIPOS_MANUAIS = ["venda_realizada", "venda_perdida"];

export async function GET(request: Request) {
  const acesso = await obterAcessoRastreamento("rastreamento.visualizar");

  if (!acesso.ok) {
    return NextResponse.json(
      { ok: false, error: acesso.error },
      { status: acesso.status }
    );
  }

  const { searchParams } = new URL(request.url);
  const tipo = String(searchParams.get("tipo") || "").trim();
  const limite = Math.min(200, Math.max(1, Number(searchParams.get("limite") || 100)));
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("rastreamento_eventos")
    .select(`
      *,
      contatos ( id, nome, telefone ),
      conversas ( id ),
      rastreamento_origens ( id, nome ),
      rastreamento_campanhas ( id, nome ),
      rastreamento_links ( id, nome, slug )
    `)
    .eq("empresa_id", acesso.usuario.empresa_id)
    .order("ocorrido_em", { ascending: false })
    .limit(limite);

  if (tipo) {
    query = query.eq("tipo", tipo);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, eventos: data || [] });
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
  const tipo = String(body?.tipo || "").trim();
  const contatoId = String(body?.contato_id || "").trim() || null;
  const conversaId = String(body?.conversa_id || "").trim() || null;
  const valorInformado = body?.valor === "" || body?.valor == null
    ? null
    : Number(body.valor);

  if (!TIPOS_MANUAIS.includes(tipo)) {
    return NextResponse.json(
      { ok: false, error: "Tipo de evento manual invalido." },
      { status: 400 }
    );
  }

  if (!contatoId && !conversaId) {
    return NextResponse.json(
      { ok: false, error: "Selecione um contato ou informe uma conversa." },
      { status: 400 }
    );
  }

  if (valorInformado !== null && (!Number.isFinite(valorInformado) || valorInformado < 0)) {
    return NextResponse.json(
      { ok: false, error: "Informe um valor valido." },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();

  if (contatoId) {
    const { data: contato } = await supabase
      .from("contatos")
      .select("id")
      .eq("empresa_id", acesso.usuario.empresa_id)
      .eq("id", contatoId)
      .maybeSingle();

    if (!contato) {
      return NextResponse.json(
        { ok: false, error: "Contato nao encontrado." },
        { status: 404 }
      );
    }
  }

  if (conversaId) {
    const { data: conversa } = await supabase
      .from("conversas")
      .select("id")
      .eq("empresa_id", acesso.usuario.empresa_id)
      .eq("id", conversaId)
      .maybeSingle();

    if (!conversa) {
      return NextResponse.json(
        { ok: false, error: "Conversa nao encontrada." },
        { status: 404 }
      );
    }
  }

  const { error } = await supabase.rpc("rastreamento_criar_evento", {
    p_empresa_id: acesso.usuario.empresa_id,
    p_tipo: tipo,
    p_contato_id: contatoId,
    p_conversa_id: conversaId,
    p_valor: valorInformado,
    p_origem_registro: "manual",
    p_created_by: acesso.usuario.id,
  });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
