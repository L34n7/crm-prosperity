import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function DELETE(request: Request, context: { params: Promise<{ id: string; informacaoId: string }> }) {
  const { id, informacaoId } = await context.params;
  const resultado = await getUsuarioContexto();
  if (!resultado.ok) return NextResponse.json({ ok: false, error: resultado.error }, { status: resultado.status });
  const origemConversa = request.headers.get("x-origem-modulo") === "conversas";
  const permissao = origemConversa ? "conversas.editar_contato" : "contatos.editar";
  if (!resultado.usuario.empresa_id || !resultado.usuario.permissoes.includes(permissao)) return NextResponse.json({ ok: false, error: "Sem permissão para excluir informações de captura" }, { status: 403 });

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("contato_informacoes_captura").update({ ativo: false, atualizado_por: resultado.usuario.id })
    .eq("id", informacaoId).eq("empresa_id", resultado.usuario.empresa_id).eq("contato_id", id).eq("ativo", true);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, message: "Informação excluída." });
}
