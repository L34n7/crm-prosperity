import { NextResponse } from "next/server";
import { obterAcessoImoveis } from "@/lib/imoveis/acesso";
import { normalizarUrlHttp } from "@/lib/imoveis/webhook";
import {
  montarOpcoesFiltrosCatalogo,
  normalizarIntervalo,
  obterOrdenacaoCatalogo,
  sanitizarTextoFiltro,
  type FacetaCatalogoRow,
} from "@/lib/imoveis/catalogo-filtros";
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
  titulo_ordenacao: string;
};

type DetalhesCrmRow = {
  id: string;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  caracteristicas: Record<string, unknown> | null;
  fotos: unknown[] | null;
};

type DetalhesExternoRow = {
  id: string;
  integracao_id: string | null;
  external_id: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  caracteristicas: Record<string, unknown> | null;
  imagem_urls: unknown[] | null;
  payload: Record<string, unknown> | null;
};

type ProprietarioResumo = {
  nome: string | null;
  email: string | null;
  telefone: string | null;
};

type EventoWebhookRow = {
  payload: Record<string, unknown> | null;
};

type LeadResumoRow = {
  imovel_id: string | null;
  imovel_externo_id: string | null;
  total_leads: number | string;
};

function getInteiro(
  valor: string | null,
  padrao: number,
  minimo: number,
  maximo: number,
) {
  const numero = Number(valor ?? padrao);
  if (!Number.isFinite(numero)) return padrao;
  return Math.min(maximo, Math.max(minimo, Math.trunc(numero)));
}

function sanitizarBusca(valor: string) {
  return valor
    .replace(/[%_,()]/g, " ")
    .trim()
    .slice(0, 120);
}

function numeroFiltro(valor: string | null) {
  if (!valor) return null;
  const numero = Number(valor);
  return Number.isFinite(numero) && numero >= 0 ? numero : null;
}

function objetoJson(valor: unknown): Record<string, unknown> | null {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return null;
  return valor as Record<string, unknown>;
}

function textoOpcional(valor: unknown, limite = 500) {
  if (
    typeof valor !== "string" &&
    typeof valor !== "number" &&
    typeof valor !== "boolean"
  ) {
    return null;
  }

  const texto = String(valor).trim();
  return texto ? texto.slice(0, limite) : null;
}

function extrairProprietario(payload: unknown): ProprietarioResumo | null {
  const envelope = objetoJson(payload);
  if (!envelope) return null;

  const data = objetoJson(envelope.data);
  const imovel =
    objetoJson(envelope.property) ??
    objetoJson(envelope.imovel) ??
    objetoJson(envelope.listing) ??
    objetoJson(envelope.anuncio) ??
    objetoJson(data?.property) ??
    objetoJson(data?.imovel) ??
    objetoJson(data?.listing) ??
    objetoJson(data?.anuncio) ??
    data ??
    envelope;
  const proprietario =
    objetoJson(imovel.proprietario) ?? objetoJson(imovel.owner);

  if (!proprietario) return null;

  const nome = textoOpcional(
    proprietario.nome ?? proprietario.name ?? proprietario.full_name,
  );
  const email = textoOpcional(
    proprietario.email ?? proprietario.e_mail,
  )?.toLowerCase() ?? null;
  const telefone = textoOpcional(
    proprietario.celular ??
      proprietario.mobile ??
      proprietario.telefone ??
      proprietario.teleofne ??
      proprietario.phone ??
      proprietario.whatsapp,
    100,
  );

  return nome || email || telefone ? { nome, email, telefone } : null;
}

function normalizarImagens(valor: unknown, capa?: unknown) {
  const itens = Array.isArray(valor) ? valor : [];
  const urls = itens
    .map((foto) => {
      if (typeof foto === "string") return normalizarUrlHttp(foto);
      if (!foto || typeof foto !== "object") return null;

      const item = foto as Record<string, unknown>;
      return normalizarUrlHttp(item.url ?? item.src ?? item.original);
    })
    .filter((url): url is string => Boolean(url));
  const capaNormalizada = normalizarUrlHttp(capa);

  return Array.from(
    new Set([...(capaNormalizada ? [capaNormalizada] : []), ...urls]),
  ).slice(0, 50);
}

export async function GET(request: Request) {
  const acesso = await obterAcessoImoveis("imoveis.visualizar");

  if (!acesso.ok) {
    return NextResponse.json(
      { ok: false, error: acesso.error },
      { status: acesso.status },
    );
  }

  const empresaId = acesso.usuario.empresa_id;

  try {
    const { searchParams } = new URL(request.url);
    const pagina = getInteiro(searchParams.get("pagina"), 1, 1, 1_000_000);
    const limite = getInteiro(searchParams.get("limite"), 24, 1, 100);
    const imovelId = String(searchParams.get("imovel") ?? "").trim();
    const busca = sanitizarBusca(searchParams.get("busca") ?? "");
    const origemInformada = searchParams.get("origem");
    const origem =
      origemInformada === "crm" || origemInformada === "externo"
        ? origemInformada
        : null;
    const tipo = sanitizarTextoFiltro(searchParams.get("tipo"));
    const finalidade = sanitizarTextoFiltro(searchParams.get("finalidade"));
    const status = sanitizarTextoFiltro(searchParams.get("status"));
    const cidade = sanitizarBusca(searchParams.get("cidade") ?? "");
    const estadoInformado = String(searchParams.get("estado") ?? "")
      .trim()
      .toUpperCase();
    const estado = /^[A-Z]{2}$/.test(estadoInformado) ? estadoInformado : "";
    const quartosMin = numeroFiltro(searchParams.get("quartos_min"));
    const intervaloValor = normalizarIntervalo(
      numeroFiltro(searchParams.get("valor_min")),
      numeroFiltro(searchParams.get("valor_max")),
    );
    const intervaloArea = normalizarIntervalo(
      numeroFiltro(searchParams.get("area_min")),
      numeroFiltro(searchParams.get("area_max")),
    );
    const ordenacao = String(searchParams.get("ordenacao") ?? "recentes");
    const inicio = (pagina - 1) * limite;
    const fim = inicio + limite - 1;

    let query = supabase
      .from("catalogo_imoveis_global")
      .select("*", { count: "exact" })
      .eq("empresa_id", empresaId);

    if (imovelId) query = query.eq("catalogo_id", imovelId);
    if (origem) query = query.eq("origem_tipo", origem);
    if (tipo) query = query.ilike("tipo", tipo);
    if (finalidade) query = query.ilike("finalidade", finalidade);
    if (status) query = query.ilike("status", status);
    if (cidade) query = query.ilike("cidade", `%${cidade}%`);
    if (estado) query = query.eq("estado", estado);
    if (quartosMin !== null) query = query.gte("quartos", quartosMin);
    if (intervaloValor.minimo !== null) {
      query = query.gte("valor", intervaloValor.minimo);
    }
    if (intervaloValor.maximo !== null) {
      query = query.lte("valor", intervaloValor.maximo);
    }
    if (intervaloArea.minimo !== null) {
      query = query.gte("area_m2", intervaloArea.minimo);
    }
    if (intervaloArea.maximo !== null) {
      query = query.lte("area_m2", intervaloArea.maximo);
    }

    if (busca) {
      query = query.or(
        `titulo.ilike.%${busca}%,codigo.ilike.%${busca}%,tipo.ilike.%${busca}%,bairro.ilike.%${busca}%,cidade.ilike.%${busca}%,estado.ilike.%${busca}%,empresa_nome.ilike.%${busca}%`,
      );
    }

    for (const ordem of obterOrdenacaoCatalogo(ordenacao)) {
      query = query.order(ordem.campo, {
        ascending: ordem.ascending,
        ...(ordem.nullsFirst === undefined
          ? {}
          : { nullsFirst: ordem.nullsFirst }),
      });
    }

    const [catalogoResultado, facetasResultado] = await Promise.all([
      query.range(inicio, fim),
      supabase
        .from("catalogo_imoveis_global")
        .select("origem_tipo,tipo,finalidade,status,cidade,estado")
        .eq("empresa_id", empresaId)
        .range(0, 4_999),
    ]);
    const { data, error, count } = catalogoResultado;

    if (error || facetasResultado.error) {
      return NextResponse.json(
        {
          ok: false,
          error: error?.message || facetasResultado.error?.message,
        },
        { status: 500 },
      );
    }

    const catalogo = (data ?? []) as CatalogoImovelRow[];
    const idsCrm = catalogo
      .filter((imovel) => imovel.origem_tipo === "crm")
      .map((imovel) => imovel.origem_id);
    const idsExternos = catalogo
      .filter((imovel) => imovel.origem_tipo === "externo")
      .map((imovel) => imovel.origem_id);

    const [
      detalhesCrmResultado,
      detalhesExternosResultado,
      leadsCrmResultado,
      leadsExternosResultado,
    ] = await Promise.all([
      idsCrm.length > 0
        ? supabase
            .from("imoveis")
            .select("id,cep,logradouro,numero,complemento,caracteristicas,fotos")
            .eq("empresa_id", empresaId)
            .in("id", idsCrm)
        : Promise.resolve({ data: [], error: null }),
      idsExternos.length > 0
        ? supabase
            .from("imoveis_externos")
            .select(
              "id,integracao_id,external_id,cep,logradouro,numero,complemento,caracteristicas,imagem_urls,payload",
            )
            .eq("empresa_id", empresaId)
            .in("id", idsExternos)
        : Promise.resolve({ data: [], error: null }),
      idsCrm.length > 0
        ? supabase
            .from("imovel_leads_portal_resumo")
            .select("imovel_id,imovel_externo_id,total_leads")
            .eq("empresa_id", empresaId)
            .in("imovel_id", idsCrm)
        : Promise.resolve({ data: [], error: null }),
      idsExternos.length > 0
        ? supabase
            .from("imovel_leads_portal_resumo")
            .select("imovel_id,imovel_externo_id,total_leads")
            .eq("empresa_id", empresaId)
            .in("imovel_externo_id", idsExternos)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (
      detalhesCrmResultado.error ||
      detalhesExternosResultado.error ||
      leadsCrmResultado.error ||
      leadsExternosResultado.error
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            detalhesCrmResultado.error?.message ||
            detalhesExternosResultado.error?.message ||
            leadsCrmResultado.error?.message ||
            leadsExternosResultado.error?.message ||
            "Erro ao carregar os detalhes dos imóveis.",
        },
        { status: 500 },
      );
    }

    const detalhesCrm = new Map(
      ((detalhesCrmResultado.data ?? []) as DetalhesCrmRow[]).map((item) => [
        item.id,
        item,
      ]),
    );
    const detalhesExternosLista = (detalhesExternosResultado.data ?? []) as DetalhesExternoRow[];
    const detalhesExternos = new Map(
      detalhesExternosLista.map((item) => [item.id, item]),
    );
    const proprietariosExternos = new Map<string, ProprietarioResumo>();

    if (imovelId) {
      for (const detalhe of detalhesExternosLista) {
        const proprietarioPayload = extrairProprietario(detalhe.payload);
        if (proprietarioPayload) {
          proprietariosExternos.set(detalhe.id, proprietarioPayload);
          continue;
        }

        if (!detalhe.integracao_id || !detalhe.external_id) continue;

        const eventosResultado = await supabase
          .from("imobiliario_webhook_eventos")
          .select("payload")
          .eq("empresa_id", empresaId)
          .eq("integracao_id", detalhe.integracao_id)
          .eq("external_id", detalhe.external_id)
          .like("event_type", "property.%")
          .order("recebido_em", { ascending: false })
          .limit(25);

        if (eventosResultado.error) {
          return NextResponse.json(
            { ok: false, error: eventosResultado.error.message },
            { status: 500 },
          );
        }

        const proprietarioEvento = (
          (eventosResultado.data ?? []) as EventoWebhookRow[]
        )
          .map((evento) => extrairProprietario(evento.payload))
          .find((proprietario): proprietario is ProprietarioResumo => Boolean(proprietario));

        if (proprietarioEvento) {
          proprietariosExternos.set(detalhe.id, proprietarioEvento);
        }
      }
    }

    const leadsCrm = new Map(
      ((leadsCrmResultado.data ?? []) as LeadResumoRow[])
        .filter((item) => Boolean(item.imovel_id))
        .map((item) => [item.imovel_id as string, Number(item.total_leads) || 0]),
    );
    const leadsExternos = new Map(
      ((leadsExternosResultado.data ?? []) as LeadResumoRow[])
        .filter((item) => Boolean(item.imovel_externo_id))
        .map((item) => [
          item.imovel_externo_id as string,
          Number(item.total_leads) || 0,
        ]),
    );

    const imoveis = catalogo.map((imovel) => {
      const detalhes =
        imovel.origem_tipo === "crm"
          ? detalhesCrm.get(imovel.origem_id)
          : detalhesExternos.get(imovel.origem_id);
      const imagens = normalizarImagens(
        imovel.origem_tipo === "crm"
          ? (detalhes as DetalhesCrmRow | undefined)?.fotos
          : (detalhes as DetalhesExternoRow | undefined)?.imagem_urls,
        imovel.imagem_url,
      );
      const totalLeadsPortal =
        imovel.origem_tipo === "crm"
          ? leadsCrm.get(imovel.origem_id) ?? 0
          : leadsExternos.get(imovel.origem_id) ?? 0;

      return {
        ...imovel,
        cep: detalhes?.cep ?? null,
        logradouro: detalhes?.logradouro ?? null,
        numero: detalhes?.numero ?? null,
        complemento: detalhes?.complemento ?? null,
        caracteristicas: detalhes?.caracteristicas ?? {},
        imagens,
        imagem_url: imagens[0] ?? null,
        external_url: normalizarUrlHttp(imovel.external_url),
        pertence_empresa_atual:
          imovel.origem_tipo === "crm" && imovel.empresa_id === empresaId,
        total_leads_portal: totalLeadsPortal,
        ...(imovelId && imovel.origem_tipo === "externo"
          ? {
              proprietario:
                proprietariosExternos.get(imovel.origem_id) ?? null,
            }
          : {}),
      };
    });

    return NextResponse.json({
      ok: true,
      imoveis,
      opcoes_filtros: montarOpcoesFiltrosCatalogo(
        (facetasResultado.data ?? []) as FacetaCatalogoRow[],
      ),
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
      { status: 500 },
    );
  }
}
