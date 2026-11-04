import { NextRequest, NextResponse } from "next/server";
import { validarAcessoEmailMarketing } from "@/lib/email-marketing/admin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { recalcularMetricasCampanhaEmail } from "@/lib/email-marketing/campanhas";
import {
  getRequestAuditMetadata,
  registrarLogAuditoriaSeguro,
} from "@/lib/auditoria/logs";

const UUID_VALIDO =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; destinatarioId: string }> }
) {
  const acesso = await validarAcessoEmailMarketing("email_marketing.campanhas");
  if (!acesso.ok) {
    return NextResponse.json(
      { ok: false, error: acesso.error },
      { status: acesso.status }
    );
  }

  const { id, destinatarioId } = await params;
  if (!UUID_VALIDO.test(id) || !UUID_VALIDO.test(destinatarioId)) {
    return NextResponse.json(
      { ok: false, error: "Campanha ou destinatário inválido." },
      { status: 400 }
    );
  }

  const db = getSupabaseAdmin();
  const empresaId = acesso.usuario.empresa_id!;
  const { data: campanha, error: campanhaErro } = await db
    .from("email_campanhas")
    .select("id,nome,status")
    .eq("id", id)
    .eq("empresa_id", empresaId)
    .maybeSingle();

  if (campanhaErro || !campanha) {
    return NextResponse.json(
      { ok: false, error: "Campanha não encontrada." },
      { status: 404 }
    );
  }

  if (!["agendada", "processando", "pausada"].includes(campanha.status)) {
    return NextResponse.json(
      { ok: false, error: "A campanha já está concluída ou cancelada." },
      { status: 409 }
    );
  }

  const { data: destinatario, error: consultaErro } = await db
    .from("email_campanha_destinatarios")
    .select("id,email,nome,status,provider_message_id")
    .eq("id", destinatarioId)
    .eq("campanha_id", id)
    .maybeSingle();

  if (consultaErro || !destinatario) {
    return NextResponse.json(
      { ok: false, error: "Destinatário não encontrado." },
      { status: 404 }
    );
  }

  if (destinatario.status !== "pendente" || destinatario.provider_message_id) {
    return NextResponse.json(
      { ok: false, error: "Só é possível cancelar e-mails ainda pendentes de envio." },
      { status: 409 }
    );
  }

  const agora = new Date().toISOString();
  const { data: cancelado, error: cancelamentoErro } = await db
    .from("email_campanha_destinatarios")
    .update({
      status: "cancelado",
      erro: "Envio cancelado manualmente.",
      next_attempt_at: null,
      updated_at: agora,
    })
    .eq("id", destinatarioId)
    .eq("campanha_id", id)
    .eq("status", "pendente")
    .is("provider_message_id", null)
    .select("id")
    .maybeSingle();

  if (cancelamentoErro || !cancelado) {
    return NextResponse.json(
      { ok: false, error: "Este e-mail já entrou em processamento e não pode mais ser cancelado." },
      { status: 409 }
    );
  }

  await recalcularMetricasCampanhaEmail(id);

  const auditMeta = getRequestAuditMetadata(request);
  await registrarLogAuditoriaSeguro({
    empresa_id: empresaId,
    categoria: "disparos",
    entidade: "disparo",
    entidade_id: id,
    acao: "email_marketing_destinatario_cancelado",
    descricao: "Envio de e-mail agendado cancelado individualmente",
    usuario_id: acesso.usuario.id,
    usuario_nome: acesso.usuario.nome,
    usuario_email: acesso.usuario.email,
    antes: { ...destinatario, campanha: campanha.nome },
    depois: {
      destinatario_id: destinatarioId,
      status: "cancelado",
      cancelado_em: agora,
      cancelado_por: acesso.usuario.acesso_temporario?.operador?.id || acesso.usuario.id,
    },
    detalhes: {
      canal: "email",
      escopo: "destinatario",
      cancelado_em: agora,
    },
    ip: auditMeta.ip,
    user_agent: auditMeta.user_agent,
  });

  return NextResponse.json({
    ok: true,
    message: "Envio individual cancelado. O e-mail não será disparado.",
  });
}
