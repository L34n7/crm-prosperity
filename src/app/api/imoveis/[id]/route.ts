import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { can } from "@/lib/permissoes/frontend";
import { buscarNichoEmpresa } from "@/lib/nichos/empresa-nicho";
import {
  getRequestAuditMetadata,
  registrarLogAuditoriaSeguro,
} from "@/lib/auditoria/logs";

const supabase = getSupabaseAdmin();

function texto(valor: unknown) {
  return String(valor ?? "").trim();
}

function numeroDecimal(valor: unknown) {
  const entrada = texto(valor).replace(/[^\d,.-]/g, "");
  if (!entrada) return null;

  const normalizado = entrada.includes(",")
    ? entrada.replace(/\./g, "").replace(",", ".")
    : entrada;
  const numero = Number(normalizado);
  return Number.isFinite(numero) ? numero : null;
}

function numeroInteiro(valor: unknown) {
  const entrada = texto(valor);
  if (!entrada) return null;

  const numero = Number(entrada);
  return Number.isFinite(numero) ? Math.max(0, Math.trunc(numero)) : null;
}

function normalizarPayloadImovel(body: Record<string, unknown>) {
  const titulo = texto(body?.titulo);

  if (!titulo) {
    throw new Error("Título do imóvel é obrigatório.");
  }

  const finalidadeInformada = texto(body?.finalidade);
  const statusInformado = texto(body?.status);

  const finalidade = ["venda", "locacao", "venda_locacao"].includes(
    finalidadeInformada
  )
    ? finalidadeInformada
    : "venda";

  const status = [
    "disponivel",
    "reservado",
    "vendido",
    "alugado",
    "inativo",
  ].includes(statusInformado)
    ? statusInformado
    : "disponivel";

  return {
    titulo,
    codigo: texto(body?.codigo) || null,
    tipo: texto(body?.tipo) || "apartamento",
    finalidade,
    status,
    valor: numeroDecimal(body?.valor),
    valor_condominio: numeroDecimal(body?.valor_condominio),
    valor_iptu: numeroDecimal(body?.valor_iptu),
    cep: texto(body?.cep) || null,
    logradouro: texto(body?.logradouro) || null,
    numero: texto(body?.numero) || null,
    complemento: texto(body?.complemento) || null,
    bairro: texto(body?.bairro) || null,
    cidade: texto(body?.cidade) || null,
    estado: texto(body?.estado).toUpperCase() || null,
    quartos: numeroInteiro(body?.quartos),
    suites: numeroInteiro(body?.suites),
    banheiros: numeroInteiro(body?.banheiros),
    vagas: numeroInteiro(body?.vagas),
    area_m2: numeroDecimal(body?.area_m2),
    descricao: texto(body?.descricao) || null,
    caracteristicas: {},
    fotos: [],
  };
}

async function garantirAcessoImobiliario(
  permissoes: string[],
  permissao: string,
  empresaId: string
) {
  if (!can(permissoes, permissao)) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "Sem permissão para acessar imóveis." },
        { status: 403 }
      ),
    };
  }

  const nicho = await buscarNichoEmpresa(empresaId);

  if (!nicho.modulos.includes("imobiliario.imoveis")) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "Imóveis não está disponível para este nicho." },
        { status: 403 }
      ),
    };
  }

  return { ok: true as const, nicho };
}

async function buscarImovel(empresaId: string, id: string) {
  const { data, error } = await supabase
    .from("imoveis")
    .select("*")
    .eq("empresa_id", empresaId)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao buscar imóvel: ${error.message}`);
  }

  return data;
}

async function verificarPessoaEmpresa(empresaId: string, pessoaId: string) {
  if (!pessoaId) return null;

  const { data, error } = await supabase
    .from("pessoas")
    .select("id")
    .eq("empresa_id", empresaId)
    .eq("id", pessoaId)
    .neq("status", "arquivado")
    .maybeSingle<{ id: string }>();

  if (error) {
    throw new Error(`Erro ao validar proprietário: ${error.message}`);
  }

  return data;
}

async function sincronizarProprietario(
  empresaId: string,
  imovelId: string,
  pessoaId: string | null,
  usuarioId: string
) {
  await supabase
    .from("imovel_pessoas")
    .update({ status: "arquivado" })
    .eq("empresa_id", empresaId)
    .eq("imovel_id", imovelId)
    .eq("papel", "proprietario");

  if (!pessoaId) return;

  const { error } = await supabase.from("imovel_pessoas").upsert(
    {
      empresa_id: empresaId,
      imovel_id: imovelId,
      pessoa_id: pessoaId,
      papel: "proprietario",
      status: "ativo",
      created_by: usuarioId,
    },
    { onConflict: "empresa_id,imovel_id,pessoa_id,papel" }
  );

  if (error) {
    throw new Error(`Erro ao vincular proprietário: ${error.message}`);
  }
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

  try {
    const acesso = await garantirAcessoImobiliario(
      usuario.permissoes,
      "imoveis.visualizar",
      usuario.empresa_id
    );

    if (!acesso.ok) return acesso.response;

    const { id } = await context.params;
    const imovel = await buscarImovel(usuario.empresa_id, id);

    if (!imovel || imovel.status === "arquivado") {
      return NextResponse.json(
        { ok: false, error: "Imóvel não encontrado." },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, imovel });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao buscar imóvel.",
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

  try {
    const acesso = await garantirAcessoImobiliario(
      usuario.permissoes,
      "imoveis.editar",
      usuario.empresa_id
    );

    if (!acesso.ok) return acesso.response;

    const { id } = await context.params;
    const antes = await buscarImovel(usuario.empresa_id, id);

    if (!antes || antes.status === "arquivado") {
      return NextResponse.json(
        { ok: false, error: "Imóvel não encontrado." },
        { status: 404 }
      );
    }

    const body = (await request.json()) as Record<string, unknown>;
    const proprietarioId = texto(body?.proprietario_pessoa_id);

    if (proprietarioId) {
      const pessoa = await verificarPessoaEmpresa(
        usuario.empresa_id,
        proprietarioId
      );

      if (!pessoa) {
        return NextResponse.json(
          { ok: false, error: "Proprietário não encontrado." },
          { status: 404 }
        );
      }
    }

    const payload = normalizarPayloadImovel(body);
    const { data, error } = await supabase
      .from("imoveis")
      .update({
        proprietario_pessoa_id: proprietarioId || null,
        ...payload,
        updated_by: usuario.id,
      })
      .eq("empresa_id", usuario.empresa_id)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 400 }
      );
    }

    await sincronizarProprietario(
      usuario.empresa_id,
      id,
      proprietarioId || null,
      usuario.id
    );

    const auditMeta = getRequestAuditMetadata(request);

    await registrarLogAuditoriaSeguro({
      empresa_id: usuario.empresa_id,
      categoria: "imobiliario",
      entidade: "imovel",
      entidade_id: id,
      acao: "imovel_atualizado",
      descricao: `Imóvel ${payload.titulo} atualizado`,
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      usuario_email: usuario.email,
      metadata: {
        status_anterior: antes.status,
        status_novo: data.status,
        proprietario_pessoa_id: proprietarioId || null,
      },
      ip: auditMeta.ip,
      user_agent: auditMeta.user_agent,
    });

    return NextResponse.json({
      ok: true,
      message: "Imóvel atualizado com sucesso.",
      imovel: data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao atualizar imóvel.",
      },
      { status: 400 }
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

  try {
    const acesso = await garantirAcessoImobiliario(
      usuario.permissoes,
      "imoveis.arquivar",
      usuario.empresa_id
    );

    if (!acesso.ok) return acesso.response;

    const { id } = await context.params;
    const antes = await buscarImovel(usuario.empresa_id, id);

    if (!antes || antes.status === "arquivado") {
      return NextResponse.json(
        { ok: false, error: "Imóvel não encontrado." },
        { status: 404 }
      );
    }

    const { error } = await supabase
      .from("imoveis")
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

    await supabase
      .from("imovel_pessoas")
      .update({ status: "arquivado" })
      .eq("empresa_id", usuario.empresa_id)
      .eq("imovel_id", id);

    const auditMeta = getRequestAuditMetadata(request);

    await registrarLogAuditoriaSeguro({
      empresa_id: usuario.empresa_id,
      categoria: "imobiliario",
      entidade: "imovel",
      entidade_id: id,
      acao: "imovel_arquivado",
      descricao: `Imóvel ${antes.titulo ?? id} arquivado`,
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
      message: "Imóvel arquivado com sucesso.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao arquivar imóvel.",
      },
      { status: 500 }
    );
  }
}
