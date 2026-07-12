import { NextResponse } from "next/server";
import { validarChamadaCron } from "@/lib/cron/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  executarNo,
  registrarTentativaBloco,
  executarAcaoExcessoTentativas,
  enviarMensagemAutomacao,
  registrarEventoRastreamentoFluxo,
  validarExecucaoAutomacaoAtiva,
} from "@/lib/automacoes/process-automation-engine";

const supabaseAdmin = getSupabaseAdmin();

function obterLimite(request: Request) {
  const valor = Number(new URL(request.url).searchParams.get("limit") || 50);

  if (!Number.isFinite(valor)) return 50;

  return Math.min(Math.max(Math.floor(valor), 1), 100);
}

function obterLockTimeoutMinutos(request: Request) {
  const valor = Number(
    new URL(request.url).searchParams.get("lockTimeoutMinutos") || 10
  );

  if (!Number.isFinite(valor)) return 10;

  return Math.min(Math.max(Math.floor(valor), 1), 60);
}

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
  const auth = validarChamadaCron(request);

  if (!auth.ok) {
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

    const { data, error } = await supabaseAdmin.rpc(
      "reivindicar_automacao_agendamentos_timeout",
      {
        p_limite: obterLimite(request),
        p_lock_timeout_minutos: obterLockTimeoutMinutos(request),
      }
    );

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

    const agendamentos = Array.isArray(data) ? data : [];

    for (const agendamento of agendamentos || []) {
      try {

        const payload = agendamento.payload_json || {};

        if (agendamento.tipo_agendamento === "delay_bloco") {
          if (
            !agendamento.execucao_id ||
            !agendamento.fluxo_id ||
            !agendamento.no_id ||
            !payload.conversa_id ||
            !payload.numero_destino
          ) {
            await supabaseAdmin
              .from("automacao_agendamentos")
              .update({
                status: "erro",
                executed_at: new Date().toISOString(),
                payload_json: {
                  ...payload,
                  motivo_erro: "dados_obrigatorios_delay_ausentes",
                },
              })
              .eq("id", agendamento.id)
              .eq("empresa_id", agendamento.empresa_id);

          continue;
          }

          const { data: execucao, error: execucaoError } = await supabaseAdmin
            .from("automacao_execucoes")
            .select("*")
            .eq("id", agendamento.execucao_id)
            .eq("empresa_id", agendamento.empresa_id)
            .maybeSingle();

          if (execucaoError) {
            throw new Error(
              `Erro ao buscar execução do delay: ${execucaoError.message}`
            );
          }

          if (
            !execucao ||
            execucao.status !== "rodando" ||
            execucao.finished_at ||
            execucao.no_atual_id !== agendamento.no_id
          ) {
            await supabaseAdmin
              .from("automacao_agendamentos")
              .update({
                status: "cancelado",
                executed_at: new Date().toISOString(),
                payload_json: {
                  ...payload,
                  motivo_cancelamento:
                    "execucao_cancelada_finalizada_ou_em_outro_bloco",
                },
              })
              .eq("id", agendamento.id)
              .eq("empresa_id", agendamento.empresa_id);

            continue;
          }

          const validacao = await validarExecucaoAutomacaoAtiva({
            empresaId: agendamento.empresa_id,
            conversaId: payload.conversa_id,
            execucaoId: agendamento.execucao_id,
          });

          if (!validacao.ok) {
            await supabaseAdmin
              .from("automacao_agendamentos")
              .update({
                status: "cancelado",
                executed_at: new Date().toISOString(),
                payload_json: {
                  ...payload,
                  motivo_cancelamento: validacao.motivo,
                },
              })
              .eq("id", agendamento.id)
              .eq("empresa_id", agendamento.empresa_id);

            continue;
          }

          const { data: no, error: noError } = await supabaseAdmin
            .from("automacao_nos")
            .select("*")
            .eq("id", agendamento.no_id)
            .eq("empresa_id", agendamento.empresa_id)
            .eq("fluxo_id", agendamento.fluxo_id)
            .eq("ativo", true)
            .maybeSingle();
            
          if (noError) {
            throw new Error(
              `Erro ao buscar bloco do delay: ${noError.message}`
            );
          }
          if (!no) {
            await supabaseAdmin
              .from("automacao_agendamentos")
              .update({
                status: "erro",
                executed_at: new Date().toISOString(),
                payload_json: {
                  ...payload,
                  motivo_erro: "bloco_do_delay_nao_encontrado",
                },
              })
              .eq("id", agendamento.id)
              .eq("empresa_id", agendamento.empresa_id);

            continue;
          }

          await executarNo({
            empresaId: agendamento.empresa_id,
            conversaId: payload.conversa_id,
            execucaoId: agendamento.execucao_id,
            fluxoId: agendamento.fluxo_id,
            no,
            numeroDestino: payload.numero_destino,
            retomadaDelayAgendado: true,
          });

          await supabaseAdmin
            .from("automacao_agendamentos")
            .update({
              status: "executado",
              executed_at: new Date().toISOString(),
              payload_json: {
                ...payload,
                retomado_em: new Date().toISOString(),
              },
            })
            .eq("id", agendamento.id)
            .eq("empresa_id", agendamento.empresa_id);

          continue;
        }

        if (agendamento.tipo_agendamento === "encerramento_inatividade_fluxo") {
          const { data: execucao } = await supabaseAdmin
            .from("automacao_execucoes")
            .select("*")
            .eq("id", agendamento.execucao_id)
            .eq("empresa_id", agendamento.empresa_id)
            .maybeSingle();

          if (
            !execucao ||
            execucao.status !== "aguardando" ||
            execucao.no_atual_id !== agendamento.no_id
          ) {
            await supabaseAdmin
              .from("automacao_agendamentos")
              .update({
                status: "cancelado",
                executed_at: new Date().toISOString(),
                payload_json: {
                  ...payload,
                  motivo_cancelamento: "execucao_nao_estava_mais_aguardando_no_bloco",
                },
              })
              .eq("id", agendamento.id)
              .eq("empresa_id", agendamento.empresa_id);

            continue;
          }

          const mensagem = String(payload.mensagem || "").trim();

          const validacaoExecucao = await validarExecucaoAutomacaoAtiva({
            empresaId: agendamento.empresa_id,
            conversaId: payload.conversa_id,
            execucaoId: agendamento.execucao_id,
          });

          if (!validacaoExecucao.ok) {
            await supabaseAdmin
              .from("automacao_agendamentos")
              .update({
                status: "cancelado",
                executed_at: new Date().toISOString(),
                payload_json: {
                  ...payload,
                  motivo_cancelamento: validacaoExecucao.motivo,
                },
              })
              .eq("id", agendamento.id)
              .eq("empresa_id", agendamento.empresa_id);

            continue;
          }

          if (mensagem) {
            await enviarMensagemAutomacao({
              empresaId: agendamento.empresa_id,
              conversaId: payload.conversa_id,
              numeroDestino: payload.numero_destino,
              conteudo: mensagem,
              execucaoId: agendamento.execucao_id,
              noId: agendamento.no_id,
            });
          }

          const agoraExecucao = new Date().toISOString();

          await supabaseAdmin
            .from("automacao_execucoes")
            .update({
              status: "finalizado",
              finished_at: agoraExecucao,
              updated_at: agoraExecucao,
              metadata_json: {
                ...(execucao.metadata_json || {}),
                encerrado_por: "inatividade_fluxo",
                encerrado_em: agoraExecucao,
              },
            })
            .eq("id", agendamento.execucao_id)
            .eq("empresa_id", agendamento.empresa_id);

          await supabaseAdmin
            .from("conversas")
            .update({
              status: "encerrado_aut",
              bot_ativo: false,
              closed_at: agoraExecucao,
              updated_at: agoraExecucao,
            })
            .eq("id", payload.conversa_id)
            .eq("empresa_id", agendamento.empresa_id)
            .eq("status", "bot");

          await registrarEventoRastreamentoFluxo({
            empresaId: agendamento.empresa_id,
            conversaId: payload.conversa_id,
            execucaoId: agendamento.execucao_id,
            fluxoId: agendamento.fluxo_id,
            noId: agendamento.no_id,
            tipo: "fluxo_incompleto_timeout",
            metadata: {
              tipo_encerramento: "inatividade_fluxo",
              origem_timeout: "encerramento_inatividade_fluxo",
              mensagem_enviada: !!mensagem,
            },
          });

          await supabaseAdmin
            .from("automacao_agendamentos")
            .update({
              status: "cancelado",
              executed_at: agoraExecucao,
              payload_json: {
                motivo_cancelamento:
                  "fluxo_encerrado_por_inatividade_global",
              },
            })
            .eq("empresa_id", agendamento.empresa_id)
            .eq("execucao_id", agendamento.execucao_id)
            .eq("tipo_agendamento", "timeout_sem_resposta")
            .eq("status", "pendente");

          await supabaseAdmin
            .from("automacao_agendamentos")
            .update({
              status: "executado",
              executed_at: agoraExecucao,
              payload_json: {
                ...payload,
                resultado: "fluxo_encerrado_por_inatividade",
              },
            })
            .eq("id", agendamento.id)
            .eq("empresa_id", agendamento.empresa_id);

          continue;
        }

        if (agendamento.tipo_agendamento !== "timeout_sem_resposta") {
          await supabaseAdmin
            .from("automacao_agendamentos")
            .update({
              status: "erro",
              executed_at: new Date().toISOString(),
              payload_json: {
                ...payload,
                motivo_erro: "tipo_agendamento_nao_suportado_neste_cron",
              },
            })
            .eq("id", agendamento.id)
            .eq("empresa_id", agendamento.empresa_id);

          continue;
        }

        const { data: execucao } = await supabaseAdmin
          .from("automacao_execucoes")
          .select("*")
          .eq("id", agendamento.execucao_id)
          .eq("empresa_id", agendamento.empresa_id)
          .maybeSingle();

        if (!execucao) {
          await supabaseAdmin
            .from("automacao_agendamentos")
            .update({
              status: "cancelado",
              executed_at: new Date().toISOString(),
              payload_json: {
                ...payload,
                motivo_cancelamento: "execucao_nao_encontrada",
              },
            })
            .eq("id", agendamento.id)
            .eq("empresa_id", agendamento.empresa_id);

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

        const validacaoExecucao = await validarExecucaoAutomacaoAtiva({
          empresaId: agendamento.empresa_id,
          conversaId: payload.conversa_id,
          execucaoId: agendamento.execucao_id,
        });

        if (!validacaoExecucao.ok) {
          await supabaseAdmin
            .from("automacao_agendamentos")
            .update({
              status: "cancelado",
              executed_at: new Date().toISOString(),
              payload_json: {
                ...payload,
                motivo_cancelamento: validacaoExecucao.motivo,
              },
            })
            .eq("id", agendamento.id)
            .eq("empresa_id", agendamento.empresa_id);

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
              .eq("id", agendamento.id)
              .eq("empresa_id", agendamento.empresa_id);

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
            .eq("id", agendamento.id)
            .eq("empresa_id", agendamento.empresa_id);

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
            .eq("id", agendamento.id)
            .eq("empresa_id", agendamento.empresa_id);

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
          .eq("empresa_id", agendamento.empresa_id)
          .eq("fluxo_id", agendamento.fluxo_id)
          .maybeSingle();

        if (!proximoNo) {
          await supabaseAdmin
            .from("automacao_agendamentos")
            .update({
              status: "erro",
              executed_at: new Date().toISOString(),
            })
            .eq("id", agendamento.id)
            .eq("empresa_id", agendamento.empresa_id);

          continue;
        }

        await supabaseAdmin
          .from("automacao_agendamentos")
          .update({
            status: "cancelado",
            executed_at: new Date().toISOString(),
            payload_json: {
              motivo_cancelamento:
                "timeout_sem_resposta_executado_antes_do_encerramento_global",
            },
          })
          .eq("empresa_id", agendamento.empresa_id)
          .eq("execucao_id", agendamento.execucao_id)
          .eq("tipo_agendamento", "encerramento_inatividade_fluxo")
          .eq("status", "pendente");


          const { data: transicaoAtualizada, error: transicaoError } =
            await supabaseAdmin
              .from("automacao_execucoes")
              .update({
                no_atual_id: proximoNo.id,
                status: "rodando",
                updated_at: new Date().toISOString(),
                metadata_json: {
                  ...(execucao.metadata_json || {}),
                  timeout_sem_resposta: {
                    no_origem_id: agendamento.no_id,
                    no_destino_id: proximoNo.id,
                    agendamento_id: agendamento.id,
                    executado_em: new Date().toISOString(),
                  },
                },
              })
              .eq("id", agendamento.execucao_id)
              .eq("empresa_id", agendamento.empresa_id)
              .eq("status", "aguardando")
              .eq("no_atual_id", agendamento.no_id)
              .select("id")
              .maybeSingle();

          if (transicaoError || !transicaoAtualizada) {
            await supabaseAdmin
              .from("automacao_agendamentos")
              .update({
                status: "cancelado",
                executed_at: new Date().toISOString(),
                payload_json: {
                  ...payload,
                  motivo_cancelamento: "transicao_timeout_nao_aplicada",
                },
              })
              .eq("id", agendamento.id)
              .eq("empresa_id", agendamento.empresa_id);

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
          console.error("[CRON AUTOMAÇÕES] Erro ao executar agendamento:", {
            agendamentoId: agendamento.id,
            tipoAgendamento: agendamento.tipo_agendamento,
            empresaId: agendamento.empresa_id,
            execucaoId: agendamento.execucao_id,
            erro: error,
          });

          if (agendamento.tipo_agendamento === "timeout_sem_resposta") {
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
          }
            
          await supabaseAdmin
            .from("automacao_agendamentos")
            .update({
              status: "erro",
              executed_at: new Date().toISOString(),
              payload_json: {
                ...(agendamento.payload_json || {}),
                erro:
                  error instanceof Error
                    ? error.message
                    : String(error),
              },
            })
            .eq("id", agendamento.id)
            .eq("empresa_id", agendamento.empresa_id);
      }
    }

    if (agendamentos.length > 0) {
      console.log("[CRON TIMEOUT] Processamento concluido:", {
        agora,
        processados: agendamentos.length,
      });
    }

    return NextResponse.json({
      ok: true,
      processados: agendamentos.length,
    });
  } catch (error: unknown) {
    console.error("[CRON TIMEOUT] Erro geral:", error);

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Erro geral no cron.",
      },
      { status: 500 }
    );
  }
}
