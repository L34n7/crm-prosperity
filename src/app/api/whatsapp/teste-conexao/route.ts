import { NextResponse } from "next/server";
import { getUsuarioBasico } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();

type IntegracaoWhatsapp = {
  id: string;
  nome_conexao: string | null;
  numero: string | null;
  setup_completed_at: string | null;
  created_at: string | null;
};

export async function GET() {
  const resultado = await getUsuarioBasico();

  if (!resultado.ok) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status }
    );
  }

  const empresaId = resultado.usuario.empresa_id;

  if (!empresaId) {
    return NextResponse.json(
      { ok: true, pendentes: [] },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  }

  const { data: integracoes, error } = await supabaseAdmin
    .from("integracoes_whatsapp")
    .select("id,nome_conexao,numero,setup_completed_at,created_at")
    .eq("empresa_id", empresaId)
    .eq("provider", "meta_official")
    .eq("status", "ativa")
    .eq("onboarding_status", "concluido")
    .not("phone_number_id", "is", null)
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const pendentes = [];

  for (const integracao of (integracoes || []) as IntegracaoWhatsapp[]) {
    const concluidaEm = integracao.setup_completed_at || integracao.created_at;

    if (!concluidaEm) continue;

    const { data: conversa, error: conversaError } = await supabaseAdmin
      .from("conversas")
      .select("id,last_inbound_message_at")
      .eq("empresa_id", empresaId)
      .eq("integracao_whatsapp_id", integracao.id)
      .not("last_inbound_message_at", "is", null)
      .gte("last_inbound_message_at", concluidaEm)
      .order("last_inbound_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (conversaError) {
      return NextResponse.json(
        { ok: false, error: conversaError.message },
        { status: 500 }
      );
    }

    if (!conversa) {
      pendentes.push({
        id: integracao.id,
        nome_conexao: integracao.nome_conexao,
        numero: integracao.numero,
        setup_completed_at: concluidaEm,
      });
    }
  }

  return NextResponse.json(
    { ok: true, pendentes },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
