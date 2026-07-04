import { NextResponse } from "next/server";
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
    const telefone = String(body?.telefone ?? "").trim();
    const empresa = String(body?.empresa ?? "").trim();
    const segmento = getSegmentoEmpresa(body?.segmento_codigo);
    const aceiteContrato = body?.aceite_contrato === true;
    const tipoOferta = normalizarTipoOferta(
      body?.tipo_oferta,
      body?.chave_free
    );

    if (!nome) {
      throw new Error("Nome é obrigatório.");
    }

    if (!email) {
      throw new Error("Email é obrigatório.");
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

    const { data, error } = await supabase
      .from("leads_cadastro")
      .insert({
        nome,
        email,
        telefone: telefone || null,
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
    });
  } catch (error) {
    console.error("Erro ao criar cadastro:", error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro interno" },
      { status: 400 }
    );
  }
}
