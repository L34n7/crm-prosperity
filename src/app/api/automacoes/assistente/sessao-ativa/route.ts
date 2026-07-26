import { NextResponse } from "next/server";

import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const db = getSupabaseAdmin();
const JANELA_RETOMADA_MS = 7 * 24 * 60 * 60 * 1_000;
const FASES_ASSINCRONAS_ATIVAS = [
  "geracao_assincrona_aguardando",
  "geracao_assincrona_materializando",
];
const CHAVE_ESTADO_ESTAVEL = "conversa_estavel_v3";

type Objeto = Record<string, unknown>;

type CandidatoSessao = {
  id: string;
  origem: "geracao_assincrona" | "confirmacoes";
  fase: string;
  atualizadoEm: string;
};

function objeto(valor: unknown): Objeto {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Objeto)
    : {};
}

function dataMs(valor: unknown) {
  const timestamp = Date.parse(String(valor || ""));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

async function buscarGeracaoAssincrona(params: {
  empresaId: string;
  usuarioId: string;
  desde: string;
}): Promise<CandidatoSessao | null> {
  const { data, error } = await db
    .from("automacao_assistente_ia_diagnosticos")
    .select("id, fase, created_at, metadados_json")
    .eq("empresa_id", params.empresaId)
    .eq("usuario_id", params.usuarioId)
    .in("fase", FASES_ASSINCRONAS_ATIVAS)
    .gte("created_at", params.desde)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Não foi possível consultar a geração pendente: ${error.message}`);
  }
  if (!data?.id) return null;

  const metadados = objeto(data.metadados_json);
  return {
    id: String(data.id),
    origem: "geracao_assincrona",
    fase: String(data.fase || "geracao_assincrona_aguardando"),
    atualizadoEm: String(
      metadados.ultima_consulta_em || metadados.criado_em || data.created_at
    ),
  };
}

async function buscarSessaoConfirmacoes(params: {
  empresaId: string;
  usuarioId: string;
  desde: string;
}): Promise<CandidatoSessao | null> {
  const { data, error } = await db
    .from("automacao_assistente_ia_execucoes")
    .select("id, status, updated_at, contexto_json, resposta_ia_json")
    .eq("empresa_id", params.empresaId)
    .eq("usuario_id", params.usuarioId)
    .eq("modo", "criar_fluxo")
    .eq("status", "processando")
    .gte("updated_at", params.desde)
    .order("updated_at", { ascending: false })
    .limit(8);

  if (error) {
    throw new Error(`Não foi possível consultar a sessão ativa: ${error.message}`);
  }

  for (const item of data || []) {
    const contexto = objeto(item.contexto_json);
    const estado = objeto(contexto[CHAVE_ESTADO_ESTAVEL]);
    const plano = objeto(item.resposta_ia_json);
    const perguntas = Array.isArray(estado.perguntas) ? estado.perguntas : [];
    const etapas = Array.isArray(plano.etapas) ? plano.etapas : [];

    if (perguntas.length === 0 || etapas.length === 0) continue;

    return {
      id: String(item.id),
      origem: "confirmacoes",
      fase: "processando",
      atualizadoEm: String(item.updated_at),
    };
  }

  return null;
}

export async function GET() {
  const contexto = await getUsuarioContexto();
  if (!contexto.ok) {
    return NextResponse.json(
      { ok: false, error: "Sessão não autenticada." },
      { status: 401 }
    );
  }

  const desde = new Date(Date.now() - JANELA_RETOMADA_MS).toISOString();
  const empresaId = String(contexto.usuario.empresa_id || "").trim();
  const usuarioId = String(contexto.usuario.id || "").trim();

  if (!empresaId || !usuarioId) {
    return NextResponse.json(
      { ok: false, error: "Usuário ou empresa não identificados." },
      { status: 422 }
    );
  }

  try {
    const [geracao, confirmacoes] = await Promise.all([
      buscarGeracaoAssincrona({ empresaId, usuarioId, desde }),
      buscarSessaoConfirmacoes({ empresaId, usuarioId, desde }),
    ]);

    const candidato = [geracao, confirmacoes]
      .filter((item): item is CandidatoSessao => Boolean(item))
      .sort((a, b) => dataMs(b.atualizadoEm) - dataMs(a.atualizadoEm))[0];

    return NextResponse.json(
      {
        ok: true,
        sessao_id: candidato?.id || null,
        origem: candidato?.origem || null,
        fase: candidato?.fase || null,
        atualizado_em: candidato?.atualizadoEm || null,
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    console.error("[assistente-fluxos] falha ao localizar sessão ativa", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível localizar a sessão ativa.",
      },
      { status: 500 }
    );
  }
}
