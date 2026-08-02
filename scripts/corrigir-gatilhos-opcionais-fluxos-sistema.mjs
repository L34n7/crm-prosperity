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

function patchApi() {
  const relativePath = "src/app/api/automacoes/route.ts";
  let content = read(relativePath);

  if (!content.includes("CRM_PROTECTED_SYSTEM_FLOW_ACTIONS_V1")) {
    content = replaceRequired(
      content,
      "async function fluxoPossuiGatilhoAtivo(params: {",
      `// CRM_PROTECTED_SYSTEM_FLOW_ACTIONS_V1
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

  if (!content.includes("CRM_SYSTEM_FLOW_OPTIONAL_TRIGGER_EDIT_VALIDATION_V1")) {
    content = replaceRequired(
      content,
      `    if (statusFinal === "ativo" && !fluxoPadraoFinal) {
      const possuiGatilhoAtivo = await fluxoPossuiGatilhoAtivo({
        empresaId: usuario.empresa_id,
        fluxoId: id,
      });

      if (!possuiGatilhoAtivo) {
        return respostaFluxoAtivoSemGatilho();
      }
    }`,
      `    const fluxoSistemaCalendario = fluxoEhSistemaProtegido(
      fluxoAntes.configuracao_json
    );

    // CRM_SYSTEM_FLOW_OPTIONAL_TRIGGER_EDIT_VALIDATION_V1
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
    }`,
      "gatilhos opcionais dos fluxos fixos"
    );
  }

  if (!content.includes("CRM_PROTECTED_SYSTEM_FLOW_STATUS_V1")) {
    content = transformSection(
      content,
      "export async function PATCH(req: NextRequest)",
      "export async function DELETE(req: NextRequest)",
      (section) =>
        replaceRequired(
          section,
          "    const configuracaoFinal =",
          `    // CRM_PROTECTED_SYSTEM_FLOW_STATUS_V1
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
      "PATCH da API de fluxos"
    );
  }

  if (!content.includes("CRM_PROTECTED_SYSTEM_FLOW_DELETE_V1")) {
    content = replaceRequired(
      content,
      "    if (definitivo) {",
      `    // CRM_PROTECTED_SYSTEM_FLOW_DELETE_V1
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
          error:
            "Erro ao validar a proteção do fluxo: " +
            fluxoProtegidoAcaoError.message,
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
    );
  }

  write(relativePath, content);
}

function patchEditor() {
  const relativePath = "src/app/(private)/fluxos/page.tsx";
  let content = read(relativePath);

  if (!content.includes("CRM_SYSTEM_FLOW_STRONG_BADGE_V1")) {
    content = replaceRequired(
      content,
      `<span className={\`\${styles.badge} \${styles.badgeBlue}\`}>
                          🔒 fluxo do sistema
                        </span>`,
      `<span
                          className={\`\${styles.badge} \${styles.systemFlowBadge}\`}
                          data-system-flow-badge="CRM_SYSTEM_FLOW_STRONG_BADGE_V1"
                        >
                          🔒 FLUXO DO SISTEMA
                        </span>`,
      "badge na lista de fluxos"
    );

    content = replaceRequired(
      content,
      `<span className={\`\${styles.badge} \${styles.badgeBlue}\`}>
                🔒 fluxo fixo do sistema
              </span>`,
      `<span
                className={\`\${styles.badge} \${styles.systemFlowBadge}\`}
                data-system-flow-badge="CRM_SYSTEM_FLOW_STRONG_BADGE_V1"
              >
                🔒 FLUXO DO SISTEMA
              </span>`,
      "badge no cabeçalho do fluxo"
    );
  }

  if (!content.includes("CRM_PROTECTED_SYSTEM_FLOW_EDITOR_V1")) {
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
  // CRM_PROTECTED_SYSTEM_FLOW_EDITOR_V1
  if (fluxoEhSistemaCalendario(fluxo) && novoStatus !== "ativo") {
    setErro("Fluxos fixos do sistema não podem ser pausados.");
    return;
  }

  try {`,
      "bloqueio de pausa no editor"
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
      "bloqueio de arquivamento no editor"
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
      "bloqueio de exclusão definitiva no editor"
    );

    content = replaceRequired(
      content,
      `className={styles.headerDropdownItem}
                        onClick={() => {
                          setMenuHeaderAberto(false);
                          alterarStatusFluxo(`,
      `className={styles.headerDropdownItem}
                        disabled={fluxoEhSistemaCalendario(fluxoSelecionado)}
                        title={
                          fluxoEhSistemaCalendario(fluxoSelecionado)
                            ? "Fluxos fixos do sistema não podem ser pausados."
                            : undefined
                        }
                        onClick={() => {
                          setMenuHeaderAberto(false);
                          alterarStatusFluxo(`,
      "bloqueio visual da pausa no cabeçalho"
    );

    content = replaceRequired(
      content,
      `className={\`\${styles.headerDropdownItem} \${styles.headerDropdownDanger}\`}
                        onClick={() => {
                          setMenuHeaderAberto(false);
                          abrirModalArquivarFluxo(fluxoSelecionado);`,
      `className={\`\${styles.headerDropdownItem} \${styles.headerDropdownDanger}\`}
                        disabled={fluxoEhSistemaCalendario(fluxoSelecionado)}
                        title={
                          fluxoEhSistemaCalendario(fluxoSelecionado)
                            ? "Fluxos fixos do sistema não podem ser arquivados."
                            : undefined
                        }
                        onClick={() => {
                          setMenuHeaderAberto(false);
                          abrirModalArquivarFluxo(fluxoSelecionado);`,
      "bloqueio visual do arquivamento no cabeçalho"
    );

    content = replaceRequired(
      content,
      `className={styles.flowDropdownItem}
                  onClick={() => {
                    alterarStatusFluxo(`,
      `className={styles.flowDropdownItem}
                  disabled={fluxoEhSistemaCalendario(menuFluxo.fluxo)}
                  title={
                    fluxoEhSistemaCalendario(menuFluxo.fluxo)
                      ? "Fluxos fixos do sistema não podem ser pausados."
                      : undefined
                  }
                  onClick={() => {
                    alterarStatusFluxo(`,
      "bloqueio visual da pausa no menu lateral"
    );

    content = replaceRequired(
      content,
      `className={\`\${styles.flowDropdownItem} \${styles.flowDropdownDanger}\`}
                  onClick={() => {
                    abrirModalArquivarFluxo(menuFluxo.fluxo!);`,
      `className={\`\${styles.flowDropdownItem} \${styles.flowDropdownDanger}\`}
                  disabled={fluxoEhSistemaCalendario(menuFluxo.fluxo)}
                  title={
                    fluxoEhSistemaCalendario(menuFluxo.fluxo)
                      ? "Fluxos fixos do sistema não podem ser arquivados."
                      : undefined
                  }
                  onClick={() => {
                    abrirModalArquivarFluxo(menuFluxo.fluxo!);`,
      "bloqueio visual do arquivamento no menu lateral"
    );
  }

  if (!content.includes("CRM_MODAL_TRIGGER_ERRORS_V1")) {
    content = transformSection(
      content,
      "async function removerGatilhoFluxo(gatilhoId: string)",
      "async function alternarGatilhoFluxo(gatilho: GatilhoFluxo)",
      (section) => {
        let next = section.replace(
          `  try {
    setErro("");
    setSucesso("");`,
          `  // CRM_MODAL_TRIGGER_ERRORS_V1
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
      "erros ao remover gatilho"
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
      "erros ao atualizar gatilho"
    );
  }

  write(relativePath, content);
}

function patchStyles() {
  const relativePath = "src/app/(private)/fluxos/fluxos.module.css";
  let content = read(relativePath);

  if (!content.includes("CRM_SYSTEM_FLOW_STRONG_BADGE_STYLE_V1")) {
    content = replaceRequired(
      content,
      ".flowBadges {",
      `/* CRM_SYSTEM_FLOW_STRONG_BADGE_STYLE_V1 */
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

.headerDropdownItem:disabled,
.flowDropdownItem:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.flowBadges {`,
      "estilo do badge e ações bloqueadas"
    );
  }

  write(relativePath, content);
}

patchApi();
patchEditor();
patchStyles();

console.log(
  "Fluxos fixos protegidos, badge atualizado e erros de gatilho direcionados ao modal."
);
