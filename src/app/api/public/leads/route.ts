import { NextResponse } from "next/server";
import {
  isValidBuyerEmail,
  isValidBuyerPhone,
  normalizeBuyerPhone,
} from "@/lib/checkout/buyer-validation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  TEXTO_ACEITE_LGPD,
  VERSAO_CONTRATO_RESPONSABILIDADES,
  VERSAO_POLITICA_PRIVACIDADE,
  VERSAO_TERMOS_SERVICO,
} from "@/lib/lgpd/termos";
import { getNichoConfig } from "@/lib/nichos/config";
import { getSegmentoEmpresa } from "@/lib/segmentos/catalogo";

const supabase = getSupabaseAdmin();

function normalizarTipoOferta(
  valor: unknown,
  chaveFree?: string
): "normal" | "vip" | "jv" | "af" | "free" {
  if (typeof valor !== "string") {
    return "normal";
  }

  const valorNormalizado = valor.trim().toLowerCase();

  if (valorNormalizado === "vip") {
    return "vip";
  }

  if (valorNormalizado === "jv") {
    return "jv";
  }

  if (valorNormalizado === "af" || valorNormalizado === "afiliado") {
    return "af";
  }

  // 🔐 proteção do free
  if (valorNormalizado === "free") {
    if (chaveFree === process.env.CRM_FREE_CHECKOUT_KEY) {
      return "free";
    }

    return "normal"; // se tentar burlar, volta pra normal
  }

  return "normal";
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const nome = String(body?.nome ?? "").trim();
    const email = String(body?.email ?? "").toLowerCase().trim();
    const telefone = normalizeBuyerPhone(String(body?.telefone ?? ""));
    const empresa = String(body?.empresa ?? "").trim();
    const segmento = getSegmentoEmpresa(body?.segmento_codigo);
    const aceiteContrato = body?.aceite_contrato === true;
    const freeTrial4d = body?.free_trial_4d === true;
    const affiliateRefRaw = String(body?.affiliate_ref ?? "").trim();
    const affiliateRef =
      affiliateRefRaw &&
      affiliateRefRaw.length <= 128 &&
      /^[A-Za-z0-9_-]+$/.test(affiliateRefRaw)
        ? affiliateRefRaw
        : null;
    const tipoOferta = freeTrial4d
      ? "normal"
      : normalizarTipoOferta(body?.tipo_oferta, body?.chave_free);

    if (!nome) {
      throw new Error("Nome é obrigatório.");
    }

    if (!email) {
      throw new Error("Email é obrigatório.");
    }

    if (!isValidBuyerEmail(email)) {
      throw new Error("Informe um e-mail válido, como nome@exemplo.com.br.");
    }

    if (!telefone) {
      throw new Error("Telefone pessoal é obrigatório.");
    }

    if (!isValidBuyerPhone(telefone)) {
      throw new Error("Informe um telefone pessoal válido com DDD.");
    }

    if (!segmento) {
      throw new Error("Segmento da empresa é obrigatório.");
    }

    if (!aceiteContrato) {
      throw new Error(
        "Aceite dos termos, da política de privacidade e das responsabilidades LGPD é obrigatório."
      );
    }

    const { data: nicho, error: nichoError } = await supabase
      .from("nichos")
      .select("id")
      .eq("codigo", getNichoConfig(segmento.nichoCodigo).codigo)
      .eq("ativo", true)
      .maybeSingle();

    if (nichoError || !nicho) {
      throw new Error("Segmento informado não está disponível.");
    }

    let affiliate:
      | {
          external_membership_id: string;
          affiliate_ref: string;
        }
      | null = null;

    if (affiliateRef) {
      const { data: affiliateData, error: affiliateError } = await supabase
        .from("prosperity_pay_afiliados")
        .select("external_membership_id,affiliate_ref")
        .eq("affiliate_ref", affiliateRef)
        .eq("status", "active")
        .maybeSingle();

      if (affiliateError) {
        console.error("Erro ao validar afiliado Prosperity Pay:", affiliateError);
        throw new Error("Não foi possível validar o link do afiliado.");
      }

      if (!affiliateData) {
        throw new Error("Link de afiliado inválido ou inativo.");
      }

      affiliate = affiliateData;
    }

    // 🔍 verificar se já existe usuário com esse email
    const { data: usuarioExistente } = await supabase
      .from("usuarios")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (usuarioExistente) {
      throw new Error(
        "Já existe uma conta com este email. Faça login ou recupere sua senha."
      );
    }

    if (freeTrial4d) {
      const buscarTrial = async (campo: "email" | "telefone", valor: string) => {
        const { data, error } = await supabase
          .from("leads_cadastro")
          .select("id,empresa_id,metadata_json,tipo_oferta")
          .eq(campo, valor)
          .contains("metadata_json", { free_trial_4d: true })
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          throw new Error("Não foi possível validar o período de teste.");
        }

        return data;
      };

      const trialExistente =
        (await buscarTrial("email", email)) ||
        (await buscarTrial("telefone", telefone));

      if (trialExistente) {
        const metadataExistente =
          trialExistente.metadata_json &&
          typeof trialExistente.metadata_json === "object" &&
          !Array.isArray(trialExistente.metadata_json)
            ? (trialExistente.metadata_json as Record<string, unknown>)
            : {};

        if (
          trialExistente.empresa_id &&
          metadataExistente.trial_acesso_enviado_em
        ) {
          throw new Error(
            "Este contato já utilizou o período de teste gratuito de 4 dias."
          );
        }

        return NextResponse.json({
          ok: true,
          lead_id: trialExistente.id,
          tipo_oferta: trialExistente.tipo_oferta || "normal",
          affiliate_ref:
            typeof metadataExistente.affiliate_ref === "string"
              ? metadataExistente.affiliate_ref
              : null,
          free_trial_4d: true,
          reaproveitado: true,
        });
      }
    }

    const metadataCadastro = {
      ...(affiliate
        ? {
            affiliate_ref: affiliate.affiliate_ref,
            affiliate_source: "prosperity_pay",
            affiliate_membership_id: affiliate.external_membership_id,
            affiliate_attributed_at: new Date().toISOString(),
          }
        : {}),
      ...(freeTrial4d
        ? {
            free_trial_4d: true,
            trial_dias: 4,
            trial_plano_slug: "basico",
            trial_solicitado_em: new Date().toISOString(),
          }
        : {}),
    };

    const { data, error } = await supabase
      .from("leads_cadastro")
      .insert({
        nome,
        email,
        telefone,
        empresa: empresa || null,
        nicho_id: nicho.id,
        segmento_codigo: segmento.codigo,
        segmento_nome: segmento.nome,
        status: "novo",
        plano_slug: "basico",
        tipo_oferta: tipoOferta,
        termo_aceite: true,
        termo_aceite_em: new Date().toISOString(),
        termo_aceite_ip:
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          null,
        termo_aceite_user_agent: request.headers.get("user-agent") || null,
        termo_aceite_versao: VERSAO_TERMOS_SERVICO,
        politica_privacidade_versao: VERSAO_POLITICA_PRIVACIDADE,
        contrato_responsabilidades_versao: VERSAO_CONTRATO_RESPONSABILIDADES,
        termo_aceite_texto: TEXTO_ACEITE_LGPD,
        metadata_json:
          Object.keys(metadataCadastro).length > 0 ? metadataCadastro : null,
      })
      .select("id")
      .single();

    if (error || !data) {
      console.error("Erro Supabase ao criar cadastro:", error);
      throw new Error("Erro ao criar cadastro.");
    }

    return NextResponse.json({
      ok: true,
      lead_id: data.id,
      tipo_oferta: tipoOferta,
      affiliate_ref: affiliate?.affiliate_ref ?? null,
      free_trial_4d: freeTrial4d,
    });
  } catch (error) {
    console.error("Erro ao criar cadastro:", error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro interno" },
      { status: 400 }
    );
  }
}
