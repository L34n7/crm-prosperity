import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { Resend } from "resend";
import { calcularJanelaAssinatura } from "@/lib/assinaturas/status";

const supabase = getSupabaseAdmin();
const resend = new Resend(process.env.RESEND_API_KEY);

/* =========================
   HELPERS GERAIS
========================= */

function limparTelefone(valor: string | null | undefined) {
  if (!valor) return "";
  return valor.replace(/\D/g, "");
}

function normalizarEmail(valor: string | null | undefined) {
  if (!valor) return "";
  return valor.trim().toLowerCase();
}

function somenteDataValida(valor: string | null | undefined) {
  if (!valor) return null;

  const data = new Date(valor);

  if (Number.isNaN(data.getTime())) return null;

  return data.toISOString();
}

function normalizarStatusPagamento(payload: any) {
  return String(payload.status ?? payload.transaction?.status ?? "")
    .trim()
    .toLowerCase();
}

function obterMetodoPagamento(payload: any) {
  return String(payload.payment_method ?? payload.method ?? "")
    .trim()
    .toLowerCase();
}

function obterValorPagamento(payload: any) {
  const valor = payload.amount ?? payload.transaction?.amount ?? null;

  if (valor === null || valor === undefined || valor === "") {
    return null;
  }

  return Number(valor);
}

function obterValorLiquidoPagamento(payload: any) {
  const valor =
    payload.net_amount ??
    payload.valor_liquido ??
    payload.transaction?.net_amount ??
    null;

  if (valor === null || valor === undefined || valor === "") {
    return null;
  }

  return Number(valor);
}

function obterTituloOferta(payload: any) {
  return (
    payload.offer?.title ??
    payload.offer_titulo ??
    payload.cart?.[0]?.title ??
    null
  );
}

function obterPrecoOferta(payload: any) {
  const preco =
    payload.offer?.price ??
    payload.offer_preco ??
    payload.cart?.[0]?.price ??
    payload.amount ??
    null;

  if (preco === null || preco === undefined || preco === "") {
    return null;
  }

  return Number(preco);
}

function obterOfferHash(payload: any) {
  return String(
    payload.offer_hash ??
      payload.offer?.hash ??
      payload.offer?.id ??
      payload.product_hash ??
      payload.cart?.[0]?.product_hash ??
      ""
  ).trim();
}

function obterPagoEm(payload: any) {
  return (
    somenteDataValida(payload.paid_at) ??
    somenteDataValida(payload.paidAt) ??
    somenteDataValida(payload.created_at) ??
    somenteDataValida(payload.createdAt) ??
    new Date().toISOString()
  );
}

function criarHashPayload(payload: any) {
  return createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
}

function obterTransactionId(payload: any) {
  const idDireto = String(
    payload.transaction?.id ??
      payload.transaction_id ??
      payload.id ??
      payload.token ??
      payload.checkout_id ??
      payload.order_id ??
      payload.sale_id ??
      payload.hash ??
      ""
  ).trim();

  if (idDireto) {
    return idDireto;
  }

  return `atomopay_${criarHashPayload(payload)}`;
}

function obterReferenciasOferta(payload: any) {
  return [
    payload.offer_hash,
    payload.offer?.id,
    payload.offer?.hash,
    payload.product_hash,
    payload.cart?.[0]?.product_hash,
  ]
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
}

function normalizarPlanoSlug(valor: unknown) {
  const slug = String(valor ?? "").trim().toLowerCase();

  if (slug === "basico" || slug === "basic") {
    return "basico";
  }

  if (slug === "essencial") {
    return "essencial";
  }

  return null;
}

function obterPlanoSlugFallback(payload: any, lead?: any) {
  return (
    normalizarPlanoSlug(lead?.plano_slug) ??
    normalizarPlanoSlug(payload.metadata_extra?.plano_slug) ??
    normalizarPlanoSlug(payload.metadata?.plano_slug) ??
    normalizarPlanoSlug(payload.tracking?.utm_term)
  );
}

function obterTipoOferta(payload: any, lead?: any) {
  const tipo = String(
    lead?.tipo_oferta ??
      payload.metadata_extra?.tipo_oferta ??
      payload.metadata?.tipo_oferta ??
      payload.tracking?.utm_content ??
      ""
  )
    .trim()
    .toLowerCase();

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

function montarNomeEmpresa(lead: any, payload: any) {
  const empresaLead = String(lead?.empresa ?? "").trim();
  const nomeCliente = String(payload.customer?.name ?? "").trim();

  if (empresaLead) return empresaLead;
  if (nomeCliente) return nomeCliente;

  return "Empresa Cliente";
}

function normalizarPlanoRelacao(plano: any) {
  if (Array.isArray(plano)) {
    return plano[0] ?? null;
  }

  return plano ?? null;
}

/* =========================
   OFERTA / PLANO
========================= */

async function buscarOfertaAtomopay(params: {
  payload: any;
  empresaId?: string | null;
}) {
  const referencias = obterReferenciasOferta(params.payload);

  if (referencias.length === 0) {
    return null;
  }

  let query = supabase
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
      planos (
        id,
        nome,
        slug
      )
    `
    )
    .eq("gateway", "atomo")
    .eq("ativa", true)
    .in("referencia", referencias);

  if (params.empresaId) {
    query = query.or(`empresa_id.is.null,empresa_id.eq.${params.empresaId}`);
  } else {
    query = query.is("empresa_id", null);
  }

  const { data, error } = await query
    .order("empresa_id", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao buscar oferta da AtomoPay: ${error.message}`);
  }

  return data;
}

async function buscarPlanoIdPorSlug(planoSlug: string | null | undefined) {
  if (!planoSlug) return null;

  const { data, error } = await supabase
    .from("planos")
    .select("id, slug, nome")
    .eq("slug", planoSlug)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao buscar plano: ${error.message}`);
  }

  return data?.id ?? null;
}

async function obterPlanoPagamento(params: {
  payload: any;
  lead?: any;
  empresaId?: string | null;
}) {
  const oferta = await buscarOfertaAtomopay({
    payload: params.payload,
    empresaId: params.empresaId,
  });

  const planoOferta = normalizarPlanoRelacao(oferta?.planos);

  if (oferta?.tipo === "mensalidade" && planoOferta?.id && planoOferta?.slug) {
    return {
      planoId: planoOferta.id as string,
      planoSlug: normalizarPlanoSlug(planoOferta.slug) ?? planoOferta.slug,
      oferta,
    };
  }

  const planoSlug = obterPlanoSlugFallback(params.payload, params.lead);
  
  const planoId = await buscarPlanoIdPorSlug(planoSlug);

  if (!planoId) {
    throw new Error(`Plano não encontrado para o slug: ${planoSlug}`);
  }

  return {
    planoId,
    planoSlug,
    oferta,
  };
}

/* =========================
   BUSCAR / CRIAR LEAD
========================= */

async function buscarLeadCadastro(params: {
  email: string;
  telefone1: string;
  telefone2: string;
}) {
  const { email, telefone1, telefone2 } = params;

  if (email) {
    const { data, error } = await supabase
      .from("leads_cadastro")
      .select("*")
      .ilike("email", email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(`Erro ao buscar lead por email: ${error.message}`);
    }

    if (data) return data;
  }

  const telefones = [telefone1, telefone2].filter(Boolean);

  for (const telefone of telefones) {
    const { data, error } = await supabase
      .from("leads_cadastro")
      .select("*")
      .eq("telefone", telefone)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(`Erro ao buscar lead por telefone: ${error.message}`);
    }

    if (data) return data;
  }

  return null;
}

async function criarLeadAutomatico(payload: any) {
  const planoPagamento = await obterPlanoPagamento({ payload });
  const tipoOferta = obterTipoOferta(payload);

  const { data, error } = await supabase
    .from("leads_cadastro")
    .insert({
      nome: payload.customer?.name ?? "Cliente",
      email: normalizarEmail(payload.customer?.email),
      telefone: limparTelefone(
        payload.customer?.phone_number || payload.customer?.phone
      ),
      empresa: obterTituloOferta(payload) ?? "Cliente Átomo",
      status: "novo",
      pago: false,
      plano_slug: planoPagamento.planoSlug,
      tipo_oferta: tipoOferta,
      metadata_json: payload,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Erro ao criar lead automatico: ${error.message}`);
  }

  return data;
}

/* =========================
   EMPRESA
========================= */

async function criarEmpresa(params: {
  lead: any;
  payload: any;
  planoId: string;
}) {
  const { lead, payload, planoId } = params;

  if (lead?.empresa_id) {
    const { data, error } = await supabase
      .from("empresas")
      .select("*")
      .eq("id", lead.empresa_id)
      .maybeSingle();

    if (error) {
      throw new Error(`Erro ao buscar empresa do lead: ${error.message}`);
    }

    if (data) return data;
  }

  if (!planoId) {
    throw new Error("Plano não identificado para criar empresa.");
  }

  const emailEmpresa = normalizarEmail(payload.customer?.email || lead?.email);

  if (!emailEmpresa) {
    throw new Error("Não foi possível criar empresa sem email.");
  }

  const { data, error } = await supabase
    .from("empresas")
    .insert({
      plano_id: planoId,
      nome_fantasia: montarNomeEmpresa(lead, payload),
      razao_social: montarNomeEmpresa(lead, payload),
      documento: payload.customer?.document ?? null,
      email: emailEmpresa,
      telefone: limparTelefone(
        payload.customer?.phone_number || payload.customer?.phone || lead?.telefone
      ),
      nome_responsavel: payload.customer?.name ?? lead?.nome ?? null,
      status: "ativa",
      timezone: "America/Sao_Paulo",
      observacoes: "Criada automaticamente via webhook AtomoPay",
      termo_aceite: lead?.termo_aceite ?? false,
      termo_aceite_em: lead?.termo_aceite_em ?? null,
      termo_aceite_ip: lead?.termo_aceite_ip ?? null,
      termo_aceite_user_agent: lead?.termo_aceite_user_agent ?? null,
      termo_aceite_versao: lead?.termo_aceite_versao ?? null,
      politica_privacidade_versao: lead?.politica_privacidade_versao ?? null,
      contrato_responsabilidades_versao:
        lead?.contrato_responsabilidades_versao ?? null,
      termo_aceite_texto: lead?.termo_aceite_texto ?? null,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Erro ao criar empresa: ${error.message}`);
  }

  return data;
}

async function aplicarAssinaturaPlano(params: {
  empresaId: string;
  planoId: string;
  planoSlug: string;
  payload: any;
}) {
  const referencia = obterTransactionId(params.payload);
  const pagoEm = obterPagoEm(params.payload);
  const janela = calcularJanelaAssinatura(pagoEm);

  const atualizacao: Record<string, any> = {
    plano_id: params.planoId,
    assinatura_status: "ativa",
    assinatura_inicio_em: janela.inicioEm,
    assinatura_vencimento_em: janela.vencimentoEm,
    assinatura_bloqueio_em: janela.bloqueioEm,
    assinatura_renovada_em: janela.inicioEm,
    assinatura_gateway: "atomopay",
    assinatura_referencia: referencia,
    assinatura_metadata_json: {
      origem: "webhook_atomopay",
      plano_slug: params.planoSlug,
      status: normalizarStatusPagamento(params.payload),
      payment_method: obterMetodoPagamento(params.payload),
      offer_hash: obterOfferHash(params.payload),
      offer_title: obterTituloOferta(params.payload),
      transaction_id: referencia,
    },
    assinatura_fluxos_pausados_em: null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("empresas")
    .update(atualizacao)
    .eq("id", params.empresaId);

  if (error) {
    throw new Error(`Erro ao atualizar assinatura da empresa: ${error.message}`);
  }
}

/* =========================
   PAGAMENTO
========================= */

async function salvarPagamento(payload: any, leadId: string | null) {
  const transactionId = obterTransactionId(payload);

  if (!transactionId) {
    throw new Error("Webhook da AtomoPay sem identificador de transação.");
  }

  const status = normalizarStatusPagamento(payload);

  const { data, error } = await supabase
    .from("pagamentos")
    .upsert(
      {
        gateway: "atomo",
        transaction_id: transactionId,
        status,
        metodo: obterMetodoPagamento(payload),
        valor: obterValorPagamento(payload),
        valor_liquido: obterValorLiquidoPagamento(payload),
        customer_id: payload.customer?.id ?? null,
        customer_email: normalizarEmail(payload.customer?.email),
        customer_nome: payload.customer?.name ?? null,
        customer_telefone: limparTelefone(
          payload.customer?.phone_number || payload.customer?.phone
        ),
        customer_documento: payload.customer?.document ?? null,
        offer_hash: obterOfferHash(payload),
        offer_titulo: obterTituloOferta(payload),
        offer_preco: obterPrecoOferta(payload),
        paid_at: status === "paid" ? obterPagoEm(payload) : somenteDataValida(payload.paid_at),
        refunded_at:
          status === "refunded"
            ? somenteDataValida(payload.refunded_at) ?? new Date().toISOString()
            : null,
        lead_id: leadId,
        payload,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "gateway,transaction_id" }
    )
    .select("*")
    .single();

  if (error) {
    throw new Error(`Erro ao salvar pagamento: ${error.message}`);
  }

  return data;
}

async function aplicarPagamentoTokensIa(params: {
  empresaId: string;
  payload: any;
}) {
  const { empresaId, payload } = params;
  const referencia = obterTransactionId(payload);

  if (!referencia) {
    throw new Error("Pagamento aprovado sem identificador para aplicar tokens de IA.");
  }

  const pagoEm = obterPagoEm(payload);

  const { data, error } = await supabase.rpc("aplicar_pagamento_tokens_ia", {
    p_empresa_id: empresaId,
    p_referencia: referencia,
    p_oferta_referencias: obterReferenciasOferta(payload),
    p_pago_em: pagoEm,
    p_metadata_json: {
      origem: "webhook_atomopay",
      status: normalizarStatusPagamento(payload),
      payment_method: obterMetodoPagamento(payload),
      offer_hash: obterOfferHash(payload),
      offer_title: obterTituloOferta(payload),
      amount: obterValorPagamento(payload),
    },
  });

  if (error) {
    throw new Error(`Erro ao aplicar pagamento de tokens de IA: ${error.message}`);
  }

  if (!data?.aplicado && data?.motivo === "oferta_nao_configurada") {
    console.warn(
      "[WEBHOOK ATOMO] Oferta sem configuracao de tokens de IA.",
      obterReferenciasOferta(payload)
    );
  }

  return data;
}

async function pagamentoEhRecargaTokens(params: {
  empresaId: string;
  payload: any;
}) {
  const oferta = await buscarOfertaAtomopay({
    payload: params.payload,
    empresaId: params.empresaId,
  });

  return oferta?.tipo === "recarga";
}

async function renovarTokensPlanoSemOfertaConfigurada(params: {
  empresaId: string;
  payload: any;
}) {
  const referencia = obterTransactionId(params.payload);

  if (!referencia) return;

  const pagoEm = obterPagoEm(params.payload);

  const { error } = await supabase.rpc("renovar_tokens_assinatura_plano", {
    p_empresa_id: params.empresaId,
    p_referencia: referencia,
    p_pago_em: pagoEm,
    p_metadata_json: {
      origem: "webhook_atomopay_fallback",
      status: normalizarStatusPagamento(params.payload),
      payment_method: obterMetodoPagamento(params.payload),
      offer_hash: obterOfferHash(params.payload),
      offer_title: obterTituloOferta(params.payload),
      amount: obterValorPagamento(params.payload),
    },
  });

  if (error) {
    throw new Error(
      `Erro ao renovar tokens do plano sem oferta configurada: ${error.message}`
    );
  }
}

/* =========================
   CONVITE AUTH
========================= */

async function enviarConviteAuth(params: {
  email: string;
  nome: string;
  empresaId: string;
  telefone?: string | null;
}) {
  const { email, nome, empresaId, telefone } = params;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://crmprosperity.com";
  const redirectTo = `${siteUrl}/auth/callback?next=/definir-senha`;

  let inviteLink: string | null = null;

  const { data: inviteData, error: inviteError } =
    await supabase.auth.admin.generateLink({
      type: "invite",
      email,
      options: {
        redirectTo,
        data: {
          nome,
          empresa_id: empresaId,
          telefone: telefone ?? null,
        },
      },
    });

  if (!inviteError) {
    inviteLink = inviteData.properties?.action_link ?? null;
  }

  if (inviteError) {
    const mensagemErro = String(inviteError.message ?? "").toLowerCase();

    const usuarioJaExiste =
      mensagemErro.includes("already been registered") ||
      mensagemErro.includes("already registered") ||
      mensagemErro.includes("user already");

    if (!usuarioJaExiste) {
      throw new Error(inviteError.message);
    }

    console.warn(
      "[WEBHOOK ATOMO] Usuário já existe no Supabase Auth. Enviando recovery link.",
      email
    );

    const { data: recoveryData, error: recoveryError } =
      await supabase.auth.admin.generateLink({
        type: "recovery",
        email,
        options: {
          redirectTo,
        },
      });

    if (recoveryError) {
      throw new Error(recoveryError.message);
    }

    inviteLink = recoveryData.properties?.action_link ?? null;
  }

  if (!inviteLink) {
    throw new Error("Não foi possível gerar o link de definição de senha.");
  }

  const { error: resendError } = await resend.emails.send({
    from: "CRM Prosperity <no-reply@crmprosperity.com>",
    to: email,
    subject: "Seu acesso ao CRM Prosperity foi liberado",
    html: getDefinirSenhaTemplate({
      nome,
      link: inviteLink,
    }),
  });

  if (resendError) {
    console.error("[RESEND DEFINIR SENHA ERRO]", resendError);
    throw new Error("Erro ao enviar email de definição de senha.");
  }
}

/* =========================
   PROCESSAR PAGAMENTO
========================= */

async function processarPagamentoAprovado(lead: any, payload: any) {
  const transactionId = obterTransactionId(payload);

  const planoPagamento = await obterPlanoPagamento({
    payload,
    lead,
    empresaId: lead?.empresa_id ?? null,
  });

  const empresa = await criarEmpresa({
    lead,
    payload,
    planoId: planoPagamento.planoId,
  });

  const primeiroPagamento = lead?.pago !== true;

  const email = normalizarEmail(lead?.email || payload.customer?.email);

  if (!email) {
    throw new Error("Pagamento sem email válido.");
  }

  const ehRecargaTokens = await pagamentoEhRecargaTokens({
    empresaId: empresa.id,
    payload,
  });

  if (!ehRecargaTokens) {
    await aplicarAssinaturaPlano({
      empresaId: empresa.id,
      planoId: planoPagamento.planoId,
      planoSlug: planoPagamento.planoSlug,
      payload,
    });
  }

  const resultadoTokens = await aplicarPagamentoTokensIa({
    empresaId: empresa.id,
    payload,
  });

  if (
    !ehRecargaTokens &&
    !resultadoTokens?.aplicado &&
    resultadoTokens?.motivo === "oferta_nao_configurada"
  ) {
    await renovarTokensPlanoSemOfertaConfigurada({
      empresaId: empresa.id,
      payload,
    });
  }

  await supabase
    .from("pagamentos")
    .update({
      empresa_id: empresa.id,
      lead_id: lead?.id ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("gateway", "atomo")
    .eq("transaction_id", transactionId);

  if (primeiroPagamento) {
    await enviarConviteAuth({
      email,
      nome: lead?.nome || payload.customer?.name || "Cliente",
      empresaId: empresa.id,
      telefone: limparTelefone(
        lead?.telefone ||
          payload.customer?.phone_number ||
          payload.customer?.phone
      ),
    });
  }

  await supabase
    .from("leads_cadastro")
    .update({
      status: "pago",
      pago: true,
      pago_em: obterPagoEm(payload),
      empresa_id: empresa.id,
      plano_slug: planoPagamento.planoSlug,
      atomopay_checkout_id: transactionId,
      atomopay_customer_id: payload.customer?.id ?? null,
      metadata_json: payload,
      updated_at: new Date().toISOString(),
    })
    .eq("id", lead.id);
}

/* =========================
   ROUTE
========================= */

export async function POST(request: Request) {
  try {
    const body = await request.json();

    console.log("[WEBHOOK ATOMO]", body);

    const email = normalizarEmail(body.customer?.email);
    const telefone1 = limparTelefone(body.customer?.phone);
    const telefone2 = limparTelefone(body.customer?.phone_number);

    let lead = await buscarLeadCadastro({
      email,
      telefone1,
      telefone2,
    });

    if (!lead) {
      lead = await criarLeadAutomatico(body);
    }

    const pagamento = await salvarPagamento(body, lead?.id ?? null);

    const status = normalizarStatusPagamento(body);

    if (status === "paid") {
      await processarPagamentoAprovado(lead, body);
    }

    return NextResponse.json({
      ok: true,
      lead_id: lead?.id,
      pagamento_id: pagamento?.id,
      status,
      transaction_id: obterTransactionId(body),
      offer_hash: obterOfferHash(body),
    });
  } catch (error: any) {
    console.error("[ERRO WEBHOOK ATOMO]", error);

    return NextResponse.json(
      {
        ok: false,
        error: error?.message ?? "Erro interno no webhook da AtomoPay.",
      },
      { status: 500 }
    );
  }
}

/* =========================
   TEMPLATE EMAIL
========================= */

function getDefinirSenhaTemplate({
  nome,
  link,
}: {
  nome?: string | null;
  link: string;
}) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://crmprosperity.com";
  const logoUrl = `${siteUrl}/logo.png`;
  const nomeCliente = nome?.trim() || "cliente";

  return `
  <!DOCTYPE html>
  <html lang="pt-BR">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Acesso liberado</title>
    </head>

    <body style="margin:0; padding:0; background:#eef3ff; font-family:Arial, Helvetica, sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#eef3ff; padding:40px 16px;">
        <tr>
          <td align="center">

            <table width="100%" cellpadding="0" cellspacing="0" style="max-width:620px; background:#ffffff; border-radius:24px; overflow:hidden; box-shadow:0 20px 60px rgba(15, 23, 42, 0.14);">

              <tr>
                <td style="
                  background: linear-gradient(135deg, #04254d 0%, #0b1526 25%, #0b1526 75%, #082d29 100%);
                  padding: 40px 32px;
                  text-align: center;
                  position: relative;
                ">

                  <div style="
                    position:absolute;
                    inset:0;
                    background:
                      radial-gradient(circle at top left, rgba(59,130,246,0.18), transparent 40%),
                      radial-gradient(circle at bottom right, rgba(16,185,129,0.12), transparent 40%);
                    opacity:0.6;
                  "></div>

                  <div style="position:relative; z-index:1;">

                    <img 
                      src="${logoUrl}" 
                      alt="CRM Prosperity" 
                      width="170" 
                      style="display:block; margin:0 auto 18px auto;"
                    />

                    <h1 style="margin:0; color:#ffffff; font-size:26px; font-weight:700;">
                      Seu acesso foi liberado
                    </h1>

                    <p style="margin:10px 0 0 0; color:#cbd5f5; font-size:15px;">
                      Bem-vindo ao CRM Prosperity
                    </p>

                  </div>

                </td>
              </tr>

              <tr>
                <td style="padding:40px 34px 32px 34px;">
                  <p style="margin:0 0 18px 0; color:#0f172a; font-size:18px; line-height:1.6; font-weight:700;">
                    Olá, ${nomeCliente}!
                  </p>

                  <p style="margin:0 0 18px 0; color:#475569; font-size:15px; line-height:1.7;">
                    Seu pagamento foi aprovado e seu acesso ao <strong>CRM Prosperity</strong> já está pronto.
                  </p>

                  <p style="margin:0 0 28px 0; color:#475569; font-size:15px; line-height:1.7;">
                    Para começar a usar a plataforma, clique no botão abaixo e crie sua senha de acesso com segurança.
                  </p>

                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td align="center" style="padding:8px 0 32px 0;">
                        <a 
                          href="${link}"
                          style="display:inline-block; background: linear-gradient(135deg, #0f509a 10%, #0b2551 100%); color:#ffffff; text-decoration:none; padding:16px 30px; border-radius:999px; font-size:15px; font-weight:700; box-shadow:0 10px 24px rgba(37,99,235,0.35);"
                        >
                          Criar senha e acessar
                        </a>
                      </td>
                    </tr>
                  </table>

                  <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:16px; padding:18px 20px; margin-bottom:26px;">
                    <p style="margin:0; color:#64748b; font-size:13px; line-height:1.6;">
                      Se o botão não funcionar, copie e cole este link no seu navegador:
                    </p>

                    <p style="margin:10px 0 0 0; color:#0b5ebd; font-size:12px; line-height:1.6; word-break:break-all;">
                      ${link}
                    </p>
                  </div>

                  <p style="margin:0; color:#64748b; font-size:13px; line-height:1.7;">
                    Por segurança, recomendamos criar uma senha forte e não compartilhar seus dados de acesso com terceiros.
                  </p>
                </td>
              </tr>

              <tr>
                <td style="background:#f8fafc; border-top:1px solid #e2e8f0; padding:24px 32px; text-align:center;">
                  <p style="margin:0 0 8px 0; color:#0f172a; font-size:14px; font-weight:700;">
                    CRM Prosperity
                  </p>

                  <p style="margin:0; color:#94a3b8; font-size:12px; line-height:1.6;">
                    © ${new Date().getFullYear()} CRM Prosperity. Todos os direitos reservados.
                  </p>
                </td>
              </tr>

            </table>

          </td>
        </tr>
      </table>
    </body>
  </html>
  `;
}
