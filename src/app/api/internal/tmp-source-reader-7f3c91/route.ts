import { NextResponse } from "next/server";

const CHAVE = "7f3c91d2";
const REPOSITORIO = "L34n7/crm-prosperity";
const BASE_RAW = `https://raw.githubusercontent.com/${REPOSITORIO}/main`;

const ARQUIVOS: Record<string, string> = {
  page: `${BASE_RAW}/src/app/(private)/conversas/page.tsx`,
  layout: `${BASE_RAW}/src/app/(private)/conversas/layout.tsx`,
  alignment: `${BASE_RAW}/src/app/(private)/conversas/ConteudoIndisponivelAlignment.tsx`,
};

export const dynamic = "force-dynamic";

function substituirUmaVez(
  texto: string,
  antigo: string,
  novo: string,
  descricao: string
) {
  const partes = texto.split(antigo);
  if (partes.length !== 2) {
    throw new Error(
      `${descricao}: esperado um trecho, encontrados ${partes.length - 1}`
    );
  }
  return `${partes[0]}${novo}${partes[1]}`;
}

function paraBase64Utf8(texto: string) {
  const bytes = new TextEncoder().encode(texto);
  let binario = "";
  const tamanho = 0x8000;

  for (let inicio = 0; inicio < bytes.length; inicio += tamanho) {
    binario += String.fromCharCode(...bytes.subarray(inicio, inicio + tamanho));
  }

  return btoa(binario);
}

function ajustarPagina(conteudo: string) {
  let page = conteudo;

  page = substituirUmaVez(
    page,
    '  | "macros"\n  | "midia_docs_links";',
    '  | "macros"\n  | "midia_docs_links"\n  | "informacoes_captura";',
    "aba informações de captura"
  );

  page = substituirUmaVez(
    page,
    "type NotaConversa = {",
    `type InformacaoCapturaContato = {
  id: string;
  tipo?: string | null;
  nome_campo?: string | null;
  sequencia?: number | null;
  valor: string;
  capturado_em?: string | null;
  atualizado_em?: string | null;
  automacao_fluxos?:
    | { nome?: string | null }
    | { nome?: string | null }[]
    | null;
};

type NotaConversa = {`,
    "tipo informações de captura"
  );

  const helpers = `function normalizarTextoCaptura(valor: string | null | undefined) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\\u0300-\\u036f]/g, "")
    .toLowerCase()
    .replace(/\\s+/g, " ")
    .trim();
}

function obterNomeBaseCaptura(informacao: InformacaoCapturaContato) {
  return (
    String(informacao.nome_campo || informacao.tipo || "Informação")
      .replace(/[_-]+/g, " ")
      .replace(/\\s+\\d+\\s*$/, "")
      .replace(/\\s+captura\\s*$/i, "")
      .replace(/\\s+/g, " ")
      .trim() || "Informação"
  );
}

function obterChaveCaptura(informacao: InformacaoCapturaContato) {
  return normalizarTextoCaptura(obterNomeBaseCaptura(informacao))
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function formatarLabelBaseCaptura(informacao: InformacaoCapturaContato) {
  const base = obterNomeBaseCaptura(informacao);
  const normalizado = normalizarTextoCaptura(base);
  const nome =
    normalizado === "email" || normalizado === "e mail" ? "E-mail" : base;

  return \`\${nome} captura\`;
}

function obterNomeFluxoCaptura(informacao: InformacaoCapturaContato) {
  const relacao = informacao.automacao_fluxos;
  const fluxo = Array.isArray(relacao) ? relacao[0] : relacao;
  return fluxo?.nome || "Fluxo não identificado";
}

function formatarDataCapturaContato(valor?: string | null) {
  if (!valor) return "Data não informada";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "Data não informada";
  return data.toLocaleString("pt-BR");
}

`;

  page = substituirUmaVez(
    page,
    "function normalizarTelefoneMetaUi(valor?: string | null) {",
    `${helpers}function normalizarTelefoneMetaUi(valor?: string | null) {`,
    "helpers informações de captura"
  );

  const ancoraEstado = `  const [painelDireitoAberto, setPainelDireitoAberto] = useState(false);
  const [abaPainelDireito, setAbaPainelDireito] =
    useState<AbaPainelDireito>("contato");`;

  const blocoEstado = `${ancoraEstado}
  const [informacoesCaptura, setInformacoesCaptura] = useState<
    InformacaoCapturaContato[]
  >([]);
  const [carregandoInformacoesCaptura, setCarregandoInformacoesCaptura] =
    useState(false);
  const [erroInformacoesCaptura, setErroInformacoesCaptura] = useState("");

  const resumoInformacoesCaptura = useMemo(() => {
    const vistos = new Set<string>();

    return informacoesCaptura.filter((informacao) => {
      const chave = obterChaveCaptura(informacao);
      if (vistos.has(chave)) return false;
      vistos.add(chave);
      return true;
    });
  }, [informacoesCaptura]);

  const informacoesCapturaDetalhadas = useMemo(() => {
    const ocorrencias = new Map<string, number>();

    return informacoesCaptura.map((informacao) => {
      const chave = obterChaveCaptura(informacao);
      const indice = ocorrencias.get(chave) || 0;
      ocorrencias.set(chave, indice + 1);

      return {
        informacao,
        label: \`\${formatarLabelBaseCaptura(informacao)}\${
          indice > 0 ? \` \${indice}\` : ""
        }\`,
      };
    });
  }, [informacoesCaptura]);

  const possuiCapturasAdicionais =
    informacoesCaptura.length > resumoInformacoesCaptura.length;`;

  page = substituirUmaVez(
    page,
    ancoraEstado,
    blocoEstado,
    "estado informações de captura"
  );

  const carregador = `  async function carregarInformacoesCaptura(
    conversaId: string,
    forcar = false
  ) {
    if (!conversaId || (carregandoInformacoesCaptura && !forcar)) return;

    setCarregandoInformacoesCaptura(true);
    setErroInformacoesCaptura("");

    try {
      const response = await fetch(
        \`/api/conversas/\${encodeURIComponent(
          conversaId
        )}/informacoes-captura\`,
        { cache: "no-store" }
      );
      const data = await response.json().catch(() => ({}));

      if (!response.ok || data?.ok === false) {
        throw new Error(
          data?.error || "Erro ao carregar informações de captura."
        );
      }

      if (!conversaEstaSelecionada(conversaId)) return;

      setInformacoesCaptura(
        Array.isArray(data.informacoes) ? data.informacoes : []
      );
    } catch (error) {
      if (!conversaEstaSelecionada(conversaId)) return;

      setInformacoesCaptura([]);
      setErroInformacoesCaptura(
        error instanceof Error
          ? error.message
          : "Erro ao carregar informações de captura."
      );
    } finally {
      if (conversaEstaSelecionada(conversaId)) {
        setCarregandoInformacoesCaptura(false);
      }
    }
  }

  useEffect(() => {
    const conversaId = conversaSelecionada?.id || "";

    setInformacoesCaptura([]);
    setErroInformacoesCaptura("");
    setCarregandoInformacoesCaptura(false);

    if (conversaId) {
      void carregarInformacoesCaptura(conversaId, true);
    }
  }, [conversaSelecionada?.id]);

`;

  page = substituirUmaVez(
    page,
    "  function abrirConversa(conversa: Conversa) {",
    `${carregador}  function abrirConversa(conversa: Conversa) {`,
    "carregamento informações de captura"
  );

  page = substituirUmaVez(
    page,
    `: abaPainelDireito === "midia_docs_links"
                                 ? "Mídias, links e documentos"
                                 : "Mensagens favoritas"}`,
    `: abaPainelDireito === "midia_docs_links"
                                 ? "Mídias, links e documentos"
                                 : abaPainelDireito === "informacoes_captura"
                                 ? "Informações de captura"
                                 : "Mensagens favoritas"}`,
    "título da aba de captura"
  );

  const observacoes = `                              <CampoContatoEditavel
                                label="OBSERVAÇÕES"
                                valorInicial={conversaSelecionada.contatos?.observacoes || ""}
                                editando={editandoCampo === "observacoes"}
                                multiline
                                onEditar={() => setEditandoCampo("observacoes")}
                                onCancelar={() => setEditandoCampo(null)}
                                onSalvar={(valor) => salvarContatoCampo("observacoes", valor)}
                              />`;

  const resumo = `${observacoes}

                              {!carregandoInformacoesCaptura &&
                                resumoInformacoesCaptura.map((informacao) => (
                                  <div
                                    className={styles.whatsInfoRow}
                                    key={informacao.id}
                                  >
                                    <span className={styles.whatsInfoLabel}>
                                      {formatarLabelBaseCaptura(informacao)}
                                    </span>
                                    <strong className={styles.whatsInfoValue}>
                                      {informacao.valor}
                                    </strong>
                                  </div>
                                ))}

                              {!carregandoInformacoesCaptura &&
                                possuiCapturasAdicionais && (
                                  <button
                                    type="button"
                                    className={styles.secondaryButton}
                                    style={{ width: "100%" }}
                                    onClick={() =>
                                      setAbaPainelDireito("informacoes_captura")
                                    }
                                  >
                                    Ver mais
                                  </button>
                                )}`;

  page = substituirUmaVez(
    page,
    observacoes,
    resumo,
    "resumo abaixo de observações"
  );

  const aba = `                      {abaPainelDireito === "informacoes_captura" && (
                        <div className={styles.panelSectionStack}>
                          <div className={styles.listaInlineActions}>
                            <button
                              type="button"
                              className={styles.secondaryButton}
                              disabled={carregandoInformacoesCaptura}
                              onClick={() => {
                                if (!conversaSelecionada?.id) return;
                                void carregarInformacoesCaptura(
                                  conversaSelecionada.id,
                                  true
                                );
                              }}
                            >
                              {carregandoInformacoesCaptura
                                ? "Atualizando..."
                                : "Atualizar"}
                            </button>
                          </div>

                          {carregandoInformacoesCaptura &&
                          informacoesCaptura.length === 0 ? (
                            <div className={styles.infoBoxMuted}>
                              Carregando informações de captura...
                            </div>
                          ) : erroInformacoesCaptura ? (
                            <div className={styles.infoBoxMuted}>
                              {erroInformacoesCaptura}
                            </div>
                          ) : informacoesCaptura.length === 0 ? (
                            <div className={styles.infoBoxMuted}>
                              Nenhuma informação foi capturada por um fluxo ainda.
                            </div>
                          ) : (
                            <div className={styles.whatsInfoList}>
                              {informacoesCapturaDetalhadas.map(
                                ({ informacao, label }) => (
                                  <article
                                    className={styles.whatsInfoRow}
                                    key={informacao.id}
                                  >
                                    <span className={styles.whatsInfoLabel}>
                                      {label}
                                    </span>
                                    <strong className={styles.whatsInfoValue}>
                                      {informacao.valor}
                                    </strong>
                                    <small
                                      style={{
                                        display: "block",
                                        marginTop: 8,
                                        color: "var(--crm-text-muted, #718096)",
                                        fontSize: 11,
                                        lineHeight: 1.4,
                                      }}
                                    >
                                      {obterNomeFluxoCaptura(informacao)} ·{" "}
                                      {formatarDataCapturaContato(
                                        informacao.capturado_em
                                      )}
                                    </small>
                                  </article>
                                )
                              )}
                            </div>
                          )}
                        </div>
                      )}

`;

  page = substituirUmaVez(
    page,
    '                      {abaPainelDireito === "historico" && (',
    `${aba}                      {abaPainelDireito === "historico" && (`,
    "aba completa de captura"
  );

  return page;
}

function ajustarLayout() {
  return `import { type ReactNode } from "react";
import ConteudoIndisponivelAlignment from "./ConteudoIndisponivelAlignment";

export default function ConversasLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <ConteudoIndisponivelAlignment />
      {children}
    </>
  );
}
`;
}

function ajustarAlignment(conteudo: string) {
  return substituirUmaVez(
    conteudo,
    "  return <CaptureInfoEnhancer />;",
    "  return null;",
    "desativar enhancer antigo"
  );
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get("k") !== CHAVE) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const tipo = searchParams.get("file") || "";
  const base64 = searchParams.get("base64") === "1";
  const chaveArquivo = tipo.replace(/^patched-/, "");
  const origem = ARQUIVOS[chaveArquivo];

  if (!origem) {
    return NextResponse.json({ error: "Arquivo inválido" }, { status: 400 });
  }

  const response = await fetch(origem, { cache: "no-store" });
  if (!response.ok) {
    return NextResponse.json(
      { error: `Falha ao carregar fonte: ${response.status}` },
      { status: 502 }
    );
  }

  let conteudo = await response.text();

  if (tipo === "patched-page") conteudo = ajustarPagina(conteudo);
  if (tipo === "patched-layout") conteudo = ajustarLayout();
  if (tipo === "patched-alignment") conteudo = ajustarAlignment(conteudo);

  return new Response(base64 ? paraBase64Utf8(conteudo) : conteudo, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
