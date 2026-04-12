import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

function limparNumero(valor: string) {
  return String(valor || "").replace(/\D/g, "");
}

function getUsuarioPerfisNomes(usuario: any) {
  if (!Array.isArray(usuario?.perfis_dinamicos)) return [];
  return usuario.perfis_dinamicos.map((item: any) => item.nome);
}

function usuarioEhAdministrador(usuario: any) {
  const perfis = getUsuarioPerfisNomes(usuario);
  return perfis.includes("Administrador");
}

function usuarioTemPermissao(usuario: any, permissao: string) {
  const permissoes = Array.isArray(usuario?.permissoes) ? usuario.permissoes : [];
  return permissoes.includes(permissao);
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

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: "Não autenticado." },
        { status: 401 }
      );
    }

    const body = await req.json();

    const integracaoWhatsappId = String(body?.integracao_whatsapp_id || "").trim();
    const templateId = String(body?.template_id || "").trim();
    const destinatarios = Array.isArray(body?.destinatarios)
      ? (body.destinatarios as DestinatarioEntrada[])
      : [];

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

    const { data: usuarioSistema, error: usuarioError } = await supabase
      .from("usuarios")
      .select(`
        id,
        empresa_id,
        status,
        permissoes,
        perfis_dinamicos (
          id,
          nome
        )
      `)
      .eq("auth_user_id", user.id)
      .single();

    if (usuarioError || !usuarioSistema) {
      return NextResponse.json(
        { ok: false, error: "Usuário do sistema não encontrado." },
        { status: 403 }
      );
    }

    if (usuarioSistema.status && usuarioSistema.status !== "ativo") {
      return NextResponse.json(
        { ok: false, error: "Seu usuário está inativo ou bloqueado." },
        { status: 403 }
      );
    }

    const podeDisparar =
      usuarioEhAdministrador(usuarioSistema) ||
      usuarioTemPermissao(usuarioSistema, "whatsapp.disparos.enviar") ||
      usuarioTemPermissao(usuarioSistema, "mensagens.enviar");

    if (!podeDisparar) {
      return NextResponse.json(
        { ok: false, error: "Você não tem permissão para realizar disparos." },
        { status: 403 }
      );
    }

    const { data: integracao, error: integracaoError } = await supabase
      .from("integracoes_whatsapp")
      .select("id, empresa_id, status, phone_number_id, token_ref, numero, nome_conexao")
      .eq("id", integracaoWhatsappId)
      .single();

    if (integracaoError || !integracao) {
      return NextResponse.json(
        { ok: false, error: "Integração WhatsApp não encontrada." },
        { status: 404 }
      );
    }

    if (integracao.empresa_id !== usuarioSistema.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Você não pode usar esta integração." },
        { status: 403 }
      );
    }

    const { data: template, error: templateError } = await supabase
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
        { ok: false, error: "Template não encontrado." },
        { status: 404 }
      );
    }

    if (template.empresa_id !== usuarioSistema.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Você não pode usar este template." },
        { status: 403 }
      );
    }

    if (template.integracao_whatsapp_id !== integracaoWhatsappId) {
      return NextResponse.json(
        { ok: false, error: "O template não pertence à integração selecionada." },
        { status: 400 }
      );
    }

    if (String(template.status || "").toUpperCase() !== "APPROVED") {
      return NextResponse.json(
        { ok: false, error: "Somente templates aprovados podem ser disparados." },
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

          return {
            numero,
            ok: true,
            status: response.status,
            message_id: messageId,
            erro: null,
          };
        } catch (error: any) {
          return {
            numero,
            ok: false,
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