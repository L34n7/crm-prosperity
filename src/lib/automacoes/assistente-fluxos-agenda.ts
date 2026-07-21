import {
  normalizarPlanoAssistente as normalizarPlanoAssistenteBase,
  type AssistenteAutomacaoNo,
  type PlanoAssistenteEtapa,
  type PlanoAssistenteFluxos,
} from "./assistente-fluxos-base";

const TIPOS_AGENDA = new Set([
  "agenda_escolher_horario",
  "agenda_criar_agendamento",
  "agenda_buscar_agendamento",
  "agenda_remarcar_agendamento",
  "agenda_cancelar_agendamento",
]);

export type EtapaAgenda = PlanoAssistenteEtapa & {
  agenda_id?: string | null;
  agenda_nome?: string | null;
};

function texto(valor: unknown, limite = 160) {
  return String(valor || "").trim().slice(0, limite);
}

function objeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
}

function normalizar(valor: unknown) {
  return texto(valor)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

export function ehTipoAgenda(tipo: unknown): tipo is string {
  return TIPOS_AGENDA.has(texto(tipo, 80));
}

function tituloAgenda(tipo: string) {
  if (tipo === "agenda_escolher_horario") return "Escolher horário";
  if (tipo === "agenda_criar_agendamento") return "Criar agendamento";
  if (tipo === "agenda_buscar_agendamento") return "Buscar agendamento";
  if (tipo === "agenda_remarcar_agendamento") return "Remarcar agendamento";
  if (tipo === "agenda_cancelar_agendamento") return "Cancelar agendamento";
  return "Agenda";
}

function mensagemAgenda(tipo: string) {
  if (tipo === "agenda_escolher_horario") {
    return "Qual dia você prefere? Pode responder hoje, amanhã, uma data ou o dia da semana.";
  }
  if (tipo === "agenda_criar_agendamento") {
    return "Agendado! Seu horário ficou marcado para {{agenda_data}} às {{agenda_hora}}.";
  }
  if (tipo === "agenda_buscar_agendamento") {
    return "Encontrei seu agendamento para {{agenda_data}} às {{agenda_hora}}.";
  }
  if (tipo === "agenda_remarcar_agendamento") {
    return "Remarcado! Seu horário agora ficou para {{agenda_data}} às {{agenda_hora}}.";
  }
  if (tipo === "agenda_cancelar_agendamento") {
    return "Pronto, seu horário de {{agenda_data}} às {{agenda_hora}} foi cancelado.";
  }
  return "Vamos cuidar do seu agendamento.";
}

function normalizarEtapaAgenda(valor: unknown): EtapaAgenda | null {
  const item = objeto(valor);
  const tipo = texto(item.tipo, 80);
  const ref = normalizar(item.ref);

  if (!ehTipoAgenda(tipo) || !ref) return null;

  return {
    ref,
    tipo,
    titulo: texto(item.titulo, 120) || tituloAgenda(tipo),
    mensagem: texto(item.mensagem, 1800) || mensagemAgenda(tipo),
    variavel: null,
    tipo_captura: null,
    setor_id: null,
    setor_nome: null,
    resultado: null,
    midia_id: null,
    midia_nome: null,
    midia_tipo: null,
    midia_url: null,
    url: null,
    botao_texto: null,
    opcoes: [],
    agenda_id: texto(item.agenda_id, 120) || null,
    agenda_nome: texto(item.agenda_nome, 160) || null,
  };
}

export function normalizarPlanoAssistenteComAgenda(
  valor: unknown
): PlanoAssistenteFluxos {
  const planoBase = normalizarPlanoAssistenteBase(valor);
  const item = objeto(valor);
  const etapasRaw = Array.isArray(item.etapas) ? item.etapas : [];
  const etapasBasePorRef = new Map(
    planoBase.etapas.map((etapa) => [etapa.ref, etapa])
  );
  const etapas: PlanoAssistenteEtapa[] = [];

  for (const etapaRaw of etapasRaw) {
    const etapaAgenda = normalizarEtapaAgenda(etapaRaw);

    if (etapaAgenda) {
      etapas.push(etapaAgenda);
      continue;
    }

    const ref = normalizar(objeto(etapaRaw).ref);
    const etapaBase = etapasBasePorRef.get(ref);

    if (!etapaBase) continue;

    etapasBasePorRef.delete(ref);
    etapas.push(
      etapaBase.tipo === "pergunta_botoes" && etapaBase.opcoes.length > 3
        ? { ...etapaBase, tipo: "pergunta_opcoes" }
        : etapaBase
    );
  }

  for (const etapaBase of etapasBasePorRef.values()) {
    etapas.push(
      etapaBase.tipo === "pergunta_botoes" && etapaBase.opcoes.length > 3
        ? { ...etapaBase, tipo: "pergunta_opcoes" }
        : etapaBase
    );
  }

  return { ...planoBase, etapas };
}

function baseTentativasAgenda() {
  return {
    max_tentativas_invalidas: 3,
    max_tentativas_sem_resposta: 3,
    acao_excesso_tentativas: "transferir_atendimento",
    setor_excesso_tentativas: null,
    mensagem_excesso_tentativas:
      "Não consegui continuar o atendimento automático. Vou te encaminhar para um atendente.",
    notificar_excesso_tentativas: true,
    notificar_email_excesso_tentativas: true,
  };
}

function configuracaoAgenda(etapa: EtapaAgenda) {
  const agendaId = texto(etapa.agenda_id, 120);
  const mensagem = texto(etapa.mensagem, 1800) || mensagemAgenda(etapa.tipo);

  if (etapa.tipo === "agenda_escolher_horario") {
    return {
      mensagem,
      agenda_id: agendaId,
      janela_dias: 14,
      quantidade_opcoes: 6,
      mensagem_listar_horarios:
        "Para {{agenda_data_nova}} tenho estes horários. Responda com o número do horário ou me diga outro dia:",
      mensagem_sem_horarios:
        "No momento não encontrei horários disponíveis. Me diga outro dia ou horário.",
      mensagem_data_invalida:
        "Essa data já passou. Envie uma data futura, por favor.",
      mensagem_sem_expediente:
        "Não temos atendimento em {{agenda_data_nova}}. Me diga outro dia para verificar os horários.",
      mensagem_preferencia_indisponivel:
        "Não tenho horário {{agenda_preferencia_solicitada}} livre em {{agenda_data_nova}}. Tenho estas alternativas:",
      notificar_email: false,
      notificar_ao_chegar: false,
      notificacao_titulo: "",
      notificacao_mensagem: "",
      ...baseTentativasAgenda(),
    };
  }

  if (etapa.tipo === "agenda_criar_agendamento") {
    return {
      mensagem,
      agenda_id: agendaId,
      status_inicial: "agendado",
      mensagem_conflito:
        "Esse horário acabou de ficar indisponível. Vamos escolher outro horário.",
      enviar_email_agendamento: true,
      email_agendamento_origem: "contato",
      email_agendamento_variavel: "email",
      lembrete_agendamento_ativo: false,
      lembrete_agendamento_email: false,
      lembrete_agendamento_whatsapp: true,
      lembrete_agendamento_unidade: "horas",
      lembrete_agendamento_quantidade: 2,
      lembrete_agendamento_template_id: "",
      lembrete_agendamento_variaveis: [],
      notificar_email: false,
      notificar_ao_chegar: false,
      notificacao_titulo: "",
      notificacao_mensagem: "",
    };
  }

  if (etapa.tipo === "agenda_buscar_agendamento") {
    return {
      mensagem,
      mensagem_encontrado: mensagem,
      agenda_id: agendaId,
      status_busca: ["agendado", "confirmado"],
      listar_para_escolha: true,
      quantidade_opcoes: 6,
      mensagem_listar_agendamentos:
        "Encontrei estes agendamentos. Responda com o número do agendamento que deseja consultar, cancelar ou remarcar:",
      mensagem_nao_encontrado:
        "Não encontrei agendamentos ativos. Posso ajudar a marcar um novo horário.",
      notificar_email: false,
      notificar_ao_chegar: false,
      notificacao_titulo: "",
      notificacao_mensagem: "",
      ...baseTentativasAgenda(),
    };
  }

  if (etapa.tipo === "agenda_remarcar_agendamento") {
    return {
      mensagem,
      status_final: "agendado",
      mensagem_conflito:
        "Esse horário acabou de ficar indisponível. Vamos escolher outro horário.",
      enviar_email_agendamento: true,
      email_agendamento_origem: "contato",
      email_agendamento_variavel: "email",
      notificar_email: false,
      notificar_ao_chegar: false,
      notificacao_titulo: "",
      notificacao_mensagem: "",
    };
  }

  return {
    mensagem,
    motivo: "Cancelado pelo cliente via automacao",
    status_final: "cancelado",
    enviar_email_agendamento: true,
    email_agendamento_origem: "contato",
    email_agendamento_variavel: "email",
    notificar_email: false,
    notificar_ao_chegar: false,
    notificacao_titulo: "",
    notificacao_mensagem: "",
  };
}

export function prepararPlanoBaseComAgenda(plano: PlanoAssistenteFluxos) {
  const agendasPorMarcador = new Map<string, EtapaAgenda>();
  const etapas = plano.etapas.map((etapa) => {
    if (!ehTipoAgenda(etapa.tipo)) return etapa;

    const etapaAgenda = etapa as EtapaAgenda;
    const marcador = `__agenda__${etapa.ref}`.slice(0, 120);
    agendasPorMarcador.set(marcador, etapaAgenda);

    return {
      ...etapa,
      tipo: "mensagem",
      titulo: marcador,
      mensagem: etapa.mensagem || mensagemAgenda(etapa.tipo),
    };
  });

  return {
    plano: { ...plano, etapas },
    agendasPorMarcador,
  };
}

export function aplicarTiposAgenda(
  nos: AssistenteAutomacaoNo[],
  agendasPorMarcador: Map<string, EtapaAgenda>
) {
  return nos.map((no) => {
    const etapa = agendasPorMarcador.get(no.titulo);
    if (!etapa) return no;

    return {
      ...no,
      tipo_no: etapa.tipo,
      titulo: etapa.titulo || tituloAgenda(etapa.tipo),
      configuracao_json: configuracaoAgenda(etapa),
      delay_segundos: 3,
    };
  });
}
