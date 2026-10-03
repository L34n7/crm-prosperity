import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();

function objeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
}

export async function POST(request: Request) {
  const contexto = await getUsuarioContexto({ sincronizarAssinatura: false });

  if (!contexto.ok) {
    return NextResponse.json(
      { ok: false, error: contexto.error },
      { status: contexto.status }
    );
  }

  const { usuario } = contexto;

  if (!usuario.empresa_id || !usuario.is_admin) {
    return NextResponse.json(
      { ok: false, error: "Apenas administradores podem reativar as automações." },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const ids = Array.isArray(body?.integracoes_ids)
    ? body.integracoes_ids.map((id: unknown) => String(id || "").trim()).filter(Boolean)
    : [];

  if (ids.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Nenhuma integração informada." },
      { status: 400 }
    );
  }

  const { data: integracoes, error } = await supabaseAdmin
    .from("integracoes_whatsapp")
    .select("id, meta_saude_raw_json")
    .eq("empresa_id", usuario.empresa_id)
    .in("id", ids);

  if (error) {
    return NextResponse.json(
      { ok: false, error: "Não foi possível carregar as integrações." },
      { status: 500 }
    );
  }

  const agora = new Date().toISOString();
  let reativadas = 0;

  for (const integracao of integracoes || []) {
    const rawAnterior = objeto(integracao.meta_saude_raw_json);
    const bloqueioAnterior = objeto(rawAnterior.bloqueio_financeiro_meta);

    if (bloqueioAnterior.ativo !== true) continue;

    const { error: updateError } = await supabaseAdmin
      .from("integracoes_whatsapp")
      .update({
        meta_saude_raw_json: {
          ...rawAnterior,
          bloqueio_financeiro_meta: {
            ...bloqueioAnterior,
            ativo: false,
            reativado_em: agora,
            reativado_por: usuario.id,
            origem_reativacao: "confirmacao_admin_crm",
          },
        },
        updated_at: agora,
      })
      .eq("empresa_id", usuario.empresa_id)
      .eq("id", integracao.id);

    if (!updateError) reativadas += 1;
  }

  return NextResponse.json({
    ok: true,
    reativadas,
    aviso:
      "As automações foram liberadas para novas execuções. Se a Meta continuar recusando a cobrança, o bloqueio será aplicado novamente automaticamente.",
  });
}
