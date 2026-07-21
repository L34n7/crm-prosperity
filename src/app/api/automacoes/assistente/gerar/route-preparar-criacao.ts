import {
  normalizarPlanoAssistente,
  type PlanoAssistenteEtapa,
  type PlanoAssistenteFluxos,
  type PlanoAssistenteRota,
} from "@/lib/automacoes/assistente-fluxos";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();

const TIPOS_PERGUNTA = new Set([
  "pergunta_opcoes",
  "pergunta_botoes",
  "pergunta_livre_ia",
  "capturar_resposta",
  "avaliacao",
]);

function texto(valor: unknown, limite = 160) {
  return String(valor || "").trim().slice(0, limite);
}

function normalizar(valor: unknown) {
  return texto(valor)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function sanitizarRotas(
  etapas: PlanoAssistenteEtapa[],
  rotas: PlanoAssistenteRota[]
) {
  const refs = new Set(etapas.map((etapa) => etapa.ref));
  const perguntas = new Set(
    etapas
      .filter((etapa) => TIPOS_PERGUNTA.has(etapa.tipo))
      .map((etapa) => etapa.ref)
  );
  const rotasVistas = new Set<string>();
  const sempreVistas = new Set<string>();
  const resultado: PlanoAssistenteRota[] = [];
  let removidas = 0;

  for (const rota of rotas) {
    if (!refs.has(rota.origem) || !refs.has(rota.destino)) {
      removidas += 1;
      continue;
    }

    const condicao = normalizar(rota.condicao);
    const timeout = ["timeout", "timeout_sem_resposta"].includes(condicao);

    if (
      perguntas.has(rota.origem) &&
      !timeout &&
      ["", "sempre", "always", "incondicional"].includes(condicao)
    ) {
      removidas += 1;
      continue;
    }

    if (!perguntas.has(rota.origem) && condicao === "sempre") {
      if (sempreVistas.has(rota.origem)) {
        removidas += 1;
        continue;
      }
      sempreVistas.add(rota.origem);
    }

    const chave = JSON.stringify({
      origem: rota.origem,
      destino: rota.destino,
      condicao,
      valor: normalizar(rota.valor || rota.rotulo),
    });

    if (rotasVistas.has(chave)) {
      removidas += 1;
      continue;
    }

    rotasVistas.add(chave);
    resultado.push(rota);
  }

  return { rotas: resultado, removidas };
}

export function repararPlanoAntesDaCriacao(valor: unknown) {
  const plano = normalizarPlanoAssistente(valor);
  const sanitizado = sanitizarRotas(plano.etapas, plano.rotas);

  return {
    ...plano,
    clarificacoes: [],
    rotas: sanitizado.rotas,
    avisos: [
      ...plano.avisos,
      ...(sanitizado.removidas > 0
        ? [
            `${sanitizado.removidas} rota(s) inválida(s) ou duplicada(s) foram removidas antes da compilação. As conexões ausentes serão reconstruídas pelo compilador seguro.`,
          ]
        : []),
    ],
  } satisfies PlanoAssistenteFluxos;
}

export async function prepararSessaoAntesDeCriar(request: Request) {
  const body = await request.clone().json().catch(() => null);
  const acao = texto(body?.acao, 40) || "gerar";
  const modo = texto(body?.modo, 80) || "criar_fluxo";
  const sessaoId = texto(body?.sessao_id || body?.sessaoId, 120);

  if (acao !== "criar" || modo !== "criar_fluxo" || !sessaoId) {
    return request;
  }

  const contexto = await getUsuarioContexto();
  if (!contexto.ok || !contexto.usuario.empresa_id) return request;

  const { data: sessao, error } = await supabaseAdmin
    .from("automacao_assistente_ia_execucoes")
    .select("id, resposta_ia_json")
    .eq("id", sessaoId)
    .eq("empresa_id", contexto.usuario.empresa_id)
    .eq("usuario_id", contexto.usuario.id)
    .eq("modo", "criar_fluxo")
    .eq("status", "processando")
    .maybeSingle();

  if (error || !sessao) return request;

  const planoReparado = repararPlanoAntesDaCriacao(sessao.resposta_ia_json);

  const { error: atualizarError } = await supabaseAdmin
    .from("automacao_assistente_ia_execucoes")
    .update({
      resposta_ia_json: planoReparado,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sessaoId)
    .eq("empresa_id", contexto.usuario.empresa_id)
    .eq("usuario_id", contexto.usuario.id)
    .eq("status", "processando");

  if (atualizarError) {
    console.warn(
      "[assistente-fluxos] nao foi possivel salvar saneamento final",
      atualizarError
    );
  }

  return request;
}
