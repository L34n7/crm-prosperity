import { NextRequest, NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getRequestAuditMetadata,
  registrarLogAuditoriaSeguro,
} from "@/lib/auditoria/logs";

function somenteDigitos(valor: string) {
  return String(valor || "").replace(/\D/g, "");
}

export async function POST(request: NextRequest) {
  try {
    const resultado = await getUsuarioContexto();
    const auditMeta = getRequestAuditMetadata(request);

    if (!resultado.ok) {
      return NextResponse.json(
        { ok: false, error: resultado.error },
        { status: resultado.status }
      );
    }

    const { usuario } = resultado;

    if (!usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada." },
        { status: 400 }
      );
    }

    if (usuario.assinatura?.status === "bloqueada") {
      return NextResponse.json(
        {
          ok: false,
          code: "ASSINATURA_BLOQUEADA",
          error: "Plano bloqueado. Renove a assinatura para criar disparos.",
        },
        { status: 403 }
      );
    }

    const body = await request.json();

    const integracaoWhatsappId = String(body.integracao_whatsapp_id || "").trim();
    const templateId = String(body.template_id || "").trim();
    const executarEm = String(body.executar_em || "").trim();
    const variaveis = Array.isArray(body.variaveis) ? body.variaveis : [];
    const contatos = Array.isArray(body.contatos) ? body.contatos : [];

    if (!integracaoWhatsappId) {
      return NextResponse.json(
        { ok: false, error: "Selecione uma integração WhatsApp." },
        { status: 400 }
      );
    }

    if (!templateId) {
      return NextResponse.json(
        { ok: false, error: "Selecione um template WhatsApp." },
        { status: 400 }
      );
    }

    if (!executarEm || Number.isNaN(new Date(executarEm).getTime())) {
      return NextResponse.json(
        { ok: false, error: "Informe uma data e hora válida para o agendamento." },
        { status: 400 }
      );
    }

    if (new Date(executarEm).getTime() <= Date.now()) {
      return NextResponse.json(
        { ok: false, error: "A data do agendamento precisa ser futura." },
        { status: 400 }
      );
    }

    if (contatos.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Selecione pelo menos um contato." },
        { status: 400 }
      );
    }

    const contatosValidos = contatos
      .map((contato: any) => ({
        id: String(contato.id || "").trim() || null,
        nome: contato.nome || null,
        telefone: somenteDigitos(contato.telefone || ""),
      }))
      .filter((contato: any) => contato.telefone.length >= 10);

    if (contatosValidos.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Nenhum contato selecionado possui telefone válido." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: integracao, error: integracaoError } = await supabase
      .from("integracoes_whatsapp")
      .select("id, nome_conexao, numero, status")
      .eq("id", integracaoWhatsappId)
      .eq("empresa_id", usuario.empresa_id)
      .maybeSingle();

    if (integracaoError || !integracao) {
      return NextResponse.json(
        { ok: false, error: "Integração WhatsApp não encontrada." },
        { status: 404 }
      );
    }

    const { data: template, error: templateError } = await supabase
      .from("whatsapp_templates")
      .select("id, nome, idioma, status, integracao_whatsapp_id, payload")
      .eq("id", templateId)
      .eq("empresa_id", usuario.empresa_id)
      .maybeSingle();

    if (templateError || !template) {
      return NextResponse.json(
        { ok: false, error: "Template WhatsApp não encontrado." },
        { status: 404 }
      );
    }

    if (String(template.status || "").toUpperCase() !== "APPROVED") {
      return NextResponse.json(
        { ok: false, error: "O template selecionado ainda não está aprovado." },
        { status: 400 }
      );
    }

    if (template.integracao_whatsapp_id !== integracaoWhatsappId) {
      return NextResponse.json(
        {
          ok: false,
          error: "O template selecionado não pertence à integração WhatsApp escolhida.",
        },
        { status: 400 }
      );
    }

    const registros = contatosValidos.map((contato: any) => ({
      empresa_id: usuario.empresa_id,
      execucao_id: null,
      fluxo_id: null,
      no_id: null,
      tipo_agendamento: "disparo_template",
      executar_em: executarEm,
      status: "pendente",
      payload_json: {
        conversa_id: null,
        contato_id: contato.id,
        conversa_protocolo_id: null,
        numero_destino: contato.telefone,

        template_id: template.id,
        template_nome: template.nome,
        template_idioma: template.idioma,
        template_payload: template.payload || null,
        integracao_whatsapp_id: integracaoWhatsappId,

        variaveis,
        tempo_quantidade: null,
        tempo_unidade: null,
        segundos_para_agendar: null,

        origem: "manual_agendado",
        contato_nome: contato.nome,
        integracao_nome: integracao.nome_conexao || integracao.numero || null,
        automacao_no_titulo: "Disparo manual agendado",
      },
    }));

    const { data: disparosCriados, error: insertError } = await supabase
      .from("automacao_agendamentos")
      .insert(registros)
      .select("id, executar_em, status, payload_json");

    if (insertError) {
      console.error("[CRIAR_DISPARO_AGENDADO] Erro ao inserir:", insertError);

      return NextResponse.json(
        { ok: false, error: "Erro ao criar disparo agendado." },
        { status: 500 }
      );
    }

    await registrarLogAuditoriaSeguro({
      empresa_id: usuario.empresa_id,
      categoria: "disparos",
      entidade: "disparo",
      entidade_id: disparosCriados?.[0]?.id || usuario.empresa_id,
      acao: "disparo_agendado_criado",
      descricao: `${disparosCriados?.length || 0} disparos agendados`,
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      usuario_email: usuario.email,
      depois: {
        quantidade: disparosCriados?.length || 0,
        executar_em: executarEm,
        template_id: template.id,
        template_nome: template.nome,
        integracao_whatsapp_id: integracaoWhatsappId,
      },
      metadata: {
        disparos_ids: (disparosCriados || []).map((disparo) => disparo.id),
      },
      ip: auditMeta.ip,
      user_agent: auditMeta.user_agent,
    });

    return NextResponse.json({
      ok: true,
      quantidade: disparosCriados?.length || 0,
      disparos: disparosCriados || [],
    });
  } catch (error: any) {
    console.error("[CRIAR_DISPARO_AGENDADO] Erro interno:", error);

    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Erro interno ao criar disparo agendado.",
      },
      { status: 500 }
    );
  }
}
