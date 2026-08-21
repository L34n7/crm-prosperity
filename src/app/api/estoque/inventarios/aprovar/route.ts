import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { can } from "@/lib/permissoes/frontend";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabase = getSupabaseAdmin();
const EPSILON = 0.000001;

function erro(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function texto(valor: unknown) {
  return String(valor ?? "").trim();
}

function numero(valor: unknown) {
  const resultado = Number(valor);
  return Number.isFinite(resultado) ? resultado : Number.NaN;
}

export async function POST(request: Request) {
  const contexto = await getUsuarioContexto();
  if (!contexto.ok) return erro(contexto.error, contexto.status);
  if (!contexto.usuario.empresa_id) return erro("Usuário sem empresa vinculada.");
  if (!can(contexto.usuario.permissoes, "estoque.movimentar")) return erro("Sem permissão para aprovar inventários.", 403);

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return erro("Corpo da requisição inválido.");
  }

  const inventarioId = texto(body.inventario_id);
  const itensEntrada = Array.isArray(body.itens) ? body.itens as Array<Record<string, unknown>> : [];
  if (!inventarioId || !itensEntrada.length) return erro("Informe o inventário e as linhas revisadas.");

  const empresaId = contexto.usuario.empresa_id;
  const [{ data: inventario, error: inventarioError }, { data: itens, error: itensError }] = await Promise.all([
    supabase.from("estoque_inventarios").select("id,status").eq("empresa_id", empresaId).eq("id", inventarioId).maybeSingle(),
    supabase.from("estoque_inventario_itens").select("id,saldo_esperado").eq("empresa_id", empresaId).eq("inventario_id", inventarioId),
  ]);
  if (inventarioError || itensError) return erro(inventarioError?.message || itensError?.message || "Erro ao carregar o inventário.", 500);
  if (!inventario) return erro("Inventário não encontrado.", 404);
  if (inventario.status !== "aguardando_aprovacao") return erro("Este inventário não está aguardando aprovação.", 409);

  const itensBanco = itens ?? [];
  const idsBanco = new Set(itensBanco.map((item) => item.id));
  const idsRecebidos = itensEntrada.map((item) => texto(item.item_id));
  if (idsRecebidos.some((id) => !id) || new Set(idsRecebidos).size !== idsRecebidos.length) return erro("As linhas revisadas do inventário são inválidas.");
  if (itensEntrada.length !== itensBanco.length || idsRecebidos.some((id) => !idsBanco.has(id))) return erro("Revise todas as linhas do inventário antes da aprovação.");

  const revisados = itensEntrada.map((entrada) => {
    const itemId = texto(entrada.item_id);
    const quantidadeAprovada = numero(entrada.quantidade_aprovada);
    const justificativa = texto(entrada.justificativa);
    const itemBanco = itensBanco.find((item) => item.id === itemId)!;
    const divergencia = quantidadeAprovada - Number(itemBanco.saldo_esperado);
    return { itemId, quantidadeAprovada, justificativa, divergencia };
  });

  if (revisados.some((item) => !Number.isFinite(item.quantidadeAprovada) || item.quantidadeAprovada < 0)) return erro("Informe uma quantidade aprovada válida em todas as linhas.");
  if (revisados.some((item) => Math.abs(item.divergencia) > EPSILON && !item.justificativa)) return erro("Justifique todas as linhas com divergência.");

  const atualizacoes = await Promise.all(revisados.map((item) => supabase
    .from("estoque_inventario_itens")
    .update({ quantidade_aprovada: item.quantidadeAprovada, justificativa: Math.abs(item.divergencia) > EPSILON ? item.justificativa : null })
    .eq("empresa_id", empresaId)
    .eq("inventario_id", inventarioId)
    .eq("id", item.itemId)
    .select("id")
    .maybeSingle()));
  const falhaAtualizacao = atualizacoes.find((resultado) => resultado.error || !resultado.data);
  if (falhaAtualizacao) return erro(falhaAtualizacao.error?.message || "Não foi possível salvar a revisão do inventário.", 500);

  const { data, error } = await supabase.rpc("estoque_aprovar_inventario", {
    p_empresa_id: empresaId,
    p_inventario_id: inventarioId,
    p_usuario_id: contexto.usuario.id,
  });
  if (error) return erro(error.message);

  return NextResponse.json({
    ok: true,
    message: "Inventário aprovado e ajuste documentado.",
    documento_id: data?.documento_id,
  });
}
