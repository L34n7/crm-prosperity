import {
  normalizarPlanoAssistente,
  type PlanoAssistenteFluxos,
  type PlanoAssistenteRota,
} from "@/lib/automacoes/assistente-fluxos";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();

function texto(valor: unknown, limite = 180) {
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

function canonicalizarRotasDeOpcoes(plano: PlanoAssistenteFluxos) {
  const perguntas = new Map(
    plano.etapas
      .filter((etapa) =>
        ["pergunta_opcoes", "pergunta_botoes"].includes(etapa.tipo)
      )
      .map((etapa) => [etapa.ref, etapa] as const)
  );
  const vistos = new Set<string>();
  const removidas: PlanoAssistenteRota[] = [];
  const rotas: PlanoAssistenteRota[] = [];

  for (const rotaOriginal of plano.rotas) {
    const pergunta = perguntas.get(rotaOriginal.origem);

    if (!pergunta) {
      rotas.push(rotaOriginal);
      continue;
    }

    const condicao = normalizar(rotaOriginal.condicao);

    if (["timeout", "timeout_sem_resposta"].includes(condicao)) {
      const chave = `${rotaOriginal.origem}:timeout`;
      if (vistos.has(chave)) {
        removidas.push(rotaOriginal);
        continue;
      }
      vistos.add(chave);
      rotas.push(rotaOriginal);
      continue;
    }

    const valorRota = normalizar(rotaOriginal.valor || rotaOriginal.rotulo);
    const opcao = pergunta.opcoes.find((item) => {
      const id = normalizar(item.id);
      const titulo = normalizar(item.texto);
      return valorRota === id || valorRota === titulo;
    });

    if (!opcao) {
      rotas.push(rotaOriginal);
      continue;
    }

    const valorCanonico = normalizar(opcao.id || opcao.texto);
    const chave = `${rotaOriginal.origem}:opcao:${valorCanonico}`;

    if (vistos.has(chave)) {
      removidas.push(rotaOriginal);
      continue;
    }

    vistos.add(chave);
    rotas.push({
      ...rotaOriginal,
      condicao: "resposta_contem",
      valor: valorCanonico,
      rotulo: opcao.texto || rotaOriginal.rotulo,
    });
  }

  if (removidas.length > 0) {
    console.warn(
      "[assistente-fluxos] removendo rotas equivalentes pelo id ou texto da opcao",
      {
        total: removidas.length,
        rotas: removidas.slice(0, 20).map((rota) => ({
          origem: rota.origem,
          destino: rota.destino,
          valor: rota.valor,
          rotulo: rota.rotulo,
        })),
      }
    );
  }

  return {
    ...plano,
    rotas,
    avisos: [
      ...plano.avisos,
      ...(removidas.length > 0
        ? [
            `${removidas.length} rota(s) equivalente(s) de opções foram consolidadas antes da criação.`,
          ]
        : []),
    ],
  };
}

export async function canonicalizarSessaoAntesDeCriar(request: Request) {
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

  const plano = normalizarPlanoAssistente(sessao.resposta_ia_json);
  const planoCanonical = canonicalizarRotasDeOpcoes(plano);

  const { error: atualizarError } = await supabaseAdmin
    .from("automacao_assistente_ia_execucoes")
    .update({
      resposta_ia_json: planoCanonical,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sessaoId)
    .eq("empresa_id", contexto.usuario.empresa_id)
    .eq("usuario_id", contexto.usuario.id)
    .eq("status", "processando");

  if (atualizarError) {
    console.warn(
      "[assistente-fluxos] nao foi possivel canonicalizar rotas de opcoes",
      atualizarError
    );
  }

  return request;
}
