import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabase = getSupabaseAdmin();

/* =========================
   HELPERS
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

function montarNomeEmpresa(lead: any, payload: any) {
  const empresaLead = String(lead?.empresa ?? "").trim();
  const nomeCliente = String(payload.customer?.name ?? "").trim();

  if (empresaLead) return empresaLead;
  if (nomeCliente) return nomeCliente;

  return "Empresa Cliente";
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
    const { data } = await supabase
      .from("leads_cadastro")
      .select("*")
      .ilike("email", email)
      .limit(1)
      .maybeSingle();

    if (data) return data;
  }

  const telefones = [telefone1, telefone2].filter(Boolean);

  for (const telefone of telefones) {
    const { data } = await supabase
      .from("leads_cadastro")
      .select("*")
      .eq("telefone", telefone)
      .limit(1)
      .maybeSingle();

    if (data) return data;
  }

  return null;
}

async function criarLeadAutomatico(payload: any) {
  const { data, error } = await supabase
    .from("leads_cadastro")
    .insert({
      nome: payload.customer?.name ?? "Cliente",
      email: normalizarEmail(payload.customer?.email),
      telefone: limparTelefone(
        payload.customer?.phone_number || payload.customer?.phone
      ),
      empresa: payload.offer?.title ?? "Cliente Átomo",
      status: "novo",
      pago: false,
      metadata_json: payload,
      created_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  return data;
}

/* =========================
   EMPRESA
========================= */

async function buscarPlanoIdPorSlug(planoSlug: string | null | undefined) {
  if (!planoSlug) return null;

  const { data } = await supabase
    .from("planos")
    .select("id")
    .eq("slug", planoSlug)
    .limit(1)
    .maybeSingle();

  return data?.id ?? null;
}

async function criarEmpresa(lead: any, payload: any) {
  if (lead?.empresa_id) {
    const { data } = await supabase
      .from("empresas")
      .select("*")
      .eq("id", lead.empresa_id)
      .maybeSingle();

    if (data) return data;
  }

  const planoId = await buscarPlanoIdPorSlug(lead?.plano_slug);

  const { data, error } = await supabase
    .from("empresas")
    .insert({
      plano_id: planoId,
      nome_fantasia: montarNomeEmpresa(lead, payload),
      razao_social: montarNomeEmpresa(lead, payload),
      documento: payload.customer?.document ?? null,
      email: normalizarEmail(payload.customer?.email),
      telefone: limparTelefone(
        payload.customer?.phone_number || payload.customer?.phone
      ),
      nome_responsavel: payload.customer?.name ?? null,
      status: "ativa",
      timezone: "America/Sao_Paulo",
      observacoes: "Criada automaticamente via webhook",
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  return data;
}

/* =========================
   PAGAMENTO
========================= */

async function salvarPagamento(payload: any, leadId: string | null) {
  const { data, error } = await supabase
    .from("pagamentos")
    .upsert(
      {
        transaction_id: payload.transaction?.id,
        status: payload.status,
        metodo: payload.method,
        valor: payload.transaction?.amount,
        valor_liquido: payload.transaction?.net_amount,
        customer_email: normalizarEmail(payload.customer?.email),
        customer_nome: payload.customer?.name,
        lead_id: leadId,
        payload,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "transaction_id" }
    )
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  return data;
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

  const { error } = await supabase.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/definir-senha`,
    data: {
      nome,
      empresa_id: empresaId,
      telefone: telefone ?? null,
    },
  });

  if (error) throw new Error(error.message);
}

/* =========================
   PROCESSAR PAGAMENTO
========================= */

async function processarPagamentoAprovado(lead: any, payload: any) {
  const empresa = await criarEmpresa(lead, payload);

  const email = normalizarEmail(lead.email || payload.customer?.email);

  if (!email) {
    throw new Error("Pagamento sem email válido");
  }

  await enviarConviteAuth({
    email,
    nome: lead.nome || payload.customer?.name,
    empresaId: empresa.id,
    telefone: limparTelefone(
      lead.telefone ||
        payload.customer?.phone_number ||
        payload.customer?.phone
    ),
  });

  await supabase
    .from("leads_cadastro")
    .update({
      status: "pago",
      pago: true,
      pago_em: somenteDataValida(payload.paid_at) ?? new Date().toISOString(),
      empresa_id: empresa.id,
      atomopay_checkout_id: payload.transaction?.id,
      atomopay_customer_id: payload.customer?.id,
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

    const pagamento = await salvarPagamento(body, lead?.id);

    const status = String(body.status ?? body.transaction?.status ?? "")
      .toLowerCase()
      .trim();

    if (status === "paid") {
      await processarPagamentoAprovado(lead, body);
    }

    return NextResponse.json({
      ok: true,
      lead_id: lead?.id,
      pagamento_id: pagamento?.id,
    });
  } catch (error: any) {
    console.error("[ERRO WEBHOOK ATOMO]", error);

    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }
}