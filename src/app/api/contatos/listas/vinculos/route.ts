import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { bloquearSemPermissao } from "@/lib/permissoes/servidor";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getRequestAuditMetadata, registrarLogAuditoriaSeguro } from "@/lib/auditoria/logs";

const supabaseAdmin = getSupabaseAdmin();
const MAX_CONTATOS = 500;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function atualizarVinculos(request: Request, acao: "adicionar" | "remover") {
  const resultado = await getUsuarioContexto();
  if (!resultado.ok) return NextResponse.json({ ok: false, error: resultado.error }, { status: resultado.status });
  const { usuario } = resultado;
  const bloqueio = bloquearSemPermissao(usuario, "contatos.editar", "Sem permissão para alterar listas importadas.");
  if (bloqueio) return bloqueio;
  if (!usuario.empresa_id) {
    return NextResponse.json({ ok: false, error: "Usuário sem empresa vinculada." }, { status: 400 });
  }
  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    body = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return NextResponse.json({ ok: false, error: "Dados inválidos." }, { status: 400 });
  }
  const listaId = String(body.lista_id || "").trim();
  const contatoIds: string[] = Array.from(new Set(
    (Array.isArray(body.contato_ids) ? body.contato_ids : []).map((id: unknown) => String(id || "").trim())
  ));
  if (!UUID_REGEX.test(listaId) || !contatoIds.length || contatoIds.some(id => !UUID_REGEX.test(id))) {
    return NextResponse.json({ ok: false, error: "Selecione uma lista importada e contatos válidos." }, { status: 400 });
  }
  if (contatoIds.length > MAX_CONTATOS) {
    return NextResponse.json({ ok: false, error: `Selecione no máximo ${MAX_CONTATOS} contatos por operação.` }, { status: 400 });
  }
  const [lista, contatos] = await Promise.all([
    supabaseAdmin.from("contatos_listas").select("id,nome")
      .eq("empresa_id", usuario.empresa_id).eq("id", listaId).maybeSingle(),
    supabaseAdmin.from("contatos").select("id").eq("empresa_id", usuario.empresa_id).in("id", contatoIds)
  ]);
  if (lista.error || contatos.error) {
    return NextResponse.json({ ok: false, error: lista.error?.message || contatos.error?.message }, { status: 500 });
  }
  if (!lista.data) {
    return NextResponse.json({ ok: false, error: "Lista importada não encontrada." }, { status: 404 });
  }
  if ((contatos.data || []).length !== contatoIds.length) {
    return NextResponse.json({ ok: false, error: "Um ou mais contatos não pertencem à empresa." }, { status: 400 });
  }

  const antes = await supabaseAdmin.from("contatos_lista_membros")
    .select("contato_id").eq("lista_id", listaId).in("contato_id", contatoIds);
  if (antes.error) return NextResponse.json({ ok: false, error: antes.error.message }, { status: 500 });
  const existentes = new Set((antes.data || []).map(item => item.contato_id));
  const faltantes = contatoIds.filter(id => acao === "adicionar" ? !existentes.has(id) : existentes.has(id));
  if (faltantes.length) {
    const req = acao === "adicionar"
      ? supabaseAdmin.from("contatos_lista_membros").upsert(
          faltantes.map(id => ({ lista_id: listaId, contato_id: id })),
          { onConflict: "lista_id,contato_id", ignoreDuplicates: true }
        )
      : supabaseAdmin.from("contatos_lista_membros").delete().eq("lista_id", listaId).in("contato_id", faltantes);
    const { error } = await req;
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  const depois = await supabaseAdmin.from("contatos_lista_membros")
    .select("contato_id").eq("lista_id", listaId).in("contato_id", contatoIds);
  if (depois.error) return NextResponse.json({ ok: false, error: depois.error.message }, { status: 500 });
  const presentes = new Set((depois.data || []).map(item => item.contato_id));
  const confirmado = acao === "adicionar"
    ? contatoIds.every(id => presentes.has(id))
    : contatoIds.every(id => !presentes.has(id));
  if (!confirmado) {
    return NextResponse.json({ ok: false, error: "A alteração não foi confirmada. Atualize a página e tente novamente." }, { status: 500 });
  }
  const alterados = contatoIds.filter(id => acao === "adicionar"
    ? !existentes.has(id) && presentes.has(id)
    : existentes.has(id) && !presentes.has(id));
  if (alterados.length) {
    const audit = getRequestAuditMetadata(request);
    await registrarLogAuditoriaSeguro({
      empresa_id: usuario.empresa_id, categoria: "contatos", entidade: "lista_contatos", entidade_id: listaId,
      acao: acao === "adicionar" ? "contatos_adicionados_lista_importacao" : "contatos_removidos_lista_importacao",
      descricao: `${alterados.length} contato(s) ${acao === "adicionar" ? "adicionado(s) à" : "removido(s) da"} lista importada "${lista.data.nome}"`,
      usuario_id: usuario.id, usuario_nome: usuario.nome, usuario_email: usuario.email,
      metadata: { contatos_ids: alterados, tipo_lista: "importacao" },
      ip: audit.ip, user_agent: audit.user_agent
    });
  }
  const message = alterados.length
    ? `${alterados.length} contato(s) ${acao === "adicionar" ? "adicionado(s) à" : "removido(s) da"} lista importada "${lista.data.nome}".`
    : acao === "adicionar"
      ? `Os contatos selecionados já pertencem à lista importada "${lista.data.nome}".`
      : `Os contatos selecionados já estavam fora da lista importada "${lista.data.nome}".`;
  return NextResponse.json({ ok: true, total: contatoIds.length, alterados: alterados.length, message });
}
export async function POST(request: Request) { return atualizarVinculos(request, "adicionar"); }
export async function DELETE(request: Request) { return atualizarVinculos(request, "remover"); }
