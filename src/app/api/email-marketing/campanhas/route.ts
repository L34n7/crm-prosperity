import { NextResponse } from "next/server";
import { validarAcessoEmailMarketing } from "@/lib/email-marketing/admin";
import { recalcularMetricasCampanhaEmail } from "@/lib/email-marketing/campanhas";
import { publicarCampanhaEmailQstash } from "@/lib/email-marketing/fila";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();

type TipoAudiencia = "todos" | "listas" | "contatos";

function normalizarTipoAudiencia(valor: unknown): TipoAudiencia {
  if (valor === "listas" || valor === "contatos") return valor;
  return "todos";
}

function dataAgendamento(valor: unknown) {
  if (!valor) return new Date();

  const data = new Date(String(valor));
  return Number.isFinite(data.getTime()) ? data : null;
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

function normalizarFallbacks(valor: unknown) {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) {
    return {};
  }

  const resultado: Record<string, string> = {};

  for (const [chave, bruto] of Object.entries(valor as Record<string, unknown>)) {
    const normalizada = String(chave || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_.-]/g, "")
      .slice(0, 120);

    if (!normalizada) continue;

    resultado[normalizada] = String(bruto ?? "").slice(0, 2000);
  }

  return resultado;
}

export async function GET() {
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

  const { data, error } = await supabaseAdmin
    .from("email_campanhas")
    .select(
      "id, nome, assunto, status, audiencia_json, audiencia_resumo_json, agendada_para, iniciada_em, finalizada_em, total_destinatarios, total_enviados, total_entregues, total_abertos, total_cliques, total_bounces, total_reclamacoes, total_descadastros, erro, created_at, updated_at, email_remetentes(nome,email), email_templates(nome)"
    )
    .eq("empresa_id", empresaId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, campanhas: data ?? [] });
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

  if (body?.confirmar_envio !== true) {
    return NextResponse.json(
      { ok: false, error: "Confirme a criação e o envio da campanha." },
      { status: 400 }
    );
  }

  const nome = String(body?.nome || "").trim();
  const assuntoInformado = String(body?.assunto || "").trim();
  const templateId = String(body?.template_id || "").trim();
  const remetenteId = String(body?.remetente_id || "").trim();
  const tipoAudiencia = normalizarTipoAudiencia(body?.audiencia_tipo);
  const listaIds = idsUuid(body?.lista_ids, 100);
  const contatoIds = idsUuid(body?.contato_ids, 5000);
  const fallbacks = normalizarFallbacks(body?.variaveis_fallbacks);
  const agendadaPara = dataAgendamento(body?.agendada_para);

  if (!nome || !templateId || !remetenteId || !agendadaPara) {
    return NextResponse.json(
      {
        ok: false,
        error: "Preencha nome, template, remetente e data de envio.",
      },
      { status: 400 }
    );
  }

  if (nome.length > 160) {
    return NextResponse.json(
      { ok: false, error: "O nome da campanha é muito longo." },
      { status: 400 }
    );
  }

  if (tipoAudiencia === "listas" && !listaIds.length) {
    return NextResponse.json(
      { ok: false, error: "Selecione pelo menos uma lista." },
      { status: 400 }
    );
  }

  if (tipoAudiencia === "contatos" && !contatoIds.length) {
    return NextResponse.json(
      { ok: false, error: "Selecione pelo menos um contato." },
      { status: 400 }
    );
  }

  const [
    { data: template, error: templateError },
    { data: remetente, error: remetenteError },
    { data: analise, error: analiseError },
  ] = await Promise.all([
    supabaseAdmin
      .from("email_templates")
      .select("id, empresa_id, escopo, nome, assunto, html, texto, status")
      .eq("id", templateId)
      .neq("status", "arquivado")
      .maybeSingle(),
    supabaseAdmin
      .from("email_remetentes")
      .select("id, empresa_id, escopo, nome, email, dominio, status")
      .eq("id", remetenteId)
      .eq("status", "verificado")
      .maybeSingle(),
    supabaseAdmin.rpc("email_marketing_analisar_audiencia", {
      p_empresa_id: empresaId,
      p_lista_ids: tipoAudiencia === "listas" ? listaIds : [],
      p_incluir_todos: tipoAudiencia === "todos",
      p_contato_ids: tipoAudiencia === "contatos" ? contatoIds : [],
    }),
  ]);

  if (templateError || remetenteError || analiseError) {
    return NextResponse.json(
      {
        ok: false,
        error:
          templateError?.message ||
          remetenteError?.message ||
          analiseError?.message ||
          "Não foi possível validar a campanha.",
      },
      { status: 500 }
    );
  }

  const templateAcessivel =
    template &&
    (template.empresa_id === empresaId ||
      (template.empresa_id === null && template.escopo === "sistema"));

  if (!templateAcessivel) {
    return NextResponse.json(
      { ok: false, error: "Template não encontrado." },
      { status: 404 }
    );
  }

  const remetenteAcessivel =
    remetente &&
    (remetente.empresa_id === empresaId ||
      (remetente.empresa_id === null && remetente.escopo === "sistema"));

  if (!remetenteAcessivel) {
    return NextResponse.json(
      { ok: false, error: "Remetente verificado não encontrado." },
      { status: 404 }
    );
  }

  const assunto = assuntoInformado || String(template.assunto || "").trim();

  if (!assunto) {
    return NextResponse.json(
      { ok: false, error: "Informe o assunto do e-mail." },
      { status: 400 }
    );
  }

  const resumo =
    analise && typeof analise === "object"
      ? (analise as Record<string, unknown>)
      : {};
  const totalElegiveis = Number(resumo.elegiveis || 0);

  if (totalElegiveis <= 0) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "A audiência selecionada não possui destinatários elegíveis com e-mail válido.",
        analise: resumo,
      },
      { status: 409 }
    );
  }

  const agora = new Date();
  const alvo =
    agendadaPara.getTime() < agora.getTime() + 30_000
      ? agora
      : agendadaPara;

  const { data: campanha, error: campanhaError } = await supabaseAdmin
    .from("email_campanhas")
    .insert({
      empresa_id: empresaId,
      escopo: "empresa",
      nome,
      assunto,
      remetente_id: remetente.id,
      template_id: template.id,
      html: template.html,
      texto: template.texto,
      status: "agendada",
      audiencia_json: {
        tipo: tipoAudiencia,
        lista_ids: tipoAudiencia === "listas" ? listaIds : [],
        contato_ids: tipoAudiencia === "contatos" ? contatoIds : [],
      },
      audiencia_resumo_json: resumo,
      variaveis_config_json: {
        fallbacks,
      },
      agendada_para: alvo.toISOString(),
      criado_por_usuario_id: acesso.usuario.id,
    })
    .select("id")
    .single();

  if (campanhaError || !campanha) {
    return NextResponse.json(
      {
        ok: false,
        error: campanhaError?.message || "Não foi possível criar a campanha.",
      },
      { status: 500 }
    );
  }

  const { data: preparacao, error: preparacaoError } = await supabaseAdmin.rpc(
    "email_marketing_preparar_destinatarios",
    {
      p_campanha_id: campanha.id,
      p_empresa_id: empresaId,
      p_lista_ids: tipoAudiencia === "listas" ? listaIds : [],
      p_incluir_todos: tipoAudiencia === "todos",
      p_contato_ids: tipoAudiencia === "contatos" ? contatoIds : [],
    }
  );

  if (preparacaoError) {
    await supabaseAdmin
      .from("email_campanhas")
      .delete()
      .eq("id", campanha.id);

    return NextResponse.json(
      {
        ok: false,
        error:
          "Não foi possível preparar os destinatários: " +
          preparacaoError.message,
      },
      { status: 500 }
    );
  }

  await recalcularMetricasCampanhaEmail(campanha.id);

  const preparado =
    preparacao && typeof preparacao === "object"
      ? (preparacao as Record<string, unknown>)
      : {};
  const totalProgramados = Number(preparado.total_programados || 0);

  if (totalProgramados <= 0) {
    await supabaseAdmin
      .from("email_campanhas")
      .update({
        status: "falha",
        erro: "Todos os destinatários foram removidos por supressão.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", campanha.id);

    return NextResponse.json(
      {
        ok: false,
        error: "Todos os destinatários selecionados estão suprimidos.",
        campanha_id: campanha.id,
      },
      { status: 409 }
    );
  }

  const fila = await publicarCampanhaEmailQstash({
    campanhaId: campanha.id,
    executarEm: alvo.toISOString(),
    dedupeSuffix: "inicio-" + Math.floor(alvo.getTime() / 1000),
  });

  if (!fila.ok) {
    await supabaseAdmin
      .from("email_campanhas")
      .update({
        status: "falha",
        erro: fila.erro,
        updated_at: new Date().toISOString(),
      })
      .eq("id", campanha.id);

    return NextResponse.json(
      {
        ok: false,
        error:
          "A campanha foi criada, mas não entrou na fila: " +
          (fila.erro || "erro desconhecido"),
        campanha_id: campanha.id,
      },
      { status: 502 }
    );
  }

  await supabaseAdmin
    .from("email_campanhas")
    .update({
      qstash_message_id: fila.messageId,
      qstash_agendado_em: new Date().toISOString(),
      erro: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", campanha.id);

  return NextResponse.json(
    {
      ok: true,
      campanha_id: campanha.id,
      total_destinatarios: Number(preparado.total_destinatarios || 0),
      total_suprimidos: Number(preparado.total_suprimidos || 0),
      total_programados: totalProgramados,
      analise: resumo,
      agendada_para: alvo.toISOString(),
      message:
        alvo.getTime() > Date.now() + 60_000
          ? "Campanha agendada com sucesso."
          : "Campanha criada e enviada para a fila.",
    },
    { status: 201 }
  );
}
