import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto, type UsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { normalizarTelefoneBrasilParaWhatsApp } from "@/lib/contatos/normalizar-telefone";
import {
  getRequestAuditMetadata,
  registrarLogAuditoriaSeguro,
} from "@/lib/auditoria/logs";
import { classificarDestinatariosPorOptIn } from "@/lib/whatsapp/disparo-politica-lista";

type ContatoLista = {
  id: unknown;
  telefone: unknown;
  [chave: string]: unknown;
};

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
  const disparoAnteriorId =
    searchParams.get("disparo_anterior_id")?.trim() || "";
  const integracaoWhatsappId =
    searchParams.get("integracao_whatsapp_id")?.trim() || "";
  const telefoneRevisar = searchParams.get("telefone_revisar");
  const optIn = searchParams.get("opt_in");
  const optOut = searchParams.get("opt_out");
  const ordenacao = searchParams.get("ordenacao") || "recentes";
  const classificacoes = (searchParams.get("classificacoes") || "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) =>
      ["qualificado", "convertido", "perdido"].includes(item)
    );
  const statusConversa = (searchParams.get("status_conversa") || "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) =>
      [
        "aberta",
        "bot",
        "fila",
        "em_atendimento",
        "aguardando_cliente",
        "encerrado_manual",
        "encerrado_24h",
        "encerrado_aut",
        "sem_conversa",
      ].includes(item)
    );
  const apenasNovos = searchParams.get("contato_novo") === "true";

  const pagina = Math.max(1, Number(searchParams.get("pagina") || "1"));
  const limiteMaximo = disparoAnteriorId ? 2000 : 500;

  const limite = Math.max(
    1,
    Math.min(limiteMaximo, Number(searchParams.get("limite") || "50"))
  );

  const from = (pagina - 1) * limite;
  const to = from + limite - 1;

  const supabaseAdmin = getSupabaseAdmin();

  if (
    disparoAnteriorId &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      disparoAnteriorId
    )
  ) {
    return NextResponse.json(
      { ok: false, error: "Disparo anterior inválido." },
      { status: 400 }
    );
  }

  const camposContatos = `
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
        observacoes,
        telefone_revisar,
        classificacao,
        classificacao_atualizada_em,
        classificacao_evento_id,
        classificacao_protocolo_id,
        contato_novo,
        campanha_exibicao,
        campanha_status,
        campanha_origem_nome,
        telefone_normalizado,
        origem_exibicao,
        opt_in_whatsapp,
        whatsapp_opt_out,
        whatsapp_opt_out_geral,
        whatsapp_opt_out_marketing,
        whatsapp_opt_out_utility,
        conversa_id,
        conversa_status,
        conversa_ultima_mensagem_em,
        conversa_encerrada_em,
        protocolo_atual,
        protocolo_resultado,
        contato_novo_no_inicio,
        iniciado_com_bot,
        finalizado_com_bot,
        finalizado_por_tipo,
        finalizado_por_usuario_id,
        finalizado_por_usuario_nome,
        created_at,
        updated_at
      `;

  let query = disparoAnteriorId
    ? supabaseAdmin
        .rpc(
          "listar_contatos_operacionais_por_disparo_anterior",
          {
            p_empresa_id: usuario.empresa_id,
            p_campanha_id: disparoAnteriorId,
          },
          { count: "exact" }
        )
        .select(camposContatos)
    : supabaseAdmin
        .from("contatos_visao_operacional")
        .select(camposContatos, { count: "exact" });

  query = query.eq("empresa_id", usuario.empresa_id);

  if (classificacoes.length > 0) {
    query = query.in("classificacao", classificacoes);
  } else if (statusLead === "qualificado") {
    query = query.eq("classificacao", "qualificado");
  } else if (statusLead === "cliente") {
    query = query.eq("classificacao", "convertido");
  } else if (statusLead === "perdido") {
    query = query.eq("classificacao", "perdido");
  }

  if (apenasNovos || statusLead === "novo") {
    query = query.gte(
      "created_at",
      new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
    );
  }

  if (statusConversa.length > 0) {
    const statusExistentes = statusConversa.filter(
      (item) => item !== "sem_conversa"
    );

    if (statusConversa.includes("sem_conversa")) {
      query =
        statusExistentes.length > 0
          ? query.or(
              `conversa_status.in.(${statusExistentes.join(",")}),conversa_status.is.null`
            )
          : query.is("conversa_status", null);
    } else {
      query = query.in("conversa_status", statusExistentes);
    }
  }

  if (origem) {
    query = query.eq("origem_exibicao", origem);
  }

  if (rastreamentoCampanhaId) {
    query = query.eq("rastreamento_campanha_id", rastreamentoCampanhaId);
  } else if (campanha) {
    query = query.eq("campanha_exibicao", campanha);
  }

  if (telefoneRevisar === "true") {
    query = query.eq("telefone_revisar", true);
  }

  if (telefoneRevisar === "false") {
    query = query.eq("telefone_revisar", false);
  }

  if (optIn === "true" || optIn === "false") {
    query = query.eq("opt_in_whatsapp", optIn === "true");
  }

  if (optOut === "true" || optOut === "false") {
    query = query.eq("whatsapp_opt_out", optOut === "true");
  }

  if (busca) {
    query = query.or(
      `nome.ilike.%${busca}%,whatsapp_profile_name.ilike.%${busca}%,email.ilike.%${busca}%,origem_exibicao.ilike.%${busca}%,campanha_exibicao.ilike.%${busca}%,telefone.ilike.%${busca}%`
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

  const { data, error, count } = await query.range(from, to);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  let contatos = (
    Array.isArray(data) ? data : data ? [data] : []
  ) as ContatoLista[];

  if (integracaoWhatsappId && contatos.length > 0) {
    try {
      const classificacao = await classificarDestinatariosPorOptIn({
        supabase: supabaseAdmin,
        empresaId: usuario.empresa_id,
        integracaoWhatsappId,
        destinatariosJaCarregadosDoBanco: true,
        destinatarios: contatos.map((contato) => ({
          contatoId: String(contato.id || "").trim() || null,
          telefone: String(contato.telefone || "").trim() || null,
        })),
      });

      contatos = contatos.map((contato) => ({
        ...contato,
        opt_in_whatsapp: classificacao.contatosComOptIn.has(
          String(contato.id)
        ),
        opt_in_whatsapp_integracao_id: integracaoWhatsappId,
      }));
    } catch (optInError) {
      return NextResponse.json(
        {
          ok: false,
          error:
            optInError instanceof Error
              ? optInError.message
              : "Erro ao validar o opt-in por numero.",
        },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    ok: true,
    contatos,
    total: count ?? 0,
    pagina,
    limite,
    totalPaginas: Math.max(1, Math.ceil((count ?? 0) / limite)),
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
