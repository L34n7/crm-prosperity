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
  capturado_em?: string | null;
};

const ORDEM_TIPOS_CAPTURA = [
  "nome",
  "cpf",
  "cnpj",
  "data",
  "telefone",
  "numero",
  "email",
  "endereco",
  "cep",
  "observacao",
] as const;

const ROTULOS_TIPOS_CAPTURA: Record<string, string> = {
  nome: "Nome",
  cpf: "CPF",
  cnpj: "CNPJ",
  data: "Data",
  telefone: "Telefone",
  numero: "Número",
  email: "E-mail",
  endereco: "Endereço",
  cep: "CEP",
  observacao: "Observação",
};

function normalizarLabelCaptura(valor: string | null | undefined) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\\u0300-\\u036f]/g, "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\\s+/g, " ")
    .trim();
}

function obterTipoCaptura(informacao: InformacaoCapturaConversa) {
  const tipo = normalizarLabelCaptura(informacao.tipo);
  const nomeCampo = normalizarLabelCaptura(informacao.nome_campo)
    .replace(/\\s+captura\\s*$/, "")
    .replace(/\\s+\\d+\\s*$/, "")
    .trim();

  const normalizarTipo = (valor: string) => {
    if (valor === "texto" || valor === "livre" || valor === "observacoes") {
      return "observacao";
    }
    if (valor === "e mail") return "email";
    return valor;
  };

  const tipoNormalizado = normalizarTipo(tipo);
  if (ORDEM_TIPOS_CAPTURA.includes(tipoNormalizado as (typeof ORDEM_TIPOS_CAPTURA)[number])) {
    return tipoNormalizado;
  }

  const nomeNormalizado = normalizarTipo(nomeCampo);
  if (ORDEM_TIPOS_CAPTURA.includes(nomeNormalizado as (typeof ORDEM_TIPOS_CAPTURA)[number])) {
    return nomeNormalizado;
  }

  return tipoNormalizado || nomeNormalizado || "outro";
}

function obterRotuloTipoCaptura(informacao: InformacaoCapturaConversa) {
  const tipo = obterTipoCaptura(informacao);
  if (ROTULOS_TIPOS_CAPTURA[tipo]) return ROTULOS_TIPOS_CAPTURA[tipo];

  const nomeOriginal = String(
    informacao.nome_campo || informacao.tipo || "Informação"
  )
    .replace(/[_-]+/g, " ")
    .replace(/\\s+captura\\s*$/i, "")
    .replace(/\\s+\\d+\\s*$/, "")
    .replace(/\\s+/g, " ")
    .trim();

  return nomeOriginal.charAt(0).toUpperCase() + nomeOriginal.slice(1);
}

function formatarLabelCapturaResumo(informacao: InformacaoCapturaConversa) {
  return \`\${obterRotuloTipoCaptura(informacao)} captura\`;
}

function formatarLabelCapturaDetalhada(informacao: InformacaoCapturaConversa) {
  const nomeOriginal = String(informacao.nome_campo || "")
    .replace(/[_-]+/g, " ")
    .replace(/\\s+captura\\s*$/i, "")
    .replace(/\\s+/g, " ")
    .trim();
  const correspondencia = nomeOriginal.match(/^(.*?)(?:\\s+(\\d+))?$/);
  const numeroNome = correspondencia?.[2] || "";
  const sequencia =
    numeroNome ||
    (Number(informacao.sequencia || 0) > 0
      ? String(informacao.sequencia)
      : "");

  return \`\${formatarLabelCapturaResumo(informacao)}\${
    sequencia ? \` \${sequencia}\` : ""
  }\`;
}

function compararInformacoesCaptura(
  a: InformacaoCapturaConversa,
  b: InformacaoCapturaConversa
) {
  const tipoA = obterTipoCaptura(a);
  const tipoB = obterTipoCaptura(b);
  const ordemA = ORDEM_TIPOS_CAPTURA.indexOf(
    tipoA as (typeof ORDEM_TIPOS_CAPTURA)[number]
  );
  const ordemB = ORDEM_TIPOS_CAPTURA.indexOf(
    tipoB as (typeof ORDEM_TIPOS_CAPTURA)[number]
  );
  const posicaoA = ordemA === -1 ? ORDEM_TIPOS_CAPTURA.length : ordemA;
  const posicaoB = ordemB === -1 ? ORDEM_TIPOS_CAPTURA.length : ordemB;

  if (posicaoA !== posicaoB) return posicaoA - posicaoB;

  const sequenciaA = Number(a.sequencia || 0);
  const sequenciaB = Number(b.sequencia || 0);
  if (sequenciaA !== sequenciaB) return sequenciaA - sequenciaB;

  return formatarLabelCapturaDetalhada(a).localeCompare(
    formatarLabelCapturaDetalhada(b),
    "pt-BR",
    { numeric: true, sensitivity: "base" }
  );
}

${typeAnchor}`;
page = replaceOnce(page, typeAnchor, typeBlock, "tipo e ordenação das capturas");

const tabsAnchor = `  | "macros"
  | "midia_docs_links";`;
const tabsBlock = `  | "macros"
  | "informacoes_captura"
  | "midia_docs_links";`;
page = replaceOnce(page, tabsAnchor, tabsBlock, "aba de informações de captura");

const stateAnchor = `  const [painelDireitoAberto, setPainelDireitoAberto] = useState(false);
  const [abaPainelDireito, setAbaPainelDireito] =
    useState<AbaPainelDireito>("contato");`;
const stateBlock = `${stateAnchor}
  const [informacoesCapturaConversa, setInformacoesCapturaConversa] = useState<
    InformacaoCapturaConversa[]
  >([]);
  const [contatoCapturaId, setContatoCapturaId] = useState("");
  const [carregandoInformacoesCaptura, setCarregandoInformacoesCaptura] =
    useState(false);

  const informacoesCapturaConversaOrdenadas = useMemo(
    () =>
      [...informacoesCapturaConversa]
        .filter((informacao) => String(informacao.valor || "").trim())
        .sort(compararInformacoesCaptura),
    [informacoesCapturaConversa]
  );

  const informacoesCapturaResumo = useMemo(() => {
    const tiposExibidos = new Set<string>();

    return informacoesCapturaConversaOrdenadas.filter((informacao) => {
      const tipo = obterTipoCaptura(informacao);
      if (tiposExibidos.has(tipo)) return false;
      tiposExibidos.add(tipo);
      return true;
    });
  }, [informacoesCapturaConversaOrdenadas]);

  const possuiInformacoesCapturaExtras =
    informacoesCapturaConversaOrdenadas.length > informacoesCapturaResumo.length;`;
page = replaceOnce(page, stateAnchor, stateBlock, "estado e resumo das capturas");

const effectAnchor = "  function abrirConversa(conversa: Conversa) {";
const effectBlock = `  async function carregarInformacoesCapturaConversa(
    conversaId: string,
    signal?: AbortSignal
  ) {
    if (!conversaId) return;

    setCarregandoInformacoesCaptura(true);

    try {
      const response = await fetch(
        \`/api/conversas/\${encodeURIComponent(
          conversaId
        )}/informacoes-captura\`,
        { cache: "no-store", signal }
      );
      const data = await response.json().catch(() => ({}));

      if (!response.ok || data?.ok === false) {
        throw new Error(
          data?.error || "Erro ao carregar informações de captura."
        );
      }

      if (signal?.aborted || conversaSelecionadaIdRef.current !== conversaId) {
        return;
      }

      setContatoCapturaId(String(data?.contato_id || "").trim());
      setInformacoesCapturaConversa(
        Array.isArray(data.informacoes)
          ? data.informacoes.filter(
              (informacao: InformacaoCapturaConversa) =>
                Boolean(String(informacao?.valor || "").trim())
            )
          : []
      );
    } catch (error) {
      if (signal?.aborted) return;
      if (conversaSelecionadaIdRef.current !== conversaId) return;

      setContatoCapturaId("");
      setInformacoesCapturaConversa([]);
      console.error("[capturas-conversa]", error);
    } finally {
      if (!signal?.aborted && conversaSelecionadaIdRef.current === conversaId) {
        setCarregandoInformacoesCaptura(false);
      }
    }
  }

  useEffect(() => {
    const conversaId = conversaSelecionada?.id || "";
    const controller = new AbortController();

    setContatoCapturaId("");
    setInformacoesCapturaConversa([]);
    setCarregandoInformacoesCaptura(Boolean(conversaId));

    if (conversaId) {
      void carregarInformacoesCapturaConversa(conversaId, controller.signal);
    }

    return () => controller.abort();
  }, [conversaSelecionada?.id]);

  async function salvarInformacaoCaptura(
    informacao: InformacaoCapturaConversa,
    valor: string
  ) {
    const contatoId =
      contatoCapturaId || String(conversaSelecionada?.contatos?.id || "").trim();
    const conversaId = conversaSelecionada?.id || "";
    const valorLimpo = valor.trim();

    if (!contatoId || !conversaId || !valorLimpo) {
      setErro("Não foi possível identificar a informação de captura para edição.");
      return;
    }

    try {
      setErro("");
      const response = await fetch(
        \`/api/contatos/\${encodeURIComponent(
          contatoId
        )}/informacoes-captura\`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: informacao.id, valor: valorLimpo }),
        }
      );
      const data = await response.json().catch(() => ({}));

      if (!response.ok || data?.ok === false) {
        throw new Error(
          data?.error || "Erro ao atualizar a informação de captura."
        );
      }

      setEditandoCampo(null);
      setMensagemSucesso("Informação de captura atualizada.");
      await carregarInformacoesCapturaConversa(conversaId);
    } catch (error) {
      setErro(
        error instanceof Error
          ? error.message
          : "Erro ao atualizar a informação de captura."
      );
    }
  }

${effectAnchor}`;
page = replaceOnce(page, effectAnchor, effectBlock, "consulta e edição das capturas");

const titleAnchor = `                                : abaPainelDireito === "macros"
                                ? "Macros"
                                : abaPainelDireito === "midia_docs_links"`;
const titleBlock = `                                : abaPainelDireito === "macros"
                                ? "Macros"
                                : abaPainelDireito === "informacoes_captura"
                                ? "Informações captura"
                                : abaPainelDireito === "midia_docs_links"`;
page = replaceOnce(page, titleAnchor, titleBlock, "título da aba de capturas");

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

                              {informacoesCapturaResumo.map((informacao) => (
                                <CampoContatoEditavel
                                  key={informacao.id}
                                  label={formatarLabelCapturaResumo(
                                    informacao
                                  ).toUpperCase()}
                                  valorInicial={informacao.valor}
                                  editando={
                                    editandoCampo === \`captura:\${informacao.id}\`
                                  }
                                  multiline={obterTipoCaptura(informacao) === "observacao"}
                                  onEditar={() =>
                                    setEditandoCampo(\`captura:\${informacao.id}\`)
                                  }
                                  onCancelar={() => setEditandoCampo(null)}
                                  onSalvar={(valor) =>
                                    void salvarInformacaoCaptura(informacao, valor)
                                  }
                                />
                              ))}

                              {possuiInformacoesCapturaExtras && (
                                <div className={styles.whatsInfoRow}>
                                  <button
                                    type="button"
                                    className={styles.secondaryButton}
                                    onClick={() => {
                                      setAbaPainelDireito("informacoes_captura");
                                      setPainelDireitoAberto(true);
                                      setEditandoCampo(null);
                                    }}
                                  >
                                    Ver mais
                                  </button>
                                </div>
                              )}`;
page = replaceOnce(
  page,
  observations,
  captureFields,
  "resumo editável das capturas"
);

const fullTabAnchor = `                      {abaPainelDireito === "historico" && (`;
const fullTabBlock = `                      {abaPainelDireito === "informacoes_captura" && (
                        <div className={styles.whatsContactPanel}>
                          <div className={styles.whatsContactSection}>
                            <div className={styles.whatsSectionHeader}>
                              <span>Todos os campos capturados</span>
                            </div>

                            {carregandoInformacoesCaptura ? (
                              <div className={styles.infoBoxMuted}>
                                Carregando informações de captura...
                              </div>
                            ) : informacoesCapturaConversaOrdenadas.length === 0 ? (
                              <div className={styles.infoBoxMuted}>
                                Nenhuma informação foi capturada para este contato.
                              </div>
                            ) : (
                              <div className={styles.whatsInfoList}>
                                {informacoesCapturaConversaOrdenadas.map(
                                  (informacao) => (
                                    <CampoContatoEditavel
                                      key={informacao.id}
                                      label={formatarLabelCapturaDetalhada(
                                        informacao
                                      ).toUpperCase()}
                                      valorInicial={informacao.valor}
                                      editando={
                                        editandoCampo ===
                                        \`captura:\${informacao.id}\`
                                      }
                                      multiline={
                                        obterTipoCaptura(informacao) ===
                                        "observacao"
                                      }
                                      onEditar={() =>
                                        setEditandoCampo(
                                          \`captura:\${informacao.id}\`
                                        )
                                      }
                                      onCancelar={() => setEditandoCampo(null)}
                                      onSalvar={(valor) =>
                                        void salvarInformacaoCaptura(
                                          informacao,
                                          valor
                                        )
                                      }
                                    />
                                  )
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

${fullTabAnchor}`;
page = replaceOnce(page, fullTabAnchor, fullTabBlock, "aba completa das capturas");

await writeFile(pagePath, page, "utf8");
console.log("Campos de captura da página de conversas atualizados.");
