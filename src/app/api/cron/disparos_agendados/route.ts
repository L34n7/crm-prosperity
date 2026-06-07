import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { findOrCreateWhatsAppConversation } from "@/lib/whatsapp/find-or-create-conversation";
import {
  chaveEhVariavelFixaContato,
  montarMapaVariaveisFixasContato,
  normalizarChaveVariavelFluxo,
} from "@/lib/automacoes/variaveis-fixas-contato";

type TemplateButton = {
  type?: string;
  text?: string;
  url?: string;
  phone_number?: string;
};

type TemplateComponent = {
  type: string;
  text?: string;
  format?: string;
  buttons?: TemplateButton[];
};

type TemplatePayload = {
  name?: string;
  language?: string;
  components?: TemplateComponent[];
};

const supabaseAdmin = getSupabaseAdmin();

function limparNumero(valor: string) {
  return String(valor || "").replace(/\D/g, "");
}

function contarVariaveisNoTexto(texto?: string | null) {
  if (!texto) return 0;

  const matches = texto.match(/\{\{\d+\}\}/g) || [];
  const numeros = matches
    .map((item) => Number(item.replace(/[{}]/g, "")))
    .filter((n) => !Number.isNaN(n));

  if (numeros.length === 0) return 0;

  return Math.max(...numeros);
}

function contarVariaveisTemplate(payload: TemplatePayload | null) {
  if (!payload?.components?.length) return 0;

  const textos = payload.components.map((item) => item.text || "").join(" ");
  const matches = textos.match(/\{\{\d+\}\}/g) || [];

  const numeros = matches
    .map((item) => Number(item.replace(/[{}]/g, "")))
    .filter((n) => !Number.isNaN(n));

  if (numeros.length === 0) return 0;

  return Math.max(...numeros);
}

function substituirVariaveisTexto(texto: string, variaveis: string[]) {
  if (!texto) return "";

  return texto.replace(/\{\{(\d+)\}\}/g, (_, numero) => {
    const index = Number(numero) - 1;
    return variaveis[index] ?? `{{${numero}}}`;
  });
}

function montarParametrosParaTexto(texto: string | undefined, variaveis: string[]) {
  const totalVariaveis = contarVariaveisNoTexto(texto);

  if (totalVariaveis === 0) {
    return [];
  }

  return Array.from({ length: totalVariaveis }).map((_, index) => ({
    type: "text",
    text: variaveis[index] || "",
  }));
}

function montarComponentesTemplate(
  payload: TemplatePayload | null,
  variaveis: string[]
) {
  const componentesOriginais = payload?.components || [];
  const componentesMontados: Array<Record<string, any>> = [];

  const header = componentesOriginais.find((item) => item.type === "HEADER");
  const body = componentesOriginais.find((item) => item.type === "BODY");

  const headerParams = montarParametrosParaTexto(header?.text, variaveis);
  const bodyParams = montarParametrosParaTexto(body?.text, variaveis);

  if (headerParams.length > 0) {
    componentesMontados.push({
      type: "header",
      parameters: headerParams,
    });
  }

  if (bodyParams.length > 0) {
    componentesMontados.push({
      type: "body",
      parameters: bodyParams,
    });
  }

  if (componentesMontados.length === 0 && contarVariaveisTemplate(payload) > 0) {
    componentesMontados.push({
      type: "body",
      parameters: variaveis.map((valor) => ({
        type: "text",
        text: valor || "",
      })),
    });
  }

  return componentesMontados.length > 0 ? componentesMontados : undefined;
}

function montarConteudoTextoTemplate(
  payload: TemplatePayload | null,
  variaveis: string[]
) {
  if (!payload?.components?.length) {
    return null;
  }

  const componentes = payload.components || [];

  const header = componentes.find((item) => item.type === "HEADER");
  const body = componentes.find((item) => item.type === "BODY");
  const footer = componentes.find((item) => item.type === "FOOTER");
  const buttons = componentes.find((item) => item.type === "BUTTONS");

  const partes: string[] = [];

  const headerTexto = substituirVariaveisTexto(header?.text || "", variaveis).trim();
  const bodyTexto = substituirVariaveisTexto(body?.text || "", variaveis).trim();
  const footerTexto = substituirVariaveisTexto(footer?.text || "", variaveis).trim();

  if (headerTexto) {
    partes.push(`Header: ${headerTexto}`);
  }

  if (bodyTexto) {
    partes.push(bodyTexto);
  }

  if (footerTexto) {
    partes.push(`Footer: ${footerTexto}`);
  }

  const quickReplies =
    buttons?.buttons
      ?.filter((button) => button?.type === "QUICK_REPLY" && button?.text)
      .map((button) => substituirVariaveisTexto(button.text || "", variaveis).trim())
      .filter(Boolean) || [];

  if (quickReplies.length > 0) {
    partes.push(
      [
        "Respostas rápidas:",
        ...quickReplies.map((texto, index) => `${index + 1}. ${texto}`),
      ].join("\n")
    );
  }

  if (partes.length === 0) {
    return null;
  }

  return partes.join("\n\n");
}

async function buscarOuCriarProtocoloAtivo(params: {
  empresaId: string;
  conversaId: string;
}) {
  const { empresaId, conversaId } = params;

  const { data: protocoloAtivo, error: protocoloAtivoError } = await supabaseAdmin
    .from("conversa_protocolos")
    .select("id, protocolo, ativo")
    .eq("empresa_id", empresaId)
    .eq("conversa_id", conversaId)
    .eq("ativo", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (protocoloAtivoError) {
    throw new Error(`Erro ao buscar protocolo: ${protocoloAtivoError.message}`);
  }

  if (protocoloAtivo) {
    return protocoloAtivo;
  }

  const now = new Date().toISOString();
  const protocoloTexto = `AUTO-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  const { data: novoProtocolo, error: novoProtocoloError } = await supabaseAdmin
    .from("conversa_protocolos")
    .insert({
      empresa_id: empresaId,
      conversa_id: conversaId,
      protocolo: protocoloTexto,
      tipo: "automacao",
      ativo: true,
      started_at: now,
      closed_at: null,
      created_at: now,
      updated_at: now,
    })
    .select("id, protocolo, ativo")
    .single();

  if (novoProtocoloError || !novoProtocolo) {
    throw new Error(
      `Erro ao criar protocolo: ${novoProtocoloError?.message || "Erro desconhecido"}`
    );
  }

  return novoProtocolo;
}

async function resolverVariaveisAgendamento(params: {
  empresaId: string;
  execucaoId: string | null;
  contato: any;
  variaveisConfig: string[];
}) {
  const { empresaId, execucaoId, contato, variaveisConfig } = params;

  if (!variaveisConfig.length) {
    return [];
  }

  const chaves = variaveisConfig
    .map((item) => normalizarChaveVariavelFluxo(item))
    .filter(Boolean);

  const { data: variaveisAutomacao } = execucaoId
    ? await supabaseAdmin
        .from("automacao_variaveis")
        .select("chave, valor")
        .eq("empresa_id", empresaId)
        .eq("execucao_id", execucaoId)
        .in("chave", chaves)
    : { data: [] };

  const mapa = new Map<string, string>();

  for (const variavel of variaveisAutomacao || []) {
    mapa.set(
      String(variavel.chave || "").toLowerCase(),
      String(variavel.valor || "")
    );
  }

  const variaveisFixasContato = montarMapaVariaveisFixasContato(contato);

  return chaves.map((chave) => {
    if (chaveEhVariavelFixaContato(chave)) {
      return variaveisFixasContato.get(chave) || "";
    }

    if (mapa.has(chave)) {
      return mapa.get(chave) || "";
    }

    if (chave === "nome") {
      return String(contato?.nome || "");
    }

    if (chave === "telefone") {
      return String(contato?.telefone || "");
    }

    if (chave === "email") {
      return String(contato?.email || "");
    }

    if (chave === "empresa") {
      return String(contato?.empresa || "");
    }

    return "";
  });
}

async function executarDisparoAgendado(agendamento: any) {
  const payload = agendamento.payload_json || {};
  const empresaId = agendamento.empresa_id;
  const execucaoId = agendamento.execucao_id || null;

  const conversaIdPayload = String(payload.conversa_id || "").trim();
  const contatoIdPayload = String(payload.contato_id || "").trim();
  const templateId = String(payload.template_id || "").trim();

  if (!conversaIdPayload && !contatoIdPayload) {
    throw new Error("Agendamento sem conversa_id ou contato_id no payload.");
  }

  if (!templateId) {
    throw new Error("Agendamento sem template_id no payload.");
  }

  let conversa: any = null;

  if (conversaIdPayload) {
    const { data, error } = await supabaseAdmin
      .from("conversas")
      .select(`
        id,
        empresa_id,
        contato_id,
        integracao_whatsapp_id,
        contatos (
          id,
          nome,
          telefone,
          email,
          empresa
        )
      `)
      .eq("id", conversaIdPayload)
      .eq("empresa_id", empresaId)
      .maybeSingle();

    if (error || !data) {
      throw new Error("Conversa não encontrada.");
    }

    conversa = data;
  } else {
    const { data: contato, error: contatoError } = await supabaseAdmin
      .from("contatos")
      .select("id, nome, telefone, email, empresa")
      .eq("id", contatoIdPayload)
      .eq("empresa_id", empresaId)
      .maybeSingle();

    if (contatoError || !contato) {
      throw new Error("Contato não encontrado.");
    }

    const integracaoWhatsappIdPayload = String(
      payload.integracao_whatsapp_id || ""
    ).trim();

    if (!integracaoWhatsappIdPayload) {
      throw new Error("Agendamento sem integracao_whatsapp_id no payload.");
    }

    const conversaCriada = await findOrCreateWhatsAppConversation({
      empresaId,
      contatoId: contato.id,
      integracaoWhatsappId: integracaoWhatsappIdPayload,
    });

    conversa = {
      ...conversaCriada,
      contatos: contato,
    };
  }

  const contato = Array.isArray(conversa.contatos)
    ? conversa.contatos[0]
    : conversa.contatos;

  const numeroDestino = limparNumero(
    payload.numero_destino || contato?.telefone || ""
  );

  if (!numeroDestino || numeroDestino.length < 10) {
    throw new Error("Número do contato inválido.");
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
    .eq("id", templateId)
    .eq("empresa_id", empresaId)
    .maybeSingle();

  if (templateError || !template) {
    throw new Error("Template não encontrado.");
  }

  if (String(template.status || "").toUpperCase() !== "APPROVED") {
    throw new Error("Template não está aprovado.");
  }

  const integracaoWhatsappId =
    conversa.integracao_whatsapp_id ||
    payload.integracao_whatsapp_id ||
    template.integracao_whatsapp_id;

  if (!integracaoWhatsappId) {
    throw new Error("Integração WhatsApp não encontrada para o disparo.");
  }

  const { data: integracao, error: integracaoError } = await supabaseAdmin
    .from("integracoes_whatsapp")
    .select("id, empresa_id, status, phone_number_id, token_ref")
    .eq("id", integracaoWhatsappId)
    .eq("empresa_id", empresaId)
    .maybeSingle();

  if (integracaoError || !integracao) {
    throw new Error("Integração WhatsApp não encontrada.");
  }

  const tokenEnvName =
    integracao.token_ref && String(integracao.token_ref).trim()
      ? String(integracao.token_ref).trim()
      : "WHATSAPP_ACCESS_TOKEN";

  const token = process.env[tokenEnvName as keyof typeof process.env];
  const phoneNumberId =
    integracao.phone_number_id || process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    throw new Error("Token ou phone_number_id do WhatsApp não configurado.");
  }

  const variaveisConfig = Array.isArray(payload.variaveis)
    ? payload.variaveis
    : [];

  const variaveis = await resolverVariaveisAgendamento({
    empresaId,
    execucaoId,
    contato,
    variaveisConfig,
  });

  const payloadTemplate = (template.payload || null) as TemplatePayload | null;
  const components = montarComponentesTemplate(payloadTemplate, variaveis);

  const bodyMeta: Record<string, any> = {
    messaging_product: "whatsapp",
    to: numeroDestino,
    type: "template",
    template: {
      name: template.nome,
      language: {
        code: template.idioma || "pt_BR",
      },
    },
  };

  if (components && components.length > 0) {
    bodyMeta.template.components = components;
  }

  const response = await fetch(
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

  const metaData = await response.json();

  const mensagemTemplate =
    montarConteudoTextoTemplate(payloadTemplate, variaveis) ||
    `Template enviado: ${template.nome}`;

  const messageId = metaData?.messages?.[0]?.id || null;

  const protocoloAtivo = await buscarOuCriarProtocoloAtivo({
    empresaId,
    conversaId: conversa.id,
  });

  const now = new Date().toISOString();

  if (!response.ok) {
    const erroMeta =
      metaData?.error?.error_user_msg ||
      metaData?.error?.message ||
      "Erro ao enviar template pela Meta.";

    await supabaseAdmin.from("mensagens").insert({
      empresa_id: empresaId,
      conversa_id: conversa.id,
      conversa_protocolo_id: protocoloAtivo.id,
      remetente_tipo: "bot",
      remetente_id: null,
      conteudo: `[FALHA NO DISPARO]\n${mensagemTemplate}\n\nMotivo: ${erroMeta}`,
      tipo_mensagem: "template",
      origem: "automatica",
      status_envio: "falha",
      mensagem_externa_id: null,
      automacao_execucao_id: execucaoId,
      automacao_no_id: agendamento.no_id,
      metadata_json: {
        tipo: "disparo_template_agendado",
        agendamento_id: agendamento.id,
        template_id: template.id,
        template_nome: template.nome,
        template_idioma: template.idioma,
        numero_destino: numeroDestino,
        variaveis,
        erro_envio: erroMeta,
        meta_response: metaData,
      },
      created_at: now,
      updated_at: now,
    });

    throw new Error(erroMeta);
  }

  await supabaseAdmin.from("mensagens").insert({
    empresa_id: empresaId,
    conversa_id: conversa.id,
    conversa_protocolo_id: protocoloAtivo.id,
    remetente_tipo: "bot",
    remetente_id: null,
    conteudo: mensagemTemplate,
    tipo_mensagem: "template",
    origem: "automatica",
    status_envio: "enviada",
    mensagem_externa_id: messageId,
    automacao_execucao_id: execucaoId,
    automacao_no_id: agendamento.no_id,
    metadata_json: {
      tipo: "disparo_template_agendado",
      agendamento_id: agendamento.id,
      template_id: template.id,
      template_nome: template.nome,
      template_idioma: template.idioma,
      numero_destino: numeroDestino,
      variaveis,
      conteudo_renderizado: mensagemTemplate,
      meta_response: metaData,
    },
    created_at: now,
    updated_at: now,
  });

  await supabaseAdmin
    .from("conversas")
    .update({
      status: "aberta",
      origem_atendimento: "reativacao",
      bot_ativo: false,
      closed_at: null,
      last_message_at: now,
      updated_at: now,
    })
    .eq("id", conversa.id)
    .eq("empresa_id", empresaId);

  return {
    messageId,
    conversaId: conversa.id,
    protocoloId: protocoloAtivo.id,
    templateNome: template.nome,
    numeroDestino,
    variaveis,
    metaData,
  };
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json(
      {
        ok: false,
        error: "Unauthorized",
      },
      { status: 401 }
    );
  }

  try {
    const agora = new Date().toISOString();

    const { data: agendamentos, error } = await supabaseAdmin
      .from("automacao_agendamentos")
      .select("*")
      .eq("status", "pendente")
      .eq("tipo_agendamento", "disparo_template")
      .lte("executar_em", agora)
      .order("executar_em", { ascending: true })
      .limit(25);

    if (error) {
      console.error("[CRON DISPAROS] Erro ao buscar agendamentos:", error);

      return NextResponse.json(
        {
          ok: false,
          error: error.message,
        },
        { status: 500 }
      );
    }

    let enviados = 0;
    let erros = 0;

    for (const agendamento of agendamentos || []) {
      try {
        const resultado = await executarDisparoAgendado(agendamento);

        await supabaseAdmin
          .from("automacao_agendamentos")
          .update({
            status: "executado",
            executed_at: new Date().toISOString(),
            payload_json: {
              ...(agendamento.payload_json || {}),
              resultado_envio: {
                message_id: resultado.messageId,
                conversa_id: resultado.conversaId,
                protocolo_id: resultado.protocoloId,
                template_nome: resultado.templateNome,
                numero_destino: resultado.numeroDestino,
                variaveis: resultado.variaveis,
              },
            },
          })
          .eq("id", agendamento.id)
          .eq("empresa_id", agendamento.empresa_id);

        enviados += 1;
      } catch (error: any) {
        console.error("[CRON DISPAROS] Erro ao executar disparo:", error);

        await supabaseAdmin
          .from("automacao_agendamentos")
          .update({
            status: "erro",
            executed_at: new Date().toISOString(),
            payload_json: {
              ...(agendamento.payload_json || {}),
              erro_execucao: error?.message || "Erro desconhecido.",
            },
          })
          .eq("id", agendamento.id)
          .eq("empresa_id", agendamento.empresa_id);

        erros += 1;
      }
    }

    return NextResponse.json({
      ok: true,
      processados: agendamentos?.length || 0,
      enviados,
      erros,
    });
  } catch (error: any) {
    console.error("[CRON DISPAROS] Erro geral:", error);

    return NextResponse.json(
      {
        ok: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}
