import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const RESULTADOS_VALIDOS = ["realizado", "faltou", "cancelado"] as const;

type ResultadoFeedback = (typeof RESULTADOS_VALIDOS)[number];

function resultadoValido(valor: string): valor is ResultadoFeedback {
  return RESULTADOS_VALIDOS.includes(valor as ResultadoFeedback);
}

export async function GET() {
  const resultado = await getUsuarioContexto({
    sincronizarAssinatura: false,
  });

  if (!resultado.ok) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status }
    );
  }

  const { usuario } = resultado;

  if (!usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuário sem empresa vinculada." },
      { status: 400 }
    );
  }

  const { data, error } = await getSupabaseAdmin()
    .from("agenda_agendamentos")
    .select(
      `
        id,
        empresa_id,
        agenda_id,
        contato_id,
        conversa_id,
        nome_cliente,
        telefone_cliente,
        inicio_at,
        fim_at,
        status,
        feedback_solicitado_em,
        agenda_calendarios (
          id,
          nome
        ),
        contatos (
          id,
          nome,
          telefone
        )
      `
    )
    .eq("empresa_id", usuario.empresa_id)
    .in("status", ["agendado", "confirmado"])
    .not("feedback_solicitado_em", "is", null)
    .is("feedback_respondido_em", null)
    .order("fim_at", { ascending: true })
    .limit(100);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    pendencias: data || [],
    quantidade: data?.length || 0,
  });
}

export async function PATCH(request: Request) {
  const resultado = await getUsuarioContexto();

  if (!resultado.ok) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status }
    );
  }

  const { usuario } = resultado;

  if (!usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuário sem empresa vinculada." },
      { status: 400 }
    );
  }

  let body: Record<string, unknown>;

  try {
    const valor: unknown = await request.json();

    if (!valor || typeof valor !== "object" || Array.isArray(valor)) {
      throw new Error("invalid_body");
    }

    body = valor as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Corpo da requisição inválido." },
      { status: 400 }
    );
  }

  const agendamentoId = String(body.agendamento_id || "").trim();
  const resposta = String(body.resposta || "").trim();

  if (!agendamentoId || !resultadoValido(resposta)) {
    return NextResponse.json(
      { ok: false, error: "Informe o agendamento e uma resposta válida." },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  const agora = new Date().toISOString();
  const { data, error } = await supabase
    .from("agenda_agendamentos")
    .update({
      status: resposta,
      feedback_respondido_em: agora,
      feedback_resultado: resposta,
      feedback_respondido_por: usuario.id,
      updated_at: agora,
      updated_by: usuario.id,
    })
    .eq("id", agendamentoId)
    .eq("empresa_id", usuario.empresa_id)
    .in("status", ["agendado", "confirmado"])
    .not("feedback_solicitado_em", "is", null)
    .is("feedback_respondido_em", null)
    .select(
      "id, agenda_id, contato_id, conversa_id, status, feedback_respondido_em"
    )
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json(
      {
        ok: false,
        error: "Esta confirmação já foi respondida ou não está mais pendente.",
      },
      { status: 409 }
    );
  }

  await supabase
    .from("notificacoes")
    .update({ lida: true })
    .eq("empresa_id", usuario.empresa_id)
    .eq("metadata_json->>tipo_notificacao", "feedback_agendamento")
    .eq("metadata_json->>agenda_agendamento_id", agendamentoId);

  return NextResponse.json({
    ok: true,
    agendamento: data,
    message:
      resposta === "realizado"
        ? "Agendamento marcado como realizado."
        : resposta === "faltou"
          ? "Não comparecimento registrado."
          : "Agendamento marcado como cancelado.",
  });
}
