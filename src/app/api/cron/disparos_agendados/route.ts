import { NextResponse } from "next/server";
import { sendAppointmentReminderEmail } from "@/lib/email/send-appointment-reminder-email";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { enfileirarDisparosAgendadosVencidos } from "@/lib/whatsapp/disparo-agendado-fila";
import { processarAlteracoesNomeWhatsappPendentes } from "@/lib/whatsapp/display-name-changes";

type JsonObject = Record<string, unknown>;

const supabaseAdmin = getSupabaseAdmin();

function objeto(valor: unknown): JsonObject {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as JsonObject)
    : {};
}

async function validarLembreteAgendamentoAtivo(agendamento: {
  empresa_id: string;
  payload_json?: JsonObject | null;
}) {
  const payload = objeto(agendamento.payload_json);

  if (payload.origem !== "lembrete_agendamento") {
    return { ok: true as const };
  }

  const agendamentoId = String(payload.agenda_agendamento_id || "").trim();

  if (!agendamentoId) {
    return {
      ok: false as const,
      motivo: "lembrete_sem_agendamento_id",
    };
  }

  const { data, error } = await supabaseAdmin
    .from("agenda_agendamentos")
    .select("id, status, inicio_at")
    .eq("id", agendamentoId)
    .eq("empresa_id", agendamento.empresa_id)
    .maybeSingle();

  if (error || !data) {
    return {
      ok: false as const,
      motivo: "agendamento_nao_encontrado",
    };
  }

  if (!["agendado", "confirmado"].includes(String(data.status || ""))) {
    return {
      ok: false as const,
      motivo: "agendamento_nao_esta_ativo",
    };
  }

  const inicioPayload = payload.agenda_inicio_at
    ? new Date(String(payload.agenda_inicio_at)).getTime()
    : null;
  const inicioAtual = data.inicio_at
    ? new Date(String(data.inicio_at)).getTime()
    : null;

  if (
    inicioPayload &&
    inicioAtual &&
    Number.isFinite(inicioPayload) &&
    Number.isFinite(inicioAtual) &&
    inicioPayload !== inicioAtual
  ) {
    return {
      ok: false as const,
      motivo: "agendamento_foi_remarcado",
    };
  }

  return { ok: true as const };
}

async function executarEmailLembreteAgendamento(agendamento: {
  id: string;
  empresa_id: string;
  payload_json?: JsonObject | null;
}) {
  const payload = objeto(agendamento.payload_json);
  const emailDestino = String(payload.email_destino || "")
    .trim()
    .toLowerCase();

  if (!emailDestino) {
    throw new Error("Lembrete por email sem destinatario.");
  }

  await sendAppointmentReminderEmail({
    empresaId: agendamento.empresa_id,
    to: emailDestino,
    agendamentoId: String(
      payload.agenda_agendamento_id || agendamento.id
    ),
    contatoNome: String(payload.contato_nome || "").trim() || null,
    dataLabel: String(payload.agenda_data || "").trim() || null,
    horaLabel: String(payload.agenda_hora || "").trim() || null,
  });

  return {
    emailDestino,
    agendamentoId: String(payload.agenda_agendamento_id || "").trim() || null,
  };
}

async function processarEmailsAgendados(agora: string) {
  const { data, error } = await supabaseAdmin
    .from("automacao_agendamentos")
    .select("id, empresa_id, payload_json")
    .eq("status", "pendente")
    .eq("tipo_agendamento", "email_lembrete_agendamento")
    .lte("executar_em", agora)
    .order("executar_em", { ascending: true })
    .limit(25);

  if (error) {
    throw new Error(`Erro ao buscar emails agendados: ${error.message}`);
  }

  let enviados = 0;
  let erros = 0;
  let cancelados = 0;

  for (const agendamento of data || []) {
    const payload = objeto(agendamento.payload_json);

    try {
      const validade = await validarLembreteAgendamentoAtivo(agendamento);

      if (!validade.ok) {
        await supabaseAdmin
          .from("automacao_agendamentos")
          .update({
            status: "cancelado",
            executed_at: new Date().toISOString(),
            payload_json: {
              ...payload,
              motivo_cancelamento: validade.motivo,
            },
          })
          .eq("id", agendamento.id)
          .eq("empresa_id", agendamento.empresa_id)
          .eq("status", "pendente");

        cancelados += 1;
        continue;
      }

      const resultado = await executarEmailLembreteAgendamento(agendamento);

      await supabaseAdmin
        .from("automacao_agendamentos")
        .update({
          status: "executado",
          executed_at: new Date().toISOString(),
          payload_json: {
            ...payload,
            resultado_envio: {
              email_destino: resultado.emailDestino,
              agendamento_id: resultado.agendamentoId,
            },
          },
        })
        .eq("id", agendamento.id)
        .eq("empresa_id", agendamento.empresa_id)
        .eq("status", "pendente");

      enviados += 1;
    } catch (errorEmail) {
      const mensagem =
        errorEmail instanceof Error
          ? errorEmail.message
          : "Erro desconhecido.";

      console.error("[CRON DISPAROS] Erro ao enviar email agendado:", {
        agendamentoId: agendamento.id,
        erro: mensagem,
      });

      await supabaseAdmin
        .from("automacao_agendamentos")
        .update({
          status: "erro",
          executed_at: new Date().toISOString(),
          payload_json: {
            ...payload,
            erro_execucao: mensagem,
          },
        })
        .eq("id", agendamento.id)
        .eq("empresa_id", agendamento.empresa_id)
        .eq("status", "pendente");

      erros += 1;
    }
  }

  return {
    encontrados: data?.length || 0,
    enviados,
    erros,
    cancelados,
  };
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const userAgent = request.headers.get("user-agent") || "";

  const chamadaComSecret =
    !!process.env.CRON_SECRET &&
    authHeader === `Bearer ${process.env.CRON_SECRET}`;

  const chamadaVercelCron = userAgent.includes("vercel-cron");

  if (!chamadaComSecret || !chamadaVercelCron) {
    console.warn("[CRON DISPAROS] Chamada recusada:", {
      userAgent,
      temAuthorization: Boolean(authHeader),
    });

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

    const [disparos, emails, nomesWhatsapp] = await Promise.all([
      enfileirarDisparosAgendadosVencidos({ limite: 1000 }),
      processarEmailsAgendados(agora),
      processarAlteracoesNomeWhatsappPendentes({ limite: 10 }),
    ]);

    console.log("[CRON DISPAROS] Processamento concluido:", {
      agora,
      disparos,
      emails,
      nomesWhatsapp,
    });

    return NextResponse.json({
      ok: true,
      modelo_disparos: "fila_qstash",
      disparos,
      emails,
      nomesWhatsapp,
    });
  } catch (error) {
    const mensagem =
      error instanceof Error ? error.message : "Erro geral no cron.";

    console.error("[CRON DISPAROS] Erro geral:", error);

    return NextResponse.json(
      {
        ok: false,
        error: mensagem,
      },
      { status: 500 }
    );
  }
}
