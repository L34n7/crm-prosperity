import { NextResponse } from "next/server";
import { validarChamadaCron } from "@/lib/cron/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  encerrarBotPorClassificacao,
  processarClassificacaoPendente,
} from "@/lib/leads/processar-classificacao";
import {
  MODO_CONTINGENCIA_SUPABASE_ATIVO,
  respostaContingenciaSupabase,
} from "@/lib/operacional/contingencia-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const db = getSupabaseAdmin();

export async function GET(request: Request) {
  if (!validarChamadaCron(request).ok) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (MODO_CONTINGENCIA_SUPABASE_ATIVO) {
    return respostaContingenciaSupabase("classificacao_leads");
  }

  try {
    const { data, error } = await db.rpc("crmar_lead_reivindicar_pendencias", { p_limite: 30 });
    if (error) throw error;
    const pendencias = data || [];
    let processados = 0;
    let falhas = 0;
    for (const item of pendencias) {
      const resultado = await processarClassificacaoPendente(item);
      if (resultado.ok) processados += 1;
      else falhas += 1;
    }

    // A expiração não usa IA e preserva os atendimentos humanos.
    const { data: inativos, error: erroInativos } = await db.rpc(
      "crmar_lead_classificar_inativos", { p_limite: 100 }
    );
    if (erroInativos) throw erroInativos;
    let encerradosBot = 0;
    for (const item of inativos || []) {
      const encerrado = await encerrarBotPorClassificacao({
        empresaId: item.empresa_id,
        conversaId: item.conversa_id,
        contatoId: item.contato_id,
        despedir: false,
      });
      if (encerrado) encerradosBot += 1;
    }

    return NextResponse.json({
      ok: true, processados, falhas,
      classificados_inatividade: (inativos || []).length,
      bots_encerrados: encerradosBot,
    });
  } catch (error) {
    console.error("[CRON CLASSIFICACAO LEADS]", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Falha no processamento" },
      { status: 500 }
    );
  }
}
