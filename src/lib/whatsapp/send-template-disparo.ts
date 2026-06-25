import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { findOrCreateWhatsAppContact } from "@/lib/whatsapp/find-or-create-contact";
import { findOrCreateWhatsAppConversation } from "@/lib/whatsapp/find-or-create-conversation";
import { atualizarReservaLimiteMeta } from "@/lib/whatsapp/meta-limites";

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

export type TemplatePayloadDisparo = {
  name?: string;
  language?: string;
  components?: TemplateComponent[];
};

export type TemplateDisparo = {
  id: string;
  nome: string;
  idioma?: string | null;
  payload?: TemplatePayloadDisparo | null;
};

export type IntegracaoDisparo = {
  id: string;
  phone_number_id?: string | null;
  token_ref?: string | null;
  config_json?: Record<string, unknown> | null;
};

export type ResultadoEnvioTemplateDisparo = {
  ok: boolean;
  statusDisparo: "processando" | "falha";
  statusHttp: number | null;
  messageId: string | null;
  erro: string | null;
  erroCodigoMeta: number | null;
  contatoId: string | null;
  conversaId: string | null;
  conversaProtocoloId: string | null;
  nomeContato: string | null;
  mensagemTemplate: string;
  metaResponse: unknown;
};

type EnviarTemplateDisparoParams = {
  empresaId: string;
  integracaoWhatsappId: string;
  usuarioId: string | null;
  numero: string;
  nomeContato?: string | null;
  variaveis: string[];
  template: TemplateDisparo;
  integracao: IntegracaoDisparo;
  reservaIdsLimiteMeta?: string[];
  campanhaId?: string | null;
  itemId?: string | null;
  origem?: string;
};

const supabaseAdmin = getSupabaseAdmin();

function objeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
}

function texto(valor: unknown) {
  return String(valor || "").trim();
}

export function limparNumeroDisparo(valor: string) {
  return String(valor || "").replace(/\D/g, "");
}

function contarVariaveisNoTexto(textoTemplate?: string | null) {
  if (!textoTemplate) return 0;

  const matches = textoTemplate.match(/\{\{\d+\}\}/g) || [];
  const numeros = matches
    .map((item) => Number(item.replace(/[{}]/g, "")))
    .filter((n) => !Number.isNaN(n));

  if (numeros.length === 0) return 0;
  return Math.max(...numeros);
}

function substituirVariaveisTexto(textoTemplate: string, variaveis: string[]) {
  if (!textoTemplate) return "";

  return textoTemplate.replace(/\{\{(\d+)\}\}/g, (_, numero) => {
    const index = Number(numero) - 1;
    return variaveis[index] ?? `{{${numero}}}`;
  });
}

function montarParametrosParaTexto(
  textoTemplate: string | undefined,
  variaveis: string[]
) {
  const totalVariaveis = contarVariaveisNoTexto(textoTemplate);

  if (totalVariaveis === 0) {
    return [];
  }

  return Array.from({ length: totalVariaveis }).map((_, index) => ({
    type: "text",
    text: String(variaveis[index] || "").trim(),
  }));
}

export function montarComponentesTemplateDisparo(
  payload: TemplatePayloadDisparo | null,
  variaveis: string[]
) {
  const componentesOriginais = payload?.components || [];
  const componentesMontados: Array<Record<string, unknown>> = [];

  const header = componentesOriginais.find(
    (item) => String(item.type || "").toUpperCase() === "HEADER"
  );
  const body = componentesOriginais.find(
    (item) => String(item.type || "").toUpperCase() === "BODY"
  );
  const buttons = componentesOriginais.find(
    (item) => String(item.type || "").toUpperCase() === "BUTTONS"
  );

  let variavelOffset = 0;

  const headerTotalVariaveis = contarVariaveisNoTexto(header?.text);
  const headerParams = montarParametrosParaTexto(
    header?.text,
    variaveis.slice(variavelOffset)
  );
  variavelOffset += headerTotalVariaveis;

  if (headerParams.length > 0) {
    componentesMontados.push({
      type: "header",
      parameters: headerParams,
    });
  }

  const bodyTotalVariaveis = contarVariaveisNoTexto(body?.text);
  const bodyParams = montarParametrosParaTexto(
    body?.text,
    variaveis.slice(variavelOffset)
  );
  variavelOffset += bodyTotalVariaveis;

  if (bodyParams.length > 0) {
    componentesMontados.push({
      type: "body",
      parameters: bodyParams,
    });
  }

  for (const [index, button] of (buttons?.buttons || []).entries()) {
    const tipoBotao = String(button?.type || "").toUpperCase();
    const totalVariaveisBotao = contarVariaveisNoTexto(button?.url);

    if (tipoBotao !== "URL" || totalVariaveisBotao === 0) {
      continue;
    }

    const parametrosBotao = variaveis
      .slice(variavelOffset, variavelOffset + totalVariaveisBotao)
      .map((valor) => ({
        type: "text",
        text: String(valor || "").trim(),
      }));

    variavelOffset += totalVariaveisBotao;

    componentesMontados.push({
      type: "button",
      sub_type: "url",
      index: String(index),
      parameters: parametrosBotao,
    });
  }

  return componentesMontados.length > 0 ? componentesMontados : undefined;
}

export function montarConteudoTextoTemplateDisparo(
  payload: TemplatePayloadDisparo | null,
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
  let variavelOffset = 0;

  function substituirComOffset(textoTemplate: string) {
    const offsetAtual = variavelOffset;
    const total = contarVariaveisNoTexto(textoTemplate);
    variavelOffset += total;

    return String(textoTemplate || "").replace(/\{\{(\d+)\}\}/g, (_, numero) => {
      const index = offsetAtual + Number(numero) - 1;
      return variaveis[index] ?? `{{${numero}}}`;
    });
  }

  const headerTexto = substituirComOffset(header?.text || "").trim();
  const bodyTexto = substituirComOffset(body?.text || "").trim();
  const footerTexto = substituirVariaveisTexto(
    footer?.text || "",
    variaveis
  ).trim();

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
      .map((button) =>
        substituirVariaveisTexto(button.text || "", variaveis).trim()
      )
      .filter(Boolean) || [];

  if (quickReplies.length > 0) {
    partes.push(
      [
        "Respostas rapidas:",
        ...quickReplies.map((item, index) => `${index + 1}. ${item}`),
      ].join("\n")
    );
  }

  if (partes.length === 0) {
    return null;
  }

  return partes.join("\n\n");
}

function obterCredenciaisIntegracaoWhatsapp(integracao: IntegracaoDisparo) {
  const configJson = objeto(integracao.config_json);
  const metaTokenResponse = objeto(configJson.meta_token_response);
  const embeddedSignup = objeto(configJson.embedded_signup);
  const embeddedSignupRaw = objeto(embeddedSignup.raw);
  const embeddedSignupRawData = objeto(embeddedSignupRaw.data);

  const token = texto(
    configJson.access_token || metaTokenResponse.access_token
  );

  const phoneNumberId = texto(
    integracao.phone_number_id ||
      configJson.phone_number_id ||
      embeddedSignup.phone_number_id ||
      embeddedSignupRawData.phone_number_id
  );

  return {
    token,
    phoneNumberId,
  };
}

async function buscarOuCriarProtocoloAtivoDaConversa(params: {
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
    throw new Error(
      `Erro ao buscar protocolo ativo da conversa: ${protocoloAtivoError.message}`
    );
  }

  if (protocoloAtivo) {
    return protocoloAtivo;
  }

  const now = new Date().toISOString();
  const protocoloTexto = `DIS-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  const { data: novoProtocolo, error: novoProtocoloError } = await supabaseAdmin
    .from("conversa_protocolos")
    .insert({
      empresa_id: empresaId,
      conversa_id: conversaId,
      protocolo: protocoloTexto,
      tipo: "manual",
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
      `Erro ao criar protocolo da conversa: ${
        novoProtocoloError?.message || "Erro desconhecido."
      }`
    );
  }

  return novoProtocolo;
}

async function reativarConversaParaDisparo(params: {
  conversaId: string;
  usuarioId: string | null;
}) {
  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    status: "aberta",
    origem_atendimento: "manual",
    bot_ativo: false,
    closed_at: null,
    updated_at: now,
  };

  if (params.usuarioId) {
    payload.responsavel_id = params.usuarioId;
  }

  const { error } = await supabaseAdmin
    .from("conversas")
    .update(payload)
    .eq("id", params.conversaId);

  if (error) {
    throw new Error(`Erro ao reativar conversa: ${error.message}`);
  }
}

async function garantirContatoConversaEProtocolo(params: {
  empresaId: string;
  integracaoWhatsappId: string;
  usuarioId: string | null;
  numero: string;
  nomeContato?: string | null;
}) {
  const contato = await findOrCreateWhatsAppContact({
    empresaId: params.empresaId,
    phone: params.numero,
    profileName: params.nomeContato || null,
  });

  const conversa = await findOrCreateWhatsAppConversation({
    empresaId: params.empresaId,
    contatoId: contato.id,
    integracaoWhatsappId: params.integracaoWhatsappId,
  });

  await reativarConversaParaDisparo({
    conversaId: conversa.id,
    usuarioId: params.usuarioId,
  });

  const protocoloAtivo = await buscarOuCriarProtocoloAtivoDaConversa({
    empresaId: params.empresaId,
    conversaId: conversa.id,
  });

  return {
    contato,
    conversa,
    protocoloAtivo,
  };
}

async function registrarMensagemDeDisparo(params: {
  empresaId: string;
  conversaId: string;
  conversaProtocoloId: string | null;
  usuarioId: string | null;
  templateId: string;
  templateNome: string;
  templateIdioma: string | null;
  numeroDestino: string;
  nomeContato: string | null;
  variaveis: string[];
  payloadTemplate: TemplatePayloadDisparo | null;
  mensagemExternaId: string | null;
  statusEnvio: "enviada" | "falha";
  metaResponse: unknown;
  erroEnvio?: string | null;
  campanhaId?: string | null;
  itemId?: string | null;
  origem?: string;
}) {
  const now = new Date().toISOString();
  const tipo = params.origem || "disparo_template";
  const conteudoTemplate =
    montarConteudoTextoTemplateDisparo(params.payloadTemplate, params.variaveis) ||
    `Template enviado: ${params.templateNome}`;

  const conteudoFinal =
    params.statusEnvio === "falha"
      ? `[FALHA NO DISPARO]\n${conteudoTemplate}${
          params.erroEnvio ? `\n\nMotivo: ${params.erroEnvio}` : ""
        }`
      : conteudoTemplate;

  const { error } = await supabaseAdmin.from("mensagens").insert({
    empresa_id: params.empresaId,
    conversa_id: params.conversaId,
    remetente_tipo: params.usuarioId ? "usuario" : "bot",
    remetente_id: params.usuarioId,
    conteudo: conteudoFinal,
    tipo_mensagem: "template",
    origem: params.usuarioId ? "enviada" : "automatica",
    status_envio: params.statusEnvio,
    mensagem_externa_id: params.mensagemExternaId,
    metadata_json: {
      tipo,
      campanha_disparo_id: params.campanhaId || null,
      item_disparo_id: params.itemId || null,
      template_id: params.templateId,
      template_nome: params.templateNome,
      template_idioma: params.templateIdioma,
      numero_destino: params.numeroDestino,
      nome_contato: params.nomeContato,
      variaveis: params.variaveis,
      conteudo_renderizado: conteudoTemplate,
      erro_envio: params.erroEnvio || null,
      meta_response: params.metaResponse,
    },
    conversa_protocolo_id: params.conversaProtocoloId,
    created_at: now,
    updated_at: now,
  });

  if (error) {
    throw new Error(`Erro ao registrar mensagem de disparo: ${error.message}`);
  }
}

async function registrarLogDisparo(params: {
  empresaId: string;
  integracaoWhatsappId: string | null;
  templateId: string | null;
  conversaId: string | null;
  conversaProtocoloId: string | null;
  contatoId: string | null;
  usuarioId: string | null;
  numero: string;
  nomeContato: string | null;
  templateNome: string | null;
  templateIdioma: string | null;
  mensagem: string | null;
  status: "sucesso" | "falha" | "processando";
  erro: string | null;
  statusHttp: number | null;
  messageId: string | null;
  variaveis: string[];
  metaResponse: unknown;
  metadataJson?: Record<string, unknown>;
  campanhaId?: string | null;
  itemId?: string | null;
}) {
  const now = new Date().toISOString();

  const { error } = await supabaseAdmin.from("whatsapp_disparos_logs").insert({
    empresa_id: params.empresaId,
    integracao_whatsapp_id: params.integracaoWhatsappId,
    template_id: params.templateId,
    conversa_id: params.conversaId,
    conversa_protocolo_id: params.conversaProtocoloId,
    contato_id: params.contatoId,
    usuario_id: params.usuarioId,
    numero: params.numero,
    nome_contato: params.nomeContato,
    template_nome: params.templateNome,
    template_idioma: params.templateIdioma,
    mensagem: params.mensagem,
    status: params.status,
    erro: params.erro,
    status_http: params.statusHttp,
    message_id: params.messageId,
    variaveis: params.variaveis,
    meta_response: params.metaResponse,
    campanha_disparo_id: params.campanhaId || null,
    item_disparo_id: params.itemId || null,
    metadata_json: params.metadataJson || {},
    created_at: now,
    updated_at: now,
  });

  if (error) {
    throw new Error(`Erro ao registrar log do disparo: ${error.message}`);
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

function extrairErroMeta(metaData: unknown) {
  const data = objeto(metaData);
  const erro = objeto(data.error);
  const errorData = objeto(erro.error_data);
  const codigo = Number(erro.code || 0);
  const codigoMeta = Number.isFinite(codigo) && codigo > 0 ? codigo : null;
  const mensagem =
    texto(erro.error_user_msg) ||
    texto(errorData.details) ||
    texto(erro.message) ||
    "Erro ao enviar mensagem.";

  return {
    erro,
    codigoMeta,
    mensagem,
  };
}

function extrairMessageId(metaData: unknown) {
  const data = objeto(metaData);
  const messages = Array.isArray(data.messages)
    ? (data.messages as unknown[])
    : [];
  const primeiraMensagem = objeto(messages[0]);

  return texto(primeiraMensagem.id || primeiraMensagem.message_id) || null;
}

function extrairStatusMetaInicial(metaData: unknown) {
  const data = objeto(metaData);
  const messages = Array.isArray(data.messages)
    ? (data.messages as unknown[])
    : [];
  const primeiraMensagem = objeto(messages[0]);

  return texto(primeiraMensagem.message_status) || "accepted";
}

export async function registrarFalhaDisparoSemContato(params: {
  empresaId: string;
  integracaoWhatsappId: string;
  template: TemplateDisparo;
  usuarioId: string | null;
  numero: string;
  nomeContato?: string | null;
  variaveis: string[];
  erro: string;
  campanhaId?: string | null;
  itemId?: string | null;
  origem?: string;
}) {
  const mensagemTemplate =
    montarConteudoTextoTemplateDisparo(params.template.payload || null, params.variaveis) ||
    `Template enviado: ${params.template.nome}`;

  await registrarLogDisparo({
    empresaId: params.empresaId,
    integracaoWhatsappId: params.integracaoWhatsappId,
    templateId: params.template.id,
    conversaId: null,
    conversaProtocoloId: null,
    contatoId: null,
    usuarioId: params.usuarioId,
    numero: params.numero,
    nomeContato: params.nomeContato || null,
    templateNome: params.template.nome,
    templateIdioma: params.template.idioma || null,
    mensagem: mensagemTemplate,
    status: "falha",
    erro: params.erro,
    statusHttp: 0,
    messageId: null,
    variaveis: params.variaveis,
    metaResponse: null,
    campanhaId: params.campanhaId || null,
    itemId: params.itemId || null,
    metadataJson: {
      tipo: params.origem || "disparo_template",
      motivo: "numero_invalido",
      campanha_disparo_id: params.campanhaId || null,
      item_disparo_id: params.itemId || null,
    },
  });

  return {
    ok: false,
    statusDisparo: "falha" as const,
    statusHttp: 0,
    messageId: null,
    erro: params.erro,
    erroCodigoMeta: null,
    contatoId: null,
    conversaId: null,
    conversaProtocoloId: null,
    nomeContato: params.nomeContato || null,
    mensagemTemplate,
    metaResponse: null,
  };
}

export async function enviarTemplateDisparo({
  empresaId,
  integracaoWhatsappId,
  usuarioId,
  numero,
  nomeContato,
  variaveis,
  template,
  integracao,
  reservaIdsLimiteMeta = [],
  campanhaId = null,
  itemId = null,
  origem = "disparo_template",
}: EnviarTemplateDisparoParams): Promise<ResultadoEnvioTemplateDisparo> {
  const numeroLimpo = limparNumeroDisparo(numero);
  const payloadTemplate = template.payload || null;
  const mensagemTemplate =
    montarConteudoTextoTemplateDisparo(payloadTemplate, variaveis) ||
    `Template enviado: ${template.nome}`;

  if (!numeroLimpo || numeroLimpo.length < 10) {
    return registrarFalhaDisparoSemContato({
      empresaId,
      integracaoWhatsappId,
      template,
      usuarioId,
      numero: numeroLimpo,
      nomeContato,
      variaveis,
      erro: "Numero invalido.",
      campanhaId,
      itemId,
      origem,
    });
  }

  const { token, phoneNumberId } =
    obterCredenciaisIntegracaoWhatsapp(integracao);

  if (!token || !phoneNumberId) {
    throw new Error(
      "Integracao do WhatsApp incompleta. Reconecte a conta Meta ou atualize a integracao."
    );
  }

  const recursos = await garantirContatoConversaEProtocolo({
    empresaId,
    integracaoWhatsappId,
    usuarioId,
    numero: numeroLimpo,
    nomeContato,
  });

  const nomeContatoFinal =
    recursos.contato?.nome || nomeContato || "Sem nome";
  const components = montarComponentesTemplateDisparo(payloadTemplate, variaveis);
  const templateMeta: Record<string, unknown> = {
    name: template.nome,
    language: {
      code: template.idioma || "pt_BR",
    },
  };

  if (components && components.length > 0) {
    templateMeta.components = components;
  }

  const bodyMeta: Record<string, unknown> = {
    messaging_product: "whatsapp",
    to: numeroLimpo,
    type: "template",
    template: templateMeta,
  };

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

  const metaData = (await response.json()) as unknown;

  if (!response.ok) {
    const erroMeta = extrairErroMeta(metaData);

    await atualizarReservaLimiteMeta({
      reservaIds: reservaIdsLimiteMeta,
      telefone: numeroLimpo,
      status: "falha",
      contatoId: recursos.contato.id,
      conversaId: recursos.conversa.id,
      metadataJson: {
        erro: erroMeta.mensagem,
        erro_codigo_meta: erroMeta.codigoMeta,
        status_http: response.status,
        meta_response: metaData,
        campanha_disparo_id: campanhaId,
        item_disparo_id: itemId,
      },
    });

    await registrarMensagemDeDisparo({
      empresaId,
      conversaId: recursos.conversa.id,
      conversaProtocoloId: recursos.protocoloAtivo.id,
      usuarioId,
      templateId: template.id,
      templateNome: template.nome,
      templateIdioma: template.idioma || null,
      numeroDestino: numeroLimpo,
      nomeContato: nomeContatoFinal,
      variaveis,
      payloadTemplate,
      mensagemExternaId: null,
      statusEnvio: "falha",
      metaResponse: metaData,
      erroEnvio: erroMeta.mensagem,
      campanhaId,
      itemId,
      origem,
    });

    await registrarLogDisparo({
      empresaId,
      integracaoWhatsappId,
      templateId: template.id,
      conversaId: recursos.conversa.id,
      conversaProtocoloId: recursos.protocoloAtivo.id,
      contatoId: recursos.contato.id,
      usuarioId,
      numero: numeroLimpo,
      nomeContato: nomeContatoFinal,
      templateNome: template.nome,
      templateIdioma: template.idioma || null,
      mensagem: mensagemTemplate,
      status: "falha",
      erro: erroMeta.mensagem,
      statusHttp: response.status,
      messageId: null,
      variaveis,
      metaResponse: metaData,
      campanhaId,
      itemId,
      metadataJson: {
        tipo: origem,
        meta_error: erroMeta.erro || null,
        erro_codigo_meta: erroMeta.codigoMeta,
        campanha_disparo_id: campanhaId,
        item_disparo_id: itemId,
      },
    });

    await atualizarUltimaMensagemConversa(recursos.conversa.id);

    return {
      ok: false,
      statusDisparo: "falha",
      statusHttp: response.status,
      messageId: null,
      erro: erroMeta.mensagem,
      erroCodigoMeta: erroMeta.codigoMeta,
      contatoId: recursos.contato.id,
      conversaId: recursos.conversa.id,
      conversaProtocoloId: recursos.protocoloAtivo.id,
      nomeContato: nomeContatoFinal,
      mensagemTemplate,
      metaResponse: metaData,
    };
  }

  const messageId = extrairMessageId(metaData);

  await atualizarReservaLimiteMeta({
    reservaIds: reservaIdsLimiteMeta,
    telefone: numeroLimpo,
    status: "processando",
    messageId,
    contatoId: recursos.contato.id,
    conversaId: recursos.conversa.id,
    metadataJson: {
      message_id: messageId,
      status_meta_inicial: extrairStatusMetaInicial(metaData),
      meta_response: metaData,
      campanha_disparo_id: campanhaId,
      item_disparo_id: itemId,
    },
  });

  await registrarMensagemDeDisparo({
    empresaId,
    conversaId: recursos.conversa.id,
    conversaProtocoloId: recursos.protocoloAtivo.id,
    usuarioId,
    templateId: template.id,
    templateNome: template.nome,
    templateIdioma: template.idioma || null,
    numeroDestino: numeroLimpo,
    nomeContato: nomeContatoFinal,
    variaveis,
    payloadTemplate,
    mensagemExternaId: messageId,
    statusEnvio: "enviada",
    metaResponse: metaData,
    erroEnvio: null,
    campanhaId,
    itemId,
    origem,
  });

  await registrarLogDisparo({
    empresaId,
    integracaoWhatsappId,
    templateId: template.id,
    conversaId: recursos.conversa.id,
    conversaProtocoloId: recursos.protocoloAtivo.id,
    contatoId: recursos.contato.id,
    usuarioId,
    numero: numeroLimpo,
    nomeContato: nomeContatoFinal,
    templateNome: template.nome,
    templateIdioma: template.idioma || null,
    mensagem: mensagemTemplate,
    status: "processando",
    erro: null,
    statusHttp: response.status,
    messageId,
    variaveis,
    metaResponse: metaData,
    campanhaId,
    itemId,
    metadataJson: {
      tipo: origem,
      status_meta_inicial: extrairStatusMetaInicial(metaData),
      aguardando_webhook: true,
      campanha_disparo_id: campanhaId,
      item_disparo_id: itemId,
    },
  });

  await atualizarUltimaMensagemConversa(recursos.conversa.id);

  return {
    ok: true,
    statusDisparo: "processando",
    statusHttp: response.status,
    messageId,
    erro: null,
    erroCodigoMeta: null,
    contatoId: recursos.contato.id,
    conversaId: recursos.conversa.id,
    conversaProtocoloId: recursos.protocoloAtivo.id,
    nomeContato: nomeContatoFinal,
    mensagemTemplate,
    metaResponse: metaData,
  };
}
