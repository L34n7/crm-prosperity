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
    "Sem permissão para cancelar etapas de automações.",
  );
  if (bloqueio) return bloqueio;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const cancelarDependentes = body?.cancelar_dependentes !== false;

  const { data: antes, error: antesError } = await supabase
    .from("rotina_automacao_jobs")
    .select("id,automacao_id,execucao_id,status,titulo,canal,executar_em,depende_de_job_id")
    .eq("empresa_id", usuario.empresa_id)
    .eq("id", id)
    .maybeSingle();

  if (antesError) {
    return NextResponse.json({ ok: false, error: antesError.message }, { status: 500 });
  }
  if (!antes) {
    return NextResponse.json(
      { ok: false, error: "Etapa da automação não encontrada." },
      { status: 404 },
    );
  }
  if (!["pendente", "processando"].includes(antes.status)) {
    return NextResponse.json(
      { ok: false, error: "Somente etapas pendentes ou em processamento podem ser canceladas." },
      { status: 400 },
    );
  }

  const { data: resultado, error: rpcError } = await supabase.rpc(
    "rotina_automacao_cancelar_job",
    {
      p_empresa_id: usuario.empresa_id,
      p_usuario_id: usuario.id,
      p_job_id: id,
      p_cancelar_dependentes: cancelarDependentes,
      p_origem_cancelamento: "modal_execucoes_automacao",
    },
  );

  if (rpcError) {
    return NextResponse.json({ ok: false, error: rpcError.message }, { status: 400 });
  }

  const auditMeta = getRequestAuditMetadata(request);
  await registrarLogAuditoriaSeguro({
    empresa_id: usuario.empresa_id,
    categoria: "automacoes",
    entidade: "rotina_automacao_job",
    entidade_id: id,
    acao: "automacao_etapa_cancelada",
    descricao: cancelarDependentes
      ? "Etapa de automação e etapas dependentes canceladas"
      : "Etapa de automação cancelada",
    usuario_id: usuario.id,
    usuario_nome: usuario.nome,
    usuario_email: usuario.email,
    antes,
    depois: resultado,
    ip: auditMeta.ip,
    user_agent: auditMeta.user_agent,
  });

  return NextResponse.json({ ok: true, resultado });
}
