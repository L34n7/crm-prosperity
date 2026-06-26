import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto, type UsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { normalizarTelefoneBrasilParaWhatsApp } from "@/lib/contatos/normalizar-telefone";
import {
  getRequestAuditMetadata,
  registrarLogAuditoriaSeguro,
} from "@/lib/auditoria/logs";


function podeGerenciarContatos(usuario: UsuarioContexto) {
  const nomesPerfis = (usuario.perfis_dinamicos ?? []).map((perfil) => perfil.nome);

  return (
    nomesPerfis.includes("Administrador") ||
    nomesPerfis.includes("Supervisor") ||
    nomesPerfis.includes("Atendente")
  );
}

function obterRelacaoUnica<T>(relacao: T | T[] | null | undefined): T | null {
  if (Array.isArray(relacao)) {
    return relacao[0] ?? null;
  }

  return relacao ?? null;
}

async function buscarCampanhaRastreamento(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  empresaId: string,
  campanhaId: string
) {
  const { data, error } = await supabaseAdmin
    .from("rastreamento_campanhas")
    .select(
      `
        id,
        nome,
        origem_id,
        rastreamento_origens (
          id,
          nome
        )
      `
    )
    .eq("empresa_id", empresaId)
    .eq("id", campanhaId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
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
  const rastreamentoCampanhaId =
    searchParams.get("rastreamento_campanha_id")?.trim() || "";
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
        whatsapp_profile_name,
        telefone,
        email,
        origem,
        campanha,
        rastreamento_origem_id,
        rastreamento_campanha_id,
        rastreamento_link_id,
        rastreamento_clique_id,
        status_lead,
        observacoes,
        telefone_revisar,
        created_at,
        updated_at,
        rastreamento_campanhas (
          id,
          nome,
          codigo,
          status,
          rastreamento_origens (
            id,
            nome
          )
        )
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

  if (rastreamentoCampanhaId) {
    query = query.eq("rastreamento_campanha_id", rastreamentoCampanhaId);
  } else if (campanha) {
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
      `nome.ilike.%${busca}%,whatsapp_profile_name.ilike.%${busca}%,email.ilike.%${busca}%,origem.ilike.%${busca}%,campanha.ilike.%${busca}%,telefone.ilike.%${busca}%`
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
          whatsapp_profile_name,
          telefone,
          email,
          origem,
          campanha,
          rastreamento_origem_id,
          rastreamento_campanha_id,
          rastreamento_link_id,
          rastreamento_clique_id,
          status_lead,
          observacoes,
          telefone_revisar,
          created_at,
          updated_at,
          rastreamento_campanhas (
            id,
            nome,
            codigo,
            status,
            rastreamento_origens (
              id,
              nome
            )
          )
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

    if (rastreamentoCampanhaId) {
      queryLote = queryLote.eq("rastreamento_campanha_id", rastreamentoCampanhaId);
    } else if (campanha) {
      queryLote = queryLote.eq("campanha", campanha);
    }

    if (telefoneRevisar === "true") {
      queryLote = queryLote.eq("telefone_revisar", true);
    }

    if (telefoneRevisar === "false") {
      queryLote = queryLote.eq("telefone_revisar", false);
    }

    if (busca) {
      queryLote = queryLote.or(
        `nome.ilike.%${busca}%,whatsapp_profile_name.ilike.%${busca}%,email.ilike.%${busca}%,origem.ilike.%${busca}%,campanha.ilike.%${busca}%,telefone.ilike.%${busca}%`
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

  const { data: campanhasData } = await supabaseAdmin
    .from("contatos")
    .select("campanha")
    .eq("empresa_id", usuario.empresa_id)
    .not("campanha", "is", null);

  const { data: campanhasRastreamentoData } = await supabaseAdmin
    .from("rastreamento_campanhas")
    .select("nome")
    .eq("empresa_id", usuario.empresa_id);

  const campanhasLegadas = Array.from(
    new Set(
      (campanhasData || [])
        .map((item) => String(item.campanha || "").trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, "pt-BR"));

  const campanhas = Array.from(
    new Set(
      [
        ...campanhasLegadas,
        ...(campanhasRastreamentoData || []).map((item) =>
          String(item.nome || "").trim()
        ),
      ]
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
    campanhas,
    campanhas_legadas: campanhasLegadas,
  });
}


export async function POST(request: Request) {
  const resultado = await getUsuarioContexto();
  const supabaseAdmin = getSupabaseAdmin();
  const auditMeta = getRequestAuditMetadata(request);

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
  const rastreamentoCampanhaId =
    String(body?.rastreamento_campanha_id || "").trim() || null;
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

  let campanhaRastreamento = null;

  if (rastreamentoCampanhaId) {
    try {
      campanhaRastreamento = await buscarCampanhaRastreamento(
        supabaseAdmin,
        empresa_id,
        rastreamentoCampanhaId
      );
    } catch (error) {
      return NextResponse.json(
        {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "Erro ao buscar campanha de rastreamento.",
        },
        { status: 500 }
      );
    }

    if (!campanhaRastreamento) {
      return NextResponse.json(
        { ok: false, error: "Campanha de rastreamento nao encontrada." },
        { status: 404 }
      );
    }
  }

  const origemDaCampanha = obterRelacaoUnica(
    campanhaRastreamento?.rastreamento_origens
  );
  const origem = origemDaCampanha?.nome || body?.origem?.trim() || null;
  const campanha = campanhaRastreamento?.nome || body?.campanha?.trim() || null;

  const { data, error } = await supabaseAdmin
    .from("contatos")
    .insert({
      empresa_id,
      nome,
      telefone,
      email,
      origem,
      campanha,
      rastreamento_origem_id: campanhaRastreamento?.origem_id || null,
      rastreamento_campanha_id: campanhaRastreamento?.id || null,
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

  await registrarLogAuditoriaSeguro({
    empresa_id,
    categoria: "contatos",
    entidade: "contato",
    entidade_id: data.id,
    acao: "contato_criado",
    descricao: `Contato ${nome || telefone} criado`,
    usuario_id: usuario.id,
    usuario_nome: usuario.nome,
    usuario_email: usuario.email,
    depois: data,
    ip: auditMeta.ip,
    user_agent: auditMeta.user_agent,
  });

  return NextResponse.json({
    ok: true,
    message: "Contato criado com sucesso",
    contato: data,
  });
}
