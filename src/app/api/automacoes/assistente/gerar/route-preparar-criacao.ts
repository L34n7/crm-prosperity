import {
  completarRotasDeOpcoesPlano,
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

const TIPOS_TERMINAIS = new Set(["encerrar", "transferir"]);

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

function rotaCondicionalValida(rota: PlanoAssistenteRota) {
  const condicao = normalizar(rota.condicao);
  return !["", "sempre", "always", "incondicional"].includes(condicao);
}

function removerRotasIncondicionaisDePerguntas(
  etapas: PlanoAssistenteEtapa[],
  rotas: PlanoAssistenteRota[]
) {
  const perguntas = new Set(
    etapas
      .filter((etapa) => TIPOS_PERGUNTA.has(etapa.tipo))
      .map((etapa) => etapa.ref)
  );

  return rotas.filter(
    (rota) => !perguntas.has(rota.origem) || rotaCondicionalValida(rota)
  );
}

function refsAlcancaveis(plano: PlanoAssistenteFluxos) {
  const inicio = plano.etapas.find((etapa) => etapa.tipo === "inicio");
  const alcancaveis = new Set<string>();

  if (!inicio) return alcancaveis;

  const fila = [inicio.ref];

  while (fila.length > 0) {
    const atual = fila.shift();
    if (!atual || alcancaveis.has(atual)) continue;
    alcancaveis.add(atual);

    for (const rota of plano.rotas) {
      if (rota.origem === atual && !alcancaveis.has(rota.destino)) {
        fila.push(rota.destino);
      }
    }
  }

  return alcancaveis;
}

function criarRotaSempre(origem: string, destino: string): PlanoAssistenteRota {
  return {
    origem,
    destino,
    condicao: "sempre",
    valor: null,
    rotulo: null,
    descricao_ia: null,
    timeout_segundos: null,
  };
}

function conectarEncerramento(plano: PlanoAssistenteFluxos) {
  const encerramento = plano.etapas.find((etapa) => etapa.tipo === "encerrar");
  if (!encerramento) return plano;

  const entradas = plano.rotas.filter(
    (rota) => rota.destino === encerramento.ref
  );
  if (entradas.length > 0) return plano;

  const alcancaveis = refsAlcancaveis(plano);
  const origensComSaida = new Set(plano.rotas.map((rota) => rota.origem));
  const folhas = plano.etapas.filter(
    (etapa) =>
      etapa.ref !== encerramento.ref &&
      alcancaveis.has(etapa.ref) &&
      !origensComSaida.has(etapa.ref) &&
      !TIPOS_TERMINAIS.has(etapa.tipo) &&
      !TIPOS_PERGUNTA.has(etapa.tipo)
  );

  if (folhas.length === 0) return plano;

  return {
    ...plano,
    rotas: [
      ...plano.rotas,
      ...folhas.map((etapa) => criarRotaSempre(etapa.ref, encerramento.ref)),
    ],
  };
}

function conectarOrfasLineares(plano: PlanoAssistenteFluxos) {
  let resultado = plano;
  let alcancaveis = refsAlcancaveis(resultado);

  for (let indice = 0; indice < resultado.etapas.length; indice += 1) {
    const etapa = resultado.etapas[indice];

    if (
      alcancaveis.has(etapa.ref) ||
      etapa.tipo === "inicio" ||
      etapa.tipo === "encerrar" ||
      TIPOS_PERGUNTA.has(etapa.tipo)
    ) {
      continue;
    }

    const anterior = [...resultado.etapas]
      .slice(0, indice)
      .reverse()
      .find(
        (item) =>
          alcancaveis.has(item.ref) &&
          !TIPOS_PERGUNTA.has(item.tipo) &&
          !TIPOS_TERMINAIS.has(item.tipo) &&
          !resultado.rotas.some((rota) => rota.origem === item.ref)
      );

    if (!anterior) continue;

    resultado = {
      ...resultado,
      rotas: [...resultado.rotas, criarRotaSempre(anterior.ref, etapa.ref)],
    };
    alcancaveis = refsAlcancaveis(resultado);
  }

  return resultado;
}

export function repararPlanoAntesDaCriacao(valor: unknown) {
  let plano = normalizarPlanoAssistente(valor);

  plano = {
    ...plano,
    clarificacoes: [],
    rotas: removerRotasIncondicionaisDePerguntas(plano.etapas, plano.rotas),
  };

  plano = completarRotasDeOpcoesPlano(plano);
  plano = {
    ...plano,
    rotas: removerRotasIncondicionaisDePerguntas(plano.etapas, plano.rotas),
  };
  plano = conectarOrfasLineares(plano);
  plano = conectarEncerramento(plano);

  return completarRotasDeOpcoesPlano(plano);
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
      "[assistente-fluxos] nao foi possivel salvar reparo final",
      atualizarError
    );
  }

  return request;
}
