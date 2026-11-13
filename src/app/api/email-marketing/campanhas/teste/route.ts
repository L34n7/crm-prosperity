import { NextResponse } from "next/server";
import { getEmailMarketingResend, validarAcessoEmailMarketing, buscarIntegracaoEmailMarketing, EMAIL_MARKETING_EMPRESA_LEGADA } from "@/lib/email-marketing/admin";
import { aplicarFallbacksVariaveis, renderizarVariaveis, sanitizarHtmlEmail, type VariaveisEmailMarketing } from "@/lib/email-marketing/conteudo";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { buscarEmailsSuprimidos } from "@/lib/email-marketing/campanhas";

const supabaseAdmin = getSupabaseAdmin();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LIMITE_TESTES_HORA = 30;

function fallbacksSeguros(valor: unknown) {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return {};
  const entries = Object.entries(valor as Record<string, unknown>).slice(0, 100);
  return Object.fromEntries(entries
    .map(([chave, conteudo]) => [
      chave.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, "").slice(0, 120),
      String(conteudo ?? "").slice(0, 2000),
    ])
    .filter(([chave]) => Boolean(chave))) as Record<string, string>;
}

/** Envia uma única prévia do template selecionado sem criar ou iniciar uma campanha. */
export async function POST(request: Request) {
  const acesso = await validarAcessoEmailMarketing("email_marketing.campanhas");
  if (!acesso.ok) {
    return NextResponse.json({ ok: false, error: acesso.error }, { status: acesso.status });
  }
  const empresaId = acesso.usuario.empresa_id;
  if (!empresaId) {
    return NextResponse.json({ ok: false, error: "Empresa não identificada." }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const contatoId = String(body?.contato_id || "");
  const templateId = String(body?.template_id || "");
  const remetenteId = String(body?.remetente_id || "");
  const assuntoInput = String(body?.assunto || "").trim();
  const fallbacks = fallbacksSeguros(body?.variaveis_fallbacks);

  if (![contatoId, templateId, remetenteId].every(id => UUID.test(id))) {
    return NextResponse.json({ ok: false, error: "Selecione um e-mail cadastrado, um template e um remetente." }, { status: 400 });
  }
  if (assuntoInput.length > 250) {
    return NextResponse.json({ ok: false, error: "O assunto é muito longo." }, { status: 400 });
  }

  const [{ data: contato, error: erroContato }, { data: template, error: erroTemplate }, { data: remetente, error: erroRemetente }, { data: integracao }] =
    await Promise.all([
      supabaseAdmin.from("contatos")
        .select("id, empresa_id, nome, email, telefone, empresa, origem, campanha, interesse, campo_contato, status_lead, classificacao, whatsapp_profile_name")
        .eq("id", contatoId).eq("empresa_id", empresaId).maybeSingle(),
      supabaseAdmin.from("email_templates")
        .select("id, empresa_id, escopo, assunto, html, texto, status")
        .eq("id", templateId).neq("status", "arquivado").maybeSingle(),
      supabaseAdmin.from("email_remetentes")
        .select("id, empresa_id, escopo, nome, email, dominio, status")
        .eq("id", remetenteId).eq("status", "verificado").maybeSingle(),
      buscarIntegracaoEmailMarketing(empresaId).then(data => ({ data })),
    ]);

  if (erroContato || erroTemplate || erroRemetente) {
    return NextResponse.json({ ok: false, error: "Não foi possível verificar o contato, o template ou o remetente." }, { status: 500 });
  }
  if (!contato || !EMAIL.test(String(contato.email || "").trim())) {
    return NextResponse.json({ ok: false, error: "Selecione um contato cadastrado com e-mail válido." }, { status: 404 });
  }
  if (!template || (template.empresa_id !== empresaId && !(template.empresa_id === null && template.escopo === "sistema"))) {
    return NextResponse.json({ ok: false, error: "Template indisponível nesta empresa." }, { status: 404 });
  }
  const usaCredencialIndividual = Boolean(integracao?.api_key_criptografada);
  const remetentePermitido = remetente &&
    ((remetente.empresa_id === empresaId && (!usaCredencialIndividual || remetente.dominio === integracao?.dominio)) ||
     (!usaCredencialIndividual && empresaId === EMAIL_MARKETING_EMPRESA_LEGADA && remetente.empresa_id === null && remetente.escopo === "sistema"));
  if (!remetentePermitido) {
    return NextResponse.json({ ok: false, error: "Remetente verificado indisponível nesta empresa." }, { status: 404 });
  }

  const destinatario = String(contato.email).trim().toLowerCase();
  let bloqueado = false;
  try {
    bloqueado = (await buscarEmailsSuprimidos(empresaId)).has(destinatario);
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Falha ao consultar a Resend." }, { status: 502 });
  }
  const umaHoraAtras = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const [ { count: qtdTestes, error: erroLimite }, { data: variaveisCustom, error: erroVariaveis }] =
    await Promise.all([
      supabaseAdmin.from("email_eventos").select("id", { count: "exact", head: true })
        .eq("empresa_id", empresaId)
        .eq("tipo", "email.sent")
        .contains("payload_json", { origem: "teste_previo_campanha" })
        .gte("ocorrido_em", umaHoraAtras),
      supabaseAdmin.from("automacao_variaveis").select("chave, valor")
        .eq("empresa_id", empresaId)
        .is("execucao_id", null).is("contato_id", null)
        .eq("metadata_json->>tipo", "global_empresa")
        .eq("metadata_json->>ativo", "true").limit(100),
    ]);
  if (erroLimite || erroVariaveis) {
    return NextResponse.json({ ok: false, error: "Não foi possível validar o envio de teste." }, { status: 500 });
  }
  if (bloqueado) {
    return NextResponse.json({ ok: false, error: "Este contato está em uma lista de supressão e não pode receber o teste." }, { status: 409 });
  }
  if ((qtdTestes ?? 0) >= LIMITE_TESTES_HORA) {
    return NextResponse.json({ ok: false, error: "Limite de testes desta empresa atingido nesta hora. Tente novamente mais tarde." }, { status: 429 });
  }

  const nome = String(contato.nome || "");
  const nomeWhatsapp = String(contato.whatsapp_profile_name || nome);
  const telefone = String(contato.telefone || "");
  const mapa: VariaveisEmailMarketing = {
    nome, nome_contato: nome, contato_nome: nome,
    nome_whatsapp: nomeWhatsapp, whatsapp_nome: nomeWhatsapp,
    nome_perfil_whatsapp: nomeWhatsapp, perfil_whatsapp_nome: nomeWhatsapp,
    nome_captura: nomeWhatsapp || nome,
    primeiro_nome_captura: (nomeWhatsapp || nome).trim().split(/\s+/)[0] || "",
    email: destinatario, email_contato: destinatario, contato_email: destinatario,
    telefone, numero: telefone, numero_contato: telefone,
    contato_numero: telefone, telefone_contato: telefone, contato_telefone: telefone,
    empresa: String(contato.empresa || ""), origem: String(contato.origem || ""),
    campanha: String(contato.campanha || ""), interesse: String(contato.interesse || ""),
    campo_contato: String(contato.campo_contato || ""), variavel_contato: String(contato.campo_contato || ""),
    status: String(contato.status_lead || ""), status_lead: String(contato.status_lead || ""),
    classificacao: String(contato.classificacao || ""),
    classificacao_lead: String(contato.classificacao || ""), lead_classificacao: String(contato.classificacao || ""),
    protocolo_atual: "", ultimo_protocolo: "",
  };
  for (const item of variaveisCustom || []) {
    const chave = String(item.chave || "").trim().toLowerCase();
    if (chave && !Object.prototype.hasOwnProperty.call(mapa, chave)) {
      mapa[chave] = String(item.valor || "").slice(0, 2000);
    }
  }
  for (const item of variaveisCustom || []) {
    const chave = String(item.chave || "").trim().toLowerCase();
    if (chave && typeof mapa[chave] === "string") {
      mapa[chave] = renderizarVariaveis(String(mapa[chave]), mapa, false);
    }
  }
  const personalizadas = aplicarFallbacksVariaveis(mapa, fallbacks);
  const assunto = "[TESTE] " + renderizarVariaveis(assuntoInput || template.assunto || "", personalizadas, false).slice(0, 250);
  const conteudo = renderizarVariaveis(sanitizarHtmlEmail(template.html), personalizadas, true);
  if (!conteudo.trim()) {
    return NextResponse.json({ ok: false, error: "O template não possui conteúdo para enviar." }, { status: 400 });
  }

  const aviso = '<div style="margin:0;padding:10px 14px;background:#eff8f6;color:#206b65;border-bottom:1px solid #c5e8df;font:700 12px Arial,sans-serif;text-align:center">PRÉVIA DE TESTE — nenhum envio em massa foi iniciado</div>';
  const html = /<body\b[^>]*>/i.test(conteudo)
    ? conteudo.replace(/<body\b[^>]*>/i, trecho => trecho + aviso)
    : aviso + conteudo;

  try {
    const resend = await getEmailMarketingResend(empresaId);
    const resultado = await resend.emails.send({
      from: remetente.nome + " <" + remetente.email + ">",
      to: [destinatario],
      subject: assunto,
      html,
    });
    if (resultado.error || !resultado.data?.id) {
      return NextResponse.json(
        { ok: false, error: resultado.error?.message || "O provedor não confirmou o envio de teste." },
        { status: 502 }
      );
    }

    const enviadoEm = new Date().toISOString();
    const { error: erroEvento } = await supabaseAdmin.from("email_eventos").insert({
      empresa_id: empresaId,
      provider: "resend",
      provider_message_id: resultado.data.id,
      tipo: "email.sent",
      destinatario_email: destinatario,
      ocorrido_em: enviadoEm,
      payload_json: {
        origem: "teste_previo_campanha",
        template_id: template.id,
        remetente_id: remetente.id,
        contato_id: contato.id,
        assunto,
      },
    });
    if (erroEvento) {
      console.error("[EMAIL MARKETING] Teste enviado; erro ao registrar evento:", erroEvento);
    }
    return NextResponse.json({
      ok: true,
      message: "E-mail de teste enviado ao provedor.",
      email: destinatario,
      enviado_em: enviadoEm,
      provider_message_id: resultado.data.id,
    });
  } catch (error) {
    console.error("[EMAIL MARKETING] Erro no envio de teste de campanha:", error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Falha ao enviar teste." }, { status: 500 });
  }
}
