import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { bloquearSemPermissao } from "@/lib/permissoes/servidor";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const resultado = await getUsuarioContexto();
  if (!resultado.ok) {
    return NextResponse.json({ ok: false, error: resultado.error }, { status: resultado.status });
  }
  const { usuario } = resultado;
  const bloqueio = bloquearSemPermissao(usuario, "contatos.visualizar");
  if (bloqueio) return bloqueio;
  if (!usuario.empresa_id) {
    return NextResponse.json({ ok: false, error: "Empresa não identificada." }, { status: 400 });
  }
  const { id } = await context.params;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuid.test(id)) {
    return NextResponse.json({ ok: false, error: "Identificador de contato inválido." }, { status: 400 });
  }
  const contato = await supabaseAdmin.from("contatos").select("id")
    .eq("empresa_id", usuario.empresa_id).eq("id", id).maybeSingle();
  if (contato.error) {
    return NextResponse.json({ ok: false, error: contato.error.message }, { status: 500 });
  }
  if (!contato.data) {
    return NextResponse.json({ ok: false, error: "Contato não encontrado." }, { status: 404 });
  }

  const [importacaoMembros, conversaMembros] = await Promise.all([
    supabaseAdmin.from("contatos_lista_membros").select("lista_id").eq("contato_id", id),
    supabaseAdmin.from("conversas_listas_contatos").select("lista_id")
      .eq("empresa_id", usuario.empresa_id).eq("contato_id", id),
  ]);
  if (importacaoMembros.error || conversaMembros.error) {
    return NextResponse.json({
      ok: false, error: importacaoMembros.error?.message || conversaMembros.error?.message
    }, { status: 500 });
  }
  const importacaoIds = [...new Set((importacaoMembros.data || []).map((m) => m.lista_id))];
  const conversaIds = [...new Set((conversaMembros.data || []).map((m) => m.lista_id))];
  const [importacao, conversa] = await Promise.all([
    importacaoIds.length
      ? supabaseAdmin.from("contatos_listas").select("id,nome")
        .eq("empresa_id", usuario.empresa_id).in("id", importacaoIds)
        .order("nome", { ascending: true })
      : Promise.resolve({ data: [] as { id: string; nome: string }[], error: null }),
    conversaIds.length
      ? supabaseAdmin.from("conversas_listas").select("id,nome")
        .eq("empresa_id", usuario.empresa_id).in("id", conversaIds)
        .order("nome", { ascending: true })
      : Promise.resolve({ data: [] as { id: string; nome: string }[], error: null }),
  ]);
  if (importacao.error || conversa.error) {
    return NextResponse.json({
      ok: false, error: importacao.error?.message || conversa.error?.message
    }, { status: 500 });
  }
  return NextResponse.json({
    ok: true, importacao: importacao.data || [], conversa: conversa.data || [],
  });
}
