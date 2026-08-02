import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function write(relativePath, content) {
  fs.writeFileSync(path.join(root, relativePath), content, "utf8");
}

function replaceRequired(content, current, replacement, description) {
  if (content.includes(replacement)) return content;

  if (!content.includes(current)) {
    throw new Error(`Não foi possível aplicar: ${description}.`);
  }

  return content.replace(current, replacement);
}

function transformSection(content, startMarker, endMarker, transform, description) {
  const start = content.indexOf(startMarker);
  const end = content.indexOf(endMarker, start + startMarker.length);

  if (start < 0 || end < 0) {
    throw new Error(`Não foi possível localizar: ${description}.`);
  }

  const section = content.slice(start, end);
  const transformed = transform(section);

  if (section === transformed) {
    throw new Error(`Nenhuma alteração foi aplicada em: ${description}.`);
  }

  return content.slice(0, start) + transformed + content.slice(end);
}

function patchAutomacoesApi() {
  const relativePath = "src/app/api/automacoes/route.ts";
  let content = read(relativePath);

  const helperMarker = "CRM_PROTECTED_SYSTEM_FLOW_ACTIONS_V1";

  if (!content.includes(helperMarker)) {
    content = replaceRequired(
      content,
      "async function fluxoPossuiGatilhoAtivo(params: {",
      `// ${helperMarker}
function fluxoEhSistemaProtegido(configuracao: unknown) {
  const config = configuracaoComoObjeto(configuracao);

  return (
    configuracaoMarcada(config.fluxo_sistema_calendario) &&
    configuracaoMarcada(config.protegido_sistema)
  );
}

function respostaAcaoFluxoSistemaProtegido() {
  return NextResponse.json(
    {
      ok: false,
      code: "FLUXO_SISTEMA_PROTEGIDO",
      error:
        "Fluxos fixos do sistema não podem ser pausados, arquivados ou excluídos.",
    },
    { status: 403 }
  );
}

async function fluxoPossuiGatilhoAtivo(params: {`,
      "funções de proteção dos fluxos fixos"
    );
  }

  const optionalTriggerMarker =
    "CRM_SYSTEM_FLOW_OPTIONAL_TRIGGER_EDIT_VALIDATION_V1";

  if (!content.includes(optionalTriggerMarker)) {
    const current = `    if (statusFinal === "ativo" && !fluxoPadraoFinal) {
      const possuiGatilhoAtivo = await fluxoPossuiGatilhoAtivo({
        empresaId: usuario.empresa_id,
        fluxoId: id,
      });

      if (!possuiGatilhoAtivo) {
        return respostaFluxoAtivoSemGatilho();
      }
    }`;

    const replacement = `    const fluxoSistemaCalendario = fluxoEhSistemaProtegido(
      fluxoAntes.configuracao_json
    );

    // ${optionalTriggerMarker}
    if (
      statusFinal === "ativo" &&
      !fluxoPadraoFinal &&
      !fluxoSistemaCalendario
    ) {
      const possuiGatilhoAtivo = await fluxoPossuiGatilhoAtivo({
        empresaId: usuario.empresa_id,
        fluxoId: id,
      });

      if (!possuiGatilhoAtivo) {
        return respostaFluxoAtivoSemGatilho();
      }
    }`;

    content = replaceRequired(
      content,
      current,
      replacement,
      "gatilhos opcionais na edição dos fluxos fixos"
    );
  }

  const statusProtectionMarker = "CRM_PROTECTED_SYSTEM_FLOW_STATUS_V1";

  if (!content.includes(statusProtectionMarker)) {
    content = transformSection(
      content,
      "export async function PATCH(req: NextRequest)",
      "export async function DELETE(req: NextRequest)",
      (section) =>
        replaceRequired(
          section,
          "    const configuracaoFinal =",
          `    // ${statusProtectionMarker}
    if (
      fluxoEhSistemaProtegido(fluxoAntes.configuracao_json) &&
      body?.status !== undefined &&
      ["pausado", "rascunho", "arquivado"].includes(
        String(body.status || "").trim()
      )
    ) {
      return respostaAcaoFluxoSistemaProtegido();
    }

    const configuracaoFinal =`,
          "bloqueio de pausa dos fluxos fixos"
        ),
      "seção PATCH da API de fluxos"
    );
  }

  const deleteProtectionMarker = "CRM_PROTECTED_SYSTEM_FLOW_DELETE_V1";

  if (!content.includes(deleteProtectionMarker)) {
    content = transformSection(
      content,
      "export async function DELETE(req: NextRequest)",
      "async function desvincularAgendamentosDoFluxo",
      (section) =>
        replaceRequired(
          section,
          "    if (definitivo) {",
          `    // ${deleteProtectionMarker}
    const { data: fluxoProtegidoAcao, error: fluxoProtegidoAcaoError } =
      await supabaseAdmin
        .from("automacao_fluxos")
        .select("id, configuracao_json")
        .eq("id", id)
        .eq("empresa_id", usuario.empresa_id)
        .maybeSingle();

    if (fluxoProtegidoAcaoError) {
      return NextResponse.json(
        {
          ok: false,
          error: `Erro ao validar a proteção do fluxo: ${fluxoProtegidoAcaoError.message}`,
        },
        { status: 500 }
      );
    }

    if (
      fluxoProtegidoAcao &&
      fluxoEhSistemaProtegido(fluxoProtegidoAcao.configuracao_json)
    ) {
      return respostaAcaoFluxoSistemaProtegido();
    }

    if (definitivo) {`,
          "bloqueio de arquivamento e exclusão dos fluxos fixos"
        ),
      "seção DELETE da API de fluxos"
    );
  }

  write(relativePath, content);
}

function patchFluxosEditor() {
  const relativePath = "src/app/(private)/fluxos/page.tsx";
  let content = read(relativePath);

  const badgeMarker = "CRM_SYSTEM_FLOW_STRONG_BADGE_V1";

  if (!content.includes(badgeMarker)) {
    content = replaceRequired(
      content,
      `<span className={\`\${styles.badge} \${styles.badgeBlue}\`}>
                          🔒 fluxo do sistema
                        </span>`,
      `<span
                          className={\`\${styles.badge} \${styles.systemFlowBadge}\`}
                          data-system-flow-badge="${badgeMarker}"
                        >
                          🔒 FLUXO DO SISTEMA
                        </span>`,
      "badge do sistema na lista de fluxos"
    );

    content = replaceRequired(
      content,
      `<span className={\`\${styles.badge} \${styles.badgeBlue}\`}>
                🔒 fluxo fixo do sistema
              </span>`,
      `<span
                className={\`\${styles.badge} \${styles.systemFlowBadge}\`}
                data-system-flow-badge="${badgeMarker}"
              >
                🔒 FLUXO DO SISTEMA
              </span>`,
      "badge do sistema no cabeçalho"
    );
  }

  const clientProtectionMarker = "CRM_PROTECTED_SYSTEM_FLOW_EDITOR_V1";

  if (!content.includes(clientProtectionMarker)) {
    content = replaceRequired(
      content,
      `async function alterarStatusFluxo(
  fluxo: Fluxo,
  novoStatus: "ativo" | "rascunho" | "pausado"
) {
  try {`,
      `async function alterarStatusFluxo(
  fluxo: Fluxo,
  novoStatus: "ativo" | "rascunho" | "pausado"
) {
  // ${clientProtectionMarker}
  if (fluxoEhSistemaCalendario(fluxo) && novoStatus !== "ativo") {
    setErro("Fluxos fixos do sistema não podem ser pausados.");
    return;
  }

  try {`,
      "proteção da pausa no editor"
    );

    content = replaceRequired(
      content,
      `function abrirModalArquivarFluxo(fluxo: Fluxo) {
  setFluxoParaArquivar(fluxo);`,
      `function abrirModalArquivarFluxo(fluxo: Fluxo) {
  if (fluxoEhSistemaCalendario(fluxo)) {
    setErro("Fluxos fixos do sistema não podem ser arquivados.");
    return;
  }

  setFluxoParaArquivar(fluxo);`,
      "proteção do arquivamento no editor"
    );

    content = replaceRequired(
      content,
      `function abrirModalApagarDefinitivo(fluxo: Fluxo) {
  if (apagandoFluxoDefinitivoRef.current) return;`,
      `function abrirModalApagarDefinitivo(fluxo: Fluxo) {
  if (fluxoEhSistemaCalendario(fluxo)) {
    setErro("Fluxos fixos do sistema não podem ser excluídos.");
    return;
  }

  if (apagandoFluxoDefinitivoRef.current) return;`,
      "proteção da exclusão definitiva no editor"
    );

    const headerActionsCurrent = `                      <button
                        type="button"
                        className={styles.headerDropdownItem}
                        onClick={() => {
                          setMenuHeaderAberto(false);
                          alterarStatusFluxo(
                            fluxoSelecionado,
                            fluxoSelecionado.status === "ativo" ? "pausado" : "ativo"
                          );
                        }}
                      >
                        {fluxoSelecionado.status === "ativo"
                          ? "Pausar fluxo"
                          : "Ativar fluxo"}
                      </button>

                      <button
                        type="button"
                        className={\`\${styles.headerDropdownItem} \${styles.headerDropdownDanger}\`}
                        onClick={() => {
                          setMenuHeaderAberto(false);
                          abrirModalArquivarFluxo(fluxoSelecionado);
                        }}
                      >
                        Apagar fluxo
                      </button>`;

    const headerActionsReplacement = `                      {!fluxoEhSistemaCalendario(fluxoSelecionado) && (
                        <>
                          <button
                            type="button"
                            className={styles.headerDropdownItem}
                            onClick={() => {
                              setMenuHeaderAberto(false);
                              alterarStatusFluxo(
                                fluxoSelecionado,
                                fluxoSelecionado.status === "ativo" ? "pausado" : "ativo"
                              );
                            }}
                          >
                            {fluxoSelecionado.status === "ativo"
                              ? "Pausar fluxo"
                              : "Ativar fluxo"}
                          </button>

                          <button
                            type="button"
                            className={\`\${styles.headerDropdownItem} \${styles.headerDropdownDanger}\`}
                            onClick={() => {
                              setMenuHeaderAberto(false);
                              abrirModalArquivarFluxo(fluxoSelecionado);
                            }}
                          >
                            Apagar fluxo
                          </button>
                        </>
                      )}`;

    content = replaceRequired(
      content,
      headerActionsCurrent,
      headerActionsReplacement,
      "remoção das ações protegidas no menu do cabeçalho"
    );

    const sidebarPauseCurrent = `                <button
                  className={styles.flowDropdownItem}
                  onClick={() => {
                    alterarStatusFluxo(
                      menuFluxo.fluxo!,
                      menuFluxo.fluxo!.status === "ativo" ? "pausado" : "ativo"
                    );
                    setMenuFluxo(null);
                  }}
                >
                  {menuFluxo.fluxo.status === "ativo" ? "Pausar" : "Ativar"}
                </button>`;

    const sidebarPauseReplacement = `                {!fluxoEhSistemaCalendario(menuFluxo.fluxo) && (
                  <button
                    className={styles.flowDropdownItem}
                    onClick={() => {
                      alterarStatusFluxo(
                        menuFluxo.fluxo!,
                        menuFluxo.fluxo!.status === "ativo" ? "pausado" : "ativo"
                      );
                      setMenuFluxo(null);
                    }}
                  >
                    {menuFluxo.fluxo.status === "ativo" ? "Pausar" : "Ativar"}
                  </button>
                )}`;

    content = replaceRequired(
      content,
      sidebarPauseCurrent,
      sidebarPauseReplacement,
      "remoção da pausa no menu lateral"
    );

    const sidebarArchiveCurrent = `                <button
                  className={\`\${styles.flowDropdownItem} \${styles.flowDropdownDanger}\`}
                  onClick={() => {
                    abrirModalArquivarFluxo(menuFluxo.fluxo!);
                    setMenuFluxo(null);
                  }}
                >
                  Apagar
                </button>`;

    const sidebarArchiveReplacement = `                {!fluxoEhSistemaCalendario(menuFluxo.fluxo) && (
                  <button
                    className={\`\${styles.flowDropdownItem} \${styles.flowDropdownDanger}\`}
                    onClick={() => {
                      abrirModalArquivarFluxo(menuFluxo.fluxo!);
                      setMenuFluxo(null);
                    }}
                  >
                    Apagar
                  </button>
                )}`;

    content = replaceRequired(
      content,
      sidebarArchiveCurrent,
      sidebarArchiveReplacement,
      "remoção do arquivamento no menu lateral"
    );

    const archivedHeaderDeleteCurrent = `                  <button
                    type="button"
                    className={styles.dangerButton}
                    onClick={() => abrirModalApagarDefinitivo(fluxoSelecionado)}
                  >
                    Apagar definitivo
                  </button>`;

    const archivedHeaderDeleteReplacement = `                  {!fluxoEhSistemaCalendario(fluxoSelecionado) && (
                    <button
                      type="button"
                      className={styles.dangerButton}
                      onClick={() => abrirModalApagarDefinitivo(fluxoSelecionado)}
                    >
                      Apagar definitivo
                    </button>
                  )}`;

    content = replaceRequired(
      content,
      archivedHeaderDeleteCurrent,
      archivedHeaderDeleteReplacement,
      "proteção visual da exclusão definitiva no cabeçalho"
    );

    const archivedSidebarDeleteCurrent = `                <button
                  className={\`\${styles.flowDropdownItem} \${styles.flowDropdownDanger}\`}
                  onClick={() => {
                    abrirModalApagarDefinitivo(menuFluxo.fluxo!);
                    setMenuFluxo(null);
                  }}
                >
                  Apagar definitivo
                </button>`;

    const archivedSidebarDeleteReplacement = `                {!fluxoEhSistemaCalendario(menuFluxo.fluxo) && (
                  <button
                    className={\`\${styles.flowDropdownItem} \${styles.flowDropdownDanger}\`}
                    onClick={() => {
                      abrirModalApagarDefinitivo(menuFluxo.fluxo!);
                      setMenuFluxo(null);
                    }}
                  >
                    Apagar definitivo
                  </button>
                )}`;

    content = replaceRequired(
      content,
      archivedSidebarDeleteCurrent,
      archivedSidebarDeleteReplacement,
      "proteção visual da exclusão definitiva no menu lateral"
    );
  }

  const modalErrorsMarker = "CRM_MODAL_TRIGGER_ERRORS_V1";

  if (!content.includes(modalErrorsMarker)) {
    content = transformSection(
      content,
      "async function removerGatilhoFluxo(gatilhoId: string)",
      "async function alternarGatilhoFluxo(gatilho: GatilhoFluxo)",
      (section) => {
        let next = section.replace(
          `  try {
    setErro("");
    setSucesso("");`,
          `  // ${modalErrorsMarker}
  try {
    setErroEdicaoFluxo("");
    setSucesso("");`
        );

        next = next.replace(
          `    setErro(error?.message || "Erro ao remover gatilho.");`,
          `    setErroEdicaoFluxo(
      error?.message || "Erro ao remover gatilho."
    );`
        );

        return next;
      },
      "tratamento de erro ao remover gatilho"
    );

    content = transformSection(
      content,
      "async function alternarGatilhoFluxo(gatilho: GatilhoFluxo)",
      "function adicionarGatilhoNovoFluxo",
      (section) => {
        let next = section.replace(
          `  try {
    setErro("");
    setSucesso("");`,
          `  try {
    setErroEdicaoFluxo("");
    setSucesso("");`
        );

        next = next.replace(
          `    setErro(error?.message || "Erro ao atualizar gatilho.");`,
          `    setErroEdicaoFluxo(
      error?.message || "Erro ao atualizar gatilho."
    );`
        );

        return next;
      },
      "tratamento de erro ao atualizar gatilho"
    );
  }

  write(relativePath, content);
}

function patchFluxosStyles() {
  const relativePath = "src/app/(private)/fluxos/fluxos.module.css";
  let content = read(relativePath);
  const marker = "CRM_SYSTEM_FLOW_STRONG_BADGE_STYLE_V1";

  if (!content.includes(marker)) {
    content = replaceRequired(
      content,
      ".flowBadges {",
      `/* ${marker} */
.systemFlowBadge {
  background: var(--crm-surface-soft);
  color: var(--crm-text-strong);
  border-color: var(--crm-border-strong);
  font-family: Impact, "Arial Black", "Arial Narrow", sans-serif;
  font-size: 10px;
  font-weight: 900;
  font-style: italic;
  letter-spacing: 0.045em;
  line-height: 1;
  text-transform: uppercase;
}

.flowBadges {`,
      "estilo Strong do badge dos fluxos fixos"
    );
  }

  write(relativePath, content);
}

patchAutomacoesApi();
patchFluxosEditor();
patchFluxosStyles();

console.log(
  "Fluxos fixos protegidos, badge atualizado e erros de gatilho direcionados ao modal."
);
