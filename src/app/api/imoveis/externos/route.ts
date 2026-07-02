import { NextResponse } from "next/server";
import { getCanalImobiliario } from "@/lib/imoveis/publicacao";
import { normalizarUrlHttp } from "@/lib/imoveis/webhook";
import { obterAcessoImoveis } from "@/lib/imoveis/acesso";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getRequestAuditMetadata,
  registrarLogAuditoriaSeguro,
} from "@/lib/auditoria/logs";

const supabase = getSupabaseAdmin();

type ImovelExternoRow = Record<string, unknown> & {
  id: string;
};

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
  const numero = Number(texto(valor));
  return Number.isFinite(numero) ? Math.max(0, Math.trunc(numero)) : null;
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

function sanitizarBusca(valor: string) {
  return valor.replace(/[%_,()]/g, " ").trim();
}

export async function GET(request: Request) {
  const acesso = await obterAcessoImoveis("imoveis.visualizar");

  if (!acesso.ok) {
    return NextResponse.json(
      { ok: false, error: acesso.error },
      { status: acesso.status }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const limite = getInteiro(searchParams.get("limite"), 12, 1, 100);
    const busca = sanitizarBusca(searchParams.get("busca") ?? "");

    let query = supabase
      .from("imoveis_externos")
      .select("*", { count: "exact" })
      .eq("empresa_id", acesso.usuario.empresa_id)
      .neq("status", "arquivado");

    if (busca) {
      query = query.or(
        `titulo.ilike.%${busca}%,bairro.ilike.%${busca}%,cidade.ilike.%${busca}%,external_id.ilike.%${busca}%`
      );
    }

    const { data, error, count } = await query
      .order("recebido_em", { ascending: false })
      .limit(limite);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      imoveis_externos: data ?? [],
      total: count ?? 0,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao carregar imoveis externos.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const acesso = await obterAcessoImoveis("imoveis.importar");

  if (!acesso.ok) {
    return NextResponse.json(
      { ok: false, error: acesso.error },
      { status: acesso.status }
    );
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const canal = getCanalImobiliario(texto(body?.canal_codigo));
    const titulo = texto(body?.titulo);
    const externalId = texto(body?.external_id) || null;

    if (!canal) {
      return NextResponse.json(
        { ok: false, error: "Canal de origem invalido." },
        { status: 400 }
      );
    }

    if (!titulo) {
      return NextResponse.json(
        { ok: false, error: "Titulo do imovel externo e obrigatorio." },
        { status: 400 }
      );
    }

    const payload = {
      empresa_id: acesso.usuario.empresa_id,
      canal_codigo: canal.codigo,
      canal_nome: canal.nome,
      external_id: externalId,
      external_url: normalizarUrlHttp(body?.external_url),
      titulo,
      tipo: texto(body?.tipo) || null,
      finalidade: texto(body?.finalidade) || null,
      valor: numeroDecimal(body?.valor),
      bairro: texto(body?.bairro) || null,
      cidade: texto(body?.cidade) || null,
      estado: texto(body?.estado).toUpperCase() || null,
      quartos: numeroInteiro(body?.quartos),
      banheiros: numeroInteiro(body?.banheiros),
      vagas: numeroInteiro(body?.vagas),
      area_m2: numeroDecimal(body?.area_m2),
      descricao: texto(body?.descricao) || null,
      status: "novo",
      payload: body,
      updated_by: acesso.usuario.id,
      created_by: acesso.usuario.id,
    };

    let data: ImovelExternoRow | null = null;
    let error: { message: string } | null = null;

    if (externalId) {
      const { data: existente, error: existenteError } = await supabase
        .from("imoveis_externos")
        .select("id")
        .eq("empresa_id", acesso.usuario.empresa_id)
        .eq("canal_codigo", canal.codigo)
        .eq("external_id", externalId)
        .maybeSingle<{ id: string }>();

      if (existenteError) {
        return NextResponse.json(
          { ok: false, error: existenteError.message },
          { status: 400 }
        );
      }

      if (existente) {
        const resultado = await supabase
          .from("imoveis_externos")
          .update(payload)
          .eq("empresa_id", acesso.usuario.empresa_id)
          .eq("id", existente.id)
          .select("*")
          .single();

        data = resultado.data as ImovelExternoRow | null;
        error = resultado.error;
      }
    }

    if (!data && !error) {
      const resultado = await supabase
        .from("imoveis_externos")
        .insert(payload)
        .select("*")
        .single();

      data = resultado.data as ImovelExternoRow | null;
      error = resultado.error;
    }

    if (error || !data) {
      return NextResponse.json(
        { ok: false, error: error?.message ?? "Erro ao salvar imovel externo." },
        { status: 400 }
      );
    }

    const auditMeta = getRequestAuditMetadata(request);

    await registrarLogAuditoriaSeguro({
      empresa_id: acesso.usuario.empresa_id,
      categoria: "imobiliario",
      entidade: "imovel_externo",
      entidade_id: data.id,
      acao: "imovel_externo_recebido",
      descricao: `Imovel externo ${titulo} recebido de ${canal.nome}`,
      usuario_id: acesso.usuario.id,
      usuario_nome: acesso.usuario.nome,
      usuario_email: acesso.usuario.email,
      metadata: {
        canal_codigo: canal.codigo,
        external_id: externalId,
      },
      ip: auditMeta.ip,
      user_agent: auditMeta.user_agent,
    });

    return NextResponse.json(
      {
        ok: true,
        message: "Imovel externo registrado com sucesso.",
        imovel_externo: data,
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
            : "Erro interno ao registrar imovel externo.",
      },
      { status: 400 }
    );
  }
}
