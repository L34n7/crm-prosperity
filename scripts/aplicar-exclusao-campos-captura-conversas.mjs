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
const functionBlock = `  async function excluirInformacaoCaptura(
    informacao: InformacaoCapturaConversa
  ) {
    const contatoId =
      contatoCapturaId || String(conversaSelecionada?.contatos?.id || "").trim();
    const conversaId = conversaSelecionada?.id || "";

    if (!contatoId || !conversaId) {
      setErro("Não foi possível identificar a informação de captura para exclusão.");
      return;
    }

    const confirmou = window.confirm(
      \`Excluir o campo "\${formatarLabelCapturaDetalhada(informacao)}"?\`
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
  "função de exclusão da captura"
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
