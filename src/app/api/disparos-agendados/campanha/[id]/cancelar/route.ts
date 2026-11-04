import { NextRequest, NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { podeRealizarDisparos } from "@/lib/whatsapp/disparo-permissoes";
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
  const contexto = await getUsuarioContexto();
  if (!contexto.ok) {
    return NextResponse.json(
      { ok: false, error: contexto.error },
      { status: contexto.status }
    );
  }

  const { usuario } = contexto;
  if (!usuario.empresa_id || !podeRealizarDisparos(usuario)) {
    return NextResponse.json(
      { ok: false, error: "Sem permissão para cancelar campanhas." },
      { status: 403 }
    );
  }

  const { id } = await params;
  if (!UUID_VALIDO.test(id)) {
    return NextResponse.json(
      { ok: false, error: "Identificador da campanha inválido." },
      { status: 400 }
    );
  }

  const db = getSupabaseAdmin();
  const base = () =>
    db
      .from("automacao_agendamentos")
      .eq("empresa_id", usuario.empresa_id!)
      .eq("tipo_agendamento", "disparo_template")
      .eq("payload_json->>origem", "manual_agendado")
      .eq("payload_json->>agendamento_grupo_id", id);

  const { data: amostra, error: amostraErro } = await base()
    .select("id,status,executar_em,payload_json")
    .limit(1)
    .maybeSingle();

  if (amostraErro) {
    return NextResponse.json(
      { ok: false, error: "Erro ao consultar a campanha." },
      { status: 500 }
    );
  }

  if (!amostra) {
    return NextResponse.json(
      { ok: false, error: "Campanha agendada não encontrada." },
      { status: 404 }
    );
  }

  const { count: pendentesAntes, error: contagemErro } = await base()
    .select("id", { head: true, count: "exact" })
    .eq("status", "pendente");

  if (contagemErro) {
    return NextResponse.json(
      { ok: false, error: "Não foi possível verificar os envios pendentes." },
      { status: 500 }
    );
  }

  if (!pendentesAntes) {
    return NextResponse.json(
      { ok: false, error: "Não existem envios pendentes nesta campanha." },
      { status: 409 }
    );
  }

  const agora = new Date().toISOString();
  // Uma única atualização condicional impede que envios já em execução
  // sejam marcados como cancelados.
  const { count: cancelados, error: cancelamentoErro } = await base()
    .update({ status: "cancelado" }, { count: "exact" })
    .eq("status", "pendente");

  if (cancelamentoErro) {
    return NextResponse.json(
      { ok: false, error: "Não foi possível cancelar os envios pendentes." },
      { status: 500 }
    );
  }

  if (!cancelados) {
    return NextResponse.json(
      { ok: false, error: "Os envios já começaram a ser processados." },
      { status: 409 }
    );
  }

  const auditoria = getRequestAuditMetadata(request);
  await registrarLogAuditoriaSeguro({
    empresa_id: usuario.empresa_id,
    categoria: "disparos",
    entidade: "disparo",
    entidade_id: id,
    acao: "disparo_agendado_campanha_cancelada",
    descricao: `Campanha de WhatsApp cancelada: ${cancelados} envio(s) pendente(s)`,
    usuario_id: usuario.id,
    usuario_nome: usuario.nome,
    usuario_email: usuario.email,
    antes: {
      status: "pendente",
      pendentes: pendentesAntes,
      campanha: amostra.payload_json?.nome_campanha || null,
      executar_em: amostra.executar_em,
    },
    depois: {
      status: "cancelado",
      cancelados,
      cancelado_em: agora,
      cancelado_por: usuario.acesso_temporario?.operador?.id || usuario.id,
    },
    detalhes: {
      canal: "whatsapp",
      grupo_manual_id: id,
      cancelamento_em: agora,
      cancelamento_escopo: "envios_ainda_pendentes",
    },
    ip: auditoria.ip,
    user_agent: auditoria.user_agent,
  });

  return NextResponse.json({
    ok: true,
    cancelados,
    message: `${cancelados} envio(s) pendente(s) cancelado(s). Os já iniciados ou executados não foram alterados.`,
  });
}
