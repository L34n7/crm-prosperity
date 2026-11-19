import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { isAdministrador } from "@/lib/auth/authorization";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const db = getSupabaseAdmin();

async function autorizar() {
  const contexto = await getUsuarioContexto();
  if (!contexto.ok) return { erro: NextResponse.json({ ok: false, error: contexto.error }, { status: contexto.status }), empresaId: "" };
  if (!contexto.usuario.empresa_id || !isAdministrador(contexto.usuario)) {
    return {
      erro: NextResponse.json({ ok: false, error: "Apenas administradores podem configurar a classificação automática." }, { status: 403 }),
      empresaId: "",
    };
  }
  return { erro: null, empresaId: contexto.usuario.empresa_id };
}

export async function GET() {
  const { erro, empresaId } = await autorizar();
  if (erro) return erro;
  const { data, error } = await db.from("configuracoes_empresa")
    .select("classificacao_automatica_ativa,classificacao_modo,classificacao_inatividade_horas")
    .eq("empresa_id", empresaId).maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({
    ok: true,
    configuracao: {
      ativa: data?.classificacao_automatica_ativa !== false,
      modo: data?.classificacao_modo === "regras" ? "regras" : "hibrido",
      inatividade_horas: data?.classificacao_inatividade_horas ?? 23,
    },
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PUT(request: Request) {
  const { erro, empresaId } = await autorizar();
  if (erro) return erro;
  const body = await request.json().catch(() => null);
  if (!body || typeof body.ativa !== "boolean" ||
      !["hibrido", "regras"].includes(body.modo) ||
      !Number.isInteger(body.inatividade_horas) ||
      body.inatividade_horas < 1 || body.inatividade_horas > 168) {
    return NextResponse.json({ ok: false, error: "Configuração inválida." }, { status: 400 });
  }
  const { error } = await db.from("configuracoes_empresa")
    .upsert({
      empresa_id: empresaId,
      classificacao_automatica_ativa: body.ativa,
      classificacao_modo: body.modo,
      classificacao_inatividade_horas: body.inatividade_horas,
      updated_at: new Date().toISOString(),
    }, { onConflict: "empresa_id" });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, message: "Classificação automática configurada." });
}
