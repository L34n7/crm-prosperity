import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

import type {
  AgendaAssistente,
  ContextoAssistenteFluxos,
} from "./route-contexto-ia";

const supabaseAdmin = getSupabaseAdmin();

type ObjetoJson = Record<string, unknown>;

function texto(valor: unknown, limite = 20000) {
  return String(valor || "").trim().slice(0, limite);
}

function objeto(valor: unknown): ObjetoJson {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as ObjetoJson)
    : {};
}

export async function carregarContextoAssistente(body: ObjetoJson) {
  const resultado = await getUsuarioContexto();
  const modo = texto(body.modo, 80) || "criar_fluxo";

  if (!resultado.ok || !resultado.usuario.empresa_id) {
    return {
      contexto: {
        ativo: true,
        modo,
        instrucaoCompleta: texto(body.instrucao),
        agendas: [] as AgendaAssistente[],
      } satisfies ContextoAssistenteFluxos,
      empresaId: null as string | null,
      usuarioId: null as string | null,
    };
  }

  const empresaId = resultado.usuario.empresa_id;
  const usuarioId = resultado.usuario.id;
  const sessaoId = texto(body.sessao_id || body.sessaoId, 120);
  let instrucaoCompleta = texto(body.instrucao);

  if (!instrucaoCompleta && sessaoId) {
    const { data: sessao } = await supabaseAdmin
      .from("automacao_assistente_ia_execucoes")
      .select("instrucao, contexto_json")
      .eq("id", sessaoId)
      .eq("empresa_id", empresaId)
      .eq("usuario_id", usuarioId)
      .maybeSingle();

    const contexto = objeto(sessao?.contexto_json);
    instrucaoCompleta =
      texto(contexto.instrucao) ||
      texto(objeto(contexto.conversa).instrucao) ||
      texto(sessao?.instrucao);
  }

  const { data: agendas } = await supabaseAdmin
    .from("agenda_calendarios")
    .select(
      "id, nome, descricao, timezone, duracao_minutos, janela_dias, status"
    )
    .eq("empresa_id", empresaId)
    .eq("status", "ativo")
    .order("nome", { ascending: true });

  return {
    contexto: {
      ativo: true,
      modo,
      instrucaoCompleta,
      agendas: ((agendas || []) as Array<
        AgendaAssistente & { status?: string }
      >).map((agenda) => ({
        id: agenda.id,
        nome: agenda.nome,
        descricao: agenda.descricao || null,
        timezone: agenda.timezone || null,
        duracao_minutos: agenda.duracao_minutos ?? null,
        janela_dias: agenda.janela_dias ?? null,
      })),
    } satisfies ContextoAssistenteFluxos,
    empresaId,
    usuarioId,
  };
}

export async function persistirInstrucaoCompleta(params: {
  response: Response;
  instrucaoCompleta: string;
  empresaId: string | null;
  usuarioId: string | null;
}) {
  if (
    !params.instrucaoCompleta ||
    !params.empresaId ||
    !params.usuarioId ||
    !params.response.ok
  ) {
    return;
  }

  const corpo = await params.response
    .clone()
    .json()
    .catch(() => null as ObjetoJson | null);
  const sessaoId = texto(corpo?.sessao_id, 120);

  if (!sessaoId) return;

  const { data: sessao } = await supabaseAdmin
    .from("automacao_assistente_ia_execucoes")
    .select("contexto_json")
    .eq("id", sessaoId)
    .eq("empresa_id", params.empresaId)
    .eq("usuario_id", params.usuarioId)
    .maybeSingle();

  const contexto = objeto(sessao?.contexto_json);
  const conversa = objeto(contexto.conversa);

  const { error } = await supabaseAdmin
    .from("automacao_assistente_ia_execucoes")
    .update({
      instrucao: params.instrucaoCompleta,
      contexto_json: {
        ...contexto,
        instrucao: params.instrucaoCompleta,
        conversa: {
          ...conversa,
          instrucao: params.instrucaoCompleta,
        },
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", sessaoId)
    .eq("empresa_id", params.empresaId)
    .eq("usuario_id", params.usuarioId);

  if (error) {
    console.warn(
      "[assistente-fluxos] nao foi possivel persistir a instrucao completa",
      error
    );
  }
}
