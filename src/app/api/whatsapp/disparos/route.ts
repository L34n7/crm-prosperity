import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { isAdministrador } from "@/lib/auth/authorization";
import { findOrCreateWhatsAppContact } from "@/lib/whatsapp/find-or-create-contact";
import { findOrCreateWhatsAppConversation } from "@/lib/whatsapp/find-or-create-conversation";

type DestinatarioEntrada = {
  numero: string;
  variaveis?: string[];
};

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

function usuarioTemPermissao(usuario: any, permissao: string) {
  const permissoes = Array.isArray(usuario?.permissoes) ? usuario.permissoes : [];
  return permissoes.includes(permissao);
}

function podeRealizarDisparos(usuario: any) {
  return (
    isAdministrador(usuario) ||
    usuarioTemPermissao(usuario, "whatsapp.disparos.enviar") ||
    usuarioTemPermissao(usuario, "mensagens.enviar")
  );
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

async function buscarOuCriarProtocoloAtivoDaConversa(params: {
  empresaId: string;
  conversaId: string;
}) {
  const { empresaId, conversaId } = params;

  const { data: protocoloAtivo, error: protocoloAtivoError } = await supabaseAdmin
    .from("conversa_protocolos")
    .select("id, protocolo, ativo")
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

  const { error: fecharAnterioresError } = await supabaseAdmin
    .from("conversa_protocolos")
    .update({
      ativo: false,
      closed_at: now,
      updated_at: now,
    })
    .eq("conversa_id", conversaId)
    .eq("ativo", true);

  if (fecharAnterioresError) {
    throw new Error(
      `Erro ao encerrar protocolos anteriores: ${fecharAnterioresError.message}`
    );
  }

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
  usuarioId: string;
}) {
  const now = new Date().toISOString();

  const { error } = await supabaseAdmin
    .from("conversas")
    .update({
      status: "aberta",
      origem_atendimento: "manual",
      responsavel_id: params.usuarioId,
      bot_ativo: false,
      menu_aguardando_resposta: false,
      closed_at: null,
      last_message_at: now,
      updated_at: now,
    })
    .eq("id", params.conversaId);

  if (error) {
    throw new Error(`Erro ao reativar conversa: ${error.message}`);
  }
}

async function registrarMensagemDeDisparo(params: {
  empresaId: string;
  conversaId: string;
  conversaProtocoloId: string | null;
  usuarioId: string;
  templateId: string;
  templateNome: string;
  templateIdioma: string | null;
  numeroDestino: string;
  nomeContato: string | null;
  variaveis: string[];
  payloadTemplate: TemplatePayload | null;
  mensagemExternaId: string | null;
  statusEnvio: "enviada" | "falha";
  metaResponse: any;
  erroEnvio?: string | null;
}) {
  const now = new Date().toISOString();

  const conteudoTemplate =
    montarConteudoTextoTemplate(params.payloadTemplate, params.variaveis) ||
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
    remetente_tipo: "usuario",
    remetente_id: params.usuarioId,
    conteudo: conteudoFinal,
    tipo_mensagem: "template",
    origem: "enviada",
    status_envio: params.statusEnvio,
    mensagem_externa_id: params.mensagemExternaId,
    metadata_json: {
      tipo: "disparo_template",
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
  status: "sucesso" | "falha";
  erro: string | null;
  statusHttp: number | null;
  messageId: string | null;
  variaveis: string[];
  metaResponse: any;
  metadataJson?: Record<string, any>;
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

async function garantirContatoConversaEProtocolo(params: {
  empresaId: string;
  integracaoWhatsappId: string;
  usuarioId: string;
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

export async function GET(req: NextRequest) {
  try {
    const resultadoContexto = await getUsuarioContexto();

    if (!resultadoContexto.ok) {
      return NextResponse.json(
        { ok: false, error: resultadoContexto.error },
        { status: resultadoContexto.status }
      );
    }

    const { usuario } = resultadoContexto;

    if (!usuario?.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada." },
        { status: 400 }
      );
    }

    const limitParam = Number(req.nextUrl.searchParams.get("limit") || "100");
    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(limitParam, 1), 300)
      : 100;

    const { data, error } = await supabaseAdmin
      .from("whatsapp_disparos_logs")
      .select(`
        id,
        conversa_id,
        numero,
        nome_contato,
        template_nome,
        template_idioma,
        mensagem,
        status,
        erro,
        status_http,
        message_id,
        created_at
      `)
      .eq("empresa_id", usuario.empresa_id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json(
        { ok: false, error: `Erro ao buscar histórico: ${error.message}` },
        { status: 500 }
      );
    }

    const resultados = (data || []).map((item: any) => ({
      id: item.id,
      created_at: item.created_at,
      conversa_id: item.conversa_id,
      numero: item.numero || "-",
      nome_contato: item.nome_contato || "Sem nome",
      template_nome: item.template_nome || "-",
      mensagem_template: item.mensagem || "Sem conteúdo",
      status_disparo: item.status || "falha",
      status_label: item.status === "sucesso" ? "Enviado" : "Falhou",
      erro: item.erro || null,
      status_http: item.status_http || null,
      message_id: item.message_id || null,
      ok: item.status === "sucesso",
    }));

    return NextResponse.json({
      ok: true,
      resultados,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Erro interno." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const resultadoContexto = await getUsuarioContexto();

    if (!resultadoContexto.ok) {
      return NextResponse.json(
        { ok: false, error: resultadoContexto.error },
        { status: resultadoContexto.status }
      );
    }

    const { usuario } = resultadoContexto;
    const body = await req.json();

    const integracaoWhatsappId = String(body?.integracao_whatsapp_id || "").trim();
    const templateId = String(body?.template_id || "").trim();
    const destinatarios = Array.isArray(body?.destinatarios)
      ? (body.destinatarios as DestinatarioEntrada[])
      : [];

    if (!usuario?.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada." },
        { status: 400 }
      );
    }

    const empresaId = usuario.empresa_id;

    if (!integracaoWhatsappId) {
      return NextResponse.json(
        { ok: false, error: "Integração WhatsApp é obrigatória." },
        { status: 400 }
      );
    }

    if (!templateId) {
      return NextResponse.json(
        { ok: false, error: "Template é obrigatório." },
        { status: 400 }
      );
    }

    if (destinatarios.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Informe pelo menos um destinatário." },
        { status: 400 }
      );
    }

    const permitido = podeRealizarDisparos(usuario);

    if (!permitido) {
      return NextResponse.json(
        {
          ok: false,
          error: "Você não tem permissão para realizar disparos.",
        },
        { status: 403 }
      );
    }

    const { data: integracao, error: integracaoError } = await supabaseAdmin
      .from("integracoes_whatsapp")
      .select("id, empresa_id, status, phone_number_id, token_ref, numero, nome_conexao")
      .eq("id", integracaoWhatsappId)
      .single();

    if (integracaoError || !integracao) {
      return NextResponse.json(
        {
          ok: false,
          error: "Integração WhatsApp não encontrada.",
        },
        { status: 404 }
      );
    }

    if (integracao.empresa_id !== usuario.empresa_id) {
      return NextResponse.json(
        {
          ok: false,
          error: "Você não pode usar esta integração.",
        },
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
      .eq("id", templateId)
      .single();

    if (templateError || !template) {
      return NextResponse.json(
        {
          ok: false,
          error: "Template não encontrado.",
        },
        { status: 404 }
      );
    }

    if (template.empresa_id !== usuario.empresa_id) {
      return NextResponse.json(
        {
          ok: false,
          error: "Você não pode usar este template.",
        },
        { status: 403 }
      );
    }

    if (template.integracao_whatsapp_id !== integracaoWhatsappId) {
      return NextResponse.json(
        {
          ok: false,
          error: "O template não pertence à integração selecionada.",
        },
        { status: 400 }
      );
    }

    if (String(template.status || "").toUpperCase() !== "APPROVED") {
      return NextResponse.json(
        {
          ok: false,
          error: "Somente templates aprovados podem ser disparados.",
        },
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
          error:
            "Token ou phone_number_id do WhatsApp não configurado para esta integração.",
        },
        { status: 500 }
      );
    }

    const payloadTemplate = (template.payload || null) as TemplatePayload | null;

    const resultados = await Promise.all(
      destinatarios.map(async (item) => {
        const numero = limparNumero(item.numero || "");
        const variaveis = Array.isArray(item.variaveis) ? item.variaveis : [];
        const nomeContatoVariavel = variaveis[0] || null;

        if (!numero || numero.length < 10) {
          const mensagemTemplateInvalida =
            montarConteudoTextoTemplate(payloadTemplate, variaveis) ||
            `Template enviado: ${template.nome}`;

          await registrarLogDisparo({
            empresaId,
            integracaoWhatsappId,
            templateId: template.id,
            conversaId: null,
            conversaProtocoloId: null,
            contatoId: null,
            usuarioId: usuario.id,
            numero,
            nomeContato: nomeContatoVariavel,
            templateNome: template.nome,
            templateIdioma: template.idioma || null,
            mensagem: mensagemTemplateInvalida,
            status: "falha",
            erro: "Número inválido.",
            statusHttp: 0,
            messageId: null,
            variaveis,
            metaResponse: null,
            metadataJson: {
              tipo: "disparo_template",
              motivo: "numero_invalido",
            },
          });
          return {
            numero,
            nome_contato: nomeContatoVariavel,
            ok: false,
            status: 0,
            status_disparo: "falha",
            status_label: "Falhou",
            template_nome: template.nome,
            mensagem_template:
              montarConteudoTextoTemplate(payloadTemplate, variaveis) ||
              `Template enviado: ${template.nome}`,
            message_id: null,
            erro: "Número inválido.",
          };
        }

        try {
          const recursos = await garantirContatoConversaEProtocolo({
            empresaId,
            integracaoWhatsappId,
            usuarioId: usuario.id,
            numero,
            nomeContato: nomeContatoVariavel,
          });

          const nomeContatoFinal =
            recursos.contato?.nome || nomeContatoVariavel || "Sem nome";

          const components = montarComponentesTemplate(payloadTemplate, variaveis);

          const bodyMeta: Record<string, any> = {
            messaging_product: "whatsapp",
            to: numero,
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

          const data = await response.json();

          const mensagemTemplate =
            montarConteudoTextoTemplate(payloadTemplate, variaveis) ||
            `Template enviado: ${template.nome}`;

          if (!response.ok) {
            const erroMeta =
              data?.error?.error_user_msg ||
              data?.error?.message ||
              "Erro ao enviar mensagem.";

            await registrarMensagemDeDisparo({
              empresaId,
              conversaId: recursos.conversa.id,
              conversaProtocoloId: recursos.protocoloAtivo.id,
              usuarioId: usuario.id,
              templateId: template.id,
              templateNome: template.nome,
              templateIdioma: template.idioma || null,
              numeroDestino: numero,
              nomeContato: nomeContatoFinal,
              variaveis,
              payloadTemplate,
              mensagemExternaId: null,
              statusEnvio: "falha",
              metaResponse: data,
              erroEnvio: erroMeta,
            });

            await registrarLogDisparo({
              empresaId,
              integracaoWhatsappId,
              templateId: template.id,
              conversaId: recursos.conversa.id,
              conversaProtocoloId: recursos.protocoloAtivo.id,
              contatoId: recursos.contato.id,
              usuarioId: usuario.id,
              numero,
              nomeContato: nomeContatoFinal,
              templateNome: template.nome,
              templateIdioma: template.idioma || null,
              mensagem: mensagemTemplate,
              status: "falha",
              erro: erroMeta,
              statusHttp: response.status,
              messageId: null,
              variaveis,
              metaResponse: data,
              metadataJson: {
                tipo: "disparo_template",
              },
            });

            await atualizarUltimaMensagemConversa(recursos.conversa.id);

            return {
              numero,
              nome_contato: nomeContatoFinal,
              ok: false,
              status: response.status,
              status_disparo: "falha",
              status_label: "Falhou",
              template_nome: template.nome,
              mensagem_template: mensagemTemplate,
              message_id: null,
              conversa_id: recursos.conversa.id,
              conversa_protocolo_id: recursos.protocoloAtivo.id,
              erro: erroMeta,
            };
          }

          const messageId = data?.messages?.[0]?.id || null;

          await registrarMensagemDeDisparo({
            empresaId,
            conversaId: recursos.conversa.id,
            conversaProtocoloId: recursos.protocoloAtivo.id,
            usuarioId: usuario.id,
            templateId: template.id,
            templateNome: template.nome,
            templateIdioma: template.idioma || null,
            numeroDestino: numero,
            nomeContato: nomeContatoFinal,
            variaveis,
            payloadTemplate,
            mensagemExternaId: messageId,
            statusEnvio: "enviada",
            metaResponse: data,
            erroEnvio: null,
          });

          await registrarLogDisparo({
            empresaId,
            integracaoWhatsappId,
            templateId: template.id,
            conversaId: recursos.conversa.id,
            conversaProtocoloId: recursos.protocoloAtivo.id,
            contatoId: recursos.contato.id,
            usuarioId: usuario.id,
            numero,
            nomeContato: nomeContatoFinal,
            templateNome: template.nome,
            templateIdioma: template.idioma || null,
            mensagem: mensagemTemplate,
            status: "sucesso",
            erro: null,
            statusHttp: response.status,
            messageId,
            variaveis,
            metaResponse: data,
            metadataJson: {
              tipo: "disparo_template",
            },
          });

          await atualizarUltimaMensagemConversa(recursos.conversa.id);

          return {
            numero,
            nome_contato: nomeContatoFinal,
            ok: true,
            status: response.status,
            status_disparo: "enviada",
            status_label: "Enviado",
            template_nome: template.nome,
            mensagem_template: mensagemTemplate,
            message_id: messageId,
            conversa_id: recursos.conversa.id,
            conversa_protocolo_id: recursos.protocoloAtivo.id,
            erro: null,
          };
        } catch (error: any) {
          const mensagemTemplateErro =
            montarConteudoTextoTemplate(payloadTemplate, variaveis) ||
            `Template enviado: ${template.nome}`;

          await registrarLogDisparo({
            empresaId,
            integracaoWhatsappId,
            templateId: template.id,
            conversaId: null,
            conversaProtocoloId: null,
            contatoId: null,
            usuarioId: usuario.id,
            numero,
            nomeContato: nomeContatoVariavel || "Sem nome",
            templateNome: template.nome,
            templateIdioma: template.idioma || null,
            mensagem: mensagemTemplateErro,
            status: "falha",
            erro: error?.message || "Erro inesperado no envio.",
            statusHttp: 0,
            messageId: null,
            variaveis,
            metaResponse: null,
            metadataJson: {
              tipo: "disparo_template",
              origem: "catch",
            },
          });
          return {
            numero,
            nome_contato: nomeContatoVariavel || "Sem nome",
            ok: false,
            status: 0,
            status_disparo: "falha",
            status_label: "Falhou",
            template_nome: template.nome,
            mensagem_template:
              montarConteudoTextoTemplate(payloadTemplate, variaveis) ||
              `Template enviado: ${template.nome}`,
            message_id: null,
            erro: error?.message || "Erro inesperado no envio.",
          };
        }
      })
    );

    return NextResponse.json({
      ok: true,
      total: resultados.length,
      sucessos: resultados.filter((item) => item.ok).length,
      falhas: resultados.filter((item) => !item.ok).length,
      resultados,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Erro interno." },
      { status: 500 }
    );
  }
}