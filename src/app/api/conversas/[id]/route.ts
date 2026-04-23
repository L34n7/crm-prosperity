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

const supabaseAdmin = getSupabaseAdmin();

type ConversaAtual = {
  id: string;
  empresa_id: string;
  contato_id: string;
  setor_id: string | null;
  responsavel_id: string | null;
  integracao_whatsapp_id: string | null;
  status: string;
  canal: string;
  origem_atendimento: string;
  prioridade: string | null;
  assunto: string | null;
  started_at?: string | null;
  created_at?: string | null;
  closed_at?: string | null;
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

  if (!(await usuarioPodeEditarConversa(usuario, conversaAtual))) {
    return NextResponse.json(
      { ok: false, error: "Você não pode editar esta conversa" },
      { status: 403 }
    );
  }

  const body = await request.json();

  const empresa_id = conversaAtual.empresa_id;
  const contato_id = body?.contato_id ?? conversaAtual.contato_id;
  const setor_id = "setor_id" in body ? body.setor_id : conversaAtual.setor_id;
  const responsavel_id =
    "responsavel_id" in body
      ? body.responsavel_id
      : conversaAtual.responsavel_id;
  const integracao_whatsapp_id =
    body?.integracao_whatsapp_id ?? conversaAtual.integracao_whatsapp_id;
  const status = body?.status ?? conversaAtual.status;
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

  const mudouSetor = setor_id !== conversaAtual.setor_id;
  const mudouResponsavel = responsavel_id !== conversaAtual.responsavel_id;

  const conversaAtualEstaEncerrada = STATUS_ENCERRADOS.includes(conversaAtual.status);
  const novoStatusEhEncerrado = STATUS_ENCERRADOS.includes(status);

  const estaEncerrando =
    novoStatusEhEncerrado && !conversaAtualEstaEncerrada;

  const estaReabrindo =
    !novoStatusEhEncerrado && conversaAtualEstaEncerrada;

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
      updateData.status = "fila";
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
      updateData.status = "fila";
    }
  }

  let dataFechamento: string | null = null;

  if (novoStatusEhEncerrado && !conversaAtual.closed_at) {
    dataFechamento = new Date().toISOString();
    updateData.closed_at = dataFechamento;
  }

  if (!novoStatusEhEncerrado && !mudouSetor) {
    updateData.closed_at = null;
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
        telefone,
        email
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

  return NextResponse.json({
    ok: true,
    message: "Conversa atualizada com sucesso",
    conversa: data,
  });
}