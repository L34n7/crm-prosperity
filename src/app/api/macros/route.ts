import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";

const supabaseAdmin = getSupabaseAdmin();

const TITULO_MAX = 80;
const CONTEUDO_MAX = 4000;

type ChatMacroRow = {
  id: string;
  titulo: string;
  conteudo: string;
  ativo: boolean;
  ordem: number;
  created_at: string;
  updated_at: string;
};

type MacroInput = {
  macro_id?: unknown;
  titulo?: unknown;
  conteudo?: unknown;
};

function normalizarTexto(valor: unknown) {
  return String(valor || "").trim();
}

function gerarTituloPadrao(conteudo: string) {
  const primeiraLinha = conteudo
    .split(/\r?\n/)
    .map((linha) => linha.trim())
    .find(Boolean);

  return (primeiraLinha || "Nova macro").slice(0, TITULO_MAX);
}

async function validarContexto() {
  const resultado = await getUsuarioContexto();

  if (!resultado.ok) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: resultado.error },
        { status: resultado.status }
      ),
    };
  }

  const { usuario } = resultado;

  if (!usuario.empresa_id) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada" },
        { status: 400 }
      ),
    };
  }

  return {
    ok: true as const,
    usuario,
    empresaId: usuario.empresa_id,
  };
}

function validarMacroInput(body: MacroInput) {
  const conteudo = normalizarTexto(body?.conteudo);
  const titulo = normalizarTexto(body?.titulo) || gerarTituloPadrao(conteudo);

  if (!titulo) {
    return { ok: false as const, error: "Título da macro é obrigatório" };
  }

  if (titulo.length > TITULO_MAX) {
    return {
      ok: false as const,
      error: `Título deve ter no máximo ${TITULO_MAX} caracteres`,
    };
  }

  if (!conteudo) {
    return { ok: false as const, error: "Texto da macro é obrigatório" };
  }

  if (conteudo.length > CONTEUDO_MAX) {
    return {
      ok: false as const,
      error: `Texto deve ter no máximo ${CONTEUDO_MAX} caracteres`,
    };
  }

  return { ok: true as const, titulo, conteudo };
}

export async function GET() {
  const contexto = await validarContexto();

  if (!contexto.ok) return contexto.response;

  const { data, error } = await supabaseAdmin
    .from("chat_macros")
    .select("id, titulo, conteudo, ativo, ordem, created_at, updated_at")
    .eq("empresa_id", contexto.empresaId)
    .eq("usuario_id", contexto.usuario.id)
    .eq("ativo", true)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    macros: (data ?? []) as ChatMacroRow[],
  });
}

export async function POST(request: Request) {
  const contexto = await validarContexto();

  if (!contexto.ok) return contexto.response;

  const body = await request.json();
  const validacao = validarMacroInput(body);

  if (!validacao.ok) {
    return NextResponse.json(
      { ok: false, error: validacao.error },
      { status: 400 }
    );
  }

  const { data: ultimaMacro } = await supabaseAdmin
    .from("chat_macros")
    .select("ordem")
    .eq("empresa_id", contexto.empresaId)
    .eq("usuario_id", contexto.usuario.id)
    .order("ordem", { ascending: false })
    .limit(1)
    .maybeSingle();

  const proximaOrdem = (ultimaMacro?.ordem ?? 0) + 1;

  const { data, error } = await supabaseAdmin
    .from("chat_macros")
    .insert({
      empresa_id: contexto.empresaId,
      usuario_id: contexto.usuario.id,
      titulo: validacao.titulo,
      conteudo: validacao.conteudo,
      ativo: true,
      ordem: proximaOrdem,
    })
    .select("id, titulo, conteudo, ativo, ordem, created_at, updated_at")
    .single();

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Macro criada com sucesso",
    macro: data,
  });
}

export async function PUT(request: Request) {
  const contexto = await validarContexto();

  if (!contexto.ok) return contexto.response;

  const body = await request.json();
  const macroId = normalizarTexto(body?.macro_id);
  const validacao = validarMacroInput(body);

  if (!macroId) {
    return NextResponse.json(
      { ok: false, error: "macro_id é obrigatório" },
      { status: 400 }
    );
  }

  if (!validacao.ok) {
    return NextResponse.json(
      { ok: false, error: validacao.error },
      { status: 400 }
    );
  }

  const { data: macroExistente, error: buscarError } = await supabaseAdmin
    .from("chat_macros")
    .select("id")
    .eq("id", macroId)
    .eq("empresa_id", contexto.empresaId)
    .eq("usuario_id", contexto.usuario.id)
    .eq("ativo", true)
    .maybeSingle();

  if (buscarError) {
    return NextResponse.json(
      { ok: false, error: buscarError.message },
      { status: 500 }
    );
  }

  if (!macroExistente) {
    return NextResponse.json(
      { ok: false, error: "Macro não encontrada" },
      { status: 404 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("chat_macros")
    .update({
      titulo: validacao.titulo,
      conteudo: validacao.conteudo,
      updated_at: new Date().toISOString(),
    })
    .eq("id", macroId)
    .eq("empresa_id", contexto.empresaId)
    .eq("usuario_id", contexto.usuario.id)
    .select("id, titulo, conteudo, ativo, ordem, created_at, updated_at")
    .single();

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Macro atualizada com sucesso",
    macro: data,
  });
}

export async function DELETE(request: Request) {
  const contexto = await validarContexto();

  if (!contexto.ok) return contexto.response;

  const body = await request.json();
  const macroId = normalizarTexto(body?.macro_id);

  if (!macroId) {
    return NextResponse.json(
      { ok: false, error: "macro_id é obrigatório" },
      { status: 400 }
    );
  }

  const { data: macroExistente, error: buscarError } = await supabaseAdmin
    .from("chat_macros")
    .select("id")
    .eq("id", macroId)
    .eq("empresa_id", contexto.empresaId)
    .eq("usuario_id", contexto.usuario.id)
    .eq("ativo", true)
    .maybeSingle();

  if (buscarError) {
    return NextResponse.json(
      { ok: false, error: buscarError.message },
      { status: 500 }
    );
  }

  if (!macroExistente) {
    return NextResponse.json(
      { ok: false, error: "Macro não encontrada" },
      { status: 404 }
    );
  }

  const { error } = await supabaseAdmin
    .from("chat_macros")
    .update({
      ativo: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", macroId)
    .eq("empresa_id", contexto.empresaId)
    .eq("usuario_id", contexto.usuario.id);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Macro removida com sucesso",
  });
}
