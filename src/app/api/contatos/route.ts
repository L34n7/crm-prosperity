import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto, type UsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { normalizarTelefoneBrasilParaWhatsApp } from "@/lib/contatos/normalizar-telefone";


function podeGerenciarContatos(usuario: UsuarioContexto) {
  const nomesPerfis = (usuario.perfis_dinamicos ?? []).map((perfil) => perfil.nome);

  return (
    nomesPerfis.includes("Administrador") ||
    nomesPerfis.includes("Supervisor") ||
    nomesPerfis.includes("Atendente")
  );
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

  if (!podeGerenciarContatos(usuario)) {
    return NextResponse.json(
      { ok: false, error: "Sem permissão para listar contatos" },
      { status: 403 }
    );
  }

  if (!usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuário sem empresa vinculada" },
      { status: 400 }
    );
  }

  const { searchParams } = new URL(request.url);

  const statusLead = searchParams.get("status_lead");
  const busca = searchParams.get("busca")?.trim() || "";
  const origem = searchParams.get("origem")?.trim() || "";
  const campanha = searchParams.get("campanha")?.trim() || "";
  const telefoneRevisar = searchParams.get("telefone_revisar");
  const ordenacao = searchParams.get("ordenacao") || "recentes";

  const pagina = Math.max(1, Number(searchParams.get("pagina") || "1"));

  const limite = Math.max(
    1,
    Math.min(5000, Number(searchParams.get("limite") || "5000"))
  );

  const from = (pagina - 1) * limite;

  const supabaseAdmin = getSupabaseAdmin();

  let query = supabaseAdmin
    .from("contatos")
    .select(
      `
        id,
        empresa_id,
        nome,
        telefone,
        email,
        origem,
        campanha,
        status_lead,
        observacoes,
        telefone_revisar,
        created_at,
        updated_at
      `,
      { count: "exact" }
    )
    .eq("empresa_id", usuario.empresa_id);

  if (
    statusLead &&
    ["novo", "em_atendimento", "qualificado", "cliente", "perdido"].includes(
      statusLead
    )
  ) {
    query = query.eq("status_lead", statusLead);
  }

  if (origem) {
    query = query.eq("origem", origem);
  }

  if (campanha) {
    query = query.ilike("campanha", `%${campanha}%`);
  }

  if (telefoneRevisar === "true") {
    query = query.eq("telefone_revisar", true);
  }

  if (telefoneRevisar === "false") {
    query = query.eq("telefone_revisar", false);
  }

  if (busca) {
    query = query.or(
      `nome.ilike.%${busca}%,email.ilike.%${busca}%,origem.ilike.%${busca}%,campanha.ilike.%${busca}%,telefone.ilike.%${busca}%`
    );
  }

  if (ordenacao === "antigos") {
    query = query.order("created_at", { ascending: true });
  } else if (ordenacao === "nome_asc") {
    query = query.order("nome", { ascending: true });
  } else if (ordenacao === "nome_desc") {
    query = query.order("nome", { ascending: false });
  } else {
    query = query.order("created_at", { ascending: false });
  }

  const tamanhoLote = 1000;
  let contatosAcumulados: any[] = [];
  let totalCount = 0;
  let offsetAtual = from;

  while (contatosAcumulados.length < limite) {
    let queryLote = supabaseAdmin
      .from("contatos")
      .select(
        `
          id,
          empresa_id,
          nome,
          telefone,
          email,
          origem,
          campanha,
          status_lead,
          observacoes,
          telefone_revisar,
          created_at,
          updated_at
        `,
        { count: "exact" }
      )
      .eq("empresa_id", usuario.empresa_id);

    if (
      statusLead &&
      ["novo", "em_atendimento", "qualificado", "cliente", "perdido"].includes(
        statusLead
      )
    ) {
      queryLote = queryLote.eq("status_lead", statusLead);
    }

    if (origem) {
      queryLote = queryLote.eq("origem", origem);
    }

    if (campanha) {
      queryLote = queryLote.ilike("campanha", `%${campanha}%`);
    }

    if (telefoneRevisar === "true") {
      queryLote = queryLote.eq("telefone_revisar", true);
    }

    if (telefoneRevisar === "false") {
      queryLote = queryLote.eq("telefone_revisar", false);
    }

    if (busca) {
      queryLote = queryLote.or(
        `nome.ilike.%${busca}%,email.ilike.%${busca}%,origem.ilike.%${busca}%,campanha.ilike.%${busca}%,telefone.ilike.%${busca}%`
      );
    }

    if (ordenacao === "antigos") {
      queryLote = queryLote.order("created_at", { ascending: true });
    } else if (ordenacao === "nome_asc") {
      queryLote = queryLote.order("nome", { ascending: true });
    } else if (ordenacao === "nome_desc") {
      queryLote = queryLote.order("nome", { ascending: false });
    } else {
      queryLote = queryLote.order("created_at", { ascending: false });
    }

    const loteFrom = offsetAtual;
    const loteTo = offsetAtual + tamanhoLote - 1;

    const { data: loteData, error: loteError, count } = await queryLote.range(
      loteFrom,
      loteTo
    );

    if (loteError) {
      return NextResponse.json(
        { ok: false, error: loteError.message },
        { status: 500 }
      );
    }

    if (typeof count === "number") {
      totalCount = count;
    }

    const lote = loteData ?? [];

    contatosAcumulados.push(...lote);

    if (lote.length < tamanhoLote) {
      break;
    }

    offsetAtual += tamanhoLote;
  }

  const data = contatosAcumulados.slice(0, limite);
  const count = totalCount;

  const { data: origensData } = await supabaseAdmin
    .from("contatos")
    .select("origem")
    .eq("empresa_id", usuario.empresa_id)
    .not("origem", "is", null);

  const origens = Array.from(
    new Set(
      (origensData || [])
        .map((item) => String(item.origem || "").trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, "pt-BR"));

  return NextResponse.json({
    ok: true,
    contatos: data ?? [],
    total: count ?? 0,
    pagina,
    limite,
    totalPaginas: Math.max(1, Math.ceil((count ?? 0) / limite)),
    origens, 
  });
}

export async function POST(request: Request) {
  const resultado = await getUsuarioContexto();
  const supabaseAdmin = getSupabaseAdmin();

  if (!resultado.ok) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status }
    );
  }

  const { usuario } = resultado;

  if (!podeGerenciarContatos(usuario)) {
    return NextResponse.json(
      { ok: false, error: "Sem permissão para criar contato" },
      { status: 403 }
    );
  }

  if (!usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuário sem empresa vinculada" },
      { status: 400 }
    );
  }

  const body = await request.json();

  const nome = body?.nome?.trim() || null;
  const telefoneOriginal = body?.telefone?.trim();
  const telefone = telefoneOriginal
    ? normalizarTelefoneBrasilParaWhatsApp(telefoneOriginal)
    : "";
    
  const email = body?.email?.trim()?.toLowerCase() || null;
  const origem = body?.origem?.trim() || null;
  const campanha = body?.campanha?.trim() || null;
  const status_lead = body?.status_lead || "novo";
  const observacoes = body?.observacoes?.trim() || null;
  const empresa_id = usuario.empresa_id;
  

  if (!empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Empresa é obrigatória" },
      { status: 400 }
    );
  }

  if (!telefone) {
    return NextResponse.json(
      { ok: false, error: "Telefone é obrigatório" },
      { status: 400 }
    );
  }

  if (
    !["novo", "em_atendimento", "qualificado", "cliente", "perdido"].includes(
      status_lead
    )
  ) {
    return NextResponse.json(
      { ok: false, error: "Status do lead inválido" },
      { status: 400 }
    );
  }

  const { data: empresa } = await supabaseAdmin
    .from("empresas")
    .select("id")
    .eq("id", empresa_id)
    .maybeSingle();

  if (!empresa) {
    return NextResponse.json(
      { ok: false, error: "Empresa não encontrada" },
      { status: 404 }
    );
  }

  const { data: contatoExistente } = await supabaseAdmin
    .from("contatos")
    .select("id")
    .eq("empresa_id", empresa_id)
    .eq("telefone", telefone)
    .maybeSingle();

  if (contatoExistente) {
    return NextResponse.json(
      { ok: false, error: "Já existe um contato com esse telefone nesta empresa" },
      { status: 409 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("contatos")
    .insert({
      empresa_id,
      nome,
      telefone,
      email,
      origem,
      campanha,
      status_lead,
      observacoes,
      telefone_revisar: false,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Contato criado com sucesso",
    contato: data,
  });
}