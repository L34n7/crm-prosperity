import { NextResponse } from "next/server";
import { podeVisualizarConversas } from "@/lib/auth/authorization";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { usuarioPodeAcessarIntegracaoWhatsapp } from "@/lib/whatsapp/integracoes-multiplas";
import { usuarioPodeVisualizarConversa } from "@/lib/conversas/visibilidade";

export async function GET(
  _: Request,
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

  if (!(await podeVisualizarConversas(usuario))) {
    return NextResponse.json(
      { ok: false, error: "Sem permissão para visualizar esta conversa" },
      { status: 403 }
    );
  }

  if (!usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuário sem empresa vinculada" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  const { data: conversa, error: conversaError } = await supabase
    .from("conversas")
    .select("id, empresa_id, contato_id, setor_id, responsavel_id, status, escopo_fila, integracao_whatsapp_id")
    .eq("id", id)
    .eq("empresa_id", usuario.empresa_id)
    .maybeSingle();

  if (conversaError) {
    return NextResponse.json(
      { ok: false, error: conversaError.message },
      { status: 500 }
    );
  }

  if (!conversa?.contato_id) {
    return NextResponse.json(
      { ok: false, error: "Conversa ou contato não encontrado" },
      { status: 404 }
    );
  }

  if (!(await usuarioPodeVisualizarConversa(usuario, conversa))) {
    return NextResponse.json(
      { ok: false, error: "Sem permissão para visualizar esta conversa" },
      { status: 403 }
    );
  }

  if (
    conversa.integracao_whatsapp_id &&
    !(await usuarioPodeAcessarIntegracaoWhatsapp({
      usuario,
      empresaId: usuario.empresa_id,
      integracaoId: conversa.integracao_whatsapp_id,
    }))
  ) {
    return NextResponse.json(
      { ok: false, error: "Sem acesso a esta integração WhatsApp" },
      { status: 403 }
    );
  }

  const { data, error } = await supabase
    .from("contato_informacoes_captura")
    .select(
      "id, tipo, nome_campo, sequencia, valor, variavel_origem, capturado_em, atualizado_em, automacao_fluxos(nome)"
    )
    .eq("empresa_id", usuario.empresa_id)
    .eq("contato_id", conversa.contato_id)
    .eq("ativo", true)
    .order("capturado_em", { ascending: true });

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    contato_id: conversa.contato_id,
    informacoes: data || [],
  });
}
