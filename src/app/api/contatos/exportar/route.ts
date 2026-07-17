import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getUsuarioContexto,
  type UsuarioContexto,
} from "@/lib/auth/get-usuario-contexto";
import { usuarioPodeAcessarIntegracaoWhatsapp } from "@/lib/whatsapp/integracoes-multiplas";
import {
  CLASSIFICACOES_LEAD,
  classificacaoLeadValida,
  normalizarClassificacaoLead,
} from "@/lib/leads/classificacao";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function dataIsoValida(valor: string) {
  if (!DATA_REGEX.test(valor)) return false;

  const [ano, mes, dia] = valor.split("-").map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));

  return (
    data.getUTCFullYear() === ano &&
    data.getUTCMonth() === mes - 1 &&
    data.getUTCDate() === dia
  );
}

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
  const optIn = searchParams.get("opt_in");
  const optOut = searchParams.get("opt_out");
  const integracaoWhatsappId =
    searchParams.get("integracao_whatsapp_id")?.trim() || "";
  const mensagemDataInicio =
    searchParams.get("mensagem_data_inicio")?.trim() || "";
  const mensagemDataFim =
    searchParams.get("mensagem_data_fim")?.trim() || "";
  const ultimoAtendenteId =
    searchParams.get("ultimo_atendente_id")?.trim() || "";
  const classificacoes = (searchParams.get("classificacoes") || "")
    .split(",")
    .map((item) => item.trim())
    .filter(classificacaoLeadValida)
    .map((item) => normalizarClassificacaoLead(item, "novo"))
    .filter((item) => CLASSIFICACOES_LEAD.includes(item));
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

  if (integracaoWhatsappId && !UUID_REGEX.test(integracaoWhatsappId)) {
    return NextResponse.json(
      { ok: false, error: "Integração WhatsApp inválida." },
      { status: 400 }
    );
  }

  if (ultimoAtendenteId && !UUID_REGEX.test(ultimoAtendenteId)) {
    return NextResponse.json(
      { ok: false, error: "Atendente inválido." },
      { status: 400 }
    );
  }

  if (
    (mensagemDataInicio && !dataIsoValida(mensagemDataInicio)) ||
    (mensagemDataFim && !dataIsoValida(mensagemDataFim))
  ) {
    return NextResponse.json(
      { ok: false, error: "Período de mensagens inválido." },
      { status: 400 }
    );
  }

  if (
    mensagemDataInicio &&
    mensagemDataFim &&
    mensagemDataInicio > mensagemDataFim
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: "A data inicial não pode ser posterior à data final.",
      },
      { status: 400 }
    );
  }

  if ((optIn || optOut) && !integracaoWhatsappId) {
    return NextResponse.json(
      {
        ok: false,
        error: "Selecione uma integração para filtrar opt-in ou opt-out.",
      },
      { status: 400 }
    );
  }

  if (
    integracaoWhatsappId &&
    !(await usuarioPodeAcessarIntegracaoWhatsapp({
      usuario,
      empresaId: usuario.empresa_id,
      integracaoId: integracaoWhatsappId,
    }))
  ) {
    return NextResponse.json(
      { ok: false, error: "Sem acesso à integração selecionada." },
      { status: 403 }
    );
  }

  const carregarPagina = async (inicio: number, fim: number) => {
    let query = supabaseAdmin
      .rpc("listar_contatos_operacionais_contexto", {
        p_empresa_id: usuario.empresa_id,
        p_integracao_whatsapp_id: integracaoWhatsappId || null,
        p_mensagem_data_inicio: mensagemDataInicio || null,
        p_mensagem_data_fim: mensagemDataFim || null,
        p_ultimo_atendente_id: ultimoAtendenteId || null,
        p_filtrar_por_integracao: Boolean(integracaoWhatsappId),
      })
      .select(`
        id,
        nome,
        whatsapp_profile_name,
        telefone,
        email,
        origem,
        origem_exibicao,
        campanha_exibicao,
        classificacao,
        contato_novo,
        opt_in_whatsapp,
        whatsapp_opt_out,
        whatsapp_opt_out_geral,
        whatsapp_opt_out_marketing,
        whatsapp_opt_out_utility,
        conversa_status,
        protocolo_atual,
        protocolo_resultado,
        contato_novo_no_inicio,
        iniciado_com_bot,
        finalizado_com_bot,
        finalizado_por_tipo,
        finalizado_por_usuario_nome,
        contexto_integracao_whatsapp_id,
        contexto_integracao_nome,
        contexto_integracao_numero,
        ultima_mensagem_contato_em,
        ultimo_atendente_id,
        ultimo_atendente_nome,
        observacoes,
        telefone_revisar,
        created_at,
        updated_at
      `)
      .eq("empresa_id", usuario.empresa_id);

    if (classificacoes.length > 0) {
      query = query.in("classificacao", classificacoes);
    } else if (statusLead && classificacaoLeadValida(statusLead)) {
      query = query.eq(
        "classificacao",
        normalizarClassificacaoLead(statusLead, "novo")
      );
    }

    if (apenasNovos) {
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

    const registros = (Array.isArray(data)
      ? data
      : data
        ? [data]
        : []) as Array<Record<string, unknown>>;

    contatos.push(...registros);

    if (registros.length < tamanhoPagina) {
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
    "integracao_whatsapp",
    "numero_integracao",
    "opt_in_whatsapp",
    "opt_out_whatsapp",
    "opt_out_geral",
    "opt_out_marketing",
    "opt_out_utility",
    "status_conversa",
    "protocolo_atual",
    "resultado_protocolo",
    "novo_no_inicio_protocolo",
    "iniciado_com_bot",
    "finalizado_com_bot",
    "finalizado_por_tipo",
    "finalizado_por",
    "ultimo_atendente",
    "ultima_mensagem_do_contato",
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
      contato.contexto_integracao_nome,
      contato.contexto_integracao_numero,
      contato.opt_in_whatsapp === null ||
      contato.opt_in_whatsapp === undefined
        ? ""
        : contato.opt_in_whatsapp
          ? "sim"
          : "nao",
      contato.whatsapp_opt_out ? "sim" : "nao",
      contato.whatsapp_opt_out_geral ? "sim" : "nao",
      contato.whatsapp_opt_out_marketing ? "sim" : "nao",
      contato.whatsapp_opt_out_utility ? "sim" : "nao",
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
      contato.ultimo_atendente_nome,
      contato.ultima_mensagem_contato_em,
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
