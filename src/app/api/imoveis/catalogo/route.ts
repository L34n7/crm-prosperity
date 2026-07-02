import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { buscarNichoEmpresa } from "@/lib/nichos/empresa-nicho";
import { normalizarUrlHttp } from "@/lib/imoveis/webhook";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabase = getSupabaseAdmin();

type CatalogoImovelRow = {
  catalogo_id: string;
  origem_tipo: "crm" | "externo";
  origem_id: string;
  empresa_id: string | null;
  empresa_nome: string;
  titulo: string;
  codigo: string | null;
  tipo: string | null;
  finalidade: string | null;
  status: string | null;
  valor: number | string | null;
  valor_condominio: number | string | null;
  valor_iptu: number | string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  quartos: number | null;
  suites: number | null;
  banheiros: number | null;
  vagas: number | null;
  area_m2: number | string | null;
  descricao: string | null;
  imagem_url: string | null;
  external_url: string | null;
  created_at: string;
  updated_at: string;
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
  return valor.replace(/[%_,()]/g, " ").trim().slice(0, 120);
}

export async function GET(request: Request) {
  const contexto = await getUsuarioContexto();

  if (!contexto.ok) {
    return NextResponse.json(
      { ok: false, error: contexto.error },
      { status: contexto.status }
    );
  }

  const empresaId = contexto.usuario.empresa_id;

  if (!empresaId) {
    return NextResponse.json(
      { ok: false, error: "Usuario sem empresa vinculada." },
      { status: 400 }
    );
  }

  try {
    const nicho = await buscarNichoEmpresa(empresaId);

    if (nicho.codigo !== "imobiliaria") {
      return NextResponse.json(
        {
          ok: false,
          error: "O catalogo de imoveis e exclusivo do nicho imobiliario.",
        },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const pagina = getInteiro(searchParams.get("pagina"), 1, 1, 1_000_000);
    const limite = getInteiro(searchParams.get("limite"), 24, 1, 100);
    const busca = sanitizarBusca(searchParams.get("busca") ?? "");
    const origemInformada = searchParams.get("origem");
    const origem =
      origemInformada === "crm" || origemInformada === "externo"
        ? origemInformada
        : null;
    const inicio = (pagina - 1) * limite;
    const fim = inicio + limite - 1;

    let query = supabase
      .from("catalogo_imoveis_global")
      .select("*", { count: "exact" });

    if (origem) {
      query = query.eq("origem_tipo", origem);
    }

    if (busca) {
      query = query.or(
        `titulo.ilike.%${busca}%,codigo.ilike.%${busca}%,tipo.ilike.%${busca}%,bairro.ilike.%${busca}%,cidade.ilike.%${busca}%,estado.ilike.%${busca}%,empresa_nome.ilike.%${busca}%`
      );
    }

    const { data, error, count } = await query
      .order("updated_at", { ascending: false })
      .range(inicio, fim);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    const imoveis = ((data ?? []) as CatalogoImovelRow[]).map((imovel) => ({
      ...imovel,
      imagem_url: normalizarUrlHttp(imovel.imagem_url),
      external_url: normalizarUrlHttp(imovel.external_url),
      pertence_empresa_atual:
        imovel.origem_tipo === "crm" && imovel.empresa_id === empresaId,
    }));

    return NextResponse.json({
      ok: true,
      imoveis,
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
            : "Erro interno ao carregar o catalogo de imoveis.",
      },
      { status: 500 }
    );
  }
}
