import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { criarCheckoutAssinaturaProsperityPay } from "@/lib/prosperity-pay/subscriptions";

const supabase = getSupabaseAdmin();

export async function POST(request: Request) {
  try {
    const contexto = await getUsuarioContexto();
    if (!contexto.ok) {
      return NextResponse.json({ ok: false, error: contexto.error }, { status: contexto.status });
    }

    const empresaId = contexto.usuario.empresa_id;
    if (!empresaId) {
      return NextResponse.json({ ok: false, error: "Usuário sem empresa vinculada." }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      integration_id?: string | null;
      addon_index?: number | null;
    };
    const integrationId = String(body.integration_id || "").trim();
    const addonIndex = Math.max(0, Number(body.addon_index || 0));

    if (!integrationId && !addonIndex) {
      return NextResponse.json(
        { ok: false, error: "Selecione o número adicional que será removido." },
        { status: 400 }
      );
    }

    const { data: empresa, error: empresaError } = await supabase
      .from("empresas")
      .select("id,plano_id,limite_integracoes_whatsapp,planos:plano_id(limite_integracoes_whatsapp)")
      .eq("id", empresaId)
      .single();

    if (empresaError || !empresa) {
      throw empresaError ?? new Error("Empresa não encontrada.");
    }

    const plano = Array.isArray(empresa.planos) ? empresa.planos[0] : empresa.planos;
    const limiteBase = Math.max(1, Number(plano?.limite_integracoes_whatsapp || 1));

    let integracao: {
      id: string;
      nome_conexao: string | null;
      numero: string | null;
      posicao: number | null;
      status: string | null;
    } | null = null;

    if (integrationId) {
      const { data, error: integracaoError } = await supabase
        .from("integracoes_whatsapp")
        .select("id,nome_conexao,numero,posicao,status")
        .eq("id", integrationId)
        .eq("empresa_id", empresaId)
        .eq("provider", "meta_official")
        .maybeSingle();

      if (integracaoError) throw integracaoError;
      if (!data) {
        return NextResponse.json(
          { ok: false, error: "Número WhatsApp adicional não encontrado." },
          { status: 404 }
        );
      }

      integracao = data;
      const posicao = Number(integracao.posicao || 1);

      if (posicao <= limiteBase) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Este número faz parte do plano base e não pode ser cancelado como adicional.",
          },
          { status: 409 }
        );
      }
    } else {
      const { data: mirror, error: mirrorError } = await supabase
        .from("prosperity_pay_assinaturas")
        .select("items")
        .eq("empresa_id", empresaId)
        .maybeSingle();

      if (mirrorError) throw mirrorError;

      const items = Array.isArray(mirror?.items) ? mirror.items : [];
      const whatsappItem = items.find(
        (item: any) =>
          String(item?.code || "") === "whatsapp_number" &&
          String(item?.type || item?.item_type || "addon") === "addon"
      );
      const quantidadeFinanceira = Math.max(
        0,
        Number((whatsappItem as any)?.quantity || 0)
      );
      const quantidadePorLimite = Math.max(
        0,
        Number(empresa.limite_integracoes_whatsapp || limiteBase) - limiteBase
      );
      const quantidadeAdicionais = Math.max(
        quantidadeFinanceira,
        quantidadePorLimite
      );

      if (addonIndex > quantidadeAdicionais) {
        return NextResponse.json(
          { ok: false, error: "Adicional de WhatsApp não encontrado." },
          { status: 404 }
        );
      }
    }

    let existente: { id: string; effective_at: string | null } | null = null;

    if (integrationId) {
      const { data, error: existenteError } = await supabase
        .from("prosperity_pay_recursos_agendados")
        .select("id,effective_at")
        .eq("empresa_id", empresaId)
        .eq("recurso_tipo", "whatsapp_integration")
        .eq("recurso_id", integrationId)
        .eq("acao", "remove")
        .eq("status", "scheduled")
        .maybeSingle();

      if (existenteError) throw existenteError;
      existente = data;
    } else {
      const { data, error: existenteError } = await supabase
        .from("prosperity_pay_recursos_agendados")
        .select("id,effective_at,metadata_json")
        .eq("empresa_id", empresaId)
        .eq("recurso_tipo", "whatsapp_addon_slot")
        .is("recurso_id", null)
        .eq("acao", "remove")
        .eq("status", "scheduled");

      if (existenteError) throw existenteError;
      existente =
        (data || []).find(
          (item: any) => Number(item?.metadata_json?.addon_index || 0) === addonIndex
        ) || null;
    }

    if (existente) {
      return NextResponse.json({
        ok: true,
        scheduled: true,
        already_scheduled: true,
        effective_at: existente.effective_at,
      });
    }

    const intent = await criarCheckoutAssinaturaProsperityPay(empresaId, {
      type: "remove_addon",
      addonCode: "whatsapp_number",
      quantity: 1,
    });

    if (intent.status !== "scheduled") {
      return NextResponse.json(
        {
          ok: false,
          error:
            "A Prosperity Pay não retornou o cancelamento como alteração do próximo ciclo.",
        },
        { status: 409 }
      );
    }

    const { data: mirror, error: mirrorError } = await supabase
      .from("prosperity_pay_assinaturas")
      .select("external_subscription_id")
      .eq("empresa_id", empresaId)
      .single();
    if (mirrorError || !mirror) {
      throw mirrorError ?? new Error("Assinatura não encontrada no CRM.");
    }

    const { data: agendado, error: agendadoError } = await supabase
      .from("prosperity_pay_recursos_agendados")
      .insert({
        empresa_id: empresaId,
        external_subscription_id: mirror.external_subscription_id,
        addon_code: "whatsapp_number",
        recurso_tipo: integrationId
          ? "whatsapp_integration"
          : "whatsapp_addon_slot",
        recurso_id: integrationId || null,
        acao: "remove",
        status: "scheduled",
        effective_at: intent.effectiveAt || null,
        metadata_json: {
          nome_conexao: integracao?.nome_conexao || null,
          numero: integracao?.numero || null,
          addon_index: addonIndex || null,
          unconfigured_slot: !integrationId,
          pay_change_id: intent.changeId || null,
          target_amount_cents: intent.targetAmountCents || null,
        },
      })
      .select("id,effective_at")
      .single();

    if (agendadoError || !agendado) {
      throw agendadoError ?? new Error("Não foi possível registrar o cancelamento do adicional.");
    }

    return NextResponse.json({
      ok: true,
      scheduled: true,
      effective_at: agendado.effective_at,
      target_amount_cents: intent.targetAmountCents ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível cancelar o adicional.",
      },
      { status: 500 }
    );
  }
}
