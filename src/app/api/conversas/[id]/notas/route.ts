import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getUsuarioContexto,
  type UsuarioContexto,
} from "@/lib/auth/get-usuario-contexto";
import { usuarioPodeAcessarIntegracaoWhatsapp } from "@/lib/whatsapp/integracoes-multiplas";

const supabaseAdmin = getSupabaseAdmin();
const LIMITE_CARACTERES_NOTA = 600;

type ConversaBase = {
  id: string;
  empresa_id: string;
  integracao_whatsapp_id?: string | null;
};

type NotaBase = {
  id: string;
  empresa_id: string;
  conversa_id: string;
};

async function buscarConversaPermitida(
  conversaId: string,
  usuario: UsuarioContexto
) {
  if (!usuario.empresa_id) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "Usuario sem empresa vinculada" },
        { status: 400 }
      ),
    };
  }

  const { data: conversa, error: conversaError } = await supabaseAdmin
    .from("conversas")
    .select("id, empresa_id, integracao_whatsapp_id")
    .eq("id", conversaId)
    .maybeSingle<ConversaBase>();

  if (conversaError) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: conversaError.message },
        { status: 500 }
      ),
    };
  }

  if (!conversa || conversa.empresa_id !== usuario.empresa_id) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "Conversa nao encontrada" },
        { status: 404 }
      ),
    };
  }

  const podeAcessarIntegracao = await usuarioPodeAcessarIntegracaoWhatsapp({
    usuario,
    empresaId: usuario.empresa_id,
    integracaoId: conversa.integracao_whatsapp_id,
  });

  if (!podeAcessarIntegracao) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "Voce nao pode acessar esta integracao" },
        { status: 403 }
      ),
    };
  }

  return { ok: true as const, conversa };
}

function selectNotaComAutor() {
  return `
    id,
    empresa_id,
    conversa_id,
    autor_id,
    conteudo,
    created_at,
    updated_at,
    autor:usuarios (
      id,
      nome,
      email
    )
  `;
}

export async function GET(
  _request: Request,
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

  const conversaPermitida = await buscarConversaPermitida(
    id,
    resultado.usuario
  );

  if (!conversaPermitida.ok) {
    return conversaPermitida.response;
  }

  const empresaId = conversaPermitida.conversa.empresa_id;

  const { data, error } = await supabaseAdmin
    .from("conversas_notas")
    .select(selectNotaComAutor())
    .eq("empresa_id", empresaId)
    .eq("conversa_id", id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    notas: data ?? [],
  });
}

export async function POST(
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

  const body = await request.json();
  const conteudo = String(body?.conteudo || "").trim();

  if (!conteudo) {
    return NextResponse.json(
      { ok: false, error: "Conteudo da nota e obrigatorio" },
      { status: 400 }
    );
  }

  if (conteudo.length > LIMITE_CARACTERES_NOTA) {
    return NextResponse.json(
      {
        ok: false,
        error: `A nota pode ter no maximo ${LIMITE_CARACTERES_NOTA} caracteres.`,
      },
      { status: 400 }
    );
  }

  const conversaPermitida = await buscarConversaPermitida(
    id,
    resultado.usuario
  );

  if (!conversaPermitida.ok) {
    return conversaPermitida.response;
  }

  const empresaId = conversaPermitida.conversa.empresa_id;

  const { data, error } = await supabaseAdmin
    .from("conversas_notas")
    .insert({
      empresa_id: empresaId,
      conversa_id: id,
      autor_id: resultado.usuario.id,
      conteudo,
    })
    .select(selectNotaComAutor())
    .single();

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Nota criada com sucesso",
    nota: data,
  });
}

export async function PUT(
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

  const body = await request.json();
  const notaId = body?.nota_id;
  const conteudo = String(body?.conteudo || "").trim();

  if (!notaId) {
    return NextResponse.json(
      { ok: false, error: "nota_id e obrigatorio" },
      { status: 400 }
    );
  }

  if (!conteudo) {
    return NextResponse.json(
      { ok: false, error: "Conteudo da nota e obrigatorio" },
      { status: 400 }
    );
  }

  if (conteudo.length > LIMITE_CARACTERES_NOTA) {
    return NextResponse.json(
      {
        ok: false,
        error: `A nota pode ter no maximo ${LIMITE_CARACTERES_NOTA} caracteres.`,
      },
      { status: 400 }
    );
  }

  const conversaPermitida = await buscarConversaPermitida(
    id,
    resultado.usuario
  );

  if (!conversaPermitida.ok) {
    return conversaPermitida.response;
  }

  const empresaId = conversaPermitida.conversa.empresa_id;

  const { data: nota, error: notaError } = await supabaseAdmin
    .from("conversas_notas")
    .select("id, empresa_id, conversa_id")
    .eq("id", notaId)
    .eq("empresa_id", empresaId)
    .eq("conversa_id", id)
    .maybeSingle<NotaBase>();

  if (notaError) {
    return NextResponse.json(
      { ok: false, error: notaError.message },
      { status: 500 }
    );
  }

  if (!nota) {
    return NextResponse.json(
      { ok: false, error: "Nota nao encontrada" },
      { status: 404 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("conversas_notas")
    .update({
      conteudo,
      updated_at: new Date().toISOString(),
    })
    .eq("id", notaId)
    .eq("empresa_id", empresaId)
    .select(selectNotaComAutor())
    .single();

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Nota atualizada com sucesso",
    nota: data,
  });
}

export async function DELETE(
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

  const body = await request.json();
  const notaId = body?.nota_id;

  if (!notaId) {
    return NextResponse.json(
      { ok: false, error: "nota_id e obrigatorio" },
      { status: 400 }
    );
  }

  const conversaPermitida = await buscarConversaPermitida(
    id,
    resultado.usuario
  );

  if (!conversaPermitida.ok) {
    return conversaPermitida.response;
  }

  const empresaId = conversaPermitida.conversa.empresa_id;

  const { data: nota, error: notaError } = await supabaseAdmin
    .from("conversas_notas")
    .select("id, empresa_id, conversa_id")
    .eq("id", notaId)
    .eq("empresa_id", empresaId)
    .eq("conversa_id", id)
    .maybeSingle<NotaBase>();

  if (notaError) {
    return NextResponse.json(
      { ok: false, error: notaError.message },
      { status: 500 }
    );
  }

  if (!nota) {
    return NextResponse.json(
      { ok: false, error: "Nota nao encontrada" },
      { status: 404 }
    );
  }

  const { error } = await supabaseAdmin
    .from("conversas_notas")
    .delete()
    .eq("id", notaId)
    .eq("empresa_id", empresaId);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Nota excluida com sucesso",
  });
}
