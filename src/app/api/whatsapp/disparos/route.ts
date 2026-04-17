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

type TemplateComponent = {
  type: string;
  text?: string;
  format?: string;
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

function montarComponentesTemplate(
  payload: TemplatePayload | null,
  variaveis: string[]
) {
  const componentesOriginais = payload?.components || [];
  const totalVariaveis = contarVariaveisTemplate(payload);

  if (totalVariaveis === 0) {
    return undefined;
  }

  const parametros = Array.from({ length: totalVariaveis }).map((_, index) => ({
    type: "text",
    text: variaveis[index] || "",
  }));

  const componentesMontados: any[] = [];

  const header = componentesOriginais.find((item) => item.type === "HEADER");
  const body = componentesOriginais.find((item) => item.type === "BODY");

  if (header?.text && /\{\{\d+\}\}/.test(header.text)) {
    componentesMontados.push({
      type: "header",
      parameters: parametros,
    });
  }

  if (body?.text && /\{\{\d+\}\}/.test(body.text)) {
    componentesMontados.push({
      type: "body",
      parameters: parametros,
    });
  }

  if (componentesMontados.length === 0) {
    componentesMontados.push({
      type: "body",
      parameters: parametros,
    });
  }

  return componentesMontados;
}

async function buscarProtocoloAtivoDaConversa(conversaId: string) {
  const { data, error } = await supabaseAdmin
    .from("conversa_protocolos")
    .select("id, protocolo, ativo")
    .eq("conversa_id", conversaId)
    .eq("ativo", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Erro ao buscar protocolo ativo da conversa: ${error.message}`
    );
  }

  if (!data) {
    throw new Error("Nenhum protocolo ativo encontrado para a conversa.");
  }

  return data;
}

async function registrarMensagemDeDisparo(params: {
  empresaId: string;
  conversaId: string;
  conversaProtocoloId: string;
  usuarioId: string;
  templateId: string;
  templateNome: string;
  templateIdioma: string | null;
  numeroDestino: string;
  variaveis: string[];
  mensagemExternaId: string | null;
  metaResponse: any;
}) {
  const now = new Date().toISOString();

  const { error } = await supabaseAdmin.from("mensagens").insert({
    empresa_id: params.empresaId,
    conversa_id: params.conversaId,
    remetente_tipo: "usuario",
    remetente_id: params.usuarioId,
    conteudo: `Template enviado: ${params.templateNome}`,
    tipo_mensagem: "template",
    origem: "disparo",
    status_envio: "enviado",
    mensagem_externa_id: params.mensagemExternaId,
    metadata_json: {
      tipo: "disparo_template",
      template_id: params.templateId,
      template_nome: params.templateNome,
      template_idioma: params.templateIdioma,
      numero_destino: params.numeroDestino,
      variaveis: params.variaveis,
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

export async function POST(req: NextRequest) {
  console.log("[DISPAROS] ===== INICIO =====");

  try {
    const resultadoContexto = await getUsuarioContexto();

    console.log("[DISPAROS] resultadoContexto.ok:", resultadoContexto.ok);

    if (!resultadoContexto.ok) {
      console.log("[DISPAROS] contexto inválido:", resultadoContexto);

      return NextResponse.json(
        { ok: false, error: resultadoContexto.error },
        { status: resultadoContexto.status }
      );
    }

    const { usuario } = resultadoContexto;

    console.log("[DISPAROS] usuario.id:", usuario?.id || null);
    console.log("[DISPAROS] usuario.empresa_id:", usuario?.empresa_id || null);
    console.log("[DISPAROS] usuario.status:", usuario?.status || null);
    console.log("[DISPAROS] usuario.permissoes:", usuario?.permissoes || []);
    console.log("[DISPAROS] usuario.perfis:", usuario?.perfis_dinamicos || []);

    const body = await req.json();

    const integracaoWhatsappId = String(body?.integracao_whatsapp_id || "").trim();
    const templateId = String(body?.template_id || "").trim();
    const destinatarios = Array.isArray(body?.destinatarios)
      ? (body.destinatarios as DestinatarioEntrada[])
      : [];

    console.log("[DISPAROS] integracaoWhatsappId:", integracaoWhatsappId);
    console.log("[DISPAROS] templateId:", templateId);
    console.log("[DISPAROS] totalDestinatarios:", destinatarios.length);
    console.log("[DISPAROS] destinatariosPreview:", destinatarios.slice(0, 5));

    if (!usuario?.empresa_id) {
      console.log("[DISPAROS] usuário sem empresa vinculada");

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

    console.log("[DISPAROS] podeRealizarDisparos:", permitido);

    if (!permitido) {
      return NextResponse.json(
        {
          ok: false,
          error: "Você não tem permissão para realizar disparos.",
          debug: {
            permissoes: usuario?.permissoes || [],
            perfis: usuario?.perfis_dinamicos || [],
          },
        },
        { status: 403 }
      );
    }

    console.log("[DISPAROS] buscando integração...");

    const { data: integracao, error: integracaoError } = await supabaseAdmin
      .from("integracoes_whatsapp")
      .select("id, empresa_id, status, phone_number_id, token_ref, numero, nome_conexao")
      .eq("id", integracaoWhatsappId)
      .single();

    console.log("[DISPAROS] integracao:", integracao || null);
    console.log("[DISPAROS] integracaoError:", integracaoError || null);

    if (integracaoError || !integracao) {
      return NextResponse.json(
        {
          ok: false,
          error: "Integração WhatsApp não encontrada.",
          debug: { integracaoError },
        },
        { status: 404 }
      );
    }

    if (integracao.empresa_id !== usuario.empresa_id) {
      return NextResponse.json(
        {
          ok: false,
          error: "Você não pode usar esta integração.",
          debug: {
            integracao_empresa_id: integracao.empresa_id,
            usuario_empresa_id: usuario.empresa_id,
          },
        },
        { status: 403 }
      );
    }

    console.log("[DISPAROS] buscando template...");

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

    console.log("[DISPAROS] template:", template || null);
    console.log("[DISPAROS] templateError:", templateError || null);

    if (templateError || !template) {
      return NextResponse.json(
        {
          ok: false,
          error: "Template não encontrado.",
          debug: { templateError },
        },
        { status: 404 }
      );
    }

    if (template.empresa_id !== usuario.empresa_id) {
      return NextResponse.json(
        {
          ok: false,
          error: "Você não pode usar este template.",
          debug: {
            template_empresa_id: template.empresa_id,
            usuario_empresa_id: usuario.empresa_id,
          },
        },
        { status: 403 }
      );
    }

    if (template.integracao_whatsapp_id !== integracaoWhatsappId) {
      return NextResponse.json(
        {
          ok: false,
          error: "O template não pertence à integração selecionada.",
          debug: {
            template_integracao_whatsapp_id: template.integracao_whatsapp_id,
            integracaoWhatsappId,
          },
        },
        { status: 400 }
      );
    }

    if (String(template.status || "").toUpperCase() !== "APPROVED") {
      return NextResponse.json(
        {
          ok: false,
          error: "Somente templates aprovados podem ser disparados.",
          debug: { template_status: template.status },
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

    console.log("[DISPAROS] tokenEnvName:", tokenEnvName);
    console.log("[DISPAROS] tokenExiste:", !!token);
    console.log("[DISPAROS] phoneNumberId:", phoneNumberId || null);

    if (!token || !phoneNumberId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Token ou phone_number_id do WhatsApp não configurado para esta integração.",
          debug: {
            tokenEnvName,
            tokenExiste: !!token,
            phoneNumberId,
          },
        },
        { status: 500 }
      );
    }

    const payloadTemplate = (template.payload || null) as TemplatePayload | null;

    console.log(
      "[DISPAROS] payloadTemplate:",
      JSON.stringify(payloadTemplate, null, 2)
    );

    const resultados = await Promise.all(
      destinatarios.map(async (item, index) => {
        const numero = limparNumero(item.numero || "");
        const variaveis = Array.isArray(item.variaveis) ? item.variaveis : [];

        console.log(`[DISPAROS] destinatario #${index + 1} numero:`, numero);
        console.log(`[DISPAROS] destinatario #${index + 1} variaveis:`, variaveis);

        if (!numero || numero.length < 10) {
          return {
            numero,
            ok: false,
            erro: "Número inválido.",
          };
        }

        try {
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

          console.log(
            `[DISPAROS] bodyMeta destinatario #${index + 1}:`,
            JSON.stringify(bodyMeta, null, 2)
          );

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

          console.log(
            `[DISPAROS] meta status destinatario #${index + 1}:`,
            response.status
          );
          console.log(
            `[DISPAROS] meta resposta destinatario #${index + 1}:`,
            data
          );

          if (!response.ok) {
            const erroMeta =
              data?.error?.error_user_msg ||
              data?.error?.message ||
              "Erro ao enviar mensagem.";

            return {
              numero,
              ok: false,
              status: response.status,
              erro: erroMeta,
            };
          }

          const messageId = data?.messages?.[0]?.id || null;

          const contato = await findOrCreateWhatsAppContact({
            empresaId,
            phone: numero,
            profileName: null,
          });

          const conversa = await findOrCreateWhatsAppConversation({
            empresaId,
            contatoId: contato.id,
            integracaoWhatsappId,
          });

          const protocoloAtivo = await buscarProtocoloAtivoDaConversa(conversa.id);

          await registrarMensagemDeDisparo({
            empresaId,
            conversaId: conversa.id,
            conversaProtocoloId: protocoloAtivo.id,
            usuarioId: usuario.id,
            templateId: template.id,
            templateNome: template.nome,
            templateIdioma: template.idioma || null,
            numeroDestino: numero,
            variaveis,
            mensagemExternaId: messageId,
            metaResponse: data,
          });

          await atualizarUltimaMensagemConversa(conversa.id);

          return {
            numero,
            ok: true,
            status: response.status,
            message_id: messageId,
            conversa_id: conversa.id,
            conversa_protocolo_id: protocoloAtivo.id,
            erro: null,
          };
        } catch (error: any) {
          console.error(
            `[DISPAROS] erro inesperado destinatario #${index + 1}:`,
            error
          );

          return {
            numero,
            ok: false,
            erro: error?.message || "Erro inesperado no envio.",
          };
        }
      })
    );

    console.log("[DISPAROS] resultados finais:", resultados);
    console.log("[DISPAROS] ===== FIM OK =====");

    return NextResponse.json({
      ok: true,
      total: resultados.length,
      sucessos: resultados.filter((item) => item.ok).length,
      falhas: resultados.filter((item) => !item.ok).length,
      resultados,
    });
  } catch (error: any) {
    console.error("[DISPAROS] ===== FIM ERRO =====", error);

    return NextResponse.json(
      { ok: false, error: error?.message || "Erro interno." },
      { status: 500 }
    );
  }
}