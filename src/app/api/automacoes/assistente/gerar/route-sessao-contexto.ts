import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

import type {
  AgendaAssistente,
  ContextoAssistenteFluxos,
  MidiaAssistente,
} from "./route-contexto-ia";

const supabaseAdmin = getSupabaseAdmin();

type ObjetoJson = Record<string, unknown>;

function texto(valor: unknown, limite = 20000) {
  return String(valor || "").trim().slice(0, limite);
}

function limparSeparadores(instrucao: string) {
  return instrucao
    .split(/\r?\n/)
    .filter((linha) => !/^\s*[-–—]{5,}\s*$/.test(linha))
    .join("\n")
    .trim();
}

function objeto(valor: unknown): ObjetoJson {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as ObjetoJson)
    : {};
}

export async function carregarContextoAssistente(body: ObjetoJson) {
  const resultado = await getUsuarioContexto();
  const modo = texto(body.modo, 80) || "criar_fluxo";
  const sessaoId = texto(body.sessao_id || body.sessaoId, 120) || null;

  if (!resultado.ok || !resultado.usuario.empresa_id) {
    return {
      contexto: {
        ativo: true,
        modo,
        instrucaoCompleta: limparSeparadores(texto(body.instrucao)),
        agendas: [] as AgendaAssistente[],
        midias: [] as MidiaAssistente[],
        empresaId: null,
        usuarioId: null,
        sessaoId,
      } satisfies ContextoAssistenteFluxos,
      empresaId: null as string | null,
      usuarioId: null as string | null,
    };
  }

  const empresaId = resultado.usuario.empresa_id;
  const usuarioId = resultado.usuario.id;
  let instrucaoCompleta = limparSeparadores(texto(body.instrucao));

  if (!instrucaoCompleta && sessaoId) {
    const { data: sessao } = await supabaseAdmin
      .from("automacao_assistente_ia_execucoes")
      .select("instrucao, contexto_json")
      .eq("id", sessaoId)
      .eq("empresa_id", empresaId)
      .eq("usuario_id", usuarioId)
      .maybeSingle();

    const contexto = objeto(sessao?.contexto_json);
    instrucaoCompleta = limparSeparadores(
      texto(contexto.instrucao) ||
        texto(objeto(contexto.conversa).instrucao) ||
        texto(sessao?.instrucao)
    );
  }

  const [{ data: agendas }, { data: midias }] = await Promise.all([
    supabaseAdmin
      .from("agenda_calendarios")
      .select(
        "id, nome, descricao, timezone, duracao_minutos, janela_dias, status"
      )
      .eq("empresa_id", empresaId)
      .eq("status", "ativo")
      .order("nome", { ascending: true }),
    supabaseAdmin
      .from("midias")
      .select("id, nome, tipo, url")
      .eq("empresa_id", empresaId)
      .order("created_at", { ascending: false })
      .limit(120),
  ]);

  const agendasAtivas = ((agendas || []) as Array<
    AgendaAssistente & { status?: string }
  >).map((agenda) => ({
    id: agenda.id,
    nome: agenda.nome,
    descricao: agenda.descricao || null,
    timezone: agenda.timezone || null,
    duracao_minutos: agenda.duracao_minutos ?? null,
    janela_dias: agenda.janela_dias ?? null,
  }));

  const midiasDisponiveis = ((midias || []) as Array<{
    id: string;
    nome: string;
    tipo: string;
    url: string;
  }>)
    .filter(
      (midia): midia is MidiaAssistente =>
        Boolean(midia.id && midia.nome && midia.url) &&
        ["imagem", "video", "audio", "arquivo"].includes(midia.tipo)
    )
    .map((midia) => ({
      id: midia.id,
      nome: midia.nome,
      tipo: midia.tipo,
      url: midia.url,
    }));

  return {
    contexto: {
      ativo: true,
      modo,
      instrucaoCompleta,
      agendas: agendasAtivas,
      midias: midiasDisponiveis,
      empresaId,
      usuarioId,
      sessaoId,
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
