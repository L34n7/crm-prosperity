import { NextResponse } from "next/server";
import { validarAcessoEmailMarketing } from "@/lib/email-marketing/admin";
import {
  buscarEmailsSuprimidos,
  recalcularMetricasCampanhaEmail,
  resolverAudienciaEmail,
} from "@/lib/email-marketing/campanhas";
import { publicarCampanhaEmailQstash } from "@/lib/email-marketing/fila";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();

type TipoAudiencia = "todos" | "lista" | "contatos";

function normalizarTipoAudiencia(valor: unknown): TipoAudiencia {
  if (valor === "lista" || valor === "contatos") return valor;
  return "todos";
}

function dataAgendamento(valor: unknown) {
  if (!valor) return new Date();

  const data = new Date(String(valor));
  return Number.isFinite(data.getTime()) ? data : null;
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
      "id, nome, assunto, status, audiencia_json, agendada_para, iniciada_em, finalizada_em, total_destinatarios, total_enviados, total_entregues, total_abertos, total_cliques, total_bounces, total_reclamacoes, total_descadastros, erro, created_at, updated_at, email_remetentes(nome,email), email_templates(nome)"
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
      {
        ok: false,
        error: "Confirme a criação e o envio da campanha.",
      },
      { status: 400 }
    );
  }

  const nome = String(body?.nome || "").trim();
  const assuntoInformado = String(body?.assunto || "").trim();
  const templateId = String(body?.template_id || "").trim();
  const remetenteId = String(body?.remetente_id || "").trim();
  const tipoAudiencia = normalizarTipoAudiencia(body?.audiencia_tipo);
  const listaId = String(body?.lista_id || "").trim() || null;
  const contatoIds = Array.isArray(body?.contato_ids)
    ? body.contato_ids.map((id) => String(id || "").trim()).filter(Boolean)
    : [];
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

  const [
    { data: template, error: templateError },
    { data: remetente, error: remetenteError },
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
  ]);

  if (templateError || remetenteError) {
    return NextResponse.json(
      {
        ok: false,
        error:
          templateError?.message ||
          remetenteError?.message ||
          "Não foi possível validar campanha.",
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

  let audiencia;

  try {
    audiencia = await resolverAudienciaEmail({
      empresaId,
      tipo: tipoAudiencia,
      listaId,
      contatoIds,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível resolver a audiência.",
      },
      { status: 400 }
    );
  }

  if (!audiencia.contatos.length) {
    return NextResponse.json(
      {
        ok: false,
        error: "A audiência selecionada não possui contatos com e-mail válido.",
      },
      { status: 400 }
    );
  }

  let suprimidos: Set<string>;

  try {
    suprimidos = await buscarEmailsSuprimidos(empresaId);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível validar a lista de supressão.",
      },
      { status: 500 }
    );
  }

  const totalAtivos = audiencia.contatos.filter(
    (contato) => !suprimidos.has(contato.email)
  ).length;

  if (totalAtivos === 0) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Todos os contatos selecionados estão suprimidos e não podem receber e-mails.",
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
        descricao: audiencia.descricao,
        lista_id: listaId,
        contato_ids:
          tipoAudiencia === "contatos" ? contatoIds.slice(0, 5000) : [],
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

  const agoraIso = agora.toISOString();
  const destinatarios = audiencia.contatos.map((contato) => {
    const suprimido = suprimidos.has(contato.email);

    return {
      campanha_id: campanha.id,
      contato_id: contato.id,
      email: contato.email,
      nome: contato.nome,
      status: suprimido ? "suprimido" : "pendente",
      suprimido_em: suprimido ? agoraIso : null,
    };
  });

  for (let inicio = 0; inicio < destinatarios.length; inicio += 500) {
    const lote = destinatarios.slice(inicio, inicio + 500);
    const { error } = await supabaseAdmin
      .from("email_campanha_destinatarios")
      .insert(lote);

    if (error) {
      await supabaseAdmin
        .from("email_campanhas")
        .delete()
        .eq("id", campanha.id);

      return NextResponse.json(
        {
          ok: false,
          error: "Não foi possível preparar os destinatários: " + error.message,
        },
        { status: 500 }
      );
    }
  }

  await recalcularMetricasCampanhaEmail(campanha.id);

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
      total_destinatarios: destinatarios.length,
      total_suprimidos: destinatarios.length - totalAtivos,
      total_programados: totalAtivos,
      agendada_para: alvo.toISOString(),
      message:
        alvo.getTime() > Date.now() + 60_000
          ? "Campanha agendada com sucesso."
          : "Campanha criada e enviada para a fila.",
    },
    { status: 201 }
  );
}
