import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getUsuarioContexto,
  type UsuarioContexto,
} from "@/lib/auth/get-usuario-contexto";
import { usuarioPodeAcessarIntegracaoWhatsapp } from "@/lib/whatsapp/integracoes-multiplas";

const supabaseAdmin = getSupabaseAdmin();

type ConversaBase = {
  id: string;
  empresa_id: string;
  integracao_whatsapp_id?: string | null;
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

  const { usuario } = resultado;
  const conversaPermitida = await buscarConversaPermitida(id, usuario);

  if (!conversaPermitida.ok) {
    return conversaPermitida.response;
  }

  const empresaId = conversaPermitida.conversa.empresa_id;

  const { data: listas, error: listasError } = await supabaseAdmin
    .from("conversas_listas")
    .select("id, nome")
    .eq("empresa_id", empresaId)
    .order("nome", { ascending: true });

  if (listasError) {
    return NextResponse.json(
      { ok: false, error: listasError.message },
      { status: 500 }
    );
  }

  const { data: itens, error: itensError } = await supabaseAdmin
    .from("conversas_listas_itens")
    .select("lista_id")
    .eq("empresa_id", empresaId)
    .eq("conversa_id", id);

  if (itensError) {
    return NextResponse.json(
      { ok: false, error: itensError.message },
      { status: 500 }
    );
  }

  const listasMarcadas = new Set((itens ?? []).map((item) => item.lista_id));
  const resultadoListas = (listas ?? []).map((lista) => ({
    ...lista,
    marcada: listasMarcadas.has(lista.id),
  }));

  return NextResponse.json({
    ok: true,
    listas: resultadoListas,
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

  const { usuario } = resultado;
  const body = await request.json();
  const listaId = body?.lista_id;

  if (!listaId) {
    return NextResponse.json(
      { ok: false, error: "lista_id e obrigatorio" },
      { status: 400 }
    );
  }

  const conversaPermitida = await buscarConversaPermitida(id, usuario);

  if (!conversaPermitida.ok) {
    return conversaPermitida.response;
  }

  const empresaId = conversaPermitida.conversa.empresa_id;

  const { data: lista } = await supabaseAdmin
    .from("conversas_listas")
    .select("id, empresa_id")
    .eq("id", listaId)
    .maybeSingle();

  if (!lista || lista.empresa_id !== empresaId) {
    return NextResponse.json(
      { ok: false, error: "Lista nao encontrada" },
      { status: 404 }
    );
  }

  const { error } = await supabaseAdmin
    .from("conversas_listas_itens")
    .upsert(
      {
        empresa_id: empresaId,
        lista_id: listaId,
        conversa_id: id,
        criado_por: usuario.id,
      },
      { onConflict: "lista_id,conversa_id" }
    );

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Conversa adicionada a lista com sucesso",
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

  const { usuario } = resultado;
  const body = await request.json();
  const listaId = body?.lista_id;

  if (!listaId) {
    return NextResponse.json(
      { ok: false, error: "lista_id e obrigatorio" },
      { status: 400 }
    );
  }

  const conversaPermitida = await buscarConversaPermitida(id, usuario);

  if (!conversaPermitida.ok) {
    return conversaPermitida.response;
  }

  const empresaId = conversaPermitida.conversa.empresa_id;

  const { error } = await supabaseAdmin
    .from("conversas_listas_itens")
    .delete()
    .eq("empresa_id", empresaId)
    .eq("conversa_id", id)
    .eq("lista_id", listaId);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Conversa removida da lista com sucesso",
  });
}
