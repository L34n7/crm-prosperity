import { NextResponse } from "next/server";
import { getCanalImobiliario } from "@/lib/imoveis/publicacao";
import { obterAcessoImoveis } from "@/lib/imoveis/acesso";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizarTelefoneBrasilParaWhatsApp } from "@/lib/contatos/normalizar-telefone";
import {
  getRequestAuditMetadata,
  registrarLogAuditoriaSeguro,
} from "@/lib/auditoria/logs";

const supabase = getSupabaseAdmin();
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type LeadPortalRow = Record<string, unknown> & {
  id: string;
  imovel_id: string | null;
  imovel_externo_id: string | null;
};

type ImovelResumo = {
  id: string;
  titulo: string | null;
  codigo: string | null;
  bairro: string | null;
  cidade: string | null;
};

function texto(valor: unknown) {
  return String(valor ?? "").trim();
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

function uuidOpcional(valor: string | null) {
  const id = String(valor ?? "").trim();
  if (!id) return null;
  return UUID_REGEX.test(id) ? id : "invalido";
}

async function buscarImoveisPorIds(empresaId: string, ids: string[]) {
  if (ids.length === 0) return new Map<string, ImovelResumo>();

  const { data, error } = await supabase
    .from("imoveis")
    .select("id, titulo, codigo, bairro, cidade")
    .eq("empresa_id", empresaId)
    .in("id", ids);

  if (error) {
    throw new Error(`Erro ao buscar imoveis dos leads: ${error.message}`);
  }

  return new Map(
    ((data ?? []) as ImovelResumo[]).map((imovel) => [imovel.id, imovel])
  );
}

async function buscarImoveisExternosPorIds(empresaId: string, ids: string[]) {
  if (ids.length === 0) return new Map<string, ImovelResumo>();

  const { data, error } = await supabase
    .from("imoveis_externos")
    .select("id, titulo, codigo, bairro, cidade")
    .eq("empresa_id", empresaId)
    .in("id", ids);

  if (error) {
    throw new Error(
      `Erro ao buscar imoveis externos dos leads: ${error.message}`
    );
  }

  return new Map(
    ((data ?? []) as ImovelResumo[]).map((imovel) => [imovel.id, imovel])
  );
}

async function verificarImovelEmpresa(empresaId: string, imovelId: string) {
  if (!imovelId) return null;

  const { data, error } = await supabase
    .from("imoveis")
    .select("id, status")
    .eq("empresa_id", empresaId)
    .eq("id", imovelId)
    .maybeSingle<{ id: string; status: string | null }>();

  if (error) {
    throw new Error(`Erro ao validar imovel: ${error.message}`);
  }

  return data && data.status !== "arquivado" ? data : null;
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
    const pagina = getInteiro(searchParams.get("pagina"), 1, 1, 1_000_000);
    const limite = getInteiro(searchParams.get("limite"), 12, 1, 100);
    const imovelId = uuidOpcional(searchParams.get("imovel_id"));
    const imovelExternoId = uuidOpcional(searchParams.get("imovel_externo_id"));

    if (imovelId === "invalido" || imovelExternoId === "invalido") {
      return NextResponse.json(
        { ok: false, error: "Identificador do imovel invalido." },
        { status: 400 }
      );
    }

    if (imovelId && imovelExternoId) {
      return NextResponse.json(
        {
          ok: false,
          error: "Informe apenas um tipo de identificador de imovel por consulta.",
        },
        { status: 400 }
      );
    }

    const inicio = (pagina - 1) * limite;
    const fim = inicio + limite - 1;
    let query = supabase
      .from("imovel_leads_portal")
      .select("*", { count: "exact" })
      .eq("empresa_id", acesso.usuario.empresa_id)
      .neq("status", "arquivado");

    if (imovelId) query = query.eq("imovel_id", imovelId);
    if (imovelExternoId) {
      query = query.eq("imovel_externo_id", imovelExternoId);
    }

    const { data, error, count } = await query
      .order("recebido_em", { ascending: false })
      .range(inicio, fim);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    const leads = (data ?? []) as LeadPortalRow[];
    const imovelIds = Array.from(
      new Set(leads.map((lead) => lead.imovel_id).filter(Boolean) as string[])
    );
    const imovelExternoIds = Array.from(
      new Set(
        leads.map((lead) => lead.imovel_externo_id).filter(Boolean) as string[]
      )
    );
    const [imoveisPorId, imoveisExternosPorId] = await Promise.all([
      buscarImoveisPorIds(acesso.usuario.empresa_id, imovelIds),
      buscarImoveisExternosPorIds(
        acesso.usuario.empresa_id,
        imovelExternoIds
      ),
    ]);

    const total = count ?? 0;

    return NextResponse.json({
      ok: true,
      leads: leads.map((lead) => {
        const imovelInterno = lead.imovel_id
          ? imoveisPorId.get(lead.imovel_id) ?? null
          : null;
        const imovelExterno = lead.imovel_externo_id
          ? imoveisExternosPorId.get(lead.imovel_externo_id) ?? null
          : null;

        return {
          ...lead,
          imovel: imovelInterno ?? imovelExterno,
          imovel_origem: imovelInterno
            ? "interno"
            : imovelExterno
              ? "externo"
              : null,
        };
      }),
      paginacao: {
        pagina,
        limite,
        total,
        total_paginas: Math.max(1, Math.ceil(total / limite)),
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao carregar leads de portais.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const acesso = await obterAcessoImoveis("imoveis.leads_gerenciar");

  if (!acesso.ok) {
    return NextResponse.json(
      { ok: false, error: acesso.error },
      { status: acesso.status }
    );
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const canal = getCanalImobiliario(texto(body?.canal_codigo));
    const nome = texto(body?.nome);
    const email = texto(body?.email).toLowerCase();
    const telefoneOriginal = texto(body?.telefone);
    const telefone =
      normalizarTelefoneBrasilParaWhatsApp(telefoneOriginal) ||
      telefoneOriginal ||
      null;
    const imovelId = texto(body?.imovel_id);
    const mensagem = texto(body?.mensagem) || null;

    if (!canal) {
      return NextResponse.json(
        { ok: false, error: "Canal de origem invalido." },
        { status: 400 }
      );
    }

    if (!nome) {
      return NextResponse.json(
        { ok: false, error: "Nome do lead e obrigatorio." },
        { status: 400 }
      );
    }

    if (!email && !telefone) {
      return NextResponse.json(
        { ok: false, error: "Informe email ou telefone do lead." },
        { status: 400 }
      );
    }

    if (imovelId) {
      const imovel = await verificarImovelEmpresa(
        acesso.usuario.empresa_id,
        imovelId
      );

      if (!imovel) {
        return NextResponse.json(
          { ok: false, error: "Imovel informado nao encontrado." },
          { status: 404 }
        );
      }
    }

    let publicacaoId: string | null = null;

    if (imovelId) {
      const { data: publicacao } = await supabase
        .from("imovel_publicacoes")
        .select("id")
        .eq("empresa_id", acesso.usuario.empresa_id)
        .eq("imovel_id", imovelId)
        .eq("canal_codigo", canal.codigo)
        .maybeSingle<{ id: string }>();

      publicacaoId = publicacao?.id ?? null;
    }

    const { data, error } = await supabase
      .from("imovel_leads_portal")
      .insert({
        empresa_id: acesso.usuario.empresa_id,
        imovel_id: imovelId || null,
        publicacao_id: publicacaoId,
        canal_codigo: canal.codigo,
        canal_nome: canal.nome,
        nome,
        email: email || null,
        telefone,
        mensagem,
        status: "novo",
        origem_payload: body,
        created_by: acesso.usuario.id,
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 400 }
      );
    }

    const auditMeta = getRequestAuditMetadata(request);

    await registrarLogAuditoriaSeguro({
      empresa_id: acesso.usuario.empresa_id,
      categoria: "imobiliario",
      entidade: "imovel_lead_portal",
      entidade_id: data.id,
      acao: "lead_portal_recebido",
      descricao: `Lead ${nome} recebido de ${canal.nome}`,
      usuario_id: acesso.usuario.id,
      usuario_nome: acesso.usuario.nome,
      usuario_email: acesso.usuario.email,
      metadata: {
        imovel_id: imovelId || null,
        canal_codigo: canal.codigo,
      },
      ip: auditMeta.ip,
      user_agent: auditMeta.user_agent,
    });

    return NextResponse.json(
      {
        ok: true,
        message: "Lead de portal registrado com sucesso.",
        lead: data,
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
            : "Erro interno ao registrar lead de portal.",
      },
      { status: 400 }
    );
  }
}
