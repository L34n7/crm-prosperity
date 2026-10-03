import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { avaliarLimiteAutomacoesService } from "@/lib/whatsapp/service-quota";

const supabaseAdmin = getSupabaseAdmin();

function inteiroNaoNegativo(valor: unknown) {
  const parsed = Number(valor);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(1_000_000, Math.floor(parsed)));
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
      {
        ok: false,
        error: "Apenas administradores podem alterar o limite Meta Service.",
      },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const integracaoId = String(body?.integracao_whatsapp_id || "").trim();
  const pausarAutomacoes = body?.pausar_automacoes === true;
  const usarLimiteExtra =
    pausarAutomacoes && body?.usar_limite_extra === true;
  const limiteExtra = usarLimiteExtra
    ? inteiroNaoNegativo(body?.limite_extra)
    : 0;

  if (!integracaoId) {
    return NextResponse.json(
      { ok: false, error: "Integração não informada." },
      { status: 400 }
    );
  }

  const { data: integracao, error: integracaoError } = await supabaseAdmin
    .from("integracoes_whatsapp")
    .select("id,phone_number_id,provider,status")
    .eq("id", integracaoId)
    .eq("empresa_id", usuario.empresa_id)
    .maybeSingle();

  if (integracaoError) {
    return NextResponse.json(
      { ok: false, error: integracaoError.message },
      { status: 500 }
    );
  }

  if (!integracao || integracao.provider !== "meta_official") {
    return NextResponse.json(
      { ok: false, error: "Integração oficial da Meta não encontrada." },
      { status: 404 }
    );
  }

  const agora = new Date().toISOString();
  const { error: upsertError } = await supabaseAdmin
    .from("whatsapp_service_automacao_limites")
    .upsert(
      {
        empresa_id: usuario.empresa_id,
        integracao_whatsapp_id: integracao.id,
        pausar_automacoes: pausarAutomacoes,
        limite_extra: limiteExtra,
        bloqueado_mes: null,
        bloqueado_em: null,
        bloqueio_detalhe: {},
        updated_by: usuario.id,
        updated_at: agora,
      },
      { onConflict: "empresa_id,integracao_whatsapp_id" }
    );

  if (upsertError) {
    return NextResponse.json(
      { ok: false, error: upsertError.message },
      { status: 500 }
    );
  }

  let avaliacao: Awaited<
    ReturnType<typeof avaliarLimiteAutomacoesService>
  > | null = null;

  if (pausarAutomacoes) {
    try {
      avaliacao = await avaliarLimiteAutomacoesService({
        empresaId: usuario.empresa_id,
        integracaoWhatsappId: integracao.id,
        phoneNumberId: integracao.phone_number_id,
      });
    } catch (error) {
      return NextResponse.json(
        {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "Configuração salva, mas não foi possível avaliar o consumo atual.",
        },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    ok: true,
    configuracao: {
      pausar_automacoes: pausarAutomacoes,
      limite_extra: limiteExtra,
      limite_total: 1000 + limiteExtra,
    },
    avaliacao,
  });
}
