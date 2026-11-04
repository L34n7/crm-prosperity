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
  { params }: { params: Promise<{ id: string }> }
) {
  const acesso = await validarAcessoEmailMarketing("email_marketing.campanhas");
  if (!acesso.ok) {
    return NextResponse.json(
      { ok: false, error: acesso.error },
      { status: acesso.status }
    );
  }

  const empresaId = acesso.usuario.empresa_id!;
  const { id } = await params;
  if (!UUID_VALIDO.test(id)) {
    return NextResponse.json({ ok: false, error: "Campanha inválida." }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  const { data: campanha, error: campanhaErro } = await db
    .from("email_campanhas")
    .select("id,nome,status,agendada_para,total_destinatarios,total_enviados")
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
      { ok: false, error: "Esta campanha já foi concluída ou cancelada." },
      { status: 409 }
    );
  }

  const agora = new Date().toISOString();
  // Primeiro bloqueie novas execuções do worker.
  const { data: bloqueada, error: bloqueioErro } = await db
    .from("email_campanhas")
    .update({
      status: "cancelada",
      finalizada_em: agora,
      updated_at: agora,
      erro: null,
    })
    .eq("id", id)
    .eq("empresa_id", empresaId)
    .in("status", ["agendada", "processando", "pausada"])
    .select("id")
    .maybeSingle();

  if (bloqueioErro || !bloqueada) {
    return NextResponse.json(
      { ok: false, error: "A campanha começou a mudar de estado. Atualize e tente novamente." },
      { status: 409 }
    );
  }

  const { count: cancelados, error: destinatariosErro } = await db
    .from("email_campanha_destinatarios")
    .update({
      status: "cancelado",
      erro: "Envio cancelado manualmente pela empresa.",
      next_attempt_at: null,
      updated_at: agora,
    }, { count: "exact" })
    .eq("campanha_id", id)
    .eq("status", "pendente")
    .is("provider_message_id", null);

  if (destinatariosErro) {
    console.error("[EMAIL MARKETING] Falha ao cancelar destinatários:", destinatariosErro);
    return NextResponse.json(
      {
        ok: false,
        error: "A campanha foi bloqueada, mas houve erro ao atualizar os destinatários. Os envios não iniciados permanecem bloqueados.",
      },
      { status: 500 }
    );
  }

  await recalcularMetricasCampanhaEmail(id);
  const auditMeta = getRequestAuditMetadata(request);
  await registrarLogAuditoriaSeguro({
    empresa_id: empresaId,
    categoria: "disparos",
    entidade: "disparo",
    entidade_id: id,
    acao: "email_marketing_campanha_cancelada",
    descricao: `Campanha de e-mail cancelada; ${cancelados || 0} envio(s) pendente(s) interrompido(s)`,
    usuario_id: acesso.usuario.id,
    usuario_nome: acesso.usuario.nome,
    usuario_email: acesso.usuario.email,
    antes: campanha,
    depois: {
      status: "cancelada",
      cancelados: cancelados || 0,
      cancelado_em: agora,
      cancelado_por: acesso.usuario.acesso_temporario?.operador?.id || acesso.usuario.id,
    },
    detalhes: {
      canal: "email",
      escopo: "campanha",
      apenas_pendentes: true,
      cancelado_em: agora,
    },
    ip: auditMeta.ip,
    user_agent: auditMeta.user_agent,
  });

  return NextResponse.json({
    ok: true,
    cancelados: cancelados || 0,
    message: `Campanha cancelada. ${cancelados || 0} envio(s) ainda pendente(s) não serão realizados. Mensagens já enviadas ou em processamento não podem ser desfeitas.`,
  });
}
