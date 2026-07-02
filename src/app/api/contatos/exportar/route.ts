import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getUsuarioContexto,
  type UsuarioContexto,
} from "@/lib/auth/get-usuario-contexto";

function podeGerenciarContatos(usuario: UsuarioContexto) {
  const nomesPerfis = (usuario.perfis_dinamicos ?? []).map((perfil) => perfil.nome);

  return (
    nomesPerfis.includes("Administrador") ||
    nomesPerfis.includes("Supervisor") ||
    nomesPerfis.includes("Atendente")
  );
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
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
      { ok: false, error: "Sem permissão para exportar contatos" },
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

  const supabaseAdmin = getSupabaseAdmin();

  const carregarPagina = async (inicio: number, fim: number) => {
    let query = supabaseAdmin
      .from("contatos_visao_operacional")
      .select(`
        nome,
        whatsapp_profile_name,
        telefone,
        email,
        origem,
        origem_exibicao,
        campanha_exibicao,
        classificacao,
        contato_novo,
        conversa_status,
        protocolo_atual,
        protocolo_resultado,
        contato_novo_no_inicio,
        iniciado_com_bot,
        finalizado_com_bot,
        finalizado_por_tipo,
        finalizado_por_usuario_nome,
        observacoes,
        telefone_revisar,
        created_at,
        updated_at
      `)
      .eq("empresa_id", usuario.empresa_id);

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
      query = query.eq(
        "rastreamento_campanha_id",
        rastreamentoCampanhaId
      );
    } else if (campanha) {
      query = query.eq("campanha_exibicao", campanha);
    }

    if (telefoneRevisar === "true") {
      query = query.eq("telefone_revisar", true);
    }

    if (busca) {
      query = query.or(
        `nome.ilike.%${busca}%,whatsapp_profile_name.ilike.%${busca}%,email.ilike.%${busca}%,origem_exibicao.ilike.%${busca}%,campanha_exibicao.ilike.%${busca}%,telefone.ilike.%${busca}%`
      );
    }

    return query
      .order("nome", { ascending: true })
      .order("id", { ascending: true })
      .range(inicio, fim);
  };

  const contatos: Array<Record<string, unknown>> = [];
  const tamanhoPagina = 1000;

  for (let inicio = 0; ; inicio += tamanhoPagina) {
    const { data, error } = await carregarPagina(
      inicio,
      inicio + tamanhoPagina - 1
    );

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    contatos.push(...((data || []) as Array<Record<string, unknown>>));

    if (!data || data.length < tamanhoPagina) {
      break;
    }
  }

  const headers = [
    "nome",
    "whatsapp_profile_name",
    "telefone",
    "email",
    "origem",
    "campanha",
    "classificacao",
    "contato_novo",
    "status_conversa",
    "protocolo_atual",
    "resultado_protocolo",
    "novo_no_inicio_protocolo",
    "iniciado_com_bot",
    "finalizado_com_bot",
    "finalizado_por_tipo",
    "finalizado_por",
    "observacoes",
    "telefone_revisar",
    "created_at",
    "updated_at",
  ];

  const rows = contatos.map((contato) =>
    [
      contato.nome,
      contato.whatsapp_profile_name,
      contato.telefone,
      contato.email,
      contato.origem_exibicao,
      contato.campanha_exibicao,
      contato.classificacao,
      contato.contato_novo ? "sim" : "nao",
      contato.conversa_status,
      contato.protocolo_atual,
      contato.protocolo_resultado,
      contato.contato_novo_no_inicio ? "sim" : "nao",
      contato.iniciado_com_bot ? "sim" : "nao",
      contato.finalizado_com_bot === null
        ? ""
        : contato.finalizado_com_bot
          ? "sim"
          : "nao",
      contato.finalizado_por_tipo,
      contato.finalizado_por_usuario_nome,
      contato.observacoes,
      contato.telefone_revisar ? "sim" : "nao",
      contato.created_at,
      contato.updated_at,
    ]
      .map(csvEscape)
      .join(",")
  );

  const csv = [headers.join(","), ...rows].join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="contatos-crm.csv"',
    },
  });
}
