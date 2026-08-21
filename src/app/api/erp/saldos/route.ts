import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { can } from "@/lib/permissoes/frontend";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabase = getSupabaseAdmin();

function erro(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function GET() {
  const contexto = await getUsuarioContexto();
  if (!contexto.ok) return erro(contexto.error, contexto.status);
  if (!contexto.usuario.empresa_id) return erro("Usuário sem empresa vinculada.");
  if (!can(contexto.usuario.permissoes, "pdv.visualizar") && !can(contexto.usuario.permissoes, "pdv.operar")) {
    return erro("Sem permissão para consultar o saldo do PDV.", 403);
  }

  const { data, error } = await supabase
    .from("estoque_saldos")
    .select("estoque_item_id,deposito_id,saldo_fisico,saldo_reservado")
    .eq("empresa_id", contexto.usuario.empresa_id);
  if (error) return erro(`Erro ao carregar saldos do PDV: ${error.message}`, 500);

  const agregados = new Map<string, { estoque_item_id: string; deposito_id: string; saldo_disponivel: number }>();
  for (const saldo of data ?? []) {
    const chave = `${saldo.estoque_item_id}:${saldo.deposito_id}`;
    const atual = agregados.get(chave) ?? { estoque_item_id: saldo.estoque_item_id, deposito_id: saldo.deposito_id, saldo_disponivel: 0 };
    atual.saldo_disponivel += Number(saldo.saldo_fisico) - Number(saldo.saldo_reservado);
    agregados.set(chave, atual);
  }

  return NextResponse.json({ ok: true, saldos: Array.from(agregados.values()) });
}
