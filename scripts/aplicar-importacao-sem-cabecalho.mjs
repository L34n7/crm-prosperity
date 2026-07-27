import { readFile, writeFile } from "node:fs/promises";

function replaceOnce(source, oldValue, newValue, label) {
  const occurrences = source.split(oldValue).length - 1;

  if (occurrences !== 1) {
    throw new Error(`${label}: esperado 1 trecho, encontrado ${occurrences}`);
  }

  return source.replace(oldValue, newValue);
}

function replaceAllChecked(source, oldValue, newValue, expected, label) {
  const occurrences = source.split(oldValue).length - 1;

  if (occurrences !== expected) {
    throw new Error(`${label}: esperado ${expected} trechos, encontrado ${occurrences}`);
  }

  return source.split(oldValue).join(newValue);
}

async function aplicarImportacaoSemCabecalho() {
  const routePath = "src/app/api/contatos/importar/preview/route.ts";
  let route = await readFile(routePath, "utf8");

  if (route.includes("arquivoSemCabecalho")) {
    console.log("Importação de listas sem cabeçalho já aplicada.");
    return;
  }

  route = replaceOnce(
    route,
    "    const { headers, rows } = await parseSpreadsheetFile(file);",
    "    let { headers, rows } = await parseSpreadsheetFile(file);",
    "permitir ajuste dos cabeçalhos"
  );

  route = replaceOnce(
    route,
    "    const encontrouAlgumaColunaDeTelefone = headers.some((header) =>",
    "    let encontrouAlgumaColunaDeTelefone = headers.some((header) =>",
    "permitir detecção de lista sem cabeçalho"
  );

  const validationAnchor = `    if (!encontrouAlgumaColunaDeTelefone) {
      return NextResponse.json(`;

  const validationBlock = `    let arquivoSemCabecalho = false;

    if (!encontrouAlgumaColunaDeTelefone) {
      const linhasIncluindoPrimeira = [headers, ...rows];
      const indicesComValor = new Set<number>();

      for (const linha of linhasIncluindoPrimeira.slice(0, 100)) {
        linha.forEach((valor, indice) => {
          if (String(valor || "").trim()) {
            indicesComValor.add(indice);
          }
        });
      }

      const indiceColunaUnica =
        indicesComValor.size === 1
          ? (indicesComValor.values().next().value ?? -1)
          : -1;

      if (indiceColunaUnica >= 0) {
        const amostra = linhasIncluindoPrimeira
          .slice(0, 50)
          .map((linha) => String(linha[indiceColunaUnica] || "").trim())
          .filter(Boolean);

        const telefonesValidosNaAmostra = amostra.filter((valor) =>
          telefoneImportacaoValido(
            normalizarTelefoneBrasilParaWhatsApp(valor)
          )
        ).length;

        const percentualValido = amostra.length
          ? telefonesValidosNaAmostra / amostra.length
          : 0;

        if (amostra.length > 0 && percentualValido >= 0.8) {
          headers = ["telefone"];
          rows = linhasIncluindoPrimeira
            .map((linha) => [String(linha[indiceColunaUnica] || "").trim()])
            .filter((linha) => Boolean(linha[0]));
          encontrouAlgumaColunaDeTelefone = true;
          arquivoSemCabecalho = true;
        }
      }
    }

    if (!encontrouAlgumaColunaDeTelefone) {
      return NextResponse.json(`;

  route = replaceOnce(
    route,
    validationAnchor,
    validationBlock,
    "detecção automática de lista de telefones sem cabeçalho"
  );

  route = replaceOnce(
    route,
    "      const linhaReal = index + 2;",
    "      const linhaReal = index + (arquivoSemCabecalho ? 1 : 2);",
    "numeração correta das linhas sem cabeçalho"
  );

  await writeFile(routePath, route, "utf8");
  console.log("Importação de listas de telefone sem cabeçalho aplicada.");
}

async function aplicarPaginaConversas() {
  const pagePath = "src/app/(private)/conversas/page.tsx";
  let page = await readFile(pagePath, "utf8");

  if (page.includes("CLASSIFICACOES_ENCERRAMENTO")) {
    console.log("Classificações do encerramento já aplicadas na página de conversas.");
    return;
  }

  const classificationTypes = `type ClassificacaoEncerramento =
  | "qualificado"
  | "convertido"
  | "perdido";

const CLASSIFICACOES_ENCERRAMENTO: Array<{
  value: ClassificacaoEncerramento;
  label: string;
}> = [
  { value: "qualificado", label: "Qualificado" },
  { value: "convertido", label: "Convertido" },
  { value: "perdido", label: "Perdido" },
];

`;

  page = replaceOnce(
    page,
    "type RastreamentoEventoConversa = {",
    `${classificationTypes}type RastreamentoEventoConversa = {`,
    "tipos de classificação do encerramento"
  );

  page = replaceOnce(
    page,
    `  const [encerramentoTipoEvento, setEncerramentoTipoEvento] =
    useState<RastreamentoEventoTipoManual>("venda_realizada");`,
    `  const [encerramentoTipoEvento, setEncerramentoTipoEvento] =
    useState<ClassificacaoEncerramento>("qualificado");`,
    "estado da classificação do encerramento"
  );

  page = replaceOnce(
    page,
    `    setEncerramentoTipoEvento("venda_realizada");`,
    `    setEncerramentoTipoEvento("qualificado");`,
    "classificação padrão ao abrir encerramento"
  );

  page = replaceAllChecked(
    page,
    "eventoRastreamentoExigeValor(encerramentoTipoEvento)",
    'encerramentoTipoEvento === "convertido"',
    3,
    "valor condicionado à classificação convertida"
  );

  page = replaceAllChecked(
    page,
    "tipo_evento_resultado: encerramentoTipoEvento",
    "classificacao_resultado: encerramentoTipoEvento",
    2,
    "payload padronizado do encerramento"
  );

  const selectAnchor = `                            <label className={styles.actionLabel}>
                              Tipo de evento
                            </label>
                            <select
                              value={encerramentoTipoEvento}
                              onChange={(event) => {
                                const novoTipo = event.target
                                  .value as RastreamentoEventoTipoManual;
                                setEncerramentoTipoEvento(novoTipo);

                                if (!eventoRastreamentoExigeValor(novoTipo)) {
                                  setEncerramentoValor("");
                                }
                              }}
                              className={styles.actionSelect}
                            >
                              {RASTREAMENTO_EVENTOS_MANUAIS.map((evento) => (
                                <option key={evento.value} value={evento.value}>
                                  {evento.label}
                                </option>
                              ))}
                            </select>`;

  const selectBlock = `                            <label className={styles.actionLabel}>
                              Classificação do atendimento
                            </label>
                            <select
                              value={encerramentoTipoEvento}
                              onChange={(event) => {
                                const novaClassificacao = event.target
                                  .value as ClassificacaoEncerramento;
                                setEncerramentoTipoEvento(novaClassificacao);

                                if (novaClassificacao !== "convertido") {
                                  setEncerramentoValor("");
                                }
                              }}
                              className={styles.actionSelect}
                            >
                              {CLASSIFICACOES_ENCERRAMENTO.map((classificacao) => (
                                <option
                                  key={classificacao.value}
                                  value={classificacao.value}
                                >
                                  {classificacao.label}
                                </option>
                              ))}
                            </select>`;

  page = replaceOnce(
    page,
    selectAnchor,
    selectBlock,
    "seletor de classificação no encerramento"
  );

  page = replaceOnce(
    page,
    `                            {eventoRastreamentoExigeValor(
                              encerramentoTipoEvento
                            ) && (`,
    `                            {encerramentoTipoEvento === "convertido" && (`,
    "campo de valor somente para convertido"
  );

  await writeFile(pagePath, page, "utf8");
  console.log("Classificações do encerramento aplicadas na página de conversas.");
}

async function aplicarApiConversas() {
  const routePath = "src/app/api/conversas/[id]/route.ts";
  let route = await readFile(routePath, "utf8");

  if (route.includes("normalizarClassificacaoEncerramento")) {
    console.log("Classificações do encerramento já aplicadas na API de conversas.");
    return;
  }

  route = replaceOnce(
    route,
    `import {
  obterResultadoFluxoEventoManual,
  tipoEventoManualValido,
} from "@/lib/rastreamento/eventos-manuais";
`,
    "",
    "remoção da validação de eventos comerciais no encerramento"
  );

  const helpers = `type ClassificacaoEncerramento =
  | "qualificado"
  | "convertido"
  | "perdido";

const CLASSIFICACOES_ENCERRAMENTO = new Set<ClassificacaoEncerramento>([
  "qualificado",
  "convertido",
  "perdido",
]);

const CLASSIFICACAO_ENCERRAMENTO_LEGADA: Record<
  string,
  ClassificacaoEncerramento
> = {
  novo: "qualificado",
  lead_qualificado: "qualificado",
  venda_realizada: "convertido",
  agendamento_criado: "convertido",
  agendamento_confirmado: "convertido",
  entrada_grupo_confirmada: "convertido",
  pagamento_confirmado: "convertido",
  objetivo_concluido: "convertido",
  venda_perdida: "perdido",
  objetivo_nao_concluido: "perdido",
  sem_interesse: "perdido",
};

function normalizarClassificacaoEncerramento(
  valor: unknown
): ClassificacaoEncerramento | null {
  const normalizado = String(valor || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\\u0300-\\u036f]/g, "")
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_|_$/g, "");

  if (CLASSIFICACOES_ENCERRAMENTO.has(normalizado as ClassificacaoEncerramento)) {
    return normalizado as ClassificacaoEncerramento;
  }

  return CLASSIFICACAO_ENCERRAMENTO_LEGADA[normalizado] || null;
}

function resultadoFluxoPorClassificacaoEncerramento(
  classificacao: ClassificacaoEncerramento
) {
  if (classificacao === "convertido") return "positivo";
  if (classificacao === "perdido") return "negativo";
  return "neutro";
}

function statusLeadPorClassificacaoEncerramento(
  classificacao: ClassificacaoEncerramento
) {
  return classificacao === "convertido" ? "cliente" : classificacao;
}

`;

  route = replaceOnce(
    route,
    "const supabaseAdmin = getSupabaseAdmin();\n\n",
    `const supabaseAdmin = getSupabaseAdmin();\n\n${helpers}`,
    "helpers de classificação do encerramento"
  );

  const resultInputAnchor = `  const tipoEventoResultado =
    String(body?.tipo_evento_resultado || "").trim() || "lead_qualificado";
  const valorResultadoNormalizado = normalizarValorResultado(
    body?.valor_resultado
  );
  const valorEventoResultado =
    tipoEventoResultado === "venda_realizada"
      ? valorResultadoNormalizado
      : null;
  const observacaoResultado =
    String(body?.observacao_resultado || "").trim() || null;`;

  const resultInputBlock = `  const classificacaoResultadoEntrada =
    body?.classificacao_resultado ??
    body?.tipo_evento_resultado ??
    "qualificado";
  const classificacaoResultado = normalizarClassificacaoEncerramento(
    classificacaoResultadoEntrada
  );
  const valorResultadoNormalizado = normalizarValorResultado(
    body?.valor_resultado
  );
  const valorEventoResultado =
    classificacaoResultado === "convertido"
      ? valorResultadoNormalizado
      : null;
  const observacaoResultado =
    String(body?.observacao_resultado || "").trim() || null;`;

  route = replaceOnce(
    route,
    resultInputAnchor,
    resultInputBlock,
    "entrada padronizada da classificação do encerramento"
  );

  const validationAnchor = `  if (
    estaEncerrando &&
    !tipoEventoManualValido(tipoEventoResultado)
  ) {
    return NextResponse.json(
      { ok: false, error: "Tipo de evento do encerramento inválido" },
      { status: 400 }
    );
  }

  if (
    estaEncerrando &&
    tipoEventoResultado === "venda_realizada" &&
    valorEventoResultado === null
  ) {`;

  const validationBlock = `  if (estaEncerrando && !classificacaoResultado) {
    return NextResponse.json(
      { ok: false, error: "Classificação do encerramento inválida" },
      { status: 400 }
    );
  }

  if (
    estaEncerrando &&
    classificacaoResultado === "convertido" &&
    valorEventoResultado === null
  ) {`;

  route = replaceOnce(
    route,
    validationAnchor,
    validationBlock,
    "validação da classificação do encerramento"
  );

  const eventAnchor = `    const { error: eventoResultadoError } = await supabaseAdmin.rpc(
      "rastreamento_criar_evento",
      {
        p_empresa_id: empresa_id,
        p_tipo: tipoEventoResultado,
        p_contato_id: contato_id,
        p_conversa_id: id,
        p_valor: valorEventoResultado,
        p_origem_registro: "manual",
        p_idempotency_key: \`protocolo:\${protocoloEncerrado.id}:resultado_encerramento\`,
        p_metadata_json: {
          origem_interface: "conversas",
          conversa_protocolo_id: protocoloEncerrado.id,
          protocolo: protocoloEncerrado.protocolo,
          observacao: observacaoResultado,
          resultado_fluxo:
            obterResultadoFluxoEventoManual(tipoEventoResultado),
          finalizado_por_tipo: "atendente",
          finalizado_por_usuario_id: usuario.id,
          automacao_interrompida: parandoAutomacaoEEncerrando,
        },
        p_created_by: usuario.id,
      }
    );

    if (eventoResultadoError) {
      return NextResponse.json(
        { ok: false, error: eventoResultadoError.message },
        { status: 500 }
      );
    }`;

  const eventBlock = `    if (!classificacaoResultado) {
      return NextResponse.json(
        { ok: false, error: "Classificação do encerramento inválida" },
        { status: 400 }
      );
    }

    const idempotencyKeyEncerramento =
      \`protocolo:\${protocoloEncerrado.id}:encerramento:encerrado_manual\`;
    const metadataResultado = {
      origem_interface: "conversas",
      conversa_protocolo_id: protocoloEncerrado.id,
      protocolo: protocoloEncerrado.protocolo,
      observacao: observacaoResultado,
      resultado: classificacaoResultado,
      resultado_fluxo:
        resultadoFluxoPorClassificacaoEncerramento(classificacaoResultado),
      finalizado_por_tipo: "atendente",
      finalizado_por_usuario_id: usuario.id,
      automacao_interrompida: parandoAutomacaoEEncerrando,
    };

    const { data: eventoEncerramento, error: eventoBuscaError } =
      await supabaseAdmin
        .from("rastreamento_eventos")
        .select("id, metadata_json")
        .eq("empresa_id", empresa_id)
        .eq("idempotency_key", idempotencyKeyEncerramento)
        .maybeSingle();

    if (eventoBuscaError) {
      return NextResponse.json(
        { ok: false, error: eventoBuscaError.message },
        { status: 500 }
      );
    }

    let eventoResultadoId = eventoEncerramento?.id || null;

    if (eventoEncerramento) {
      const { data: eventoAtualizado, error: eventoAtualizacaoError } =
        await supabaseAdmin
          .from("rastreamento_eventos")
          .update({
            valor: valorEventoResultado,
            origem_registro: "manual",
            metadata_json: {
              ...(eventoEncerramento.metadata_json || {}),
              ...metadataResultado,
            },
            created_by: usuario.id,
          })
          .eq("empresa_id", empresa_id)
          .eq("id", eventoEncerramento.id)
          .select("id")
          .single();

      if (eventoAtualizacaoError) {
        return NextResponse.json(
          { ok: false, error: eventoAtualizacaoError.message },
          { status: 500 }
        );
      }

      eventoResultadoId = eventoAtualizado.id;
    } else {
      const { error: eventoCriacaoError } = await supabaseAdmin.rpc(
        "rastreamento_criar_evento",
        {
          p_empresa_id: empresa_id,
          p_tipo: "conversa_encerrada_manual",
          p_contato_id: contato_id,
          p_conversa_id: id,
          p_valor: valorEventoResultado,
          p_origem_registro: "manual",
          p_idempotency_key: idempotencyKeyEncerramento,
          p_metadata_json: metadataResultado,
          p_created_by: usuario.id,
        }
      );

      if (eventoCriacaoError) {
        return NextResponse.json(
          { ok: false, error: eventoCriacaoError.message },
          { status: 500 }
        );
      }

      const { data: eventoCriado, error: eventoCriadoBuscaError } =
        await supabaseAdmin
          .from("rastreamento_eventos")
          .select("id")
          .eq("empresa_id", empresa_id)
          .eq("idempotency_key", idempotencyKeyEncerramento)
          .maybeSingle();

      if (eventoCriadoBuscaError) {
        return NextResponse.json(
          { ok: false, error: eventoCriadoBuscaError.message },
          { status: 500 }
        );
      }

      eventoResultadoId = eventoCriado?.id || null;
    }

    const { error: classificacaoContatoError } = await supabaseAdmin
      .from("contatos")
      .update({
        classificacao: classificacaoResultado,
        status_lead:
          statusLeadPorClassificacaoEncerramento(classificacaoResultado),
        classificacao_atualizada_em: encerradoEm,
        classificacao_evento_id: eventoResultadoId,
        classificacao_protocolo_id: protocoloEncerrado.id,
        updated_at: encerradoEm,
      })
      .eq("empresa_id", empresa_id)
      .eq("id", contato_id);

    if (classificacaoContatoError) {
      return NextResponse.json(
        { ok: false, error: classificacaoContatoError.message },
        { status: 500 }
      );
    }`;

  route = replaceOnce(
    route,
    eventAnchor,
    eventBlock,
    "atualização do evento único de encerramento"
  );

  route = replaceOnce(
    route,
    "      tipo_evento_resultado: estaEncerrando ? tipoEventoResultado : null,",
    "      classificacao_resultado: estaEncerrando ? classificacaoResultado : null,",
    "auditoria da classificação do encerramento"
  );

  if (route.includes("tipoEventoResultado")) {
    throw new Error(
      "padronização da API incompleta: ainda existe referência a tipoEventoResultado"
    );
  }

  await writeFile(routePath, route, "utf8");
  console.log("Classificações do encerramento aplicadas na API de conversas.");
}

async function aplicarClassificacaoCentral() {
  const classificationPath = "src/lib/leads/classificacao.ts";
  let classification = await readFile(classificationPath, "utf8");

  if (classification.includes("CLASSIFICACOES_COMERCIAIS")) {
    console.log("Classificação comercial central já padronizada.");
    return;
  }

  classification = replaceOnce(
    classification,
    `import { getSupabaseAdmin } from "@/lib/supabase/admin";

`,
    `import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const CLASSIFICACOES_COMERCIAIS = [
  "qualificado",
  "convertido",
  "perdido",
] as const;

`,
    "classificações comerciais oficiais"
  );

  classification = replaceOnce(
    classification,
    `const CLASSIFICACAO_LEGADA_MAP: Record<string, ClassificacaoLead> = {
  cliente: "convertido",`,
    `const CLASSIFICACAO_LEGADA_MAP: Record<string, ClassificacaoLead> = {
  novo: "qualificado",
  cliente: "convertido",`,
    "mapeamento legado da classificação novo"
  );

  classification = replaceOnce(
    classification,
    `  fallback: ClassificacaoLead = "novo"`,
    `  fallback: ClassificacaoLead = "qualificado"`,
    "fallback qualificado"
  );

  classification = replaceOnce(
    classification,
    `  if (CLASSIFICACOES_SET.has(normalizado)) {
    return normalizado as ClassificacaoLead;
  }`,
    `  if (normalizado === "novo") {
    return "qualificado";
  }

  if (CLASSIFICACOES_SET.has(normalizado)) {
    return normalizado as ClassificacaoLead;
  }`,
    "normalização de novo para qualificado"
  );

  classification = replaceOnce(
    classification,
    `  return classificacao === "convertido" ? "cliente" : classificacao;`,
    `  if (classificacao === "convertido") return "cliente";
  if (classificacao === "novo") return "qualificado";
  return classificacao;`,
    "sincronização do status legado"
  );

  classification = replaceOnce(
    classification,
    `  if (
    [
      "lead_criado",
    ].includes(tipoNormalizado)
  ) {
    return "novo";
  }`,
    `  if (tipoNormalizado === "lead_criado") {
    return "qualificado";
  }`,
    "lead criado classificado como qualificado"
  );

  await writeFile(classificationPath, classification, "utf8");
  console.log("Classificação comercial central padronizada.");
}

await aplicarImportacaoSemCabecalho();
await aplicarPaginaConversas();
await aplicarApiConversas();
await aplicarClassificacaoCentral();
