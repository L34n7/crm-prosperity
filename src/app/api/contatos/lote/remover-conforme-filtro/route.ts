import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { bloquearSemPermissao } from "@/lib/permissoes/servidor";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getRequestAuditMetadata, registrarLogAuditoriaSeguro } from "@/lib/auditoria/logs";

const admin = getSupabaseAdmin();
const MAX = 500;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const ctx = await getUsuarioContexto();
  if (!ctx.ok) {
    return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
  }
  const { usuario } = ctx;
  const bloqueio = bloquearSemPermissao(usuario, "contatos.editar");
  if (bloqueio) return bloqueio;
  if (!usuario.empresa_id) {
    return NextResponse.json({ ok: false, error: "Empresa não identificada." }, { status: 400 });
  }
  const entrada = await request.json().catch(() => null);
  if (!entrada || typeof entrada !== "object" || Array.isArray(entrada)) {
    return NextResponse.json({ ok: false, error: "Dados inválidos." }, { status: 400 });
  }
  const ids: string[] = Array.from(new Set(
    (Array.isArray(entrada.ids) ? entrada.ids : []).map((id: unknown) => String(id || "").trim())
  ));
  const tipo = entrada.tipo;
  const filtro = typeof entrada.filtro === "string" ? entrada.filtro.trim() : "";
  if (!ids.length || ids.length > MAX || ids.some((id) => !UUID.test(id)) ||
      !filtro || filtro.length > 255 || (tipo !== "campanha" && tipo !== "origem")) {
    return NextResponse.json({ ok: false, error: "Seleção ou filtro inválido." }, { status: 400 });
  }
  const empresaId = usuario.empresa_id;
  let condicao: "rastreamento_campanha_id" | "campanha" | "origem";
  let valor = filtro;
  let payload: Record<string, null>;

  if (tipo === "campanha") {
    payload = { rastreamento_campanha_id: null, rastreamento_origem_id: null, campanha: null };
    if (filtro.startsWith("rastreamento:")) {
      valor = filtro.slice("rastreamento:".length);
      if (!UUID.test(valor)) {
        return NextResponse.json({ ok: false, error: "Campanha inválida." }, { status: 400 });
      }
      const campanha = await admin.from("rastreamento_campanhas").select("id")
        .eq("empresa_id", empresaId).eq("id", valor).maybeSingle();
      if (campanha.error || !campanha.data) {
        return NextResponse.json({
          ok: false, error: campanha.error?.message || "Campanha não encontrada."
        }, { status: campanha.error ? 500 : 404 });
      }
      condicao = "rastreamento_campanha_id";
    } else {
      condicao = "campanha";
    }
  } else {
    // O filtro textual de origem não é lista de importação.
    if (filtro.startsWith("lista:")) {
      return NextResponse.json({ ok: false, error: "Use a operação de vínculo para listas importadas." }, { status: 400 });
    }
    condicao = "origem";
    payload = { origem: null };
  }

  // O WHERE da remoção é repetido na gravação: contatos de outro filtro não serão alterados.
  const resultado = await admin.from("contatos")
    .update(payload)
    .eq("empresa_id", empresaId)
    .in("id", ids)
    .eq(condicao, valor)
    .select("id");
  if (resultado.error) {
    return NextResponse.json({ ok: false, error: resultado.error.message }, { status: 500 });
  }

  const alterados = resultado.data || [];
  if (alterados.length) {
    const audit = getRequestAuditMetadata(request);
    await registrarLogAuditoriaSeguro({
      empresa_id: empresaId,
      categoria: "contatos",
      entidade: "contato",
      entidade_id: alterados[0].id,
      acao: tipo === "campanha" ? "remover_campanha_conforme_filtro" : "remover_origem_conforme_filtro",
      descricao: `${alterados.length} contato(s) removido(s) do filtro de ${tipo}`,
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      usuario_email: usuario.email,
      metadata: { contatos_ids: alterados.map((item) => item.id), tipo, filtro },
      ip: audit.ip,
      user_agent: audit.user_agent
    });
  }
  return NextResponse.json({
    ok: true, atualizados: alterados.length,
    message: alterados.length
      ? `${alterados.length} contato(s) desvinculado(s) da ${tipo} filtrada.`
      : "Nenhum contato selecionado possuía o vínculo filtrado.",
  });
}
