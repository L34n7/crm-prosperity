import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { processarFilaRecuperacaoFluxoPorId } from "@/lib/automacoes/recuperacao-fluxo-fila";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const token = String(request.nextUrl.searchParams.get("token") || "").trim();

  if (!UUID_REGEX.test(token)) {
    return NextResponse.json({ ok: false, error: "Token inválido." }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data: jobs, error } = await supabase
    .from("fila_processamento_auto")
    .select("id")
    .eq("tipo_job", "recuperar_fluxo_conversa")
    .eq("status", "pendente")
    .contains("payload_json", { support_token: token })
    .order("executar_em", { ascending: true })
    .limit(50);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!jobs?.length) {
    return NextResponse.json({ ok: false, error: "Token sem jobs pendentes." }, { status: 404 });
  }

  const resultados = [];
  for (const job of jobs) {
    try {
      resultados.push(await processarFilaRecuperacaoFluxoPorId(job.id));
    } catch (error) {
      resultados.push({
        ok: false,
        processado: false,
        erro: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    total: resultados.length,
    processados: resultados.filter((item) => item.processado === true).length,
    ignorados: resultados.filter((item) => item.ignorado === true).length,
    erros: resultados.filter((item) => item.ok === false && item.processado !== true).length,
    resultados,
  });
}
