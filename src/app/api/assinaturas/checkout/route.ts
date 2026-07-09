import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type PlanoSlug = "basico" | "essencial";
type TipoOfertaCheckout = "normal" | "vip" | "jv" | "af" | "free";

const supabase = getSupabaseAdmin();

function normalizarPlanoSlug(valor: unknown): PlanoSlug | null {
  const slug = String(valor || "").trim().toLowerCase();

  if (slug === "basico" || slug === "basic") {
    return "basico";
  }

  if (slug === "essencial") {
    return "essencial";
  }

  return null;
}

function normalizarEmail(valor: string | null | undefined) {
  return String(valor || "").trim().toLowerCase();
}

function normalizarTexto(valor: string | null | undefined) {
  return String(valor || "").trim();
}

function normalizarTipoOferta(valor: unknown): TipoOfertaCheckout {
  const tipo = String(valor || "").trim().toLowerCase();

  if (
    tipo === "normal" ||
    tipo === "vip" ||
    tipo === "jv" ||
    tipo === "af" ||
    tipo === "free"
  ) {
    return tipo;
  }

  return "normal";
}

function obterCheckoutNormalPorPlano(planoSlug: PlanoSlug) {
  if (planoSlug === "basico") {
    return (
      process.env.ATOMOPAY_CHECKOUT_URL_BASICO ||
      process.env.NEXT_PUBLIC_ATOMOPAY_CHECKOUT_URL_BASICO ||
      process.env.ATOMOPAY_CHECKOUT_URL_PADRAO ||
      process.env.NEXT_PUBLIC_ATOMOPAY_CHECKOUT_URL ||
      ""
    );
  }

  return (
    process.env.ATOMOPAY_CHECKOUT_URL_ESSENCIAL ||
    process.env.NEXT_PUBLIC_ATOMOPAY_CHECKOUT_URL_ESSENCIAL ||
    process.env.ATOMOPAY_CHECKOUT_URL_PADRAO ||
    process.env.NEXT_PUBLIC_ATOMOPAY_CHECKOUT_URL ||
    ""
  );
}

function obterCheckoutUrlPorPlanoEOferta(params: {
  planoSlug: PlanoSlug;
  tipoOferta: TipoOfertaCheckout;
}) {
  const { planoSlug, tipoOferta } = params;

  if (tipoOferta === "free") {
    return process.env.CRM_CHECKOUT_FREE_URL || "";
  }

  if (tipoOferta === "vip") {
    return (
      process.env.ATOMOPAY_CHECKOUT_URL_VIP ||
      obterCheckoutNormalPorPlano(planoSlug)
    );
  }

  if (tipoOferta === "jv") {
    return (
      process.env.ATOMOPAY_CHECKOUT_URL_JV ||
      obterCheckoutNormalPorPlano(planoSlug)
    );
  }

  if (tipoOferta === "af") {
    if (planoSlug === "essencial") {
      return (
        process.env.ATOMOPAY_CHECKOUT_URL_AF_ESSENCIAL ||
        process.env.ATOMOPAY_CHECKOUT_URL_AF ||
        obterCheckoutNormalPorPlano(planoSlug)
      );
    }

    return (
      process.env.ATOMOPAY_CHECKOUT_URL_AF_BASICO ||
      process.env.ATOMOPAY_CHECKOUT_URL_AF ||
      obterCheckoutNormalPorPlano(planoSlug)
    );
  }

  return obterCheckoutNormalPorPlano(planoSlug);
}

function extrairMetadataJson(valor: any): Record<string, any> {
  if (!valor || typeof valor !== "object") {
    return {};
  }

  return valor;
}

function obterTipoOfertaPelaOferta(oferta: any): TipoOfertaCheckout {
  const metadata = extrairMetadataJson(oferta?.metadata_json);

  const tipoMetadata = normalizarTipoOferta(metadata.tipo_oferta);

  if (tipoMetadata !== "normal") {
    return tipoMetadata;
  }

  const origem = String(metadata.origem || "").trim().toLowerCase();
  const referencia = String(oferta?.referencia || "").trim();

  if (origem.includes("beta") || referencia === "2psef") {
    return "vip";
  }

  if (origem.includes("afiliado") || origem.includes("_af") || origem === "atomopay_afiliado") {
    return "af";
  }

  if (origem.includes("jv")) {
    return "jv";
  }

  if (origem.includes("free") || referencia.startsWith("offer_free")) {
    return "free";
  }

  return "normal";
}

async function buscarOfertaPorReferencia(params: {
  referencia: string | null | undefined;
  empresaId: string;
}) {
  const referencia = String(params.referencia || "").trim();

  if (!referencia) {
    return null;
  }

  const { data, error } = await supabase
    .from("ia_token_ofertas")
    .select(
      `
      id,
      gateway,
      referencia,
      tipo,
      nome,
      plano_id,
      empresa_id,
      quantidade_tokens,
      ativa,
      metadata_json,
      planos (
        id,
        nome,
        slug
      )
    `
    )
    .eq("gateway", "atomo")
    .eq("ativa", true)
    .eq("referencia", referencia)
    .or(`empresa_id.is.null,empresa_id.eq.${params.empresaId}`)
    .order("empresa_id", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error("Erro ao buscar oferta do checkout.");
  }

  return data;
}

async function buscarUltimoPagamentoAprovadoEmpresa(empresaId: string) {
  const { data, error } = await supabase
    .from("pagamentos")
    .select(
      `
      id,
      empresa_id,
      status,
      offer_hash,
      offer_titulo,
      offer_preco,
      valor,
      paid_at,
      created_at
    `
    )
    .eq("empresa_id", empresaId)
    .eq("gateway", "atomo")
    .in("status", ["paid", "approved", "completed"])
    .not("offer_hash", "is", null)
    .order("paid_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error("Erro ao buscar último pagamento da empresa.");
  }

  return data;
}

function normalizarPlanoRelacao(plano: any) {
  if (Array.isArray(plano)) {
    return plano[0] ?? null;
  }

  return plano ?? null;
}

async function resolverCheckoutEmpresa(params: {
  empresaId: string;
  planoSlugSolicitado: PlanoSlug;
  renovarPlanoAtual: boolean;
}) {
  const { empresaId, planoSlugSolicitado, renovarPlanoAtual } = params;

  if (!renovarPlanoAtual) {
    return {
      planoSlug: planoSlugSolicitado,
      tipoOferta: "normal" as TipoOfertaCheckout,
      ofertaReferencia: null as string | null,
      origemResolucao: "contratacao_normal",
    };
  }

  const { data: empresa, error: empresaError } = await supabase
    .from("empresas")
    .select(
      `
      id,
      plano_id,
      assinatura_metadata_json,
      planos (
        id,
        slug,
        nome
      )
    `
    )
    .eq("id", empresaId)
    .maybeSingle();

  if (empresaError) {
    throw new Error("Erro ao buscar empresa para renovação.");
  }

  if (!empresa) {
    throw new Error("Empresa não encontrada para renovação.");
  }

  const planoEmpresa = normalizarPlanoRelacao((empresa as any).planos);
  const planoSlugEmpresa =
    normalizarPlanoSlug(planoEmpresa?.slug) || planoSlugSolicitado;

  const ultimoPagamento = await buscarUltimoPagamentoAprovadoEmpresa(empresaId);

  if (ultimoPagamento?.offer_hash) {
    const oferta = await buscarOfertaPorReferencia({
      referencia: ultimoPagamento.offer_hash,
      empresaId,
    });

    if (oferta) {
      const planoOferta = normalizarPlanoRelacao((oferta as any).planos);
      const planoSlugOferta =
        normalizarPlanoSlug(planoOferta?.slug) || planoSlugEmpresa;

      return {
        planoSlug: planoSlugOferta,
        tipoOferta: obterTipoOfertaPelaOferta(oferta),
        ofertaReferencia: String((oferta as any).referencia || ""),
        origemResolucao: "ultimo_pagamento",
      };
    }

    if (ultimoPagamento.offer_hash === "2psef") {
      return {
        planoSlug: "basico" as PlanoSlug,
        tipoOferta: "vip" as TipoOfertaCheckout,
        ofertaReferencia: "2psef",
        origemResolucao: "ultimo_pagamento_fallback_vip",
      };
    }

    if (ultimoPagamento.offer_hash === "ubtga") {
      return {
        planoSlug: "basico" as PlanoSlug,
        tipoOferta: "af" as TipoOfertaCheckout,
        ofertaReferencia: "ubtga",
        origemResolucao: "ultimo_pagamento_fallback_af_basico",
      };
    }

    if (ultimoPagamento.offer_hash === "uqddy") {
      return {
        planoSlug: "essencial" as PlanoSlug,
        tipoOferta: "af" as TipoOfertaCheckout,
        ofertaReferencia: "uqddy",
        origemResolucao: "ultimo_pagamento_fallback_af_essencial",
      };
    }
  }

  const assinaturaMetadata = extrairMetadataJson(
    (empresa as any).assinatura_metadata_json
  );

  const metadataOfferHash = String(assinaturaMetadata.offer_hash || "").trim();

  if (metadataOfferHash) {
    const oferta = await buscarOfertaPorReferencia({
      referencia: metadataOfferHash,
      empresaId,
    });

    if (oferta) {
      const planoOferta = normalizarPlanoRelacao((oferta as any).planos);
      const planoSlugOferta =
        normalizarPlanoSlug(planoOferta?.slug) || planoSlugEmpresa;

      return {
        planoSlug: planoSlugOferta,
        tipoOferta: obterTipoOfertaPelaOferta(oferta),
        ofertaReferencia: String((oferta as any).referencia || ""),
        origemResolucao: "metadata_empresa",
      };
    }

    if (metadataOfferHash === "2psef") {
      return {
        planoSlug: "basico" as PlanoSlug,
        tipoOferta: "vip" as TipoOfertaCheckout,
        ofertaReferencia: "2psef",
        origemResolucao: "metadata_empresa_fallback_vip",
      };
    }
  }

  const tipoOfertaMetadata = normalizarTipoOferta(
    assinaturaMetadata.tipo_oferta
  );

  return {
    planoSlug: planoSlugEmpresa,
    tipoOferta: tipoOfertaMetadata,
    ofertaReferencia: metadataOfferHash || null,
    origemResolucao: "fallback_empresa",
  };
}

async function buscarOuCriarLeadCheckout(params: {
  planoSlug: PlanoSlug;
  tipoOferta: TipoOfertaCheckout;
  empresaId: string;
  usuarioId: string;
  usuarioNome: string | null;
  usuarioEmail: string | null;
}) {
  const {
    planoSlug,
    tipoOferta,
    empresaId,
    usuarioId,
    usuarioNome,
    usuarioEmail,
  } = params;

  const { data: empresa, error: empresaError } = await supabase
    .from("empresas")
    .select("id, nome_fantasia, razao_social, email, telefone, nome_responsavel")
    .eq("id", empresaId)
    .maybeSingle();

  if (empresaError) {
    throw new Error("Erro ao buscar empresa para checkout.");
  }

  if (!empresa) {
    throw new Error("Empresa não encontrada para checkout.");
  }

  const email = normalizarEmail(empresa.email || usuarioEmail);
  const telefone = normalizarTexto(empresa.telefone);
  const nome =
    normalizarTexto(empresa.nome_responsavel) ||
    normalizarTexto(usuarioNome) ||
    normalizarTexto(empresa.nome_fantasia) ||
    "Cliente";
  const empresaNome =
    normalizarTexto(empresa.nome_fantasia) ||
    normalizarTexto(empresa.razao_social) ||
    nome;

  if (!email) {
    throw new Error("Empresa sem email para preparar checkout.");
  }

  const { data: leadEmpresa, error: leadEmpresaError } = await supabase
    .from("leads_cadastro")
    .select("id")
    .eq("empresa_id", empresaId)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (leadEmpresaError) {
    throw new Error("Erro ao buscar lead da empresa.");
  }

  if (leadEmpresa?.id) {
    const { error: updateError } = await supabase
      .from("leads_cadastro")
      .update({
        nome,
        email,
        telefone: telefone || null,
        empresa: empresaNome,
        usuario_id: usuarioId,
        empresa_id: empresaId,
        plano_slug: planoSlug,
        tipo_oferta: tipoOferta,
        updated_at: new Date().toISOString(),
      })
      .eq("id", leadEmpresa.id);

    if (updateError) {
      throw new Error("Erro ao atualizar plano escolhido.");
    }

    return leadEmpresa.id as string;
  }

  const { data: leadEmail, error: leadEmailError } = await supabase
    .from("leads_cadastro")
    .select("id")
    .ilike("email", email)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (leadEmailError) {
    throw new Error("Erro ao buscar lead pelo email.");
  }

  if (leadEmail?.id) {
    const { error: updateError } = await supabase
      .from("leads_cadastro")
      .update({
        nome,
        email,
        telefone: telefone || null,
        empresa: empresaNome,
        usuario_id: usuarioId,
        empresa_id: empresaId,
        plano_slug: planoSlug,
        tipo_oferta: tipoOferta,
        updated_at: new Date().toISOString(),
      })
      .eq("id", leadEmail.id);

    if (updateError) {
      throw new Error("Erro ao atualizar plano escolhido.");
    }

    return leadEmail.id as string;
  }

  const { data: leadNovo, error: insertError } = await supabase
    .from("leads_cadastro")
    .insert({
      nome,
      email,
      telefone: telefone || null,
      empresa: empresaNome,
      status: "checkout_iniciado",
      pago: false,
      usuario_id: usuarioId,
      empresa_id: empresaId,
      plano_slug: planoSlug,
      tipo_oferta: tipoOferta,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (insertError || !leadNovo) {
    throw new Error("Erro ao criar lead para checkout.");
  }

  return leadNovo.id as string;
}

export async function POST(request: Request) {
  try {
    const resultado = await getUsuarioContexto();

    if (!resultado.ok) {
      return NextResponse.json(
        { ok: false, error: resultado.error },
        { status: resultado.status }
      );
    }

    const { usuario } = resultado;

    if (!usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada." },
        { status: 400 }
      );
    }

    const body = await request.json();
    const planoSlugSolicitado = normalizarPlanoSlug(body?.plano_slug);
    const renovarPlanoAtual = body?.renovar_plano_atual === true;

    if (!planoSlugSolicitado) {
      return NextResponse.json(
        { ok: false, error: "Plano inválido para checkout." },
        { status: 400 }
      );
    }

    const contextoCheckout = await resolverCheckoutEmpresa({
      empresaId: usuario.empresa_id,
      planoSlugSolicitado,
      renovarPlanoAtual,
    });

    const checkoutUrl = obterCheckoutUrlPorPlanoEOferta({
      planoSlug: contextoCheckout.planoSlug,
      tipoOferta: contextoCheckout.tipoOferta,
    });

    if (!checkoutUrl) {
      return NextResponse.json(
        {
          ok: false,
          error: "Checkout do plano não configurado.",
          tipo_oferta: contextoCheckout.tipoOferta,
          plano_slug: contextoCheckout.planoSlug,
        },
        { status: 400 }
      );
    }

    const leadId = await buscarOuCriarLeadCheckout({
      planoSlug: contextoCheckout.planoSlug,
      tipoOferta: contextoCheckout.tipoOferta,
      empresaId: usuario.empresa_id,
      usuarioId: usuario.id,
      usuarioNome: usuario.nome,
      usuarioEmail: usuario.email,
    });

    return NextResponse.json({
      ok: true,
      lead_id: leadId,
      checkout_url: checkoutUrl,
      plano_slug: contextoCheckout.planoSlug,
      tipo_oferta: contextoCheckout.tipoOferta,
      oferta_referencia: contextoCheckout.ofertaReferencia,
      origem_resolucao: contextoCheckout.origemResolucao,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao preparar checkout.",
      },
      { status: 500 }
    );
  }
}