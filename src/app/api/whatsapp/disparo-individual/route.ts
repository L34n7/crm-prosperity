import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";

const supabaseAdmin = getSupabaseAdmin();

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const { conversa_id, template_nome, idioma_codigo, body_params } = body || {};

    if (!conversa_id) {
      return NextResponse.json(
        { ok: false, error: "conversa_id é obrigatório" },
        { status: 400 }
      );
    }

    if (!template_nome) {
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
    .eq("id", conversa_id)
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

    const telefone = contato?.telefone;
    const nomeContato = contato?.nome || "Contato";
    
    if (!telefone) {
    return NextResponse.json(
        { ok: false, error: "Contato sem telefone" },
        { status: 400 }
    );
    }

    // Aqui você chama sua rotina real de envio de template no WhatsApp
    // Ex.: enviarTemplateWhatsApp({ telefone, template_nome, idioma_codigo, body_params, ... })

    await supabaseAdmin.from("mensagens").insert({
      empresa_id: usuario.empresa_id,
      conversa_id: conversa.id,
      remetente_tipo: "usuario",
      remetente_id: usuario.id,
      conteudo: `Template enviado: ${template_nome}`,
      tipo_mensagem: "template",
      origem: "enviada",
      status_envio: "enviada",
      metadata_json: {
        template_nome,
        idioma_codigo,
        body_params: Array.isArray(body_params) ? body_params : [],
      },
    });

    return NextResponse.json({
      ok: true,
      message: "Disparo individual enviado com sucesso",
    });
  } catch (error) {
    console.error("Erro no disparo individual:", error);

    return NextResponse.json(
      { ok: false, error: "Erro interno ao enviar disparo individual" },
      { status: 500 }
    );
  }
}