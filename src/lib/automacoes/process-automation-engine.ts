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

if (execucaoExistente.status === "aguardando") {
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

    return;
  }

  if (no.tipo_no === "enviar_imagem" || no.tipo_no === "enviar_video") {
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

    await enviarMidiaAutomacao({
      empresaId,
      conversaId,
      numeroDestino,
      tipo: no.tipo_no === "enviar_imagem" ? "image" : "video",
      midiaUrl,
      legenda,
      execucaoId,
      noId: no.id,
    });

    await registrarLog({
      empresaId,
      execucaoId,
      fluxoId,
      noId: no.id,
      tipoEvento: "no_executado",
      descricao:
        no.tipo_no === "enviar_imagem"
          ? "Imagem enviada pela automação."
          : "Vídeo enviado pela automação.",
      entrada: no.configuracao_json,
      saida: {
        midia_url: midiaUrl,
        legenda,
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


async function enviarMidiaAutomacao(params: {
  empresaId: string;
  conversaId: string;
  numeroDestino: string;
  tipo: "image" | "video";
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
      metadata_json: {
        automacao_execucao_id: execucaoId,
        automacao_no_id: noId,
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
    [tipo]: {
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
      tipo_mensagem: tipo === "image" ? "imagem" : "video",
      origem: "automatica",
      status_envio: response.ok ? "enviada" : "falha",
      mensagem_externa_id: messageId,
      metadata_json: {
        automacao_execucao_id: execucaoId,
        automacao_no_id: noId,
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