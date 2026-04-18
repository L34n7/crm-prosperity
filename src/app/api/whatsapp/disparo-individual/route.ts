import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";

const supabaseAdmin = getSupabaseAdmin();

type TemplatePayload = {
  name?: string;
  language?: string;
  components?: Array<{
    type: string;
    text?: string;
    format?: string;
    buttons?: Array<{
      type?: string;
      text?: string;
      url?: string;
      phone_number?: string;
    }>;
  }>;
};

function limparNumero(numero: string) {
  return String(numero || "").replace(/\D/g, "");
}

function montarComponentesTemplate(
  payloadTemplate: TemplatePayload | null,
  variaveis: string[]
) {
  if (!payloadTemplate?.components?.length) return undefined;

  const body = payloadTemplate.components.find(
    (item) => String(item.type || "").toUpperCase() === "BODY"
  );

  if (!body?.text) return undefined;

  const placeholders = body.text.match(/\{\{\d+\}\}/g) || [];
  if (placeholders.length === 0) return undefined;

  return [
    {
      type: "body",
      parameters: placeholders.map((_, index) => ({
        type: "text",
        text: String(variaveis[index] || "").trim(),
      })),
    },
  ];
}

function montarConteudoTextoTemplate(
  payloadTemplate: TemplatePayload | null,
  variaveis: string[]
) {
  if (!payloadTemplate?.components?.length) return "";

  const header = payloadTemplate.components.find(
    (item) => String(item.type || "").toUpperCase() === "HEADER"
  )?.text || "";

  const body = payloadTemplate.components.find(
    (item) => String(item.type || "").toUpperCase() === "BODY"
  )?.text || "";

  const footer = payloadTemplate.components.find(
    (item) => String(item.type || "").toUpperCase() === "FOOTER"
  )?.text || "";

  const substituir = (texto: string) =>
    texto.replace(/\{\{(\d+)\}\}/g, (_, grupo) => {
      const indice = Number(grupo) - 1;
      return String(variaveis[indice] || "");
    });

  const partes = [
    header ? substituir(header) : "",
    body ? substituir(body) : "",
    footer ? substituir(footer) : "",
  ].filter(Boolean);

  return partes.join("\n\n").trim();
}

async function atualizarUltimaMensagemConversa(conversaId: string) {
  const now = new Date().toISOString();

  const { error } = await supabaseAdmin
    .from("conversas")
    .update({
      last_message_at: now,
      updated_at: now,
    })
    .eq("id", conversaId);

  if (error) {
    throw new Error(`Erro ao atualizar conversa: ${error.message}`);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const conversaId = String(body?.conversa_id || "").trim();
    const templateNome = String(body?.template_nome || "").trim();
    const bodyParams = Array.isArray(body?.body_params) ? body.body_params : [];

    if (!conversaId) {
      return NextResponse.json(
        { ok: false, error: "conversa_id é obrigatório" },
        { status: 400 }
      );
    }

    if (!templateNome) {
      return NextResponse.json(
        { ok: false, error: "template_nome é obrigatório" },
        { status: 400 }
      );
    }

    const resultado = await getUsuarioContexto();

    if (!resultado.ok) {
      return NextResponse.json(
        { ok: false, error: resultado.error },
        { status: resultado.status }
      );
    }

    const { usuario } = resultado;

    if (!usuario?.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada" },
        { status: 400 }
      );
    }

    const { data: conversa, error: conversaError } = await supabaseAdmin
      .from("conversas")
      .select(`
        id,
        empresa_id,
        integracao_whatsapp_id,
        contatos (
          id,
          nome,
          telefone
        )
      `)
      .eq("id", conversaId)
      .eq("empresa_id", usuario.empresa_id)
      .single();

    if (conversaError || !conversa) {
      return NextResponse.json(
        { ok: false, error: "Conversa não encontrada" },
        { status: 404 }
      );
    }

    const contato = Array.isArray(conversa.contatos)
      ? conversa.contatos[0]
      : conversa.contatos;

    const telefone = limparNumero(contato?.telefone || "");
    const nomeContato = contato?.nome || "Contato";
    const integracaoWhatsappId = conversa.integracao_whatsapp_id;

    if (!integracaoWhatsappId) {
      return NextResponse.json(
        { ok: false, error: "Conversa sem integração WhatsApp vinculada" },
        { status: 400 }
      );
    }

    if (!telefone) {
      return NextResponse.json(
        { ok: false, error: "Contato sem telefone" },
        { status: 400 }
      );
    }

    const { data: integracao, error: integracaoError } = await supabaseAdmin
      .from("integracoes_whatsapp")
      .select("id, empresa_id, status, phone_number_id, token_ref")
      .eq("id", integracaoWhatsappId)
      .single();

    if (integracaoError || !integracao) {
      return NextResponse.json(
        { ok: false, error: "Integração WhatsApp não encontrada" },
        { status: 404 }
      );
    }

    if (integracao.empresa_id !== usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Você não pode usar esta integração" },
        { status: 403 }
      );
    }

    const { data: template, error: templateError } = await supabaseAdmin
      .from("whatsapp_templates")
      .select(`
        id,
        empresa_id,
        integracao_whatsapp_id,
        nome,
        idioma,
        status,
        payload
      `)
      .eq("empresa_id", usuario.empresa_id)
      .eq("integracao_whatsapp_id", integracaoWhatsappId)
      .eq("nome", templateNome)
      .single();

    if (templateError || !template) {
      return NextResponse.json(
        { ok: false, error: "Template não encontrado" },
        { status: 404 }
      );
    }

    if (String(template.status || "").toUpperCase() !== "APPROVED") {
      return NextResponse.json(
        { ok: false, error: "Somente templates aprovados podem ser enviados" },
        { status: 400 }
      );
    }

    const tokenEnvName =
      integracao.token_ref && String(integracao.token_ref).trim()
        ? String(integracao.token_ref).trim()
        : "WHATSAPP_ACCESS_TOKEN";

    const token = process.env[tokenEnvName as keyof typeof process.env];
    const phoneNumberId =
      integracao.phone_number_id || process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!token || !phoneNumberId) {
      return NextResponse.json(
        {
          ok: false,
          error: "Token ou phone_number_id do WhatsApp não configurado para esta integração",
        },
        { status: 500 }
      );
    }

    const payloadTemplate = (template.payload || null) as TemplatePayload | null;
    const components = montarComponentesTemplate(payloadTemplate, bodyParams);

    const bodyMeta: Record<string, unknown> = {
      messaging_product: "whatsapp",
      to: telefone,
      type: "template",
      template: {
        name: template.nome,
        language: {
          code: template.idioma || payloadTemplate?.language || "pt_BR",
        },
      },
    };

    if (components?.length) {
      (bodyMeta.template as Record<string, unknown>).components = components;
    }

    const metaRes = await fetch(
      `https://graph.facebook.com/v23.0/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(bodyMeta),
      }
    );

    const metaData = await metaRes.json();

    if (!metaRes.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: metaData?.error?.message || "Erro ao enviar template para a Meta",
          meta: metaData,
        },
        { status: metaRes.status }
      );
    }

    const mensagemExternaId =
      metaData?.messages?.[0]?.id ||
      metaData?.messages?.[0]?.message_id ||
      null;

    const conteudoRenderizado =
      montarConteudoTextoTemplate(payloadTemplate, bodyParams) ||
      `Template enviado: ${template.nome}`;

    const now = new Date().toISOString();

    const { error: insertError } = await supabaseAdmin.from("mensagens").insert({
      empresa_id: usuario.empresa_id,
      conversa_id: conversa.id,
      remetente_tipo: "usuario",
      remetente_id: usuario.id,
      conteudo: conteudoRenderizado,
      tipo_mensagem: "template",
      origem: "enviada",
      status_envio: "enviada",
      mensagem_externa_id: mensagemExternaId,
      metadata_json: {
        tipo: "disparo_template_individual",
        template_id: template.id,
        template_nome: template.nome,
        template_idioma: template.idioma,
        numero_destino: telefone,
        nome_destino: nomeContato,
        variaveis: bodyParams,
        conteudo_renderizado: conteudoRenderizado,
        meta_response: metaData,
      },
      created_at: now,
      updated_at: now,
    });

    if (insertError) {
      return NextResponse.json(
        {
          ok: false,
          error: `Template enviado à Meta, mas falhou ao registrar no banco: ${insertError.message}`,
          meta: metaData,
        },
        { status: 500 }
      );
    }

    await atualizarUltimaMensagemConversa(conversa.id);

    return NextResponse.json({
      ok: true,
      message: `Disparo individual enviado com sucesso para ${nomeContato}`,
      data: {
        mensagem_externa_id: mensagemExternaId,
        meta: metaData,
      },
    });
  } catch (error) {
    console.error("Erro no disparo individual:", error);

    return NextResponse.json(
      { ok: false, error: "Erro interno ao enviar disparo individual" },
      { status: 500 }
    );
  }
}