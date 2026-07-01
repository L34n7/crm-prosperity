import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { can } from "@/lib/permissoes/frontend";
import { buscarNichoEmpresa } from "@/lib/nichos/empresa-nicho";
import { getCamposPadraoNicho } from "@/lib/cadastros/form-schema";
import { buscarCamposPersonalizados } from "@/lib/cadastros/campos-personalizados";
import { validarDadosPersonalizados } from "@/lib/cadastros/validar-campos";
import { normalizarTelefoneBrasilParaWhatsApp } from "@/lib/contatos/normalizar-telefone";
import {
  getRequestAuditMetadata,
  registrarLogAuditoriaSeguro,
} from "@/lib/auditoria/logs";

const supabase = getSupabaseAdmin();

type PessoaDetalheRow = Record<string, unknown> & {
  nome: string;
  status: string;
  pacientes?: Record<string, unknown> | Array<Record<string, unknown>> | null;
};

type SalvarCadastroResult = {
  pessoa_id?: string;
};

function relacaoUnica<T>(valor: T | T[] | null | undefined): T | null {
  if (Array.isArray(valor)) return valor[0] ?? null;
  return valor ?? null;
}

async function buscarPessoa(empresaId: string, pessoaId: string) {
  const { data, error } = await supabase
    .from("pessoas")
    .select(
      `
        *,
        contatos (
          id,
          telefone,
          whatsapp_profile_name,
          origem,
          campanha
        ),
        pacientes (
          id,
          numero_prontuario,
          convenio,
          numero_carteirinha,
          responsavel_nome,
          dados_personalizados
        )
      `
    )
    .eq("empresa_id", empresaId)
    .eq("id", pessoaId)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao buscar cadastro: ${error.message}`);
  }

  if (!data) return null;

  const registro = data as PessoaDetalheRow;
  const { pacientes, ...dadosPessoa } = registro;

  return {
    ...dadosPessoa,
    paciente: relacaoUnica(pacientes),
  };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const resultado = await getUsuarioContexto();

  if (!resultado.ok) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status }
    );
  }

  const { usuario } = resultado;

  if (!usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuário sem empresa vinculada." },
      { status: 400 }
    );
  }

  if (!can(usuario.permissoes, "pessoas.visualizar")) {
    return NextResponse.json(
      { ok: false, error: "Sem permissão para visualizar cadastros." },
      { status: 403 }
    );
  }

  try {
    const { id } = await context.params;
    const [pessoa, nicho, camposPersonalizados] = await Promise.all([
      buscarPessoa(usuario.empresa_id, id),
      buscarNichoEmpresa(usuario.empresa_id),
      buscarCamposPersonalizados(usuario.empresa_id),
    ]);

    if (!pessoa) {
      return NextResponse.json(
        { ok: false, error: "Cadastro não encontrado." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      pessoa:
        nicho.grupo === "saude" ? pessoa : { ...pessoa, paciente: null },
      contexto: {
        nicho,
        entidade: nicho.grupo === "saude" ? "paciente" : "cliente",
      },
      campos_padrao: getCamposPadraoNicho(nicho.codigo),
      campos_personalizados: camposPersonalizados,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao buscar cadastro.",
      },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const resultado = await getUsuarioContexto();

  if (!resultado.ok) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status }
    );
  }

  const { usuario } = resultado;

  if (!usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuário sem empresa vinculada." },
      { status: 400 }
    );
  }

  if (!can(usuario.permissoes, "pessoas.editar")) {
    return NextResponse.json(
      { ok: false, error: "Sem permissão para editar cadastros." },
      { status: 403 }
    );
  }

  try {
    const { id } = await context.params;
    const body = await request.json();
    const nome = String(body?.nome ?? "").trim();

    if (!nome) {
      return NextResponse.json(
        { ok: false, error: "Nome é obrigatório." },
        { status: 400 }
      );
    }

    const [antes, nicho, camposPersonalizados] = await Promise.all([
      buscarPessoa(usuario.empresa_id, id),
      buscarNichoEmpresa(usuario.empresa_id),
      buscarCamposPersonalizados(usuario.empresa_id),
    ]);

    if (!antes) {
      return NextResponse.json(
        { ok: false, error: "Cadastro não encontrado." },
        { status: 404 }
      );
    }

    const camposPadrao = getCamposPadraoNicho(nicho.codigo);
    const camposPessoa = [
      ...camposPadrao.filter((campo) => campo.escopo === "pessoa"),
      ...camposPersonalizados
        .filter((campo) => campo.escopo === "pessoa")
        .map((campo) => ({
          chave: campo.chave,
          nome: campo.nome,
          tipo: campo.tipo,
          obrigatorio: campo.obrigatorio,
          opcoes: Array.isArray(campo.opcoes)
            ? campo.opcoes.map(String)
            : [],
        })),
    ];
    const camposPaciente = [
      ...camposPadrao.filter((campo) => campo.escopo === "paciente"),
      ...camposPersonalizados
        .filter((campo) => campo.escopo === "paciente")
        .map((campo) => ({
          chave: campo.chave,
          nome: campo.nome,
          tipo: campo.tipo,
          obrigatorio: campo.obrigatorio,
          opcoes: Array.isArray(campo.opcoes)
            ? campo.opcoes.map(String)
            : [],
        })),
    ];
    const dadosPersonalizados = validarDadosPersonalizados({
      valores: body?.dados_personalizados,
      campos: camposPessoa,
    });
    const pacienteDadosPersonalizados = validarDadosPersonalizados({
      valores: body?.paciente?.dados_personalizados,
      campos: camposPaciente,
    });
    const telefones = Array.from(
      new Set(
        (Array.isArray(body?.telefones) ? body.telefones : [])
          .map((telefone: unknown) =>
            normalizarTelefoneBrasilParaWhatsApp(String(telefone ?? ""))
          )
          .filter(Boolean)
      )
    );

    if (telefones.length > 3) {
      return NextResponse.json(
        { ok: false, error: "Informe no máximo três contatos." },
        { status: 400 }
      );
    }

    const dados = {
      tipo_pessoa:
        body?.tipo_pessoa === "juridica" ? "juridica" : "fisica",
      nome,
      nome_social: String(body?.nome_social ?? "").trim(),
      razao_social: String(body?.razao_social ?? "").trim(),
      cpf_cnpj: String(body?.cpf_cnpj ?? "").trim(),
      data_nascimento: String(body?.data_nascimento ?? "").trim(),
      email: String(body?.email ?? "").trim(),
      cep: String(body?.cep ?? "").trim(),
      logradouro: String(body?.logradouro ?? "").trim(),
      numero: String(body?.numero ?? "").trim(),
      complemento: String(body?.complemento ?? "").trim(),
      bairro: String(body?.bairro ?? "").trim(),
      cidade: String(body?.cidade ?? "").trim(),
      estado: String(body?.estado ?? "").trim(),
      observacoes: String(body?.observacoes ?? "").trim(),
      dados_personalizados: dadosPersonalizados,
      status: body?.status === "inativo" ? "inativo" : "ativo",
    };
    const paciente =
      nicho.grupo === "saude"
        ? {
            numero_prontuario: String(
              body?.paciente?.numero_prontuario ?? ""
            ).trim(),
            convenio: String(body?.paciente?.convenio ?? "").trim(),
            numero_carteirinha: String(
              body?.paciente?.numero_carteirinha ?? ""
            ).trim(),
            responsavel_nome: String(
              body?.paciente?.responsavel_nome ?? ""
            ).trim(),
            dados_personalizados: pacienteDadosPersonalizados,
          }
        : null;

    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "salvar_cadastro_pessoa",
      {
        p_empresa_id: usuario.empresa_id,
        p_usuario_id: usuario.id,
        p_pessoa_id: id,
        p_dados: dados,
        p_paciente: paciente,
        p_contatos: telefones.map((telefone) => ({ telefone })),
      }
    );

    if (rpcError) {
      const conflito =
        rpcError.message.includes("duplicate") ||
        rpcError.message.includes("já esta vinculado") ||
        rpcError.message.includes("ja esta vinculado");

      return NextResponse.json(
        { ok: false, error: rpcError.message },
        { status: conflito ? 409 : 400 }
      );
    }

    const depois = await buscarPessoa(usuario.empresa_id, id);
    const auditMeta = getRequestAuditMetadata(request);

    await registrarLogAuditoriaSeguro({
      empresa_id: usuario.empresa_id,
      categoria: "pessoas",
      entidade: "pessoa",
      entidade_id: id,
      acao:
        nicho.grupo === "saude" ? "paciente_atualizado" : "cliente_atualizado",
      descricao: `${nicho.cadastroSingular} ${nome} atualizado`,
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      usuario_email: usuario.email,
      metadata: {
        tipo_cadastro: nicho.grupo === "saude" ? "paciente" : "cliente",
        contatos_vinculados: telefones.length,
        campos_atualizados: [
          ...Object.keys(dados),
          ...(paciente ? Object.keys(paciente) : []),
        ],
      },
      ip: auditMeta.ip,
      user_agent: auditMeta.user_agent,
    });

    return NextResponse.json({
      ok: true,
      message: `${nicho.cadastroSingular} atualizado com sucesso.`,
      pessoa_id: (rpcData as SalvarCadastroResult | null)?.pessoa_id ?? id,
      pessoa:
        nicho.grupo === "saude" || !depois
          ? depois
          : { ...depois, paciente: null },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Erro interno ao atualizar.",
      },
      { status: 400 }
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const resultado = await getUsuarioContexto();

  if (!resultado.ok) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status }
    );
  }

  const { usuario } = resultado;

  if (!usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuário sem empresa vinculada." },
      { status: 400 }
    );
  }

  if (!can(usuario.permissoes, "pessoas.arquivar")) {
    return NextResponse.json(
      { ok: false, error: "Sem permissão para desarquivar cadastros." },
      { status: 403 }
    );
  }

  try {
    const { id } = await context.params;
    const body = (await request.json()) as { acao?: unknown };

    if (body.acao !== "desarquivar") {
      return NextResponse.json(
        { ok: false, error: "Ação inválida." },
        { status: 400 }
      );
    }

    const antes = await buscarPessoa(usuario.empresa_id, id);

    if (!antes) {
      return NextResponse.json(
        { ok: false, error: "Cadastro não encontrado." },
        { status: 404 }
      );
    }

    if (antes.status !== "arquivado") {
      return NextResponse.json(
        { ok: false, error: "Este cadastro não está arquivado." },
        { status: 409 }
      );
    }

    const { error } = await supabase
      .from("pessoas")
      .update({
        status: "ativo",
        updated_by: usuario.id,
      })
      .eq("empresa_id", usuario.empresa_id)
      .eq("id", id);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    const auditMeta = getRequestAuditMetadata(request);

    await registrarLogAuditoriaSeguro({
      empresa_id: usuario.empresa_id,
      categoria: "pessoas",
      entidade: "pessoa",
      entidade_id: id,
      acao: "cadastro_desarquivado",
      descricao: `Cadastro ${antes.nome} desarquivado`,
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      usuario_email: usuario.email,
      metadata: {
        status_anterior: "arquivado",
        status_novo: "ativo",
      },
      ip: auditMeta.ip,
      user_agent: auditMeta.user_agent,
    });

    return NextResponse.json({
      ok: true,
      message: "Cadastro desarquivado com sucesso.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao desarquivar.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const resultado = await getUsuarioContexto();

  if (!resultado.ok) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status }
    );
  }

  const { usuario } = resultado;

  if (!usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuário sem empresa vinculada." },
      { status: 400 }
    );
  }

  if (!can(usuario.permissoes, "pessoas.arquivar")) {
    return NextResponse.json(
      { ok: false, error: "Sem permissão para arquivar cadastros." },
      { status: 403 }
    );
  }

  try {
    const { id } = await context.params;
    const antes = await buscarPessoa(usuario.empresa_id, id);

    if (!antes) {
      return NextResponse.json(
        { ok: false, error: "Cadastro não encontrado." },
        { status: 404 }
      );
    }

    const { error } = await supabase
      .from("pessoas")
      .update({
        status: "arquivado",
        updated_by: usuario.id,
      })
      .eq("empresa_id", usuario.empresa_id)
      .eq("id", id);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    const auditMeta = getRequestAuditMetadata(request);

    await registrarLogAuditoriaSeguro({
      empresa_id: usuario.empresa_id,
      categoria: "pessoas",
      entidade: "pessoa",
      entidade_id: id,
      acao: "cadastro_arquivado",
      descricao: `Cadastro ${antes.nome} arquivado`,
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      usuario_email: usuario.email,
      metadata: {
        status_anterior: antes.status,
        status_novo: "arquivado",
      },
      ip: auditMeta.ip,
      user_agent: auditMeta.user_agent,
    });

    return NextResponse.json({
      ok: true,
      message: "Cadastro arquivado com sucesso.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Erro interno ao arquivar.",
      },
      { status: 500 }
    );
  }
}
