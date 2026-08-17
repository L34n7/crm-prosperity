import { NextRequest, NextResponse } from "next/server";
import { getRequestAuditMetadata, registrarLogAuditoriaSeguro } from "@/lib/auditoria/logs";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { bloquearSemPermissao } from "@/lib/permissoes/servidor";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabase = getSupabaseAdmin();

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const contexto = await getUsuarioContexto();
  if (!contexto.ok) {
    return NextResponse.json(
      { ok: false, error: contexto.error },
      { status: contexto.status },
    );
  }

  const { usuario } = contexto;
  if (!usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuário sem empresa vinculada." },
      { status: 403 },
    );
  }

  const bloqueio = bloquearSemPermissao(
    usuario,
    "automacoes_api.gerenciar",
    "Sem permissão para gerenciar automações.",
  );
  if (bloqueio) return bloqueio;

  const { id } = await params;
  const body = await request.json();
  const status = String(body?.status || "").toLowerCase();
  const cancelarPendentes = body?.cancelar_pendentes === true;

  if (!id || !["ativa", "pausada", "arquivada"].includes(status)) {
    return NextResponse.json(
      { ok: false, error: "Automação ou status inválido." },
      { status: 400 },
    );
  }

  const { data: antes, error: antesError } = await supabase
    .from("rotina_automacoes")
    .select("id,nome,status")
    .eq("empresa_id", usuario.empresa_id)
    .eq("id", id)
    .maybeSingle();

  if (antesError) {
    return NextResponse.json({ ok: false, error: antesError.message }, { status: 500 });
  }
  if (!antes) {
    return NextResponse.json(
      { ok: false, error: "Automação não encontrada." },
      { status: 404 },
    );
  }

  const { data: resultado, error: rpcError } = await supabase.rpc(
    "rotina_automacao_alterar_estado",
    {
      p_empresa_id: usuario.empresa_id,
      p_usuario_id: usuario.id,
      p_automacao_id: id,
      p_status: status,
      p_cancelar_pendentes: cancelarPendentes,
      p_origem_cancelamento: "pagina_automacoes",
    },
  );

  if (rpcError) {
    return NextResponse.json({ ok: false, error: rpcError.message }, { status: 400 });
  }

  const auditMeta = getRequestAuditMetadata(request);
  await registrarLogAuditoriaSeguro({
    empresa_id: usuario.empresa_id,
    categoria: "automacoes",
    entidade: "rotina_automacao",
    entidade_id: id,
    acao:
      status === "ativa"
        ? "automacao_ativada"
        : status === "pausada"
          ? "automacao_pausada"
          : "automacao_arquivada",
    descricao:
      status === "ativa"
        ? "Automação ativada"
        : status === "pausada"
          ? "Automação pausada"
          : "Automação arquivada",
    usuario_id: usuario.id,
    usuario_nome: usuario.nome,
    usuario_email: usuario.email,
    antes,
    depois: { ...antes, status, cancelar_pendentes: cancelarPendentes, resultado },
    ip: auditMeta.ip,
    user_agent: auditMeta.user_agent,
  });

  return NextResponse.json({ ok: true, resultado });
}
