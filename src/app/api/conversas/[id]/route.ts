import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { usuarioPertenceAoSetor } from "@/lib/usuarios/setores";
import { getUsuarioContexto, type UsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import {
  isAdministrador,
  podeAtribuirConversas,
  podeEncerrarConversas,
  podeTransferirConversas,
} from "@/lib/auth/authorization";
import {
  getRequestAuditMetadata,
  registrarLogAuditoriaSeguro,
} from "@/lib/auditoria/logs";
import { verificarEEncerrarConversaSe24hExpirada } from "@/lib/whatsapp/verificar-expiracao-conversas";

const supabaseAdmin = getSupabaseAdmin();

type ConversaAtual = {
  id: string;
  empresa_id: string;
  contato_id: string;
  setor_id: string | null;
  responsavel_id: string | null;
  integracao_whatsapp_id: string | null;
  status: string;
  bot_ativo: boolean | null;
  canal: string;
  origem_atendimento: string;
  prioridade: string | null;
  assunto: string | null;
  started_at?: string | null;
  created_at?: string | null;
  closed_at?: string | null;
  last_inbound_message_at?: string | null;
};

function isStatusValido(status: string | null) {
  if (!status) return false;

  return [
    "aberta",
    "bot",
    "fila",
    "em_atendimento",
    "aguardando_cliente",
    "encerrado_manual",
    "encerrado_24h",
    "encerrado_aut",
  ].includes(status);
}

function isCanalValido(canal: string) {
  return ["whatsapp"].includes(canal);
}

function isOrigemAtendimentoValida(origem: string) {
  return ["entrada_cliente", "bot", "manual", "reativacao"].includes(origem);
}

function isPrioridadeValida(prioridade: string) {
  return ["baixa", "media", "alta", "urgente"].includes(prioridade);
}

function formatarDataProtocolo(data: Date) {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");

  return `${ano}${mes}${dia}`;
}

async function gerarProtocolo(empresaId: string) {
  const hoje = new Date();
  const dataBase = formatarDataProtocolo(hoje);
  const prefixo = `ATD-${dataBase}-`;

  const { data, error } = await supabaseAdmin
    .from("conversa_protocolos")
    .select("protocolo")
    .eq("empresa_id", empresaId)
    .like("protocolo", `${prefixo}%`)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(`Erro ao gerar protocolo: ${error.message}`);
  }

  const ultimoProtocolo = data?.[0]?.protocolo || null;

  let sequencial = 1;

  if (ultimoProtocolo) {
    const ultimaParte = ultimoProtocolo.split("-").pop() || "0";
    const ultimoNumero = Number(ultimaParte);

    if (!Number.isNaN(ultimoNumero)) {
      sequencial = ultimoNumero + 1;
    }
  }

  return `${prefixo}${String(sequencial).padStart(6, "0")}`;
}

async function fecharProtocoloAtivo(conversaId: string, dataFechamento: string) {
  const { error } = await supabaseAdmin
    .from("conversa_protocolos")
    .update({
      ativo: false,
      closed_at: dataFechamento,
      updated_at: dataFechamento,
    })
    .eq("conversa_id", conversaId)
    .eq("ativo", true);

  if (error) {
    throw new Error(`Erro ao encerrar protocolo ativo: ${error.message}`);
  }
}

async function criarNovoProtocolo(
  empresaId: string,
  conversaId: string,
  tipo: "abertura" | "reabertura",
  startedAt?: string | null
) {
  const protocoloGerado = await gerarProtocolo(empresaId);
  const inicio = startedAt || new Date().toISOString();

  const { error } = await supabaseAdmin
    .from("conversa_protocolos")
    .insert({
      empresa_id: empresaId,
      conversa_id: conversaId,
      protocolo: protocoloGerado,
      tipo,
      ativo: true,
      started_at: inicio,
      created_at: inicio,
      updated_at: inicio,
    });

  if (error) {
    throw new Error(`Erro ao criar novo protocolo: ${error.message}`);
  }
}

async function cancelarAutomacoesAtivasDaConversa(params: {
  empresaId: string;
  conversaId: string;
  usuarioId: string;
  canceladoEm: string;
}) {
  const { empresaId, conversaId, usuarioId, canceladoEm } = params;

  const { data: execucoesAtivas, error: execucoesError } = await supabaseAdmin
    .from("automacao_execucoes")
    .select("id, metadata_json")
    .eq("empresa_id", empresaId)
    .eq("conversa_id", conversaId)
    .in("status", ["rodando", "aguardando"]);

  if (execucoesError) {
    throw new Error(
      `Erro ao buscar automacoes ativas da conversa: ${execucoesError.message}`
    );
  }

  const execucoes = execucoesAtivas || [];
  const execucaoIds = execucoes.map((execucao) => execucao.id);

  if (execucaoIds.length === 0) {
    return {
      execucoesCanceladas: 0,
    };
  }

  const resultadosCancelamento = await Promise.all(
    execucoes.map((execucao) =>
      supabaseAdmin
        .from("automacao_execucoes")
        .update({
          status: "cancelado",
          finished_at: canceladoEm,
          updated_at: canceladoEm,
          metadata_json: {
            ...(execucao.metadata_json || {}),
            motivo_cancelamento: "usuario_parou_automacao",
            cancelado_em: canceladoEm,
            usuario_responsavel_id: usuarioId,
          },
        })
        .eq("empresa_id", empresaId)
        .eq("id", execucao.id)
        .in("status", ["rodando", "aguardando"])
    )
  );

  const erroCancelamento = resultadosCancelamento.find(
    (resultado) => resultado.error
  )?.error;

  if (erroCancelamento) {
    throw new Error(
      `Erro ao cancelar automacao ativa: ${erroCancelamento.message}`
    );
  }

  const { error: agendamentosError } = await supabaseAdmin
    .from("automacao_agendamentos")
    .update({
      status: "cancelado",
    })
    .eq("empresa_id", empresaId)
    .in("execucao_id", execucaoIds)
    .eq("status", "pendente");

  if (agendamentosError) {
    throw new Error(
      `Erro ao cancelar agendamentos da automacao: ${agendamentosError.message}`
    );
  }

  return {
    execucoesCanceladas: execucaoIds.length,
  };
}

async function existeProtocoloAtivo(conversaId: string) {
  const { data, error } = await supabaseAdmin
    .from("conversa_protocolos")
    .select("id")
    .eq("conversa_id", conversaId)
    .eq("ativo", true)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao verificar protocolo ativo: ${error.message}`);
  }

  return !!data;
}

async function usuarioPodeEditarConversa(
  usuario: UsuarioContexto,
  conversa: ConversaAtual
) {
  if (!usuario.empresa_id || conversa.empresa_id !== usuario.empresa_id) {
    return false;
  }

  if (isAdministrador(usuario)) return true;

  const podeTransferir = await podeTransferirConversas(usuario);

  if (podeTransferir) {
    return await usuarioPertenceAoSetor(usuario.id, conversa.setor_id);
  }

  return conversa.responsavel_id === usuario.id;
}

async function usuarioPodeTransferir(
  usuario: UsuarioContexto,
  conversa: ConversaAtual
) {
  if (!(await podeTransferirConversas(usuario))) {
    return false;
  }

  if (!usuario.empresa_id || conversa.empresa_id !== usuario.empresa_id) {
    return false;
  }

  if (isAdministrador(usuario)) return true;

  const podeAtribuir = await podeAtribuirConversas(usuario);

  if (podeAtribuir) {
    return await usuarioPertenceAoSetor(usuario.id, conversa.setor_id);
  }

  return conversa.responsavel_id === usuario.id;
}

async function usuarioPodeAtribuir(
  usuario: UsuarioContexto,
  conversa: ConversaAtual
) {
  if (!(await podeAtribuirConversas(usuario))) {
    return false;
  }

  if (!usuario.empresa_id || conversa.empresa_id !== usuario.empresa_id) {
    return false;
  }

  if (isAdministrador(usuario)) return true;

  return await usuarioPertenceAoSetor(usuario.id, conversa.setor_id);
}

async function usuarioPodeEncerrar(
  usuario: UsuarioContexto,
  conversa: ConversaAtual
) {
  if (!(await podeEncerrarConversas(usuario))) {
    return false;
  }

  if (!usuario.empresa_id || conversa.empresa_id !== usuario.empresa_id) {
    return false;
  }

  if (isAdministrador(usuario)) return true;

  const podeAtribuir = await podeAtribuirConversas(usuario);

  if (podeAtribuir) {
    return await usuarioPertenceAoSetor(usuario.id, conversa.setor_id);
  }

  return conversa.responsavel_id === usuario.id;
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const resultado = await getUsuarioContexto();
  const auditMeta = getRequestAuditMetadata(request);

  if (!resultado.ok) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status }
    );
  }

  const { usuario } = resultado;

  const { data: conversaAtual, error: conversaAtualError } = await supabaseAdmin
    .from("conversas")
    .select("*")
    .eq("id", id)
    .maybeSingle<ConversaAtual>();

  if (conversaAtualError) {
    return NextResponse.json(
      { ok: false, error: conversaAtualError.message },
      { status: 500 }
    );
  }

  if (!conversaAtual) {
    return NextResponse.json(
      { ok: false, error: "Conversa não encontrada" },
      { status: 404 }
    );
  }

  const body = await request.json();

  const parandoAutomacaoEEncerrando =
    body?.acao === "parar_automacao_encerrar";

  if (parandoAutomacaoEEncerrando) {
    if (!(await usuarioPodeEncerrar(usuario, conversaAtual))) {
      return NextResponse.json(
        {
          ok: false,
          error: "Você não pode parar a automação e encerrar esta conversa",
        },
        { status: 403 }
      );
    }
  } else if (!(await usuarioPodeEditarConversa(usuario, conversaAtual))) {
    return NextResponse.json(
      { ok: false, error: "Você não pode editar esta conversa" },
      { status: 403 }
    );
  }

  const empresa_id = conversaAtual.empresa_id;
  const contato_id = body?.contato_id ?? conversaAtual.contato_id;
  const setor_id = "setor_id" in body ? body.setor_id : conversaAtual.setor_id;
  const responsavelIdEntrada =
    "responsavel_id" in body
      ? body.responsavel_id
      : conversaAtual.responsavel_id;
  const integracao_whatsapp_id =
    body?.integracao_whatsapp_id ?? conversaAtual.integracao_whatsapp_id;
  const status = body?.status ?? conversaAtual.status;
  const bot_ativo =
    "bot_ativo" in body
      ? Boolean(body.bot_ativo)
      : conversaAtual.bot_ativo;
  const canal = body?.canal ?? conversaAtual.canal;
  const origem_atendimento =
    body?.origem_atendimento ?? conversaAtual.origem_atendimento;
  const prioridade = body?.prioridade ?? conversaAtual.prioridade;
  const assunto =
    body?.assunto !== undefined
      ? body.assunto?.trim() || null
      : conversaAtual.assunto;

  if (!contato_id) {
    return NextResponse.json(
      { ok: false, error: "Contato é obrigatório" },
      { status: 400 }
    );
  }

  if (!isStatusValido(status)) {
    return NextResponse.json(
      { ok: false, error: "Status inválido" },
      { status: 400 }
    );
  }

  if (!isCanalValido(canal)) {
    return NextResponse.json(
      { ok: false, error: "Canal inválido" },
      { status: 400 }
    );
  }

  if (!isOrigemAtendimentoValida(origem_atendimento)) {
    return NextResponse.json(
      { ok: false, error: "Origem de atendimento inválida" },
      { status: 400 }
    );
  }

  if (prioridade && !isPrioridadeValida(prioridade)) {
    return NextResponse.json(
      { ok: false, error: "Prioridade inválida" },
      { status: 400 }
    );
  }

  const STATUS_ENCERRADOS = [
    "encerrado_manual",
    "encerrado_24h",
    "encerrado_aut",
  ];

  const conversaAtualEstaEncerrada = STATUS_ENCERRADOS.includes(conversaAtual.status);
  const novoStatusEhEncerrado =
    STATUS_ENCERRADOS.includes(status) || parandoAutomacaoEEncerrando;
  const responsavel_id = novoStatusEhEncerrado ? null : responsavelIdEntrada;
  const mudouSetor = setor_id !== conversaAtual.setor_id;
  const mudouResponsavel = responsavel_id !== conversaAtual.responsavel_id;

  const estaEncerrando =
    novoStatusEhEncerrado && !conversaAtualEstaEncerrada;

  const estaReabrindo =
    !novoStatusEhEncerrado && conversaAtualEstaEncerrada;

  if (estaReabrindo) {
    if (conversaAtual.status === "encerrado_24h") {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Esta conversa foi encerrada por 24h. Para voltar a falar com o contato, envie um template aprovado.",
        },
        { status: 400 }
      );
    }

    const expiracao = await verificarEEncerrarConversaSe24hExpirada({
      empresaId: conversaAtual.empresa_id,
      conversaId: conversaAtual.id,
      lastInboundMessageAt: conversaAtual.last_inbound_message_at ?? null,
    });

    if (expiracao.expirada) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Esta conversa ultrapassou a janela de 24 horas desde a ultima mensagem do contato. Ela foi encerrada automaticamente; para voltar a falar com o contato, envie um template aprovado.",
        },
        { status: 400 }
      );
    }
  }

  if (mudouSetor && !(await usuarioPodeTransferir(usuario, conversaAtual))) {
    return NextResponse.json(
      { ok: false, error: "Você não pode transferir esta conversa" },
      { status: 403 }
    );
  }

  const estaAtribuindoResponsavel =
    mudouResponsavel && responsavel_id !== null;

  if (
    estaAtribuindoResponsavel &&
    !(await usuarioPodeAtribuir(usuario, conversaAtual))
  ) {
    return NextResponse.json(
      { ok: false, error: "Você não pode atribuir responsável nesta conversa" },
      { status: 403 }
    );
  }

  if (estaEncerrando && !(await usuarioPodeEncerrar(usuario, conversaAtual))) {
    return NextResponse.json(
      { ok: false, error: "Você não pode encerrar esta conversa" },
      { status: 403 }
    );
  }

  const usuarioPodeAtribuirResponsavel = await podeAtribuirConversas(usuario);

  if (!usuarioPodeAtribuirResponsavel) {
    const estaReatribuindoParaOutroUsuario =
      mudouResponsavel &&
      responsavel_id !== null &&
      responsavel_id !== usuario.id;

    if (estaReatribuindoParaOutroUsuario) {
      return NextResponse.json(
        { ok: false, error: "Você não pode reatribuir conversa para outro usuário" },
        { status: 403 }
      );
    }

    if (mudouSetor && conversaAtual.responsavel_id !== usuario.id) {
      return NextResponse.json(
        {
          ok: false,
          error: "Você só pode transferir conversa sob sua responsabilidade",
        },
        { status: 403 }
      );
    }
  }

  const { data: contato } = await supabaseAdmin
    .from("contatos")
    .select("id, empresa_id")
    .eq("id", contato_id)
    .maybeSingle();

  if (!contato) {
    return NextResponse.json(
      { ok: false, error: "Contato não encontrado" },
      { status: 404 }
    );
  }

  if (contato.empresa_id !== empresa_id) {
    return NextResponse.json(
      { ok: false, error: "O contato não pertence à empresa selecionada" },
      { status: 400 }
    );
  }

  if (setor_id) {
    const { data: setor } = await supabaseAdmin
      .from("setores")
      .select("id, empresa_id")
      .eq("id", setor_id)
      .maybeSingle();

    if (!setor) {
      return NextResponse.json(
        { ok: false, error: "Setor não encontrado" },
        { status: 404 }
      );
    }

    if (setor.empresa_id !== empresa_id) {
      return NextResponse.json(
        { ok: false, error: "O setor não pertence à empresa selecionada" },
        { status: 400 }
      );
    }
  }

  if (responsavel_id !== null && responsavel_id !== undefined) {
    const { data: responsavel } = await supabaseAdmin
      .from("usuarios")
      .select("id, empresa_id, status")
      .eq("id", responsavel_id)
      .maybeSingle();

    if (!responsavel) {
      return NextResponse.json(
        { ok: false, error: "Responsável não encontrado" },
        { status: 404 }
      );
    }

    if (responsavel.empresa_id !== empresa_id) {
      return NextResponse.json(
        { ok: false, error: "O responsável não pertence à empresa selecionada" },
        { status: 400 }
      );
    }

    if (responsavel.status !== "ativo") {
      return NextResponse.json(
        { ok: false, error: "O responsável precisa estar ativo" },
        { status: 400 }
      );
    }

    if (setor_id) {
      const responsavelPertenceAoSetor = await usuarioPertenceAoSetor(
        responsavel.id,
        setor_id
      );

      if (!responsavelPertenceAoSetor) {
        return NextResponse.json(
          {
            ok: false,
            error: "O responsável não pertence ao setor selecionado",
          },
          { status: 400 }
        );
      }
    }
  }

  if (mudouSetor && setor_id) {
    const usuarioPodeTransferirParaNovoSetor =
      isAdministrador(usuario) || usuario.setores_ids.includes(setor_id);

    if (!usuarioPodeTransferirParaNovoSetor) {
      return NextResponse.json(
        {
          ok: false,
          error: "Você só pode transferir para setores aos quais pertence",
        },
        { status: 403 }
      );
    }
  }

  if (integracao_whatsapp_id) {
    const { data: integracao } = await supabaseAdmin
      .from("integracoes_whatsapp")
      .select("id, empresa_id")
      .eq("id", integracao_whatsapp_id)
      .maybeSingle();

    if (!integracao) {
      return NextResponse.json(
        { ok: false, error: "Integração WhatsApp não encontrada" },
        { status: 404 }
      );
    }

    if (integracao.empresa_id !== empresa_id) {
      return NextResponse.json(
        { ok: false, error: "A integração não pertence à empresa selecionada" },
        { status: 400 }
      );
    }
  }

  const updateData: Record<string, unknown> = {
    contato_id,
    setor_id,
    responsavel_id,
    integracao_whatsapp_id,
    status,
    bot_ativo,
    canal,
    origem_atendimento,
    prioridade,
    assunto,
  };

  if (mudouSetor) {
    updateData.setor_id = setor_id;

    const limparResponsavel = true;

    if (limparResponsavel) {
      updateData.responsavel_id = null;
      if (!novoStatusEhEncerrado) {
        updateData.status = "fila";
      }
    } else {
      if (conversaAtual.responsavel_id) {
        updateData.status = "em_atendimento";
      }
    }
  }

  if (mudouResponsavel) {
    updateData.responsavel_id = responsavel_id;

    if (responsavel_id) {
      updateData.status = "em_atendimento";
    } else {
      if (!novoStatusEhEncerrado) {
        updateData.status = "fila";
      }
    }
  }

  if (parandoAutomacaoEEncerrando) {
    updateData.status = "encerrado_manual";
    updateData.bot_ativo = false;
    updateData.responsavel_id = null;
    updateData.origem_atendimento = "manual";
  }

  let dataFechamento: string | null = null;

  if (novoStatusEhEncerrado && !conversaAtual.closed_at) {
    dataFechamento = new Date().toISOString();
    updateData.closed_at = dataFechamento;
  }

  if (!novoStatusEhEncerrado && !mudouSetor) {
    updateData.closed_at = null;
  }

  let automacoesCanceladas = 0;

  if (parandoAutomacaoEEncerrando) {
    const resultadoCancelamento = await cancelarAutomacoesAtivasDaConversa({
      empresaId: empresa_id,
      conversaId: id,
      usuarioId: usuario.id,
      canceladoEm: dataFechamento || new Date().toISOString(),
    });

    automacoesCanceladas = resultadoCancelamento.execucoesCanceladas;
  }

  const { data, error } = await supabaseAdmin
    .from("conversas")
    .update(updateData)
    .eq("id", id)
    .select(`
      *,
      contatos (
        id,
        nome,
        whatsapp_profile_name,
        telefone,
        email,
        empresa,
        observacoes,
        campanha,
        rastreamento_campanha_id,
        rastreamento_campanhas (
          id,
          nome,
          status,
          rastreamento_origens (
            id,
            nome
          )
        )
      ),
      setores (
        id,
        nome
      ),
      responsavel:usuarios (
        id,
        nome,
        email
      )
    `)
    .single();

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  try {
    if (estaEncerrando) {
      await fecharProtocoloAtivo(id, dataFechamento || new Date().toISOString());
    }

    if (estaReabrindo) {
      const jaExisteProtocoloAtivo = await existeProtocoloAtivo(id);

      if (!jaExisteProtocoloAtivo) {
        await criarNovoProtocolo(
          empresa_id,
          id,
          "reabertura",
          new Date().toISOString()
        );
      }
    }
  } catch (protocoloError) {
    return NextResponse.json(
      {
        ok: false,
        error:
          protocoloError instanceof Error
            ? protocoloError.message
            : "Erro ao atualizar protocolo da conversa",
      },
      { status: 500 }
    );
  }

  const acao = parandoAutomacaoEEncerrando
    ? "automacao_parada_conversa_encerrada"
    : estaEncerrando
    ? "conversa_encerrada"
    : estaReabrindo
    ? "conversa_reaberta"
    : mudouSetor
    ? "conversa_transferida"
    : mudouResponsavel
    ? "conversa_atribuida"
    : "conversa_atualizada";

  await registrarLogAuditoriaSeguro({
    empresa_id,
    categoria: "conversas",
    entidade: "conversa",
    entidade_id: id,
    acao,
    descricao: parandoAutomacaoEEncerrando
      ? "Automação parada e conversa encerrada manualmente"
      : "Conversa atualizada",
    usuario_id: usuario.id,
    usuario_nome: usuario.nome,
    usuario_email: usuario.email,
    antes: {
      contato_id: conversaAtual.contato_id,
      setor_id: conversaAtual.setor_id,
      responsavel_id: conversaAtual.responsavel_id,
      status: conversaAtual.status,
      bot_ativo: conversaAtual.bot_ativo,
      prioridade: conversaAtual.prioridade,
      assunto: conversaAtual.assunto,
      closed_at: conversaAtual.closed_at ?? null,
    },
    depois: {
      contato_id: data.contato_id,
      setor_id: data.setor_id,
      responsavel_id: data.responsavel_id,
      status: data.status,
      bot_ativo: data.bot_ativo,
      prioridade: data.prioridade,
      assunto: data.assunto,
      closed_at: data.closed_at ?? null,
      automacoes_canceladas: automacoesCanceladas,
    },
    ip: auditMeta.ip,
    user_agent: auditMeta.user_agent,
  });

  return NextResponse.json({
    ok: true,
    message: parandoAutomacaoEEncerrando
      ? "Automação parada e conversa encerrada com sucesso."
      : "Conversa atualizada com sucesso",
    conversa: data,
  });
}
