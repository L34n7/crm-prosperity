import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { Resend } from "resend";

const supabase = getSupabaseAdmin();
const resend = new Resend(process.env.RESEND_API_KEY);

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

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://crmprosperity.com";

  const { data, error } = await supabase.auth.admin.generateLink({
    type: "invite",
    email,
    options: {
      redirectTo: `${siteUrl}/auth/callback?next=/definir-senha`,
      data: {
        nome,
        empresa_id: empresaId,
        telefone: telefone ?? null,
      },
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  const inviteLink = data.properties?.action_link;

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