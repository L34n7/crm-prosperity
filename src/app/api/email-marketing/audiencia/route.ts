import { NextResponse } from "next/server";
import { validarAcessoEmailMarketing } from "@/lib/email-marketing/admin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();

function limparBusca(valor: string) {
  return valor
    .replace(/[,%()]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

function idsUuid(valor: unknown, limite: number) {
  if (!Array.isArray(valor)) return [];

  return Array.from(
    new Set(
      valor
        .map((item) => String(item || "").trim())
        .filter((item) =>
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            item
          )
        )
    )
  ).slice(0, limite);
}

export async function GET(request: Request) {
  const acesso = await validarAcessoEmailMarketing();

  if (!acesso.ok) {
    return NextResponse.json(
      { ok: false, error: acesso.error },
      { status: acesso.status }
    );
  }

  const empresaId = acesso.usuario.empresa_id;

  if (!empresaId) {
    return NextResponse.json(
      { ok: false, error: "Usuário administrador sem empresa vinculada." },
      { status: 400 }
    );
  }

  const { searchParams } = new URL(request.url);
  const busca = limparBusca(searchParams.get("busca") || "");
  const pagina = Math.max(1, Number(searchParams.get("pagina") || "1"));
  const limite = Math.max(
    1,
    Math.min(100, Number(searchParams.get("limite") || "30"))
  );
  const inicio = (pagina - 1) * limite;
  const fim = inicio + limite - 1;

  let contatosQuery = supabaseAdmin
    .from("contatos")
    .select(
      "id, nome, email, telefone, empresa, origem, campanha, interesse, campo_contato, status_lead, classificacao, whatsapp_profile_name",
      { count: "exact" }
    )
    .eq("empresa_id", empresaId)
    .not("email", "is", null)
    .neq("email", "")
    .order("nome", { ascending: true })
    .range(inicio, fim);

  if (busca) {
    contatosQuery = contatosQuery.or(
      "nome.ilike.%" +
        busca +
        "%,email.ilike.%" +
        busca +
        "%,telefone.ilike.%" +
        busca +
        "%"
    );
  }

  const [listasResult, totalResult, contatosResult] = await Promise.all([
    supabaseAdmin.rpc("email_marketing_listar_listas_audiencia", {
      p_empresa_id: empresaId,
    }),
    supabaseAdmin
      .from("contatos")
      .select("id", { count: "exact", head: true })
      .eq("empresa_id", empresaId)
      .not("email", "is", null)
      .neq("email", ""),
    contatosQuery,
  ]);

  if (listasResult.error || totalResult.error || contatosResult.error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          listasResult.error?.message ||
          totalResult.error?.message ||
          contatosResult.error?.message ||
          "Não foi possível carregar a audiência.",
      },
      { status: 500 }
    );
  }

  const totalBusca = Number(contatosResult.count || 0);
  const contatos = contatosResult.data || [];
  const emailsPagina = Array.from(
    new Set(
      contatos
        .map((contato) => String(contato.email || "").trim().toLowerCase())
        .filter(Boolean)
    )
  );

  // Consulte apenas os e-mails da página, incluindo supressões globais.
  const supressoesResult = emailsPagina.length
    ? await supabaseAdmin
        .from("email_suppressions")
        .select("email, motivo")
        .or("empresa_id.is.null,empresa_id.eq." + empresaId)
        .in("email", emailsPagina)
    : { data: [], error: null };

  if (supressoesResult.error) {
    return NextResponse.json(
      { ok: false, error: "Não foi possível verificar os bloqueios de e-mail." },
      { status: 500 }
    );
  }

  const motivosPorEmail = new Map<string, string>();
  for (const supressao of supressoesResult.data || []) {
    const email = String(supressao.email || "").trim().toLowerCase();
    const motivo = String(supressao.motivo || "bloqueado").toLowerCase();
    if (!motivosPorEmail.has(email) || motivo === "descadastro") {
      motivosPorEmail.set(email, motivo);
    }
  }

  return NextResponse.json({
    ok: true,
    total_contatos_com_email: Number(totalResult.count || 0),
    listas: (listasResult.data || []).map((lista: Record<string, unknown>) => ({
      id: String(lista.id || ""),
      nome: String(lista.nome || ""),
      total_contatos: Number(lista.total_contatos || 0),
      total_emails: Number(lista.total_emails || 0),
      created_at: lista.created_at || null,
    })),
    contatos: contatos.map((contato) => ({
      ...contato,
      supressao_motivo:
        motivosPorEmail.get(String(contato.email || "").trim().toLowerCase()) ||
        null,
    })),
    paginacao: {
      pagina,
      limite,
      total: totalBusca,
      total_paginas: Math.max(1, Math.ceil(totalBusca / limite)),
    },
  });
}

export async function POST(request: Request) {
  const acesso = await validarAcessoEmailMarketing();

  if (!acesso.ok) {
    return NextResponse.json(
      { ok: false, error: acesso.error },
      { status: acesso.status }
    );
  }

  const empresaId = acesso.usuario.empresa_id;

  if (!empresaId) {
    return NextResponse.json(
      { ok: false, error: "Usuário administrador sem empresa vinculada." },
      { status: 400 }
    );
  }

  const body = (await request.json().catch(() => null)) as
    | Record<string, unknown>
    | null;
  const modo = String(body?.modo || "todos");
  const listaIds = idsUuid(body?.lista_ids, 100);
  const contatoIds = idsUuid(body?.contato_ids, 5000);

  if (modo === "listas" && !listaIds.length) {
    return NextResponse.json(
      { ok: false, error: "Selecione pelo menos uma lista." },
      { status: 400 }
    );
  }

  if (modo === "contatos" && !contatoIds.length) {
    return NextResponse.json(
      { ok: false, error: "Selecione pelo menos um contato." },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin.rpc(
    "email_marketing_analisar_audiencia",
    {
      p_empresa_id: empresaId,
      p_lista_ids: modo === "listas" ? listaIds : [],
      p_incluir_todos: modo === "todos",
      p_contato_ids: modo === "contatos" ? contatoIds : [],
    }
  );

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    analise: data || {},
  });
}
