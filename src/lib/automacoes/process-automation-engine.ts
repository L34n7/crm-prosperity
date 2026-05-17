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

const supabaseAdmin = getSupabaseAdmin();

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

  const { data: execucaoExistente, error: execucaoError } = await supabaseAdmin
    .from("automacao_execucoes")
    .select("*")
    .eq("empresa_id", empresaId)
    .eq("conversa_id", conversaId)
    .in("status", ["rodando", "aguardando"])
    .maybeSingle();

  if (execucaoError) {
    console.error("[AUTOMATION_ENGINE] Erro ao buscar execução:", execucaoError);
    return { ok: false, error: "Erro ao buscar execução." };
  }

  if (execucaoExistente) {
    console.log("[AUTOMATION_ENGINE] Continuando execução existente", {
      execucaoId: execucaoExistente.id,
      noAtualId: execucaoExistente.no_atual_id,
      status: execucaoExistente.status,
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

        if (avaliacaoRegistrada.aguardandoComentario) {
          return {
            ok: true,
            status: "aguardando_comentario_avaliacao",
            execucaoId: execucaoExistente.id,
          };
        }
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

  await executarNo({
    empresaId,
    conversaId,
    execucaoId: execucaoCriada.id,
    fluxoId: fluxo.id,
    no: noInicial,
    mensagemTexto,
    numeroDestino,
  });

  return {
    ok: true,
    status: "execucao_criada",
    execucaoId: execucaoCriada.id,
    fluxoId: fluxo.id,
  };
}

export async function executarNo(params: {
  empresaId: string;
  conversaId: string;
  execucaoId: string;
  fluxoId: string;
  no: AutomacaoNo;
  mensagemTexto?: string;
  numeroDestino: string;
}) {
  const { empresaId, conversaId, execucaoId, fluxoId, no, mensagemTexto, numeroDestino } = params;

  console.log("[AUTOMATION_ENGINE] Executando nó", {
    noId: no.id,
    tipoNo: no.tipo_no,
  });

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

    const { data: conexoesDoNo } = await supabaseAdmin
      .from("automacao_conexoes")
      .select("id, condicao_json")
      .eq("empresa_id", empresaId)
      .eq("fluxo_id", fluxoId)
      .eq("no_origem_id", no.id)
      .eq("ativo", true);

    const precisaAguardarResposta = (conexoesDoNo || []).some((c) =>
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

      return;
    }

    await seguirParaProximoNo({
      empresaId,
      conversaId,
      execucaoId,
      fluxoId,
      noAtualId: no.id,
      numeroDestino,
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

    const resultado = await interpretarArquivoComIA({
      instrucao: instrucaoIa,
      arquivoUrl,
      mimeType: arquivo.mimeType || input.mimeType,
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
}) {
  const {
    empresaId,
    conversaId,
    execucaoId,
    fluxoId,
    noAtualId,
    mensagemTexto,
    numeroDestino,
  } = params;

  const { data: conexoes, error } = await supabaseAdmin
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

  const { data: proximoNo } = await supabaseAdmin
    .from("automacao_nos")
    .select("*")
    .eq("id", conexaoEscolhida.no_destino_id)
    .eq("empresa_id", empresaId)
    .maybeSingle();

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

    return {
      ok: false,
      status: "avaliacao_invalida",
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

async function enviarMensagemAutomacao(params: {
  empresaId: string;
  conversaId: string;
  numeroDestino: string;
  conteudo: string;
  execucaoId: string;
  noId: string;
}) {
  const { empresaId, conversaId, numeroDestino, execucaoId, noId } =
    params;

  let conteudo = params.conteudo;

  const conteudoComVariaveis = await substituirVariaveisMensagem({
    empresaId,
    execucaoId,
    texto: conteudo,
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
    throw new Error("Conversa não encontrada para envio da automação.");
  }

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

  const envio = await sendWhatsAppTextMessage({
    phoneNumberId,
    accessToken,
    to: numeroDestino,
    body: conteudoComVariaveis,
  });

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
        text: mensagem,
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
      conteudo: mensagem,
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

  const { data: protocoloAtivo, error: protocoloAtivoError } =
    await supabaseAdmin
      .from("conversa_protocolos")
      .select("id, protocolo, ativo")
      .eq("empresa_id", empresaId)
      .eq("conversa_id", conversaId)
      .eq("ativo", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

  if (protocoloAtivoError) {
    throw new Error(
      `Erro ao buscar protocolo ativo da conversa: ${protocoloAtivoError.message}`
    );
  }

  if (protocoloAtivo) {
    return protocoloAtivo;
  }

  const now = new Date().toISOString();
  const protocoloTexto = `AUTO-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

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
    throw new Error(
      `Erro ao criar protocolo da automação: ${novoProtocoloError.message}`
    );
  }

  return novoProtocolo;
}