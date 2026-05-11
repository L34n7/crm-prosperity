import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { executarNo } from "@/lib/automacoes/process-automation-engine";

const supabaseAdmin = getSupabaseAdmin();

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
      .eq("tipo_agendamento", "timeout_sem_resposta")
      .lte("executar_em", agora)
      .limit(50);

    if (error) {
      console.error("[CRON TIMEOUT] Erro ao buscar agendamentos:", error);

      return NextResponse.json(
        {
          ok: false,
          error: error.message,
        },
        { status: 500 }
      );
    }

    for (const agendamento of agendamentos || []) {
      try {
        await supabaseAdmin
          .from("automacao_agendamentos")
          .update({
            status: "executando",
          })
          .eq("id", agendamento.id);

        const payload = agendamento.payload_json || {};

        const { data: execucao } = await supabaseAdmin
          .from("automacao_execucoes")
          .select("*")
          .eq("id", agendamento.execucao_id)
          .single();

        if (!execucao) {
          continue;
        }

        if (
          execucao.status !== "aguardando" ||
          execucao.no_atual_id !== agendamento.no_id
        ) {
          await supabaseAdmin
            .from("automacao_agendamentos")
            .update({
              status: "cancelado",
            })
            .eq("id", agendamento.id);

          continue;
        }

        const { data: proximoNo } = await supabaseAdmin
          .from("automacao_nos")
          .select("*")
          .eq("id", payload.no_destino_id)
          .single();

        if (!proximoNo) {
          await supabaseAdmin
            .from("automacao_agendamentos")
            .update({
              status: "erro",
            })
            .eq("id", agendamento.id);

          continue;
        }

        await executarNo({
          empresaId: agendamento.empresa_id,
          conversaId: payload.conversa_id,
          execucaoId: agendamento.execucao_id,
          fluxoId: agendamento.fluxo_id,
          no: proximoNo,
          numeroDestino: execucao.numero_destino,
        });

        await supabaseAdmin
        .from("automacao_agendamentos")
        .update({
            status: "executado",
            executed_at: new Date().toISOString(),
        })
          .eq("id", agendamento.id);
      } catch (error) {
        console.error("[CRON TIMEOUT] Erro ao executar timeout:", error);

        await supabaseAdmin
          .from("automacao_agendamentos")
          .update({
            status: "erro",
          })
          .eq("id", agendamento.id);
      }
    }

    return NextResponse.json({
      ok: true,
      processados: agendamentos?.length || 0,
    });
  } catch (error: any) {
    console.error("[CRON TIMEOUT] Erro geral:", error);

    return NextResponse.json(
      {
        ok: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}