import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { can } from "@/lib/permissoes/frontend";
import {
  getRequestAuditMetadata,
  registrarLogAuditoriaSeguro,
} from "@/lib/auditoria/logs";

const supabaseAdmin = getSupabaseAdmin();

type TemplatePayload = {
  name?: string;
  language?: string;
  category?: string;
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

type UsuarioSetorVinculo = {
  setor_id?: string | null;
  is_principal?: boolean | null;
};

type UsuarioContextoMinimo = {
  id: string;
  nome?: string | null;
  email?: string | null;
  empresa_id?: string | null;
  permissoes?: string[];
  setor_principal_id?: string | null;
  setores_ids?: string[];
  usuarios_setores?: UsuarioSetorVinculo[];
};

type ConfigJsonWhatsapp = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
};

function limparNumero(numero: string) {
  return String(numero || "").replace(/\D/g, "");
}

function gerarCodigoAleatorio(tamanho = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let resultado = "";

  for (let i = 0; i < tamanho; i += 1) {
    resultado += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return resultado;
}

function gerarNumeroProtocolo() {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");

  return `RE-${ano}${mes}${dia}-${gerarCodigoAleatorio(6)}`;
}

function obterSetorPrincipalDoUsuario(usuario: UsuarioContextoMinimo) {
  if (usuario?.setor_principal_id) {
    return usuario.setor_principal_id;
  }

  if (Array.isArray(usuario?.usuarios_setores)) {
    const principal = usuario.usuarios_setores.find(
      (item) => item?.is_principal && item?.setor_id
    );

    if (principal?.setor_id) {
      return principal.setor_id;
    }

    const primeiro = usuario.usuarios_setores.find((item) => item?.setor_id);
    if (primeiro?.setor_id) {
      return primeiro.setor_id;
    }
  }

  if (Array.isArray(usuario?.setores_ids) && usuario.setores_ids[0]) {
    return usuario.setores_ids[0];
  }

  return null;
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

  const header =
    payloadTemplate.components.find(
      (item) => String(item.type || "").toUpperCase() === "HEADER"
    )?.text || "";

  const body =
    payloadTemplate.components.find(
      (item) => String(item.type || "").toUpperCase() === "BODY"
    )?.text || "";

  const footer =
    payloadTemplate.components.find(
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

async function encerrarProtocolosAtivosDaConversa(conversaId: string) {
  const now = new Date().toISOString();

  const { error } = await supabaseAdmin
    .from("conversa_protocolos")
    .update({
      ativo: false,
      closed_at: now,
      updated_at: now,
    })
    .eq("conversa_id", conversaId)
    .eq("ativo", true);

  if (error) {
    throw new Error(`Erro ao encerrar protocolos ativos: ${error.message}`);
  }
}

async function criarNovoProtocoloDeReabertura(params: {
  conversaId: string;
  empresaId: string;
}) {
  const now = new Date().toISOString();
  const protocolo = gerarNumeroProtocolo();

  const { data, error } = await supabaseAdmin
    .from("conversa_protocolos")
    .insert({
      conversa_id: params.conversaId,
      empresa_id: params.empresaId,
      protocolo,
      tipo: "reabertura",
      ativo: true,
      started_at: now,
      closed_at: null,
      created_at: now,
      updated_at: now,
    })
    .select("id, protocolo")
    .single();

  if (error || !data) {
    throw new Error(`Erro ao criar protocolo de reabertura: ${error?.message}`);
  }

  return data;
}

async function reabrirConversaAposDisparo(params: {
  conversaId: string;
  usuarioId: string;
  setorId: string | null;
}) {
  const now = new Date().toISOString();

  const payload: Record<string, unknown> = {
    responsavel_id: params.usuarioId,
    status: "em_atendimento",
    bot_ativo: false,
    origem_atendimento: "manual",
    closed_at: null,
    started_at: now,
    updated_at: now,
  };

  if (params.setorId) {
    payload.setor_id = params.setorId;
  }

  const { error } = await supabaseAdmin
    .from("conversas")
    .update(payload)
    .eq("id", params.conversaId);

  if (error) {
    throw new Error(`Erro ao reabrir conversa: ${error.message}`);
  }
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
    const auditMeta = getRequestAuditMetadata(request);

    const conversaId = String(body?.conversa_id || "").trim();
    const templateNome = String(body?.template_nome || "").trim();
    const bodyParams = Array.isArray(body?.body_params)
      ? body.body_params.map((item: unknown) => String(item || ""))
      : [];

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

    const { usuario } = resultado as { usuario: UsuarioContextoMinimo };

    if (!can(usuario.permissoes, "whatsapp.disparos.individual.enviar")) {
      return NextResponse.json(
        { ok: false, error: "Sem permissão para enviar disparo individual" },
        { status: 403 }
      );
    }

    if (!usuario?.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada" },
        { status: 400 }
      );
    }

    const setorDoUsuario = obterSetorPrincipalDoUsuario(usuario);

    if (!setorDoUsuario) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem setor vinculado para reabrir a conversa" },
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
      .select(`
        id,
        empresa_id,
        status,
        phone_number_id,
        token_ref,
        config_json,
        payment_method_added,
        phone_registered,
        app_assigned,
        webhook_verificado
      `)
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

    const configJson = integracao.config_json as ConfigJsonWhatsapp | null;

    const token =
      typeof configJson?.access_token === "string"
        ? configJson.access_token.trim()
        : "";

    const phoneNumberId =
      typeof integracao.phone_number_id === "string"
        ? integracao.phone_number_id.trim()
        : "";

    if (!token || !phoneNumberId) {
      console.error("[DISPARO INDIVIDUAL] Integração sem token ou phone_number_id", {
        integracao_id: integracao.id,
        empresa_id: integracao.empresa_id,
        tem_token: Boolean(token),
        tem_phone_number_id: Boolean(phoneNumberId),
        token_ref: integracao.token_ref,
      });

      return NextResponse.json(
        {
          ok: false,
          error:
            "Integração do WhatsApp incompleta. Reconecte a conta Meta ou atualize a integração.",
        },
        { status: 400 }
      );
    }

    if (integracao.payment_method_added === false) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Não foi possível enviar o disparo porque a conta WhatsApp Business ainda não possui cartão cadastrado na Meta.",
          detalhe:
            "Cadastre um método de pagamento na conta WhatsApp Business dentro do Gerenciador da Meta e tente novamente.",
          motivo: "payment_method_missing",
        },
        { status: 402 }
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
      console.error("[DISPARO INDIVIDUAL] Erro da Meta:", metaData);

      const erroMeta = metaData?.error;
      const codigoMeta = Number(erroMeta?.code || 0);
      const mensagemMeta = String(erroMeta?.message || "");

      const erroPagamento =
        codigoMeta === 131042 ||
        mensagemMeta.toLowerCase().includes("payment") ||
        mensagemMeta.toLowerCase().includes("billing") ||
        mensagemMeta.toLowerCase().includes("pagamento") ||
        mensagemMeta.toLowerCase().includes("cobrança");

      if (erroPagamento) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Não foi possível enviar o disparo porque a conta WhatsApp Business possui pendência financeira ou não possui método de pagamento válido na Meta.",
            detalhe: mensagemMeta || "Erro financeiro retornado pela Meta.",
            motivo: "meta_payment_error",
            meta: metaData,
          },
          { status: 402 }
        );
      }

      return NextResponse.json(
        {
          ok: false,
          error: mensagemMeta || "Erro ao enviar template para a Meta",
          detalhe: erroMeta?.error_data?.details || null,
          meta: metaData,
        },
        { status: metaRes.status }
      );
    }

    const mensagemExternaId =
      metaData?.messages?.[0]?.id ||
      metaData?.messages?.[0]?.message_id ||
      null;

    await encerrarProtocolosAtivosDaConversa(conversa.id);

    await reabrirConversaAposDisparo({
      conversaId: conversa.id,
      usuarioId: usuario.id,
      setorId: setorDoUsuario,
    });

    const novoProtocolo = await criarNovoProtocoloDeReabertura({
      conversaId: conversa.id,
      empresaId: usuario.empresa_id,
    });

    const conteudoRenderizado =
      montarConteudoTextoTemplate(payloadTemplate, bodyParams) ||
      `Template enviado: ${template.nome}`;

    const now = new Date().toISOString();

    const { error: insertError } = await supabaseAdmin.from("mensagens").insert({
      empresa_id: usuario.empresa_id,
      conversa_id: conversa.id,
      conversa_protocolo_id: novoProtocolo.id,
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
        protocolo_reabertura_id: novoProtocolo.id,
        protocolo_reabertura_numero: novoProtocolo.protocolo,
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

    await registrarLogAuditoriaSeguro({
      empresa_id: usuario.empresa_id,
      categoria: "disparos",
      entidade: "disparo",
      entidade_id: conversa.id,
      acao: "disparo_individual_enviado",
      descricao: `Disparo individual enviado para ${nomeContato}`,
      usuario_id: usuario.id,
      usuario_nome: "nome" in usuario ? usuario.nome : null,
      usuario_email: "email" in usuario ? usuario.email : null,
      depois: {
        conversa_id: conversa.id,
        contato_id: contato?.id || null,
        template_id: template.id,
        template_nome: template.nome,
        mensagem_externa_id: mensagemExternaId,
        protocolo_id: novoProtocolo.id,
      },
      ip: auditMeta.ip,
      user_agent: auditMeta.user_agent,
    });

    return NextResponse.json({
      ok: true,
      message: `Disparo individual enviado com sucesso para ${nomeContato}`,
      data: {
        mensagem_externa_id: mensagemExternaId,
        protocolo_id: novoProtocolo.id,
        protocolo: novoProtocolo.protocolo,
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
