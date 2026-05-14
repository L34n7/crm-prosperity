import { NextRequest, NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();

function traduzirErroMetaWhatsApp(
  codigo?: number | string | null,
  erroTecnico?: string | null
) {
  const code = Number(codigo || 0);

  switch (code) {
    case 131042:
      return "A conta WhatsApp Business possui pendências financeiras na Meta. Acesse o Gerenciador de Negócios da Meta, entre em Cobrança/Pagamentos, selecione a conta WhatsApp Business e regularize o pagamento pendente. Após a confirmação do pagamento, tente enviar o disparo novamente.";

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

    const searchParams = req.nextUrl.searchParams;
    const limitParam = Number(searchParams.get("limit") || "50");

    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(limitParam, 1), 200)
      : 50;

    const { data, error } = await supabaseAdmin
      .from("whatsapp_disparos_logs")
      .select(`
        id,
        conversa_id,
        conversa_protocolo_id,
        contato_id,
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
        {
          ok: false,
          error: `Erro ao buscar histórico de disparos: ${error.message}`,
        },
        { status: 500 }
      );
    }

    const { data: mensagensAgendadas, error: mensagensAgendadasError } =
    await supabaseAdmin
      .from("mensagens")
      .select(`
        id,
        empresa_id,
        conversa_id,
        conversa_protocolo_id,
        conteudo,
        status_envio,
        mensagem_externa_id,
        metadata_json,
        created_at,
        updated_at,
        automacao_execucao_id,
        automacao_no_id
      `)
      .eq("empresa_id", usuario.empresa_id)
      .eq("tipo_mensagem", "template")
      .eq("origem", "automatica")
      .eq("metadata_json->>tipo", "disparo_template_agendado")
      .order("created_at", { ascending: false })
      .limit(limit);

  if (mensagensAgendadasError) {
    console.error(
      "[HISTÓRICO DISPAROS] Erro ao buscar mensagens agendadas:",
      mensagensAgendadasError
    );
  }

    const messageIds = Array.from(
      new Set(
        (data || [])
          .map((item: any) => item.message_id)
          .filter((messageId: any): messageId is string => Boolean(messageId))
      )
    );

    let mensagensPorMessageId = new Map<string, any>();

    if (messageIds.length > 0) {
      const { data: mensagensData, error: mensagensError } = await supabaseAdmin
        .from("mensagens")
        .select(`
          mensagem_externa_id,
          metadata_json,
          status_envio
        `)
        .eq("empresa_id", usuario.empresa_id)
        .in("mensagem_externa_id", messageIds);

      if (!mensagensError && mensagensData) {
        mensagensPorMessageId = new Map(
          mensagensData.map((mensagem: any) => [
            mensagem.mensagem_externa_id,
            mensagem,
          ])
        );
      }
    }

    const resultados = (data || []).map((item: any) => {
      const mensagemVinculada = item.message_id
        ? mensagensPorMessageId.get(item.message_id)
        : null;

      const metadataMensagem = mensagemVinculada?.metadata_json || null;
      const statusMensagem = mensagemVinculada?.status_envio || null;

      const rawStatus = metadataMensagem?.whatsapp_status?.raw_status || null;
      const erroMeta = rawStatus?.errors?.[0] || null;
      const codigoErroMeta = erroMeta?.code || null;

      const erroTecnico =
        metadataMensagem?.whatsapp_status?.error_message ||
        erroMeta?.message ||
        erroMeta?.title ||
        item.erro ||
        null;

      const erroAmigavel = traduzirErroMetaWhatsApp(
        codigoErroMeta,
        erroTecnico
      );

      const statusFinal =
        statusMensagem === "falha"
          ? "falha"
          : statusMensagem === "entregue" || statusMensagem === "lida"
          ? "sucesso"
          : statusMensagem === "enviada"
          ? "processando"
          : item.status === "falha"
          ? "falha"
          : item.status || "pendente";

      return {
        id: item.id,
        created_at: item.created_at,
        conversa_id: item.conversa_id || null,
        conversa_protocolo_id: item.conversa_protocolo_id || null,
        contato_id: item.contato_id || null,
        numero: item.numero || "-",
        nome_contato: item.nome_contato || "Sem nome",
        template_nome: item.template_nome || "-",
        template_idioma: item.template_idioma || null,
        mensagem_template: item.mensagem || "Sem conteúdo",
        status_disparo: statusFinal,
        status_label:
          statusFinal === "sucesso"
            ? "Entregue"
            : statusFinal === "processando"
            ? "Aguardando confirmação"
            : "Falhou",
        status_http: item.status_http || null,
        message_id: item.message_id || null,
        erro: erroTecnico,
        erro_amigavel: erroAmigavel,
        erro_codigo_meta: codigoErroMeta,
        metadata_json: metadataMensagem,
        ok: statusFinal === "sucesso",
      };
    });


    
    const resultadosAgendados = (mensagensAgendadas || []).map((mensagem: any) => {
      const metadata = mensagem.metadata_json || {};
      const whatsappStatus = metadata.whatsapp_status || {};
      const rawStatus = whatsappStatus.raw_status || {};
      const erroMeta = rawStatus.errors?.[0] || null;

      const codigoErroMeta = erroMeta?.code || null;

      const erroTecnico =
        whatsappStatus.error_message ||
        erroMeta?.message ||
        erroMeta?.title ||
        null;

      const statusFinal:
        | "falha"
        | "sucesso"
        | "processando"
        | "pendente" =
        mensagem.status_envio === "falha"
          ? "falha"
          : mensagem.status_envio === "entregue" ||
            mensagem.status_envio === "lida"
          ? "sucesso"
          : mensagem.status_envio === "enviada"
          ? "processando"
          : "pendente";

      return {
        id: mensagem.id,
        created_at: mensagem.created_at,
        conversa_id: mensagem.conversa_id || null,
        conversa_protocolo_id: mensagem.conversa_protocolo_id || null,
        contato_id: metadata.contato_id || null,
        numero: metadata.numero_destino || "-",
        nome_contato: metadata.nome_contato || "Sem nome",
        template_nome: metadata.template_nome || "-",
        template_idioma: metadata.template_idioma || null,
        mensagem_template:
          metadata.conteudo_renderizado || mensagem.conteudo || "Sem conteúdo",
        status_disparo: statusFinal,
        status_label:
          statusFinal === "sucesso"
            ? "Entregue"
            : statusFinal === "processando"
            ? "Aguardando confirmação"
            : "Falhou",
        status_http: null,
        message_id: mensagem.mensagem_externa_id || null,
        erro: erroTecnico,
        erro_amigavel: traduzirErroMetaWhatsApp(codigoErroMeta, erroTecnico),
        erro_codigo_meta: codigoErroMeta,
        metadata_json: metadata,
        ok: statusFinal === "sucesso",
        origem_historico: "agendado",
      };
    });


    const todosResultados = [...resultados, ...resultadosAgendados].sort(
      (a: any, b: any) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    return NextResponse.json({
      ok: true,
      total: todosResultados.length,
      resultados: todosResultados,
    });

  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Erro interno ao buscar histórico.",
      },
      { status: 500 }
    );
  }
}