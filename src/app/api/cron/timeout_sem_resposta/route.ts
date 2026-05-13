import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  executarNo,
  registrarTentativaBloco,
  executarAcaoExcessoTentativas,
} from "@/lib/automacoes/process-automation-engine";

const supabaseAdmin = getSupabaseAdmin();

function statusMensagemAtendeCondicao(
  statusAtual: string,
  statusExigido: string
) {
  if (statusExigido === "qualquer") return true;

  if (statusExigido === "entregue") {
    return (
      statusAtual === "enviada" ||
      statusAtual === "entregue" ||
      statusAtual === "lida"
    );
  }

  if (statusExigido === "lida") {
    return statusAtual === "lida";
  }

  return statusAtual === statusExigido;
}

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

        const { data: ultimaMensagemAutomacao } = await supabaseAdmin
          .from("mensagens")
          .select("id, status_envio, origem, created_at")
          .eq("empresa_id", agendamento.empresa_id)
          .eq("conversa_id", payload.conversa_id)
          .eq("automacao_execucao_id", agendamento.execucao_id)
          .eq("automacao_no_id", agendamento.no_id)
          .in("origem", ["enviada", "automatica"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const statusEnvioAtual =
        ultimaMensagemAutomacao?.status_envio || "desconhecido";

        const statusExigido =
        payload.condicao_json?.status_envio || "qualquer";


        if (statusExigido === "qualquer") {
          const { data: agendamentosEspecificos } = await supabaseAdmin
            .from("automacao_agendamentos")
            .select("id, status, payload_json")
            .eq("empresa_id", agendamento.empresa_id)
            .eq("execucao_id", agendamento.execucao_id)
            .eq("no_id", agendamento.no_id)
            .eq("tipo_agendamento", "timeout_sem_resposta")
            .in("status", ["pendente", "executando", "executado"]);

          const existeEspecifico = (agendamentosEspecificos || []).some((item) => {
            if (item.id === agendamento.id) return false;

            const condicao = item.payload_json?.condicao_json || {};
            const statusOutro = condicao.status_envio || "qualquer";

            return statusOutro !== "qualquer";
          });

          if (existeEspecifico) {
            await supabaseAdmin
              .from("automacao_agendamentos")
              .update({
                status: "cancelado",
                executed_at: new Date().toISOString(),
                payload_json: {
                  ...payload,
                  motivo_cancelamento: "fallback_qualquer_ignorado_por_status_especifico",
                },
              })
              .eq("id", agendamento.id);

            continue;
          }
        }

        const atendeStatus = statusMensagemAtendeCondicao(
          statusEnvioAtual,
          statusExigido
        );

        if (!atendeStatus) {
          await supabaseAdmin
            .from("automacao_agendamentos")
            .update({
              status: "cancelado",
              executed_at: new Date().toISOString(),
              payload_json: {
                ...payload,
                status_envio_encontrado: statusEnvioAtual,
                status_envio_exigido: statusExigido,
                motivo_cancelamento: "status_envio_nao_corresponde",
              },
            })
            .eq("id", agendamento.id);

          continue;
        }

        if (
        statusExigido !== "qualquer" &&
        statusEnvioAtual !== statusExigido
        ) {
        await supabaseAdmin
            .from("automacao_agendamentos")
            .update({
            status: "cancelado",
            executed_at: new Date().toISOString(),
            payload_json: {
                ...payload,
                status_envio_encontrado: statusEnvioAtual,
                status_envio_exigido: statusExigido,
                motivo_cancelamento: "status_envio_nao_corresponde",
            },
            })
            .eq("id", agendamento.id);

        continue;
        }

        const { data: noOrigem } = await supabaseAdmin
          .from("automacao_nos")
          .select("*")
          .eq("id", agendamento.no_id)
          .eq("empresa_id", agendamento.empresa_id)
          .maybeSingle();

        if (!noOrigem) {
          await supabaseAdmin
            .from("automacao_agendamentos")
            .update({
              status: "erro",
              executed_at: new Date().toISOString(),
              payload_json: {
                ...payload,
                motivo_erro: "no_origem_timeout_nao_encontrado",
              },
            })
            .eq("id", agendamento.id);

          continue;
        }

        const tentativa = await registrarTentativaBloco({
          empresaId: agendamento.empresa_id,
          execucao,
          no: noOrigem,
          tipo: "sem_resposta",
        });

        if (tentativa.excedeu) {
          await executarAcaoExcessoTentativas({
            empresaId: agendamento.empresa_id,
            conversaId: payload.conversa_id,
            execucao,
            no: noOrigem,
            numeroDestino: payload.numero_destino,
            tipo: "sem_resposta",
          });

          await supabaseAdmin
            .from("automacao_agendamentos")
            .update({
              status: "executado",
              executed_at: new Date().toISOString(),
              payload_json: {
                ...payload,
                tentativa_sem_resposta: tentativa.quantidade,
                limite_sem_resposta: tentativa.limite,
                motivo_execucao: "limite_tentativas_sem_resposta_excedido",
              },
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
          numeroDestino: payload.numero_destino,
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
            status: "cancelado",
            executed_at: new Date().toISOString(),
          })
          .eq("empresa_id", agendamento.empresa_id)
          .eq("execucao_id", agendamento.execucao_id)
          .eq("no_id", agendamento.no_id)
          .eq("tipo_agendamento", "timeout_sem_resposta")
          .eq("status", "pendente")
          .neq("id", agendamento.id);
          
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