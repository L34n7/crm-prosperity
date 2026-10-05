import { NextResponse } from "next/server";
import { Receiver } from "@upstash/qstash";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  publicarEventoAgendadoQstash,
  type EventoAgendadoTipo,
} from "@/lib/eventos-db/qstash";
import { processAgendaAutomationById } from "@/lib/agendas/automation-runtime";
import { processAgendaResponseById } from "@/lib/agendas/agenda-response-runtime";
import {
  processarFilaGoogleCalendarPorId,
  processarIntegracaoGoogleCalendarPendentePorId,
} from "@/lib/agendas/google-calendar";
import { processarEventoIntegracaoMapeadaPorId } from "@/lib/rotinas-automacao/runtime-eventos-mapeados";
import { processarCheckoutExpiracaoPorId } from "@/lib/automacoes/process-automation-engine-checkout-runtime";
import { processarRecuperacaoCheckoutPorId } from "@/lib/automacoes/process-automation-engine-checkout-recovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const supabase = getSupabaseAdmin();

type Payload = {
  tipo: EventoAgendadoTipo;
  id: string;
  executarEm?: string | null;
  etapa?: number;
};

function receiver() {
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!currentSigningKey || !nextSigningKey) return null;
  return new Receiver({ currentSigningKey, nextSigningKey });
}

async function verificarAssinatura(request: Request, body: string) {
  const assinatura = request.headers.get("upstash-signature");
  const verificador = receiver();
  if (!assinatura || !verificador) return false;
  try {
    return await verificador.verify({
      signature: assinatura,
      body,
      url: request.url,
    });
  } catch {
    return false;
  }
}

async function processarConversa(id: string) {
  const { data, error } = await supabase
    .from("conversas")
    .select("id,status,window_expires_at,atendimento_humano_ate")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return { ok: true, ignorado: true, motivo: "nao_encontrada" };
  if (
    !["aberta", "bot", "fila", "em_atendimento", "aguardando_cliente"].includes(
      String(data.status)
    )
  ) {
    return { ok: true, ignorado: true, motivo: `status_${data.status}` };
  }

  const datas = [data.window_expires_at, data.atendimento_humano_ate]
    .map((valor) => Date.parse(String(valor || "")))
    .filter((valor) => Number.isFinite(valor));
  const due = datas.length ? Math.max(...datas) : Number.NaN;
  if (Number.isFinite(due) && due > Date.now() + 1_000) {
    return { ok: true, reagendarEm: new Date(due).toISOString() };
  }

  const { data: resultado, error: rpcError } = await supabase.rpc(
    "processar_conversa_expirada_id",
    { p_conversa_id: id }
  );
  if (rpcError) throw rpcError;
  return { ok: true, resultado };
}

async function executar(payload: Payload) {
  switch (payload.tipo) {
    case "conversa_expirar":
      return processarConversa(payload.id);
    case "agenda_execucao":
      return processAgendaAutomationById(payload.id);
    case "agenda_resposta":
      return processAgendaResponseById(payload.id);
    case "google_fila":
      return processarFilaGoogleCalendarPorId(payload.id);
    case "google_integracao":
      return processarIntegracaoGoogleCalendarPendentePorId(payload.id);
    case "integracao_outbox":
      return processarEventoIntegracaoMapeadaPorId("outbox", payload.id);
    case "rotina_job":
      return processarEventoIntegracaoMapeadaPorId("job", payload.id);
    case "checkout_recuperacao":
      return processarRecuperacaoCheckoutPorId(payload.id);
    case "checkout_expiracao":
      return processarCheckoutExpiracaoPorId(payload.id);
    default:
      return { ok: true, ignorado: true, motivo: "tipo_nao_suportado" };
  }
}

export async function POST(request: Request) {
  const body = await request.text();

  if (!(await verificarAssinatura(request, body))) {
    return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 401 });
  }

  try {
    const payload = JSON.parse(body) as Payload;
    const resultado = (await executar(payload)) as {
      ok?: boolean;
      reagendarEm?: string | null;
      [key: string]: unknown;
    };

    if (resultado?.reagendarEm) {
      const publicado = await publicarEventoAgendadoQstash({
        tipo: payload.tipo,
        id: payload.id,
        executarEm: resultado.reagendarEm,
        etapa: Math.max(0, Number(payload.etapa || 0)) + 1,
      });
      if (!publicado.ok) {
        throw new Error(
          `Falha ao reagendar ${payload.tipo}/${payload.id}: ${publicado.erro}`
        );
      }
    }

    return NextResponse.json({ ok: true, resultado });
  } catch (error) {
    console.error("[WORKER EVENTOS DB] Erro:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
