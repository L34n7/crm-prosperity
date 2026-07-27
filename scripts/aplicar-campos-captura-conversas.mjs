import { readFile, writeFile } from "node:fs/promises";

const pagePath = "src/app/(private)/conversas/page.tsx";
let page = await readFile(pagePath, "utf8");

if (page.includes("type InformacaoCapturaConversa =")) {
  process.exit(0);
}

function replaceOnce(source, oldValue, newValue, label) {
  const occurrences = source.split(oldValue).length - 1;
  if (occurrences !== 1) {
    throw new Error(`${label}: esperado 1 trecho, encontrado ${occurrences}`);
  }
  return source.replace(oldValue, newValue);
}

const typeAnchor = "type IntegracaoWhatsappOpcao = {";
const typeBlock = `type InformacaoCapturaConversa = {
  id: string;
  tipo?: string | null;
  nome_campo?: string | null;
  sequencia?: number | null;
  valor: string;
};

function normalizarLabelCaptura(valor: string | null | undefined) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\\u0300-\\u036f]/g, "")
    .toLowerCase()
    .replace(/\\s+/g, " ")
    .trim();
}

function formatarLabelCaptura(informacao: InformacaoCapturaConversa) {
  const nomeOriginal = String(
    informacao.nome_campo || informacao.tipo || "Informação"
  )
    .replace(/[_-]+/g, " ")
    .replace(/\\s+/g, " ")
    .trim();
  const correspondencia = nomeOriginal.match(/^(.*?)(?:\\s+(\\d+))?$/);
  const baseBruta = correspondencia?.[1]?.trim() || "Informação";
  const numeroNome = correspondencia?.[2] || "";
  const baseNormalizada = normalizarLabelCaptura(baseBruta);
  const base =
    baseNormalizada === "email" || baseNormalizada === "e mail"
      ? "E-mail"
      : baseBruta.charAt(0).toUpperCase() + baseBruta.slice(1);
  const sequencia =
    numeroNome ||
    (Number(informacao.sequencia || 0) > 0
      ? String(informacao.sequencia)
      : "");

  return \`\${base} captura\${sequencia ? \` \${sequencia}\` : ""}\`;
}

${typeAnchor}`;
page = replaceOnce(page, typeAnchor, typeBlock, "tipo das capturas");

const stateAnchor = `  const [painelDireitoAberto, setPainelDireitoAberto] = useState(false);
  const [abaPainelDireito, setAbaPainelDireito] =
    useState<AbaPainelDireito>("contato");`;
const stateBlock = `${stateAnchor}
  const [informacoesCapturaConversa, setInformacoesCapturaConversa] = useState<
    InformacaoCapturaConversa[]
  >([]);

  const informacoesCapturaConversaOrdenadas = useMemo(
    () =>
      [...informacoesCapturaConversa]
        .filter((informacao) => String(informacao.valor || "").trim())
        .sort((a, b) =>
          formatarLabelCaptura(a).localeCompare(formatarLabelCaptura(b), "pt-BR", {
            numeric: true,
            sensitivity: "base",
          })
        ),
    [informacoesCapturaConversa]
  );`;
page = replaceOnce(page, stateAnchor, stateBlock, "estado das capturas");

const effectAnchor = "  function abrirConversa(conversa: Conversa) {";
const effectBlock = `  useEffect(() => {
    const conversaId = conversaSelecionada?.id || "";
    const controller = new AbortController();

    setInformacoesCapturaConversa([]);
    if (!conversaId) return () => controller.abort();

    void (async () => {
      try {
        const response = await fetch(
          \`/api/conversas/\${encodeURIComponent(
            conversaId
          )}/informacoes-captura\`,
          { cache: "no-store", signal: controller.signal }
        );
        const data = await response.json().catch(() => ({}));

        if (!response.ok || data?.ok === false) {
          throw new Error(
            data?.error || "Erro ao carregar informações de captura."
          );
        }

        if (controller.signal.aborted) return;
        setInformacoesCapturaConversa(
          Array.isArray(data.informacoes)
            ? data.informacoes.filter(
                (informacao: InformacaoCapturaConversa) =>
                  Boolean(String(informacao?.valor || "").trim())
              )
            : []
        );
      } catch (error) {
        if (controller.signal.aborted) return;
        setInformacoesCapturaConversa([]);
        console.error("[capturas-conversa]", error);
      }
    })();

    return () => controller.abort();
  }, [conversaSelecionada?.id]);

${effectAnchor}`;
page = replaceOnce(page, effectAnchor, effectBlock, "consulta das capturas");

const observations = `                              <CampoContatoEditavel
                                label="OBSERVAÇÕES"
                                valorInicial={conversaSelecionada.contatos?.observacoes || ""}
                                editando={editandoCampo === "observacoes"}
                                multiline
                                onEditar={() => setEditandoCampo("observacoes")}
                                onCancelar={() => setEditandoCampo(null)}
                                onSalvar={(valor) => salvarContatoCampo("observacoes", valor)}
                              />`;
const captureFields = `${observations}

                              {informacoesCapturaConversaOrdenadas.map(
                                (informacao) => (
                                  <div
                                    className={styles.whatsInfoRow}
                                    key={informacao.id}
                                  >
                                    <span className={styles.whatsInfoLabel}>
                                      {formatarLabelCaptura(informacao)}
                                    </span>
                                    <strong className={styles.whatsInfoValue}>
                                      {informacao.valor}
                                    </strong>
                                  </div>
                                )
                              )}`;
page = replaceOnce(
  page,
  observations,
  captureFields,
  "campos abaixo de observações"
);

await writeFile(pagePath, page, "utf8");
console.log("Campos nativos de captura aplicados à página de conversas.");
