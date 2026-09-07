import {
  interpretarDataHorarioAgenda,
  listarSlotsDisponiveis,
} from "@/lib/agendas/agenda-service";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  enviarMensagemAutomacao,
  executarNo as executarNoCore,
  processAutomationEngine as processAutomationEngineCore,
} from "./process-automation-engine-core";

export * from "./process-automation-engine-core";

const supabaseAdmin = getSupabaseAdmin();

type AutomationEngineInput = Parameters<typeof processAutomationEngineCore>[0];

type ContextoEscolhaHorario = {
  execucao: any;
  noAtual: any;
  noAtualId: string;
  metadata: any;
  estadoAgenda: any;
  agendaId: string;
  dataEscolhida: string;
  opcoes: any[];
};

type AmbiguidadeDiaHorario = {
  tipo: "dia_ou_horario";
  numero: number;
  minutos: number;
  data: string;
  criado_em: string;
};

function normalizarTextoHorario(valor: string) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function minutosValidos(hora: number, minuto = 0) {
  if (
    !Number.isFinite(hora) ||
    !Number.isFinite(minuto) ||
    hora < 0 ||
    hora > 23 ||
    minuto < 0 ||
    minuto > 59
  ) {
    return null;
  }

  return hora * 60 + minuto;
}

function formatarMinutosHorario(minutos: number) {
  const hora = Math.floor(minutos / 60);
  const minuto = minutos % 60;
  return `${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}`;
}

function horaLabelParaMinutos(valor: string) {
  const match = String(valor || "").match(/\b(\d{1,2}):(\d{2})\b/);

  if (!match) return null;

  return minutosValidos(Number(match[1]), Number(match[2]));
}

function extrairNumeroIsolado(mensagemTexto: string) {
  const texto = normalizarTextoHorario(mensagemTexto);
  const match = texto.match(/^#?(\d{1,2})$/);

  return match ? Number(match[1]) : null;
}

function extrairIndiceOpcaoExplicita(mensagemTexto: string) {
  const texto = normalizarTextoHorario(mensagemTexto);

  if (!texto) return null;

  const numeroIsolado = extrairNumeroIsolado(texto);
  if (numeroIsolado != null) return numeroIsolado;

  const linhaCopiada = texto.match(
    /^(\d{1,2})\s*(?:[-–—.)])\s*\d{1,2}:\d{2}$/
  );
  if (linhaCopiada) return Number(linhaCopiada[1]);

  const opcaoAntes = texto.match(
    /\b(?:opcao|numero|n)\s*(?:n\.?\s*)?#?\s*(\d{1,2})\b/
  );
  if (opcaoAntes) return Number(opcaoAntes[1]);

  const opcaoDepois = texto.match(
    /\b(\d{1,2})(?:a|ª|o|º)?\s+(?:opcao|numero)\b/
  );
  if (opcaoDepois) return Number(opcaoDepois[1]);

  return null;
}

function ajustarHoraPorPeriodo(texto: string, hora: number) {
  if (/\b(?:pm|da tarde|de tarde|pela tarde|da noite|de noite|pela noite)\b/.test(texto)) {
    return hora >= 1 && hora <= 11 ? hora + 12 : hora;
  }

  if (/\b(?:am|da manha|de manha|pela manha)\b/.test(texto)) {
    return hora === 12 ? 0 : hora;
  }

  return hora;
}

function extrairHorarioExplicito(mensagemTexto: string) {
  const texto = normalizarTextoHorario(mensagemTexto);

  if (!texto) return null;

  const comDoisPontos = texto.match(/\b(\d{1,2}):(\d{2})\b/);
  if (comDoisPontos) {
    const hora = ajustarHoraPorPeriodo(texto, Number(comDoisPontos[1]));
    return minutosValidos(hora, Number(comDoisPontos[2]));
  }

  const comUnidade = texto.match(
    /\b(\d{1,2})\s*(?:h|hr|hrs|hora|horas)\s*(?:(\d{1,2})\s*(?:min|minuto|minutos)?)?\b/
  );
  if (comUnidade) {
    const hora = ajustarHoraPorPeriodo(texto, Number(comUnidade[1]));
    return minutosValidos(hora, Number(comUnidade[2] || 0));
  }

  const comAs = texto.match(/\b(?:as|pelas?)\s+(\d{1,2})(?:\s*h\s*(\d{1,2}))?\b/);
  if (comAs) {
    const hora = ajustarHoraPorPeriodo(texto, Number(comAs[1]));
    return minutosValidos(hora, Number(comAs[2] || 0));
  }

  const comPeriodo = texto.match(
    /\b(\d{1,2})\s+(?:da|de|pela)\s+(?:manha|tarde|noite)\b/
  );
  if (comPeriodo) {
    const hora = ajustarHoraPorPeriodo(texto, Number(comPeriodo[1]));
    return minutosValidos(hora, 0);
  }

  const amPm = texto.match(/\b(\d{1,2})\s*(am|pm)\b/);
  if (amPm) {
    const hora = ajustarHoraPorPeriodo(texto, Number(amPm[1]));
    return minutosValidos(hora, 0);
  }

  return null;
}

function extrairHorarioContextual(mensagemTexto: string) {
  const texto = normalizarTextoHorario(mensagemTexto);

  if (!texto || extrairIndiceOpcaoExplicita(texto) != null) {
    return null;
  }

  const inicioFrase = texto.match(
    /^(?:quero|prefiro|escolho|vou de|pode ser|pode ser a|pode ser o|marca|marcar|pode marcar)\s+(?:a|o)?\s*(\d{1,2})\s*(?:pra mim|para mim)?$/
  );
  if (inicioFrase) {
    return minutosValidos(Number(inicioFrase[1]), 0);
  }

  const numeroComConfirmacao = texto.match(
    /^(\d{1,2})\s+(?:ta|esta|fica|serve|pode ser)\s*(?:bom|boa|otimo|otima|ok|pra mim|para mim)?$/
  );
  if (numeroComConfirmacao) {
    return minutosValidos(Number(numeroComConfirmacao[1]), 0);
  }

  return null;
}

function formatarDataIsoParaEntrada(dataIso: string) {
  const match = String(dataIso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) return "";

  return `${match[3]}/${match[2]}/${match[1]}`;
}

async function carregarContextoEscolhaHorario(
  input: AutomationEngineInput
): Promise<ContextoEscolhaHorario | null> {
  const { data: execucao, error: execucaoError } = await supabaseAdmin
    .from("automacao_execucoes")
    .select("id, fluxo_id, no_atual_id, status, metadata_json")
    .eq("empresa_id", input.empresaId)
    .eq("conversa_id", input.conversaId)
    .eq("status", "aguardando")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (execucaoError || !execucao?.no_atual_id) {
    return null;
  }

  const noAtualId = String(execucao.no_atual_id);
  const metadata = execucao.metadata_json || {};
  const estadoAgenda = metadata.agenda_estado?.[noAtualId] || {};
  const dataEscolhida = String(estadoAgenda.data_escolhida || "").trim();
  const agendaId = String(estadoAgenda.agenda_id || "").trim();

  if (
    estadoAgenda.etapa !== "aguardando_horario" ||
    !agendaId ||
    !/^\d{4}-\d{2}-\d{2}$/.test(dataEscolhida)
  ) {
    return null;
  }

  const { data: noAtual, error: noError } = await supabaseAdmin
    .from("automacao_nos")
    .select("*")
    .eq("id", noAtualId)
    .eq("empresa_id", input.empresaId)
    .eq("fluxo_id", execucao.fluxo_id)
    .eq("ativo", true)
    .maybeSingle();

  if (noError || !noAtual || noAtual.tipo_no !== "agenda_escolher_horario") {
    return null;
  }

  const opcoesPorNo = metadata.agenda_opcoes || {};
  const opcoes = Array.isArray(opcoesPorNo[noAtualId])
    ? opcoesPorNo[noAtualId]
    : [];

  return {
    execucao,
    noAtual,
    noAtualId,
    metadata,
    estadoAgenda,
    agendaId,
    dataEscolhida,
    opcoes,
  };
}

function obterAmbiguidadeDiaHorario(
  contexto: ContextoEscolhaHorario
): AmbiguidadeDiaHorario | null {
  const valor = contexto.metadata?.agenda_ambiguidade?.[contexto.noAtualId];

  if (
    !valor ||
    valor.tipo !== "dia_ou_horario" ||
    !Number.isFinite(Number(valor.numero)) ||
    !Number.isFinite(Number(valor.minutos)) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(String(valor.data || ""))
  ) {
    return null;
  }

  return {
    tipo: "dia_ou_horario",
    numero: Number(valor.numero),
    minutos: Number(valor.minutos),
    data: String(valor.data),
    criado_em: String(valor.criado_em || ""),
  };
}

async function salvarAmbiguidadeDiaHorario(params: {
  input: AutomationEngineInput;
  contexto: ContextoEscolhaHorario;
  ambiguidade: AmbiguidadeDiaHorario;
}) {
  const { input, contexto, ambiguidade } = params;
  const metadataAtual = contexto.metadata || {};
  const ambiguidades = metadataAtual.agenda_ambiguidade || {};

  const { error } = await supabaseAdmin
    .from("automacao_execucoes")
    .update({
      metadata_json: {
        ...metadataAtual,
        agenda_ambiguidade: {
          ...ambiguidades,
          [contexto.noAtualId]: ambiguidade,
        },
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", contexto.execucao.id)
    .eq("empresa_id", input.empresaId)
    .eq("status", "aguardando");

  if (error) {
    console.error(
      "[AUTOMATION_ENGINE] Erro ao salvar ambiguidade de dia/horario:",
      error
    );
  }
}

async function limparAmbiguidadeDiaHorario(params: {
  input: AutomationEngineInput;
  contexto: ContextoEscolhaHorario;
}) {
  const { input, contexto } = params;
  const metadataAtual = contexto.metadata || {};
  const ambiguidades = { ...(metadataAtual.agenda_ambiguidade || {}) };

  if (!Object.prototype.hasOwnProperty.call(ambiguidades, contexto.noAtualId)) {
    return;
  }

  delete ambiguidades[contexto.noAtualId];

  const metadataNovo = {
    ...metadataAtual,
    agenda_ambiguidade: ambiguidades,
  };

  const { error } = await supabaseAdmin
    .from("automacao_execucoes")
    .update({
      metadata_json: metadataNovo,
      updated_at: new Date().toISOString(),
    })
    .eq("id", contexto.execucao.id)
    .eq("empresa_id", input.empresaId)
    .eq("status", "aguardando");

  if (error) {
    console.error(
      "[AUTOMATION_ENGINE] Erro ao limpar ambiguidade de dia/horario:",
      error
    );
  }
}

async function buscarSlotExatoNoDia(params: {
  input: AutomationEngineInput;
  contexto: ContextoEscolhaHorario;
  minutos: number;
}) {
  const { input, contexto, minutos } = params;
  const resultado = await listarSlotsDisponiveis({
    supabase: supabaseAdmin,
    empresaId: input.empresaId,
    agendaId: contexto.agendaId,
    data: contexto.dataEscolhida,
    janelaDias: 1,
    limite: 100,
  });

  const slot = resultado.slots.find(
    (item) => horaLabelParaMinutos(item.hora_label) === minutos
  );

  return slot || null;
}

async function selecionarOpcaoExistente(params: {
  input: AutomationEngineInput;
  indice: number;
}) {
  return processAutomationEngineCore({
    ...params.input,
    mensagemTexto: String(params.indice),
  });
}

async function selecionarSlotForaDaLista(params: {
  input: AutomationEngineInput;
  contexto: ContextoEscolhaHorario;
  slot: any;
}) {
  const { input, contexto, slot } = params;
  const metadataAtual = contexto.metadata || {};
  const opcoesPorNo = metadataAtual.agenda_opcoes || {};
  const opcaoTemporaria = {
    ...slot,
    indice: 1,
    agenda_id: contexto.agendaId,
  };

  const { error } = await supabaseAdmin
    .from("automacao_execucoes")
    .update({
      metadata_json: {
        ...metadataAtual,
        agenda_opcoes: {
          ...opcoesPorNo,
          [contexto.noAtualId]: [opcaoTemporaria],
        },
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", contexto.execucao.id)
    .eq("empresa_id", input.empresaId)
    .eq("status", "aguardando");

  if (error) {
    console.error(
      "[AUTOMATION_ENGINE] Erro ao preparar horario solicitado fora da lista:",
      error
    );
    return null;
  }

  return processAutomationEngineCore({
    ...input,
    mensagemTexto: "1",
  });
}

async function reprocessarPreferenciaNoMesmoDia(params: {
  input: AutomationEngineInput;
  contexto: ContextoEscolhaHorario;
  mensagemPreferencia: string;
}) {
  const { input, contexto, mensagemPreferencia } = params;
  const numeroDestino = String(input.numeroDestino || "").trim();
  const dataParaInterpretacao = formatarDataIsoParaEntrada(
    contexto.dataEscolhida
  );

  if (!numeroDestino || !dataParaInterpretacao) {
    return null;
  }

  await executarNoCore({
    empresaId: input.empresaId,
    conversaId: input.conversaId,
    execucaoId: contexto.execucao.id,
    fluxoId: contexto.execucao.fluxo_id,
    no: contexto.noAtual,
    mensagemTexto: `${mensagemPreferencia}\n${dataParaInterpretacao}`,
    numeroDestino,
    retomadaDelayAgendado: true,
  });

  return {
    ok: true,
    status: "agenda_aguardando_escolha_horario",
    execucaoId: contexto.execucao.id,
  };
}

async function selecionarHorarioNoMesmoDia(params: {
  input: AutomationEngineInput;
  contexto: ContextoEscolhaHorario;
  minutos: number;
}) {
  const { input, contexto, minutos } = params;
  const opcaoExibida = contexto.opcoes.find(
    (opcao) => horaLabelParaMinutos(opcao.hora_label) === minutos
  );

  if (opcaoExibida) {
    return selecionarOpcaoExistente({
      input,
      indice: Number(opcaoExibida.indice),
    });
  }

  const slotExato = await buscarSlotExatoNoDia({
    input,
    contexto,
    minutos,
  });

  if (slotExato) {
    const resultado = await selecionarSlotForaDaLista({
      input,
      contexto,
      slot: slotExato,
    });

    if (resultado) return resultado;
  }

  return reprocessarPreferenciaNoMesmoDia({
    input,
    contexto,
    mensagemPreferencia: `às ${formatarMinutosHorario(minutos)}`,
  });
}

async function enviarPerguntaAmbiguidade(params: {
  input: AutomationEngineInput;
  contexto: ContextoEscolhaHorario;
  minutos: number;
  indice: number;
  horaOpcao: string;
}) {
  const { input, contexto, minutos, indice, horaOpcao } = params;
  const numeroDestino = String(input.numeroDestino || "").trim();

  if (!numeroDestino) return null;

  const horaSolicitada = formatarMinutosHorario(minutos);
  const mensagem =
    `Você quis dizer *${horaSolicitada}* ou a *opção ${indice} — ${horaOpcao}*?\n\n` +
    `Responda *${horaSolicitada}* ou *opção ${indice}*.`;

  await enviarMensagemAutomacao({
    empresaId: input.empresaId,
    conversaId: input.conversaId,
    numeroDestino,
    conteudo: mensagem,
    execucaoId: contexto.execucao.id,
    noId: contexto.noAtualId,
  });

  return {
    ok: true,
    status: "agenda_horario_ambiguo",
    execucaoId: contexto.execucao.id,
  };
}

async function enviarPerguntaAmbiguidadeDiaHorario(params: {
  input: AutomationEngineInput;
  contexto: ContextoEscolhaHorario;
  numero: number;
  minutos: number;
  data: string;
}) {
  const { input, contexto, numero, minutos, data } = params;
  const numeroDestino = String(input.numeroDestino || "").trim();

  if (!numeroDestino) return null;

  const ambiguidade: AmbiguidadeDiaHorario = {
    tipo: "dia_ou_horario",
    numero,
    minutos,
    data,
    criado_em: new Date().toISOString(),
  };

  await salvarAmbiguidadeDiaHorario({
    input,
    contexto,
    ambiguidade,
  });

  const horaSolicitada = formatarMinutosHorario(minutos);
  const mensagem =
    `Só para confirmar: você quis dizer *dia ${numero}* ou o horário *${horaSolicitada}* no dia que já escolheu?\n\n` +
    `Responda *dia ${numero}* ou *${horaSolicitada}*.`;

  await enviarMensagemAutomacao({
    empresaId: input.empresaId,
    conversaId: input.conversaId,
    numeroDestino,
    conteudo: mensagem,
    execucaoId: contexto.execucao.id,
    noId: contexto.noAtualId,
  });

  return {
    ok: true,
    status: "agenda_dia_horario_ambiguo",
    execucaoId: contexto.execucao.id,
  };
}

async function tentarInterpretarRespostaHorario(input: AutomationEngineInput) {
  const mensagemTexto = String(input.mensagemTexto || "").trim();

  if (!mensagemTexto) return null;

  const contexto = await carregarContextoEscolhaHorario(input);
  if (!contexto) return null;

  const ambiguidadePendente = obterAmbiguidadeDiaHorario(contexto);
  const textoNormalizado = normalizarTextoHorario(mensagemTexto);

  if (ambiguidadePendente) {
    const respondeuHora = /^(?:hora|horario|a hora|o horario|e hora|e a hora|e o horario)$/.test(
      textoNormalizado
    );
    const respondeuDia = /^(?:dia|data|o dia|a data|e dia|e o dia|e a data)$/.test(
      textoNormalizado
    );
    const repetiuNumero =
      extrairNumeroIsolado(mensagemTexto) === ambiguidadePendente.numero;

    if (repetiuNumero) {
      return enviarPerguntaAmbiguidadeDiaHorario({
        input,
        contexto,
        numero: ambiguidadePendente.numero,
        minutos: ambiguidadePendente.minutos,
        data: ambiguidadePendente.data,
      });
    }

    await limparAmbiguidadeDiaHorario({ input, contexto });

    if (respondeuHora) {
      return selecionarHorarioNoMesmoDia({
        input,
        contexto,
        minutos: ambiguidadePendente.minutos,
      });
    }

    if (respondeuDia) {
      return processAutomationEngineCore({
        ...input,
        mensagemTexto: `dia ${ambiguidadePendente.numero}`,
      });
    }
  }

  const numeroIsolado = extrairNumeroIsolado(mensagemTexto);

  if (numeroIsolado != null) {
    const opcaoMesmoIndice = contexto.opcoes.find(
      (opcao) => Number(opcao.indice) === numeroIsolado
    );

    // Se o número corresponde a uma opção realmente exibida, a regra da
    // própria mensagem da agenda prevalece: trata como índice da lista.
    if (opcaoMesmoIndice) {
      return null;
    }

    const minutosNumero = minutosValidos(numeroIsolado, 0);
    const interpretacaoNumero = interpretarDataHorarioAgenda(
      mensagemTexto,
      "America/Sao_Paulo"
    );

    let existeHorarioNoDia = false;
    if (minutosNumero != null) {
      existeHorarioNoDia = contexto.opcoes.some(
        (opcao) => horaLabelParaMinutos(opcao.hora_label) === minutosNumero
      );

      if (!existeHorarioNoDia) {
        existeHorarioNoDia = Boolean(
          await buscarSlotExatoNoDia({
            input,
            contexto,
            minutos: minutosNumero,
          })
        );
      }
    }

    if (
      minutosNumero != null &&
      existeHorarioNoDia &&
      Boolean(interpretacaoNumero.data)
    ) {
      return enviarPerguntaAmbiguidadeDiaHorario({
        input,
        contexto,
        numero: numeroIsolado,
        minutos: minutosNumero,
        data: String(interpretacaoNumero.data),
      });
    }

    if (minutosNumero != null && existeHorarioNoDia) {
      return selecionarHorarioNoMesmoDia({
        input,
        contexto,
        minutos: minutosNumero,
      });
    }

    // Sem horário correspondente, deixa o motor principal decidir se o
    // número representa outra data ou uma resposta inválida.
    return null;
  }

  // Menções explícitas a "opção" continuam sendo escolha da lista.
  if (extrairIndiceOpcaoExplicita(mensagemTexto) != null) {
    return null;
  }

  const horarioExplicito = extrairHorarioExplicito(mensagemTexto);
  const horarioContextual =
    horarioExplicito == null ? extrairHorarioContextual(mensagemTexto) : null;
  const interpretacao = interpretarDataHorarioAgenda(
    mensagemTexto,
    "America/Sao_Paulo"
  );
  const temPreferenciaExistente =
    Boolean(interpretacao.preferencia) &&
    !interpretacao.data &&
    !interpretacao.data_invalida_motivo;

  if (
    horarioExplicito == null &&
    horarioContextual == null &&
    !temPreferenciaExistente
  ) {
    return null;
  }

  if (horarioExplicito != null) {
    return selecionarHorarioNoMesmoDia({
      input,
      contexto,
      minutos: horarioExplicito,
    });
  }

  if (horarioContextual != null) {
    const numeroContextual = Math.floor(horarioContextual / 60);
    const opcaoMesmoNumero = contexto.opcoes.find(
      (opcao) => Number(opcao.indice) === numeroContextual
    );
    const slotExato = await buscarSlotExatoNoDia({
      input,
      contexto,
      minutos: horarioContextual,
    });

    if (opcaoMesmoNumero && slotExato) {
      const minutosOpcao = horaLabelParaMinutos(opcaoMesmoNumero.hora_label);

      if (minutosOpcao !== horarioContextual) {
        return enviarPerguntaAmbiguidade({
          input,
          contexto,
          minutos: horarioContextual,
          indice: Number(opcaoMesmoNumero.indice),
          horaOpcao: String(opcaoMesmoNumero.hora_label || ""),
        });
      }
    }

    if (opcaoMesmoNumero) {
      return selecionarOpcaoExistente({
        input,
        indice: Number(opcaoMesmoNumero.indice),
      });
    }

    if (slotExato) {
      const resultado = await selecionarSlotForaDaLista({
        input,
        contexto,
        slot: slotExato,
      });

      if (resultado) return resultado;
    }

    return reprocessarPreferenciaNoMesmoDia({
      input,
      contexto,
      mensagemPreferencia: `às ${formatarMinutosHorario(horarioContextual)}`,
    });
  }

  if (temPreferenciaExistente) {
    return reprocessarPreferenciaNoMesmoDia({
      input,
      contexto,
      mensagemPreferencia: mensagemTexto,
    });
  }

  return null;
}

export async function processAutomationEngine(input: AutomationEngineInput) {
  const resultadoHorario = await tentarInterpretarRespostaHorario(input);

  if (resultadoHorario) {
    return resultadoHorario;
  }

  return processAutomationEngineCore(input);
}
