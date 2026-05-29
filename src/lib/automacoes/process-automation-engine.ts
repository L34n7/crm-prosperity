import crypto from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type {
  AutomationEngineInput,
  AutomacaoGatilho,
  AutomacaoNo,
} from "./types";
import { gatilhoCombinaComMensagem } from "./match-trigger";
import { sendWhatsAppTextMessage } from "@/lib/whatsapp/send-text-message";
import { canSendFreeformWhatsAppMessage } from "@/lib/whatsapp/can-send-message";
import { sendAutomationNotificationEmail } from "@/lib/email/send-automation-notification-email";
import { interpretarConexaoComIA } from "@/lib/ia/interpretar-conexao";
import { interpretarArquivoComIA } from "@/lib/ia/interpretar-arquivo";
import { baixarMidiaWhatsapp } from "@/lib/whatsapp/download-arquivo";
import { salvarArquivoAnaliseStorage } from "@/lib/automacoes/salvar-arquivo-analise";
import {
  existeConflitoAgenda,
  filtrarSlotsPorPreferencia,
  formatarSlotAgenda,
  interpretarDataHorarioAgenda,
  listarSlotsDisponiveis,
  type PreferenciaHorarioAgenda,
} from "@/lib/agendas/agenda-service";

const supabaseAdmin = getSupabaseAdmin();

function perf(label: string, inicio: number, extra?: Record<string, any>) {
  console.log(`[PERF] ${label}`, {
    tempo_ms: Date.now() - inicio,
    ...(extra || {}),
  });
}

function somenteDigitos(valor: string) {
  return String(valor || "").replace(/\D/g, "");
}

function validarCpf(cpfEntrada: string) {
  const cpf = somenteDigitos(cpfEntrada);

  if (cpf.length !== 11) return false;
  if (/^(\d)\1+$/.test(cpf)) return false;

  let soma = 0;

  for (let i = 0; i < 9; i++) {
    soma += Number(cpf[i]) * (10 - i);
  }

  let digito1 = 11 - (soma % 11);
  if (digito1 >= 10) digito1 = 0;

  soma = 0;

  for (let i = 0; i < 10; i++) {
    soma += Number(cpf[i]) * (11 - i);
  }

  let digito2 = 11 - (soma % 11);
  if (digito2 >= 10) digito2 = 0;

  return digito1 === Number(cpf[9]) && digito2 === Number(cpf[10]);
}

function validarCaptura(tipo: string, valorOriginal: string) {
  const valor = String(valorOriginal || "").trim();
  const digitos = somenteDigitos(valor);

  if (!valor) {
    return { valido: false, valorLimpo: "", valorFormatado: "" };
  }

  if (tipo === "texto") {
    return { valido: true, valorLimpo: valor, valorFormatado: valor };
  }

  if (tipo === "nome") {
    const pareceFrase =
      valor.split(/\s+/).length > 5 ||
      /\b(quero|preciso|boleto|conta|pagamento|segunda via|atendente)\b/i.test(valor);

    const valido =
      /^[A-Za-zÀ-ÿ'´`^~\s]{2,80}$/.test(valor) &&
      !/\d/.test(valor) &&
      !pareceFrase;

    return { valido, valorLimpo: valor, valorFormatado: valor };
  }

  if (tipo === "cpf") {
    return {
      valido: validarCpf(valor),
      valorLimpo: digitos,
      valorFormatado:
        digitos.length === 11
          ? `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-${digitos.slice(9)}`
          : valor,
    };
  }

  if (tipo === "cnpj") {
    return {
      valido: digitos.length === 14 && !/^(\d)\1+$/.test(digitos),
      valorLimpo: digitos,
      valorFormatado: valor,
    };
  }

  if (tipo === "email") {
    const valido = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(valor);
    return { valido, valorLimpo: valor.toLowerCase(), valorFormatado: valor.toLowerCase() };
  }

  if (tipo === "telefone") {
    return {
      valido: digitos.length >= 10 && digitos.length <= 13,
      valorLimpo: digitos,
      valorFormatado: valor,
    };
  }

  if (tipo === "numero") {
    return {
      valido: /^-?\d+([.,]\d+)?$/.test(valor),
      valorLimpo: valor.replace(",", "."),
      valorFormatado: valor,
    };
  }

  if (tipo === "data") {
    const valido =
      /^\d{2}\/\d{2}\/\d{4}$/.test(valor) ||
      /^\d{4}-\d{2}-\d{2}$/.test(valor);

    return { valido, valorLimpo: valor, valorFormatado: valor };
  }

  if (tipo === "cep") {
    return {
      valido: digitos.length === 8,
      valorLimpo: digitos,
      valorFormatado:
        digitos.length === 8 ? `${digitos.slice(0, 5)}-${digitos.slice(5)}` : valor,
    };
  }

  if (tipo === "moeda") {
    const normalizado = valor.replace(/[R$\s.]/g, "").replace(",", ".");
    const numero = Number(normalizado);

    return {
      valido: Number.isFinite(numero) && numero >= 0,
      valorLimpo: String(numero),
      valorFormatado: valor,
    };
  }

  return { valido: true, valorLimpo: valor, valorFormatado: valor };
}

function aguardar(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function delayAposMidia(tipo: "image" | "video" | "audio") {
  if (tipo === "video") return 4500;
  if (tipo === "audio") return 2500;
  if (tipo === "image") return 1800;

  return 1000;
}

function delaySegundosDoNo(no: {
  tipo_no: string;
  delay_segundos?: number | string | null;
}) {
  if (no.tipo_no === "inicio") {
    return 0;
  }

  if (no.delay_segundos == null) {
    return 0;
  }

  const delay = Number(no.delay_segundos);

  if (!Number.isFinite(delay)) {
    return 0;
  }

  return Math.max(0, delay);
}

function calcularSegundosAgendamentoDisparo(config: Record<string, any>) {
  const quantidade = Math.max(1, Number(config.tempo_quantidade || 1));
  const unidade = String(config.tempo_unidade || "horas");

  if (unidade === "dias") {
    return quantidade * 24 * 60 * 60;
  }

  return quantidade * 60 * 60;
}

function normalizarTexto(texto: string) {
  return String(texto || "").trim().toLowerCase();
}

function condicaoPrecisaDeResposta(condicao: Record<string, any> | null | undefined) {
  if (!condicao?.tipo) return false;

  return [
    "resposta_igual",
    "resposta_contem",
    "resposta_inicia_com",
    "resposta_regex",
  ].includes(condicao.tipo);
}

function condicaoCombinaComMensagem(
  condicao: Record<string, any> | null | undefined,
  mensagemTexto?: string
) {
  if (!condicao?.tipo) return false;

  if (condicao.tipo === "sempre") {
    return true;
  }

  const mensagemOriginal = String(mensagemTexto || "").trim();
  const valorOriginal = String(condicao.valor || "").trim();

  const mensagem = normalizarTexto(mensagemOriginal);
  const valor = normalizarTexto(valorOriginal);

  if (!mensagem || !valor) return false;

  if (condicao.tipo === "resposta_igual") {
    return mensagem === valor;
  }

  if (condicao.tipo === "resposta_contem") {
    return mensagem.includes(valor);
  }

  if (condicao.tipo === "resposta_inicia_com") {
    return mensagem.startsWith(valor);
  }

  if (condicao.tipo === "resposta_regex") {
    try {
      const regex = new RegExp(valorOriginal, "i");
      return regex.test(mensagemOriginal);
    } catch {
      return false;
    }
  }

  return false;
}


type FluxoRuntimeCache = {
  nosPorId: Map<string, AutomacaoNo>;
  conexoesPorOrigem: Map<string, any[]>;
};

async function carregarFluxoRuntimeCache(params: {
  empresaId: string;
  fluxoId: string;
}): Promise<FluxoRuntimeCache> {
  const { empresaId, fluxoId } = params;

  const [{ data: nos, error: nosError }, { data: conexoes, error: conexoesError }] =
    await Promise.all([
      supabaseAdmin
        .from("automacao_nos")
        .select("*")
        .eq("empresa_id", empresaId)
        .eq("fluxo_id", fluxoId)
        .eq("ativo", true),

      supabaseAdmin
        .from("automacao_conexoes")
        .select("*")
        .eq("empresa_id", empresaId)
        .eq("fluxo_id", fluxoId)
        .eq("ativo", true)
        .order("ordem", { ascending: true }),
    ]);

  if (nosError) {
    throw new Error(`Erro ao carregar nós do fluxo: ${nosError.message}`);
  }

  if (conexoesError) {
    throw new Error(`Erro ao carregar conexões do fluxo: ${conexoesError.message}`);
  }

  const nosPorId = new Map<string, AutomacaoNo>();
  const conexoesPorOrigem = new Map<string, any[]>();

  for (const no of nos || []) {
    nosPorId.set(no.id, no);
  }

  for (const conexao of conexoes || []) {
    const lista = conexoesPorOrigem.get(conexao.no_origem_id) || [];
    lista.push(conexao);
    conexoesPorOrigem.set(conexao.no_origem_id, lista);
  }

  return {
    nosPorId,
    conexoesPorOrigem,
  };
}

async function buscarConfiguracaoEncerramentoInatividade(params: {
  empresaId: string;
  fluxoId: string;
}) {
  const { empresaId, fluxoId } = params;

  const { data: fluxo, error } = await supabaseAdmin
    .from("automacao_fluxos")
    .select("configuracao_json")
    .eq("empresa_id", empresaId)
    .eq("id", fluxoId)
    .maybeSingle();

  if (error) {
    console.error(
      "[AUTOMATION_ENGINE] Erro ao buscar configuração de inatividade do fluxo:",
      error
    );

    return null;
  }

  const config = fluxo?.configuracao_json || {};
  const encerramento = config.encerramento_inatividade || {};

  if (encerramento.ativo !== true) {
    return null;
  }

  const quantidade = Math.max(1, Number(encerramento.tempo_quantidade || 1));
  const unidade =
    encerramento.tempo_unidade === "minutos" ? "minutos" : "horas";

  const segundos =
    unidade === "horas" ? quantidade * 60 * 60 : quantidade * 60;

  if (!Number.isFinite(segundos)) {
    return null;
  }

  if (segundos < 5 * 60) {
    return null;
  }

  if (segundos > 23 * 60 * 60) {
    return null;
  }

  return {
    segundos,
    quantidade,
    unidade,
    mensagem: String(encerramento.mensagem || "").trim(),
  };
}


async function cancelarEncerramentoInatividadePendente(params: {
  empresaId: string;
  execucaoId: string;
}) {
  const { empresaId, execucaoId } = params;

  const { error } = await supabaseAdmin
    .from("automacao_agendamentos")
    .update({
      status: "cancelado",
    })
    .eq("empresa_id", empresaId)
    .eq("execucao_id", execucaoId)
    .eq("tipo_agendamento", "encerramento_inatividade_fluxo")
    .eq("status", "pendente");

  if (error) {
    console.error(
      "[AUTOMATION_ENGINE] Erro ao cancelar encerramento por inatividade pendente:",
      error
    );
  }
}


async function agendarEncerramentoInatividadeFluxoSeAtivo(params: {
  empresaId: string;
  conversaId: string;
  execucaoId: string;
  fluxoId: string;
  noId: string;
  numeroDestino: string;
}) {
  const { empresaId, conversaId, execucaoId, fluxoId, noId, numeroDestino } =
    params;

  const config = await buscarConfiguracaoEncerramentoInatividade({
    empresaId,
    fluxoId,
  });

  if (!config) return;

  await cancelarEncerramentoInatividadePendente({
    empresaId,
    execucaoId,
  });

  const executarEm = new Date(Date.now() + config.segundos * 1000).toISOString();

  const { error } = await supabaseAdmin
    .from("automacao_agendamentos")
    .insert({
      empresa_id: empresaId,
      execucao_id: execucaoId,
      fluxo_id: fluxoId,
      no_id: noId,
      tipo_agendamento: "encerramento_inatividade_fluxo",
      executar_em: executarEm,
      status: "pendente",
      payload_json: {
        conversa_id: conversaId,
        numero_destino: numeroDestino,
        no_atual_id: noId,
        timeout_segundos: config.segundos,
        tempo_quantidade: config.quantidade,
        tempo_unidade: config.unidade,
        mensagem: config.mensagem,
      },
    });

  if (error) {
    console.error(
      "[AUTOMATION_ENGINE] Erro ao agendar encerramento por inatividade:",
      error
    );

    return;
  }

  await registrarLog({
    empresaId,
    execucaoId,
    fluxoId,
    noId,
    tipoEvento: "encerramento_inatividade_fluxo_agendado",
    descricao: "Encerramento automático por inatividade do fluxo agendado.",
    entrada: {
      tempo_quantidade: config.quantidade,
      tempo_unidade: config.unidade,
      timeout_segundos: config.segundos,
    },
    saida: {
      executar_em: executarEm,
    },
  });
}


export async function processAutomationEngine(input: AutomationEngineInput) {
  const { empresaId, conversaId, contatoId, mensagemTexto, numeroDestino } = input;

  console.log("[AUTOMATION_ENGINE] Iniciando motor", {
    empresaId,
    conversaId,
    contatoId,
    mensagemTexto,
  });

  const { data: conversaAtual, error: conversaAtualError } = await supabaseAdmin
    .from("conversas")
    .select("id, status, responsavel_id, bot_ativo")
    .eq("empresa_id", empresaId)
    .eq("id", conversaId)
    .maybeSingle();

  if (conversaAtualError) {
    console.error(
      "[AUTOMATION_ENGINE] Erro ao buscar conversa antes de processar automação:",
      conversaAtualError
    );

    return { ok: false, error: "Erro ao buscar conversa." };
  }

  const conversaEmAtendimentoHumano =
    conversaAtual?.status === "em_atendimento" &&
    !!conversaAtual?.responsavel_id &&
    conversaAtual?.bot_ativo !== true;

  if (conversaEmAtendimentoHumano) {
    const agora = new Date().toISOString();

    const { data: execucoesParaCancelar } = await supabaseAdmin
      .from("automacao_execucoes")
      .select("id")
      .eq("empresa_id", empresaId)
      .eq("conversa_id", conversaId)
      .in("status", ["rodando", "aguardando"]);

    const execucaoIds = (execucoesParaCancelar || []).map((execucao) => execucao.id);

    if (execucaoIds.length > 0) {
      await supabaseAdmin
        .from("automacao_execucoes")
        .update({
          status: "cancelado",
          finished_at: agora,
          updated_at: agora,
          metadata_json: {
            motivo_cancelamento: "atendimento_humano_assumiu_conversa",
            cancelado_em: agora,
          },
        })
        .eq("empresa_id", empresaId)
        .eq("conversa_id", conversaId)
        .in("status", ["rodando", "aguardando"]);

      await supabaseAdmin
        .from("automacao_agendamentos")
        .update({
          status: "cancelado",
        })
        .eq("empresa_id", empresaId)
        .in("execucao_id", execucaoIds)
        .eq("status", "pendente");
    }

    console.log(
      "[AUTOMATION_ENGINE] Automação ignorada/cancelada: conversa em atendimento humano.",
      {
        conversaId,
        status: conversaAtual.status,
        responsavelId: conversaAtual.responsavel_id,
        execucoesCanceladas: execucaoIds.length,
      }
    );

    return {
      ok: true,
      status: "ignorado_atendimento_humano",
    };
  }  

  const { data: execucoesExistentes, error: execucaoError } = await supabaseAdmin
    .from("automacao_execucoes")
    .select("*")
    .eq("empresa_id", empresaId)
    .eq("conversa_id", conversaId)
    .in("status", ["rodando", "aguardando"])
    .order("created_at", { ascending: false })
    .limit(5);

  if (execucaoError) {
    console.error("[AUTOMATION_ENGINE] Erro ao buscar execução:", execucaoError);
    return { ok: false, error: "Erro ao buscar execução." };
  }

  const execucaoExistente = execucoesExistentes?.[0] || null;

  const execucoesDuplicadas = (execucoesExistentes || []).slice(1);

  if (execucoesDuplicadas.length > 0) {
    const agora = new Date().toISOString();

    await supabaseAdmin
      .from("automacao_execucoes")
      .update({
        status: "cancelado",
        finished_at: agora,
        updated_at: agora,
        metadata_json: {
          motivo_cancelamento: "execucao_duplicada_concorrencia",
          cancelado_em: agora,
        },
      })
      .eq("empresa_id", empresaId)
      .in(
        "id",
        execucoesDuplicadas.map((execucao) => execucao.id)
      );

    console.warn("[AUTOMATION_ENGINE] Execuções duplicadas canceladas", {
      conversaId,
      mantida: execucaoExistente?.id,
      canceladas: execucoesDuplicadas.map((execucao) => execucao.id),
    });
  }

  if (execucaoExistente) {
    console.log("[AUTOMATION_ENGINE] Continuando execução existente", {
      execucaoId: execucaoExistente.id,
      noAtualId: execucaoExistente.no_atual_id,
      status: execucaoExistente.status,
    });

    const runtimeCache = await carregarFluxoRuntimeCache({
      empresaId,
      fluxoId: execucaoExistente.fluxo_id,
    });

    const { data: noAtual, error: noAtualError } = await supabaseAdmin
      .from("automacao_nos")
      .select("*")
      .eq("id", execucaoExistente.no_atual_id)
      .eq("empresa_id", empresaId)
      .maybeSingle();

    if (noAtualError || !noAtual) {
      console.error("[AUTOMATION_ENGINE] Erro ao buscar nó atual:", noAtualError);
      return { ok: false, error: "Erro ao buscar nó atual." };
    }

    if (execucaoExistente.status === "aguardando") {
      const metadataExecucao = execucaoExistente.metadata_json || {};

      await cancelarAgendamentosTimeoutPendentes({
        empresaId,
        execucaoId: execucaoExistente.id,
        noId: execucaoExistente.no_atual_id,
      });

      await cancelarEncerramentoInatividadePendente({
        empresaId,
        execucaoId: execucaoExistente.id,
      });

      if (
        noAtual.tipo_no === "avaliacao" &&
        metadataExecucao.avaliacao_pendente_comentario === true &&
        metadataExecucao.avaliacao_id
      ) {
        const comentarioRegistrado = await registrarComentarioAvaliacaoAutomacao({
          empresaId,
          conversaId,
          execucao: execucaoExistente,
          no: noAtual,
          mensagemTexto,
          numeroDestino,
        });

        if (!comentarioRegistrado.ok) {
          return comentarioRegistrado;
        }

        await seguirParaProximoNo({
          empresaId,
          conversaId,
          execucaoId: execucaoExistente.id,
          fluxoId: execucaoExistente.fluxo_id,
          noAtualId: execucaoExistente.no_atual_id,
          mensagemTexto,
          numeroDestino,
          runtimeCache,
        });

        return {
          ok: true,
          status: "comentario_avaliacao_registrado",
          execucaoId: execucaoExistente.id,
        };
      }

      if (noAtual.tipo_no === "avaliacao") {
        const avaliacaoRegistrada = await registrarAvaliacaoAutomacao({
          empresaId,
          conversaId,
          execucao: execucaoExistente,
          no: noAtual,
          mensagemTexto,
          numeroDestino,
        });

      if (!avaliacaoRegistrada.ok) {
        return avaliacaoRegistrada;
      }

      if ((avaliacaoRegistrada as any).aguardando === true) {
        return {
          ok: true,
          status: "avaliacao_invalida_aguardando_nova_resposta",
          execucaoId: execucaoExistente.id,
        };
      }

      if (avaliacaoRegistrada.aguardandoComentario) {
        await agendarEncerramentoInatividadeFluxoSeAtivo({
          empresaId,
          conversaId,
          execucaoId: execucaoExistente.id,
          fluxoId: execucaoExistente.fluxo_id,
          noId: execucaoExistente.no_atual_id,
          numeroDestino,
        });

        return {
          ok: true,
          status: "aguardando_comentario_avaliacao",
          execucaoId: execucaoExistente.id,
        };
      }
    }

      if (noAtual.tipo_no === "agenda_buscar_agendamento") {
        const agendamentoSelecionado =
          await registrarEscolhaAgendamentoAgendaAutomacao({
            empresaId,
            conversaId,
            execucao: execucaoExistente,
            no: noAtual,
            mensagemTexto,
            numeroDestino,
          });

        if (!agendamentoSelecionado.ok) {
          return agendamentoSelecionado;
        }

        if (agendamentoSelecionado.aguardando) {
          await agendarEncerramentoInatividadeFluxoSeAtivo({
            empresaId,
            conversaId,
            execucaoId: execucaoExistente.id,
            fluxoId: execucaoExistente.fluxo_id,
            noId: execucaoExistente.no_atual_id,
            numeroDestino,
          });

          return {
            ok: true,
            status: "agenda_aguardando_escolha_agendamento",
            execucaoId: execucaoExistente.id,
          };
        }

        if (agendamentoSelecionado.excedeuTentativas) {
          await executarAcaoExcessoTentativas({
            empresaId,
            conversaId,
            execucao: execucaoExistente,
            no: noAtual,
            numeroDestino,
            tipo: "resposta_invalida",
          });

          return {
            ok: true,
            status: "agenda_tentativas_excedidas",
            execucaoId: execucaoExistente.id,
          };
        }

        await seguirParaProximoNo({
          empresaId,
          conversaId,
          execucaoId: execucaoExistente.id,
          fluxoId: execucaoExistente.fluxo_id,
          noAtualId: execucaoExistente.no_atual_id,
          mensagemTexto: "encontrado",
          numeroDestino,
          runtimeCache,
        });

        return {
          ok: true,
          status: "agenda_agendamento_selecionado",
          execucaoId: execucaoExistente.id,
        };
      }

      if (noAtual.tipo_no === "agenda_escolher_horario") {
        const slotRegistrado = await registrarEscolhaSlotAgendaAutomacao({
          empresaId,
          conversaId,
          execucao: execucaoExistente,
          no: noAtual,
          mensagemTexto,
          numeroDestino,
        });

        if (!slotRegistrado.ok) {
          return slotRegistrado;
        }

        if (slotRegistrado.aguardando) {
          await agendarEncerramentoInatividadeFluxoSeAtivo({
            empresaId,
            conversaId,
            execucaoId: execucaoExistente.id,
            fluxoId: execucaoExistente.fluxo_id,
            noId: execucaoExistente.no_atual_id,
            numeroDestino,
          });

          return {
            ok: true,
            status: "agenda_aguardando_escolha_horario",
            execucaoId: execucaoExistente.id,
          };
        }

        if (slotRegistrado.excedeuTentativas) {
          await executarAcaoExcessoTentativas({
            empresaId,
            conversaId,
            execucao: execucaoExistente,
            no: noAtual,
            numeroDestino,
            tipo: "resposta_invalida",
          });

          return {
            ok: true,
            status: "agenda_tentativas_excedidas",
            execucaoId: execucaoExistente.id,
          };
        }

        await seguirParaProximoNo({
          empresaId,
          conversaId,
          execucaoId: execucaoExistente.id,
          fluxoId: execucaoExistente.fluxo_id,
          noAtualId: execucaoExistente.no_atual_id,
          mensagemTexto: "slot_escolhido",
          numeroDestino,
          runtimeCache,
        });

        return {
          ok: true,
          status: "agenda_slot_escolhido",
          execucaoId: execucaoExistente.id,
        };
      }

      if (noAtual.tipo_no === "interpretar_arquivo_ia") {
        const resultadoAnalise = await registrarInterpretacaoArquivoAutomacao({
          empresaId,
          conversaId,
          execucao: execucaoExistente,
          no: noAtual,
          input,
          numeroDestino,
        });

        if (!resultadoAnalise.ok) {
          return resultadoAnalise;
        }

        if (!resultadoAnalise.valido && !resultadoAnalise.excedeuTentativas) {
          await agendarEncerramentoInatividadeFluxoSeAtivo({
            empresaId,
            conversaId,
            execucaoId: execucaoExistente.id,
            fluxoId: execucaoExistente.fluxo_id,
            noId: execucaoExistente.no_atual_id,
            numeroDestino,
          });

          return {
            ok: true,
            status: "arquivo_invalido_aguardando_novo_envio",
            execucaoId: execucaoExistente.id,
          };
        }

        if (resultadoAnalise.excedeuTentativas) {
          await executarAcaoExcessoTentativas({
            empresaId,
            conversaId,
            execucao: execucaoExistente,
            no: noAtual,
            numeroDestino,
            tipo: "resposta_invalida",
          });

          return {
            ok: true,
            status: "arquivo_tentativas_excedidas",
            execucaoId: execucaoExistente.id,
          };
        }

        await seguirParaProximoNo({
          empresaId,
          conversaId,
          execucaoId: execucaoExistente.id,
          fluxoId: execucaoExistente.fluxo_id,
          noAtualId: execucaoExistente.no_atual_id,
          mensagemTexto: resultadoAnalise.status,
          numeroDestino,
          runtimeCache,
        });

        return {
          ok: true,
          status: "arquivo_interpretado",
          execucaoId: execucaoExistente.id,
        };
      }

      if (noAtual.tipo_no === "capturar_resposta") {
        const capturaRegistrada = await registrarCapturaRespostaAutomacao({
          empresaId,
          conversaId,
          execucao: execucaoExistente,
          no: noAtual,
          mensagemTexto,
          numeroDestino,
        });

        if (!capturaRegistrada.ok) {
          return capturaRegistrada;
        }

        if (!capturaRegistrada.valido && !capturaRegistrada.excedeuTentativas) {
          await agendarEncerramentoInatividadeFluxoSeAtivo({
            empresaId,
            conversaId,
            execucaoId: execucaoExistente.id,
            fluxoId: execucaoExistente.fluxo_id,
            noId: execucaoExistente.no_atual_id,
            numeroDestino,
          });

          return {
            ok: true,
            status: "captura_invalida_aguardando_nova_resposta",
            execucaoId: execucaoExistente.id,
          };
        }

        if (capturaRegistrada.excedeuTentativas) {
          await executarAcaoExcessoTentativas({
            empresaId,
            conversaId,
            execucao: execucaoExistente,
            no: noAtual,
            numeroDestino,
            tipo: "resposta_invalida",
          });

          return {
            ok: true,
            status: "captura_tentativas_excedidas",
            execucaoId: execucaoExistente.id,
          };
        }

        await seguirParaProximoNo({
          empresaId,
          conversaId,
          execucaoId: execucaoExistente.id,
          fluxoId: execucaoExistente.fluxo_id,
          noAtualId: execucaoExistente.no_atual_id,
          mensagemTexto,
          numeroDestino,
          runtimeCache,
        });

        return {
          ok: true,
          status: capturaRegistrada.excedeuTentativas
            ? "captura_tentativas_excedidas"
            : "captura_registrada",
          execucaoId: execucaoExistente.id,
        };
      }

      await seguirParaProximoNo({
        empresaId,
        conversaId,
        execucaoId: execucaoExistente.id,
        fluxoId: execucaoExistente.fluxo_id,
        noAtualId: execucaoExistente.no_atual_id,
        mensagemTexto,
        numeroDestino,
        runtimeCache,
      });
    } else {
      await executarNo({
        empresaId,
        conversaId,
        execucaoId: execucaoExistente.id,
        fluxoId: execucaoExistente.fluxo_id,
        no: noAtual,
        mensagemTexto,
        numeroDestino,
        runtimeCache,
      });
    }

    return {
      ok: true,
      status: "execucao_continuada",
      execucaoId: execucaoExistente.id,
    };
  }

  const { data: gatilhos, error: gatilhosError } = await supabaseAdmin
    .from("automacao_gatilhos")
    .select("*")
    .eq("empresa_id", empresaId)
    .eq("ativo", true);

  if (gatilhosError) {
    console.error("[AUTOMATION_ENGINE] Erro ao buscar gatilhos:", gatilhosError);
    return { ok: false, error: "Erro ao buscar gatilhos." };
  }

  const gatilhoEncontrado = (gatilhos || []).find((gatilho: AutomacaoGatilho) =>
    gatilhoCombinaComMensagem(gatilho, mensagemTexto)
  );

  let fluxoIdParaExecutar = "";
  let gatilhoIdParaMetadata: string | null = null;
  let tipoInicioExecucao: "gatilho" | "fluxo_padrao" = "gatilho";

  if (gatilhoEncontrado) {
    fluxoIdParaExecutar = gatilhoEncontrado.fluxo_id;
    gatilhoIdParaMetadata = gatilhoEncontrado.id;
  } else {
    console.log("[AUTOMATION_ENGINE] Nenhum gatilho encontrado. Buscando fluxo padrão.");

    const { data: fluxoPadrao, error: fluxoPadraoError } = await supabaseAdmin
      .from("automacao_fluxos")
      .select("*")
      .eq("empresa_id", empresaId)
      .eq("status", "ativo")
      .eq("fluxo_padrao", true)
      .eq("canal", "whatsapp")
      .maybeSingle();

    if (fluxoPadraoError) {
      console.error("[AUTOMATION_ENGINE] Erro ao buscar fluxo padrão:", fluxoPadraoError);
      return { ok: false, error: "Erro ao buscar fluxo padrão." };
    }

    if (!fluxoPadrao) {
      console.log("[AUTOMATION_ENGINE] Nenhum fluxo padrão ativo encontrado.");
      return { ok: true, status: "sem_gatilho" };
    }

    fluxoIdParaExecutar = fluxoPadrao.id;
    tipoInicioExecucao = "fluxo_padrao";
  }

  const { data: fluxo, error: fluxoError } = await supabaseAdmin
    .from("automacao_fluxos")
    .select("*")
    .eq("id", fluxoIdParaExecutar)
    .eq("empresa_id", empresaId)
    .eq("status", "ativo")
    .maybeSingle();

  if (fluxoError) {
    console.error("[AUTOMATION_ENGINE] Erro ao buscar fluxo:", fluxoError);
    return { ok: false, error: "Erro ao buscar fluxo." };
  }

  if (!fluxo) {
    console.log("[AUTOMATION_ENGINE] Fluxo encontrado, mas não está ativo.");
    return { ok: true, status: "fluxo_inativo" };
  }

  const { data: noInicial, error: noInicialError } = await supabaseAdmin
    .from("automacao_nos")
    .select("*")
    .eq("empresa_id", empresaId)
    .eq("fluxo_id", fluxo.id)
    .eq("tipo_no", "inicio")
    .eq("ativo", true)
    .maybeSingle();

  if (noInicialError) {
    console.error("[AUTOMATION_ENGINE] Erro ao buscar nó inicial:", noInicialError);
    return { ok: false, error: "Erro ao buscar nó inicial." };
  }

  if (!noInicial) {
    console.log("[AUTOMATION_ENGINE] Fluxo não possui nó inicial.");
    return { ok: false, error: "Fluxo sem nó inicial." };
  }

  const agora = new Date().toISOString();

  const { error: atualizarConversaParaBotError } = await supabaseAdmin
    .from("conversas")
    .update({
      status: "bot",
      bot_ativo: true,
      responsavel_id: null,
      closed_at: null,
      updated_at: agora,
      last_message_at: agora,
    })
    .eq("empresa_id", empresaId)
    .eq("id", conversaId);

  if (atualizarConversaParaBotError) {
    console.error(
      "[AUTOMATION_ENGINE] Erro ao atualizar conversa para bot:",
      atualizarConversaParaBotError
    );

    return {
      ok: false,
      error: "Erro ao atualizar conversa para bot.",
    };
  }

  const protocoloAtivo = await buscarOuCriarProtocoloAutomacao({
    empresaId,
    conversaId,
  });

  const { data: execucaoCriada, error: criarExecucaoError } = await supabaseAdmin
    .from("automacao_execucoes")
    .insert({
      empresa_id: empresaId,
      fluxo_id: fluxo.id,
      contato_id: contatoId,
      conversa_id: conversaId,
      conversa_protocolo_id: protocoloAtivo.id,
      no_atual_id: noInicial.id,
      status: "rodando",
      metadata_json: {
        gatilho_id: gatilhoIdParaMetadata,
        tipo_inicio: tipoInicioExecucao,
        mensagem_inicial: mensagemTexto,
      },
    })
    .select("*")
    .single();

  if (criarExecucaoError) {
    if (criarExecucaoError.code === "23505") {
      console.warn("[AUTOMATION_ENGINE] Execução ativa já existe para esta conversa", {
        empresaId,
        conversaId,
      });

      return {
        ok: true,
        status: "execucao_ativa_existente_concorrencia",
      };
    }

    console.error(
      "[AUTOMATION_ENGINE] Erro ao criar execução:",
      criarExecucaoError
    );

    return { ok: false, error: "Erro ao criar execução." };
  }

  await registrarLog({
    empresaId,
    execucaoId: execucaoCriada.id,
    fluxoId: fluxo.id,
    noId: noInicial.id,
    tipoEvento: "execucao_iniciada",
    descricao:
      tipoInicioExecucao === "gatilho"
        ? "Execução iniciada por palavra-chave."
        : "Execução iniciada pelo fluxo padrão.",
    entrada: {
      mensagemTexto,
      gatilho: gatilhoEncontrado || null,
      tipo_inicio: tipoInicioExecucao,
    },
    saida: {
      execucaoId: execucaoCriada.id,
    },
  });

  const runtimeCache = await carregarFluxoRuntimeCache({
    empresaId,
    fluxoId: fluxo.id,
  });

  await executarNo({
    empresaId,
    conversaId,
    execucaoId: execucaoCriada.id,
    fluxoId: fluxo.id,
    no: noInicial,
    mensagemTexto,
    numeroDestino,
    runtimeCache,
  });

  return {
    ok: true,
    status: "execucao_criada",
    execucaoId: execucaoCriada.id,
    fluxoId: fluxo.id,
  };
}

async function tentarTravarExecucaoNo(params: {
  empresaId: string;
  execucaoId: string;
  fluxoId: string;
  noId: string;
}) {
  const { empresaId, execucaoId, fluxoId, noId } = params;

  const { error } = await supabaseAdmin
    .from("automacao_execucao_logs")
    .insert({
      empresa_id: empresaId,
      execucao_id: execucaoId,
      fluxo_id: fluxoId,
      no_id: noId,
      tipo_evento: "lock_execucao_no",
      descricao: "Trava de idempotência para impedir execução duplicada do nó.",
      entrada_json: {},
      saida_json: {},
    });

  if (error) {
    if (error.code === "23505") {
      return false;
    }

    throw error;
  }

  return true;
}

export async function executarNo(params: {
  empresaId: string;
  conversaId: string;
  execucaoId: string;
  fluxoId: string;
  no: AutomacaoNo;
  mensagemTexto?: string;
  numeroDestino: string;
  runtimeCache?: FluxoRuntimeCache;
}) {
  const {
    empresaId,
    conversaId,
    execucaoId,
    fluxoId,
    no,
    mensagemTexto,
    numeroDestino,
    runtimeCache,
  } = params;

  console.log("[AUTOMATION_ENGINE] Executando nó", {
    noId: no.id,
    tipoNo: no.tipo_no,
  });

  if (no.tipo_no !== "inicio") {
    const podeExecutar = await tentarTravarExecucaoNo({
      empresaId,
      execucaoId,
      fluxoId,
      noId: no.id,
    });

    if (!podeExecutar) {
      console.warn("[AUTOMATION_ENGINE] Nó já executado. Ignorando duplicado.", {
        execucaoId,
        noId: no.id,
        tipoNo: no.tipo_no,
      });

      return;
    }
  }

  await registrarNotificacaoChegadaNoBloco({
    empresaId,
    conversaId,
    execucaoId,
    fluxoId,
    no,
    numeroDestino,
  });

  const delaySegundos = delaySegundosDoNo(no);

  if (delaySegundos > 0) {
    await registrarLog({
      empresaId,
      execucaoId,
      fluxoId,
      noId: no.id,
      tipoEvento: "delay_no",
      descricao: `Aguardando ${delaySegundos}s antes de executar o bloco.`,
      entrada: {
        delay_segundos: delaySegundos,
      },
      saida: {},
    });

    await aguardar(delaySegundos * 1000);
  }

  if (no.tipo_no === "inicio") {
    await seguirParaProximoNo({
      empresaId,
      conversaId,
      execucaoId,
      fluxoId,
      noAtualId: no.id,
      mensagemTexto,
      numeroDestino,
      runtimeCache,
    });

    return;
  }

  if (no.tipo_no === "agendar_disparo") {
    const config = no.configuracao_json || {};

    const templateId = String(config.template_id || "").trim();

    if (!templateId) {
      await registrarLog({
        empresaId,
        execucaoId,
        fluxoId,
        noId: no.id,
        tipoEvento: "agendar_disparo_erro",
        descricao: "Bloco Agendar disparo sem template configurado.",
        entrada: config,
        saida: {},
      });

      await seguirParaProximoNo({
        empresaId,
        conversaId,
        execucaoId,
        fluxoId,
        noAtualId: no.id,
        mensagemTexto,
        numeroDestino,
        runtimeCache,
      });

      return;
    }

    const segundosParaAgendar = calcularSegundosAgendamentoDisparo(config);

    const executarEm = new Date(
      Date.now() + segundosParaAgendar * 1000
    ).toISOString();

    const variaveis = Array.isArray(config.variaveis)
      ? config.variaveis
      : [];

    const { data: execucaoAtual } = await supabaseAdmin
      .from("automacao_execucoes")
      .select("contato_id, conversa_protocolo_id")
      .eq("id", execucaoId)
      .eq("empresa_id", empresaId)
      .maybeSingle();

    const { data: conversa } = await supabaseAdmin
      .from("conversas")
      .select("id, contato_id, integracao_whatsapp_id")
      .eq("id", conversaId)
      .eq("empresa_id", empresaId)
      .maybeSingle();

    const { data: template } = await supabaseAdmin
      .from("whatsapp_templates")
      .select(`
        id,
        nome,
        idioma,
        status,
        integracao_whatsapp_id,
        payload
      `)
      .eq("id", templateId)
      .eq("empresa_id", empresaId)
      .maybeSingle();

    if (!template) {
      await registrarLog({
        empresaId,
        execucaoId,
        fluxoId,
        noId: no.id,
        tipoEvento: "agendar_disparo_template_nao_encontrado",
        descricao: "Template configurado no bloco Agendar disparo não foi encontrado.",
        entrada: config,
        saida: {
          template_id: templateId,
        },
      });

      await seguirParaProximoNo({
        empresaId,
        conversaId,
        execucaoId,
        fluxoId,
        noAtualId: no.id,
        mensagemTexto,
        numeroDestino,
        runtimeCache,
      });

      return;
    }

    if (String(template.status || "").toUpperCase() !== "APPROVED") {
      await registrarLog({
        empresaId,
        execucaoId,
        fluxoId,
        noId: no.id,
        tipoEvento: "agendar_disparo_template_nao_aprovado",
        descricao: "Template configurado no bloco Agendar disparo não está aprovado.",
        entrada: config,
        saida: {
          template_id: template.id,
          template_nome: template.nome,
          status: template.status,
        },
      });

      await seguirParaProximoNo({
        empresaId,
        conversaId,
        execucaoId,
        fluxoId,
        noAtualId: no.id,
        mensagemTexto,
        numeroDestino,
        runtimeCache,
      });

      return;
    }

    const integracaoWhatsappId =
      conversa?.integracao_whatsapp_id || template.integracao_whatsapp_id || null;

    const { error: insertAgendamentoError } = await supabaseAdmin
      .from("automacao_agendamentos")
      .insert({
        empresa_id: empresaId,
        execucao_id: execucaoId,
        fluxo_id: fluxoId,
        no_id: no.id,
        tipo_agendamento: "disparo_template",
        executar_em: executarEm,
        status: "pendente",
        payload_json: {
          conversa_id: conversaId,
          contato_id: execucaoAtual?.contato_id || conversa?.contato_id || null,
          conversa_protocolo_id: execucaoAtual?.conversa_protocolo_id || null,
          numero_destino: numeroDestino,

          template_id: template.id,
          template_nome: template.nome,
          template_idioma: template.idioma,
          template_payload: template.payload || null,
          integracao_whatsapp_id: integracaoWhatsappId,

          variaveis,
          tempo_quantidade: config.tempo_quantidade || null,
          tempo_unidade: config.tempo_unidade || null,
          segundos_para_agendar: segundosParaAgendar,

          origem: "fluxo_automacao",
          automacao_no_titulo: no.titulo,
        },
      });

    if (insertAgendamentoError) {
      await registrarLog({
        empresaId,
        execucaoId,
        fluxoId,
        noId: no.id,
        tipoEvento: "agendar_disparo_erro_insert",
        descricao: "Erro ao criar agendamento de disparo template.",
        entrada: config,
        saida: {
          erro: insertAgendamentoError.message,
        },
      });

      return;
    }

    await registrarLog({
      empresaId,
      execucaoId,
      fluxoId,
      noId: no.id,
      tipoEvento: "disparo_template_agendado",
      descricao: "Disparo de template WhatsApp agendado com sucesso.",
      entrada: config,
      saida: {
        executar_em: executarEm,
        template_id: template.id,
        template_nome: template.nome,
        integracao_whatsapp_id: integracaoWhatsappId,
        variaveis,
      },
    });

    await seguirParaProximoNo({
      empresaId,
      conversaId,
      execucaoId,
      fluxoId,
      noAtualId: no.id,
      mensagemTexto,
      numeroDestino,
      runtimeCache,
    });

    return;
  }

  if (no.tipo_no === "agenda_buscar_agendamento") {
    await buscarAgendamentoAutomacao({
      empresaId,
      conversaId,
      execucaoId,
      fluxoId,
      no,
      numeroDestino,
      runtimeCache,
    });

    return;
  }

  if (no.tipo_no === "agenda_escolher_horario") {
    const { data: execucaoAtual } = await supabaseAdmin
      .from("automacao_execucoes")
      .select("*")
      .eq("id", execucaoId)
      .eq("empresa_id", empresaId)
      .maybeSingle();

    if (!execucaoAtual) return;

    await enviarOpcoesEscolhaHorarioAgenda({
      empresaId,
      conversaId,
      execucao: execucaoAtual,
      no,
      numeroDestino,
      mensagemTexto: String(mensagemTexto || ""),
    });

    return;
  }

  if (no.tipo_no === "agenda_criar_agendamento") {
    await criarAgendamentoAutomacao({
      empresaId,
      conversaId,
      execucaoId,
      fluxoId,
      no,
      numeroDestino,
      runtimeCache,
    });

    return;
  }

  if (no.tipo_no === "agenda_remarcar_agendamento") {
    await remarcarAgendamentoAutomacao({
      empresaId,
      conversaId,
      execucaoId,
      fluxoId,
      no,
      numeroDestino,
      runtimeCache,
    });

    return;
  }

  if (no.tipo_no === "agenda_cancelar_agendamento") {
    await cancelarAgendamentoAutomacao({
      empresaId,
      conversaId,
      execucaoId,
      fluxoId,
      no,
      numeroDestino,
      runtimeCache,
    });

    return;
  }

  if (no.tipo_no === "enviar_texto") {
    const mensagem = no.configuracao_json?.mensagem;

    if (mensagem) {
      await enviarMensagemAutomacao({
        empresaId,
        conversaId,
        numeroDestino,
        conteudo: mensagem,
        execucaoId,
        noId: no.id,
      });
    }

    await registrarLog({
      empresaId,
      execucaoId,
      fluxoId,
      noId: no.id,
      tipoEvento: "no_executado",
      descricao: "Mensagem de texto registrada no banco.",
      entrada: no.configuracao_json,
      saida: { mensagem },
    });

    const conexoesDoNo = runtimeCache
      ? runtimeCache.conexoesPorOrigem.get(no.id) || []
      : (
          await supabaseAdmin
            .from("automacao_conexoes")
            .select("id, condicao_json")
            .eq("empresa_id", empresaId)
            .eq("fluxo_id", fluxoId)
            .eq("no_origem_id", no.id)
            .eq("ativo", true)
        ).data || [];

    const precisaAguardarResposta = conexoesDoNo.some((c) =>
      condicaoPrecisaDeResposta(c.condicao_json)
    );

    if (precisaAguardarResposta) {
      await supabaseAdmin
        .from("automacao_execucoes")
        .update({
          no_atual_id: no.id,
          status: "aguardando",
          updated_at: new Date().toISOString(),
        })
        .eq("id", execucaoId)
        .eq("empresa_id", empresaId);

      await agendarEncerramentoInatividadeFluxoSeAtivo({
        empresaId,
        conversaId,
        execucaoId,
        fluxoId,
        noId: no.id,
        numeroDestino,
      });

      return;
    }

    await seguirParaProximoNo({
      empresaId,
      conversaId,
      execucaoId,
      fluxoId,
      noAtualId: no.id,
      numeroDestino,
      runtimeCache,
    });

    return;
  }

  if (no.tipo_no === "pergunta_opcoes") {
    let mensagem = no.configuracao_json?.mensagem || "";

    const opcoes = Array.isArray(no.configuracao_json?.opcoes)
      ? no.configuracao_json.opcoes
      : [];

    if (opcoes.length > 0) {
      const textoOpcoes = opcoes
        .map((op: any) => `${op.valor} - ${op.titulo}`)
        .join("\n");

      mensagem = `${mensagem}\n\n${textoOpcoes}`;
    }

    await enviarMensagemAutomacao({
      empresaId,
      conversaId,
      numeroDestino,
      conteudo: mensagem,
      execucaoId,
      noId: no.id,
    });

    await supabaseAdmin
      .from("automacao_execucoes")
      .update({
        no_atual_id: no.id,
        status: "aguardando",
        updated_at: new Date().toISOString(),
      })
      .eq("id", execucaoId)
      .eq("empresa_id", empresaId);

    await agendarTimeoutSemRespostaSeExistir({
      empresaId,
      conversaId,
      execucaoId,
      fluxoId,
      noId: no.id,
      numeroDestino,
    });

    await agendarEncerramentoInatividadeFluxoSeAtivo({
      empresaId,
      conversaId,
      execucaoId,
      fluxoId,
      noId: no.id,
      numeroDestino,
    });

    return;
  }

  if (no.tipo_no === "enviar_botoes") {
    const mensagem = String(no.configuracao_json?.mensagem || "").trim();
    const botoes = Array.isArray(no.configuracao_json?.botoes)
      ? no.configuracao_json.botoes
      : [];

    if (!mensagem || botoes.length === 0) {
      await registrarLog({
        empresaId,
        execucaoId,
        fluxoId,
        noId: no.id,
        tipoEvento: "erro_no_botoes",
        descricao: "Nó de botões sem mensagem ou sem botões configurados.",
        entrada: no.configuracao_json,
        saida: {},
      });

      await seguirParaProximoNo({
        empresaId,
        conversaId,
        execucaoId,
        fluxoId,
        noAtualId: no.id,
        numeroDestino,
        runtimeCache,
      });

      return;
    }

    await enviarBotoesAutomacao({
      empresaId,
      conversaId,
      numeroDestino,
      mensagem,
      botoes,
      execucaoId,
      noId: no.id,
    });

    await registrarLog({
      empresaId,
      execucaoId,
      fluxoId,
      noId: no.id,
      tipoEvento: "no_executado",
      descricao: "Mensagem com botões enviada pela automação.",
      entrada: no.configuracao_json,
      saida: {
        mensagem,
        botoes,
      },
    });

    await supabaseAdmin
      .from("automacao_execucoes")
      .update({
        no_atual_id: no.id,
        status: "aguardando",
        updated_at: new Date().toISOString(),
      })
      .eq("id", execucaoId)
      .eq("empresa_id", empresaId);

    await agendarTimeoutSemRespostaSeExistir({
      empresaId,
      conversaId,
      execucaoId,
      fluxoId,
      noId: no.id,
      numeroDestino,
    });

    await agendarEncerramentoInatividadeFluxoSeAtivo({
      empresaId,
      conversaId,
      execucaoId,
      fluxoId,
      noId: no.id,
      numeroDestino,
    });

    return;
  }

  if (no.tipo_no === "avaliacao") {
    const mensagem =
      String(no.configuracao_json?.mensagem || "").trim() ||
      "De 1 a 5, como você avalia este atendimento?";

    await enviarMensagemAutomacao({
      empresaId,
      conversaId,
      numeroDestino,
      conteudo: mensagem,
      execucaoId,
      noId: no.id,
    });

    await supabaseAdmin
      .from("automacao_execucoes")
      .update({
        no_atual_id: no.id,
        status: "aguardando",
        updated_at: new Date().toISOString(),
      })
      .eq("id", execucaoId)
      .eq("empresa_id", empresaId);

    await registrarLog({
      empresaId,
      execucaoId,
      fluxoId,
      noId: no.id,
      tipoEvento: "avaliacao_solicitada",
      descricao: "Pergunta de avaliação enviada ao cliente.",
      entrada: no.configuracao_json,
      saida: { mensagem },
    });

      await agendarEncerramentoInatividadeFluxoSeAtivo({
        empresaId,
        conversaId,
        execucaoId,
        fluxoId,
        noId: no.id,
        numeroDestino,
      });

    return;
  }

  if (no.tipo_no === "interpretar_arquivo_ia") {
    const mensagem =
      String(no.configuracao_json?.mensagem || "").trim() ||
      "Envie o arquivo para análise.";

    await enviarMensagemAutomacao({
      empresaId,
      conversaId,
      numeroDestino,
      conteudo: mensagem,
      execucaoId,
      noId: no.id,
    });

    await supabaseAdmin
      .from("automacao_execucoes")
      .update({
        status: "aguardando",
        no_atual_id: no.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", execucaoId)
      .eq("empresa_id", empresaId);

    await registrarLog({
      empresaId,
      execucaoId,
      fluxoId,
      noId: no.id,
      tipoEvento: "aguardando_arquivo_ia",
      descricao: "Automação aguardando arquivo para interpretação com IA.",
      entrada: no.configuracao_json,
      saida: {},
    });

    await agendarEncerramentoInatividadeFluxoSeAtivo({
      empresaId,
      conversaId,
      execucaoId,
      fluxoId,
      noId: no.id,
      numeroDestino,
    });

    return;
  }

  if (no.tipo_no === "capturar_resposta") {
    const mensagem =
      String(no.configuracao_json?.mensagem || "").trim() ||
      "Por favor, envie sua resposta.";

    await enviarMensagemAutomacao({
      empresaId,
      conversaId,
      numeroDestino,
      conteudo: mensagem,
      execucaoId,
      noId: no.id,
    });

    await supabaseAdmin
      .from("automacao_execucoes")
      .update({
        status: "aguardando",
        no_atual_id: no.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", execucaoId)
      .eq("empresa_id", empresaId);

    await registrarLog({
      empresaId,
      execucaoId,
      fluxoId,
      noId: no.id,
      tipoEvento: "aguardando_captura",
      descricao: "Automação aguardando resposta para captura.",
      entrada: no.configuracao_json,
      saida: {},
    });

    await agendarEncerramentoInatividadeFluxoSeAtivo({
      empresaId,
      conversaId,
      execucaoId,
      fluxoId,
      noId: no.id,
      numeroDestino,
    });

    return;
  }

  if (
    no.tipo_no === "enviar_imagem" ||
    no.tipo_no === "enviar_video" ||
    no.tipo_no === "enviar_audio"
  ) {
    const midiaUrl = String(no.configuracao_json?.midia_url || "").trim();
    const legenda = String(no.configuracao_json?.mensagem || "").trim();

    if (!midiaUrl) {
      await registrarLog({
        empresaId,
        execucaoId,
        fluxoId,
        noId: no.id,
        tipoEvento: "erro_no_midia",
        descricao: `Nó ${no.tipo_no} sem URL de mídia configurada.`,
        entrada: no.configuracao_json,
        saida: {},
      });

      await seguirParaProximoNo({
        empresaId,
        conversaId,
        execucaoId,
        fluxoId,
        noAtualId: no.id,
        numeroDestino,
        runtimeCache,
      });

      return;
    }

    const tipoMidia =
      no.tipo_no === "enviar_imagem"
        ? "image"
        : no.tipo_no === "enviar_video"
        ? "video"
        : "audio";

    if (tipoMidia === "audio" && legenda) {
      await enviarMensagemAutomacao({
        empresaId,
        conversaId,
        numeroDestino,
        conteudo: legenda,
        execucaoId,
        noId: no.id,
      });
    }

    await enviarMidiaAutomacao({
      empresaId,
      conversaId,
      numeroDestino,
      tipo: tipoMidia,
      midiaUrl,
      legenda: tipoMidia === "audio" ? "" : legenda,
      execucaoId,
      noId: no.id,
    });

    await aguardar(delayAposMidia(tipoMidia));

    await registrarLog({
      empresaId,
      execucaoId,
      fluxoId,
      noId: no.id,
      tipoEvento: "no_executado",
      descricao:
        no.tipo_no === "enviar_imagem"
          ? "Imagem enviada pela automação."
          : no.tipo_no === "enviar_video"
          ? "Vídeo enviado pela automação."
          : "Áudio enviado pela automação.",
      entrada: no.configuracao_json,
      saida: {
        midia_url: midiaUrl,
        legenda,
        tipo_midia: tipoMidia,
      },
    });

    await seguirParaProximoNo({
      empresaId,
      conversaId,
      execucaoId,
      fluxoId,
      noAtualId: no.id,
      numeroDestino,
      runtimeCache,
    });

    return;
  }

  if (no.tipo_no === "encerrar") {
    const mensagem = String(no.configuracao_json?.mensagem || "").trim();

    if (mensagem) {
      await enviarMensagemAutomacao({
        empresaId,
        conversaId,
        numeroDestino,
        conteudo: mensagem,
        execucaoId,
        noId: no.id,
      });
    }

    await supabaseAdmin
      .from("automacao_execucoes")
      .update({
        status: "finalizado",
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", execucaoId)
      .eq("empresa_id", empresaId);

    await supabaseAdmin
      .from("conversas")
      .update({
        status: "encerrado_aut",
        bot_ativo: false,
        closed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversaId)
      .eq("empresa_id", empresaId)
      .eq("status", "bot");

    await registrarLog({
      empresaId,
      execucaoId,
      fluxoId,
      noId: no.id,
      tipoEvento: "execucao_finalizada",
      descricao: mensagem
        ? "Execução finalizada pelo nó encerrar com mensagem de encerramento."
        : "Execução finalizada pelo nó encerrar sem mensagem de encerramento.",
      entrada: no.configuracao_json,
      saida: {
        mensagem_enviada: !!mensagem,
        mensagem,
      },
    });

    return;
  }

  if (no.tipo_no === "transferir_setor") {
    const mensagem =
      no.configuracao_json?.mensagem ||
      "Vou te encaminhar para um atendente.";

    const protocoloAtivo = await buscarOuCriarProtocoloAutomacao({
      empresaId,
      conversaId,
    });

    await enviarMensagemAutomacao({
      empresaId,
      conversaId,
      numeroDestino,
      conteudo: mensagem,
      execucaoId,
      noId: no.id,
    });

    // 🔥 PARAR automação
    await supabaseAdmin
      .from("automacao_execucoes")
      .update({
        status: "finalizado",
        finished_at: new Date().toISOString(),
      })
      .eq("id", execucaoId);

    // 🔥 definir setor
    if (no.configuracao_json?.setor_id) {
      await supabaseAdmin
        .from("conversas")
        .update({
          setor_id: no.configuracao_json.setor_id,
        })
        .eq("id", conversaId);
    }

    // 🔥 liberar para atendimento humano
    await supabaseAdmin
      .from("conversas")
      .update({
        status: "fila",
        responsavel_id: null,
        bot_ativo: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversaId)
      .eq("empresa_id", empresaId);

    return;
  }

  await registrarLog({
    empresaId,
    execucaoId,
    fluxoId,
    noId: no.id,
    tipoEvento: "tipo_no_nao_implementado",
    descricao: `Tipo de nó ainda não implementado: ${no.tipo_no}`,
    entrada: no.configuracao_json,
    saida: {},
  });
}

async function registrarNotificacaoChegadaNoBloco(params: {
  empresaId: string;
  conversaId: string;
  execucaoId: string;
  fluxoId: string;
  no: AutomacaoNo;
  numeroDestino: string;
}) {
  const { empresaId, conversaId, execucaoId, fluxoId, no, numeroDestino } = params;

  const config = no.configuracao_json || {};

  if (config.notificar_ao_chegar !== true) {
    return;
  }

  const titulo =
    String(config.notificacao_titulo || "").trim() ||
    `Automação chegou no bloco: ${no.titulo}`;

  const mensagem =
    String(config.notificacao_mensagem || "").trim() ||
    `Um contato chegou no bloco "${no.titulo}".`;

  const { data: execucao } = await supabaseAdmin
    .from("automacao_execucoes")
    .select("contato_id, conversa_protocolo_id")
    .eq("id", execucaoId)
    .eq("empresa_id", empresaId)
    .maybeSingle();

  const { data: fluxo } = await supabaseAdmin
    .from("automacao_fluxos")
    .select("nome")
    .eq("id", fluxoId)
    .eq("empresa_id", empresaId)
    .maybeSingle();

  const { data: contato } = execucao?.contato_id
    ? await supabaseAdmin
        .from("contatos")
        .select("nome, telefone")
        .eq("id", execucao.contato_id)
        .eq("empresa_id", empresaId)
        .maybeSingle()
    : { data: null };

  const { error: criarNotificacaoError } = await supabaseAdmin
    .from("notificacoes")
    .insert({
      empresa_id: empresaId,
      conversa_id: conversaId,
      contato_id: execucao?.contato_id || null,
      automacao_execucao_id: execucaoId,
      automacao_fluxo_id: fluxoId,
      automacao_no_id: no.id,
      tipo: "automacao",
      titulo,
      mensagem,
      lida: false,
      metadata_json: {
        tipo_no: no.tipo_no,
        titulo_no: no.titulo,
        notificar_email: config.notificar_email === true,
        conversa_protocolo_id: execucao?.conversa_protocolo_id || null,
      },
    });

  if (criarNotificacaoError) {
    console.error(
      "[AUTOMATION_ENGINE] Erro ao criar notificação:",
      criarNotificacaoError
    );
    return;
  }

  if (config.notificar_email === true) {
  await sendAutomationNotificationEmail({
    empresaId,
    conversaId,
    titulo,
    mensagem,
    fluxoNome: fluxo?.nome || null,
    blocoTitulo: no.titulo || null,
    blocoTipo: no.tipo_no || null,
    contatoNome: contato?.nome || null,
    contatoTelefone: contato?.telefone || numeroDestino || null,
  });
}

  await registrarLog({
    empresaId,
    execucaoId,
    fluxoId,
    noId: no.id,
    tipoEvento: "notificacao_bloco_criada",
    descricao: "Notificação criada ao chegar no bloco.",
    entrada: {
      notificar_ao_chegar: config.notificar_ao_chegar,
      notificacao_titulo: config.notificacao_titulo,
      notificacao_mensagem: config.notificacao_mensagem,
      notificar_email: config.notificar_email,
    },
    saida: {
      titulo,
      mensagem,
    },
  });
}

async function substituirVariaveisMensagem(params: {
  empresaId: string;
  execucaoId?: string | null;
  texto: string;
}) {
  const { empresaId, execucaoId, texto } = params;

  if (!texto || !execucaoId) {
    return texto;
  }

  const regex = /{{\s*([^}]+)\s*}}/g;
  const matches = [...texto.matchAll(regex)];

  if (matches.length === 0) {
    return texto;
  }

  const chaves = Array.from(
    new Set(matches.map((match) => match[1].trim().toLowerCase()))
  );

  const { data: variaveis, error } = await supabaseAdmin
    .from("automacao_variaveis")
    .select("chave, valor")
    .eq("empresa_id", empresaId)
    .eq("execucao_id", execucaoId)
    .in("chave", chaves);

  if (error) {
    console.error("[AUTOMATION_ENGINE] Erro ao buscar variáveis:", error);
    return texto;
  }

  const mapaVariaveis = new Map<string, string>();

  for (const variavel of variaveis || []) {
    mapaVariaveis.set(
      String(variavel.chave || "").toLowerCase(),
      String(variavel.valor || "")
    );
  }

  return texto.replace(regex, (_, chaveOriginal) => {
    const chave = String(chaveOriginal).trim().toLowerCase();

    return mapaVariaveis.get(chave) || `{{${chave}}}`;
  });
}

async function registrarCapturaRespostaAutomacao(params: {
  empresaId: string;
  conversaId: string;
  execucao: any;
  no: any;
  mensagemTexto: string;
  numeroDestino: string;
}) {
  const { empresaId, conversaId, execucao, no, mensagemTexto, numeroDestino } =
    params;

  const config = no.configuracao_json || {};
  const tipoCaptura = String(config.tipo_captura || "texto");
  const chave = String(config.variavel || "resposta").trim().toLowerCase();
  const maxTentativas = Math.max(1, Number(config.max_tentativas_invalidas || 3));
  const mensagemErro =
    String(config.mensagem_erro || "").trim() ||
    "Não consegui identificar essa informação. Por favor, envie novamente.";

  const validacao = validarCaptura(tipoCaptura, mensagemTexto);

  const metadataAtual = execucao.metadata_json || {};
  const tentativas = metadataAtual.tentativas_captura || {};
  const tentativasDoNo = Number(tentativas[no.id] || 0);

  if (!validacao.valido) {
    const novasTentativas = tentativasDoNo + 1;

    await supabaseAdmin
      .from("automacao_execucoes")
      .update({
        status: "aguardando",
        metadata_json: {
          ...metadataAtual,
          tentativas_captura: {
            ...tentativas,
            [no.id]: novasTentativas,
          },
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", execucao.id)
      .eq("empresa_id", empresaId);

    if (novasTentativas >= maxTentativas) {
      await registrarLog({
        empresaId,
        execucaoId: execucao.id,
        fluxoId: execucao.fluxo_id,
        noId: no.id,
        tipoEvento: "captura_tentativas_excedidas",
        descricao: "Cliente excedeu o limite de tentativas da captura.",
        entrada: {
          tipo_captura: tipoCaptura,
          mensagemTexto,
          tentativas: novasTentativas,
        },
        saida: {},
      });

      return {
        ok: true,
        valido: false,
        excedeuTentativas: true,
      };
    }

    await enviarMensagemAutomacao({
      empresaId,
      conversaId,
      numeroDestino,
      conteudo: mensagemErro,
      execucaoId: execucao.id,
      noId: no.id,
    });

    return {
      ok: true,
      valido: false,
      excedeuTentativas: false,
    };
  }

  const { error: variavelError } = await supabaseAdmin
    .from("automacao_variaveis")
    .upsert(
      {
        empresa_id: empresaId,
        execucao_id: execucao.id,
        contato_id: execucao.contato_id,
        chave,
        valor: validacao.valorLimpo,
        metadata_json: {
          tipo_captura: tipoCaptura,
          valor_original: mensagemTexto,
          valor_formatado: validacao.valorFormatado,
        },
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "empresa_id,execucao_id,chave",
      }
    );

  if (variavelError) {
    console.error("[AUTOMATION_ENGINE] Erro ao salvar variável:", variavelError);

    return {
      ok: false,
      valido: false,
      excedeuTentativas: false,
      error: "Erro ao salvar variável da automação.",
    };
  }

  await supabaseAdmin
    .from("automacao_execucoes")
    .update({
      metadata_json: {
        ...metadataAtual,
        tentativas_captura: {
          ...tentativas,
          [no.id]: 0,
        },
        variaveis: {
          ...(metadataAtual.variaveis || {}),
          [chave]: validacao.valorLimpo,
        },
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", execucao.id)
    .eq("empresa_id", empresaId);

  await registrarLog({
    empresaId,
    execucaoId: execucao.id,
    fluxoId: execucao.fluxo_id,
    noId: no.id,
    tipoEvento: "captura_registrada",
    descricao: `Resposta capturada na variável ${chave}.`,
    entrada: {
      tipo_captura: tipoCaptura,
      mensagemTexto,
    },
    saida: {
      chave,
      valor: validacao.valorLimpo,
      valor_formatado: validacao.valorFormatado,
    },
  });

  return {
    ok: true,
    valido: true,
    excedeuTentativas: false,
  };
}

function extrairIndiceOpcaoAgenda(mensagemTexto: string) {
  const texto = String(mensagemTexto || "").trim();
  const match = texto.match(/\d+/);

  if (!match) return null;

  const indice = Number(match[0]);

  return Number.isFinite(indice) && indice > 0 ? indice : null;
}

function substituirVariaveisAgenda(
  texto: string,
  valores: Record<string, string>
) {
  return String(texto || "").replace(/\{\{\s*([^}]+)\s*\}\}/g, (match, chaveRaw) => {
    const chave = String(chaveRaw || "").trim().toLowerCase();

    return valores[chave] ?? match;
  });
}

function formatarDataAgenda(data: string, timezone = "America/Sao_Paulo") {
  const [ano, mes, dia] = String(data || "").split("-").map(Number);

  if (!ano || !mes || !dia) return data;

  const dataUtcMeioDia = new Date(Date.UTC(ano, mes - 1, dia, 12, 0, 0));
  const diaSemana = new Intl.DateTimeFormat("pt-BR", {
    timeZone: timezone,
    weekday: "long",
  })
    .format(dataUtcMeioDia)
    .replace("-feira", "");

  const dataCurta = `${String(dia).padStart(2, "0")}/${String(mes).padStart(2, "0")}`;

  return `${diaSemana}, ${dataCurta}`;
}

function formatarMinutosAgenda(minutos: number | null | undefined) {
  if (minutos == null || !Number.isFinite(Number(minutos))) return "";

  const hora = Math.floor(Number(minutos) / 60);
  const minuto = Number(minutos) % 60;

  return `${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}`;
}

function descreverPreferenciaAgenda(
  preferencia: PreferenciaHorarioAgenda | null | undefined
) {
  if (!preferencia) return "";

  if (preferencia.tipo === "periodo" && preferencia.periodo) {
    return `no periodo da ${preferencia.periodo}`;
  }

  if (preferencia.tipo === "a_partir_de") {
    return `a partir das ${formatarMinutosAgenda(preferencia.hora_minutos)}`;
  }

  if (preferencia.tipo === "antes_de") {
    return `antes das ${formatarMinutosAgenda(preferencia.hora_minutos)}`;
  }

  if (preferencia.tipo === "por_volta") {
    return `por volta das ${formatarMinutosAgenda(preferencia.hora_minutos)}`;
  }

  if (preferencia.tipo === "exato") {
    return `para as ${formatarMinutosAgenda(preferencia.hora_minutos)}`;
  }

  return "";
}

function ordenarSlotsAlternativosAgenda(
  slots: any[],
  preferencia: PreferenciaHorarioAgenda | null | undefined,
  timezone: string
) {
  if (preferencia?.hora_minutos == null) return slots;

  return filtrarSlotsPorPreferencia(
    slots,
    {
      tipo: "por_volta",
      hora_minutos: preferencia.hora_minutos,
    },
    timezone
  );
}

function normalizarSlotsAgenda(slots: any[]) {
  return slots.map((slot, index) => ({
    ...slot,
    indice: index + 1,
  }));
}

async function obterContatoAutomacao(empresaId: string, execucao: any) {
  if (!execucao?.contato_id) return null;

  const { data } = await supabaseAdmin
    .from("contatos")
    .select("id, nome, telefone, email")
    .eq("id", execucao.contato_id)
    .eq("empresa_id", empresaId)
    .maybeSingle();

  return data || null;
}

async function obterAgendaAutomacao(empresaId: string, agendaId: string) {
  if (!agendaId) return null;

  const { data } = await supabaseAdmin
    .from("agenda_calendarios")
    .select("id, nome, timezone")
    .eq("id", agendaId)
    .eq("empresa_id", empresaId)
    .maybeSingle();

  return data || null;
}

async function salvarVariaveisAutomacao(params: {
  empresaId: string;
  execucao: any;
  valores: Record<string, string>;
  origem: string;
  metadata?: Record<string, any>;
}) {
  const { empresaId, execucao, valores, origem, metadata = {} } = params;
  const chaves = Object.keys(valores);

  if (!chaves.length) return;

  await supabaseAdmin
    .from("automacao_variaveis")
    .delete()
    .eq("empresa_id", empresaId)
    .eq("execucao_id", execucao.id)
    .in("chave", chaves);

  await supabaseAdmin.from("automacao_variaveis").insert(
    Object.entries(valores).map(([chave, valor]) => ({
      empresa_id: empresaId,
      execucao_id: execucao.id,
      contato_id: execucao.contato_id || null,
      chave,
      valor,
      metadata_json: {
        origem,
        ...metadata,
      },
      updated_at: new Date().toISOString(),
    }))
  );
}

function valoresSlotAgenda(slot: any, agenda: any | null, sufixo = "_nova") {
  return {
    [`agenda_data${sufixo}`]: String(slot.data_label || ""),
    [`agenda_hora${sufixo}`]: String(slot.hora_label || ""),
    [`agenda_inicio_at${sufixo}`]: String(slot.inicio_at || ""),
    [`agenda_fim_at${sufixo}`]: String(slot.fim_at || ""),
    [`agenda_label${sufixo}`]: String(slot.label || ""),
    [`agenda_nome${sufixo}`]: String(agenda?.nome || ""),
  };
}

function valoresAgendamentoAgenda(agendamento: any, agenda: any | null) {
  const labels = formatarSlotAgenda(
    String(agendamento.inicio_at || ""),
    String(agendamento.fim_at || ""),
    agenda?.timezone || "America/Sao_Paulo"
  );

  return {
    agenda_agendamento_id: String(agendamento.id || ""),
    agenda_nome: String(agenda?.nome || agendamento.titulo || ""),
    agenda_data: labels.data_label,
    agenda_hora: labels.hora_label,
    agenda_inicio_at: String(agendamento.inicio_at || ""),
    agenda_fim_at: String(agendamento.fim_at || ""),
    agenda_label: labels.label,
    agenda_status: String(agendamento.status || ""),
  };
}

async function montarOpcoesAgendamentosAgenda(
  empresaId: string,
  agendamentos: any[]
) {
  const cacheAgendas = new Map<string, any | null>();
  const opcoes = [];

  for (const [index, agendamento] of agendamentos.entries()) {
    const agendaId = String(agendamento.agenda_id || "");

    if (!cacheAgendas.has(agendaId)) {
      cacheAgendas.set(agendaId, await obterAgendaAutomacao(empresaId, agendaId));
    }

    const agenda = cacheAgendas.get(agendaId) || null;
    const valores = valoresAgendamentoAgenda(agendamento, agenda);

    opcoes.push({
      indice: index + 1,
      id: agendamento.id,
      agenda_id: agendamento.agenda_id,
      titulo: agendamento.titulo,
      status: agendamento.status,
      inicio_at: agendamento.inicio_at,
      fim_at: agendamento.fim_at,
      agenda_nome: valores.agenda_nome,
      data_label: valores.agenda_data,
      hora_label: valores.agenda_hora,
      label: `${valores.agenda_data} as ${valores.agenda_hora}${
        valores.agenda_nome ? ` - ${valores.agenda_nome}` : ""
      }`,
    });
  }

  return opcoes;
}

async function salvarEstadoExecucaoAgenda(params: {
  empresaId: string;
  execucaoId: string;
  metadataAtual: Record<string, any>;
  patch: Record<string, any>;
  status?: string;
  noAtualId?: string | null;
}) {
  const update: Record<string, any> = {
    metadata_json: {
      ...params.metadataAtual,
      ...params.patch,
    },
    updated_at: new Date().toISOString(),
  };

  if (params.status) update.status = params.status;
  if (params.noAtualId !== undefined) update.no_atual_id = params.noAtualId;

  await supabaseAdmin
    .from("automacao_execucoes")
    .update(update)
    .eq("id", params.execucaoId)
    .eq("empresa_id", params.empresaId);
}

async function enviarOpcoesEscolhaHorarioAgenda(params: {
  empresaId: string;
  conversaId: string;
  execucao: any;
  no: any;
  numeroDestino: string;
  mensagemTexto: string;
  dataForcada?: string | null;
  mensagemInicial?: string | null;
}) {
  const {
    empresaId,
    conversaId,
    execucao,
    no,
    numeroDestino,
    mensagemTexto,
    dataForcada = null,
    mensagemInicial = null,
  } = params;

  const config = no.configuracao_json || {};
  const agendaId = String(config.agenda_id || "").trim();
  const metadataAtual = execucao.metadata_json || {};
  const agendaEstado = metadataAtual.agenda_estado || {};

  if (!agendaId) {
    await registrarLog({
      empresaId,
      execucaoId: execucao.id,
      fluxoId: execucao.fluxo_id,
      noId: no.id,
      tipoEvento: "agenda_erro_configuracao",
      descricao: "Bloco de escolha de horario sem agenda configurada.",
      entrada: config,
      saida: {},
    });

    return { ok: false, aguardando: false, error: "Bloco sem agenda configurada." };
  }

  const agenda = await obterAgendaAutomacao(empresaId, agendaId);
  const interpretacao = interpretarDataHorarioAgenda(
    mensagemTexto,
    agenda?.timezone || "America/Sao_Paulo"
  );
  const dataEscolhida = dataForcada || interpretacao.data;

  if (!dataForcada && interpretacao.data_invalida_motivo) {
    const mensagemDataInvalida = substituirVariaveisAgenda(
      String(config.mensagem_data_invalida || "").trim() ||
        "Essa data ja passou. Para evitar confusao, me envie uma data futura. Se quiser marcar para outro ano, informe o ano completo, por exemplo {{agenda_data_sugestao_ano}}.",
      {
        agenda_data_informada: interpretacao.data_informada || "",
        agenda_data_sugestao_ano: interpretacao.data_sugestao_ano || "",
        agenda_nome_nova: agenda?.nome || "",
      }
    );

    await enviarMensagemAutomacao({
      empresaId,
      conversaId,
      numeroDestino,
      conteudo: mensagemDataInvalida,
      execucaoId: execucao.id,
      noId: no.id,
    });

    await salvarEstadoExecucaoAgenda({
      empresaId,
      execucaoId: execucao.id,
      metadataAtual,
      status: "aguardando",
      noAtualId: no.id,
      patch: {
        agenda_estado: {
          ...agendaEstado,
          [no.id]: {
            etapa: "aguardando_data",
            agenda_id: agendaId,
            data_invalida_motivo: interpretacao.data_invalida_motivo,
            data_informada: interpretacao.data_informada,
          },
        },
      },
    });

    await agendarTimeoutSemRespostaSeExistir({
      empresaId,
      conversaId,
      execucaoId: execucao.id,
      fluxoId: execucao.fluxo_id,
      noId: no.id,
      numeroDestino,
    });
    
    await agendarEncerramentoInatividadeFluxoSeAtivo({
      empresaId,
      conversaId,
      execucaoId: execucao.id,
      fluxoId: execucao.fluxo_id,
      noId: no.id,
      numeroDestino,
    });

    return { ok: true, aguardando: true };
  }

  if (!dataEscolhida) {
    const mensagemPedirData =
      String(config.mensagem || "").trim() ||
      "Qual dia voce quer marcar? Pode responder: hoje, amanha, dia 22, 22/05 ou sexta-feira.";

    await enviarMensagemAutomacao({
      empresaId,
      conversaId,
      numeroDestino,
      conteudo: mensagemPedirData,
      execucaoId: execucao.id,
      noId: no.id,
    });

    await salvarEstadoExecucaoAgenda({
      empresaId,
      execucaoId: execucao.id,
      metadataAtual,
      status: "aguardando",
      noAtualId: no.id,
      patch: {
        agenda_estado: {
          ...agendaEstado,
          [no.id]: {
            etapa: "aguardando_data",
            agenda_id: agendaId,
          },
        },
      },
    });

    await agendarTimeoutSemRespostaSeExistir({
      empresaId,
      conversaId,
      execucaoId: execucao.id,
      fluxoId: execucao.fluxo_id,
      noId: no.id,
      numeroDestino,
    });

    await agendarEncerramentoInatividadeFluxoSeAtivo({
      empresaId,
      conversaId,
      execucaoId: execucao.id,
      fluxoId: execucao.fluxo_id,
      noId: no.id,
      numeroDestino,
    });


    return { ok: true, aguardando: true };
  }

  const resultadoSlots = await listarSlotsDisponiveis({
    supabase: supabaseAdmin,
    empresaId,
    agendaId,
    data: dataEscolhida,
    janelaDias: 1,
    limite: 50,
  });

  const limite = Math.max(1, Math.min(10, Number(config.quantidade_opcoes || 6)));
  const timezone =
    resultadoSlots.agenda?.timezone || agenda?.timezone || "America/Sao_Paulo";
  const slotsFiltrados = filtrarSlotsPorPreferencia(
    resultadoSlots.slots,
    interpretacao.preferencia,
    timezone
  );
  const preferenciaNaoAtendida =
    Boolean(interpretacao.preferencia) &&
    resultadoSlots.slots.length > 0 &&
    slotsFiltrados.length === 0;
  const slotsParaEnviar = preferenciaNaoAtendida
    ? ordenarSlotsAlternativosAgenda(
        resultadoSlots.slots,
        interpretacao.preferencia,
        timezone
      )
    : slotsFiltrados;
  const slots = normalizarSlotsAgenda(slotsParaEnviar.slice(0, limite));
  const dataLabel =
    slots[0]?.data_label || formatarDataAgenda(dataEscolhida, timezone);
  const horaSolicitada = formatarMinutosAgenda(
    interpretacao.preferencia?.hora_minutos
  );
  const preferenciaSolicitada = descreverPreferenciaAgenda(
    interpretacao.preferencia
  );

  if (!slots.length) {
    const semExpedienteNoDia =
      dataEscolhida &&
      resultadoSlots.dias_sem_disponibilidade?.includes(dataEscolhida);
    const mensagemPadrao =
      semExpedienteNoDia
        ? "Nao temos atendimento em {{agenda_data_nova}}. Me diga outro dia para eu verificar os horarios disponiveis."
        : interpretacao.preferencia?.hora_minutos != null
        ? "O horario das {{agenda_hora_solicitada}} nao esta livre em {{agenda_data_nova}} e nao encontrei outros horarios nesse dia. Me diga outro dia ou horario."
        : "Nao encontrei horarios livres para {{agenda_data_nova}}. Me diga outro dia ou horario.";
    const mensagemBaseSemHorarios =
      semExpedienteNoDia
        ? String(config.mensagem_sem_expediente || "").trim() || mensagemPadrao
        : interpretacao.preferencia?.hora_minutos != null
        ? mensagemPadrao
        : String(config.mensagem_sem_horarios || "").trim() || mensagemPadrao;
    const mensagemSemHorarios = substituirVariaveisAgenda(
      mensagemBaseSemHorarios,
      {
        agenda_data_nova: dataLabel,
        agenda_nome_nova: agenda?.nome || "",
        agenda_hora_solicitada: horaSolicitada,
        agenda_preferencia_solicitada: preferenciaSolicitada,
      }
    );

    await enviarMensagemAutomacao({
      empresaId,
      conversaId,
      numeroDestino,
      conteudo: mensagemSemHorarios,
      execucaoId: execucao.id,
      noId: no.id,
    });

    await salvarEstadoExecucaoAgenda({
      empresaId,
      execucaoId: execucao.id,
      metadataAtual,
      status: "aguardando",
      noAtualId: no.id,
      patch: {
        agenda_estado: {
          ...agendaEstado,
          [no.id]: {
            etapa: "aguardando_data",
            agenda_id: agendaId,
            data_escolhida: dataEscolhida,
            preferencia_horario: interpretacao.preferencia,
          },
        },
      },
    });

    await agendarTimeoutSemRespostaSeExistir({
      empresaId,
      conversaId,
      execucaoId: execucao.id,
      fluxoId: execucao.fluxo_id,
      noId: no.id,
      numeroDestino,
    });

    await agendarEncerramentoInatividadeFluxoSeAtivo({
      empresaId,
      conversaId,
      execucaoId: execucao.id,
      fluxoId: execucao.fluxo_id,
      noId: no.id,
      numeroDestino,
    });

    return { ok: true, aguardando: true };
  }

  const mensagemPreferenciaIndisponivel =
    preferenciaNaoAtendida
      ? substituirVariaveisAgenda(
          String(config.mensagem_preferencia_indisponivel || "").trim() ||
            "Nao tenho horario {{agenda_preferencia_solicitada}} livre em {{agenda_data_nova}}. Tenho estas alternativas:",
          {
            agenda_data_nova: dataLabel,
            agenda_nome_nova: agenda?.nome || "",
            agenda_hora_solicitada: horaSolicitada,
            agenda_preferencia_solicitada: preferenciaSolicitada,
          }
        )
      : "";
  const mensagemListar = substituirVariaveisAgenda(
    mensagemPreferenciaIndisponivel ||
      String(mensagemInicial || config.mensagem_listar_horarios || "").trim() ||
      "Para {{agenda_data_nova}} tenho estes horarios. Responda com o numero do horario ou me diga outro dia:",
    {
      agenda_data_nova: dataLabel,
      agenda_nome_nova: agenda?.nome || "",
      agenda_hora_solicitada: horaSolicitada,
      agenda_preferencia_solicitada: preferenciaSolicitada,
    }
  );

  const mensagemOpcoes = [
    mensagemListar,
    "",
    ...slots.map((slot) => `${slot.indice}. ${slot.hora_label}`),
  ].join("\n");

  await enviarMensagemAutomacao({
    empresaId,
    conversaId,
    numeroDestino,
    conteudo: mensagemOpcoes,
    execucaoId: execucao.id,
    noId: no.id,
  });

  const agendaOpcoes = metadataAtual.agenda_opcoes || {};

  await salvarEstadoExecucaoAgenda({
    empresaId,
    execucaoId: execucao.id,
    metadataAtual,
    status: "aguardando",
    noAtualId: no.id,
    patch: {
      agenda_opcoes: {
        ...agendaOpcoes,
        [no.id]: slots.map((slot) => ({
          indice: slot.indice,
          inicio_at: slot.inicio_at,
          fim_at: slot.fim_at,
          label: slot.label,
          data_label: slot.data_label,
          hora_label: slot.hora_label,
          agenda_id: agendaId,
        })),
      },
      agenda_estado: {
        ...agendaEstado,
        [no.id]: {
          etapa: "aguardando_horario",
          agenda_id: agendaId,
          data_escolhida: dataEscolhida,
          preferencia_horario: interpretacao.preferencia,
        },
      },
    },
  });

  await agendarTimeoutSemRespostaSeExistir({
    empresaId,
    conversaId,
    execucaoId: execucao.id,
    fluxoId: execucao.fluxo_id,
    noId: no.id,
    numeroDestino,
  });

  await agendarEncerramentoInatividadeFluxoSeAtivo({
    empresaId,
    conversaId,
    execucaoId: execucao.id,
    fluxoId: execucao.fluxo_id,
    noId: no.id,
    numeroDestino,
  });

  await registrarLog({
    empresaId,
    execucaoId: execucao.id,
    fluxoId: execucao.fluxo_id,
    noId: no.id,
    tipoEvento: "agenda_horarios_oferecidos",
    descricao: "Horarios filtrados por data enviados ao cliente.",
    entrada: {
      mensagemTexto,
      data_escolhida: dataEscolhida,
      preferencia_horario: interpretacao.preferencia,
    },
    saida: {
      agenda_id: agendaId,
      total_opcoes: slots.length,
      opcoes: slots,
    },
  });

  return { ok: true, aguardando: true };
}

async function registrarEscolhaSlotAgendaAutomacao(params: {
  empresaId: string;
  conversaId: string;
  execucao: any;
  no: any;
  mensagemTexto: string;
  numeroDestino: string;
}) {
  const { empresaId, conversaId, execucao, no, mensagemTexto, numeroDestino } =
    params;

  const config = no.configuracao_json || {};
  const metadataAtual = execucao.metadata_json || {};
  const agendaOpcoes = metadataAtual.agenda_opcoes || {};
  const opcoes = Array.isArray(agendaOpcoes[no.id]) ? agendaOpcoes[no.id] : [];
  const indiceEscolhido = extrairIndiceOpcaoAgenda(mensagemTexto);
  const opcaoEscolhida = opcoes.find(
    (opcao: any) => Number(opcao.indice) === indiceEscolhido
  );

  if (opcaoEscolhida) {
    const agendaId = String(opcaoEscolhida.agenda_id || config.agenda_id || "");
    const agenda = await obterAgendaAutomacao(empresaId, agendaId);
    const inicioAt = String(opcaoEscolhida.inicio_at || "");
    const fimAt = String(opcaoEscolhida.fim_at || "");

    const conflito = await existeConflitoAgenda({
      supabase: supabaseAdmin,
      empresaId,
      agendaId,
      inicioAt,
      fimAt,
    });

    if (conflito) {
      await enviarOpcoesEscolhaHorarioAgenda({
        empresaId,
        conversaId,
        execucao,
        no,
        numeroDestino,
        mensagemTexto,
        dataForcada:
          metadataAtual.agenda_estado?.[no.id]?.data_escolhida ||
          opcaoEscolhida.inicio_at?.slice(0, 10),
        mensagemInicial:
          "Esse horario acabou de ficar indisponivel. Escolha uma das novas opcoes:",
      });

      return {
        ok: true,
        valido: false,
        aguardando: true,
        excedeuTentativas: false,
      };
    }

    const valoresSlot = valoresSlotAgenda(opcaoEscolhida, agenda, "_nova");

    await salvarVariaveisAutomacao({
      empresaId,
      execucao,
      valores: valoresSlot,
      origem: "agenda_escolher_horario",
      metadata: {
        agenda_id: agendaId,
      },
    });

    const proximasOpcoes = {
      ...(metadataAtual.agenda_opcoes || {}),
      [no.id]: [],
    };

    await salvarEstadoExecucaoAgenda({
      empresaId,
      execucaoId: execucao.id,
      metadataAtual,
      patch: {
        agenda_opcoes: proximasOpcoes,
        agenda_slot_escolhido: {
          ...opcaoEscolhida,
          agenda_id: agendaId,
        },
        variaveis: {
          ...(metadataAtual.variaveis || {}),
          ...valoresSlot,
        },
      },
    });

    await registrarLog({
      empresaId,
      execucaoId: execucao.id,
      fluxoId: execucao.fluxo_id,
      noId: no.id,
      tipoEvento: "agenda_slot_escolhido",
      descricao: "Cliente escolheu um horario disponivel.",
      entrada: {
        mensagemTexto,
      },
      saida: {
        agenda_id: agendaId,
        slot: opcaoEscolhida,
      },
    });

    return {
      ok: true,
      valido: true,
      aguardando: false,
      excedeuTentativas: false,
    };
  }

  const agendaIdConfigurada = String(
    config.agenda_id || metadataAtual.agenda_estado?.[no.id]?.agenda_id || ""
  ).trim();
  const agendaConfigurada = await obterAgendaAutomacao(
    empresaId,
    agendaIdConfigurada
  );
  const interpretacao = interpretarDataHorarioAgenda(
    mensagemTexto,
    agendaConfigurada?.timezone || "America/Sao_Paulo"
  );

  if (interpretacao.data_invalida_motivo) {
    const agendaEstado = metadataAtual.agenda_estado || {};
    const mensagemDataInvalida = substituirVariaveisAgenda(
      String(config.mensagem_data_invalida || "").trim() ||
        "Essa data ja passou. Para evitar confusao, me envie uma data futura. Se quiser marcar para outro ano, informe o ano completo, por exemplo {{agenda_data_sugestao_ano}}.",
      {
        agenda_data_informada: interpretacao.data_informada || "",
        agenda_data_sugestao_ano: interpretacao.data_sugestao_ano || "",
        agenda_nome_nova: agendaConfigurada?.nome || "",
      }
    );

    await enviarMensagemAutomacao({
      empresaId,
      conversaId,
      numeroDestino,
      conteudo: mensagemDataInvalida,
      execucaoId: execucao.id,
      noId: no.id,
    });

    await salvarEstadoExecucaoAgenda({
      empresaId,
      execucaoId: execucao.id,
      metadataAtual,
      status: "aguardando",
      noAtualId: no.id,
      patch: {
        agenda_estado: {
          ...agendaEstado,
          [no.id]: {
            etapa: "aguardando_data",
            agenda_id: agendaIdConfigurada,
            data_invalida_motivo: interpretacao.data_invalida_motivo,
            data_informada: interpretacao.data_informada,
          },
        },
      },
    });

    await registrarLog({
      empresaId,
      execucaoId: execucao.id,
      fluxoId: execucao.fluxo_id,
      noId: no.id,
      tipoEvento: "agenda_data_invalida",
      descricao: "Cliente informou uma data passada durante a escolha de horario.",
      entrada: {
        mensagemTexto,
      },
      saida: {
        motivo: interpretacao.data_invalida_motivo,
        data_informada: interpretacao.data_informada,
      },
    });

    await agendarEncerramentoInatividadeFluxoSeAtivo({
      empresaId,
      conversaId,
      execucaoId: execucao.id,
      fluxoId: execucao.fluxo_id,
      noId: no.id,
      numeroDestino,
    });

    return {
      ok: true,
      valido: false,
      aguardando: true,
      excedeuTentativas: false,
    };
  }

  if (interpretacao.data) {
    await enviarOpcoesEscolhaHorarioAgenda({
      empresaId,
      conversaId,
      execucao,
      no,
      numeroDestino,
      mensagemTexto,
      dataForcada: interpretacao.data,
    });

    return {
      ok: true,
      valido: false,
      aguardando: true,
      excedeuTentativas: false,
    };
  }

  const tentativa = await registrarTentativaBloco({
    empresaId,
    execucao,
    no,
    tipo: "resposta_invalida",
  });

  if (tentativa.excedeu) {
    await registrarLog({
      empresaId,
      execucaoId: execucao.id,
      fluxoId: execucao.fluxo_id,
      noId: no.id,
      tipoEvento: "agenda_tentativas_excedidas",
      descricao: "Cliente excedeu tentativas ao escolher horario da agenda.",
      entrada: {
        mensagemTexto,
      },
      saida: {},
    });

    return {
      ok: true,
      valido: false,
      aguardando: false,
      excedeuTentativas: true,
    };
  }

  await enviarMensagemAutomacao({
    empresaId,
    conversaId,
    numeroDestino,
    conteudo:
      String(config.mensagem_opcao_invalida || "").trim() ||
      "Nao encontrei essa opcao. Responda com o numero do horario ou me diga outro dia.",
    execucaoId: execucao.id,
    noId: no.id,
  });

  await agendarEncerramentoInatividadeFluxoSeAtivo({
    empresaId,
    conversaId,
    execucaoId: execucao.id,
    fluxoId: execucao.fluxo_id,
    noId: no.id,
    numeroDestino,
  });

  return {
    ok: true,
    valido: false,
    aguardando: true,
    excedeuTentativas: false,
  };
}

async function registrarEscolhaAgendamentoAgendaAutomacao(params: {
  empresaId: string;
  conversaId: string;
  execucao: any;
  no: any;
  mensagemTexto: string;
  numeroDestino: string;
}) {
  const { empresaId, conversaId, execucao, no, mensagemTexto, numeroDestino } =
    params;

  const config = no.configuracao_json || {};
  const metadataAtual = execucao.metadata_json || {};
  const opcoesPorNo = metadataAtual.agenda_agendamentos_opcoes || {};
  const opcoes = Array.isArray(opcoesPorNo[no.id]) ? opcoesPorNo[no.id] : [];
  const indiceEscolhido = extrairIndiceOpcaoAgenda(mensagemTexto);
  const opcaoEscolhida = opcoes.find(
    (opcao: any) => Number(opcao.indice) === indiceEscolhido
  );

  if (opcaoEscolhida) {
    const agenda = await obterAgendaAutomacao(
      empresaId,
      String(opcaoEscolhida.agenda_id || "")
    );
    const valores = valoresAgendamentoAgenda(opcaoEscolhida, agenda);
    const proximasOpcoes = {
      ...opcoesPorNo,
      [no.id]: [],
    };

    await salvarVariaveisAutomacao({
      empresaId,
      execucao,
      valores: {
        ...valores,
        agenda_encontrado: "true",
      },
      origem: "agenda_buscar_agendamento",
      metadata: {
        agendamento_id: opcaoEscolhida.id,
      },
    });

    await salvarEstadoExecucaoAgenda({
      empresaId,
      execucaoId: execucao.id,
      metadataAtual,
      patch: {
        agenda_agendamentos_opcoes: proximasOpcoes,
        agenda_agendamento_id: opcaoEscolhida.id,
        agenda_status: opcaoEscolhida.status || "",
        variaveis: {
          ...(metadataAtual.variaveis || {}),
          ...valores,
          agenda_encontrado: "true",
        },
      },
    });

    await registrarLog({
      empresaId,
      execucaoId: execucao.id,
      fluxoId: execucao.fluxo_id,
      noId: no.id,
      tipoEvento: "agenda_agendamento_selecionado",
      descricao: "Cliente escolheu qual agendamento deseja seguir no fluxo.",
      entrada: {
        mensagemTexto,
      },
      saida: {
        agendamento_id: opcaoEscolhida.id,
        agenda_id: opcaoEscolhida.agenda_id,
      },
    });

    return {
      ok: true,
      valido: true,
      aguardando: false,
      excedeuTentativas: false,
    };
  }

  const tentativa = await registrarTentativaBloco({
    empresaId,
    execucao,
    no,
    tipo: "resposta_invalida",
  });

  if (tentativa.excedeu) {
    await registrarLog({
      empresaId,
      execucaoId: execucao.id,
      fluxoId: execucao.fluxo_id,
      noId: no.id,
      tipoEvento: "agenda_agendamento_escolha_tentativas_excedidas",
      descricao: "Cliente excedeu tentativas ao escolher agendamento.",
      entrada: {
        mensagemTexto,
      },
      saida: {},
    });

    return {
      ok: true,
      valido: false,
      aguardando: false,
      excedeuTentativas: true,
    };
  }

  await enviarMensagemAutomacao({
    empresaId,
    conversaId,
    numeroDestino,
    conteudo:
      String(config.mensagem_opcao_invalida || "").trim() ||
      "Nao encontrei essa opcao. Responda com o numero do agendamento.",
    execucaoId: execucao.id,
    noId: no.id,
  });

  await agendarEncerramentoInatividadeFluxoSeAtivo({
    empresaId,
    conversaId,
    execucaoId: execucao.id,
    fluxoId: execucao.fluxo_id,
    noId: no.id,
    numeroDestino,
  });

  return {
    ok: true,
    valido: false,
    aguardando: true,
    excedeuTentativas: false,
  };
}

async function buscarAgendamentoAutomacao(params: {
  empresaId: string;
  conversaId: string;
  execucaoId: string;
  fluxoId: string;
  no: any;
  numeroDestino: string;
  runtimeCache?: FluxoRuntimeCache;
}) {
  const { empresaId, conversaId, execucaoId, fluxoId, no, numeroDestino, runtimeCache,} =
    params;
  const config = no.configuracao_json || {};
  const agendaId = String(config.agenda_id || "").trim();
  const statusBusca = Array.isArray(config.status_busca)
    ? config.status_busca
    : ["agendado", "confirmado"];
  const listarParaEscolha = config.listar_para_escolha === true;
  const quantidadeOpcoes = Math.max(
    1,
    Math.min(10, Number(config.quantidade_opcoes || 6))
  );

  const { data: execucao } = await supabaseAdmin
    .from("automacao_execucoes")
    .select("*")
    .eq("id", execucaoId)
    .eq("empresa_id", empresaId)
    .maybeSingle();

  let query = supabaseAdmin
    .from("agenda_agendamentos")
    .select("*")
    .eq("empresa_id", empresaId)
    .in("status", statusBusca)
    .gte("inicio_at", new Date().toISOString())
    .order("inicio_at", { ascending: true })
    .limit(listarParaEscolha ? quantidadeOpcoes : 1);

  if (agendaId) {
    query = query.eq("agenda_id", agendaId);
  }

  if (execucao?.contato_id) {
    query = query.eq("contato_id", execucao.contato_id);
  } else {
    query = query.eq("telefone_cliente", numeroDestino);
  }

  const { data, error } = await query;

  if (error) {
    await registrarLog({
      empresaId,
      execucaoId,
      fluxoId,
      noId: no.id,
      tipoEvento: "agenda_busca_erro",
      descricao: "Erro ao buscar agendamento do contato.",
      entrada: config,
      saida: {
        erro: error.message,
      },
    });

    await seguirParaProximoNo({
      empresaId,
      conversaId,
      execucaoId,
      fluxoId,
      noAtualId: no.id,
      mensagemTexto: "erro",
      numeroDestino,
      runtimeCache,
    });

    return;
  }

  const agendamentos = data || [];
  const agendamento = agendamentos[0] || null;
  const { data: execucaoAtual } = await supabaseAdmin
    .from("automacao_execucoes")
    .select("metadata_json, contato_id")
    .eq("id", execucaoId)
    .eq("empresa_id", empresaId)
    .maybeSingle();
  const metadataAtual = execucaoAtual?.metadata_json || {};

  if (listarParaEscolha && agendamentos.length > 0) {
    const opcoes = await montarOpcoesAgendamentosAgenda(empresaId, agendamentos);
    const mensagemBase =
      String(config.mensagem_listar_agendamentos || "").trim() ||
      "Encontrei estes agendamentos. Responda com o numero do agendamento que deseja cancelar ou remarcar:";
    const mensagemOpcoes = [
      mensagemBase,
      "",
      ...opcoes.map((opcao) => `${opcao.indice}. ${opcao.label}`),
    ].join("\n");
    const opcoesPorNo = metadataAtual.agenda_agendamentos_opcoes || {};

    await salvarVariaveisAutomacao({
      empresaId,
      execucao: {
        id: execucaoId,
        contato_id: execucaoAtual?.contato_id || null,
      },
      valores: {
        agenda_encontrado: "true",
      },
      origem: "agenda_buscar_agendamento",
      metadata: {
        total_agendamentos: String(opcoes.length),
      },
    });

    await enviarMensagemAutomacao({
      empresaId,
      conversaId,
      numeroDestino,
      conteudo: mensagemOpcoes,
      execucaoId,
      noId: no.id,
    });

    await salvarEstadoExecucaoAgenda({
      empresaId,
      execucaoId,
      metadataAtual,
      status: "aguardando",
      noAtualId: no.id,
      patch: {
        agenda_agendamentos_opcoes: {
          ...opcoesPorNo,
          [no.id]: opcoes,
        },
        variaveis: {
          ...(metadataAtual.variaveis || {}),
          agenda_encontrado: "true",
        },
      },
    });

    await agendarTimeoutSemRespostaSeExistir({
      empresaId,
      conversaId,
      execucaoId,
      fluxoId,
      noId: no.id,
      numeroDestino,
    });

    await agendarEncerramentoInatividadeFluxoSeAtivo({
      empresaId,
      conversaId,
      execucaoId,
      fluxoId,
      noId: no.id,
      numeroDestino,
    });

    await registrarLog({
      empresaId,
      execucaoId,
      fluxoId,
      noId: no.id,
      tipoEvento: "agenda_agendamentos_oferecidos",
      descricao: "Agendamentos futuros enviados para o cliente escolher.",
      entrada: config,
      saida: {
        total_opcoes: opcoes.length,
        opcoes,
      },
    });

    return;
  }

  const agenda = agendamento
    ? await obterAgendaAutomacao(empresaId, agendamento.agenda_id)
    : null;
  const valores = agendamento
    ? valoresAgendamentoAgenda(agendamento, agenda)
    : {
        agenda_encontrado: "false",
      };
  await salvarVariaveisAutomacao({
    empresaId,
    execucao: {
      id: execucaoId,
      contato_id: execucaoAtual?.contato_id || null,
    },
    valores: {
      ...valores,
      agenda_encontrado: agendamento ? "true" : "false",
    },
    origem: "agenda_buscar_agendamento",
    metadata: {
      agendamento_id: agendamento?.id || null,
    },
  });

  await salvarEstadoExecucaoAgenda({
    empresaId,
    execucaoId,
    metadataAtual,
    patch: {
      agenda_agendamento_id: agendamento?.id || null,
      agenda_status: agendamento?.status || "nao_encontrado",
      variaveis: {
        ...(metadataAtual.variaveis || {}),
        ...valores,
        agenda_encontrado: agendamento ? "true" : "false",
      },
    },
  });

  const mensagem = agendamento
    ? String(config.mensagem_encontrado || "").trim()
    : String(config.mensagem_nao_encontrado || "").trim();

  if (mensagem) {
    await enviarMensagemAutomacao({
      empresaId,
      conversaId,
      numeroDestino,
      conteudo: substituirVariaveisAgenda(mensagem, {
        ...valores,
        agenda_encontrado: agendamento ? "true" : "false",
      }),
      execucaoId,
      noId: no.id,
    });
  }

  await registrarLog({
    empresaId,
    execucaoId,
    fluxoId,
    noId: no.id,
    tipoEvento: "agenda_busca_agendamento",
    descricao: agendamento
      ? "Agendamento do contato encontrado."
      : "Nenhum agendamento futuro encontrado para o contato.",
    entrada: config,
    saida: {
      agendamento_id: agendamento?.id || null,
    },
  });

  await seguirParaProximoNo({
    empresaId,
    conversaId,
    execucaoId,
    fluxoId,
    noAtualId: no.id,
    mensagemTexto: agendamento ? "encontrado" : "nao_encontrado",
    numeroDestino,
    runtimeCache,
  });
}

async function criarAgendamentoAutomacao(params: {
  empresaId: string;
  conversaId: string;
  execucaoId: string;
  fluxoId: string;
  no: any;
  numeroDestino: string;
  runtimeCache?: FluxoRuntimeCache;
}) {
  const { empresaId, conversaId, execucaoId, fluxoId, no, numeroDestino, runtimeCache, } =
    params;
  const config = no.configuracao_json || {};
  const { data: execucao } = await supabaseAdmin
    .from("automacao_execucoes")
    .select("*")
    .eq("id", execucaoId)
    .eq("empresa_id", empresaId)
    .maybeSingle();

  const metadataAtual = execucao?.metadata_json || {};
  const slot = metadataAtual.agenda_slot_escolhido || {};
  const agendaId = String(slot.agenda_id || config.agenda_id || "").trim();
  const inicioAt = String(slot.inicio_at || "");
  const fimAt = String(slot.fim_at || "");

  if (!execucao || !agendaId || !inicioAt || !fimAt) {
    await seguirParaProximoNo({
      empresaId,
      conversaId,
      execucaoId,
      fluxoId,
      noAtualId: no.id,
      mensagemTexto: "sem_slot",
      numeroDestino,
      runtimeCache,
    });

    return;
  }

  const conflito = await existeConflitoAgenda({
    supabase: supabaseAdmin,
    empresaId,
    agendaId,
    inicioAt,
    fimAt,
  });

  if (conflito) {
    const mensagemConflito =
      String(config.mensagem_conflito || "").trim() ||
      "Esse horario acabou de ficar indisponivel. Vamos escolher outro horario.";

    await enviarMensagemAutomacao({
      empresaId,
      conversaId,
      numeroDestino,
      conteudo: mensagemConflito,
      execucaoId,
      noId: no.id,
    });

    await seguirParaProximoNo({
      empresaId,
      conversaId,
      execucaoId,
      fluxoId,
      noAtualId: no.id,
      mensagemTexto: "conflito",
      numeroDestino,
      runtimeCache,
    });

    return;
  }

  const contato = await obterContatoAutomacao(empresaId, execucao);
  const agenda = await obterAgendaAutomacao(empresaId, agendaId);
  const statusInicial =
    config.status_inicial === "confirmado" ? "confirmado" : "agendado";

  const { data: agendamento, error } = await supabaseAdmin
    .from("agenda_agendamentos")
    .insert({
      empresa_id: empresaId,
      agenda_id: agendaId,
      contato_id: execucao.contato_id || null,
      conversa_id: conversaId,
      conversa_protocolo_id: execucao.conversa_protocolo_id || null,
      automacao_execucao_id: execucao.id,
      automacao_fluxo_id: execucao.fluxo_id,
      automacao_no_id: no.id,
      titulo: String(config.titulo_agendamento || "").trim() || agenda?.nome || no.titulo || "Agendamento",
      nome_cliente: contato?.nome || null,
      telefone_cliente: contato?.telefone || numeroDestino || null,
      email_cliente: contato?.email || null,
      inicio_at: inicioAt,
      fim_at: fimAt,
      status: statusInicial,
      origem: "automacao",
      metadata_json: {
        slot_escolhido: slot,
        agenda_nome: agenda?.nome || null,
      },
    })
    .select("*")
    .single();

  if (error || !agendamento) {
    console.error("[AUTOMATION_ENGINE] Erro ao criar agendamento:", error);
    return;
  }

  const valores = valoresAgendamentoAgenda(agendamento, agenda);

  await salvarVariaveisAutomacao({
    empresaId,
    execucao,
    valores,
    origem: "agenda_criar_agendamento",
    metadata: {
      agendamento_id: agendamento.id,
    },
  });

  await salvarEstadoExecucaoAgenda({
    empresaId,
    execucaoId,
    metadataAtual,
    patch: {
      agenda_agendamento_id: agendamento.id,
      agenda_status: statusInicial,
      agenda_slot_escolhido: null,
      variaveis: {
        ...(metadataAtual.variaveis || {}),
        ...valores,
      },
    },
  });

  const mensagemSucesso = String(config.mensagem_sucesso || config.mensagem || "").trim();

  if (mensagemSucesso) {
    await enviarMensagemAutomacao({
      empresaId,
      conversaId,
      numeroDestino,
      conteudo: substituirVariaveisAgenda(mensagemSucesso, valores),
      execucaoId,
      noId: no.id,
    });
  }

  await registrarLog({
    empresaId,
    execucaoId,
    fluxoId,
    noId: no.id,
    tipoEvento: "agenda_agendamento_criado",
    descricao: "Agendamento criado por bloco dedicado.",
    entrada: config,
    saida: {
      agendamento_id: agendamento.id,
      agenda_id: agendaId,
      inicio_at: inicioAt,
      fim_at: fimAt,
    },
  });

  await seguirParaProximoNo({
    empresaId,
    conversaId,
    execucaoId,
    fluxoId,
    noAtualId: no.id,
    mensagemTexto: "agendado",
    numeroDestino,
    runtimeCache,
  });
}

async function remarcarAgendamentoAutomacao(params: {
  empresaId: string;
  conversaId: string;
  execucaoId: string;
  fluxoId: string;
  no: any;
  numeroDestino: string;
  runtimeCache?: FluxoRuntimeCache;
}) {
  const { empresaId, conversaId, execucaoId, fluxoId, no, numeroDestino, runtimeCache, } =
    params;
  const config = no.configuracao_json || {};
  const { data: execucao } = await supabaseAdmin
    .from("automacao_execucoes")
    .select("*")
    .eq("id", execucaoId)
    .eq("empresa_id", empresaId)
    .maybeSingle();
  const metadataAtual = execucao?.metadata_json || {};
  const slot = metadataAtual.agenda_slot_escolhido || {};
  const agendamentoId = String(
    config.agendamento_id || metadataAtual.agenda_agendamento_id || ""
  ).trim();
  const agendaId = String(slot.agenda_id || config.agenda_id || "").trim();
  const inicioAt = String(slot.inicio_at || "");
  const fimAt = String(slot.fim_at || "");

  if (!execucao || !agendamentoId || !agendaId || !inicioAt || !fimAt) {
    await seguirParaProximoNo({
      empresaId,
      conversaId,
      execucaoId,
      fluxoId,
      noAtualId: no.id,
      mensagemTexto: "sem_dados",
      numeroDestino,
      runtimeCache,
    });

    return;
  }

  const conflito = await existeConflitoAgenda({
    supabase: supabaseAdmin,
    empresaId,
    agendaId,
    inicioAt,
    fimAt,
    ignorarAgendamentoId: agendamentoId,
  });

  if (conflito) {
    await enviarMensagemAutomacao({
      empresaId,
      conversaId,
      numeroDestino,
      conteudo:
        String(config.mensagem_conflito || "").trim() ||
        "Esse novo horario acabou de ficar indisponivel. Vamos escolher outro horario.",
      execucaoId,
      noId: no.id,
    });

    await seguirParaProximoNo({
      empresaId,
      conversaId,
      execucaoId,
      fluxoId,
      noAtualId: no.id,
      mensagemTexto: "conflito",
      numeroDestino,
      runtimeCache,
    });

    return;
  }

  const { data: agendamento, error } = await supabaseAdmin
    .from("agenda_agendamentos")
    .update({
      agenda_id: agendaId,
      inicio_at: inicioAt,
      fim_at: fimAt,
      status:
        config.status_final === "confirmado" ? "confirmado" : "agendado",
      metadata_json: {
        remarcado_por: "automacao",
        slot_anterior_id: agendamentoId,
        slot_novo: slot,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", agendamentoId)
    .eq("empresa_id", empresaId)
    .select("*")
    .single();

  if (error || !agendamento) {
    console.error("[AUTOMATION_ENGINE] Erro ao remarcar agendamento:", error);
    return;
  }

  const agenda = await obterAgendaAutomacao(empresaId, agendaId);
  const valores = valoresAgendamentoAgenda(agendamento, agenda);

  await salvarVariaveisAutomacao({
    empresaId,
    execucao,
    valores,
    origem: "agenda_remarcar_agendamento",
    metadata: {
      agendamento_id: agendamento.id,
    },
  });

  await salvarEstadoExecucaoAgenda({
    empresaId,
    execucaoId,
    metadataAtual,
    patch: {
      agenda_agendamento_id: agendamento.id,
      agenda_status: agendamento.status,
      agenda_slot_escolhido: null,
      variaveis: {
        ...(metadataAtual.variaveis || {}),
        ...valores,
      },
    },
  });

  const mensagemSucesso = String(config.mensagem_sucesso || config.mensagem || "").trim();

  if (mensagemSucesso) {
    await enviarMensagemAutomacao({
      empresaId,
      conversaId,
      numeroDestino,
      conteudo: substituirVariaveisAgenda(mensagemSucesso, valores),
      execucaoId,
      noId: no.id,
    });
  }

  await seguirParaProximoNo({
    empresaId,
    conversaId,
    execucaoId,
    fluxoId,
    noAtualId: no.id,
    mensagemTexto: "remarcado",
    numeroDestino,
    runtimeCache,
  });
}

async function cancelarAgendamentoAutomacao(params: {
  empresaId: string;
  conversaId: string;
  execucaoId: string;
  fluxoId: string;
  no: any;
  numeroDestino: string;
  runtimeCache?: FluxoRuntimeCache;
}) {
  const { empresaId, conversaId, execucaoId, fluxoId, no, numeroDestino, runtimeCache, } =
    params;
  const config = no.configuracao_json || {};
  const { data: execucao } = await supabaseAdmin
    .from("automacao_execucoes")
    .select("id, contato_id, metadata_json")
    .eq("id", execucaoId)
    .eq("empresa_id", empresaId)
    .maybeSingle();
  const metadataAtual = execucao?.metadata_json || {};
  const agendamentoId = String(
    config.agendamento_id || metadataAtual.agenda_agendamento_id || ""
  ).trim();

  if (!execucao || !agendamentoId) {
    await seguirParaProximoNo({
      empresaId,
      conversaId,
      execucaoId,
      fluxoId,
      noAtualId: no.id,
      mensagemTexto: "nao_encontrado",
      numeroDestino,
      runtimeCache,
    });

    return;
  }

  const statusFinal = config.status_final === "faltou" ? "faltou" : "cancelado";

  const { data: agendamento, error } = await supabaseAdmin
    .from("agenda_agendamentos")
    .update({
      status: statusFinal,
      metadata_json: {
        cancelado_por: "automacao",
        motivo: String(config.motivo || "").trim() || null,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", agendamentoId)
    .eq("empresa_id", empresaId)
    .select("*")
    .single();

  if (error || !agendamento) {
    console.error("[AUTOMATION_ENGINE] Erro ao cancelar agendamento:", error);
    return;
  }

  const agenda = await obterAgendaAutomacao(empresaId, agendamento.agenda_id);
  const valores = {
    ...valoresAgendamentoAgenda(agendamento, agenda),
    agenda_cancelado_em: new Date().toISOString(),
    agenda_cancelamento_motivo: String(config.motivo || "").trim(),
  };

  await salvarVariaveisAutomacao({
    empresaId,
    execucao,
    valores,
    origem: "agenda_cancelar_agendamento",
    metadata: {
      agendamento_id: agendamento.id,
    },
  });

  await salvarEstadoExecucaoAgenda({
    empresaId,
    execucaoId,
    metadataAtual,
    patch: {
      agenda_agendamento_id: agendamento.id,
      agenda_status: statusFinal,
      variaveis: {
        ...(metadataAtual.variaveis || {}),
        ...valores,
      },
    },
  });

  const mensagemSucesso = String(config.mensagem_sucesso || config.mensagem || "").trim();

  if (mensagemSucesso) {
    await enviarMensagemAutomacao({
      empresaId,
      conversaId,
      numeroDestino,
      conteudo: substituirVariaveisAgenda(mensagemSucesso, valores),
      execucaoId,
      noId: no.id,
    });
  }

  await seguirParaProximoNo({
    empresaId,
    conversaId,
    execucaoId,
    fluxoId,
    noAtualId: no.id,
    mensagemTexto: statusFinal,
    numeroDestino,
    runtimeCache,
  });
}


async function registrarInterpretacaoArquivoAutomacao(params: {
  empresaId: string;
  conversaId: string;
  execucao: any;
  no: any;
  input: AutomationEngineInput;
  numeroDestino: string;
}) {
  const { empresaId, conversaId, execucao, no, input, numeroDestino } = params;

  const config = no.configuracao_json || {};
  const instrucaoIa = String(config.instrucao_ia || "").trim();
  const chave = String(config.salvar_variavel || "analise_arquivo").trim().toLowerCase();
  const maxTentativas = Math.max(1, Number(config.max_tentativas_invalidas || 3));

  const mensagemErro =
    String(config.mensagem_erro || "").trim() ||
    "Não consegui interpretar o arquivo. Envie uma imagem ou PDF legível.";

  const tipoMensagem = input.mensagemTipo;
  const mediaId = String(input.mediaId || "").trim();

  if (!["imagem", "documento"].includes(String(tipoMensagem)) || !mediaId) {
    const tentativa = await registrarTentativaBloco({
      empresaId,
      execucao,
      no,
      tipo: "resposta_invalida",
    });

    if (tentativa.excedeu) {
      return { ok: true, valido: false, excedeuTentativas: true };
    }

    await enviarMensagemAutomacao({
      empresaId,
      conversaId,
      numeroDestino,
      conteudo: mensagemErro,
      execucaoId: execucao.id,
      noId: no.id,
    });

    return { ok: true, valido: false, excedeuTentativas: false };
  }

  try {
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN || "";

    if (!accessToken) {
      throw new Error("WHATSAPP_ACCESS_TOKEN não configurado.");
    }

    const arquivo = await baixarMidiaWhatsapp({
      mediaId,
      accessToken,
    });

    const arquivoSalvo = await salvarArquivoAnaliseStorage({
      empresaId,
      execucaoId: execucao.id,
      noId: no.id,
      mediaId,
      buffer: arquivo.buffer,
      mimeType: arquivo.mimeType || input.mimeType || null,
    });

    const arquivoUrl = arquivoSalvo.signedUrl;

    const camposExtracao = Array.isArray(config.campos_extracao)
      ? config.campos_extracao
          .map((campo: any) => String(campo || "").trim())
          .filter(Boolean)
      : [];

    const resultado = await interpretarArquivoComIA({
      instrucao: instrucaoIa,
      arquivoUrl,
      mimeType: arquivo.mimeType || input.mimeType,
      camposExtracao,
      empresaId,
      metadata: {
        execucao_id: execucao.id,
        fluxo_id: execucao.fluxo_id,
        no_id: no.id,
        conversa_id: conversaId,
        contato_id: execucao.contato_id || null,
        media_id: mediaId,
      },
    });

    await supabaseAdmin.from("automacao_arquivo_analises").insert({
      empresa_id: empresaId,
      execucao_id: execucao.id,
      fluxo_id: execucao.fluxo_id,
      no_id: no.id,
      conversa_id: conversaId,
      contato_id: execucao.contato_id || null,
      tipo_arquivo: tipoMensagem,
      mime_type: arquivo.mimeType || input.mimeType || null,
      media_id: mediaId,
      arquivo_url: arquivoSalvo.storagePath,
      instrucao_ia: instrucaoIa,
      sucesso: resultado.sucesso === true,
      status: resultado.status || "erro",
      motivo: resultado.motivo || null,
      dados_extraidos: resultado.dados_extraidos || {},
      resultado_json: resultado,
    });

    await supabaseAdmin.from("automacao_variaveis").upsert(
      {
        empresa_id: empresaId,
        execucao_id: execucao.id,
        contato_id: execucao.contato_id,
        chave,
        valor: String(resultado.status || ""),
        metadata_json: {
          resultado,
          arquivo: {
            media_id: mediaId,
            mime_type: arquivo.mimeType || input.mimeType || null,
            arquivo_url: arquivoSalvo.storagePath,
          },
        },
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "empresa_id,execucao_id,chave",
      }
    );

    const motivoAnalise = String(resultado.motivo || "");
    const confiancaAnalise = String(resultado.confianca || "");
    const dadosExtraidos = resultado.dados_extraidos || {};

    const variaveisDaAnalise = [
      {
        empresa_id: empresaId,
        execucao_id: execucao.id,
        contato_id: execucao.contato_id,
        chave: `${chave}_motivo`,
        valor: motivoAnalise,
        metadata_json: {
          origem: "interpretar_arquivo_ia",
          variavel_pai: chave,
        },
        updated_at: new Date().toISOString(),
      },
      {
        empresa_id: empresaId,
        execucao_id: execucao.id,
        contato_id: execucao.contato_id,
        chave: `${chave}_confianca`,
        valor: confiancaAnalise,
        metadata_json: {
          origem: "interpretar_arquivo_ia",
          variavel_pai: chave,
        },
        updated_at: new Date().toISOString(),
      },
      ...Object.entries(dadosExtraidos).map(([campo, valor]) => ({
        empresa_id: empresaId,
        execucao_id: execucao.id,
        contato_id: execucao.contato_id,
        chave: `${chave}_${campo}`.toLowerCase(),
        valor: String(valor ?? ""),
        metadata_json: {
          origem: "interpretar_arquivo_ia",
          variavel_pai: chave,
          campo_extraido: campo,
        },
        updated_at: new Date().toISOString(),
      })),
    ];

    await supabaseAdmin.from("automacao_variaveis").upsert(variaveisDaAnalise, {
      onConflict: "empresa_id,execucao_id,chave",
    });

    await registrarLog({
      empresaId,
      execucaoId: execucao.id,
      fluxoId: execucao.fluxo_id,
      noId: no.id,
      tipoEvento: "arquivo_ia_interpretado",
      descricao: "Arquivo interpretado pela IA.",
      entrada: {
        instrucao_ia: instrucaoIa,
        media_id: mediaId,
        tipo_mensagem: tipoMensagem,
      },
      saida: resultado,
    });

    return {
      ok: true,
      valido: true,
      excedeuTentativas: false,
      status: resultado.status || (resultado.sucesso ? "aprovado" : "reprovado"),
      resultado,
    };
  } catch (error: any) {
    await registrarLog({
      empresaId,
      execucaoId: execucao.id,
      fluxoId: execucao.fluxo_id,
      noId: no.id,
      tipoEvento: "erro_interpretar_arquivo_ia",
      descricao: "Erro ao interpretar arquivo com IA.",
      entrada: {
        media_id: mediaId,
        instrucao_ia: instrucaoIa,
      },
      saida: {
        erro: error?.message || String(error),
      },
    });

    return {
      ok: true,
      valido: true,
      excedeuTentativas: false,
      status: "erro",
    };
  }
}

export async function executarAcaoExcessoTentativas(params: {
  empresaId: string;
  conversaId: string;
  execucao: any;
  no: any;
  numeroDestino: string;
  tipo: "resposta_invalida" | "sem_resposta";
}) {
  const { empresaId, conversaId, execucao, no, numeroDestino, tipo } = params;

  const config = no.configuracao_json || {};

  const mensagem =
    String(config.mensagem_excesso_tentativas || "").trim() ||
    "Não consegui continuar o atendimento automático. Vou te encaminhar para um atendente.";

  const setorExcessoTentativas =
    String(no.configuracao_json?.setor_excesso_tentativas || "").trim() || null;

  const acao =
    String(config.acao_excesso_tentativas || "transferir_atendimento");

  if (mensagem) {
    await enviarMensagemAutomacao({
      empresaId,
      conversaId,
      numeroDestino,
      conteudo: mensagem,
      execucaoId: execucao.id,
      noId: no.id,
    });
  }

  await registrarLog({
    empresaId,
    execucaoId: execucao.id,
    fluxoId: execucao.fluxo_id,
    noId: no.id,
    tipoEvento: "excesso_tentativas",
    descricao: `Cliente excedeu o limite de tentativas: ${tipo}.`,
    entrada: {
      tipo,
      acao,
      configuracao_json: config,
    },
    saida: {},
  });

  if (config.notificar_excesso_tentativas !== false) {
    const tituloNotificacao = "Excesso de tentativas no fluxo";

    const mensagemNotificacao =
      tipo === "sem_resposta"
        ? `O contato excedeu o limite de tentativas sem resposta no bloco "${no.titulo}".`
        : `O contato excedeu o limite de respostas inválidas no bloco "${no.titulo}".`;

    const { data: contato } = execucao?.contato_id
      ? await supabaseAdmin
          .from("contatos")
          .select("nome, telefone")
          .eq("id", execucao.contato_id)
          .eq("empresa_id", empresaId)
          .maybeSingle()
      : { data: null };

    const { data: fluxo } = await supabaseAdmin
      .from("automacao_fluxos")
      .select("nome")
      .eq("id", execucao.fluxo_id)
      .eq("empresa_id", empresaId)
      .maybeSingle();

    const { data: setorDestino } = setorExcessoTentativas
      ? await supabaseAdmin
          .from("setores")
          .select("nome")
          .eq("id", setorExcessoTentativas)
          .eq("empresa_id", empresaId)
          .maybeSingle()
      : { data: null };

    await supabaseAdmin.from("notificacoes").insert({
      empresa_id: empresaId,
      conversa_id: conversaId,
      contato_id: execucao?.contato_id || null,
      automacao_execucao_id: execucao.id,
      automacao_fluxo_id: execucao.fluxo_id,
      automacao_no_id: no.id,
      tipo: "automacao",
      titulo: tituloNotificacao,
      mensagem: mensagemNotificacao,
      lida: false,
      metadata_json: {
        origem: "excesso_tentativas",
        tipo_tentativa: tipo,
        acao_executada: acao,
        bloco_titulo: no.titulo,
        bloco_tipo: no.tipo_no,
        notificar_email: config.notificar_email_excesso_tentativas !== false,
      },
    });

    if (config.notificar_email_excesso_tentativas !== false) {
      await sendAutomationNotificationEmail({
        empresaId,
        conversaId,
        titulo: tituloNotificacao,
        mensagem: mensagemNotificacao,
        fluxoNome: fluxo?.nome || null,
        blocoTitulo: no.titulo || null,
        blocoTipo: no.tipo_no || null,
        contatoNome: contato?.nome || null,
        contatoTelefone: contato?.telefone || numeroDestino || null,
        setorDestino: setorDestino?.nome || null,
        tipoNotificacao: "excesso_tentativas",
      });
    }
  }

  if (acao === "encerrar_fluxo") {
    await supabaseAdmin
      .from("automacao_execucoes")
      .update({
        status: "finalizado",
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", execucao.id)
      .eq("empresa_id", empresaId);

    await supabaseAdmin
      .from("conversas")
      .update({
        status: "encerrado_aut",
        bot_ativo: false,
        closed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversaId)
      .eq("empresa_id", empresaId);

    return;
  }

  if (acao === "reiniciar_fluxo") {
    await supabaseAdmin
      .from("automacao_execucoes")
      .update({
        no_atual_id: null,
        status: "finalizado",
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", execucao.id)
      .eq("empresa_id", empresaId);

    return;
  }

  await supabaseAdmin
    .from("automacao_execucoes")
    .update({
      status: "finalizado",
      finished_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", execucao.id)
    .eq("empresa_id", empresaId);

  await supabaseAdmin
    .from("conversas")
    .update({
      status: "fila",
      setor_id: setorExcessoTentativas,
      responsavel_id: null,
      bot_ativo: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversaId)
    .eq("empresa_id", empresaId);
}

export async function registrarTentativaBloco(params: {
  empresaId: string;
  execucao: any;
  no: any;
  tipo: "resposta_invalida" | "sem_resposta";
}) {
  const { empresaId, execucao, no, tipo } = params;

  const metadataAtual = execucao.metadata_json || {};
  const tentativasBlocos = metadataAtual.tentativas_blocos || {};
  const tentativasDoNo = tentativasBlocos[no.id] || {};

  const quantidadeAtual = Number(tentativasDoNo[tipo] || 0);
  const novaQuantidade = quantidadeAtual + 1;

  const config = no.configuracao_json || {};

  const limite =
    tipo === "sem_resposta"
      ? Math.max(1, Number(config.max_tentativas_sem_resposta || 3))
      : Math.max(1, Number(config.max_tentativas_invalidas || 3));

  await supabaseAdmin
    .from("automacao_execucoes")
    .update({
      status: "aguardando",
      metadata_json: {
        ...metadataAtual,
        tentativas_blocos: {
          ...tentativasBlocos,
          [no.id]: {
            ...tentativasDoNo,
            [tipo]: novaQuantidade,
          },
        },
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", execucao.id)
    .eq("empresa_id", empresaId);

  return {
    quantidade: novaQuantidade,
    limite,
    excedeu: novaQuantidade >= limite,
  };
}

async function seguirParaProximoNo(params: {
  empresaId: string;
  conversaId: string;
  execucaoId: string;
  fluxoId: string;
  noAtualId: string;
  mensagemTexto?: string;
  numeroDestino: string;
  runtimeCache?: FluxoRuntimeCache;
}) {
  const {
    empresaId,
    conversaId,
    execucaoId,
    fluxoId,
    noAtualId,
    mensagemTexto,
    numeroDestino,
    runtimeCache,
  } = params;

  let conexoes: any[] = [];

  if (runtimeCache) {
    conexoes = runtimeCache.conexoesPorOrigem.get(noAtualId) || [];
  } else {
    const { data, error } = await supabaseAdmin
      .from("automacao_conexoes")
      .select("*")
      .eq("empresa_id", empresaId)
      .eq("fluxo_id", fluxoId)
      .eq("no_origem_id", noAtualId)
      .eq("ativo", true)
      .order("ordem", { ascending: true });

    if (error) {
      console.error("[AUTOMATION] erro conexões", error);
      return;
    }

    conexoes = data || [];
  }

  if (!conexoes || conexoes.length === 0) {
    await finalizarExecucao(execucaoId, empresaId);
    return;
  }

  let conexaoEscolhida = null;

  const conexoesComCondicaoDeResposta = conexoes.filter((conexao) =>
    condicaoPrecisaDeResposta(conexao.condicao_json)
  );

  const conexoesSempre = conexoes.filter(
    (conexao) => conexao.condicao_json?.tipo === "sempre"
  );

  const conexoesSemCondicao = conexoes.filter(
    (conexao) => !conexao.condicao_json?.tipo
  );

  if (mensagemTexto && conexoesComCondicaoDeResposta.length > 0) {
    conexaoEscolhida =
      conexoesComCondicaoDeResposta.find((conexao) =>
        condicaoCombinaComMensagem(conexao.condicao_json, mensagemTexto)
      ) || null;

    if (!conexaoEscolhida) {
      const conexoesComIA = conexoes.filter(
        (conexao) => conexao.usar_ia === true
      );

      if (conexoesComIA.length > 0) {
        try {
          const resultadoIA = await interpretarConexaoComIA({
            mensagemCliente: mensagemTexto,
            conexoesDisponiveis: conexoesComIA.map((conexao) => ({
              id: conexao.id,
              nome:
                conexao.nome_conexao ||
                conexao.nome ||
                conexao.titulo ||
                "Conexão sem nome",
              descricao_ia: conexao.descricao_ia,
            })),
            empresaId,
            metadata: {
              execucao_id: execucaoId,
              fluxo_id: fluxoId,
              no_id: noAtualId,
            },
          });

          console.log("[IA CONEXÃO]", resultadoIA);

          const conexaoIA = conexoesComIA.find(
            (conexao) => conexao.id === resultadoIA.conexao_id
          );

          const CONFIANCA_MINIMA_IA = 0.7;

          if (conexaoIA && resultadoIA.confianca >= CONFIANCA_MINIMA_IA) {
            conexaoEscolhida = conexaoIA;

            await registrarLog({
              empresaId,
              execucaoId,
              fluxoId,
              noId: noAtualId,
              conexaoId: conexaoIA.id,
              tipoEvento: "ia_conexao_escolhida",
              descricao: "IA interpretou a resposta do cliente e escolheu uma conexão.",
              entrada: {
                mensagemTexto,
                conexoes_avaliadas: conexoesComIA.map((c) => ({
                  id: c.id,
                  nome: c.nome_conexao || c.nome || c.titulo || null,
                  descricao_ia: c.descricao_ia,
                })),
              },
              saida: resultadoIA,
            });
          } else {
            await registrarLog({
              empresaId,
              execucaoId,
              fluxoId,
              noId: noAtualId,
              tipoEvento: "ia_conexao_baixa_confianca",
              descricao: "IA não escolheu uma conexão com confiança suficiente.",
              entrada: {
                mensagemTexto,
              },
              saida: resultadoIA,
            });
          }
        } catch (iaError) {
          console.error("[AUTOMATION_ENGINE] Erro ao interpretar conexão com IA:", iaError);

          await registrarLog({
            empresaId,
            execucaoId,
            fluxoId,
            noId: noAtualId,
            tipoEvento: "erro_ia_conexao",
            descricao: "Erro ao chamar IA para interpretar conexão.",
            entrada: {
              mensagemTexto,
            },
            saida: {
              erro: iaError instanceof Error ? iaError.message : String(iaError),
            },
          });
        }
      }
    }

    if (!conexaoEscolhida) {
      const { data: execucaoAtual } = await supabaseAdmin
        .from("automacao_execucoes")
        .select("*")
        .eq("id", execucaoId)
        .eq("empresa_id", empresaId)
        .maybeSingle();

      const { data: noAtual } = await supabaseAdmin
        .from("automacao_nos")
        .select("*")
        .eq("id", noAtualId)
        .eq("empresa_id", empresaId)
        .maybeSingle();

      if (execucaoAtual && noAtual) {
        const tentativa = await registrarTentativaBloco({
          empresaId,
          execucao: execucaoAtual,
          no: noAtual,
          tipo: "resposta_invalida",
        });

        if (tentativa.excedeu) {
          await executarAcaoExcessoTentativas({
            empresaId,
            conversaId,
            execucao: execucaoAtual,
            no: noAtual,
            numeroDestino,
            tipo: "resposta_invalida",
          });

          return;
        }
      }

      await enviarMensagemAutomacao({
        empresaId,
        conversaId,
        numeroDestino,
        conteudo:
          "Opção inválida. Por favor, escolha uma das opções disponíveis.",
        execucaoId,
        noId: noAtualId,
      });

      await agendarEncerramentoInatividadeFluxoSeAtivo({
        empresaId,
        conversaId,
        execucaoId,
        fluxoId,
        noId: noAtualId,
        numeroDestino,
      });

      await registrarLog({
        empresaId,
        execucaoId,
        fluxoId,
        noId: noAtualId,
        tipoEvento: "resposta_invalida",
        descricao:
          "Cliente enviou uma resposta que não corresponde a nenhuma conexão.",
        entrada: {
          mensagemTexto,
          conexoes_avaliadas: conexoesComCondicaoDeResposta.map((c) => ({
            id: c.id,
            condicao_json: c.condicao_json,
          })),
        },
        saida: {
          mensagem: "Opção inválida enviada ao cliente.",
        },
      });

      return;
    }
  }

  if (!conexaoEscolhida && conexoesSempre.length > 0) {
    conexaoEscolhida = conexoesSempre[0];
  }

  if (!conexaoEscolhida && conexoesSemCondicao.length > 0) {
    conexaoEscolhida = conexoesSemCondicao[0];
  }

  if (!conexaoEscolhida) {
    await finalizarExecucao(execucaoId, empresaId);
    return;
  }

  const { data: execucaoAtualParaLimpar } = await supabaseAdmin
    .from("automacao_execucoes")
    .select("metadata_json")
    .eq("id", execucaoId)
    .eq("empresa_id", empresaId)
    .maybeSingle();

  if (execucaoAtualParaLimpar?.metadata_json?.tentativas_blocos) {
    const metadataAtual = execucaoAtualParaLimpar.metadata_json;
    const tentativasBlocos = {
      ...(metadataAtual.tentativas_blocos || {}),
    };

    delete tentativasBlocos[noAtualId];

    await supabaseAdmin
      .from("automacao_execucoes")
      .update({
        metadata_json: {
          ...metadataAtual,
          tentativas_blocos: tentativasBlocos,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", execucaoId)
      .eq("empresa_id", empresaId);
  }

  let proximoNo: AutomacaoNo | null = null;

  if (runtimeCache) {
    proximoNo = runtimeCache.nosPorId.get(conexaoEscolhida.no_destino_id) || null;
  } else {
    const { data } = await supabaseAdmin
      .from("automacao_nos")
      .select("*")
      .eq("id", conexaoEscolhida.no_destino_id)
      .eq("empresa_id", empresaId)
      .maybeSingle();

    proximoNo = data || null;
  }

  if (!proximoNo) return;

  await supabaseAdmin
    .from("automacao_execucoes")
    .update({
      no_atual_id: proximoNo.id,
      status: "rodando",
      updated_at: new Date().toISOString(),
    })
    .eq("id", execucaoId)
    .eq("empresa_id", empresaId);

  await registrarLog({
    empresaId,
    execucaoId,
    fluxoId,
    noId: noAtualId,
    conexaoId: conexaoEscolhida.id,
    tipoEvento: "conexao_seguida",
    descricao: "Motor seguiu para o próximo bloco.",
    entrada: {
      mensagemTexto,
      condicao_json: conexaoEscolhida.condicao_json,
    },
    saida: {
      proximo_no_id: proximoNo.id,
      proximo_tipo_no: proximoNo.tipo_no,
    },
  });

  await executarNo({
    empresaId,
    conversaId,
    execucaoId,
    fluxoId,
    no: proximoNo,
    mensagemTexto,
    numeroDestino,
    runtimeCache,
  });
}

async function registrarAvaliacaoAutomacao(params: {
  empresaId: string;
  conversaId: string;
  execucao: any;
  no: AutomacaoNo;
  mensagemTexto?: string;
  numeroDestino: string;
}) {
  const { empresaId, conversaId, execucao, no, mensagemTexto, numeroDestino } =
    params;

  const resposta = String(mensagemTexto || "").trim();
  const nota = Number(resposta);

  const notaMinima = Number(no.configuracao_json?.nota_minima || 1);
  const notaMaxima = Number(no.configuracao_json?.nota_maxima || 5);

  if (
    !Number.isInteger(nota) ||
    nota < notaMinima ||
    nota > notaMaxima
  ) {
    const mensagemErro =
      String(no.configuracao_json?.mensagem_erro || "").trim() ||
      `Por favor, responda com uma nota de ${notaMinima} a ${notaMaxima}.`;

    await enviarMensagemAutomacao({
      empresaId,
      conversaId,
      numeroDestino,
      conteudo: mensagemErro,
      execucaoId: execucao.id,
      noId: no.id,
    });

    await registrarLog({
      empresaId,
      execucaoId: execucao.id,
      fluxoId: execucao.fluxo_id,
      noId: no.id,
      tipoEvento: "avaliacao_invalida",
      descricao: "Cliente enviou uma avaliação inválida.",
      entrada: { mensagemTexto },
      saida: { mensagemErro },
    });

    await agendarEncerramentoInatividadeFluxoSeAtivo({
      empresaId,
      conversaId,
      execucaoId: execucao.id,
      fluxoId: execucao.fluxo_id,
      noId: no.id,
      numeroDestino,
    });

    return {
      ok: true,
      status: "avaliacao_invalida",
      aguardando: true,
    };
  }

  const protocoloAtivo = await buscarOuCriarProtocoloAutomacao({
    empresaId,
    conversaId,
  });

  const { data: avaliacaoCriada, error } = await supabaseAdmin
    .from("atendimento_avaliacoes")
    .insert({
      empresa_id: empresaId,
      conversa_id: conversaId,
      contato_id: execucao.contato_id || null,
      conversa_protocolo_id: protocoloAtivo.id,
      automacao_execucao_id: execucao.id,
      automacao_fluxo_id: execucao.fluxo_id,
      automacao_no_id: no.id,
      numero_cliente: numeroDestino,
      protocolo: protocoloAtivo.protocolo,
      nota,
      origem: "automacao",
      metadata_json: {
        resposta_original: resposta,
        configuracao_no: no.configuracao_json || {},
      },
    })
    .select("id")
    .single();

  if (error) {
    console.error("[AUTOMATION_ENGINE] Erro ao registrar avaliação:", error);

    await registrarLog({
      empresaId,
      execucaoId: execucao.id,
      fluxoId: execucao.fluxo_id,
      noId: no.id,
      tipoEvento: "erro_registrar_avaliacao",
      descricao: "Erro ao salvar avaliação no banco.",
      entrada: { mensagemTexto },
      saida: { error: error.message },
    });

    await agendarEncerramentoInatividadeFluxoSeAtivo({
      empresaId,
      conversaId,
      execucaoId: execucao.id,
      fluxoId: execucao.fluxo_id,
      noId: no.id,
      numeroDestino,
    });

    return {
      ok: false,
      error: "Erro ao registrar avaliação.",
    };
  }

  await registrarLog({
    empresaId,
    execucaoId: execucao.id,
    fluxoId: execucao.fluxo_id,
    noId: no.id,
    tipoEvento: "avaliacao_registrada",
    descricao: "Avaliação registrada com sucesso.",
    entrada: { mensagemTexto },
    saida: { nota, protocolo: protocoloAtivo.protocolo },
  });

  const solicitarComentario =
    no.configuracao_json?.solicitar_comentario === true;

  if (solicitarComentario && avaliacaoCriada?.id) {
    const mensagemComentario =
      String(no.configuracao_json?.mensagem_comentario || "").trim() ||
      "Obrigado! Agora escreva um comentário sobre seu atendimento.";

    await enviarMensagemAutomacao({
      empresaId,
      conversaId,
      numeroDestino,
      conteudo: mensagemComentario,
      execucaoId: execucao.id,
      noId: no.id,
    });

    await supabaseAdmin
      .from("automacao_execucoes")
      .update({
        status: "aguardando",
        no_atual_id: no.id,
        metadata_json: {
          ...(execucao.metadata_json || {}),
          avaliacao_pendente_comentario: true,
          avaliacao_id: avaliacaoCriada.id,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", execucao.id)
      .eq("empresa_id", empresaId);

    await registrarLog({
      empresaId,
      execucaoId: execucao.id,
      fluxoId: execucao.fluxo_id,
      noId: no.id,
      tipoEvento: "avaliacao_comentario_solicitado",
      descricao: "Mensagem solicitando comentário da avaliação enviada ao cliente.",
      entrada: no.configuracao_json,
      saida: {
        avaliacao_id: avaliacaoCriada.id,
        mensagemComentario,
      },
    });

    return {
      ok: true,
      status: "aguardando_comentario_avaliacao",
      aguardandoComentario: true,
    };
  }

  return {
    ok: true,
    status: "avaliacao_registrada",
  };
}

async function registrarComentarioAvaliacaoAutomacao(params: {
  empresaId: string;
  conversaId: string;
  execucao: any;
  no: AutomacaoNo;
  mensagemTexto?: string;
  numeroDestino: string;
}) {
  const { empresaId, execucao, no, mensagemTexto } = params;

  const comentario = String(mensagemTexto || "").trim();
  const metadataExecucao = execucao.metadata_json || {};
  const avaliacaoId = metadataExecucao.avaliacao_id;

  if (!avaliacaoId) {
    return {
      ok: false,
      error: "Avaliação pendente não encontrada.",
    };
  }

  const { error } = await supabaseAdmin
    .from("atendimento_avaliacoes")
    .update({
      comentario,
      metadata_json: {
        comentario_original: comentario,
        comentario_registrado_em: new Date().toISOString(),
      },
    })
    .eq("id", avaliacaoId)
    .eq("empresa_id", empresaId);

  if (error) {
    console.error("[AUTOMATION_ENGINE] Erro ao registrar comentário da avaliação:", error);

    return {
      ok: false,
      error: "Erro ao registrar comentário da avaliação.",
    };
  }

  await supabaseAdmin
    .from("automacao_execucoes")
    .update({
      metadata_json: {
        ...(metadataExecucao || {}),
        avaliacao_pendente_comentario: false,
        avaliacao_comentario_registrado: true,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", execucao.id)
    .eq("empresa_id", empresaId);

  await registrarLog({
    empresaId,
    execucaoId: execucao.id,
    fluxoId: execucao.fluxo_id,
    noId: no.id,
    tipoEvento: "avaliacao_comentario_registrado",
    descricao: "Comentário da avaliação registrado com sucesso.",
    entrada: {
      mensagemTexto,
      avaliacaoId,
    },
    saida: {
      comentario,
    },
  });

  return {
    ok: true,
    status: "comentario_avaliacao_registrado",
  };
}

async function agendarTimeoutSemRespostaSeExistir(params: {
  empresaId: string;
  conversaId: string;
  execucaoId: string;
  fluxoId: string;
  noId: string;
  numeroDestino: string;
}) {
  const { empresaId, conversaId, execucaoId, fluxoId, noId, numeroDestino } =
    params;

  console.log("[AUTOMATION_TIMEOUT] Verificando timeout", {
    empresaId,
    conversaId,
    execucaoId,
    fluxoId,
    noId,
  });

  const { data: conexoesTimeout, error } = await supabaseAdmin
    .from("automacao_conexoes")
    .select("*")
    .eq("empresa_id", empresaId)
    .eq("fluxo_id", fluxoId)
    .eq("no_origem_id", noId)
    .eq("ativo", true)
    .eq("condicao_json->>tipo", "timeout_sem_resposta");

  if (error) {
    console.error("[AUTOMATION_ENGINE] Erro ao buscar conexão timeout:", error);
    return;
  }

  console.log("[AUTOMATION_TIMEOUT] Conexões encontradas", {
    quantidade: conexoesTimeout?.length || 0,
    conexoesTimeout,
  });

  if (!conexoesTimeout || conexoesTimeout.length === 0) {
    return;
  }

  await cancelarAgendamentosTimeoutPendentes({
    empresaId,
    execucaoId,
    noId,
  });

  for (const conexaoTimeout of conexoesTimeout) {
    const timeoutSegundos = Number(
      conexaoTimeout.condicao_json?.timeout_segundos || 0
    );

    if (!Number.isFinite(timeoutSegundos) || timeoutSegundos <= 0) {
      continue;
    }

    if (timeoutSegundos < 300) {
      continue;
    }

    if (timeoutSegundos > 79200) {
      await registrarLog({
        empresaId,
        execucaoId,
        fluxoId,
        noId,
        conexaoId: conexaoTimeout.id,
        tipoEvento: "timeout_nao_agendado_janela_22h",
        descricao:
          "Timeout não agendado porque ultrapassa a janela segura de 22 horas do WhatsApp.",
        entrada: conexaoTimeout.condicao_json,
        saida: {},
      });

      continue;
    }

    const executarEm = new Date(
      Date.now() + timeoutSegundos * 1000
    ).toISOString();

    const { error: insertError } = await supabaseAdmin
      .from("automacao_agendamentos")
      .insert({
        empresa_id: empresaId,
        execucao_id: execucaoId,
        fluxo_id: fluxoId,
        no_id: noId,
        tipo_agendamento: "timeout_sem_resposta",
        executar_em: executarEm,
        status: "pendente",
        payload_json: {
          conversa_id: conversaId,
          numero_destino: numeroDestino,
          conexao_id: conexaoTimeout.id,
          no_origem_id: noId,
          no_destino_id: conexaoTimeout.no_destino_id,
          timeout_segundos: timeoutSegundos,
          condicao_json: conexaoTimeout.condicao_json,
        },
      });

    if (insertError) {
      console.error(
        "[AUTOMATION_ENGINE] Erro ao criar agendamento timeout:",
        insertError
      );

      continue;
    }

    await registrarLog({
      empresaId,
      execucaoId,
      fluxoId,
      noId,
      conexaoId: conexaoTimeout.id,
      tipoEvento: "timeout_sem_resposta_agendado",
      descricao: "Timeout sem resposta agendado com sucesso.",
      entrada: conexaoTimeout.condicao_json,
      saida: {
        executar_em: executarEm,
        no_destino_id: conexaoTimeout.no_destino_id,
      },
    });
  }
}


async function cancelarAgendamentosTimeoutPendentes(params: {
  empresaId: string;
  execucaoId: string;
  noId: string;
}) {
  const { empresaId, execucaoId, noId } = params;

  const { error } = await supabaseAdmin
    .from("automacao_agendamentos")
    .update({
      status: "cancelado",
    })
    .eq("empresa_id", empresaId)
    .eq("execucao_id", execucaoId)
    .eq("no_id", noId)
    .eq("tipo_agendamento", "timeout_sem_resposta")
    .eq("status", "pendente");

  if (error) {
    console.error("[AUTOMATION_ENGINE] Erro ao cancelar timeout pendente:", error);
  }
}


async function finalizarExecucao(execucaoId: string, empresaId: string) {
  const agora = new Date().toISOString();

  const { data: execucao } = await supabaseAdmin
    .from("automacao_execucoes")
    .select("conversa_id")
    .eq("id", execucaoId)
    .eq("empresa_id", empresaId)
    .maybeSingle();

  await supabaseAdmin
    .from("automacao_execucoes")
    .update({
      status: "finalizado",
      finished_at: agora,
      updated_at: agora,
    })
    .eq("id", execucaoId)
    .eq("empresa_id", empresaId);

  if (execucao?.conversa_id) {
    await supabaseAdmin
      .from("conversas")
      .update({
        status: "encerrado_aut",
        bot_ativo: false,
        closed_at: agora,
        updated_at: agora,
      })
      .eq("id", execucao.conversa_id)
      .eq("empresa_id", empresaId)
      .eq("status", "bot");
  }
}

async function registrarLog(params: {
  empresaId: string;
  execucaoId: string;
  fluxoId: string;
  noId?: string;
  conexaoId?: string;
  tipoEvento: string;
  descricao: string;
  entrada: Record<string, any>;
  saida: Record<string, any>;
}) {
  await supabaseAdmin.from("automacao_execucao_logs").insert({
    empresa_id: params.empresaId,
    execucao_id: params.execucaoId,
    fluxo_id: params.fluxoId,
    no_id: params.noId || null,
    conexao_id: params.conexaoId || null,
    tipo_evento: params.tipoEvento,
    descricao: params.descricao,
    entrada_json: params.entrada,
    saida_json: params.saida,
  });
}

export async function enviarMensagemAutomacao(params: {
  empresaId: string;
  conversaId: string;
  numeroDestino: string;
  conteudo: string;
  execucaoId: string;
  noId: string;
}) {
  const { empresaId, conversaId, numeroDestino, execucaoId, noId } =
    params;

  const inicioEnvioAutomacao = Date.now();

  let conteudo = params.conteudo;

  const conteudoComVariaveis = await substituirVariaveisMensagem({
    empresaId,
    execucaoId,
    texto: conteudo,
  });

  perf("SEND / substituir variáveis", inicioEnvioAutomacao, {
    conversaId,
    noId,
  });

  const inicioBuscarConversaEnvio = Date.now();

  const { data: conversa, error: conversaError } = await supabaseAdmin
    .from("conversas")
    .select(
      `
      id,
      empresa_id,
      integracao_whatsapp_id,
      integracoes_whatsapp (
        id,
        phone_number_id,
        token_ref,
        status
      )
    `
    )
    .eq("id", conversaId)
    .eq("empresa_id", empresaId)
    .maybeSingle();

  if (conversaError || !conversa) {
    throw new Error("Conversa não encontrada para envio da automação.");
  }

  perf("SEND / buscar conversa e integração", inicioBuscarConversaEnvio, {
    conversaId,
  });

  const integracao = Array.isArray(conversa.integracoes_whatsapp)
    ? conversa.integracoes_whatsapp[0]
    : conversa.integracoes_whatsapp;

  const phoneNumberId =
    integracao.phone_number_id || process.env.WHATSAPP_PHONE_NUMBER_ID || "";

  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN || "";

  if (!phoneNumberId) {
    throw new Error("WHATSAPP_PHONE_NUMBER_ID não configurado.");
  }

  if (!accessToken) {
    throw new Error("WHATSAPP_ACCESS_TOKEN não configurado.");
  }

  const inicioJanela24h = Date.now();

  const permissaoEnvio = await canSendFreeformWhatsAppMessage({
    conversaId,
  });

  perf("SEND / verificar janela 24h", inicioJanela24h, {
    podeEnviar: permissaoEnvio.podeEnviarMensagemLivre,
  });

  if (!permissaoEnvio.podeEnviarMensagemLivre) {
    await supabaseAdmin.from("mensagens").insert({
      empresa_id: empresaId,
      conversa_id: conversaId,
      remetente_tipo: "sistema",
      conteudo:
        permissaoEnvio.motivoBloqueio ||
        "Mensagem automática não enviada: janela de 24 horas encerrada.",
      tipo_mensagem: "texto",
      origem: "automatica",
      status_envio: "falha",
      automacao_execucao_id: execucaoId,
      automacao_no_id: noId,
      metadata_json: {
        motivo: "janela_24h_encerrada",
      },
    });

    return {
      ok: false,
      status_envio: "falha",
      messageId: null,
      metaResponse: null,
      erro:
        permissaoEnvio.motivoBloqueio ||
        "Janela de 24 horas encerrada para mensagem livre.",
    };
  }

  const inicioMeta = Date.now();

  const envio = await sendWhatsAppTextMessage({
    phoneNumberId,
    accessToken,
    to: numeroDestino,
    body: conteudoComVariaveis,
  });

  perf("SEND / Meta WhatsApp API", inicioMeta, {
    ok: envio.ok,
    status: envio.status,
    messageId: envio.messageId,
  });

  const protocoloAtivo = await buscarOuCriarProtocoloAutomacao({
    empresaId,
    conversaId,
  });

  const inicioSalvarMensagemBot = Date.now();

  const { data: mensagemSalva, error: mensagemError } = await supabaseAdmin
    .from("mensagens")
    .insert({
      empresa_id: empresaId,
      conversa_id: conversaId,
      conversa_protocolo_id: protocoloAtivo.id,
      remetente_tipo: "bot",
      conteudo: conteudoComVariaveis,
      tipo_mensagem: "texto",
      origem: "automatica",
      status_envio: envio.ok ? "enviada" : "falha",
      mensagem_externa_id: envio.messageId,
      automacao_execucao_id: execucaoId,
      automacao_no_id: noId,
      metadata_json: {
        meta_response: envio.raw,
        erro: envio.error,
      },
    })
    .select("*")
    .single();

  if (mensagemError) {
    throw new Error(`Erro ao salvar mensagem da automação: ${mensagemError.message}`);
  }

  perf("SEND / salvar mensagem bot no banco", inicioSalvarMensagemBot, {
    mensagemId: mensagemSalva?.id,
  });

  perf("SEND / total enviar mensagem automação", inicioEnvioAutomacao, {
    ok: envio.ok,
    mensagemId: mensagemSalva?.id,
  });

  return {
    ok: envio.ok,
    status_envio: envio.ok ? "enviada" : "falha",
    messageId: envio.messageId,
    metaResponse: envio.raw,
    erro: envio.error,
    mensagemId: mensagemSalva?.id,
  };
}

async function enviarBotoesAutomacao({
  empresaId,
  conversaId,
  numeroDestino,
  mensagem,
  botoes,
  execucaoId,
  noId,
}: {
  empresaId: string;
  conversaId: string;
  numeroDestino: string;
  mensagem: string;
  botoes: { id: string; titulo: string }[];
  execucaoId: string;
  noId: string;
}) {
  const mensagemComVariaveis = await substituirVariaveisMensagem({
    empresaId,
    execucaoId,
    texto: mensagem,
  });

    const { data: conversa, error: conversaError } = await supabaseAdmin
      .from("conversas")
      .select(
        `
        id,
        empresa_id,
        integracao_whatsapp_id,
        integracoes_whatsapp (
          id,
          phone_number_id,
          token_ref,
          status
        )
      `
      )
      .eq("id", conversaId)
      .eq("empresa_id", empresaId)
      .maybeSingle();

    if (conversaError || !conversa) {
      throw new Error("Conversa não encontrada para envio dos botões da automação.");
    }

    const integracao = Array.isArray(conversa.integracoes_whatsapp)
      ? conversa.integracoes_whatsapp[0]
      : conversa.integracoes_whatsapp;

    const phoneNumberId =
      integracao?.phone_number_id || process.env.WHATSAPP_PHONE_NUMBER_ID || "";

    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN || "";

    if (!phoneNumberId) {
      throw new Error("WHATSAPP_PHONE_NUMBER_ID não configurado.");
    }

    if (!accessToken) {
      throw new Error("WHATSAPP_ACCESS_TOKEN não configurado.");
    }

  const body = {
    messaging_product: "whatsapp",
    to: numeroDestino,
    type: "interactive",
    interactive: {
      type: "button",
      body: {
        text: mensagemComVariaveis,
      },
      action: {
        buttons: botoes.slice(0, 3).map((botao) => ({
          type: "reply",
          reply: {
            id: botao.id,
            title: botao.titulo,
          },
        })),
      },
    },
  };

  const response = await fetch(
    `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  const json = await response.json();

  const mensagemExternaId = json?.messages?.[0]?.id || null;

  const protocoloAtivo = await buscarOuCriarProtocoloAutomacao({
    empresaId,
    conversaId,
  });

  const { error: insertMensagemError } = await supabaseAdmin
    .from("mensagens")
    .insert({
      empresa_id: empresaId,
      conversa_id: conversaId,
      conversa_protocolo_id: protocoloAtivo.id,
      remetente_tipo: "bot",
      remetente_id: null,
      conteudo: mensagemComVariaveis,
      tipo_mensagem: "botao",
      origem: "automatica",
      status_envio: response.ok ? "enviada" : "erro",
      mensagem_externa_id: mensagemExternaId,
      automacao_execucao_id: execucaoId,
      automacao_no_id: noId,
      metadata_json: {
        botoes,
        meta_response: json,
        erro: response.ok ? null : json,
      },
    });

  if (insertMensagemError) {
    console.error(
      "[AUTOMATION_ENGINE] Erro ao salvar mensagem de botão:",
      insertMensagemError
    );
  }

  if (!response.ok) {
    throw new Error(
      json?.error?.message || "Erro ao enviar botões pelo WhatsApp."
    );
  }

  return json;
}

async function enviarMidiaAutomacao(params: {
  empresaId: string;
  conversaId: string;
  numeroDestino: string;
  tipo: "image" | "video" | "audio";
  midiaUrl: string;
  legenda?: string;
  execucaoId: string;
  noId: string;
}) {
  const {
    empresaId,
    conversaId,
    numeroDestino,
    tipo,
    midiaUrl,
    legenda,
    execucaoId,
    noId,
  } = params;

  const { data: conversa, error: conversaError } = await supabaseAdmin
    .from("conversas")
    .select(
      `
      id,
      empresa_id,
      integracao_whatsapp_id,
      integracoes_whatsapp (
        id,
        phone_number_id,
        token_ref,
        status
      )
    `
    )
    .eq("id", conversaId)
    .eq("empresa_id", empresaId)
    .maybeSingle();

  if (conversaError || !conversa) {
    throw new Error("Conversa não encontrada para envio da mídia da automação.");
  }

  const integracao = Array.isArray(conversa.integracoes_whatsapp)
    ? conversa.integracoes_whatsapp[0]
    : conversa.integracoes_whatsapp;

  const phoneNumberId =
    integracao?.phone_number_id || process.env.WHATSAPP_PHONE_NUMBER_ID || "";

  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN || "";

  if (!phoneNumberId) {
    throw new Error("WHATSAPP_PHONE_NUMBER_ID não configurado.");
  }

  if (!accessToken) {
    throw new Error("WHATSAPP_ACCESS_TOKEN não configurado.");
  }

  const permissaoEnvio = await canSendFreeformWhatsAppMessage({
    conversaId,
  });

  if (!permissaoEnvio.podeEnviarMensagemLivre) {
    await supabaseAdmin.from("mensagens").insert({
      empresa_id: empresaId,
      conversa_id: conversaId,
      remetente_tipo: "sistema",
      conteudo:
        permissaoEnvio.motivoBloqueio ||
        "Mídia automática não enviada: janela de 24 horas encerrada.",
      tipo_mensagem: "texto",
      origem: "automatica",
      status_envio: "falha",
      automacao_execucao_id: execucaoId,
      automacao_no_id: noId,
      metadata_json: {
        motivo: "janela_24h_encerrada",
        tipo_midia: tipo,
        midia_url: midiaUrl,
      },
    });

    return {
      ok: false,
      status_envio: "falha",
      messageId: null,
      metaResponse: null,
      erro:
        permissaoEnvio.motivoBloqueio ||
        "Janela de 24 horas encerrada para mensagem livre.",
    };
  }

  const body = {
    messaging_product: "whatsapp",
    to: numeroDestino,
    type: tipo,
    [tipo]:
      tipo === "audio"
        ? {
            link: midiaUrl,
          }
        : {
            link: midiaUrl,
            ...(legenda ? { caption: legenda } : {}),
          },
  };

  const response = await fetch(
    `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  const raw = await response.json().catch(() => null);

  const messageId = raw?.messages?.[0]?.id || null;

  const protocoloAtivo = await buscarOuCriarProtocoloAutomacao({
    empresaId,
    conversaId,
  });

  const { data: mensagemSalva, error: mensagemError } = await supabaseAdmin
    .from("mensagens")
    .insert({
      empresa_id: empresaId,
      conversa_id: conversaId,
      conversa_protocolo_id: protocoloAtivo.id,
      remetente_tipo: "bot",
      conteudo: legenda || midiaUrl,
      tipo_mensagem:
        tipo === "image" ? "imagem" : tipo === "video" ? "video" : "audio",
      origem: "automatica",
      status_envio: response.ok ? "enviada" : "falha",
      mensagem_externa_id: messageId,
      automacao_execucao_id: execucaoId,
      automacao_no_id: noId,
      metadata_json: {
        tipo_midia: tipo,
        midia_url: midiaUrl,
        legenda: legenda || "",
        meta_response: raw,
        erro: response.ok ? null : raw,
      },
    })
    .select("*")
    .single();

  if (mensagemError) {
    throw new Error(`Erro ao salvar mídia da automação: ${mensagemError.message}`);
  }

  return {
    ok: response.ok,
    status_envio: response.ok ? "enviada" : "falha",
    messageId,
    metaResponse: raw,
    erro: response.ok ? null : raw,
    mensagemId: mensagemSalva?.id,
  };
}

async function buscarOuCriarProtocoloAutomacao(params: {
  empresaId: string;
  conversaId: string;
}) {
  const { empresaId, conversaId } = params;

  async function buscarProtocoloAtivo() {
    const { data, error } = await supabaseAdmin
      .from("conversa_protocolos")
      .select("id, protocolo, ativo, created_at")
      .eq("empresa_id", empresaId)
      .eq("conversa_id", conversaId)
      .eq("ativo", true)
      .order("created_at", { ascending: false })
      .limit(5);

    if (error) {
      throw new Error(
        `Erro ao buscar protocolo ativo da conversa: ${error.message}`
      );
    }

    const protocoloAtivo = data?.[0] || null;

    if (protocoloAtivo && (data || []).length > 1) {
      const idsParaDesativar = data.slice(1).map((p) => p.id);

      await supabaseAdmin
        .from("conversa_protocolos")
        .update({
          ativo: false,
          closed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("empresa_id", empresaId)
        .in("id", idsParaDesativar);
    }

    return protocoloAtivo;
  }

  const protocoloExistente = await buscarProtocoloAtivo();

  if (protocoloExistente) {
    return protocoloExistente;
  }

  const now = new Date().toISOString();
  const protocoloTexto = `AUTO-${crypto.randomUUID()}`;

  const { data: novoProtocolo, error: novoProtocoloError } =
    await supabaseAdmin
      .from("conversa_protocolos")
      .insert({
        empresa_id: empresaId,
        conversa_id: conversaId,
        protocolo: protocoloTexto,
        tipo: "automacao",
        ativo: true,
        started_at: now,
      })
      .select("id, protocolo, ativo")
      .single();

  if (novoProtocoloError) {
    if (novoProtocoloError.code === "23505") {
      const protocoloCriadoPorOutroProcesso = await buscarProtocoloAtivo();

      if (protocoloCriadoPorOutroProcesso) {
        return protocoloCriadoPorOutroProcesso;
      }
    }

    throw new Error(
      `Erro ao criar protocolo da automação: ${novoProtocoloError.message}`
    );
  }

  return novoProtocolo;
}
