import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { bloquearSemPermissao } from "@/lib/permissoes/servidor";

const supabaseAdmin = getSupabaseAdmin();

export async function GET() {
  const resultado = await getUsuarioContexto();

  if (!resultado.ok) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status }
    );
  }

  const { usuario } = resultado;
  const bloqueio = bloquearSemPermissao(usuario, "conversas.visualizar");
  if (bloqueio) return bloqueio;

  if (!usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuário sem empresa vinculada" },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("conversas_listas")
    .select("id, nome, created_at, updated_at, exibir_atalho_conversas, ordem_exibicao")
    .eq("empresa_id", usuario.empresa_id)
    .order("ordem_exibicao", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    listas: data ?? [],
  });
}

export async function POST(request: Request) {
  const resultado = await getUsuarioContexto();

  if (!resultado.ok) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status }
    );
  }

  const { usuario } = resultado;
  const bloqueio = bloquearSemPermissao(usuario, "conversas.gerenciar_listas");
  if (bloqueio) return bloqueio;

  if (!usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuário sem empresa vinculada" },
      { status: 400 }
    );
  }

  const body = await request.json();
  const nome = body?.nome?.trim();

  if (!nome) {
    return NextResponse.json(
      { ok: false, error: "Nome da lista é obrigatório" },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("conversas_listas")
    .insert({
      empresa_id: usuario.empresa_id,
      nome,
      exibir_atalho_conversas: body?.exibir_atalho_conversas === true,
    })
    .select("id, nome, created_at, updated_at, exibir_atalho_conversas, ordem_exibicao")
    .single();

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Lista criada com sucesso",
    lista: data,
  });
}

export async function PUT(request: Request) {
  const resultado = await getUsuarioContexto();

  if (!resultado.ok) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status }
    );
  }

  const { usuario } = resultado;
  const bloqueio = bloquearSemPermissao(usuario, "conversas.gerenciar_listas");
  if (bloqueio) return bloqueio;

  if (!usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuário sem empresa vinculada" },
      { status: 400 }
    );
  }

  const body = await request.json();
  const listaId = body?.lista_id;
  const listaId = String(body?.lista_id || "").trim();
  if (!listaId) {
    return NextResponse.json({ ok: false, error: "lista_id é obrigatório" }, { status: 400 });
  }

  const { data: lista, error: listaError } = await supabaseAdmin
    .from("conversas_listas")
    .select("id, empresa_id, nome, exibir_atalho_conversas")
    .eq("id", listaId).eq("empresa_id", usuario.empresa_id).maybeSingle();

  if (listaError) return NextResponse.json({ ok: false, error: listaError.message }, { status: 500 });
  if (!lista) return NextResponse.json({ ok: false, error: "Lista não encontrada" }, { status: 404 });

  const atualizacoes: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const renomear = typeof body?.nome === "string";
  const alterarAtalho = typeof body?.exibir_atalho_conversas === "boolean";
  if (!renomear && !alterarAtalho) {
    return NextResponse.json({ ok: false, error: "Informe nome ou visibilidade do atalho." }, { status: 400 });
  }
  if (renomear) {
    const nome = body.nome.trim();
    if (!nome || nome.length > 160) return NextResponse.json({ ok: false, error: "Nome inválido (máximo 160 caracteres)." }, { status: 400 });
    atualizacoes.nome = nome;
  }
  if (alterarAtalho) atualizacoes.exibir_atalho_conversas = body.exibir_atalho_conversas;

  const { data, error } = await supabaseAdmin
    .from("conversas_listas")
    .update(atualizacoes)
    .eq("id", listaId).eq("empresa_id", usuario.empresa_id)
    .select("id, nome, created_at, updated_at, exibir_atalho_conversas, ordem_exibicao")
    .single();

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Lista atualizada com sucesso",
    lista: data,
  });
}

export async function DELETE(request: Request) {
  const resultado = await getUsuarioContexto();

  if (!resultado.ok) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status }
    );
  }

  const { usuario } = resultado;
  const bloqueio = bloquearSemPermissao(usuario, "conversas.gerenciar_listas");
  if (bloqueio) return bloqueio;

  if (!usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuário sem empresa vinculada" },
      { status: 400 }
    );
  }

  const body = await request.json();
  const listaId = body?.lista_id;

  if (!listaId) {
    return NextResponse.json(
      { ok: false, error: "lista_id é obrigatório" },
      { status: 400 }
    );
  }

  const { data: lista, error: listaError } = await supabaseAdmin
    .from("conversas_listas")
    .select("id, empresa_id")
    .eq("id", listaId)
    .maybeSingle();

  if (listaError) {
    return NextResponse.json(
      { ok: false, error: listaError.message },
      { status: 500 }
    );
  }

  if (!lista || lista.empresa_id !== usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Lista não encontrada" },
      { status: 404 }
    );
  }

  const { error } = await supabaseAdmin
    .from("conversas_listas")
    .delete()
    .eq("id", listaId)
    .eq("empresa_id", usuario.empresa_id);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Lista excluída com sucesso",
  });
}
