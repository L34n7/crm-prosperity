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

function removerRotasSempreExcedentes(plano: PlanoAssistenteFluxos) {
  const vistas = new Set<string>();
  const removidas: PlanoAssistenteRota[] = [];
  const rotas = plano.rotas.filter((rota) => {
    if (rota.condicao !== "sempre") return true;

    if (vistas.has(rota.origem)) {
      removidas.push(rota);
      return false;
    }

    vistas.add(rota.origem);
    return true;
  });

  if (removidas.length === 0) return plano;

  return {
    ...plano,
    rotas,
    avisos: [
      ...plano.avisos,
      `${removidas.length} rota(s) "Sempre seguir" excedente(s) foram removidas antes da criacao.`,
    ],
  };
}

export function garantirTerminalAlcancavel(valor: unknown) {
  let plano = removerRotasSempreExcedentes(
    normalizarPlanoAssistente(valor)
  );
  const alcancaveis = refsAlcancaveis(plano);
  const terminalAlcancavel = plano.etapas.some(
    (etapa) =>
      alcancaveis.has(etapa.ref) &&
      ["encerrar", "transferir"].includes(etapa.tipo)
  );

  // Mais de um terminal pode ser valido quando existem caminhos distintos.
  // Nao remova encerramentos ou transferencias criados de proposito.
  if (terminalAlcancavel) return plano;

  let terminal = plano.etapas.find((etapa) =>
    ["encerrar", "transferir"].includes(etapa.tipo)
  );

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

  const origensComSaida = new Set(plano.rotas.map((rota) => rota.origem));
  const folhas = plano.etapas.filter(
    (etapa) =>
      alcancaveis.has(etapa.ref) &&
      etapa.ref !== terminal!.ref &&
      etapa.tipo !== "inicio" &&
      !["encerrar", "transferir"].includes(etapa.tipo) &&
      !origensComSaida.has(etapa.ref)
  );

  // Em um ciclo sem folhas, nao escolha um bloco arbitrario. Isso criaria
  // uma segunda rota incondicional e uma das saidas nunca seria executada.
  if (folhas.length === 0) return plano;

  return {
    ...plano,
    rotas: [
      ...plano.rotas,
      ...folhas.flatMap((etapa) =>
        criarRotaParaTerminal(etapa, terminal!.ref)
      ),
    ],
    avisos: [
      ...plano.avisos,
      "O assistente conectou um encerramento somente a blocos finais sem saida.",
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
