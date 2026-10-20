
import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { buscarWhiteLabelAdminPorUsuario } from "@/lib/white-label/acesso";

const supabaseAdmin = getSupabaseAdmin();

export async function GET() {
  const contexto = await getUsuarioContexto({ ignorarAcessoTemporario: true });

  if (!contexto.ok) {
    return NextResponse.json(
      { ok: false, error: contexto.error },
      { status: contexto.status }
    );
  }

  const admin =
    contexto.usuario.white_label_admin ||
    (await buscarWhiteLabelAdminPorUsuario(contexto.usuario));

  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "Acesso restrito ao administrador White Label." },
      { status: 403 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("planos")
    .select(
      "id, nome, slug, limite_usuarios, limite_integracoes_whatsapp, permite_ia, permite_dashboard, permite_chatbot"
    )
    .eq("status", "ativo")
    .order("preco_mensal_centavos", { ascending: true });

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, planos: data ?? [] });
}
