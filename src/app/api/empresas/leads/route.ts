import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { can } from "@/lib/permissoes/frontend";
import { PERMISSAO_INTERNA_EMPRESAS } from "@/lib/permissoes/internas";

const supabaseAdmin = getSupabaseAdmin();
const PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

function normalizarPagina(valor: string | null) {
  const numero = Number(valor || "1");
  return Number.isInteger(numero) && numero > 0 ? numero : 1;
}

function normalizarLimite(valor: string | null) {
  const numero = Number(valor || PAGE_SIZE);
  if (!Number.isInteger(numero) || numero < 1) return PAGE_SIZE;
  return Math.min(numero, MAX_PAGE_SIZE);
}

export async function GET(request: Request) {
  const resultado = await getUsuarioContexto({ sincronizarAssinatura: false });

  if (!resultado.ok) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status }
    );
  }

  if (!can(resultado.usuario.permissoes, PERMISSAO_INTERNA_EMPRESAS)) {
    return NextResponse.json(
      { ok: false, error: "Sem permissão para visualizar leads." },
      { status: 403 }
    );
  }

  const url = new URL(request.url);
  const pagina = normalizarPagina(url.searchParams.get("page"));
  const limite = normalizarLimite(url.searchParams.get("limit"));
  const inicio = (pagina - 1) * limite;
  const fim = inicio + limite - 1;

  const { data, error, count } = await supabaseAdmin
    .from("leads_cadastro")
    .select(
      "id, nome, empresa, email, telefone, segmento_nome, plano_slug, status, pago, created_at, empresa_id",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(inicio, fim);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  const leads = (data || []).map((lead) => ({
    id: lead.id,
    nome: lead.nome,
    empresa: lead.empresa,
    email: lead.email,
    telefone: lead.telefone,
    categoria: lead.segmento_nome || "Não informado",
    plano_slug: lead.plano_slug,
    status: lead.status,
    pago: Boolean(lead.pago),
    created_at: lead.created_at,
    empresa_id: lead.empresa_id,
  }));

  return NextResponse.json({
    ok: true,
    leads,
    pagination: {
      page: pagina,
      limit: limite,
      total: count || 0,
      total_pages: Math.max(1, Math.ceil((count || 0) / limite)),
    },
  });
}
