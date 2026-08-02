import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const enginePath = path.join(
  root,
  "src/lib/automacoes/process-automation-engine.ts"
);
const editorPath = path.join(root, "src/app/(private)/fluxos/page.tsx");

function replaceVariants(content, variants, replacement, description) {
  let changed = false;

  for (const variant of variants) {
    if (!variant || variant === replacement) continue;

    if (content.includes(variant)) {
      content = content.replaceAll(variant, replacement);
      changed = true;
    }
  }

  if (!changed && !content.includes(replacement)) {
    throw new Error(`Não foi possível aplicar: ${description}.`);
  }

  return content;
}

function replaceOptional(content, variants, replacement) {
  for (const variant of variants) {
    if (!variant || variant === replacement) continue;
    content = content.replaceAll(variant, replacement);
  }

  return content;
}

let engine = fs.readFileSync(enginePath, "utf8");
let editor = fs.readFileSync(editorPath, "utf8");

const markerSelecaoUnica = "CRM_SINGLE_APPOINTMENT_AUTO_SELECTION_V1";

if (!engine.includes(markerSelecaoUnica)) {
  engine = replaceVariants(
    engine,
    ["  if (listarParaEscolha && agendamentos.length > 0) {"],
    `  // ${markerSelecaoUnica}\n  if (listarParaEscolha && agendamentos.length > 1) {`,
    "seleção automática quando há apenas um agendamento"
  );
}

const mensagemUmAgendamento =
  "Encontrei seu agendamento para {{agenda_data}} às {{agenda_hora}}.";
const mensagemSemAgendamento =
  "No momento não encontrei horários disponíveis. Vou te encaminhar para um atendente.";
const mensagemListarHorarios =
  "Para {{agenda_data_nova}}, estes horários estão disponíveis.\\n\\nResponda com o número da opção desejada ou informe outra data:";
const mensagemPreferenciaIndisponivel =
  "O horário {{agenda_preferencia_solicitada}} não está disponível em {{agenda_data_nova}}.\\n\\nEstas são as opções mais próximas:";
const mensagemDataInvalida =
  "Essa data não é válida ou já passou. Informe uma data futura.\\n\\nQuando necessário, inclua também o ano.";
const mensagemSemHorarios =
  "Não encontrei horários disponíveis em {{agenda_data_nova}}.\\n\\nInforme outra data para continuarmos.";
const mensagemSemExpediente =
  "Não há atendimento disponível em {{agenda_data_nova}}.\\n\\nInforme outra data para continuarmos.";
const mensagemConflitoRemarcacao =
  "Esse horário acabou de ficar indisponível.\\n\\nEscolha outra opção para continuarmos.";

const textReplacements = [
  {
    variants: [
      "Encontrei seu agendamento para {{agenda_data}} as {{agenda_hora}}.",
      "Encontrei seu agendamento para {{agenda_data}} às {{agenda_hora}}.",
    ],
    replacement: mensagemUmAgendamento,
    description: "mensagem padrão para um agendamento",
  },
  {
    variants: [
      "Nao encontrei nenhum agendamento futuro no seu contato.",
      "Não encontrei nenhum agendamento futuro no seu contato.",
      "No momento nao encontrei horários disponíveis. Vou te encaminhar para um atendente.",
    ],
    replacement: mensagemSemAgendamento,
    description: "mensagem padrão para nenhum agendamento",
  },
  {
    variants: [
      "Para {{agenda_data_nova}} tenho estes horarios. Responda com o numero do horario ou me diga outro dia:",
      "Para {{agenda_data_nova}} tenho estes horários. Responda com o número do horário ou me diga outro dia:",
    ],
    replacement: mensagemListarHorarios,
    description: "mensagem padrão de horários disponíveis",
  },
  {
    variants: [
      "Nao tenho horario {{agenda_preferencia_solicitada}} livre em {{agenda_data_nova}}. Tenho estas alternativas:",
      "Não tenho horário {{agenda_preferencia_solicitada}} livre em {{agenda_data_nova}}. Tenho estas alternativas:",
    ],
    replacement: mensagemPreferenciaIndisponivel,
    description: "mensagem padrão de preferência indisponível",
  },
  {
    variants: [
      "Essa data ja passou. Para evitar confusao, me envie uma data futura. Se quiser marcar para outro ano, informe o ano completo, por exemplo {{agenda_data_sugestao_ano}}.",
      "Essa data já passou. Para evitar confusão, me envie uma data futura. Se quiser marcar para outro ano, informe o ano completo, por exemplo {{agenda_data_sugestao_ano}}.",
    ],
    replacement: mensagemDataInvalida,
    description: "mensagem padrão de data inválida",
  },
  {
    variants: [
      "Nao encontrei horarios livres para {{agenda_data_nova}}. Me diga outro dia ou horario.",
      "Não encontrei horários livres para {{agenda_data_nova}}. Me diga outro dia ou horário.",
    ],
    replacement: mensagemSemHorarios,
    description: "mensagem padrão sem horários",
  },
  {
    variants: [
      "Nao temos atendimento em {{agenda_data_nova}}. Me diga outro dia para eu verificar os horarios disponiveis.",
      "Não temos atendimento em {{agenda_data_nova}}. Me diga outro dia para eu verificar os horários disponíveis.",
    ],
    replacement: mensagemSemExpediente,
    description: "mensagem padrão sem expediente",
  },
  {
    variants: [
      "Esse novo horario acabou de ficar indisponivel. Vamos escolher outro horario.",
      "Esse novo horário acabou de ficar indisponível. Vamos escolher outro horário.",
    ],
    replacement: mensagemConflitoRemarcacao,
    description: "mensagem padrão de conflito ao remarcar",
  },
];

for (const item of textReplacements) {
  engine = replaceOptional(engine, item.variants, item.replacement);
  editor = replaceOptional(editor, item.variants, item.replacement);

  if (
    !engine.includes(item.replacement) &&
    !editor.includes(item.replacement)
  ) {
    throw new Error(`Não foi possível aplicar: ${item.description}.`);
  }
}

editor = replaceVariants(
  editor,
  ['? "Mensagem quando encontrar"'],
  '? "Mensagem para 1 agendamento"',
  "título do campo para um agendamento"
);

editor = replaceVariants(
  editor,
  [
    '<span className={styles.label}>Mensagem ao listar agendamentos</span>',
  ],
  '<span className={styles.label}>Mensagem para vários agendamentos</span>',
  "título do campo para vários agendamentos"
);

editor = replaceVariants(
  editor,
  ["<strong>Listar agendamentos para escolha</strong>"],
  "<strong>Listar quando houver vários agendamentos</strong>",
  "título da opção de listagem"
);

editor = replaceVariants(
  editor,
  [
    "Envia os agendamentos futuros e aguarda o contato responder o numero.",
  ],
  "Quando houver mais de um agendamento futuro, envia as opções e aguarda o contato responder o número.",
  "explicação da opção de listagem"
);

editor = replaceVariants(
  editor,
  ['? "Mensagem depois de remarcar"'],
  '? "Mensagem após remarcar com sucesso"',
  "título da mensagem de sucesso da remarcação"
);

editor = replaceVariants(
  editor,
  [
    '<span className={styles.label}>Mensagem sem horário / indisponivel</span>',
  ],
  '<span className={styles.label}>Mensagem se o horário ficar indisponível</span>',
  "título da mensagem de conflito de horário"
);

editor = replaceOptional(
  editor,
  ["Mensagem ao listar horarios"],
  "Mensagem ao listar horários"
);
editor = replaceOptional(
  editor,
  ["Mensagem se horario pedido estiver ocupado"],
  "Mensagem se o horário pedido estiver ocupado"
);
editor = replaceOptional(
  editor,
  ["Mensagem sem horarios"],
  "Mensagem sem horários"
);
editor = replaceOptional(
  editor,
  ["{{agenda_nome_nova}}"],
  "{{calendario_nome_novo}}"
);

const markerEditor = "CRM_APPOINTMENT_MESSAGE_LABELS_V1";
if (!editor.includes(markerEditor)) {
  const anchor = '? "Mensagem para 1 agendamento"';

  if (!editor.includes(anchor)) {
    throw new Error("Não foi possível marcar os novos títulos de mensagens.");
  }

  editor = editor.replace(
    anchor,
    `? "Mensagem para 1 agendamento" // ${markerEditor}`
  );
}

fs.writeFileSync(enginePath, engine, "utf8");
fs.writeFileSync(editorPath, editor, "utf8");

console.log(
  "Busca de agendamento, títulos dos campos e mensagens padrão atualizados."
);
