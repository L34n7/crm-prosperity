import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";

const supabaseAdmin = getSupabaseAdmin();

const NOME_MAX = 30;
const DESCRICAO_MAX = 120;

function normalizarCorHex(cor?: string) {
  const valor = (cor || "").trim().toUpperCase();

  if (!/^#([0-9A-F]{6})$/.test(valor)) {
    return null;
  }

  return valor;
}

export async function GET() {
  const resultado = await getUsuarioContexto();

  if (!resultado.ok) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status }
    );
  }

  const { usuario } = resultado;

  if (!usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuário sem empresa vinculada" },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("etiquetas")
    .select("id, nome, descricao, cor, ativo, ordem, created_at, updated_at")
    .eq("empresa_id", usuario.empresa_id)
    .eq("ativo", true)
    .order("ordem", { ascending: true })
    .order("nome", { ascending: true });

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    etiquetas: data ?? [],
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

  if (!usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuário sem empresa vinculada" },
      { status: 400 }
    );
  }

  const body = await request.json();

  const nome = body?.nome?.trim();
  const descricao = body?.descricao?.trim() || null;
  const cor = normalizarCorHex(body?.cor);

  if (!nome) {
    return NextResponse.json(
      { ok: false, error: "Nome da etiqueta é obrigatório" },
      { status: 400 }
    );
  }

  if (nome.length > NOME_MAX) {
    return NextResponse.json(
      { ok: false, error: `Nome deve ter no máximo ${NOME_MAX} caracteres` },
      { status: 400 }
    );
  }

  if (descricao && descricao.length > DESCRICAO_MAX) {
    return NextResponse.json(
      {
        ok: false,
        error: `Descrição deve ter no máximo ${DESCRICAO_MAX} caracteres`,
      },
      { status: 400 }
    );
  }

  if (!cor) {
    return NextResponse.json(
      { ok: false, error: "Cor inválida. Use formato HEX, ex: #FACC15" },
      { status: 400 }
    );
  }

  const { data: ultimaEtiqueta } = await supabaseAdmin
    .from("etiquetas")
    .select("ordem")
    .eq("empresa_id", usuario.empresa_id)
    .order("ordem", { ascending: false })
    .limit(1)
    .maybeSingle();

  const proximaOrdem = (ultimaEtiqueta?.ordem ?? 0) + 1;

  const { data, error } = await supabaseAdmin
    .from("etiquetas")
    .insert({
      empresa_id: usuario.empresa_id,
      nome,
      descricao,
      cor,
      ativo: true,
      ordem: proximaOrdem,
    })
    .select("id, nome, descricao, cor, ativo, ordem, created_at, updated_at")
    .single();

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Etiqueta criada com sucesso",
    etiqueta: data,
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

  if (!usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuário sem empresa vinculada" },
      { status: 400 }
    );
  }

  const body = await request.json();

  const etiquetaId = body?.etiqueta_id;
  const nome = body?.nome?.trim();
  const descricao = body?.descricao?.trim() || null;
  const cor = normalizarCorHex(body?.cor);

  if (!etiquetaId) {
    return NextResponse.json(
      { ok: false, error: "etiqueta_id é obrigatório" },
      { status: 400 }
    );
  }

  if (!nome) {
    return NextResponse.json(
      { ok: false, error: "Nome da etiqueta é obrigatório" },
      { status: 400 }
    );
  }

  if (nome.length > NOME_MAX) {
    return NextResponse.json(
      { ok: false, error: `Nome deve ter no máximo ${NOME_MAX} caracteres` },
      { status: 400 }
    );
  }

  if (descricao && descricao.length > DESCRICAO_MAX) {
    return NextResponse.json(
      {
        ok: false,
        error: `Descrição deve ter no máximo ${DESCRICAO_MAX} caracteres`,
      },
      { status: 400 }
    );
  }

  if (!cor) {
    return NextResponse.json(
      { ok: false, error: "Cor inválida. Use formato HEX, ex: #FACC15" },
      { status: 400 }
    );
  }

  const { data: etiquetaExistente, error: etiquetaExistenteError } =
    await supabaseAdmin
      .from("etiquetas")
      .select("id, empresa_id")
      .eq("id", etiquetaId)
      .maybeSingle();

  if (etiquetaExistenteError) {
    return NextResponse.json(
      { ok: false, error: etiquetaExistenteError.message },
      { status: 500 }
    );
  }

  if (!etiquetaExistente || etiquetaExistente.empresa_id !== usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Etiqueta não encontrada" },
      { status: 404 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("etiquetas")
    .update({
      nome,
      descricao,
      cor,
      updated_at: new Date().toISOString(),
    })
    .eq("id", etiquetaId)
    .eq("empresa_id", usuario.empresa_id)
    .select("id, nome, descricao, cor, ativo, ordem, created_at, updated_at")
    .single();

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Etiqueta atualizada com sucesso",
    etiqueta: data,
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

  if (!usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuário sem empresa vinculada" },
      { status: 400 }
    );
  }

  const body = await request.json();
  const etiquetaId = body?.etiqueta_id;

  if (!etiquetaId) {
    return NextResponse.json(
      { ok: false, error: "etiqueta_id é obrigatório" },
      { status: 400 }
    );
  }

  const { data: etiquetaExistente, error: etiquetaExistenteError } =
    await supabaseAdmin
      .from("etiquetas")
      .select("id, empresa_id")
      .eq("id", etiquetaId)
      .maybeSingle();

  if (etiquetaExistenteError) {
    return NextResponse.json(
      { ok: false, error: etiquetaExistenteError.message },
      { status: 500 }
    );
  }

  if (!etiquetaExistente || etiquetaExistente.empresa_id !== usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Etiqueta não encontrada" },
      { status: 404 }
    );
  }

  const { error: limparConversasError } = await supabaseAdmin
    .from("conversas")
    .update({
      etiqueta_id: null,
      etiqueta_cor: null,
      updated_at: new Date().toISOString(),
    })
    .eq("empresa_id", usuario.empresa_id)
    .eq("etiqueta_id", etiquetaId);

  if (limparConversasError) {
    return NextResponse.json(
      { ok: false, error: limparConversasError.message },
      { status: 500 }
    );
  }

  const { error } = await supabaseAdmin
    .from("etiquetas")
    .delete()
    .eq("id", etiquetaId)
    .eq("empresa_id", usuario.empresa_id);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Etiqueta excluída com sucesso",
  });
}