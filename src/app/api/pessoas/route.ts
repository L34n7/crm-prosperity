import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { can } from "@/lib/permissoes/frontend";
import { buscarNichoEmpresa } from "@/lib/nichos/empresa-nicho";
import { getCamposPadraoNicho } from "@/lib/cadastros/form-schema";
import {
  validarDadosPersonalizados,
} from "@/lib/cadastros/validar-campos";
import { buscarCamposPersonalizados } from "@/lib/cadastros/campos-personalizados";
import { normalizarTelefoneBrasilParaWhatsApp } from "@/lib/contatos/normalizar-telefone";
import {
  getRequestAuditMetadata,
  registrarLogAuditoriaSeguro,
} from "@/lib/auditoria/logs";

const supabase = getSupabaseAdmin();

type PessoaQueryRow = Record<string, unknown> & {
  pacientes?: Record<string, unknown> | Array<Record<string, unknown>> | null;
};

type SalvarCadastroResult = {
  pessoa_id?: string;
  paciente_id?: string | null;
};

function getInteiro(
  valor: string | null,
  padrao: number,
  minimo: number,
  maximo: number
) {
  const numero = Number(valor ?? padrao);
  if (!Number.isFinite(numero)) return padrao;
  return Math.min(maximo, Math.max(minimo, Math.trunc(numero)));
}

function sanitizarBusca(valor: string) {
  return valor.replace(/[%_,()]/g, " ").trim();
}

function relacaoUnica<T>(valor: T | T[] | null | undefined): T | null {
  if (Array.isArray(valor)) return valor[0] ?? null;
  return valor ?? null;
}

export async function GET(request: Request) {
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
    const { searchParams } = new URL(request.url);
    const pagina = getInteiro(searchParams.get("pagina"), 1, 1, 1_000_000);
    const limite = getInteiro(searchParams.get("limite"), 25, 1, 100);
    const busca = sanitizarBusca(searchParams.get("busca") ?? "");
    const exibirArquivados =
      searchParams.get("status")?.toLowerCase() === "arquivados";
    const inicio = (pagina - 1) * limite;
    const fim = inicio + limite - 1;
    const nicho = await buscarNichoEmpresa(usuario.empresa_id);
    const relacaoPaciente =
      nicho.grupo === "saude"
        ? `
          pacientes!inner (
            id,
            numero_prontuario,
            convenio,
            numero_carteirinha,
            responsavel_nome,
            dados_personalizados
          )
        `
        : `
          pacientes (
            id,
            numero_prontuario,
            convenio,
            numero_carteirinha,
            responsavel_nome,
            dados_personalizados
          )
        `;

    let query = supabase
      .from("pessoas")
      .select(
        `
          id,
          empresa_id,
          tipo_pessoa,
          nome,
          nome_social,
          razao_social,
          cpf_cnpj,
          data_nascimento,
          email,
          cep,
          logradouro,
          numero,
          complemento,
          bairro,
          cidade,
          estado,
          observacoes,
          dados_personalizados,
          status,
          created_at,
          updated_at,
          contatos (
            id,
            telefone,
            whatsapp_profile_name
          ),
          ${relacaoPaciente}
        `,
        { count: "exact" }
      )
      .eq("empresa_id", usuario.empresa_id);

    query = exibirArquivados
      ? query.eq("status", "arquivado")
      : query.neq("status", "arquivado");

    if (busca) {
      query = query.or(
        `nome.ilike.%${busca}%,cpf_cnpj.ilike.%${busca}%,email.ilike.%${busca}%,cidade.ilike.%${busca}%`
      );
    }

    const [{ data, error, count }, camposPersonalizados] = await Promise.all([
      query
        .order(exibirArquivados ? "updated_at" : "created_at", {
          ascending: false,
        })
        .range(inicio, fim),
      buscarCamposPersonalizados(usuario.empresa_id),
    ]);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      contexto: {
        nicho,
        entidade: nicho.grupo === "saude" ? "paciente" : "cliente",
      },
      campos_padrao: getCamposPadraoNicho(nicho.codigo),
      campos_personalizados: camposPersonalizados,
      pessoas: ((data ?? []) as PessoaQueryRow[]).map((pessoa) => {
        const { pacientes, ...dadosPessoa } = pessoa;

        return {
          ...dadosPessoa,
          paciente:
            nicho.grupo === "saude" ? relacaoUnica(pacientes) : null,
        };
      }),
      paginacao: {
        pagina,
        limite,
        total: count ?? 0,
        total_paginas: Math.max(1, Math.ceil((count ?? 0) / limite)),
      },
      filtro_status: exibirArquivados ? "arquivados" : "ativos",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao carregar cadastros.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
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

  if (!can(usuario.permissoes, "pessoas.criar")) {
    return NextResponse.json(
      { ok: false, error: "Sem permissão para criar cadastros." },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const nome = String(body?.nome ?? "").trim();

    if (!nome) {
      return NextResponse.json(
        { ok: false, error: "Nome é obrigatório." },
        { status: 400 }
      );
    }

    const nicho = await buscarNichoEmpresa(usuario.empresa_id);
    const camposPersonalizados = await buscarCamposPersonalizados(
      usuario.empresa_id
    );
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
      status: "ativo",
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
        p_pessoa_id: null,
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

    const rpcResultado = rpcData as SalvarCadastroResult | null;
    const pessoaId = String(rpcResultado?.pessoa_id ?? "");
    const auditMeta = getRequestAuditMetadata(request);

    await registrarLogAuditoriaSeguro({
      empresa_id: usuario.empresa_id,
      categoria: "pessoas",
      entidade: "pessoa",
      entidade_id: pessoaId,
      acao: nicho.grupo === "saude" ? "paciente_criado" : "cliente_criado",
      descricao: `${nicho.cadastroSingular} ${nome} cadastrado`,
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      usuario_email: usuario.email,
      metadata: {
        tipo_cadastro: nicho.grupo === "saude" ? "paciente" : "cliente",
        paciente_id: rpcResultado?.paciente_id ?? null,
        contatos_vinculados: telefones.length,
      },
      ip: auditMeta.ip,
      user_agent: auditMeta.user_agent,
    });

    return NextResponse.json(
      {
        ok: true,
        message: `${nicho.cadastroSingular} cadastrado com sucesso.`,
        pessoa_id: pessoaId,
        paciente_id: rpcResultado?.paciente_id ?? null,
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Erro interno ao cadastrar.",
      },
      { status: 400 }
    );
  }
}
