import { NextResponse } from "next/server";
import { validarAcessoEmailMarketing } from "@/lib/email-marketing/admin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const db = getSupabaseAdmin();
const POR_PAGINA = 20;

const UUID_VALIDO =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const FILTROS_VALIDOS = new Set([
  "todos", "pendente", "enviado", "entregue", "aberto", "clicado",
  "falha", "bounce", "reclamacao", "suprimido", "descadastrado",
]);

type Contexto = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Contexto) {
  const acesso = await validarAcessoEmailMarketing();
  if (!acesso.ok) {
    return NextResponse.json(
      { ok: false, error: acesso.error },
      { status: acesso.status }
    );
  }
  const empresaId = acesso.usuario.empresa_id;
  const { id } = await params;
  if (!empresaId || !UUID_VALIDO.test(id)) {
    return NextResponse.json(
      { ok: false, error: "Campanha inválida." },
      { status: 400 }
    );
  }

  // Nunca consultar destinatários sem verificar primeiro a empresa proprietária.
  const { data: campanha, error: campanhaError } = await db
    .from("email_campanhas")
    .select(
      "id,nome,assunto,status,agendada_para,iniciada_em,finalizada_em,total_destinatarios,total_enviados,total_entregues,total_abertos,total_cliques,total_bounces,total_descadastros,email_remetentes(nome,email)"
    )
    .eq("id", id)
    .eq("empresa_id", empresaId)
    .maybeSingle();

  if (campanhaError) {
    return NextResponse.json(
      { ok: false, error: "Não foi possível consultar esta campanha." },
      { status: 500 }
    );
  }
  if (!campanha) {
    return NextResponse.json(
      { ok: false, error: "Campanha não encontrada." },
      { status: 404 }
    );
  }

  const paramsUrl = new URL(request.url).searchParams;
  const pagina = Math.max(1, Math.min(100000, Number.parseInt(paramsUrl.get("pagina") || "1", 10) || 1));
  const busca = (paramsUrl.get("busca") || "").trim().slice(0, 160);
  const filtroInformado = (paramsUrl.get("status") || "todos").trim().toLowerCase();
  const status = FILTROS_VALIDOS.has(filtroInformado) ? filtroInformado : "todos";
  const ordem: "asc" | "desc" = paramsUrl.get("ordem") === "asc" ? "asc" : "desc";

  let consulta = db
    .from("email_campanha_destinatarios")
    .select(
      "id,email,nome,status,erro,enviado_em,entregue_em,aberto_em,clicado_em,bounce_em,reclamacao_em,suprimido_em,descadastrado_em,created_at,tentativas",
      { count: "exact" }
    )
    .eq("campanha_id", id);

  if (busca) consulta = consulta.ilike("email", `%${busca}%`);

  if (status === "pendente") {
    consulta = consulta.in("status", ["pendente", "agendado", "processando"]);
  } else if (status === "enviado") {
    consulta = consulta.eq("status", "enviado");
  } else if (status === "entregue") {
    consulta = consulta.or("entregue_em.not.is.null,status.eq.entregue");
  } else if (status === "aberto") {
    consulta = consulta.or("aberto_em.not.is.null,status.eq.aberto");
  } else if (status === "clicado") {
    consulta = consulta.or("clicado_em.not.is.null,status.eq.clicado");
  } else if (status === "descadastrado") {
    consulta = consulta.not("descadastrado_em", "is", null);
  } else if (status !== "todos") {
    consulta = consulta.eq("status", status);
  }

  const inicio = (pagina - 1) * POR_PAGINA;
  const { data, count, error } = await consulta
    .order("enviado_em", { ascending: ordem === "asc", nullsFirst: false })
    .order("created_at", { ascending: ordem === "asc" })
    .order("id", { ascending: ordem === "asc" })
    .range(inicio, inicio + POR_PAGINA - 1);

  if (error) {
    console.error("[EMAIL_MARKETING] Erro ao listar destinatários:", error);
    return NextResponse.json(
      { ok: false, error: "Não foi possível carregar os destinatários da campanha." },
      { status: 500 }
    );
  }

  const total = count ?? 0;
  return NextResponse.json({
    ok: true,
    campanha,
    destinatarios: data || [],
    filtros: { busca, status, ordem },
    paginacao: {
      pagina,
      por_pagina: POR_PAGINA,
      total,
      total_paginas: Math.max(1, Math.ceil(total / POR_PAGINA)),
    },
  });
}
