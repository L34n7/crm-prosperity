"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./CentralRevisaoTelefones.module.css";

type ItemRevisao = {
  id: string;
  nome: string | null;
  telefone: string;
  telefone_revisar: boolean;
  tipo: string;
  label: string;
  descricao: string;
  telefone_limpo: string;
  sugestao: string | null;
  sugestao_segura: boolean;
  telefone_revisar_apos_sugestao: boolean;
};

type PreviewCorrecao = {
  id: string;
  nome: string | null;
  telefone_anterior: string;
  telefone: string;
  telefone_revisar: boolean;
  tipo: string;
  label: string;
};

type PreviewResposta = {
  correcoes: PreviewCorrecao[];
  conflitos: Array<{
    id: string;
    nome: string | null;
    telefone_anterior: string;
    telefone_sugerido: string;
    motivo: string;
  }>;
  ignorados: Array<{
    id: string;
    nome: string | null;
    telefone: string;
    motivo: string;
  }>;
  resumo: {
    selecionados: number;
    corrigiveis: number;
    conflitos: number;
    ignorados: number;
    permanecem_em_revisao: number;
  };
};

type Acao =
  | "aplicar_sugestoes_seguras"
  | "adicionar_ddd"
  | "adicionar_ddd_nono"
  | "adicionar_nono";

type Props = {
  listaIdInicial?: string | null;
  onAtualizado?: () => void | Promise<void>;
};

const ITENS_POR_PAGINA = 25;
const MAX_SELECAO = 5000;

const OPCOES_TIPO = [
  ["todos", "Todos"],
  ["sem_ddd", "Sem DDD"],
  ["sem_ddi", "Sem +55"],
  ["celular_sem_nono", "Possível celular sem 9º dígito"],
  ["prefixo_operadora", "Prefixo/código de operadora"],
  ["formato_valido_revisao", "Já está válido"],
  ["tamanho_invalido", "Tamanho inválido"],
  ["internacional_ou_ambiguo", "Internacional/ambíguo"],
] as const;

export default function CentralRevisaoTelefones({
  listaIdInicial = null,
  onAtualizado,
}: Props) {
  const [totalMarcados, setTotalMarcados] = useState(0);
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [itens, setItens] = useState<ItemRevisao[]>([]);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [acao, setAcao] = useState<Acao>("aplicar_sugestoes_seguras");
  const [ddd, setDdd] = useState("");
  const [preview, setPreview] = useState<PreviewResposta | null>(null);
  const [gerandoPreview, setGerandoPreview] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [telefoneEdicao, setTelefoneEdicao] = useState("");
  const [salvandoEdicaoId, setSalvandoEdicaoId] = useState<string | null>(null);

  async function carregarResumo() {
    try {
      const response = await fetch(
        "/api/contatos/revisao-telefones?resumo=true",
        { cache: "no-store" }
      );
      const data = await response.json();

      if (response.ok) {
        setTotalMarcados(Number(data.total_marcados_revisao || 0));
      }
    } catch {
      // O card continua disponível mesmo se o resumo não carregar.
    }
  }

  useEffect(() => {
    void carregarResumo();
  }, []);

  async function carregarCentral() {
    setCarregando(true);
    setErro("");
    setMensagem("");
    setPreview(null);
    setSelecionados(new Set());
    setPagina(1);

    try {
      const params = new URLSearchParams();
      if (listaIdInicial) params.set("lista_id", listaIdInicial);

      const response = await fetch(
        `/api/contatos/revisao-telefones?${params.toString()}`,
        { cache: "no-store" }
      );
      const data = await response.json();

      if (!response.ok) {
        setErro(data.error || "Não foi possível analisar os telefones.");
        return;
      }

      setItens(Array.isArray(data.itens) ? data.itens : []);
    } catch {
      setErro("Não foi possível analisar os telefones.");
    } finally {
      setCarregando(false);
    }
  }

  async function abrirCentral() {
    setAberto(true);
    await carregarCentral();
  }

  function fecharCentral() {
    if (aplicando) return;
    setAberto(false);
    setPreview(null);
    setErro("");
    setMensagem("");
    setEditandoId(null);
    setTelefoneEdicao("");
  }

  const contagemPorTipo = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const item of itens) {
      mapa.set(item.tipo, (mapa.get(item.tipo) || 0) + 1);
    }
    return mapa;
  }, [itens]);

  const itensFiltrados = useMemo(
    () =>
      filtroTipo === "todos"
        ? itens
        : itens.filter((item) => item.tipo === filtroTipo),
    [filtroTipo, itens]
  );

  const totalPaginas = Math.max(
    1,
    Math.ceil(itensFiltrados.length / ITENS_POR_PAGINA)
  );
  const paginaSegura = Math.min(pagina, totalPaginas);
  const itensPagina = itensFiltrados.slice(
    (paginaSegura - 1) * ITENS_POR_PAGINA,
    paginaSegura * ITENS_POR_PAGINA
  );

  function alternarSelecionado(id: string) {
    setPreview(null);
    setErro("");
    setSelecionados((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }

  function selecionarFiltrados() {
    setPreview(null);
    const ids = itensFiltrados.slice(0, MAX_SELECAO).map((item) => item.id);
    setSelecionados(new Set(ids));

    if (itensFiltrados.length > MAX_SELECAO) {
      setErro(
        `Foram selecionados os primeiros ${MAX_SELECAO} contatos. Faça a correção em mais de uma operação.`
      );
    } else {
      setErro("");
    }
  }

  function selecionarSeguros() {
    setPreview(null);
    setFiltroTipo("todos");
    setPagina(1);
    setSelecionados(
      new Set(
        itens
          .filter((item) => item.sugestao_segura)
          .slice(0, MAX_SELECAO)
          .map((item) => item.id)
      )
    );
    setAcao("aplicar_sugestoes_seguras");
    setErro("");
  }

  function limparSelecao() {
    setSelecionados(new Set());
    setPreview(null);
  }

  const acaoPrecisaDdd =
    acao === "adicionar_ddd" || acao === "adicionar_ddd_nono";

  function iniciarEdicaoManual(item: ItemRevisao) {
    setErro("");
    setMensagem("");
    setPreview(null);
    setEditandoId(item.id);
    setTelefoneEdicao(item.telefone || "");
  }

  function cancelarEdicaoManual() {
    if (salvandoEdicaoId) return;
    setEditandoId(null);
    setTelefoneEdicao("");
  }

  async function salvarEdicaoManual(item: ItemRevisao) {
    const telefone = telefoneEdicao.trim();

    if (!telefone) {
      setErro("Informe o telefone corrigido.");
      return;
    }

    setSalvandoEdicaoId(item.id);
    setErro("");
    setMensagem("");

    try {
      const response = await fetch("/api/contatos/revisao-telefones", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: item.id,
          telefone,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        setErro(data.error || "Não foi possível salvar o telefone.");
        return;
      }

      setEditandoId(null);
      setTelefoneEdicao("");

      await Promise.all([
        carregarCentral(),
        carregarResumo(),
        Promise.resolve(onAtualizado?.()),
      ]);

      setMensagem(
        data.message ||
          (data.permanece_em_revisao
            ? "Telefone salvo, mas ainda precisa de revisão."
            : "Telefone corrigido com sucesso.")
      );
    } catch {
      setErro("Não foi possível salvar o telefone.");
    } finally {
      setSalvandoEdicaoId(null);
    }
  }

  async function solicitarPreview() {
    if (selecionados.size === 0) {
      setErro("Selecione ao menos um contato.");
      return;
    }

    if (acaoPrecisaDdd && ddd.replace(/\D/g, "").length !== 2) {
      setErro("Informe o DDD com 2 dígitos.");
      return;
    }

    setGerandoPreview(true);
    setErro("");
    setMensagem("");

    try {
      const response = await fetch("/api/contatos/revisao-telefones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modo: "preview",
          contato_ids: Array.from(selecionados),
          acao,
          ddd,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        setErro(data.error || "Não foi possível gerar a prévia.");
        return;
      }

      const previewData = data as PreviewResposta;

      if (previewData.resumo.corrigiveis === 0) {
        setPreview(null);

        if (previewData.resumo.conflitos > 0) {
          const quantidade = previewData.resumo.conflitos;
          setErro(
            quantidade === 1
              ? "Não foi possível corrigir o contato: o telefone corrigido já está cadastrado em outro contato."
              : `Não foi possível corrigir os contatos: ${quantidade} telefone(s) corrigido(s) já estão cadastrados em outros contatos.`
          );
          return;
        }

        if (previewData.resumo.ignorados > 0) {
          const quantidade = previewData.resumo.ignorados;
          setErro(
            `Nenhum contato pode ser corrigido com a ação selecionada. ${quantidade} contato(s) precisam de outra ação de correção ou edição manual.`
          );
          return;
        }

        setErro("Nenhum dos contatos selecionados possui uma correção que possa ser aplicada.");
        return;
      }

      setPreview(previewData);
    } catch {
      setErro("Não foi possível gerar a prévia.");
    } finally {
      setGerandoPreview(false);
    }
  }

  async function aplicarCorrecoes() {
    if (!preview || preview.resumo.corrigiveis === 0) return;

    setAplicando(true);
    setErro("");
    setMensagem("");

    try {
      const response = await fetch("/api/contatos/revisao-telefones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modo: "aplicar",
          contato_ids: Array.from(selecionados),
          acao,
          ddd,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        setErro(data.error || "Não foi possível aplicar as correções.");
        return;
      }

      setMensagem(
        data.message ||
          `${Number(data.atualizados || 0)} telefone(s) corrigido(s).`
      );
      setPreview(null);
      setSelecionados(new Set());

      await Promise.all([
        carregarCentral(),
        carregarResumo(),
        Promise.resolve(onAtualizado?.()),
      ]);
    } catch {
      setErro("Não foi possível aplicar as correções.");
    } finally {
      setAplicando(false);
    }
  }

  return (
    <>
      <section className={styles.banner}>
        <div className={styles.bannerText}>
          <span className={styles.eyebrow}>Qualidade dos contatos</span>
          <strong>
            {totalMarcados > 0
              ? `${totalMarcados} telefone(s) marcado(s) para revisão`
              : "Revisar telefones cadastrados"}
          </strong>
          <p>
            Corrija DDI, DDD, 9º dígito e prefixos em massa sem criar contatos
            duplicados.
          </p>
        </div>
        <button
          type="button"
          className={styles.openButton}
          onClick={() => void abrirCentral()}
        >
          Revisar telefones
        </button>
      </section>

      {aberto && (
        <div className={styles.overlay} onMouseDown={fecharCentral}>
          <div
            className={styles.modal}
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Central de revisão de telefones"
          >
            <header className={styles.header}>
              <div>
                <span className={styles.eyebrow}>Contatos</span>
                <h2>Central de revisão de telefones</h2>
                <p>
                  {listaIdInicial
                    ? "Analisando os contatos da lista atualmente selecionada."
                    : "Analisando contatos marcados para revisão e formatos brasileiros suspeitos já cadastrados."}
                </p>
              </div>
              <button
                type="button"
                className={styles.closeButton}
                onClick={fecharCentral}
                aria-label="Fechar"
              >
                ×
              </button>
            </header>

            {mensagem && <div className={styles.success}>{mensagem}</div>}

            {carregando ? (
              <div className={styles.loading}>
                Analisando telefones cadastrados...
              </div>
            ) : (
              <>
                <div className={styles.summary}>
                  <div>
                    <span>Precisam de análise</span>
                    <strong>{itens.length}</strong>
                  </div>
                  <div>
                    <span>Correção segura</span>
                    <strong>
                      {itens.filter((item) => item.sugestao_segura).length}
                    </strong>
                  </div>
                  <div>
                    <span>Sem DDD</span>
                    <strong>{contagemPorTipo.get("sem_ddd") || 0}</strong>
                  </div>
                  <div>
                    <span>Possível 9º dígito</span>
                    <strong>
                      {contagemPorTipo.get("celular_sem_nono") || 0}
                    </strong>
                  </div>
                </div>

                <div className={styles.controls}>
                  <label>
                    <span>Problema</span>
                    <select
                      value={filtroTipo}
                      onChange={(event) => {
                        setFiltroTipo(event.target.value);
                        setPagina(1);
                        setPreview(null);
                      }}
                    >
                      {OPCOES_TIPO.map(([valor, label]) => (
                        <option key={valor} value={valor}>
                          {label}
                          {valor === "todos"
                            ? ` (${itens.length})`
                            : ` (${contagemPorTipo.get(valor) || 0})`}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    <span>Ação</span>
                    <select
                      value={acao}
                      onChange={(event) => {
                        setAcao(event.target.value as Acao);
                        setPreview(null);
                        setErro("");
                      }}
                    >
                      <option value="aplicar_sugestoes_seguras">
                        Aplicar correções automáticas seguras
                      </option>
                      <option value="adicionar_ddd">
                        Adicionar DDD aos selecionados
                      </option>
                      <option value="adicionar_ddd_nono">
                        Adicionar DDD + 9º dígito
                      </option>
                      <option value="adicionar_nono">
                        Adicionar somente o 9º dígito sugerido
                      </option>
                    </select>
                  </label>

                  {acaoPrecisaDdd && (
                    <label className={styles.dddField}>
                      <span>DDD</span>
                      <input
                        value={ddd}
                        inputMode="numeric"
                        maxLength={2}
                        placeholder="31"
                        onChange={(event) => {
                          setDdd(event.target.value.replace(/\D/g, "").slice(0, 2));
                          setPreview(null);
                          setErro("");
                        }}
                      />
                    </label>
                  )}
                </div>

                <div className={styles.selectionBar}>
                  <div>
                    <strong>{selecionados.size}</strong> selecionado(s)
                  </div>
                  <div className={styles.selectionActions}>
                    <button type="button" onClick={selecionarFiltrados}>
                      Selecionar filtrados
                    </button>
                    <button type="button" onClick={selecionarSeguros}>
                      Selecionar correções seguras
                    </button>
                    <button type="button" onClick={limparSelecao}>
                      Limpar
                    </button>
                  </div>
                </div>

                {itensFiltrados.length === 0 ? (
                  <div className={styles.empty}>
                    Nenhum telefone encontrado nesta categoria.
                  </div>
                ) : (
                  <>
                    <div className={styles.list}>
                      {itensPagina.map((item) => {
                        const editando = editandoId === item.id;
                        const salvando = salvandoEdicaoId === item.id;

                        return (
                          <div className={styles.item} key={item.id}>
                            <input
                              type="checkbox"
                              checked={selecionados.has(item.id)}
                              onChange={() => alternarSelecionado(item.id)}
                              aria-label={`Selecionar ${item.nome || item.telefone}`}
                            />

                            <div className={styles.itemMain}>
                              <div className={styles.itemTitle}>
                                <strong>{item.nome || "Sem nome"}</strong>
                                <span>{item.label}</span>
                              </div>

                              {editando ? (
                                <div className={styles.manualEdit}>
                                  <label>
                                    <span>Telefone corrigido</span>
                                    <input
                                      autoFocus
                                      value={telefoneEdicao}
                                      inputMode="tel"
                                      placeholder="Ex.: 5531999999999"
                                      onChange={(event) =>
                                        setTelefoneEdicao(event.target.value)
                                      }
                                      onKeyDown={(event) => {
                                        if (event.key === "Enter") {
                                          event.preventDefault();
                                          void salvarEdicaoManual(item);
                                        }

                                        if (event.key === "Escape") {
                                          cancelarEdicaoManual();
                                        }
                                      }}
                                      disabled={salvando}
                                    />
                                  </label>

                                  <div className={styles.manualEditActions}>
                                    <button
                                      type="button"
                                      className={styles.manualSaveButton}
                                      onClick={() => void salvarEdicaoManual(item)}
                                      disabled={salvando}
                                    >
                                      {salvando ? "Salvando..." : "Salvar"}
                                    </button>
                                    <button
                                      type="button"
                                      className={styles.manualCancelButton}
                                      onClick={cancelarEdicaoManual}
                                      disabled={salvando}
                                    >
                                      Cancelar
                                    </button>
                                  </div>

                                  <small>
                                    Informe o número completo. Se estiver sem +55, o
                                    sistema adiciona automaticamente quando o DDD e o
                                    formato brasileiro forem identificados com segurança.
                                  </small>
                                </div>
                              ) : (
                                <>
                                  <div className={styles.phoneChange}>
                                    <code>{item.telefone || "—"}</code>
                                    {item.sugestao && (
                                      <>
                                        <span>→</span>
                                        <code>{item.sugestao}</code>
                                      </>
                                    )}
                                  </div>
                                  <p>{item.descricao}</p>
                                </>
                              )}
                            </div>

                            <div className={styles.itemStatus}>
                              {item.sugestao_segura ? (
                                <span className={styles.safe}>Automático</span>
                              ) : (
                                <span className={styles.review}>Revisar</span>
                              )}

                              {!editando && (
                                <button
                                  type="button"
                                  className={styles.editButton}
                                  onClick={() => iniciarEdicaoManual(item)}
                                >
                                  Editar
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className={styles.pagination}>
                      <span>
                        Página {paginaSegura} de {totalPaginas} ·{" "}
                        {itensFiltrados.length} contato(s)
                      </span>
                      <div>
                        <button
                          type="button"
                          onClick={() =>
                            setPagina((atual) => Math.max(1, atual - 1))
                          }
                          disabled={paginaSegura <= 1}
                        >
                          Anterior
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setPagina((atual) =>
                              Math.min(totalPaginas, atual + 1)
                            )
                          }
                          disabled={paginaSegura >= totalPaginas}
                        >
                          Próxima
                        </button>
                      </div>
                    </div>
                  </>
                )}

                <div className={styles.previewActions}>
                  <button
                    type="button"
                    className={styles.previewButton}
                    onClick={() => void solicitarPreview()}
                    disabled={gerandoPreview || selecionados.size === 0}
                  >
                    {gerandoPreview ? "Verificando..." : "Corrigir"}
                  </button>
                </div>

                {erro && (
                  <div className={styles.error} role="alert" aria-live="assertive">
                    {erro}
                  </div>
                )}

                {preview && (
                  <section className={styles.previewPanel}>
                    <div className={styles.previewHeader}>
                      <div>
                        <span className={styles.eyebrow}>Confirmação</span>
                        <h3>
                          {preview.resumo.corrigiveis} contato(s) serão alterados
                        </h3>
                      </div>
                      <div className={styles.previewStats}>
                        {preview.resumo.conflitos > 0 && (
                          <span>{preview.resumo.conflitos} conflito(s)</span>
                        )}
                        {preview.resumo.ignorados > 0 && (
                          <span>{preview.resumo.ignorados} ignorado(s)</span>
                        )}
                        {preview.resumo.permanecem_em_revisao > 0 && (
                          <span>
                            {preview.resumo.permanecem_em_revisao} continuam em
                            revisão
                          </span>
                        )}
                      </div>
                    </div>

                    <div className={styles.previewExamples}>
                      {preview.correcoes.slice(0, 6).map((item) => (
                        <div key={item.id}>
                          <strong>{item.nome || "Sem nome"}</strong>
                          <code>
                            {item.telefone_anterior} → {item.telefone}
                          </code>
                        </div>
                      ))}
                    </div>

                    {preview.resumo.conflitos > 0 && (
                      <p className={styles.conflictNote}>
                        Contatos que resultariam em telefone já cadastrado serão
                        ignorados automaticamente.
                      </p>
                    )}

                    <button
                      type="button"
                      className={styles.applyButton}
                      disabled={
                        aplicando || preview.resumo.corrigiveis === 0
                      }
                      onClick={() => void aplicarCorrecoes()}
                    >
                      {aplicando
                        ? "Aplicando correções..."
                        : `Confirmar ${preview.resumo.corrigiveis} correção(ões)`}
                    </button>
                  </section>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
