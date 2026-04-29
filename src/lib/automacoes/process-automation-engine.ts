import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type {
  AutomationEngineInput,
  AutomacaoGatilho,
  AutomacaoNo,
} from "./types";
import { gatilhoCombinaComMensagem } from "./match-trigger";
import { sendWhatsAppTextMessage } from "@/lib/whatsapp/send-text-message";
import { canSendFreeformWhatsAppMessage } from "@/lib/whatsapp/can-send-message";

const supabaseAdmin = getSupabaseAdmin();

export async function processAutomationEngine(input: AutomationEngineInput) {
  const { empresaId, conversaId, contatoId, mensagemTexto, numeroDestino } = input;

  console.log("[AUTOMATION_ENGINE] Iniciando motor", {
    empresaId,
    conversaId,
    contatoId,
    mensagemTexto,
  });

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

  await executarNo({
    empresaId,
    conversaId,
    execucaoId: execucaoExistente.id,
    fluxoId: execucaoExistente.fluxo_id,
    no: noAtual,
    mensagemTexto,
    numeroDestino,
  });

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

  if (!gatilhoEncontrado) {
    console.log("[AUTOMATION_ENGINE] Nenhum gatilho encontrado.");
    return { ok: true, status: "sem_gatilho" };
  }

  const { data: fluxo, error: fluxoError } = await supabaseAdmin
    .from("automacao_fluxos")
    .select("*")
    .eq("id", gatilhoEncontrado.fluxo_id)
    .eq("empresa_id", empresaId)
    .eq("status", "ativo")
    .maybeSingle();

  if (fluxoError) {
    console.error("[AUTOMATION_ENGINE] Erro ao buscar fluxo:", fluxoError);
    return { ok: false, error: "Erro ao buscar fluxo." };
  }

  if (!fluxo) {
    console.log("[AUTOMATION_ENGINE] Gatilho encontrado, mas fluxo não está ativo.");
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
        gatilho_id: gatilhoEncontrado.id,
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
    descricao: "Execução iniciada por palavra-chave.",
    entrada: {
      mensagemTexto,
      gatilho: gatilhoEncontrado,
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

async function executarNo(params: {
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

  if (no.tipo_no === "encerrar") {
    await supabaseAdmin
      .from("automacao_execucoes")
      .update({
        status: "finalizado",
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", execucaoId)
      .eq("empresa_id", empresaId);

    await registrarLog({
      empresaId,
      execucaoId,
      fluxoId,
      noId: no.id,
      tipoEvento: "execucao_finalizada",
      descricao: "Execução finalizada pelo nó encerrar.",
      entrada: {},
      saida: {},
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
    numeroDestino 
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

  // 🔥 NOVO: lógica de decisão
  let conexaoEscolhida = conexoes[0];

  if (mensagemTexto) {
    const msg = mensagemTexto.trim().toLowerCase();

    const conexoesComCondicao = conexoes.filter((c) => {
      const cond = c.condicao_json;
      return cond && cond.tipo;
    });

    const encontrada = conexoesComCondicao.find((c) => {
      const cond = c.condicao_json;

      if (cond.tipo === "resposta_igual") {
        return String(cond.valor || "").trim().toLowerCase() === msg;
      }

      if (cond.tipo === "resposta_contem") {
        return msg.includes(String(cond.valor || "").trim().toLowerCase());
      }

      return false;
    });

    if (encontrada) {
      conexaoEscolhida = encontrada;
    } else if (conexoesComCondicao.length > 0) {
      await enviarMensagemAutomacao({
        empresaId,
        conversaId,
        numeroDestino,
        conteudo: "Opção inválida. Por favor, escolha uma das opções disponíveis.",
        execucaoId,
        noId: noAtualId,
      });

      await registrarLog({
        empresaId,
        execucaoId,
        fluxoId,
        noId: noAtualId,
        tipoEvento: "resposta_invalida",
        descricao: "Cliente enviou uma resposta que não corresponde a nenhuma conexão.",
        entrada: {
          mensagemTexto,
        },
        saida: {
          mensagem: "Opção inválida enviada ao cliente.",
        },
      });

      return;
    }
  }

  const { data: proximoNo } = await supabaseAdmin
    .from("automacao_nos")
    .select("*")
    .eq("id", conexaoEscolhida.no_destino_id)
    .single();

  if (!proximoNo) return;

  await supabaseAdmin
    .from("automacao_execucoes")
    .update({
      no_atual_id: proximoNo.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", execucaoId);

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

async function finalizarExecucao(execucaoId: string, empresaId: string) {
  await supabaseAdmin
    .from("automacao_execucoes")
    .update({
      status: "finalizado",
      finished_at: new Date().toISOString(),
    })
    .eq("id", execucaoId)
    .eq("empresa_id", empresaId);
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
  const { empresaId, conversaId, numeroDestino, conteudo, execucaoId, noId } =
    params;

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
      metadata_json: {
        automacao_execucao_id: execucaoId,
        automacao_no_id: noId,
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
    body: conteudo,
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
      conteudo,
      tipo_mensagem: "texto",
      origem: "automatica",
      status_envio: envio.ok ? "enviada" : "falha",
      mensagem_externa_id: envio.messageId,
      metadata_json: {
        automacao_execucao_id: execucaoId,
        automacao_no_id: noId,
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