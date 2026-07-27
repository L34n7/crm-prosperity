import { readFile, writeFile } from "node:fs/promises";

const pagePath = "src/app/(private)/conversas/page.tsx";
let page = await readFile(pagePath, "utf8");

if (page.includes("onExcluir?: () => void;")) {
  process.exit(0);
}

function replaceOnce(source, oldValue, newValue, label) {
  const occurrences = source.split(oldValue).length - 1;
  if (occurrences !== 1) {
    throw new Error(`${label}: esperado 1 trecho, encontrado ${occurrences}`);
  }
  return source.replace(oldValue, newValue);
}

const propsAnchor = `function CampoContatoEditavel({
  label,
  valorInicial,
  editando,
  multiline = false,
  onEditar,
  onCancelar,
  onSalvar,
}: {
  label: string;
  valorInicial: string;
  editando: boolean;
  multiline?: boolean;
  onEditar: () => void;
  onCancelar: () => void;
  onSalvar: (valor: string) => void;
}) {`;

const propsBlock = `function CampoContatoEditavel({
  label,
  valorInicial,
  editando,
  multiline = false,
  onEditar,
  onCancelar,
  onSalvar,
  onExcluir,
}: {
  label: string;
  valorInicial: string;
  editando: boolean;
  multiline?: boolean;
  onEditar: () => void;
  onCancelar: () => void;
  onSalvar: (valor: string) => void;
  onExcluir?: () => void;
}) {`;

page = replaceOnce(
  page,
  propsAnchor,
  propsBlock,
  "propriedade de exclusão do campo editável"
);

const actionsAnchor = `          <div className={styles.infoEditActions}>
            <button
              type="button"
              className={styles.inlineCancelButton}
              onClick={() => {
                setValor(valorInicial);
                onCancelar();
              }}
            >
              Cancelar
            </button>`;

const actionsBlock = `          <div className={styles.infoEditActions}>
            {onExcluir && (
              <button
                type="button"
                className={styles.inlineCancelButton}
                style={{
                  marginRight: "auto",
                  color: "var(--crm-danger-strong)",
                  borderColor: "rgba(220, 38, 38, 0.3)",
                }}
                onClick={onExcluir}
              >
                Excluir
              </button>
            )}

            <button
              type="button"
              className={styles.inlineCancelButton}
              onClick={() => {
                setValor(valorInicial);
                onCancelar();
              }}
            >
              Cancelar
            </button>`;

page = replaceOnce(
  page,
  actionsAnchor,
  actionsBlock,
  "botão de exclusão no editor"
);

const functionAnchor = `  function abrirConversa(conversa: Conversa) {`;
const functionBlock = `  function confirmarExclusaoCaptura(nomeCampo: string) {
    return new Promise<boolean>((resolve) => {
      const focoAnterior = document.activeElement as HTMLElement | null;
      const overflowAnterior = document.body.style.overflow;
      document.body.style.overflow = "hidden";

      const overlay = document.createElement("div");
      overlay.setAttribute("role", "presentation");
      Object.assign(overlay.style, {
        position: "fixed",
        inset: "0",
        zIndex: "30000",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        background: "rgba(15, 23, 42, 0.58)",
        backdropFilter: "blur(3px)",
      });

      const modal = document.createElement("div");
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");
      modal.setAttribute("aria-labelledby", "captura-delete-title");
      Object.assign(modal.style, {
        width: "min(430px, calc(100vw - 32px))",
        overflow: "hidden",
        border: "1px solid var(--crm-border, #d8e1e7)",
        borderRadius: "22px",
        background: "var(--crm-surface, #ffffff)",
        color: "var(--crm-text-strong, #0f2635)",
        boxShadow: "0 24px 70px rgba(15, 23, 42, 0.28)",
        transform: "translateY(0)",
      });

      const conteudo = document.createElement("div");
      Object.assign(conteudo.style, {
        display: "flex",
        gap: "14px",
        padding: "22px 22px 18px",
      });

      const icone = document.createElement("div");
      icone.textContent = "!";
      Object.assign(icone.style, {
        flex: "0 0 44px",
        width: "44px",
        height: "44px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "14px",
        background: "rgba(220, 38, 38, 0.1)",
        color: "var(--crm-danger-strong, #b91c1c)",
        fontSize: "22px",
        fontWeight: "900",
      });

      const textos = document.createElement("div");
      Object.assign(textos.style, {
        minWidth: "0",
        paddingTop: "1px",
      });

      const titulo = document.createElement("h2");
      titulo.id = "captura-delete-title";
      titulo.textContent = "Excluir informação de captura?";
      Object.assign(titulo.style, {
        margin: "0",
        fontSize: "19px",
        lineHeight: "1.25",
        fontWeight: "800",
      });

      const descricao = document.createElement("p");
      descricao.textContent = \`O campo “\${nomeCampo}” será removido permanentemente do contato.\`;
      Object.assign(descricao.style, {
        margin: "8px 0 0",
        color: "var(--crm-text-muted, #607785)",
        fontSize: "14px",
        lineHeight: "1.5",
      });

      const aviso = document.createElement("p");
      aviso.textContent = "Esta ação não poderá ser desfeita.";
      Object.assign(aviso.style, {
        margin: "8px 0 0",
        color: "var(--crm-danger-strong, #b91c1c)",
        fontSize: "13px",
        fontWeight: "700",
      });

      textos.append(titulo, descricao, aviso);
      conteudo.append(icone, textos);

      const rodape = document.createElement("div");
      Object.assign(rodape.style, {
        display: "flex",
        justifyContent: "flex-end",
        gap: "10px",
        padding: "16px 22px 20px",
        borderTop: "1px solid var(--crm-border-soft, #e8eef2)",
        background: "var(--crm-surface-subtle, #f8fafb)",
      });

      const cancelar = document.createElement("button");
      cancelar.type = "button";
      cancelar.textContent = "Cancelar";
      Object.assign(cancelar.style, {
        minHeight: "40px",
        padding: "9px 15px",
        border: "1px solid var(--crm-border, #d8e1e7)",
        borderRadius: "12px",
        background: "var(--crm-surface, #ffffff)",
        color: "var(--crm-text-strong, #0f2635)",
        font: "inherit",
        fontSize: "13px",
        fontWeight: "800",
        cursor: "pointer",
      });

      const confirmar = document.createElement("button");
      confirmar.type = "button";
      confirmar.textContent = "Excluir campo";
      Object.assign(confirmar.style, {
        minHeight: "40px",
        padding: "9px 16px",
        border: "1px solid #b91c1c",
        borderRadius: "12px",
        background: "#b91c1c",
        color: "#ffffff",
        font: "inherit",
        fontSize: "13px",
        fontWeight: "800",
        cursor: "pointer",
        boxShadow: "0 6px 16px rgba(185, 28, 28, 0.2)",
      });

      let finalizado = false;
      const finalizar = (resultado: boolean) => {
        if (finalizado) return;
        finalizado = true;
        document.removeEventListener("keydown", aoPressionarTecla);
        document.body.style.overflow = overflowAnterior;
        overlay.remove();
        focoAnterior?.focus?.();
        resolve(resultado);
      };

      const aoPressionarTecla = (event: KeyboardEvent) => {
        if (event.key === "Escape") finalizar(false);
        if (event.key === "Enter") finalizar(true);
      };

      cancelar.addEventListener("click", () => finalizar(false));
      confirmar.addEventListener("click", () => finalizar(true));
      overlay.addEventListener("click", (event) => {
        if (event.target === overlay) finalizar(false);
      });
      document.addEventListener("keydown", aoPressionarTecla);

      rodape.append(cancelar, confirmar);
      modal.append(conteudo, rodape);
      overlay.append(modal);
      document.body.append(overlay);
      cancelar.focus();
    });
  }

  async function excluirInformacaoCaptura(
    informacao: InformacaoCapturaConversa
  ) {
    const contatoId =
      contatoCapturaId || String(conversaSelecionada?.contatos?.id || "").trim();
    const conversaId = conversaSelecionada?.id || "";

    if (!contatoId || !conversaId) {
      setErro("Não foi possível identificar a informação de captura para exclusão.");
      return;
    }

    const confirmou = await confirmarExclusaoCaptura(
      formatarLabelCapturaDetalhada(informacao)
    );
    if (!confirmou) return;

    try {
      setErro("");
      const response = await fetch(
        \`/api/contatos/\${encodeURIComponent(
          contatoId
        )}/informacoes-captura/\${encodeURIComponent(informacao.id)}\`,
        { method: "DELETE" }
      );
      const data = await response.json().catch(() => ({}));

      if (!response.ok || data?.ok === false) {
        throw new Error(
          data?.error || "Erro ao excluir a informação de captura."
        );
      }

      setEditandoCampo(null);
      setMensagemSucesso("Informação de captura excluída.");
      await carregarInformacoesCapturaConversa(conversaId);
    } catch (error) {
      setErro(
        error instanceof Error
          ? error.message
          : "Erro ao excluir a informação de captura."
      );
    }
  }

${functionAnchor}`;

page = replaceOnce(
  page,
  functionAnchor,
  functionBlock,
  "modal e função de exclusão da captura"
);

const summaryAnchor = `                                  onSalvar={(valor) =>
                                    void salvarInformacaoCaptura(informacao, valor)
                                  }
                                />`;
const summaryBlock = `                                  onSalvar={(valor) =>
                                    void salvarInformacaoCaptura(informacao, valor)
                                  }
                                  onExcluir={() =>
                                    void excluirInformacaoCaptura(informacao)
                                  }
                                />`;

page = replaceOnce(
  page,
  summaryAnchor,
  summaryBlock,
  "exclusão no resumo das capturas"
);

const detailsAnchor = `                                      onSalvar={(valor) =>
                                        void salvarInformacaoCaptura(
                                          informacao,
                                          valor
                                        )
                                      }
                                    />`;
const detailsBlock = `                                      onSalvar={(valor) =>
                                        void salvarInformacaoCaptura(
                                          informacao,
                                          valor
                                        )
                                      }
                                      onExcluir={() =>
                                        void excluirInformacaoCaptura(
                                          informacao
                                        )
                                      }
                                    />`;

page = replaceOnce(
  page,
  detailsAnchor,
  detailsBlock,
  "exclusão na lista completa das capturas"
);

await writeFile(pagePath, page, "utf8");
console.log("Exclusão dos campos capturados aplicada à página de conversas.");
