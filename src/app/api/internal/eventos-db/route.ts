import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  publicarEventoAgendadoQstash,
  type EventoAgendadoTipo,
} from "@/lib/eventos-db/qstash";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabase = getSupabaseAdmin();

type EventoBanco = {
  table?: string;
  schema?: string;
  type?: string;
  record?: Record<string, unknown> | null;
  old_record?: Record<string, unknown> | null;
};

async function publicar(
  tipo: EventoAgendadoTipo,
  id: string,
  executarEm?: string | null
) {
  const resultado = await publicarEventoAgendadoQstash({
    tipo,
    id,
    executarEm,
    etapa: 0,
  });

  if (!resultado.ok) {
    console.error("[EVENTOS_DB] Falha ao publicar no QStash:", {
      tipo,
      id,
      erro: resultado.erro,
    });
  }

  return resultado;
}

function maiorData(...valores: Array<string | null | undefined>) {
  let maior: number | null = null;
  for (const valor of valores) {
    if (!valor) continue;
    const ms = Date.parse(valor);
    if (!Number.isFinite(ms)) continue;
    if (maior === null || ms > maior) maior = ms;
  }
  return maior === null ? null : new Date(maior).toISOString();
}

async function processarTabela(tabela: string, id: string) {
  if (tabela === "conversas") {
    const { data, error } = await supabase
      .from("conversas")
      .select("id,status,window_expires_at,atendimento_humano_ate")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return { ignorado: "nao_encontrada" };
    if (
      !["aberta", "bot", "fila", "em_atendimento", "aguardando_cliente"].includes(
        String(data.status)
      )
    ) {
      return { ignorado: `status_${data.status}` };
    }
    const executarEm = maiorData(data.window_expires_at, data.atendimento_humano_ate);
    if (!executarEm) return { ignorado: "sem_expiracao" };
    return publicar("conversa_expirar", id, executarEm);
  }

  if (tabela === "agenda_automacao_execucoes") {
    const { data, error } = await supabase
      .from("agenda_automacao_execucoes")
      .select("id,status,executar_em,proxima_tentativa_em")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data || data.status !== "pendente") {
      return { ignorado: data ? `status_${data.status}` : "nao_encontrada" };
    }
    return publicar("agenda_execucao", id, data.proxima_tentativa_em || data.executar_em);
  }

  if (tabela === "agenda_automacao_respostas") {
    const { data, error } = await supabase
      .from("agenda_automacao_respostas")
      .select("id,status,proxima_tentativa_em")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data || data.status !== "pendente") {
      return { ignorado: data ? `status_${data.status}` : "nao_encontrada" };
    }
    return publicar(
      "agenda_resposta",
      id,
      data.proxima_tentativa_em || new Date().toISOString()
    );
  }

  if (tabela === "agenda_google_sync_fila") {
    const { data, error } = await supabase
      .from("agenda_google_sync_fila")
      .select("id,status,proxima_tentativa_em")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data || data.status !== "pendente") {
      return { ignorado: data ? `status_${data.status}` : "nao_encontrada" };
    }
    return publicar(
      "google_fila",
      id,
      data.proxima_tentativa_em || new Date().toISOString()
    );
  }

  if (tabela === "agenda_google_integracoes") {
    const { data, error } = await supabase
      .from("agenda_google_integracoes")
      .select("id,sync_ativo,sync_status")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (
      !data ||
      data.sync_ativo !== true ||
      data.sync_status !== "pendente_google"
    ) {
      return { ignorado: data ? `status_${data.sync_status}` : "nao_encontrada" };
    }
    return publicar("google_integracao", id, new Date().toISOString());
  }

  if (tabela === "integracao_eventos_outbox") {
    const { data, error } = await supabase
      .from("integracao_eventos_outbox")
      .select("id,status,processar_em")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data || data.status !== "pendente") {
      return { ignorado: data ? `status_${data.status}` : "nao_encontrado" };
    }
    return publicar("integracao_outbox", id, data.processar_em);
  }

  if (tabela === "rotina_automacao_jobs") {
    const { data, error } = await supabase
      .from("rotina_automacao_jobs")
      .select("id,status,executar_em,proxima_tentativa_em,contexto_json")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data || data.status !== "pendente") {
      return { ignorado: data ? `status_${data.status}` : "nao_encontrado" };
    }
    const origem =
      data.contexto_json &&
      typeof data.contexto_json === "object" &&
      !Array.isArray(data.contexto_json)
        ? String((data.contexto_json as Record<string, unknown>).origem || "")
        : "";
    if (origem !== "integracao_mapeada") {
      return { ignorado: "origem_diferente" };
    }
    return publicar(
      "rotina_job",
      id,
      data.proxima_tentativa_em || data.executar_em
    );
  }

  if (tabela === "pagamento_gateway_transacoes") {
    const { data, error } = await supabase
      .from("pagamento_gateway_transacoes")
      .select("id,status,expira_em,created_at,no_id,empresa_id,recuperacao_enviada_em")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data || data.status !== "aguardando_pagamento") {
      return { ignorado: data ? `status_${data.status}` : "nao_encontrado" };
    }

    const publicacoes: unknown[] = [];
    const expiraMs = Date.parse(String(data.expira_em || ""));
    if (Number.isFinite(expiraMs)) {
      publicacoes.push(
        await publicar(
          "checkout_expiracao",
          id,
          new Date(expiraMs + 5 * 60_000).toISOString()
        )
      );
    }

    if (!data.recuperacao_enviada_em && data.no_id) {
      const { data: no } = await supabase
        .from("automacao_nos")
        .select("configuracao_json,ativo")
        .eq("id", data.no_id)
        .eq("empresa_id", data.empresa_id)
        .maybeSingle();

      const config =
        no?.configuracao_json &&
        typeof no.configuracao_json === "object" &&
        !Array.isArray(no.configuracao_json)
          ? (no.configuracao_json as Record<string, unknown>)
          : {};
      if (no?.ativo === true && config.recuperacao_ativa === true) {
        const minutos = Math.max(
          1,
          Math.floor(Number(config.recuperacao_apos_minutos || 10))
        );
        const criadoMs = Date.parse(String(data.created_at || ""));
        if (Number.isFinite(criadoMs)) {
          publicacoes.push(
            await publicar(
              "checkout_recuperacao",
              id,
              new Date(criadoMs + minutos * 60_000).toISOString()
            )
          );
        }
      }
    }

    return { ok: true, publicacoes };
  }

  return { ignorado: "tabela_nao_suportada" };
}

export async function POST(request: Request) {
  if (request.headers.get("x-crm-db-event") !== "postgres-v1") {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = (await request.json()) as EventoBanco;
    const tabela = String(payload.table || "").trim();
    const registro = payload.record || payload.old_record || {};
    const id = String(registro.id || "").trim();

    if (!tabela || !id) {
      return NextResponse.json({ ok: true, ignorado: "payload_sem_identificador" });
    }

    const resultado = await processarTabela(tabela, id);
    return NextResponse.json({ ok: true, tabela, id, resultado });
  } catch (error) {
    console.error("[EVENTOS_DB] Erro:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
