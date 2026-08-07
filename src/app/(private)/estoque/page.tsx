"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Archive,
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  History,
  PackagePlus,
  Pencil,
  Plus,
  Search,
  ShoppingBag,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import Header from "@/components/Header";
import FeedbackToast from "@/components/FeedbackToast";
import { useHeaderUser } from "@/components/header-user-context";
import styles from "./estoque.module.css";

type Aba = "estoque" | "catalogo" | "movimentacoes";
type Modal = "item" | "catalogo" | "movimentacao" | "baixa" | null;

type EstoqueItem = {
  id: string;
  codigo: string | null;
  nome: string;
  descricao: string | null;
  tipo: "produto" | "material" | "insumo";
  unidade: string;
  saldo: number | string;
  estoque_minimo: number | string;
  custo_unitario: number | string;
  preco_venda: number | string | null;
};

type Componente = {
  id?: string;
  estoque_item_id: string;
  quantidade: number | string;
};

type CatalogoItem = {
  id: string;
  codigo: string | null;
  nome: string;
  descricao: string | null;
  tipo: "produto" | "servico" | "procedimento" | "imovel";
  preco: number | string;
  estoque_item_id: string | null;
  imovel_id: string | null;
  composicao: Componente[];
};

type Movimentacao = {
  id: string;
  tipo: "entrada" | "saida" | "ajuste" | "venda" | "execucao";
  quantidade: number | string;
  saldo_anterior: number | string;
  saldo_posterior: number | string;
  origem_id: string | null;
  observacao: string | null;
  created_at: string;
  item: EstoqueItem | null;
  catalogo_item: CatalogoItem | null;
};

type Resumo = {
  itens_ativos: number;
  itens_estoque_baixo: number;
  valor_total: number;
  catalogo_ativo: number;
};

type ItemForm = {
  id: string;
  codigo: string;
  nome: string;
  descricao: string;
  tipo: EstoqueItem["tipo"];
  unidade: string;
  saldo_inicial: string;
  estoque_minimo: string;
  custo_unitario: string;
  preco_venda: string;
};

type CatalogoForm = {
  id: string;
  codigo: string;
  nome: string;
  descricao: string;
  tipo: CatalogoItem["tipo"];
  preco: string;
  estoque_item_id: string;
  composicao: Array<{ estoque_item_id: string; quantidade: string }>;
};

const ITEM_INICIAL: ItemForm = {
  id: "",
  codigo: "",
  nome: "",
  descricao: "",
  tipo: "produto",
  unidade: "un",
  saldo_inicial: "0",
  estoque_minimo: "0",
  custo_unitario: "0",
  preco_venda: "",
};

const CATALOGO_INICIAL: CatalogoForm = {
  id: "",
  codigo: "",
  nome: "",
  descricao: "",
  tipo: "servico",
  preco: "0",
  estoque_item_id: "",
  composicao: [],
};

const RESUMO_INICIAL: Resumo = {
  itens_ativos: 0,
  itens_estoque_baixo: 0,
  valor_total: 0,
  catalogo_ativo: 0,
};

const TIPO_ITEM_LABEL: Record<EstoqueItem["tipo"], string> = {
  produto: "Produto",
  material: "Material",
  insumo: "Insumo",
};

const TIPO_CATALOGO_LABEL: Record<CatalogoItem["tipo"], string> = {
  produto: "Produto",
  servico: "Serviço",
  procedimento: "Procedimento",
  imovel: "Imóvel",
};

const TIPO_MOVIMENTO_LABEL: Record<Movimentacao["tipo"], string> = {
  entrada: "Entrada",
  saida: "Saída",
  ajuste: "Ajuste",
  venda: "Venda",
  execucao: "Execução",
};

function moeda(valor: number | string | null | undefined) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(valor ?? 0));
}

function quantidade(valor: number | string, unidade?: string) {
  const numero = Number(valor);
  const formatado = new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 3,
  }).format(numero);
  return unidade ? `${formatado} ${unidade}` : formatado;
}

function dataHora(valor: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(valor));
}

export default function EstoquePage() {
  const { permissoes } = useHeaderUser();
  const [aba, setAba] = useState<Aba>("estoque");
  const [modal, setModal] = useState<Modal>(null);
  const [itens, setItens] = useState<EstoqueItem[]>([]);
  const [catalogo, setCatalogo] = useState<CatalogoItem[]>([]);
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([]);
  const [resumo, setResumo] = useState<Resumo>(RESUMO_INICIAL);
  const [busca, setBusca] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [itemForm, setItemForm] = useState<ItemForm>(ITEM_INICIAL);
  const [catalogoForm, setCatalogoForm] =
    useState<CatalogoForm>(CATALOGO_INICIAL);
  const [itemSelecionadoId, setItemSelecionadoId] = useState("");
  const [catalogoSelecionadoId, setCatalogoSelecionadoId] = useState("");
  const [movimentoTipo, setMovimentoTipo] = useState<"entrada" | "saida" | "ajuste">(
    "entrada",
  );
  const [movimentoQuantidade, setMovimentoQuantidade] = useState("1");
  const [baixaQuantidade, setBaixaQuantidade] = useState("1");
  const [origemId, setOrigemId] = useState("");
  const [observacao, setObservacao] = useState("");

  const podeGerenciar = permissoes.includes("estoque.gerenciar");
  const podeMovimentar = permissoes.includes("estoque.movimentar");

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");

    try {
      const response = await fetch("/api/estoque", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Erro ao carregar estoque.");

      setItens(data.itens ?? []);
      setCatalogo(data.catalogo ?? []);
      setMovimentacoes(data.movimentacoes ?? []);
      setResumo(data.resumo ?? RESUMO_INICIAL);
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao carregar estoque.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const termo = busca.trim().toLocaleLowerCase("pt-BR");
  const itensFiltrados = useMemo(
    () =>
      itens.filter((item) =>
        [item.nome, item.codigo, item.descricao, TIPO_ITEM_LABEL[item.tipo]]
          .filter(Boolean)
          .some((valor) => String(valor).toLocaleLowerCase("pt-BR").includes(termo)),
      ),
    [itens, termo],
  );
  const catalogoFiltrado = useMemo(
    () =>
      catalogo.filter((item) =>
        [item.nome, item.codigo, item.descricao, TIPO_CATALOGO_LABEL[item.tipo]]
          .filter(Boolean)
          .some((valor) => String(valor).toLocaleLowerCase("pt-BR").includes(termo)),
      ),
    [catalogo, termo],
  );
  const movimentosFiltrados = useMemo(
    () =>
      movimentacoes.filter((movimento) =>
        [
          movimento.item?.nome,
          movimento.catalogo_item?.nome,
          movimento.observacao,
          movimento.origem_id,
          TIPO_MOVIMENTO_LABEL[movimento.tipo],
        ]
          .filter(Boolean)
          .some((valor) => String(valor).toLocaleLowerCase("pt-BR").includes(termo)),
      ),
    [movimentacoes, termo],
  );

  async function enviar(payload: Record<string, unknown>) {
    setSalvando(true);
    setErro("");

    try {
      const response = await fetch("/api/estoque", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Não foi possível salvar.");

      setSucesso(data.message || "Operação concluída.");
      setModal(null);
      await carregar();
      return true;
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível salvar.");
      return false;
    } finally {
      setSalvando(false);
    }
  }

  function abrirNovoItem() {
    setItemForm(ITEM_INICIAL);
    setErro("");
    setModal("item");
  }

  function abrirEditarItem(item: EstoqueItem) {
    setItemForm({
      id: item.id,
      codigo: item.codigo ?? "",
      nome: item.nome,
      descricao: item.descricao ?? "",
      tipo: item.tipo,
      unidade: item.unidade,
      saldo_inicial: String(item.saldo),
      estoque_minimo: String(item.estoque_minimo),
      custo_unitario: String(item.custo_unitario),
      preco_venda: item.preco_venda === null ? "" : String(item.preco_venda),
    });
    setErro("");
    setModal("item");
  }

  function abrirMovimentacao(item?: EstoqueItem, tipo: "entrada" | "saida" | "ajuste" = "entrada") {
    setItemSelecionadoId(item?.id ?? itens[0]?.id ?? "");
    setMovimentoTipo(tipo);
    setMovimentoQuantidade(tipo === "ajuste" && item ? String(item.saldo) : "1");
    setObservacao("");
    setErro("");
    setModal("movimentacao");
  }

  function abrirNovoCatalogo() {
    setCatalogoForm(CATALOGO_INICIAL);
    setErro("");
    setModal("catalogo");
  }

  function abrirEditarCatalogo(item: CatalogoItem) {
    setCatalogoForm({
      id: item.id,
      codigo: item.codigo ?? "",
      nome: item.nome,
      descricao: item.descricao ?? "",
      tipo: item.tipo,
      preco: String(item.preco),
      estoque_item_id: item.estoque_item_id ?? "",
      composicao: item.composicao.map((componente) => ({
        estoque_item_id: componente.estoque_item_id,
        quantidade: String(componente.quantidade),
      })),
    });
    setErro("");
    setModal("catalogo");
  }

  function abrirBaixa(item: CatalogoItem) {
    setCatalogoSelecionadoId(item.id);
    setBaixaQuantidade("1");
    setOrigemId("");
    setObservacao("");
    setErro("");
    setModal("baixa");
  }

  function adicionarComponente() {
    const primeiroDisponivel = itens.find(
      (item) =>
        !catalogoForm.composicao.some(
          (componente) => componente.estoque_item_id === item.id,
        ),
    );
    if (!primeiroDisponivel) return;

    setCatalogoForm((atual) => ({
      ...atual,
      composicao: [
        ...atual.composicao,
        { estoque_item_id: primeiroDisponivel.id, quantidade: "1" },
      ],
    }));
  }

  async function arquivar(tipo: "item" | "catalogo", id: string, nome: string) {
    if (!window.confirm(`Arquivar “${nome}”? O histórico será preservado.`)) return;
    await enviar({ acao: tipo === "item" ? "arquivar_item" : "arquivar_catalogo", id });
  }

  const catalogoSelecionado = catalogo.find(
    (item) => item.id === catalogoSelecionadoId,
  );
  const itemSelecionado = itens.find((item) => item.id === itemSelecionadoId);

  return (
    <>
      <Header
        title="Estoque"
        subtitle="Controle produtos e insumos vinculados às vendas, serviços e procedimentos."
      />

      <main className={styles.page}>
        <section className={styles.hero}>
          <div>
            <span className={styles.eyebrow}>Operação integrada</span>
            <h1>Visão geral do estoque</h1>
            <p>
              Acompanhe saldos, custos e baixas automáticas em uma única operação.
            </p>
          </div>
          <div className={styles.heroActions}>
            {podeMovimentar ? (
              <button className={styles.secondaryButton} onClick={() => abrirMovimentacao()}>
                <ArrowDownToLine size={17} /> Movimentar
              </button>
            ) : null}
            {podeGerenciar ? (
              <button className={styles.primaryButton} onClick={abrirNovoItem}>
                <PackagePlus size={17} /> Novo item
              </button>
            ) : null}
          </div>
        </section>

        <section className={styles.metrics}>
          <article className={styles.metricCard}>
            <span className={styles.metricIcon}><Boxes size={20} /></span>
            <div><strong>{resumo.itens_ativos}</strong><span>Itens ativos</span></div>
          </article>
          <article className={`${styles.metricCard} ${resumo.itens_estoque_baixo ? styles.metricWarning : ""}`}>
            <span className={styles.metricIcon}><AlertTriangle size={20} /></span>
            <div><strong>{resumo.itens_estoque_baixo}</strong><span>Estoque baixo</span></div>
          </article>
          <article className={styles.metricCard}>
            <span className={styles.metricIcon}><CircleDollarSign size={20} /></span>
            <div><strong>{moeda(resumo.valor_total)}</strong><span>Valor em estoque</span></div>
          </article>
          <article className={styles.metricCard}>
            <span className={styles.metricIcon}><ClipboardList size={20} /></span>
            <div><strong>{resumo.catalogo_ativo}</strong><span>Itens no catálogo</span></div>
          </article>
        </section>

        {erro ? <div className={styles.error}><AlertTriangle size={18} />{erro}</div> : null}

        <section className={styles.workspace}>
          <div className={styles.tabs} role="tablist" aria-label="Áreas do estoque">
            <button className={aba === "estoque" ? styles.tabActive : ""} onClick={() => setAba("estoque")}>
              <Boxes size={17} /> Estoque
            </button>
            <button className={aba === "catalogo" ? styles.tabActive : ""} onClick={() => setAba("catalogo")}>
              <ShoppingBag size={17} /> Produtos e serviços
            </button>
            <button className={aba === "movimentacoes" ? styles.tabActive : ""} onClick={() => setAba("movimentacoes")}>
              <History size={17} /> Histórico
            </button>
          </div>

          <div className={styles.toolbar}>
            <label className={styles.searchBox}>
              <Search size={18} />
              <input value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Buscar por nome, código ou tipo" />
            </label>
            {aba === "estoque" && podeGerenciar ? (
              <button className={styles.primaryButton} onClick={abrirNovoItem}><Plus size={17} /> Novo item</button>
            ) : null}
            {aba === "catalogo" && podeGerenciar ? (
              <button className={styles.primaryButton} onClick={abrirNovoCatalogo}><Plus size={17} /> Novo produto ou serviço</button>
            ) : null}
          </div>

          {carregando ? <div className={styles.empty}>Carregando dados do estoque...</div> : null}

          {!carregando && aba === "estoque" ? (
            itensFiltrados.length ? (
              <div className={styles.inventoryGrid}>
                {itensFiltrados.map((item) => {
                  const baixo = Number(item.saldo) <= Number(item.estoque_minimo);
                  return (
                    <article className={`${styles.inventoryCard} ${baixo ? styles.lowCard : ""}`} key={item.id}>
                      <div className={styles.cardTop}>
                        <span className={styles.typeBadge}>{TIPO_ITEM_LABEL[item.tipo]}</span>
                        {baixo ? <span className={styles.lowBadge}><AlertTriangle size={13} /> Estoque baixo</span> : null}
                      </div>
                      <div className={styles.itemTitle}>
                        <div className={styles.productIcon}><Boxes size={22} /></div>
                        <div><h3>{item.nome}</h3><p>{item.codigo || "Sem código"}</p></div>
                      </div>
                      <div className={styles.stockLine}>
                        <div><span>Saldo atual</span><strong>{quantidade(item.saldo, item.unidade)}</strong></div>
                        <div><span>Mínimo</span><strong>{quantidade(item.estoque_minimo, item.unidade)}</strong></div>
                      </div>
                      <div className={styles.costLine}><span>Custo unitário</span><strong>{moeda(item.custo_unitario)}</strong></div>
                      <div className={styles.cardActions}>
                        {podeMovimentar ? <button onClick={() => abrirMovimentacao(item, "entrada")}><ArrowDownToLine size={15} /> Entrada</button> : null}
                        {podeMovimentar ? <button onClick={() => abrirMovimentacao(item, "saida")}><ArrowUpFromLine size={15} /> Saída</button> : null}
                        {podeGerenciar ? <button className={styles.iconButton} aria-label={`Editar ${item.nome}`} onClick={() => abrirEditarItem(item)}><Pencil size={16} /></button> : null}
                        {podeGerenciar ? <button className={`${styles.iconButton} ${styles.dangerIcon}`} aria-label={`Arquivar ${item.nome}`} onClick={() => void arquivar("item", item.id, item.nome)}><Archive size={16} /></button> : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : <div className={styles.empty}>Nenhum item encontrado.</div>
          ) : null}

          {!carregando && aba === "catalogo" ? (
            catalogoFiltrado.length ? (
              <div className={styles.catalogList}>
                {catalogoFiltrado.map((item) => {
                  const itemEstoque = itens.find((estoqueItem) => estoqueItem.id === item.estoque_item_id);
                  return (
                    <article className={styles.catalogCard} key={item.id}>
                      <div className={styles.catalogIcon}>{item.tipo === "produto" ? <ShoppingBag size={22} /> : <Wrench size={22} />}</div>
                      <div className={styles.catalogMain}>
                        <div className={styles.catalogHeading}>
                          <div><span className={styles.typeBadge}>{TIPO_CATALOGO_LABEL[item.tipo]}</span><h3>{item.nome}</h3><p>{item.descricao || item.codigo || "Sem descrição"}</p></div>
                          <strong>{moeda(item.preco)}</strong>
                        </div>
                        <div className={styles.compositionLine}>
                          {item.tipo === "produto" && itemEstoque ? (
                            <span>Baixa direta: 1 {itemEstoque.unidade} de {itemEstoque.nome}</span>
                          ) : item.composicao.length ? (
                            item.composicao.map((componente) => {
                              const insumo = itens.find((estoqueItem) => estoqueItem.id === componente.estoque_item_id);
                              return <span key={componente.estoque_item_id}>{quantidade(componente.quantidade, insumo?.unidade)} de {insumo?.nome || "Item indisponível"}</span>;
                            })
                          ) : <span className={styles.mutedBadge}>Sem insumos vinculados</span>}
                        </div>
                      </div>
                      <div className={styles.catalogActions}>
                        {podeMovimentar ? <button className={styles.primaryButton} onClick={() => abrirBaixa(item)}>Registrar {item.tipo === "produto" ? "venda" : "execução"}<ChevronRight size={16} /></button> : null}
                        {podeGerenciar ? <button className={styles.iconButton} aria-label={`Editar ${item.nome}`} onClick={() => abrirEditarCatalogo(item)}><Pencil size={16} /></button> : null}
                        {podeGerenciar ? <button className={`${styles.iconButton} ${styles.dangerIcon}`} aria-label={`Arquivar ${item.nome}`} onClick={() => void arquivar("catalogo", item.id, item.nome)}><Archive size={16} /></button> : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : <div className={styles.empty}>Nenhum produto ou serviço encontrado.</div>
          ) : null}

          {!carregando && aba === "movimentacoes" ? (
            movimentosFiltrados.length ? (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead><tr><th>Data</th><th>Item</th><th>Origem</th><th>Tipo</th><th>Quantidade</th><th>Saldo</th></tr></thead>
                  <tbody>{movimentosFiltrados.map((movimento) => (
                    <tr key={movimento.id}>
                      <td>{dataHora(movimento.created_at)}</td>
                      <td><strong>{movimento.item?.nome || "Item arquivado"}</strong><small>{movimento.observacao || "Sem observação"}</small></td>
                      <td>{movimento.catalogo_item?.nome || movimento.origem_id || "Manual"}</td>
                      <td><span className={`${styles.movementBadge} ${styles[`movement_${movimento.tipo}`]}`}>{TIPO_MOVIMENTO_LABEL[movimento.tipo]}</span></td>
                      <td>{quantidade(movimento.quantidade, movimento.item?.unidade)}</td>
                      <td>{quantidade(movimento.saldo_anterior)} → {quantidade(movimento.saldo_posterior)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : <div className={styles.empty}>Nenhuma movimentação encontrada.</div>
          ) : null}
        </section>
      </main>

      {modal ? (
        <div className={styles.modalOverlay} role="presentation" onMouseDown={() => !salvando && setModal(null)}>
          <section className={styles.modal} role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <header className={styles.modalHeader}>
              <div>
                <span className={styles.eyebrow}>{modal === "item" ? "Cadastro de estoque" : modal === "catalogo" ? "Catálogo integrado" : "Movimentação"}</span>
                <h2>{modal === "item" ? (itemForm.id ? "Editar item" : "Novo item") : modal === "catalogo" ? (catalogoForm.id ? "Editar produto ou serviço" : "Novo produto ou serviço") : modal === "baixa" ? `Registrar ${catalogoSelecionado?.tipo === "produto" ? "venda" : "execução"}` : "Movimentar estoque"}</h2>
              </div>
              <button className={styles.iconButton} aria-label="Fechar" disabled={salvando} onClick={() => setModal(null)}><X size={19} /></button>
            </header>

            {modal === "item" ? (
              <div className={styles.modalBody}>
                <div className={styles.formGrid}>
                  <label className={`${styles.field} ${styles.fullField}`}><span>Nome *</span><input value={itemForm.nome} onChange={(event) => setItemForm((atual) => ({ ...atual, nome: event.target.value }))} placeholder="Ex.: Luva nitrílica" /></label>
                  <label className={styles.field}><span>Código</span><input value={itemForm.codigo} onChange={(event) => setItemForm((atual) => ({ ...atual, codigo: event.target.value }))} placeholder="SKU-001" /></label>
                  <label className={styles.field}><span>Tipo</span><select value={itemForm.tipo} onChange={(event) => setItemForm((atual) => ({ ...atual, tipo: event.target.value as EstoqueItem["tipo"] }))}><option value="produto">Produto</option><option value="material">Material</option><option value="insumo">Insumo</option></select></label>
                  <label className={styles.field}><span>Unidade</span><select value={itemForm.unidade} onChange={(event) => setItemForm((atual) => ({ ...atual, unidade: event.target.value }))}>{[["un", "Unidade"], ["cx", "Caixa"], ["pct", "Pacote"], ["kg", "Quilograma"], ["g", "Grama"], ["l", "Litro"], ["ml", "Mililitro"], ["m", "Metro"], ["cm", "Centímetro"]].map(([valor, label]) => <option key={valor} value={valor}>{label}</option>)}</select></label>
                  {!itemForm.id ? <label className={styles.field}><span>Saldo inicial</span><input type="number" min="0" step="0.001" value={itemForm.saldo_inicial} onChange={(event) => setItemForm((atual) => ({ ...atual, saldo_inicial: event.target.value }))} /></label> : null}
                  <label className={styles.field}><span>Estoque mínimo</span><input type="number" min="0" step="0.001" value={itemForm.estoque_minimo} onChange={(event) => setItemForm((atual) => ({ ...atual, estoque_minimo: event.target.value }))} /></label>
                  <label className={styles.field}><span>Custo unitário</span><input type="number" min="0" step="0.01" value={itemForm.custo_unitario} onChange={(event) => setItemForm((atual) => ({ ...atual, custo_unitario: event.target.value }))} /></label>
                  <label className={styles.field}><span>Preço de venda</span><input type="number" min="0" step="0.01" value={itemForm.preco_venda} onChange={(event) => setItemForm((atual) => ({ ...atual, preco_venda: event.target.value }))} /></label>
                  <label className={`${styles.field} ${styles.fullField}`}><span>Descrição</span><textarea value={itemForm.descricao} onChange={(event) => setItemForm((atual) => ({ ...atual, descricao: event.target.value }))} placeholder="Informações internas sobre o item" /></label>
                </div>
              </div>
            ) : null}

            {modal === "catalogo" ? (
              <div className={styles.modalBody}>
                <div className={styles.formGrid}>
                  <label className={`${styles.field} ${styles.fullField}`}><span>Nome *</span><input value={catalogoForm.nome} onChange={(event) => setCatalogoForm((atual) => ({ ...atual, nome: event.target.value }))} placeholder="Ex.: Limpeza periodontal" /></label>
                  <label className={styles.field}><span>Código</span><input value={catalogoForm.codigo} onChange={(event) => setCatalogoForm((atual) => ({ ...atual, codigo: event.target.value }))} /></label>
                  <label className={styles.field}><span>Tipo</span><select value={catalogoForm.tipo} onChange={(event) => setCatalogoForm((atual) => ({ ...atual, tipo: event.target.value as CatalogoItem["tipo"], estoque_item_id: "" }))}><option value="produto">Produto</option><option value="servico">Serviço</option><option value="procedimento">Procedimento</option><option value="imovel">Imóvel</option></select></label>
                  <label className={styles.field}><span>Preço</span><input type="number" min="0" step="0.01" value={catalogoForm.preco} onChange={(event) => setCatalogoForm((atual) => ({ ...atual, preco: event.target.value }))} /></label>
                  {catalogoForm.tipo === "produto" ? <label className={styles.field}><span>Item que terá baixa *</span><select value={catalogoForm.estoque_item_id} onChange={(event) => setCatalogoForm((atual) => ({ ...atual, estoque_item_id: event.target.value }))}><option value="">Selecione</option>{itens.map((item) => <option key={item.id} value={item.id}>{item.nome} · {quantidade(item.saldo, item.unidade)}</option>)}</select></label> : null}
                  <label className={`${styles.field} ${styles.fullField}`}><span>Descrição</span><textarea value={catalogoForm.descricao} onChange={(event) => setCatalogoForm((atual) => ({ ...atual, descricao: event.target.value }))} /></label>
                </div>
                {catalogoForm.tipo !== "produto" ? (
                  <div className={styles.compositionEditor}>
                    <div className={styles.sectionHeading}><div><h3>Composição de insumos</h3><p>Defina o consumo para cada unidade executada.</p></div><button className={styles.secondaryButton} type="button" onClick={adicionarComponente} disabled={catalogoForm.composicao.length >= itens.length}><Plus size={16} /> Adicionar insumo</button></div>
                    {catalogoForm.composicao.length ? catalogoForm.composicao.map((componente, indice) => (
                      <div className={styles.componentRow} key={`${componente.estoque_item_id}-${indice}`}>
                        <select value={componente.estoque_item_id} onChange={(event) => setCatalogoForm((atual) => ({ ...atual, composicao: atual.composicao.map((item, itemIndice) => itemIndice === indice ? { ...item, estoque_item_id: event.target.value } : item) }))}>{itens.map((item) => <option key={item.id} value={item.id} disabled={catalogoForm.composicao.some((outro, outroIndice) => outroIndice !== indice && outro.estoque_item_id === item.id)}>{item.nome} ({item.unidade})</option>)}</select>
                        <input type="number" min="0.001" step="0.001" value={componente.quantidade} onChange={(event) => setCatalogoForm((atual) => ({ ...atual, composicao: atual.composicao.map((item, itemIndice) => itemIndice === indice ? { ...item, quantidade: event.target.value } : item) }))} />
                        <button className={`${styles.iconButton} ${styles.dangerIcon}`} type="button" aria-label="Remover insumo" onClick={() => setCatalogoForm((atual) => ({ ...atual, composicao: atual.composicao.filter((_, itemIndice) => itemIndice !== indice) }))}><Trash2 size={16} /></button>
                      </div>
                    )) : <div className={styles.compositionEmpty}>Nenhum insumo vinculado. O item poderá permanecer no catálogo, mas a baixa exigirá uma composição.</div>}
                  </div>
                ) : null}
              </div>
            ) : null}

            {modal === "movimentacao" ? (
              <div className={styles.modalBody}>
                <div className={styles.formGrid}>
                  <label className={`${styles.field} ${styles.fullField}`}><span>Item *</span><select value={itemSelecionadoId} onChange={(event) => setItemSelecionadoId(event.target.value)}><option value="">Selecione</option>{itens.map((item) => <option key={item.id} value={item.id}>{item.nome} · saldo {quantidade(item.saldo, item.unidade)}</option>)}</select></label>
                  <label className={styles.field}><span>Movimento</span><select value={movimentoTipo} onChange={(event) => setMovimentoTipo(event.target.value as "entrada" | "saida" | "ajuste")}><option value="entrada">Entrada</option><option value="saida">Saída manual</option><option value="ajuste">Ajuste de inventário</option></select></label>
                  <label className={styles.field}><span>{movimentoTipo === "ajuste" ? "Novo saldo" : "Quantidade"}</span><input type="number" min="0" step="0.001" value={movimentoQuantidade} onChange={(event) => setMovimentoQuantidade(event.target.value)} /></label>
                  <label className={`${styles.field} ${styles.fullField}`}><span>Observação</span><textarea value={observacao} onChange={(event) => setObservacao(event.target.value)} placeholder="Ex.: Compra NF 1234 ou ajuste da contagem física" /></label>
                </div>
                {itemSelecionado ? <div className={styles.infoBox}>Saldo atual: <strong>{quantidade(itemSelecionado.saldo, itemSelecionado.unidade)}</strong></div> : null}
              </div>
            ) : null}

            {modal === "baixa" ? (
              <div className={styles.modalBody}>
                <div className={styles.saleSummary}><span className={styles.catalogIcon}>{catalogoSelecionado?.tipo === "produto" ? <ShoppingBag size={22} /> : <Wrench size={22} />}</span><div><strong>{catalogoSelecionado?.nome}</strong><span>{catalogoSelecionado ? TIPO_CATALOGO_LABEL[catalogoSelecionado.tipo] : ""}</span></div></div>
                <div className={styles.formGrid}>
                  <label className={styles.field}><span>Quantidade *</span><input type="number" min="0.001" step="0.001" value={baixaQuantidade} onChange={(event) => setBaixaQuantidade(event.target.value)} /></label>
                  <label className={styles.field}><span>Referência da venda/agendamento</span><input value={origemId} onChange={(event) => setOrigemId(event.target.value)} placeholder="Opcional" /></label>
                  <label className={`${styles.field} ${styles.fullField}`}><span>Observação</span><textarea value={observacao} onChange={(event) => setObservacao(event.target.value)} /></label>
                </div>
                <div className={styles.infoBox}>A operação valida todos os saldos antes de baixar. Se faltar qualquer insumo, nenhuma movimentação será realizada.</div>
              </div>
            ) : null}

            {erro ? <div className={`${styles.error} ${styles.modalError}`}><AlertTriangle size={17} />{erro}</div> : null}

            <footer className={styles.modalFooter}>
              <button className={styles.secondaryButton} disabled={salvando} onClick={() => setModal(null)}>Cancelar</button>
              {modal === "item" ? <button className={styles.primaryButton} disabled={salvando || !itemForm.nome.trim()} onClick={() => void enviar({ acao: "salvar_item", ...itemForm })}>{salvando ? "Salvando..." : "Salvar item"}</button> : null}
              {modal === "catalogo" ? <button className={styles.primaryButton} disabled={salvando || !catalogoForm.nome.trim()} onClick={() => void enviar({ acao: "salvar_catalogo", ...catalogoForm })}>{salvando ? "Salvando..." : "Salvar catálogo"}</button> : null}
              {modal === "movimentacao" ? <button className={styles.primaryButton} disabled={salvando || !itemSelecionadoId} onClick={() => void enviar({ acao: "movimentar", estoque_item_id: itemSelecionadoId, tipo: movimentoTipo, quantidade: movimentoQuantidade, observacao })}>{salvando ? "Registrando..." : "Registrar movimento"}</button> : null}
              {modal === "baixa" ? <button className={styles.primaryButton} disabled={salvando || !catalogoSelecionadoId} onClick={() => void enviar({ acao: "registrar_baixa", catalogo_servico_id: catalogoSelecionadoId, quantidade: baixaQuantidade, origem_id: origemId, observacao })}>{salvando ? "Registrando..." : "Confirmar baixa"}</button> : null}
            </footer>
          </section>
        </div>
      ) : null}

      {sucesso ? <FeedbackToast success={sucesso} onSuccessDismiss={() => setSucesso("")} /> : null}
    </>
  );
}
