import { getSupabaseAdmin } from "@/lib/supabase/admin";

import type { ContextoAssistenteFluxos } from "./route-contexto-ia";
import type { RespostaOpenAI } from "./route-validacao-ia";

type ObjetoJson = Record<string, unknown>;

const supabaseAdmin = getSupabaseAdmin();

function objeto(valor: unknown): ObjetoJson {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as ObjetoJson)
    : {};
}

function jsonSeguro(valor: unknown) {
  try {
    return JSON.parse(JSON.stringify(valor));
  } catch {
    return { erro_serializacao: String(valor) };
  }
}

function respostaParaDiagnostico(resposta: RespostaOpenAI | null | undefined) {
  if (!resposta) return null;
  return {
    id: resposta.id || null,
    output_text:
      typeof resposta.output_text === "string" ? resposta.output_text : null,
    usage: jsonSeguro(resposta.usage || null),
    output: jsonSeguro(resposta.output || null),
  };
}

export async function registrarDiagnosticoIa(params: {
  contexto: ContextoAssistenteFluxos;
  fase: string;
  payload?: unknown;
  resposta?: RespostaOpenAI | null;
  problemas?: string[];
  metadados?: Record<string, unknown>;
}) {
  try {
    const { error } = await supabaseAdmin
      .from("automacao_assistente_ia_diagnosticos")
      .insert({
        empresa_id: params.contexto.empresaId || null,
        usuario_id: params.contexto.usuarioId || null,
        sessao_id: params.contexto.sessaoId || null,
        fase: params.fase,
        response_id: params.resposta?.id || null,
        payload_json:
          params.payload === undefined ? null : jsonSeguro(params.payload),
        resposta_json: respostaParaDiagnostico(params.resposta),
        problemas_json: params.problemas || null,
        metadados_json: {
          modo: params.contexto.modo,
          ...objeto(params.metadados),
        },
      });

    if (error) {
      console.warn(
        "[assistente-fluxos] falha ao persistir diagnostico da IA",
        error
      );
    }
  } catch (error) {
    console.warn(
      "[assistente-fluxos] excecao ao persistir diagnostico da IA",
      error
    );
  }
}
