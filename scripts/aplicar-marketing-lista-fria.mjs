import { readFile, writeFile } from "node:fs/promises";

const disparosPagePath =
  "src/app/(private)/disparos-whatsapp/page.tsx";
const politicaListaPath =
  "src/lib/whatsapp/disparo-politica-lista.ts";
const disparosRoutePath =
  "src/app/api/whatsapp/disparos/route.ts";
const disparosAgendadosRoutePath =
  "src/app/api/disparos-agendados/criar/route.ts";

function replaceOnce(source, oldValue, newValue, label) {
  const occurrences = source.split(oldValue).length - 1;
  if (occurrences !== 1) {
    throw new Error(`${label}: esperado 1 trecho, encontrado ${occurrences}`);
  }
  return source.replace(oldValue, newValue);
}

function replaceAllRequired(source, oldValue, newValue, label, expected = null) {
  const occurrences = source.split(oldValue).length - 1;
  if (occurrences === 0) {
    throw new Error(`${label}: trecho não encontrado`);
  }
  if (expected !== null && occurrences !== expected) {
    throw new Error(
      `${label}: esperado ${expected} trecho(s), encontrado ${occurrences}`
    );
  }
  return source.split(oldValue).join(newValue);
}

async function ajustarPaginaDisparos() {
  let source = await readFile(disparosPagePath, "utf8");
  if (source.includes("const templateComListaFria =")) return;

  source = replaceOnce(
    source,
    `  const marketingComListaFria =
    categoriaTemplateSelecionado === "marketing" && temContatosListaFria;
  const utilityComListaFria =
    categoriaTemplateSelecionado === "utility" && temContatosListaFria;
  const utilityListaFriaSemOptOut =
    utilityComListaFria &&
    templateSelecionado?.opt_out_habilitado !== true;`,
    `  const marketingComListaFria =
    categoriaTemplateSelecionado === "marketing" && temContatosListaFria;
  const utilityComListaFria =
    categoriaTemplateSelecionado === "utility" && temContatosListaFria;
  const templateComListaFria =
    marketingComListaFria || utilityComListaFria;
  const listaFriaSemOptOut =
    templateComListaFria &&
    templateSelecionado?.opt_out_habilitado !== true;`,
    "classificação da lista fria por categoria"
  );

  source = replaceAllRequired(
    source,
    `    if (marketingComListaFria) {
      setErro(
        "Templates de marketing não podem ser enviados para contatos de lista fria. Remova os contatos sem opt-in para continuar."
      );
      return;
    }

`,
    "",
    "remoção do bloqueio absoluto de marketing",
    2
  );

  source = replaceAllRequired(
    source,
    "utilityListaFriaSemOptOut",
    "listaFriaSemOptOut",
    "validação de opt-out para lista fria"
  );

  source = replaceAllRequired(
    source,
    `"Este template utility não possui o rodapé de opt-out. Recrie o template com a instrução para responder SAIR."`,
    `"Este template não possui o rodapé de opt-out necessário para envio à lista fria. Recrie o template com a instrução para responder SAIR."`,
    "mensagem de template sem opt-out",
    2
  );

  source = replaceOnce(
    source,
    `    if (utilityComListaFria) {
      setConfirmacaoResponsabilidadeListaFria(false);
      setModalResponsabilidadeListaFriaAberto(true);
      return;
    }`,
    `    if (templateComListaFria) {
      setConfirmacaoResponsabilidadeListaFria(false);
      setModalResponsabilidadeListaFriaAberto(true);
      return;
    }`,
    "abertura do consentimento para lista fria"
  );

  source = replaceOnce(
    source,
    `    if (!confirmacaoResponsabilidadeListaFria || !utilityComListaFria) return;`,
    `    if (!confirmacaoResponsabilidadeListaFria || !templateComListaFria) return;`,
    "confirmação de responsabilidade para marketing e utility"
  );

  source = replaceAllRequired(
    source,
    `              utilityComListaFria &&
              confirmacaoResponsabilidadeListaFria`,
    `              templateComListaFria &&
              confirmacaoResponsabilidadeListaFria`,
    "envio da confirmação ao backend"
  );

  source = replaceAllRequired(
    source,
    `                        marketingComListaFria ||
`,
    "",
    "liberação do botão para marketing com lista fria",
    1
  );

  source = replaceAllRequired(
    source,
    `                        : marketingComListaFria
                        ? "Marketing bloqueado"
`,
    "",
    "rótulo de bloqueio de marketing",
    1
  );

  const modalStart = source.indexOf(
    "      {modalResponsabilidadeListaFriaAberto &&"
  );
  const modalEndMarker = "        )}\n    </>\n";
  const modalEndMarkerIndex = source.indexOf(modalEndMarker, modalStart);

  if (modalStart < 0 || modalEndMarkerIndex < 0) {
    throw new Error("modal de responsabilidade da lista fria não encontrado");
  }

  const modalEnd = modalEndMarkerIndex + "        )}\n".length;
  const novoModal = `      {modalResponsabilidadeListaFriaAberto &&
        podeDisparar &&
        templateComListaFria && (
          <div
            className={styles.modalOverlay}
            onClick={() => {
              setModalResponsabilidadeListaFriaAberto(false);
              setConfirmacaoResponsabilidadeListaFria(false);
            }}
          >
            <div
              className={styles.modalConfirmacao}
              role="dialog"
              aria-modal="true"
              aria-labelledby="responsabilidade-lista-fria-titulo"
              onClick={(e) => e.stopPropagation()}
            >
              <div className={styles.modalHeader}>
                <div>
                  <p className={styles.modalEyebrow}>Lista fria</p>
                  <h3
                    id="responsabilidade-lista-fria-titulo"
                    className={styles.modalTitle}
                  >
                    Confirmar responsabilidade pelo envio
                  </h3>
                  <p className={styles.modalSubtitle}>
                    O template{" "}
                    {marketingComListaFria ? "marketing" : "utility"} será
                    enviado para {totalContatosListaFria} contato(s) sem
                    opt-in registrado.
                  </p>
                </div>

                <button
                  type="button"
                  className={styles.modalClose}
                  aria-label="Fechar"
                  onClick={() => {
                    setModalResponsabilidadeListaFriaAberto(false);
                    setConfirmacaoResponsabilidadeListaFria(false);
                  }}
                >
                  ×
                </button>
              </div>

              <div className={styles.modalBody}>
                <div className={styles.modalRiskAlert}>
                  <strong>
                    Este envio possui risco para a conta WhatsApp.
                  </strong>
                  {marketingComListaFria ? (
                    <p>
                      Mensagens de marketing para contatos sem opt-in podem
                      gerar bloqueios, denúncias, redução da qualidade do
                      número, limitação de envios ou banimento pela Meta.
                      Utilize somente uma base obtida legalmente e mantenha uma
                      instrução clara de opt-out.
                    </p>
                  ) : (
                    <p>
                      Templates utility devem conter somente informações
                      transacionais ou de serviço solicitadas pelo contato.
                      Usar esse tipo de template para promoção, prospecção ou
                      conteúdo de marketing pode causar denúncias, redução da
                      qualidade, limitação ou banimento pela Meta.
                    </p>
                  )}
                </div>

                <div className={styles.modalSection}>
                  <h4 className={styles.modalSectionTitle}>
                    Ao continuar, você declara que:
                  </h4>
                  <ul className={styles.modalList}>
                    <li>
                      {marketingComListaFria
                        ? "revisou o conteúdo, a origem da lista e a finalidade comercial deste envio;"
                        : "revisou o conteúdo e confirma que ele é realmente utility, sem oferta ou promoção;"}
                    </li>
                    <li>
                      possui base legal e autorização adequadas para contatar
                      os destinatários;
                    </li>
                    <li>
                      disponibiliza opt-out e respeitará imediatamente os
                      pedidos para não receber novas mensagens;
                    </li>
                    <li>
                      assume a responsabilidade por bloqueios, denúncias,
                      limitações ou banimento aplicados pela Meta.
                    </li>
                  </ul>
                </div>

                <label className={styles.modalCheckbox}>
                  <input
                    type="checkbox"
                    checked={confirmacaoResponsabilidadeListaFria}
                    onChange={(e) =>
                      setConfirmacaoResponsabilidadeListaFria(e.target.checked)
                    }
                  />
                  <span>
                    Li e compreendi os riscos. Confirmo que possuo base legal
                    para este contato e assumo integralmente a responsabilidade
                    pelo envio do template{" "}
                    {marketingComListaFria ? "marketing" : "utility"} à lista
                    fria.
                  </span>
                </label>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => {
                    setModalResponsabilidadeListaFriaAberto(false);
                    setConfirmacaoResponsabilidadeListaFria(false);
                  }}
                >
                  Voltar
                </button>

                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={confirmarResponsabilidadeEDisparar}
                  disabled={
                    !confirmacaoResponsabilidadeListaFria || disparando
                  }
                >
                  {disparando
                    ? "Processando..."
                    : agendarDisparo
                    ? "Assumir e agendar"
                    : "Assumir e enviar"}
                </button>
              </div>
            </div>
          </div>
        )}
`;

  source = source.slice(0, modalStart) + novoModal + source.slice(modalEnd);
  await writeFile(disparosPagePath, source, "utf8");
}

async function ajustarPoliticaListaFria() {
  let source = await readFile(politicaListaPath, "utf8");
  if (
    source.includes(
      '(categoria === "marketing" || categoria === "utility") &&'
    )
  ) {
    return;
  }

  const start = source.indexOf('  if (categoria === "marketing") {');
  const end = source.indexOf(
    "  return { ok: true as const, categoria, totalContatosFrios };",
    start
  );

  if (start < 0 || end < 0) {
    throw new Error("regra de política da lista fria não encontrada");
  }

  const novaRegra = `  if (
    (categoria === "marketing" || categoria === "utility") &&
    !params.responsabilidadeListaFriaConfirmada
  ) {
    return {
      ok: false as const,
      categoria,
      totalContatosFrios,
      status: 428,
      code: CODIGO_CONFIRMACAO_LISTA_FRIA_OBRIGATORIA,
      error:
        \`Confirme a responsabilidade pelo envio de template \${categoria} para contatos de lista fria.\`,
    };
  }

`;

  source = source.slice(0, start) + novaRegra + source.slice(end);
  await writeFile(politicaListaPath, source, "utf8");
}

async function ajustarRotaDisparo(path, label) {
  let source = await readFile(path, "utf8");
  if (
    source.includes(
      '["utility", "marketing"].includes(politicaLista.categoria)'
    )
  ) {
    return;
  }

  source = replaceAllRequired(
    source,
    'politicaLista.categoria === "utility" &&',
    '["utility", "marketing"].includes(politicaLista.categoria) &&',
    `categoria permitida em ${label}`
  );

  source = source
    .replaceAll(
      "Templates utility enviados para lista fria precisam conter o rodape de opt-out. Recrie o template com a instrucao para responder SAIR.",
      "Templates enviados para lista fria precisam conter o rodape de opt-out. Recrie o template com a instrucao para responder SAIR."
    )
    .replaceAll(
      "Templates utility enviados para lista fria precisam conter o rodapé de opt-out. Recrie o template com a instrução para responder SAIR.",
      "Templates enviados para lista fria precisam conter o rodapé de opt-out. Recrie o template com a instrução para responder SAIR."
    );

  await writeFile(path, source, "utf8");
}

await ajustarPaginaDisparos();
await ajustarPoliticaListaFria();
await ajustarRotaDisparo(disparosRoutePath, "disparo imediato");
await ajustarRotaDisparo(
  disparosAgendadosRoutePath,
  "disparo agendado"
);

console.log(
  "Marketing para lista fria liberado com consentimento e opt-out obrigatório."
);
