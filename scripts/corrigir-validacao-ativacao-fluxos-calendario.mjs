import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const relativePath = "src/app/(private)/fluxos/page.tsx";
const absolutePath = path.join(root, relativePath);
let content = fs.readFileSync(absolutePath, "utf8");
let alterado = false;

const markerCalendario = "CRM_SYSTEM_CALENDAR_FLOW_ACTIVATION_VALIDATION_V1";

if (!content.includes(markerCalendario)) {
  const current = `    if (
      tipoNo === "agenda_escolher_horario" &&
      !String(config.agenda_id || "").trim()
    ) {
      return \`O bloco "\${node.data?.titulo}" precisa ter uma agenda.\`;
    }`;

  const replacement = `    // CRM_SYSTEM_CALENDAR_FLOW_ACTIVATION_VALIDATION_V1
    if (
      tipoNo === "agenda_escolher_horario" &&
      !String(config.agenda_id || "").trim() &&
      config.usar_agenda_contexto !== true &&
      config.usar_agenda_contexto !== "true"
    ) {
      return \`O bloco "\${node.data?.titulo}" precisa ter um calendário.\`;
    }`;

  if (!content.includes(current)) {
    throw new Error(
      "Não foi possível localizar a validação do bloco Escolher horário."
    );
  }

  content = content.replace(current, replacement);
  alterado = true;
}

const markerFilaGeral = "CRM_GENERAL_QUEUE_ACTIVATION_VALIDATION_V1";

if (!content.includes(markerFilaGeral)) {
  const current = `        String(config.acao_excesso_tentativas || "transferir_atendimento") ===
          "transferir_atendimento" &&
        !String(config.setor_excesso_tentativas || "").trim()`;

  const replacement = `        String(config.acao_excesso_tentativas || "transferir_atendimento") ===
          "transferir_atendimento" &&
        // CRM_GENERAL_QUEUE_ACTIVATION_VALIDATION_V1
        String(config.escopo_fila_excesso_tentativas || "setor").trim() !==
          "geral" &&
        !String(config.setor_excesso_tentativas || "").trim()`;

  if (!content.includes(current)) {
    throw new Error(
      "Não foi possível localizar a validação do setor por excesso de tentativas."
    );
  }

  content = content.replace(current, replacement);
  alterado = true;
}

const markerTransferenciaFilaGeral =
  "CRM_GENERAL_QUEUE_TRANSFER_NODE_ACTIVATION_VALIDATION_V1";

if (!content.includes(markerTransferenciaFilaGeral)) {
  const current = `    if (
        tipoNo === "transferir_setor" &&
        !String(config.setor_id || "").trim()
      ) {
        return \`O bloco "\${node.data?.titulo}" precisa ter um setor destino.\`;
      }`;

  const replacement = `    if (
        tipoNo === "transferir_setor" &&
        // CRM_GENERAL_QUEUE_TRANSFER_NODE_ACTIVATION_VALIDATION_V1
        String(config.escopo_fila || "setor").trim() !== "geral" &&
        !String(config.setor_id || "").trim()
      ) {
        return \`O bloco "\${node.data?.titulo}" precisa ter um setor destino.\`;
      }`;

  if (!content.includes(current)) {
    throw new Error(
      "Não foi possível localizar a validação do bloco Transferir setor."
    );
  }

  content = content.replace(current, replacement);
  alterado = true;
}

const markerFiltroFluxosSistema = "CRM_SYSTEM_FLOW_FILTER_ORDER_V1";

if (!content.includes(markerFiltroFluxosSistema)) {
  const filtroTipoAtual = `  const [filtroStatusFluxo, setFiltroStatusFluxo] = useState<
    "todos" | "rascunho" | "ativo" | "pausado" | "arquivado"
  >("todos");`;
  const filtroTipoNovo = `  const [filtroStatusFluxo, setFiltroStatusFluxo] = useState<
    | "todos"
    | "sistema"
    | "rascunho"
    | "ativo"
    | "pausado"
    | "arquivado"
  >("todos");`;

  if (!content.includes(filtroTipoAtual)) {
    throw new Error("Não foi possível localizar o tipo do filtro de fluxos.");
  }
  content = content.replace(filtroTipoAtual, filtroTipoNovo);

  const filtroEventoAtual = `                    | "todos"
                    | "rascunho"
                    | "ativo"
                    | "pausado"
                    | "arquivado"`;
  const filtroEventoNovo = `                    | "todos"
                    | "sistema"
                    | "rascunho"
                    | "ativo"
                    | "pausado"
                    | "arquivado"`;

  if (!content.includes(filtroEventoAtual)) {
    throw new Error("Não foi possível localizar o evento do filtro de fluxos.");
  }
  content = content.replace(filtroEventoAtual, filtroEventoNovo);

  const filtroOpcaoAtual = `              <option value="todos">Todos</option>
              <option value="ativo">Ativos</option>`;
  const filtroOpcaoNovo = `              <option value="todos">Todos</option>
              <option value="sistema">Fluxos do sistema</option>
              <option value="ativo">Ativos</option>`;

  if (!content.includes(filtroOpcaoAtual)) {
    throw new Error("Não foi possível localizar as opções do filtro de fluxos.");
  }
  content = content.replace(filtroOpcaoAtual, filtroOpcaoNovo);

  const filtroListaAtual = `              .filter((f) =>
                filtroStatusFluxo === "todos" ? true : f.status === filtroStatusFluxo
              )`;
  const filtroListaNovo = `              .filter((f) => {
                // CRM_SYSTEM_FLOW_FILTER_ORDER_V1
                if (filtroStatusFluxo === "todos") return true;
                if (filtroStatusFluxo === "sistema") {
                  return fluxoEhSistemaCalendario(f);
                }
                return f.status === filtroStatusFluxo;
              })`;

  if (!content.includes(filtroListaAtual)) {
    throw new Error("Não foi possível localizar a filtragem da lista de fluxos.");
  }
  content = content.replace(filtroListaAtual, filtroListaNovo);

  const ordenacaoAtual = `                if (statusDiff !== 0) return statusDiff;

                // 🔥 Ordenação por data (mais recente primeiro)`;
  const ordenacaoNova = `                if (statusDiff !== 0) return statusDiff;

                if (a.status === "ativo" && b.status === "ativo") {
                  const sistemaDiff =
                    Number(fluxoEhSistemaCalendario(a)) -
                    Number(fluxoEhSistemaCalendario(b));

                  if (sistemaDiff !== 0) return sistemaDiff;
                }

                // 🔥 Ordenação por data (mais recente primeiro)`;

  if (!content.includes(ordenacaoAtual)) {
    throw new Error("Não foi possível localizar a ordenação da lista de fluxos.");
  }
  content = content.replace(ordenacaoAtual, ordenacaoNova);
  alterado = true;
}

if (alterado) {
  fs.writeFileSync(absolutePath, content, "utf8");
}

const gatilhosRelativePath =
  "src/app/api/automacoes/[id]/gatilhos/route.ts";
const gatilhosAbsolutePath = path.join(root, gatilhosRelativePath);
let gatilhosContent = fs.readFileSync(gatilhosAbsolutePath, "utf8");
let gatilhosAlterado = false;
const markerGatilhoOpcionalSistema = "CRM_SYSTEM_FLOW_OPTIONAL_TRIGGER_V1";

if (!gatilhosContent.includes(markerGatilhoOpcionalSistema)) {
  const selectAtual = `.select("id, status, fluxo_padrao")`;
  const selectNovo = `.select("id, status, fluxo_padrao, configuracao_json")`;

  if (!gatilhosContent.includes(selectAtual)) {
    throw new Error(
      "Não foi possível localizar a consulta de validação dos gatilhos."
    );
  }

  gatilhosContent = gatilhosContent.replace(selectAtual, selectNovo);

  const validacaoAtual = `  if (
    !fluxo ||
    String(fluxo.status || "") !== "ativo" ||
    fluxo.fluxo_padrao === true
  ) {
    return false;
  }`;

  const validacaoNova = `  const fluxoSistemaCalendario =
    fluxo?.configuracao_json?.fluxo_sistema_calendario === true &&
    fluxo?.configuracao_json?.protegido_sistema === true;

  // CRM_SYSTEM_FLOW_OPTIONAL_TRIGGER_V1
  if (
    !fluxo ||
    String(fluxo.status || "") !== "ativo" ||
    fluxo.fluxo_padrao === true ||
    fluxoSistemaCalendario
  ) {
    return false;
  }`;

  if (!gatilhosContent.includes(validacaoAtual)) {
    throw new Error(
      "Não foi possível localizar a validação do último gatilho ativo."
    );
  }

  gatilhosContent = gatilhosContent.replace(validacaoAtual, validacaoNova);
  gatilhosAlterado = true;
}

if (gatilhosAlterado) {
  fs.writeFileSync(gatilhosAbsolutePath, gatilhosContent, "utf8");
}

const markerVariaveisSistemaEditor =
  "CRM_SYSTEM_CANONICAL_VARIABLES_EDITOR_V1";
let variaveisEditorContent = fs.readFileSync(absolutePath, "utf8");

if (!variaveisEditorContent.includes(markerVariaveisSistemaEditor)) {
  variaveisEditorContent = variaveisEditorContent
    .replaceAll('chave: "agenda_nome"', 'chave: "calendario_nome"')
    .replaceAll('exemplo: "{{agenda_nome}}"', 'exemplo: "{{calendario_nome}}"')
    .replaceAll('chave: "agenda_nome_nova"', 'chave: "calendario_nome_novo"')
    .replaceAll(
      'exemplo: "{{agenda_nome_nova}}"',
      'exemplo: "{{calendario_nome_novo}}"'
    )
    .replaceAll("Nome da agenda", "Nome do calendário")
    .replaceAll("nome da agenda", "nome do calendário");

  const opcoesNovas = [];

  if (!variaveisEditorContent.includes('chave: "nome_empresa"')) {
    opcoesNovas.push(`  {
    chave: "nome_empresa",
    exemplo: "{{nome_empresa}}",
    descricao: "Nome da empresa salvo em Configurações Gerais.",
  },`);
  }

  if (!variaveisEditorContent.includes('chave: "calendario_nome"')) {
    opcoesNovas.push(`  {
    chave: "calendario_nome",
    exemplo: "{{calendario_nome}}",
    descricao: "Nome do calendário vinculado ao agendamento atual.",
  },`);
  }

  if (!variaveisEditorContent.includes('chave: "calendario_nome_novo"')) {
    opcoesNovas.push(`  {
    chave: "calendario_nome_novo",
    exemplo: "{{calendario_nome_novo}}",
    descricao: "Nome do calendário usado no novo horário selecionado.",
  },`);
  }

  if (!variaveisEditorContent.includes('chave: "agendamento_titulo"')) {
    opcoesNovas.push(`  {
    chave: "agendamento_titulo",
    exemplo: "{{agendamento_titulo}}",
    descricao: "Título salvo no agendamento atual.",
  },`);
  }

  const inicioVariaveis = "const VARIAVEIS_FIXAS_SISTEMA = [";

  if (!variaveisEditorContent.includes(inicioVariaveis)) {
    throw new Error(
      "Não foi possível localizar a lista de variáveis fixas do editor."
    );
  }

  variaveisEditorContent = variaveisEditorContent.replace(
    inicioVariaveis,
    `${inicioVariaveis}\n  // CRM_SYSTEM_CANONICAL_VARIABLES_EDITOR_V1\n${opcoesNovas.join("\n")}`
  );

  const ajudaRegex =
    /const VARIAVEIS_FIXAS_CONTATO_HELP =\s*"[^"]*";/;

  if (ajudaRegex.test(variaveisEditorContent)) {
    variaveisEditorContent = variaveisEditorContent.replace(
      ajudaRegex,
      'const VARIAVEIS_FIXAS_CONTATO_HELP =\n    "Variáveis do sistema: {{nome_empresa}}, {{nome_contato}}, {{nome_whatsapp}}, {{email_contato}}, {{numero_contato}}, {{calendario_nome}}, {{agendamento_titulo}}, {{campanha}}, {{origem}}, {{status_lead}}, {{classificacao_lead}}, {{protocolo_atual}} e {{ultimo_protocolo}}.";'
    );
  }

  const inicioReservadas =
    'const VARIAVEIS_FIXAS_CONTATO_RESERVADAS = [\n  "nome",';
  const reservadasNovas =
    'const VARIAVEIS_FIXAS_CONTATO_RESERVADAS = [\n  "nome_empresa",\n  "empresa_nome",\n  "calendario_nome",\n  "calendario_nome_novo",\n  "agendamento_titulo",\n  "nome",';

  if (!variaveisEditorContent.includes(inicioReservadas)) {
    throw new Error(
      "Não foi possível localizar a lista de variáveis reservadas do editor."
    );
  }

  variaveisEditorContent = variaveisEditorContent.replace(
    inicioReservadas,
    reservadasNovas
  );

  fs.writeFileSync(absolutePath, variaveisEditorContent, "utf8");
}

const engineRelativePath =
  "src/lib/automacoes/process-automation-engine.ts";
const engineAbsolutePath = path.join(root, engineRelativePath);
let engineContent = fs.readFileSync(engineAbsolutePath, "utf8");
const markerVariaveisSistemaRuntime =
  "CRM_SYSTEM_CANONICAL_VARIABLES_RUNTIME_V1";

if (!engineContent.includes(markerVariaveisSistemaRuntime)) {
  const resolverAnchor =
    "async function resolverValorConversaoEncerramento(params: {";
  const empresaResolver = `const VARIAVEIS_FIXAS_EMPRESA = new Set([
  "nome_empresa",
  "empresa_nome",
]);

// CRM_SYSTEM_CANONICAL_VARIABLES_RUNTIME_V1
async function carregarVariaveisFixasEmpresa(params: {
  empresaId: string;
  chaves: string[];
}) {
  const { empresaId, chaves } = params;

  if (
    !chaves.some((chave) =>
      VARIAVEIS_FIXAS_EMPRESA.has(String(chave || "").trim().toLowerCase())
    )
  ) {
    return new Map<string, string>();
  }

  const { data: empresa, error } = await supabaseAdmin
    .from("empresas")
    .select("nome_fantasia")
    .eq("id", empresaId)
    .maybeSingle();

  if (error) {
    console.error(
      "[AUTOMATION_ENGINE] Erro ao buscar variáveis fixas da empresa:",
      error
    );

    return new Map<string, string>();
  }

  const nomeEmpresa = String(empresa?.nome_fantasia || "").trim();

  return new Map<string, string>([
    ["nome_empresa", nomeEmpresa],
    ["empresa_nome", nomeEmpresa],
  ]);
}

${resolverAnchor}`;

  if (!engineContent.includes(resolverAnchor)) {
    throw new Error(
      "Não foi possível localizar o ponto de inclusão das variáveis da empresa."
    );
  }

  engineContent = engineContent.replace(resolverAnchor, empresaResolver);

  const destructuringAtual =
    "const [variaveisExecucaoResult, variaveisFixasContato, variaveisGlobais] =\n    await Promise.all([";
  const destructuringNovo =
    "const [\n    variaveisExecucaoResult,\n    variaveisFixasContato,\n    variaveisGlobais,\n    variaveisFixasEmpresa,\n  ] = await Promise.all([";

  if (!engineContent.includes(destructuringAtual)) {
    throw new Error(
      "Não foi possível localizar o carregamento das variáveis da mensagem."
    );
  }

  engineContent = engineContent.replace(
    destructuringAtual,
    destructuringNovo
  );

  const globaisAnchor = `      carregarVariaveisGlobaisEmpresa({
        empresaId,
        chaves,
      }),
    ]);`;
  const globaisComEmpresa = `      carregarVariaveisGlobaisEmpresa({
        empresaId,
        chaves,
      }),

      carregarVariaveisFixasEmpresa({
        empresaId,
        chaves,
      }),
    ]);`;

  if (!engineContent.includes(globaisAnchor)) {
    throw new Error(
      "Não foi possível localizar as variáveis globais da empresa."
    );
  }

  engineContent = engineContent.replace(globaisAnchor, globaisComEmpresa);

  const contatoMapAnchor = `  for (const [chave, valor] of variaveisFixasContato) {
    mapaVariaveis.set(chave, valor);
  }

  for (const variavel of (error ? [] : variaveisExecucao || [])) {`;
  const contatoMapComEmpresa = `  for (const [chave, valor] of variaveisFixasContato) {
    mapaVariaveis.set(chave, valor);
  }

  for (const [chave, valor] of variaveisFixasEmpresa) {
    mapaVariaveis.set(chave, valor);
  }

  for (const variavel of (error ? [] : variaveisExecucao || [])) {`;

  if (!engineContent.includes(contatoMapAnchor)) {
    throw new Error(
      "Não foi possível localizar o mapa de variáveis fixas."
    );
  }

  engineContent = engineContent.replace(
    contatoMapAnchor,
    contatoMapComEmpresa
  );

  const valoresAgendamentoAnchor = `  return {
    agenda_agendamento_id: String(agendamento.id || ""),
    agenda_id: String(agendamento.agenda_id || ""),
    agenda_nome: String(agenda?.nome || agendamento.titulo || ""),`;
  const valoresAgendamentoNovos = `  return {
    agenda_agendamento_id: String(agendamento.id || ""),
    agenda_id: String(agendamento.agenda_id || ""),
    agenda_nome: String(agenda?.nome || agendamento.titulo || ""),
    calendario_id: String(agendamento.agenda_id || agenda?.id || ""),
    calendario_nome: String(agenda?.nome || ""),
    agendamento_titulo: String(agendamento.titulo || ""),`;

  if (!engineContent.includes(valoresAgendamentoAnchor)) {
    throw new Error(
      "Não foi possível localizar as variáveis do agendamento atual."
    );
  }

  engineContent = engineContent.replace(
    valoresAgendamentoAnchor,
    valoresAgendamentoNovos
  );

  const valoresSlotAnchor = `function valoresSlotAgenda(slot: any, agenda: any | null, sufixo = "_nova") {
  return {
    [\`agenda_data\${sufixo}\`]: String(slot.data_label || ""),
    [\`agenda_hora\${sufixo}\`]: String(slot.hora_label || ""),
    [\`agenda_inicio_at\${sufixo}\`]: String(slot.inicio_at || ""),
    [\`agenda_fim_at\${sufixo}\`]: String(slot.fim_at || ""),
    [\`agenda_label\${sufixo}\`]: String(slot.label || ""),
    [\`agenda_nome\${sufixo}\`]: String(agenda?.nome || ""),
  };
}`;
  const valoresSlotNovos = `function valoresSlotAgenda(slot: any, agenda: any | null, sufixo = "_nova") {
  const sufixoCalendario = sufixo === "_nova" ? "_novo" : sufixo;

  return {
    [\`agenda_data\${sufixo}\`]: String(slot.data_label || ""),
    [\`agenda_hora\${sufixo}\`]: String(slot.hora_label || ""),
    [\`agenda_inicio_at\${sufixo}\`]: String(slot.inicio_at || ""),
    [\`agenda_fim_at\${sufixo}\`]: String(slot.fim_at || ""),
    [\`agenda_label\${sufixo}\`]: String(slot.label || ""),
    [\`agenda_nome\${sufixo}\`]: String(agenda?.nome || ""),
    [\`calendario_id\${sufixoCalendario}\`]: String(
      slot.agenda_id || agenda?.id || ""
    ),
    [\`calendario_nome\${sufixoCalendario}\`]: String(agenda?.nome || ""),
  };
}`;

  if (!engineContent.includes(valoresSlotAnchor)) {
    throw new Error(
      "Não foi possível localizar as variáveis do novo calendário."
    );
  }

  engineContent = engineContent.replace(valoresSlotAnchor, valoresSlotNovos);

  fs.writeFileSync(engineAbsolutePath, engineContent, "utf8");
}

console.log(
  "Validações, filtro, ordenação, gatilhos e variáveis dos fluxos do sistema ajustados."
);
