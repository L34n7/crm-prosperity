import { NextResponse } from "next/server";
import { getUsuarioContexto, type UsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

function podeGerenciarContatos(usuario: UsuarioContexto) {
  const perfis = (usuario.perfis_dinamicos ?? []).map((perfil) => perfil.nome);
  return perfis.includes("Administrador") || perfis.includes("Supervisor") || perfis.includes("Atendente");
}

export async function DELETE(_: Request, context: { params: Promise<{ id: string; informacaoId: string }> }) {
  const { id, informacaoId } = await context.params;
  const resultado = await getUsuarioContexto();
  if (!resultado.ok) return NextResponse.json({ ok: false, error: resultado.error }, { status: resultado.status });
  if (!resultado.usuario.empresa_id || !podeGerenciarContatos(resultado.usuario)) return NextResponse.json({ ok: false, error: "Sem permissão para excluir informações de captura" }, { status: 403 });

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("contato_informacoes_captura").update({ ativo: false, atualizado_por: resultado.usuario.id })
    .eq("id", informacaoId).eq("empresa_id", resultado.usuario.empresa_id).eq("contato_id", id).eq("ativo", true);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, message: "Informação excluída." });
}
