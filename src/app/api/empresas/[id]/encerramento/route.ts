import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { can } from "@/lib/permissoes/can";
import { PERMISSAO_INTERNA_EMPRESAS } from "@/lib/permissoes/internas";
import {
  encerrarEmpresaAdministrativamente, restaurarEmpresaAdministrativamente
} from "@/lib/empresas/encerramento";

export const maxDuration = 60;

async function obterAcesso(empresaId: string) {
  const contexto = await getUsuarioContexto({ ignorarAcessoTemporario: true, sincronizarAssinatura: false });
  if (!contexto.ok) throw new Error("Acesso não autorizado.");
  const autorizado = await Promise.all([
    can(contexto.usuario.id, PERMISSAO_INTERNA_EMPRESAS),
    can(contexto.usuario.id, "empresas.editar"),
  ]);
  if (autorizado.some((x) => !x)) throw new Error("Sem permissão para gerenciar encerramentos.");
  if (contexto.usuario.empresa_id === empresaId) throw new Error("Não é permitido encerrar o próprio ambiente administrativo.");
  const supabase = getSupabaseAdmin();
  const { data: empresa, error } = await supabase.from("empresas").select("id,nome_fantasia,status")
    .eq("id", empresaId).maybeSingle();
  if (error || !empresa) throw new Error("Empresa não encontrada.");
  return { usuario: contexto.usuario, empresa };
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { empresa, usuario } = await obterAcesso(id);
    const body = await request.json().catch(() => ({}));
    if (String(body?.confirmacao || "").trim() !== empresa.nome_fantasia.trim())
      return NextResponse.json({ ok: false, error: "Digite o nome da empresa para confirmar o encerramento." }, { status: 400 });
    if (empresa.status === "cancelada")
      return NextResponse.json({ ok: true, message: "Empresa já está cancelada." });
    const resultado = await encerrarEmpresaAdministrativamente(id, usuario.id);
    return NextResponse.json({ ok: true, message: "Empresa encerrada. Dados preservados por até 60 dias; backup pendente de geração.", resultado });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Erro ao encerrar empresa." }, { status: 400 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { empresa } = await obterAcesso(id);
    const body = await request.json().catch(() => ({}));
    if (String(body?.confirmacao || "").trim() !== empresa.nome_fantasia.trim())
      return NextResponse.json({ ok: false, error: "Confirme o nome da empresa para restaurar." }, { status: 400 });
    const resultado = await restaurarEmpresaAdministrativamente(id);
    return NextResponse.json({ ok: true, message: "Empresa restaurada com acesso liberado para login, porém bloqueada por pendência financeira. A regularização/renovação é necessária; depois, revise WhatsApp e automações.", resultado });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Erro ao restaurar empresa." }, { status: 400 });
  }
}
