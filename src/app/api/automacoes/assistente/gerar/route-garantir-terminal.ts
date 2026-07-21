import {
  normalizarPlanoAssistente,
  type PlanoAssistenteEtapa,
  type PlanoAssistenteFluxos,
  type PlanoAssistenteRota,
} from "@/lib/automacoes/assistente-fluxos";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();

function texto(valor: unknown, limite = 160) {
  return String(valor || "").trim().slice(0, limite);
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

function criarEtapaEncerrar(ref: string): PlanoAssistenteEtapa {
  return {
    ref,
    tipo: "encerrar",
    titulo: "Encerrar atendimento",
    mensagem: "Obrigado pelo contato. Permanecemos à disposição.",
    variavel: null,
    tipo_captura: null,
    setor_id: null,
    setor_nome: null,
    resultado: "positivo",
    midia_id: null,
    midia_nome: null,
    midia_tipo: null,
    midia_url: null,
    url: null,
    botao_texto: null,
    opcoes: [],
  };
}

function criarRotaParaTerminal(
  etapa: PlanoAssistenteEtapa,
  destino: string
): PlanoAssistenteRota[] {
  if (["pergunta_opcoes", "pergunta_botoes"].includes(etapa.tipo)) {
    return (etapa.opcoes || []).map((opcao) => ({
      origem: etapa.ref,
      destino,
      condicao: "resposta_contem",
      valor: opcao.id || opcao.texto,
      rotulo: opcao.texto || opcao.id,
      descricao_ia: null,
      timeout_segundos: null,
    }));
  }

  if (
    ["pergunta_livre_ia", "capturar_resposta", "avaliacao"].includes(
      etapa.tipo
    )
  ) {
    return [
      {
        origem: etapa.ref,
        destino,
        condicao: "resposta_recebida",
        valor: null,
        rotulo: "Resposta recebida",
        descricao_ia: null,
        timeout_segundos: null,
      },
    ];
  }

  return [
    {
      origem: etapa.ref,
      destino,
      condicao: "sempre",
      valor: null,
      rotulo: null,
      descricao_ia: null,
      timeout_segundos: null,
    },
  ];
}

function limparTerminaisOrfaos(
  plano: PlanoAssistenteFluxos,
  terminalMantido: string
) {
  const terminaisRemovidos = new Set(
    plano.etapas
      .filter(
        (etapa) =>
          ["encerrar", "transferir"].includes(etapa.tipo) &&
          etapa.ref !== terminalMantido
      )
      .map((etapa) => etapa.ref)
  );

  if (terminaisRemovidos.size === 0) return plano;

  return {
    ...plano,
    etapas: plano.etapas.filter(
      (etapa) => !terminaisRemovidos.has(etapa.ref)
    ),
    rotas: plano.rotas.filter(
      (rota) =>
        !terminaisRemovidos.has(rota.origem) &&
        !terminaisRemovidos.has(rota.destino)
    ),
  };
}

export function garantirTerminalAlcancavel(valor: unknown) {
  let plano = normalizarPlanoAssistente(valor);
  let alcancaveis = refsAlcancaveis(plano);
  const terminalAlcancavel = plano.etapas.find(
    (etapa) =>
      alcancaveis.has(etapa.ref) &&
      ["encerrar", "transferir"].includes(etapa.tipo)
  );

  if (terminalAlcancavel) {
    return limparTerminaisOrfaos(plano, terminalAlcancavel.ref);
  }

  const terminalExistente = plano.etapas.find((etapa) =>
    ["encerrar", "transferir"].includes(etapa.tipo)
  );

  let terminal = terminalExistente;

  if (!terminal) {
    const refs = new Set(plano.etapas.map((etapa) => etapa.ref));
    let refTerminal = "encerrar_atendimento";
    let indice = 2;

    while (refs.has(refTerminal)) {
      refTerminal = `encerrar_atendimento_${indice}`;
      indice += 1;
    }

    terminal = criarEtapaEncerrar(refTerminal);
    plano = {
      ...plano,
      etapas: [...plano.etapas, terminal],
    };
  }

  plano = limparTerminaisOrfaos(plano, terminal.ref);
  alcancaveis = refsAlcancaveis(plano);

  const rotasSemEntradaTerminal = plano.rotas.filter(
    (rota) => rota.destino !== terminal.ref
  );
  const origensComSaida = new Set(
    rotasSemEntradaTerminal.map((rota) => rota.origem)
  );
  let folhas = plano.etapas.filter(
    (etapa) =>
      alcancaveis.has(etapa.ref) &&
      etapa.ref !== terminal.ref &&
      etapa.tipo !== "inicio" &&
      !["encerrar", "transferir"].includes(etapa.tipo) &&
      !origensComSaida.has(etapa.ref)
  );

  if (folhas.length === 0) {
    const fallback = [...plano.etapas]
      .reverse()
      .find(
        (etapa) =>
          alcancaveis.has(etapa.ref) &&
          etapa.ref !== terminal.ref &&
          etapa.tipo !== "inicio" &&
          !["encerrar", "transferir"].includes(etapa.tipo)
      );
    folhas = fallback ? [fallback] : [];
  }

  if (folhas.length === 0) return plano;

  return {
    ...plano,
    rotas: [
      ...rotasSemEntradaTerminal,
      ...folhas.flatMap((etapa) =>
        criarRotaParaTerminal(etapa, terminal.ref)
      ),
    ],
    avisos: [
      ...plano.avisos,
      "O assistente garantiu um único encerramento alcançável ao final do fluxo.",
    ],
  };
}

export async function garantirTerminalAntesDeCriar(request: Request) {
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

  const plano = garantirTerminalAlcancavel(sessao.resposta_ia_json);
  const { error: updateError } = await supabaseAdmin
    .from("automacao_assistente_ia_execucoes")
    .update({
      resposta_ia_json: plano,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sessaoId)
    .eq("empresa_id", contexto.usuario.empresa_id)
    .eq("usuario_id", contexto.usuario.id)
    .eq("status", "processando");

  if (updateError) {
    console.warn(
      "[assistente-fluxos] nao foi possivel garantir terminal final",
      updateError
    );
  }

  return request;
}
