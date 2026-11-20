import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { podeVisualizarConversas } from "@/lib/auth/authorization";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { usuarioPodeAcessarIntegracaoWhatsapp } from "@/lib/whatsapp/integracoes-multiplas";
import { usuarioPodeVisualizarConversa } from "@/lib/conversas/visibilidade";

export const dynamic = "force-dynamic";

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
  if (!usuario.empresa_id || !(await podeVisualizarConversas(usuario))) {
    return NextResponse.json(
      { ok: false, error: "Sem permissão para visualizar conversas." },
      { status: 403 }
    );
  }

  const supabase = getSupabaseAdmin();
  const { data: conversa, error: conversaError } = await supabase
    .from("conversas")
    .select("id, empresa_id, contato_id, setor_id, responsavel_id, bot_ativo, status, escopo_fila, integracao_whatsapp_id")
    .eq("empresa_id", usuario.empresa_id)
    .eq("id", id)
    .maybeSingle();

  if (conversaError) {
    return NextResponse.json(
      { ok: false, error: conversaError.message },
      { status: 500 }
    );
  }
  if (!conversa?.contato_id) {
    return NextResponse.json(
      { ok: false, error: "Conversa ou contato não encontrado." },
      { status: 404 }
    );
  }

  if (!(await usuarioPodeVisualizarConversa(usuario, conversa))) {
    return NextResponse.json(
      { ok: false, error: "Sem permissão para visualizar esta conversa." },
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
      { ok: false, error: "Sem acesso a esta integração WhatsApp." },
      { status: 403 }
    );
  }

  const [contatoResultado, historicoResultado] = await Promise.all([
    supabase
      .from("contatos")
      .select("id, classificacao, status_lead")
      .eq("empresa_id", usuario.empresa_id)
      .eq("id", conversa.contato_id)
      .maybeSingle(),
    supabase
      .from("lead_classificacao_historico")
      .select("id, classificacao_nova, origem, motivo, valor_conversao, criado_em")
      .eq("empresa_id", usuario.empresa_id)
      .eq("contato_id", conversa.contato_id)
      .order("criado_em", { ascending: false })
      .limit(60),
  ]);

  if (contatoResultado.error || historicoResultado.error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          contatoResultado.error?.message ||
          historicoResultado.error?.message ||
          "Falha ao consultar classificação.",
      },
      { status: 500 }
    );
  }
  if (!contatoResultado.data) {
    return NextResponse.json(
      { ok: false, error: "Contato não encontrado." },
      { status: 404 }
    );
  }

  // Somente mudanças reais são armazenadas; a ordem cronológica favorece
  // a leitura como linha do tempo, sem etapas consecutivas repetidas.
  return NextResponse.json(
    {
      ok: true,
      classificacao:
        contatoResultado.data.classificacao ||
        contatoResultado.data.status_lead ||
        null,
      historico: (historicoResultado.data || []).reverse(),
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
