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

type PessoaOpcao = {
  id: string;
  nome: string;
  cpf_cnpj: string | null;
  email: string | null;
};

type ImovelRow = Record<string, unknown> & {
  id: string;
  proprietario_pessoa_id: string | null;
};

type PublicacaoRow = Record<string, unknown> & {
  id: string;
  imovel_id: string;
  canal_codigo: string;
  status: string;
};

function texto(valor: unknown) {
  return String(valor ?? "").trim();
}

function sanitizarBusca(valor: string) {
  return valor.replace(/[%_,()]/g, " ").trim();
}

function sanitizarCodigoFiltro(valor: string | null) {
  return texto(valor)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 80);
}

function normalizarUrlHttp(valor: unknown) {
  const url = texto(valor);
  if (!url) return null;

  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

function normalizarFotos(valor: unknown) {
  if (!Array.isArray(valor)) return [];

  const urls = valor
    .map((foto) => {
      if (typeof foto === "string") return normalizarUrlHttp(foto);
      if (!foto || typeof foto !== "object") return null;

      const item = foto as Record<string, unknown>;
      return normalizarUrlHttp(item.url ?? item.src ?? item.original);
    })
    .filter((url): url is string => Boolean(url));

  return Array.from(new Set(urls)).slice(0, 50);
}

function primeiraFoto(valor: unknown) {
  return normalizarFotos(valor)[0] ?? null;
}

function normalizarCaracteristicas(valor: unknown) {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return {};
  return valor as Record<string, unknown>;
}

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

function numeroFiltro(valor: string | null) {
  if (!valor) return null;
  const numero = Number(valor.replace(",", "."));
  return Number.isFinite(numero) && numero >= 0 ? numero : null;
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
    caracteristicas: normalizarCaracteristicas(body?.caracteristicas),
    fotos: normalizarFotos(body?.fotos),
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

async function listarPessoasOpcoes(empresaId: string) {
  const { data, error } = await supabase
    .from("pessoas")
    .select("id, nome, cpf_cnpj, email")
    .eq("empresa_id", empresaId)
    .neq("status", "arquivado")
    .order("nome", { ascending: true })
    .limit(300);

  if (error) {
    throw new Error(`Erro ao carregar clientes: ${error.message}`);
  }

  return (data ?? []) as PessoaOpcao[];
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

  try {
    const acesso = await garantirAcessoImobiliario(
      usuario.permissoes,
      "imoveis.visualizar",
      usuario.empresa_id
    );

    if (!acesso.ok) return acesso.response;

    const { searchParams } = new URL(request.url);
    const pagina = getInteiro(searchParams.get("pagina"), 1, 1, 1_000_000);
    const limite = getInteiro(searchParams.get("limite"), 24, 1, 100);
    const busca = sanitizarBusca(searchParams.get("busca") ?? "");
    const tipo = sanitizarCodigoFiltro(searchParams.get("tipo"));
    const finalidade = sanitizarCodigoFiltro(searchParams.get("finalidade"));
    const status = sanitizarCodigoFiltro(searchParams.get("status"));
    const cidade = sanitizarBusca(searchParams.get("cidade") ?? "");
    const estadoInformado = texto(searchParams.get("estado")).toUpperCase();
    const estado = /^[A-Z]{2}$/.test(estadoInformado) ? estadoInformado : "";
    const quartosMin = numeroFiltro(searchParams.get("quartos_min"));
    const valorMin = numeroFiltro(searchParams.get("valor_min"));
    const valorMax = numeroFiltro(searchParams.get("valor_max"));
    const areaMin = numeroFiltro(searchParams.get("area_min"));
    const areaMax = numeroFiltro(searchParams.get("area_max"));
    const ordenacao = texto(searchParams.get("ordenacao"));
    const inicio = (pagina - 1) * limite;
    const fim = inicio + limite - 1;

    let query = supabase
      .from("imoveis")
      .select("*", { count: "exact" })
      .eq("empresa_id", usuario.empresa_id)
      .neq("status", "arquivado");

    if (busca) {
      query = query.or(
        `titulo.ilike.%${busca}%,codigo.ilike.%${busca}%,logradouro.ilike.%${busca}%,bairro.ilike.%${busca}%,cidade.ilike.%${busca}%`
      );
    }

    if (tipo) query = query.eq("tipo", tipo);
    if (["venda", "locacao", "venda_locacao"].includes(finalidade)) {
      query = query.eq("finalidade", finalidade);
    }
    if (
      ["disponivel", "reservado", "vendido", "alugado", "inativo"].includes(
        status
      )
    ) {
      query = query.eq("status", status);
    }
    if (cidade) query = query.ilike("cidade", `%${cidade}%`);
    if (estado) query = query.eq("estado", estado);
    if (quartosMin !== null) query = query.gte("quartos", quartosMin);
    if (valorMin !== null) query = query.gte("valor", valorMin);
    if (valorMax !== null) query = query.lte("valor", valorMax);
    if (areaMin !== null) query = query.gte("area_m2", areaMin);
    if (areaMax !== null) query = query.lte("area_m2", areaMax);

    if (ordenacao === "valor_asc") {
      query = query.order("valor", { ascending: true, nullsFirst: false });
    } else if (ordenacao === "valor_desc") {
      query = query.order("valor", { ascending: false, nullsFirst: false });
    } else if (ordenacao === "area_desc") {
      query = query.order("area_m2", { ascending: false, nullsFirst: false });
    } else if (ordenacao === "titulo_asc") {
      query = query.order("titulo", { ascending: true });
    } else {
      query = query.order("created_at", { ascending: false });
    }

    const [{ data, error, count }, pessoas] = await Promise.all([
      query.range(inicio, fim),
      listarPessoasOpcoes(usuario.empresa_id),
    ]);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    const imoveisRaw = (data ?? []) as ImovelRow[];
    const imovelIds = imoveisRaw.map((imovel) => imovel.id);
    const publicacoesPorImovel = new Map<string, PublicacaoRow[]>();
    const leadsPorImovel = new Map<string, number>();

    if (imovelIds.length > 0) {
      const [
        { data: publicacoes, error: publicacoesError },
        { data: leads, error: leadsError },
      ] = await Promise.all([
        supabase
          .from("imovel_publicacoes")
          .select("*")
          .eq("empresa_id", usuario.empresa_id)
          .in("imovel_id", imovelIds)
          .order("updated_at", { ascending: false }),
        supabase
          .from("imovel_leads_portal")
          .select("imovel_id")
          .eq("empresa_id", usuario.empresa_id)
          .neq("status", "arquivado")
          .in("imovel_id", imovelIds),
      ]);

      if (publicacoesError || leadsError) {
        return NextResponse.json(
          {
            ok: false,
            error:
              publicacoesError?.message ||
              leadsError?.message ||
              "Erro ao carregar integracoes imobiliarias.",
          },
          { status: 500 }
        );
      }

      for (const publicacao of (publicacoes ?? []) as PublicacaoRow[]) {
        const lista = publicacoesPorImovel.get(publicacao.imovel_id) ?? [];
        lista.push(publicacao);
        publicacoesPorImovel.set(publicacao.imovel_id, lista);
      }

      for (const lead of (leads ?? []) as Array<{ imovel_id: string | null }>) {
        if (!lead.imovel_id) continue;
        leadsPorImovel.set(
          lead.imovel_id,
          (leadsPorImovel.get(lead.imovel_id) ?? 0) + 1
        );
      }
    }

    const pessoasPorId = new Map(pessoas.map((pessoa) => [pessoa.id, pessoa]));

    return NextResponse.json({
      ok: true,
      contexto: {
        nicho: acesso.nicho,
      },
      imoveis: imoveisRaw.map((imovel) => ({
        ...imovel,
        imagem_url: primeiraFoto(imovel.fotos),
        proprietario: imovel.proprietario_pessoa_id
          ? pessoasPorId.get(imovel.proprietario_pessoa_id) ?? null
          : null,
        publicacoes: publicacoesPorImovel.get(imovel.id) ?? [],
        total_leads_portal: leadsPorImovel.get(imovel.id) ?? 0,
      })),
      pessoas,
      paginacao: {
        pagina,
        limite,
        total: count ?? 0,
        total_paginas: Math.max(1, Math.ceil((count ?? 0) / limite)),
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao carregar imóveis.",
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

  try {
    const acesso = await garantirAcessoImobiliario(
      usuario.permissoes,
      "imoveis.criar",
      usuario.empresa_id
    );

    if (!acesso.ok) return acesso.response;

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
      .insert({
        empresa_id: usuario.empresa_id,
        proprietario_pessoa_id: proprietarioId || null,
        ...payload,
        created_by: usuario.id,
        updated_by: usuario.id,
      })
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
      data.id,
      proprietarioId || null,
      usuario.id
    );

    const auditMeta = getRequestAuditMetadata(request);

    await registrarLogAuditoriaSeguro({
      empresa_id: usuario.empresa_id,
      categoria: "imobiliario",
      entidade: "imovel",
      entidade_id: data.id,
      acao: "imovel_criado",
      descricao: `Imóvel ${payload.titulo} cadastrado`,
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      usuario_email: usuario.email,
      metadata: {
        status: payload.status,
        finalidade: payload.finalidade,
        proprietario_pessoa_id: proprietarioId || null,
      },
      ip: auditMeta.ip,
      user_agent: auditMeta.user_agent,
    });

    return NextResponse.json(
      {
        ok: true,
        message: "Imóvel cadastrado com sucesso.",
        imovel: data,
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao cadastrar imóvel.",
      },
      { status: 400 }
    );
  }
}
