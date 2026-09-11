import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  calcularProximaAbertura,
  estaDentroHorarioAtendimento,
  normalizarHorarioAtendimento,
} from "./horario-atendimento";
import { publicarPendenciaAgenteIaQstash } from "./fila-agendada";

const supabaseAdmin = getSupabaseAdmin();

type PendenciaHorario = {
  id: string;
  empresa_id: string;
  agente_id: string;
  conversa_id: string;
  mensagem_ids: string[];
  processar_em?: string | null;
  status?: string | null;
  versao: number;
};

export async function processarPoliticaHorarioAtendimento(
  pendenciaId: string
): Promise<{ tratado: boolean; resultado?: Record<string, unknown> }> {
  const { data: pendencia, error } = await supabaseAdmin
    .from("agente_ia_pendencias")
    .select("id, empresa_id, agente_id, conversa_id, mensagem_ids, processar_em, status, versao")
    .eq("id", pendenciaId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!pendencia) return { tratado: false };
  if (["processado", "erro", "cancelado"].includes(String(pendencia.status || ""))) {
    return { tratado: false };
  }

  const atual = pendencia as PendenciaHorario;
  const { data: agente, error: agenteError } = await supabaseAdmin
    .from("agentes_ia")
    .select("id, status, horarios")
    .eq("empresa_id", atual.empresa_id)
    .eq("id", atual.agente_id)
    .maybeSingle();
  if (agenteError) throw new Error(agenteError.message);
  if (!agente || agente.status !== "ativo") return { tratado: false };

  const horario = normalizarHorarioAtendimento(agente.horarios);
  if (horario.ativo && !estaDentroHorarioAtendimento(horario)) {
    const proximaAbertura = calcularProximaAbertura(horario);
    if (!proximaAbertura) {
      return {
        tratado: true,
        resultado: {
          ok: false,
          processado: false,
          motivo: "horario_sem_proxima_abertura",
        },
      };
    }

    const { data: reagendada, error: reagendarError } = await supabaseAdmin.rpc(
      "agente_ia_reagendar_pendencia",
      {
        p_pendencia_id: atual.id,
        p_versao: atual.versao,
        p_processar_em: proximaAbertura.toISOString(),
      }
    );
    if (reagendarError) throw new Error(reagendarError.message);

    const reagendou = Boolean((reagendada as { ok?: boolean } | null)?.ok);
    if (reagendou) {
      await publicarPendenciaAgenteIaQstash(
        atual.id,
        Math.max(1_000, proximaAbertura.getTime() - Date.now())
      );
    }

    return {
      tratado: true,
      resultado: {
        ok: true,
        processado: false,
        motivo: reagendou ? "fora_horario_reagendado" : "pendencia_alterada_durante_reagendamento",
        processarEm: proximaAbertura.toISOString(),
      },
    };
  }

  const mensagemIds = Array.isArray(atual.mensagem_ids)
    ? atual.mensagem_ids.filter(Boolean)
    : [];
  if (!mensagemIds.length) return { tratado: false };

  const { data: ultimaEntrada, error: entradaError } = await supabaseAdmin
    .from("mensagens")
    .select("id, created_at")
    .eq("empresa_id", atual.empresa_id)
    .eq("conversa_id", atual.conversa_id)
    .eq("remetente_tipo", "contato")
    .in("id", mensagemIds)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (entradaError) throw new Error(entradaError.message);
  if (!ultimaEntrada?.created_at) return { tratado: false };

  const { data: resposta, error: respostaError } = await supabaseAdmin
    .from("mensagens")
    .select("id, created_at")
    .eq("empresa_id", atual.empresa_id)
    .eq("conversa_id", atual.conversa_id)
    .in("remetente_tipo", ["usuario", "bot"])
    .gt("created_at", ultimaEntrada.created_at)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (respostaError) throw new Error(respostaError.message);
  if (!resposta) return { tratado: false };

  const { data: cancelada, error: cancelarError } = await supabaseAdmin.rpc(
    "agente_ia_cancelar_pendencia_se_versao",
    {
      p_pendencia_id: atual.id,
      p_versao: atual.versao,
      p_motivo: "conversa_ja_respondida",
    }
  );
  if (cancelarError) throw new Error(cancelarError.message);

  return {
    tratado: Boolean(cancelada),
    resultado: {
      ok: true,
      processado: false,
      motivo: "conversa_ja_respondida",
    },
  };
}
