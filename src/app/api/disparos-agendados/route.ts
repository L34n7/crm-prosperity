import { NextRequest, NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

function traduzirErroMetaWhatsApp(
  codigo?: number | string | null,
  erroTecnico?: string | null
) {
  const code = Number(codigo || 0);

  switch (code) {
    case 131042:
      return "A conta WhatsApp Business possui pendências financeiras na Meta. Para regularizar, acesse o Gerenciador de Negócios da Meta, vá em Cobrança/Pagamentos, selecione a conta WhatsApp Business e quite o valor pendente. Depois da confirmação do pagamento, tente enviar o disparo novamente.";

    case 131026:
      return "O número do destinatário está inválido, indisponível ou não pode receber mensagens pelo WhatsApp.";

    case 470:
      return "A janela de atendimento de 24 horas foi encerrada. Envie um template aprovado para iniciar uma nova conversa.";

    case 368:
      return "A conta WhatsApp está temporariamente bloqueada pela Meta.";

    default:
      return erroTecnico || "Falha ao enviar mensagem pelo WhatsApp.";
  }
}

export async function GET(request: NextRequest) {
  try {
    const resultado = await getUsuarioContexto();

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

    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(request.url);

    const status = searchParams.get("status") || "todos";
    const busca = String(searchParams.get("busca") || "").trim();

    let query = supabase
      .from("automacao_agendamentos")
      .select(`
        id,
        empresa_id,
        execucao_id,
        fluxo_id,
        no_id,
        tipo_agendamento,
        executar_em,
        status,
        payload_json,
        created_at,
        executed_at,
        automacao_fluxos (
          id,
          nome
        ),
        automacao_nos (
          id,
          titulo,
          tipo_no
        )
      `)
      .eq("empresa_id", usuario.empresa_id)
      .eq("tipo_agendamento", "disparo_template")
      .order("created_at", { ascending: false });

    if (status !== "todos") {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[DISPAROS AGENDADOS] Erro ao listar:", error);

      return NextResponse.json(
        { ok: false, error: "Erro ao buscar disparos agendados." },
        { status: 500 }
      );
    }

    let disparos = data || [];

    const messageIds = Array.from(
      new Set(
        disparos
          .map((item: any) =>
            String(item.payload_json?.resultado_envio?.message_id || "").trim()
          )
          .filter(Boolean)
      )
    );

    let mensagensPorMessageId = new Map<string, any>();

    if (messageIds.length > 0) {
      const { data: mensagens, error: mensagensError } = await supabase
        .from("mensagens")
        .select(`
          id,
          status_envio,
          mensagem_externa_id,
          metadata_json,
          created_at,
          updated_at
        `)
        .eq("empresa_id", usuario.empresa_id)
        .in("mensagem_externa_id", messageIds);

      if (!mensagensError && mensagens) {
        mensagensPorMessageId = new Map(
          mensagens.map((mensagem: any) => [
            mensagem.mensagem_externa_id,
            mensagem,
          ])
        );
      }
    }

    const templateIds = Array.from(
      new Set(
        disparos
          .map((item: any) => String(item.payload_json?.template_id || "").trim())
          .filter(Boolean)
      )
    );

    let templatesPorId = new Map<string, any>();

    if (templateIds.length > 0) {
      const { data: templates, error: templatesError } = await supabase
        .from("whatsapp_templates")
        .select("id, nome, idioma, payload")
        .eq("empresa_id", usuario.empresa_id)
        .in("id", templateIds);

      if (!templatesError) {
        templatesPorId = new Map(
          (templates || []).map((template: any) => [template.id, template])
        );
      }
    }

    disparos = disparos.map((item: any) => {
      const payload = item.payload_json || {};
      const templateId = String(payload.template_id || "").trim();
      const template = templatesPorId.get(templateId);

      const messageId = String(payload.resultado_envio?.message_id || "").trim();
      const mensagem = messageId ? mensagensPorMessageId.get(messageId) : null;

      const metadataMensagem = mensagem?.metadata_json || {};
      const whatsappStatus = metadataMensagem?.whatsapp_status || {};
      const rawStatus = whatsappStatus?.raw_status || {};
      const erroMeta = rawStatus?.errors?.[0] || null;

      const codigoErroMeta = erroMeta?.code || null;

      const erroTecnico =
        whatsappStatus?.error_message ||
        erroMeta?.message ||
        erroMeta?.title ||
        null;

      const statusEnvio = mensagem?.status_envio || null;

      const envioStatus =
        statusEnvio === "falha"
          ? "falha"
          : statusEnvio === "entregue" || statusEnvio === "lida"
          ? "sucesso"
          : statusEnvio === "enviada"
          ? "processando"
          : item.status === "executado"
          ? "processando"
          : null;

      const envioLabel =
        envioStatus === "falha"
          ? "Falhou"
          : envioStatus === "sucesso"
          ? "Entregue"
          : envioStatus === "processando"
          ? "Aguardando confirmação"
          : "Ainda não enviado";

      return {
        ...item,
        payload_json: {
          ...payload,
          template_nome: payload.template_nome || template?.nome || null,
          template_idioma: payload.template_idioma || template?.idioma || null,
          template_payload: payload.template_payload || template?.payload || null,
        },
        envio_status: envioStatus,
        envio_label: envioLabel,
        envio_message_id: messageId || null,
        envio_erro_codigo_meta: codigoErroMeta,
        envio_erro_tecnico: erroTecnico,
        envio_erro_amigavel:
          envioStatus === "falha"
            ? traduzirErroMetaWhatsApp(codigoErroMeta, erroTecnico)
            : null,
      };
    });

    if (busca) {
      const buscaLower = busca.toLowerCase();

      disparos = disparos.filter((item: any) => {
        const payload = item.payload_json || {};

        return (
          String(payload.template_nome || "").toLowerCase().includes(buscaLower) ||
          String(payload.numero_destino || "").toLowerCase().includes(buscaLower) ||
          String(payload.contato_nome || "").toLowerCase().includes(buscaLower) ||
          String(item.automacao_fluxos?.nome || "").toLowerCase().includes(buscaLower)
        );
      });
    }

    return NextResponse.json({
      ok: true,
      disparos,
    });
  } catch (error: any) {
    console.error("[DISPAROS AGENDADOS] Erro geral:", error);

    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Erro ao buscar disparos agendados.",
      },
      { status: 500 }
    );
  }
}