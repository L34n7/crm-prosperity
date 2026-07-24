import { AsyncLocalStorage } from "node:async_hooks";

import OpenAI from "openai";

import {
  compilarPlanoAssistente,
  normalizarPlanoAssistente,
  type AssistenteMidia,
  type AssistenteSetor,
  type AssistenteVariavel,
} from "@/lib/automacoes/assistente-fluxos";
import { errosQueExigemReparo } from "@/lib/automacoes/assistente-fluxos-conversa";
import {
  prepararPayloadAssistente,
  type ContextoAssistenteFluxos,
} from "./route-contexto-ia";
import { registrarDiagnosticoIa } from "./route-diagnostico-ia";
import {
  extrairTextoSaida,
  somarUsoRespostas,
  validarQualidadePlano,
  type RespostaOpenAI,
} from "./route-validacao-ia";
import {
  carregarContextoAssistente,
  persistirInstrucaoCompleta,
} from "./route-sessao-contexto";
import {
  criarPayloadPlanejamento,
  devePlanejarJornada,
  extrairRequisitosNormalizados,
  injetarPlanejamentoNoPayload,
  type RequisitosNormalizadosFluxo,
} from "./route-planejamento-ia";

export {
  deveExecutarRevisaoFinal,
  problemasReparaveisPeloCompilador,
} from "./route-politica-reparo";

export const runtime = "nodejs";

type CriarResposta = (
  body: Record<string, unknown>,
  options?: unknown
) => Promise<RespostaOpenAI>;
type PrototipoResponses = { create: CriarResposta };
type ObjetoJson = Record<string, unknown>;
type ValidacaoPlano = { valido: boolean; problemas: string[] };

const contextoAssistenteFluxos = new AsyncLocalStorage<ContextoAssistenteFluxos>();
let sdkResilienteInstalado = false;
let moduloOriginalPromise: Promise<typeof import("./route-original")> | null = null;

// Reserva cerca de um minuto para compilacao, perguntas e persistencia antes do
// limite total de cinco minutos da funcao da Vercel.
const LIMITE_PIPELINE_IA_MS = 235_000;
const MAX_TENTATIVAS_CORRECAO_FINAL = 1;
const TEMPO_MINIMO_CORRECAO_FINAL_MS = 45_000;

const LIMITE_SAIDA_ASSISTENTE = (() => {
  const configurado = Number(
    process.env.OPENAI_ASSISTENTE_FLUXOS_MAX_OUTPUT_TOKENS || 16000
  );
  if (!Number.isFinite(configurado)) return 16000;
  return Math.max(6000, Math.min(24000, Math.floor(configurado)));
})();

function objeto(valor: unknown): ObjetoJson {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as ObjetoJson)
    : {};
}

function texto(valor: unknown, limite = 500) {
  return String(valor || "").trim().slice(0, limite);
}

function opcoesComPrazo(options: unknown, prazoFinal: number) {
  const restante = Math.max(1_000, prazoFinal - Date.now());
  return {
    ...objeto(options),
    signal: AbortSignal.timeout(restante),
  };
}

function localizarMensagem(
  payload: ObjetoJson,
  role: "system" | "user"
): ObjetoJson | null {
  if (!Array.isArray(payload.input)) return null;
  const mensagem = payload.input.find((item) => objeto(item).role === role);
  return mensagem ? objeto(mensagem) : null;
}

function anexarInstrucaoPayload(payload: ObjetoJson, instrucao: string) {
  const mensagem = localizarMensagem(payload, "system");
  if (!mensagem) return;

  if (typeof mensagem.content === "string") {
    mensagem.content = `${mensagem.content}\n\n${instrucao}`;
    return;
  }

  if (Array.isArray(mensagem.content)) {
    mensagem.content = [
      ...mensagem.content,
      { type: "input_text", text: instrucao },
    ];
  }
}

function lerContextoUsuario(payload: ObjetoJson) {
  const mensagem = localizarMensagem(payload, "user");
  if (!mensagem) return {};

  if (typeof mensagem.content === "string") {
    try {
      return objeto(JSON.parse(mensagem.content));
    } catch {
      return {};
    }
  }

  if (!Array.isArray(mensagem.content)) return {};

  const textoJson = mensagem.content
    .map((item) => objeto(item))
    .filter((item) => item.type === "input_text")
    .map((item) => texto(item.text, 200_000))
    .join("");

  try {
    return objeto(JSON.parse(textoJson));
  } catch {
    return {};
  }
}

function extrairRecursosCompilador(payload: ObjetoJson) {
  const contextoUsuario = lerContextoUsuario(payload);
  const recursos = objeto(contextoUsuario.recursos);

  const setores = (Array.isArray(recursos.setores) ? recursos.setores : [])
    .map((item) => objeto(item))
    .map((item) => ({
      id: texto(item.id, 160),
      nome: texto(item.nome, 200),
    }))
    .filter((item) => item.id && item.nome) as AssistenteSetor[];

  const variaveis = (Array.isArray(recursos.variaveis)
    ? recursos.variaveis
    : []
  )
    .map((item) => objeto(item))
    .map((item) => ({
      chave: texto(item.chave, 160),
      descricao: texto(item.descricao, 500) || null,
      origem: texto(item.origem, 80) || "personalizada",
    }))
    .filter((item) => item.chave) as AssistenteVariavel[];

  const midiasBrutas = Array.isArray(recursos.midias)
    ? recursos.midias
    : Array.isArray(recursos.midias_disponiveis)
      ? recursos.midias_disponiveis
      : [];

  const midias = midiasBrutas
    .map((item) => objeto(item))
    .map((item) => ({
      id: texto(item.id, 160),
      nome: texto(item.nome, 240),
      tipo: texto(item.tipo, 40) as AssistenteMidia["tipo"],
      url: texto(item.url, 2000),
    }))
    .filter(
      (item) =>
        item.id &&
        item.nome &&
        ["imagem", "video", "audio", "arquivo"].includes(item.tipo)
    ) as AssistenteMidia[];

  return { setores, variaveis, midias };
}

function validarPlanoCompleto(params: {
  resposta: RespostaOpenAI;
  contexto: ContextoAssistenteFluxos;
  payloadBase: ObjetoJson;
}): ValidacaoPlano {
  const validacaoBase = validarQualidadePlano(params.resposta, params.contexto);

  if (!validacaoBase.valido || params.contexto.modo !== "criar_fluxo") {
    return validacaoBase;
  }

  try {
    const plano = normalizarPlanoAssistente(
      JSON.parse(extrairTextoSaida(params.resposta) || "{}")
    );
    const recursos = extrairRecursosCompilador(params.payloadBase);
    const compilacao = compilarPlanoAssistente({
      modo: "criar_fluxo",
      plano,
      fluxoAtual: null,
      setores: recursos.setores,
      variaveis: recursos.variaveis,
      midias: recursos.midias,
    });
    const problemasCompilador = errosQueExigemReparo(
      compilacao.validacao.erros
    ).map((erro) => erro.mensagem);

    const problemas = [
      ...validacaoBase.problemas,
      ...problemasCompilador,
    ].filter((problema, indice, todos) => todos.indexOf(problema) === indice);

    return {
      valido: problemas.length === 0,
      problemas: problemas.slice(0, 30),
    };
  } catch (error) {
    return {
      valido: false,
      problemas: [
        ...validacaoBase.problemas,
        `O plano nao passou pela verificacao tecnica do compilador: ${texto(
          error instanceof Error ? error.message : error,
          800
        )}.`,
      ].slice(0, 30),
    };
  }
}

function instrucaoRevisaoIntegral(problemas: string[]) {
  return [
    "ETAPA OBRIGATORIA DE REVISAO INTEGRAL E CORRECAO DO FLUXO.",
    "Voce e o responsavel final por todo o fluxo: arquitetura, blocos, textos, opcoes, conexoes, descricoes para IA, transferencias, agendas, retornos e terminais.",
    "Use o pedido original, requisitos_normalizados, recursos reais e todo o MANUAL OPERACIONAL DO ARQUITETO DE FLUXOS ja fornecido no sistema como um unico contrato obrigatorio.",
    "Audite o rascunho como um grafo completo. Percorra cada opcao desde o inicio ate seu destino e confirme que a promessa daquela escolha e realmente cumprida.",
    "Corrija diretamente no JSON todos os problemas encontrados. Crie blocos e rotas ausentes, corrija refs inconsistentes e reescreva conteudos incompletos quando necessario.",
    "Preserve o que estiver correto, mas nao mantenha uma estrutura quebrada apenas para evitar alteracoes. Quando corrigir uma ref, atualize todas as rotas relacionadas.",
    "Nao dependa do compilador para inventar destinos, duplicar blocos, completar menus ou reparar semantica. O compilador apenas materializara um plano que ja deve estar completo.",
    "O JSON final deve ser autocontido: nenhuma opcao sem rota, nenhuma rota para ref inexistente, nenhum bloco orfao, nenhuma transferencia ou encerramento com saida e nenhum requisito explicito omitido.",
    "Para pergunta_opcoes, pergunta_botoes e pergunta_livre_ia, produza descricao_ia discriminativa em cada saida conforme o manual da arquitetura.",
    problemas.length
      ? "Problemas detectados automaticamente que obrigatoriamente devem ser eliminados:"
      : "A pre-validacao nao encontrou falhas, mas a auditoria integral continua obrigatoria.",
    ...problemas.map((problema) => `- ${problema}`),
    "Retorne somente o JSON final completo no schema solicitado, nunca um patch, comentario ou lista de alteracoes.",
  ].join("\n");
}

function instrucaoCorrecaoFinal(problemas: string[]) {
  return [
    "CORRECAO FINAL OBRIGATORIA ANTES DA MATERIALIZACAO.",
    "O rascunho revisado ainda falhou na verificacao estrutural ou no compilador.",
    "Elimine todos os problemas abaixo no proprio JSON completo. Nao explique, nao delegue ao backend e nao remova requisitos do usuario para simplificar o grafo.",
    ...problemas.map((problema) => `- ${problema}`),
    "Confira novamente todas as refs, opcoes, rotas, destinos, terminais, recursos e descricoes_ia.",
    "Retorne somente o JSON final completo conforme o schema.",
  ].join("\n");
}

function instalarSdkResiliente() {
  if (sdkResilienteInstalado) return;
  sdkResilienteInstalado = true;

  const clienteInstrumentacao = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || "instrumentacao",
  });
  const prototipo = Object.getPrototypeOf(
    clienteInstrumentacao.responses
  ) as PrototipoResponses;
  const criarOriginal = prototipo.create;

  prototipo.create = async function criarRespostaResiliente(
    body: Record<string, unknown>,
    options?: unknown
  ) {
    const contexto = contextoAssistenteFluxos.getStore();
    if (!contexto?.ativo) return criarOriginal.call(this, body, options);

    const pipelineCompleto = devePlanejarJornada(body, contexto);
    let requisitos: RequisitosNormalizadosFluxo | null = null;
    let respostaPlanejamento: RespostaOpenAI | null = null;
    let bodyPlanejado = body;
    const prazoFinal = Date.now() + LIMITE_PIPELINE_IA_MS;

    if (pipelineCompleto) {
      const payloadPlanejamento = criarPayloadPlanejamento({ body, contexto });
      await registrarDiagnosticoIa({
        contexto,
        fase: "planejamento_request",
        payload: payloadPlanejamento,
      });

      respostaPlanejamento = await criarOriginal.call(
        this,
        payloadPlanejamento,
        opcoesComPrazo(options, prazoFinal)
      );
      requisitos = extrairRequisitosNormalizados(respostaPlanejamento);

      await registrarDiagnosticoIa({
        contexto,
        fase: "planejamento_response",
        resposta: respostaPlanejamento,
        metadados: {
          requisitos_extraidos: requisitos,
          requisitos_validos: Boolean(requisitos),
        },
      });

      if (requisitos) {
        bodyPlanejado = injetarPlanejamentoNoPayload(body, requisitos);
      } else {
        console.warn(
          "[assistente-fluxos] planejamento inicial ilegivel; seguindo com o pedido original",
          { response_id: respostaPlanejamento.id || null }
        );
      }
    }

    const primeiroPayload = prepararPayloadAssistente({
      body: bodyPlanejado,
      limite: LIMITE_SAIDA_ASSISTENTE,
      repetir: false,
      contexto,
    });

    await registrarDiagnosticoIa({
      contexto,
      fase: "geracao_request",
      payload: primeiroPayload,
      metadados: {
        planejamento_aplicado: Boolean(requisitos),
        estrategia: "ia_constroi_fluxo_integral",
      },
    });

    const respostaBruta = await criarOriginal.call(
      this,
      primeiroPayload,
      opcoesComPrazo(options, prazoFinal)
    );

    await registrarDiagnosticoIa({
      contexto,
      fase: "geracao_response_bruta",
      resposta: respostaBruta,
    });

    let respostaPlano = respostaBruta;
    let validacao = validarPlanoCompleto({
      resposta: respostaPlano,
      contexto,
      payloadBase: bodyPlanejado,
    });

    await registrarDiagnosticoIa({
      contexto,
      fase: "validacao_pos_geracao",
      resposta: respostaPlano,
      problemas: validacao.problemas,
      metadados: {
        valido: validacao.valido,
        estrategia: pipelineCompleto
          ? "revisao_integral_obrigatoria_pela_ia"
          : validacao.valido
            ? "aceitar"
            : "corrigir_com_ia",
      },
    });

    if (pipelineCompleto) {
      const rascunhoAnterior = extrairTextoSaida(respostaPlano);
      const payloadRevisao = prepararPayloadAssistente({
        body: bodyPlanejado,
        limite: LIMITE_SAIDA_ASSISTENTE,
        repetir: true,
        problemas: validacao.problemas,
        rascunhoAnterior,
        fase: "revisao",
        contexto,
      });
      anexarInstrucaoPayload(
        payloadRevisao,
        instrucaoRevisaoIntegral(validacao.problemas)
      );

      await registrarDiagnosticoIa({
        contexto,
        fase: "revisao_integral_request",
        payload: payloadRevisao,
        problemas: validacao.problemas,
        metadados: {
          estrategia: "ia_audita_corrige_e_entrega_grafo_final",
        },
      });

      const respostaRevisadaBruta = await criarOriginal.call(
        this,
        payloadRevisao,
        opcoesComPrazo(options, prazoFinal)
      );

      await registrarDiagnosticoIa({
        contexto,
        fase: "revisao_integral_response",
        resposta: respostaRevisadaBruta,
      });

      respostaPlano = somarUsoRespostas(respostaPlano, respostaRevisadaBruta);
      validacao = validarPlanoCompleto({
        resposta: respostaPlano,
        contexto,
        payloadBase: bodyPlanejado,
      });

      await registrarDiagnosticoIa({
        contexto,
        fase: "revisao_integral_validacao",
        resposta: respostaPlano,
        problemas: validacao.problemas,
        metadados: {
          valido: validacao.valido,
        },
      });
    }

    for (
      let tentativa = 1;
      !validacao.valido &&
      tentativa <= MAX_TENTATIVAS_CORRECAO_FINAL &&
      prazoFinal - Date.now() >= TEMPO_MINIMO_CORRECAO_FINAL_MS;
      tentativa += 1
    ) {
      const rascunhoAnterior = extrairTextoSaida(respostaPlano);
      const payloadCorrecao = prepararPayloadAssistente({
        body: bodyPlanejado,
        limite: LIMITE_SAIDA_ASSISTENTE,
        repetir: true,
        problemas: validacao.problemas,
        rascunhoAnterior,
        fase: "estrutura",
        contexto,
      });
      anexarInstrucaoPayload(
        payloadCorrecao,
        instrucaoCorrecaoFinal(validacao.problemas)
      );

      await registrarDiagnosticoIa({
        contexto,
        fase: `correcao_final_request_${tentativa}`,
        payload: payloadCorrecao,
        problemas: validacao.problemas,
        metadados: {
          tentativa,
          estrategia: "ia_corrige_feedback_do_validador_e_compilador",
        },
      });

      const respostaCorrigidaBruta = await criarOriginal.call(
        this,
        payloadCorrecao,
        opcoesComPrazo(options, prazoFinal)
      );

      await registrarDiagnosticoIa({
        contexto,
        fase: `correcao_final_response_${tentativa}`,
        resposta: respostaCorrigidaBruta,
        metadados: { tentativa },
      });

      respostaPlano = somarUsoRespostas(
        respostaPlano,
        respostaCorrigidaBruta
      );
      validacao = validarPlanoCompleto({
        resposta: respostaPlano,
        contexto,
        payloadBase: bodyPlanejado,
      });

      await registrarDiagnosticoIa({
        contexto,
        fase: `correcao_final_validacao_${tentativa}`,
        resposta: respostaPlano,
        problemas: validacao.problemas,
        metadados: {
          tentativa,
          valido: validacao.valido,
        },
      });
    }

    if (respostaPlanejamento) {
      respostaPlano = somarUsoRespostas(
        respostaPlanejamento,
        respostaPlano
      );
    }

    if (!validacao.valido) {
      await registrarDiagnosticoIa({
        contexto,
        fase: "validacao_final_reprovada",
        resposta: respostaPlano,
        problemas: validacao.problemas,
        metadados: {
          tempo_restante_ms: Math.max(0, prazoFinal - Date.now()),
          encaminhado_ao_compilador: false,
        },
      });

      const detalhes = validacao.problemas.slice(0, 8).join(" ");
      throw new Error(
        `PLANO_IA_ESTRUTURALMENTE_INVALIDO: A IA revisou o fluxo, mas ainda restaram inconsistencias. ${detalhes}`
      );
    }

    await registrarDiagnosticoIa({
      contexto,
      fase: "validacao_final_aprovada",
      resposta: respostaPlano,
      metadados: {
        encaminhado_ao_compilador: true,
        estrategia: "compilador_apenas_materializa_plano_validado",
      },
    });

    return respostaPlano;
  };
}

async function carregarModuloOriginal() {
  instalarSdkResiliente();
  moduloOriginalPromise ||= import("./route-original");
  return moduloOriginalPromise;
}

function erroJsonIncompleto(error: unknown) {
  return /unterminated string|unexpected end of json|json at position|json\.parse|valid json|expected property name|request was aborted|aborted/i.test(
    String(error || "")
  );
}

function erroPlanoEstrutural(error: unknown) {
  return /PLANO_IA_ESTRUTURALMENTE_INVALIDO/i.test(String(error || ""));
}

export async function executarAssistente(request: Request) {
  const body = objeto(await request.clone().json().catch(() => ({})));
  const contextoRequisicao = await carregarContextoAssistente(body);
  const moduloOriginal = await carregarModuloOriginal();

  return contextoAssistenteFluxos.run(
    contextoRequisicao.contexto,
    async () => {
      const response = await moduloOriginal.POST(request);

      await persistirInstrucaoCompleta({
        response,
        instrucaoCompleta: contextoRequisicao.contexto.instrucaoCompleta,
        empresaId: contextoRequisicao.empresaId,
        usuarioId: contextoRequisicao.usuarioId,
      });

      if (response.status !== 500) return response;

      const corpo = await response
        .clone()
        .json()
        .catch(() => null as ObjetoJson | null);
      const mensagem =
        corpo && typeof corpo.error === "string" ? corpo.error : "";

      await registrarDiagnosticoIa({
        contexto: contextoRequisicao.contexto,
        fase: "erro_final_rota",
        problemas: mensagem ? [mensagem] : [],
        metadados: {
          status_http: response.status,
          corpo,
        },
      });

      if (erroPlanoEstrutural(mensagem)) {
        const detalhes = mensagem
          .replace(/^.*PLANO_IA_ESTRUTURALMENTE_INVALIDO:\s*/i, "")
          .trim();

        return Response.json(
          {
            ok: false,
            code: "PLANO_IA_ESTRUTURALMENTE_INVALIDO",
            error:
              "A IA revisou o fluxo, mas nao conseguiu eliminar todas as inconsistencias tecnicas dentro do tempo disponivel. Nenhum fluxo incompleto foi criado.",
            detalhes,
          },
          { status: 422 }
        );
      }

      if (!erroJsonIncompleto(mensagem)) return response;

      return Response.json(
        {
          ok: false,
          code: "RESPOSTA_IA_INCOMPLETA",
          error:
            "A IA nao conseguiu concluir o plano conversacional dentro do tempo disponivel. Nenhum fluxo incompleto foi criado.",
        },
        { status: 422 }
      );
    }
  );
}
