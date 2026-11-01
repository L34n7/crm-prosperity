import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { bloquearSemPermissao } from "@/lib/permissoes/servidor";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getRequestAuditMetadata, registrarLogAuditoriaSeguro } from "@/lib/auditoria/logs";

const supabase = getSupabaseAdmin();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PUT(request: Request) {
  const contexto = await getUsuarioContexto();
  if (!contexto.ok) return NextResponse.json({ ok: false, error: contexto.error }, { status: contexto.status });
  const { usuario } = contexto;
  const semContatos = bloquearSemPermissao(usuario, "contatos.editar");
  const semConversas = bloquearSemPermissao(usuario, "conversas.gerenciar_listas");
  if (semContatos && semConversas) return semContatos;
  if (!usuario.empresa_id) return NextResponse.json({ ok: false, error: "Empresa não identificada." }, { status: 400 });
  const body = await request.json().catch(() => null);
  const ids = body?.lista_ids;
  if (!Array.isArray(ids) || ids.length > 1000 ||
      ids.some((id: unknown) => typeof id !== "string" || !UUID.test(id)) ||
      new Set(ids).size !== ids.length) {
    return NextResponse.json({ ok: false, error: "Ordenação inválida." }, { status: 400 });
  }
  // RPC efetua a gravação em uma transação e exige a lista completa da empresa.
  const { data, error } = await supabase.rpc("reordenar_listas_personalizadas", {
    p_empresa_id: usuario.empresa_id, p_lista_ids: ids,
  });
  if (error) return NextResponse.json({ ok: false, error: "Não foi possível salvar a ordem. Atualize a lista e tente novamente." }, { status: 409 });
  const audit = getRequestAuditMetadata(request);
  await registrarLogAuditoriaSeguro({
    empresa_id: usuario.empresa_id,
    categoria: "contatos", entidade: "lista_contatos",
    entidade_id: ids[0] || usuario.empresa_id,
    acao: "listas_personalizadas_reordenadas",
    descricao: `Prioridade de ${ids.length} listas personalizadas atualizada`,
    usuario_id: usuario.id, usuario_nome: usuario.nome, usuario_email: usuario.email,
    metadata: { lista_ids: ids, origem: "ordenacao_compartilhada" },
    ip: audit.ip, user_agent: audit.user_agent,
  });
  return NextResponse.json({ ok: true, atualizadas: data, message: "Ordem das listas salva." });
}
