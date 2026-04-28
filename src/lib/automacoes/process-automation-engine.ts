import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type {
  AutomationEngineInput,
  AutomacaoGatilho,
  AutomacaoNo,
} from "./types";
import { gatilhoCombinaComMensagem } from "./match-trigger";

const supabaseAdmin = getSupabaseAdmin();

export async function processAutomationEngine(input: AutomationEngineInput) {
  const { empresaId, conversaId, contatoId, mensagemTexto } = input;

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
    console.log("[AUTOMATION_ENGINE] Já existe execução ativa", {
      execucaoId: execucaoExistente.id,
    });

    return {
      ok: true,
      status: "execucao_existente",
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

  const { data: execucaoCriada, error: criarExecucaoError } = await supabaseAdmin
    .from("automacao_execucoes")
    .insert({
      empresa_id: empresaId,
      fluxo_id: fluxo.id,
      contato_id: contatoId,
      conversa_id: conversaId,
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
}) {
  const { empresaId, conversaId, execucaoId, fluxoId, no } = params;

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
    });

    return;
  }

  if (no.tipo_no === "enviar_texto") {
    const mensagem = no.configuracao_json?.mensagem;

    if (mensagem) {
      await supabaseAdmin.from("mensagens").insert({
        empresa_id: empresaId,
        conversa_id: conversaId,
        remetente_tipo: "bot",
        conteudo: mensagem,
        tipo_mensagem: "texto",
        origem: "automatica",
        status_envio: "enviada",
        metadata_json: {
          automacao_execucao_id: execucaoId,
          automacao_no_id: no.id,
        },
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
}) {
  const { empresaId, conversaId, execucaoId, fluxoId, noAtualId } = params;

  const { data: conexao, error: conexaoError } = await supabaseAdmin
    .from("automacao_conexoes")
    .select("*")
    .eq("empresa_id", empresaId)
    .eq("fluxo_id", fluxoId)
    .eq("no_origem_id", noAtualId)
    .eq("ativo", true)
    .order("ordem", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (conexaoError) {
    console.error("[AUTOMATION_ENGINE] Erro ao buscar conexão:", conexaoError);
    return;
  }

  if (!conexao) {
    await supabaseAdmin
      .from("automacao_execucoes")
      .update({
        status: "finalizado",
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", execucaoId)
      .eq("empresa_id", empresaId);

    return;
  }

  const { data: proximoNo, error: proximoNoError } = await supabaseAdmin
    .from("automacao_nos")
    .select("*")
    .eq("id", conexao.no_destino_id)
    .eq("empresa_id", empresaId)
    .eq("ativo", true)
    .maybeSingle();

  if (proximoNoError) {
    console.error("[AUTOMATION_ENGINE] Erro ao buscar próximo nó:", proximoNoError);
    return;
  }

  if (!proximoNo) {
    console.log("[AUTOMATION_ENGINE] Próximo nó não encontrado.");
    return;
  }

  await supabaseAdmin
    .from("automacao_execucoes")
    .update({
      no_atual_id: proximoNo.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", execucaoId)
    .eq("empresa_id", empresaId);

  await registrarLog({
    empresaId,
    execucaoId,
    fluxoId,
    noId: proximoNo.id,
    conexaoId: conexao.id,
    tipoEvento: "transicao_no",
    descricao: "Execução avançou para o próximo nó.",
    entrada: {
      no_origem_id: noAtualId,
      no_destino_id: proximoNo.id,
    },
    saida: {
      conexao_id: conexao.id,
    },
  });

  await executarNo({
    empresaId,
    conversaId,
    execucaoId,
    fluxoId,
    no: proximoNo,
  });
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