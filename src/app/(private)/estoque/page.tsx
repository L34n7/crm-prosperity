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
  ClipboardCheck,
  FileSpreadsheet,
  History,
  Layers3,
  MapPin,
  PackagePlus,
  Pencil,
  Plus,
  Search,
  Settings,
  Warehouse,
  Tags,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Stethoscope,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import Header from "@/components/Header";
import FeedbackToast from "@/components/FeedbackToast";
import ComprasPanel from "@/components/estoque/ComprasPanel";
import ImportacaoProdutosModal from "@/components/estoque/ImportacaoProdutosModal";
import { useHeaderUser } from "@/components/header-user-context";
import styles from "./estoque.module.css";

type Aba = "estoque" | "catalogo" | "compras" | "movimentacoes" | "depositos" | "localizacoes" | "lotes" | "reservas" | "inventarios" | "clinico" | "cadastros" | "configuracoes";
type Modal = "item" | "catalogo" | "movimentacao" | "baixa" | "inventario" | "localizacao" | "categoria" | "marca" | null;

type EstoqueItem = {
  id: string;
  codigo: string | null;
  nome: string;
  descricao: string | null;
  tipo: "produto" | "material" | "insumo";
  unidade: string;
  saldo: number | string;
  saldo_reservado: number | string;
  saldo_disponivel: number | string;
  estoque_minimo: number | string;
  custo_unitario: number | string;
  preco_venda: number | string | null;
  sku: string | null;
  codigo_barras: string | null;
  categoria_id: string | null;
  marca_id: string | null;
  controla_lote: boolean;
  controla_validade: boolean;
  controla_serie: boolean;
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
  tipo: "saldo_inicial" | "entrada" | "saida" | "ajuste" | "transferencia" | "reserva" | "consumo" | "liberacao" | "estorno" | "venda" | "execucao";
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

type Deposito = { id: string; codigo: string; nome: string; descricao: string | null; principal: boolean; permite_saldo_negativo: boolean };
type Saldo = { id: string; estoque_item_id: string; deposito_id: string; localizacao_id: string | null; lote_id: string | null; numero_serie: string | null; saldo_fisico: number | string; saldo_reservado: number | string; saldo_transito: number | string; custo_medio: number | string };
type Lote = { id: string; estoque_item_id: string; codigo: string; validade: string | null; fabricante: string | null; bloqueado: boolean };
type Reserva = { id: string; estoque_item_id: string; deposito_id: string; quantidade: number | string; consumida: number | string; origem_tipo: string; origem_id: string; expira_em: string | null };
type Localizacao = { id: string; deposito_id: string; codigo: string; nome: string };
type Categoria = { id: string; nome: string; categoria_pai_id: string | null };
type Marca = { id: string; nome: string };
type InventarioItem = { id: string; estoque_item_id: string; saldo_esperado: number | string; primeira_contagem: number | string | null; segunda_contagem: number | string | null; quantidade_aprovada: number | string | null; divergencia: number | string | null; justificativa: string | null };
type Inventario = { id: string; numero: number | string; deposito_id: string; status: string; tipo_contagem: string; descricao: string; created_at: string; itens: InventarioItem[] };
type ConsumoClinico = { id: string; agendamento_id: string; estoque_item_id: string; lote_id: string | null; dente: string | null; quantidade: number | string; status: string; consumido_em: string; estornado_em: string | null };
type Configuracoes = { modo: "simples" | "avancado"; metodo_custo: "medio" | "fifo"; bloquear_negativo: boolean; exigir_justificativa_ajuste: boolean; selecionar_lote_fefo: boolean; dias_alerta_validade: number };

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
  sku: string;
  codigo_barras: string;
  categoria_id: string;
  marca_id: string;
  deposito_inicial_id: string;
  controla_lote: boolean;
  controla_validade: boolean;
  controla_serie: boolean;
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
  sku: "",
  codigo_barras: "",
  categoria_id: "",
  marca_id: "",
  deposito_inicial_id: "",
  controla_lote: false,
  controla_validade: false,
  controla_serie: false,
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
  saldo_inicial: "Saldo inicial",
  entrada: "Entrada",
  saida: "Saída",
  ajuste: "Ajuste",
  transferencia: "Transferência",
  reserva: "Reserva",
  consumo: "Consumo",
  liberacao: "Liberação",
  estorno: "Estorno",
  venda: "Venda",
  execucao: "Execução",
};

const ABA_INFO: Record<Aba, { titulo: string; descricao: string }> = {
  estoque: { titulo: "Itens em estoque", descricao: "Saldos, disponibilidade e custos dos produtos e insumos." },
  catalogo: { titulo: "Produtos e serviços", descricao: "Itens comerciais e regras de baixa automática no estoque." },
  compras: { titulo: "Compras e fornecedores", descricao: "Pedidos, documentos fiscais, recebimentos e parceiros." },
  movimentacoes: { titulo: "Histórico de movimentações", descricao: "Rastreabilidade completa de entradas, saídas e ajustes." },
  depositos: { titulo: "Depósitos", descricao: "Estrutura física e regras de saldo por unidade de armazenagem." },
  localizacoes: { titulo: "Localizações", descricao: "Endereçamento interno dos produtos dentro dos depósitos." },
  lotes: { titulo: "Lotes e validade", descricao: "Controle de rastreabilidade, fabricação e vencimentos." },
  reservas: { titulo: "Reservas", descricao: "Quantidades comprometidas antes do consumo ou da venda." },
  inventarios: { titulo: "Inventários", descricao: "Contagens físicas, divergências e ajustes aprovados." },
  clinico: { titulo: "Histórico clínico", descricao: "Consumos vinculados a atendimentos e procedimentos." },
  cadastros: { titulo: "Categorias e marcas", descricao: "Classificações que mantêm o catálogo organizado." },
  configuracoes: { titulo: "Configurações", descricao: "Políticas de custo, validade, ajustes e estoque negativo." },
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
  const [importandoProdutos, setImportandoProdutos] = useState(false);
  const [itens, setItens] = useState<EstoqueItem[]>([]);
  const [catalogo, setCatalogo] = useState<CatalogoItem[]>([]);
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([]);
  const [resumo, setResumo] = useState<Resumo>(RESUMO_INICIAL);
  const [depositos, setDepositos] = useState<Deposito[]>([]);
  const [saldos, setSaldos] = useState<Saldo[]>([]);
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [localizacoes, setLocalizacoes] = useState<Localizacao[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [inventarios, setInventarios] = useState<Inventario[]>([]);
  const [consumosClinicos, setConsumosClinicos] = useState<ConsumoClinico[]>([]);
  const [configuracoes, setConfiguracoes] = useState<Configuracoes>({ modo: "simples", metodo_custo: "medio", bloquear_negativo: true, exigir_justificativa_ajuste: true, selecionar_lote_fefo: true, dias_alerta_validade: 60 });
  const [depositoOrigemId, setDepositoOrigemId] = useState("");
  const [depositoDestinoId, setDepositoDestinoId] = useState("");
  const [localizacaoId, setLocalizacaoId] = useState("");
  const [loteId, setLoteId] = useState("");
  const [numeroSerie, setNumeroSerie] = useState("");
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
  const [inventarioDepositoId, setInventarioDepositoId] = useState("");
  const [inventarioDescricao, setInventarioDescricao] = useState("");
  const [inventarioContagens, setInventarioContagens] = useState<Record<string, string>>({});
  const [cadastroNome, setCadastroNome] = useState("");
  const [localizacaoForm, setLocalizacaoForm] = useState({ deposito_id: "", codigo: "", nome: "" });

  const podeGerenciar = permissoes.includes("estoque.gerenciar");
  const podeMovimentar = permissoes.includes("estoque.movimentar");
  const podeConfigurar = permissoes.includes("estoque.configurar");

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
      setDepositos(data.depositos ?? []);
      setSaldos(data.saldos ?? []);
      setLotes(data.lotes ?? []);
      setReservas(data.reservas ?? []);
      setLocalizacoes(data.localizacoes ?? []);
      setCategorias(data.categorias ?? []);
      setMarcas(data.marcas ?? []);
      setInventarios(data.inventarios ?? []);
      setConsumosClinicos(data.consumos_clinicos ?? []);
      if (data.configuracoes) setConfiguracoes(data.configuracoes);
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
    const principal = depositos.find((deposito) => deposito.principal) ?? depositos[0];
    setItemForm({ ...ITEM_INICIAL, deposito_inicial_id: principal?.id ?? "" });
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
      sku: item.sku ?? "",
      codigo_barras: item.codigo_barras ?? "",
      categoria_id: item.categoria_id ?? "",
      marca_id: item.marca_id ?? "",
      deposito_inicial_id: "",
      controla_lote: item.controla_lote,
      controla_validade: item.controla_validade,
      controla_serie: item.controla_serie,
    });
    setErro("");
    setModal("item");
  }

  function abrirMovimentacao(item?: EstoqueItem, tipo: "entrada" | "saida" | "ajuste" = "entrada") {
    setItemSelecionadoId(item?.id ?? itens[0]?.id ?? "");
    setMovimentoTipo(tipo);
    setObservacao("");
    setLocalizacaoId("");
    setLoteId("");
    setNumeroSerie("");
    const principal = depositos.find((deposito) => deposito.principal) ?? depositos[0];
    const posicaoPadrao = saldos.find((saldo) => saldo.estoque_item_id === item?.id && saldo.deposito_id === principal?.id && !saldo.localizacao_id && !saldo.lote_id && !saldo.numero_serie);
    setMovimentoQuantidade(tipo === "ajuste" ? String(posicaoPadrao?.saldo_fisico ?? 0) : "1");
    setDepositoOrigemId(tipo === "entrada" ? "" : principal?.id ?? "");
    setDepositoDestinoId(tipo === "entrada" ? principal?.id ?? "" : "");
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
    const principal = depositos.find((deposito) => deposito.principal) ?? depositos[0];
    setDepositoOrigemId(principal?.id ?? "");
    setErro("");
    setModal("baixa");
  }

  function abrirInventario() {
    const principal = depositos.find((deposito) => deposito.principal) ?? depositos[0];
    setInventarioDepositoId(principal?.id ?? "");
    setInventarioDescricao("");
    setInventarioContagens({});
    setErro("");
    setModal("inventario");
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
  const depositoMovimentoId = movimentoTipo === "entrada" ? depositoDestinoId : depositoOrigemId;
  const posicoesSelecionadas = saldos.filter(
    (saldo) => saldo.estoque_item_id === itemSelecionadoId && saldo.deposito_id === depositoMovimentoId,
  );
  const posicaoSelecionada = posicoesSelecionadas.find(
    (saldo) => saldo.localizacao_id === (localizacaoId || null) && saldo.lote_id === (loteId || null),
  );
  const saldoPosicao = Number(posicaoSelecionada?.saldo_fisico ?? 0);
  const reservadoPosicao = Number(posicaoSelecionada?.saldo_reservado ?? 0);

  function abrirCadastroRapido(tipo: "categoria" | "marca") {
    setCadastroNome("");
    setErro("");
    setModal(tipo);
  }

  function abrirLocalizacao() {
    const principal = depositos.find((deposito) => deposito.principal) ?? depositos[0];
    setLocalizacaoForm({ deposito_id: principal?.id ?? "", codigo: "", nome: "" });
    setErro("");
    setModal("localizacao");
  }

  const modalContexto = modal === "item" ? "Cadastro de estoque"
    : modal === "catalogo" ? "Catálogo integrado"
    : modal === "inventario" ? "Contagem física"
    : modal === "localizacao" ? "Estrutura do estoque"
    : modal === "categoria" || modal === "marca" ? "Organização do catálogo"
    : "Movimentação";
  const modalTitulo = modal === "item" ? (itemForm.id ? "Editar item" : "Novo item")
    : modal === "catalogo" ? (catalogoForm.id ? "Editar produto ou serviço" : "Novo produto ou serviço")
    : modal === "baixa" ? `Registrar ${catalogoSelecionado?.tipo === "produto" ? "venda" : "execução"}`
    : modal === "inventario" ? "Novo inventário"
    : modal === "localizacao" ? "Nova localização"
    : modal === "categoria" ? "Nova categoria"
    : modal === "marca" ? "Nova marca"
    : "Movimentar estoque";

  return (
    <>
      <Header
        title="Estoque"
        subtitle="Controle produtos e insumos vinculados às vendas, serviços e procedimentos."
      />

      <main className={styles.page}>
        <section className={styles.hero}>
          <div className={styles.heroIntro}>
            <span className={styles.eyebrow}>Operação integrada</span>
            <h1>Gestão de estoque</h1>
            <p>
              Controle compras, saldos e consumo em um fluxo simples e rastreável.
            </p>
          </div>

          <section className={styles.metrics} aria-label="Resumo do estoque">
            <article className={styles.metricCard}>
              <span className={styles.metricIcon}><Boxes size={18} /></span>
              <div><strong>{resumo.itens_ativos}</strong><span>Itens ativos</span></div>
            </article>
            <article className={`${styles.metricCard} ${resumo.itens_estoque_baixo ? styles.metricWarning : ""}`}>
              <span className={styles.metricIcon}><AlertTriangle size={18} /></span>
              <div><strong>{resumo.itens_estoque_baixo}</strong><span>Estoque baixo</span></div>
            </article>
            <article className={styles.metricCard}>
              <span className={styles.metricIcon}><CircleDollarSign size={18} /></span>
              <div><strong>{moeda(resumo.valor_total)}</strong><span>Valor em estoque</span></div>
            </article>
            <article className={styles.metricCard}>
              <span className={styles.metricIcon}><ClipboardList size={18} /></span>
              <div><strong>{resumo.catalogo_ativo}</strong><span>No catálogo</span></div>
            </article>
          </section>

          <div className={styles.heroActions}>
            {podeMovimentar ? (
              <button className={styles.secondaryButton} onClick={() => abrirMovimentacao()}>
                <ArrowDownToLine size={17} /> Movimentar
              </button>
            ) : null}
          </div>
        </section>

        {erro ? <div className={styles.error}><AlertTriangle size={18} />{erro}</div> : null}

        <section className={styles.workspace}>
          <aside className={styles.moduleSidebar} aria-label="Navegação do estoque">
            <div className={styles.sidebarBrand}>
              <span><PackagePlus size={18} /></span>
              <div><strong>Estoque</strong><small>Central de operação</small></div>
            </div>

            <nav className={styles.sidebarNav}>
              <div className={styles.navGroup}>
                <span className={styles.navGroupLabel}>Operação</span>
                <button className={aba === "estoque" ? styles.navActive : ""} onClick={() => setAba("estoque")}><Boxes size={17} /><span>Itens em estoque</span></button>
                <button className={aba === "movimentacoes" ? styles.navActive : ""} onClick={() => setAba("movimentacoes")}><History size={17} /><span>Movimentações</span></button>
                <button className={aba === "reservas" ? styles.navActive : ""} onClick={() => setAba("reservas")}><ShieldCheck size={17} /><span>Reservas</span></button>
                <button className={aba === "inventarios" ? styles.navActive : ""} onClick={() => setAba("inventarios")}><ClipboardCheck size={17} /><span>Inventários</span></button>
                <button className={aba === "clinico" ? styles.navActive : ""} onClick={() => setAba("clinico")}><Stethoscope size={17} /><span>Consumo clínico</span></button>
              </div>

              {permissoes.includes("compras.visualizar") ? <div className={styles.navGroup}>
                <span className={styles.navGroupLabel}>Compras</span>
                <button className={aba === "compras" ? styles.navActive : ""} onClick={() => setAba("compras")}><ShoppingCart size={17} /><span>Compras e fornecedores</span></button>
              </div> : null}

              <div className={styles.navGroup}>
                <span className={styles.navGroupLabel}>Estrutura</span>
                <button className={aba === "catalogo" ? styles.navActive : ""} onClick={() => setAba("catalogo")}><ShoppingBag size={17} /><span>Produtos e serviços</span></button>
                <button className={aba === "depositos" ? styles.navActive : ""} onClick={() => setAba("depositos")}><Warehouse size={17} /><span>Depósitos</span></button>
                <button className={aba === "localizacoes" ? styles.navActive : ""} onClick={() => setAba("localizacoes")}><MapPin size={17} /><span>Localizações</span></button>
                <button className={aba === "lotes" ? styles.navActive : ""} onClick={() => setAba("lotes")}><Tags size={17} /><span>Lotes e validade</span></button>
              </div>

              <div className={styles.navGroup}>
                <span className={styles.navGroupLabel}>Administração</span>
                <button className={aba === "cadastros" ? styles.navActive : ""} onClick={() => setAba("cadastros")}><Layers3 size={17} /><span>Categorias e marcas</span></button>
                <button className={aba === "configuracoes" ? styles.navActive : ""} onClick={() => setAba("configuracoes")}><Settings size={17} /><span>Configurações</span></button>
              </div>
            </nav>
          </aside>

          <div className={styles.workspaceMain}>
            <label className={styles.mobileSectionPicker}>
              <span>Área do estoque</span>
              <select value={aba} onChange={(event) => setAba(event.target.value as Aba)}>
                <optgroup label="Operação">
                  <option value="estoque">Itens em estoque</option><option value="movimentacoes">Movimentações</option><option value="reservas">Reservas</option><option value="inventarios">Inventários</option><option value="clinico">Consumo clínico</option>
                </optgroup>
                {permissoes.includes("compras.visualizar") ? <optgroup label="Compras"><option value="compras">Compras e fornecedores</option></optgroup> : null}
                <optgroup label="Estrutura">
                  <option value="catalogo">Produtos e serviços</option><option value="depositos">Depósitos</option><option value="localizacoes">Localizações</option><option value="lotes">Lotes e validade</option>
                </optgroup>
                <optgroup label="Administração"><option value="cadastros">Categorias e marcas</option><option value="configuracoes">Configurações</option></optgroup>
              </select>
            </label>

            <header className={styles.contentHeader}>
              <div>
                <span className={styles.contentEyebrow}>Estoque / {ABA_INFO[aba].titulo}</span>
                <h2>{ABA_INFO[aba].titulo}</h2>
                <p>{ABA_INFO[aba].descricao}</p>
              </div>
            </header>

          {aba !== "compras" ? <div className={styles.toolbar}>
            <label className={styles.searchBox}>
              <Search size={18} />
              <input value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Buscar por nome, código ou tipo" />
            </label>
            {aba === "estoque" && podeGerenciar ? (
              <div className={styles.heroActions}>
                <button className={styles.secondaryButton} onClick={() => setImportandoProdutos(true)}><FileSpreadsheet size={17} /> Importar planilha</button>
                <button className={styles.primaryButton} onClick={abrirNovoItem}><Plus size={17} /> Novo item</button>
              </div>
            ) : null}
            {aba === "catalogo" && podeGerenciar ? (
              <button className={styles.primaryButton} onClick={abrirNovoCatalogo}><Plus size={17} /> Novo produto ou serviço</button>
            ) : null}
            {aba === "localizacoes" && podeConfigurar ? (
              <button className={styles.primaryButton} onClick={abrirLocalizacao}><Plus size={17} /> Nova localização</button>
            ) : null}
            {aba === "cadastros" && podeConfigurar ? (
              <div className={styles.heroActions}>
                <button className={styles.secondaryButton} onClick={() => abrirCadastroRapido("categoria")}><Plus size={17} /> Categoria</button>
                <button className={styles.primaryButton} onClick={() => abrirCadastroRapido("marca")}><Plus size={17} /> Marca</button>
              </div>
            ) : null}
            {aba === "inventarios" && podeGerenciar ? (
              <button className={styles.primaryButton} onClick={abrirInventario}><Plus size={17} /> Novo inventário</button>
            ) : null}
          </div> : null}

          {aba === "compras" ? <ComprasPanel
            itens={itens}
            depositos={depositos}
            localizacoes={localizacoes}
            permissoes={permissoes}
            onAtualizarEstoque={() => void carregar()}
          /> : null}

          {carregando ? <div className={styles.empty}>Carregando dados do estoque...</div> : null}

          {!carregando && aba === "estoque" ? (
            itensFiltrados.length ? (
              <div className={styles.inventoryList}>
                <div className={styles.inventoryListHeader} aria-hidden="true">
                  <span>Produto</span>
                  <span>Identificação</span>
                  <span>Disponível</span>
                  <span>Físico / reservado</span>
                  <span>Valores</span>
                  <span>Ações</span>
                </div>
                {itensFiltrados.map((item) => {
                  const baixo = Number(item.saldo_disponivel) <= Number(item.estoque_minimo);
                  const categoria = categorias.find((registro) => registro.id === item.categoria_id)?.nome;
                  const marca = marcas.find((registro) => registro.id === item.marca_id)?.nome;
                  const saldoFisico = Number(item.saldo);
                  const saldoDisponivel = Number(item.saldo_disponivel);
                  const referencia = Math.max(saldoFisico, Number(item.estoque_minimo), 1);
                  const percentualDisponivel = Math.max(0, Math.min(100, (saldoDisponivel / referencia) * 100));
                  return (
                    <article className={`${styles.inventoryRow} ${baixo ? styles.lowCard : ""}`} key={item.id}>
                      <div className={styles.productCell}>
                        <div className={styles.productIcon}><Boxes size={20} /></div>
                        <div className={styles.productMain}>
                          <div className={styles.productBadges}>
                            <span className={styles.typeBadge}>{TIPO_ITEM_LABEL[item.tipo]}</span>
                            {baixo ? <span className={styles.lowBadge}><AlertTriangle size={12} /> Estoque baixo</span> : null}
                          </div>
                          <h3>{item.nome}</h3>
                          <p>{item.descricao || [marca, categoria].filter(Boolean).join(" · ") || "Sem descrição informada"}</p>
                          {item.controla_lote || item.controla_validade || item.controla_serie ? <div className={styles.controlTags}>
                            {item.controla_lote ? <span>Lote</span> : null}
                            {item.controla_validade ? <span>Validade</span> : null}
                            {item.controla_serie ? <span>Série</span> : null}
                          </div> : null}
                        </div>
                      </div>

                      <div className={styles.identificationCell}>
                        <span className={styles.mobileCellLabel}>Identificação</span>
                        <strong>{item.codigo || item.sku || "Sem código"}</strong>
                        <small>{item.codigo_barras || (item.codigo && item.sku ? `SKU ${item.sku}` : "Sem código de barras")}</small>
                      </div>

                      <div className={styles.availableCell}>
                        <span className={styles.mobileCellLabel}>Disponível</span>
                        <strong>{quantidade(item.saldo_disponivel, item.unidade)}</strong>
                        <small>Mínimo {quantidade(item.estoque_minimo, item.unidade)}</small>
                        <div className={styles.stockProgress} aria-label={`${Math.round(percentualDisponivel)}% da referência disponível`}>
                          <span style={{ width: `${percentualDisponivel}%` }} />
                        </div>
                      </div>

                      <div className={styles.balanceCell}>
                        <span className={styles.mobileCellLabel}>Físico / reservado</span>
                        <strong>{quantidade(item.saldo, item.unidade)}</strong>
                        <small>{quantidade(item.saldo_reservado, item.unidade)} reservado</small>
                      </div>

                      <div className={styles.valueCell}>
                        <span className={styles.mobileCellLabel}>Valores</span>
                        <strong>{moeda(item.custo_unitario)} <small>custo</small></strong>
                        <span>{item.preco_venda == null ? "Venda não informada" : `${moeda(item.preco_venda)} venda`}</span>
                      </div>

                      <div className={styles.rowActions}>
                        {podeMovimentar ? <button className={styles.entryAction} aria-label={`Registrar entrada de ${item.nome}`} title="Registrar entrada" onClick={() => abrirMovimentacao(item, "entrada")}><ArrowDownToLine size={16} /><span>Entrada</span></button> : null}
                        {podeMovimentar ? <button className={styles.exitAction} aria-label={`Registrar saída de ${item.nome}`} title="Registrar saída" onClick={() => abrirMovimentacao(item, "saida")}><ArrowUpFromLine size={16} /><span>Saída</span></button> : null}
                        {podeGerenciar ? <button className={styles.iconButton} aria-label={`Editar ${item.nome}`} onClick={() => abrirEditarItem(item)}><Pencil size={16} /></button> : null}
                        {podeGerenciar ? <button className={`${styles.iconButton} ${styles.dangerIcon}`} aria-label={`Arquivar ${item.nome}`} onClick={() => void arquivar("item", item.id, item.nome)}><Archive size={16} /></button> : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : <div className={styles.emptyState}>
              <span className={styles.emptyIcon}><Boxes size={26} /></span>
              <h3>{busca ? "Nenhum item corresponde à busca" : "Seu estoque está pronto para começar"}</h3>
              <p>{busca ? "Revise o termo pesquisado ou limpe a busca para visualizar todos os itens." : "Cadastre o primeiro produto ou importe sua planilha para montar o catálogo rapidamente."}</p>
              {!busca && podeGerenciar ? <div className={styles.heroActions}>
                <button className={styles.secondaryButton} onClick={() => setImportandoProdutos(true)}><FileSpreadsheet size={17} /> Importar planilha</button>
                <button className={styles.primaryButton} onClick={abrirNovoItem}><Plus size={17} /> Novo item</button>
              </div> : null}
            </div>
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

          {!carregando && aba === "depositos" ? (
            <div className={styles.catalogList}>{depositos.map((deposito) => {
              const saldosDeposito = saldos.filter((saldo) => saldo.deposito_id === deposito.id);
              return <article className={styles.catalogCard} key={deposito.id}><div className={styles.catalogIcon}><Warehouse size={22} /></div><div className={styles.catalogMain}><div className={styles.catalogHeading}><div><span className={styles.typeBadge}>{deposito.principal ? "Principal" : deposito.codigo}</span><h3>{deposito.nome}</h3><p>{deposito.descricao || `${saldosDeposito.length} posições com saldo`} · {deposito.permite_saldo_negativo ? "Negativo liberado" : "Negativo bloqueado"}</p></div><strong>{quantidade(saldosDeposito.reduce((total, saldo) => total + Number(saldo.saldo_fisico), 0))}</strong></div></div>{podeConfigurar && !configuracoes.bloquear_negativo ? <button className={styles.secondaryButton} onClick={() => void enviar({ acao: "salvar_deposito", id: deposito.id, codigo: deposito.codigo, nome: deposito.nome, descricao: deposito.descricao, principal: deposito.principal, permite_saldo_negativo: !deposito.permite_saldo_negativo })}>{deposito.permite_saldo_negativo ? "Bloquear negativo" : "Permitir negativo"}</button> : null}</article>;
            })}</div>
          ) : null}

          {!carregando && aba === "localizacoes" ? (
            localizacoes.length ? <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Código</th><th>Localização</th><th>Depósito</th><th>Posições</th></tr></thead><tbody>{localizacoes.map((localizacao) => <tr key={localizacao.id}><td><strong>{localizacao.codigo}</strong></td><td>{localizacao.nome}</td><td>{depositos.find((deposito) => deposito.id === localizacao.deposito_id)?.nome || "—"}</td><td>{saldos.filter((saldo) => saldo.localizacao_id === localizacao.id).length}</td></tr>)}</tbody></table></div> : <div className={styles.empty}>Nenhuma localização cadastrada.</div>
          ) : null}

          {!carregando && aba === "lotes" ? (
            lotes.length ? <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Lote</th><th>Item</th><th>Fabricante</th><th>Validade</th><th>Situação</th></tr></thead><tbody>{lotes.map((lote) => <tr key={lote.id}><td><strong>{lote.codigo}</strong></td><td>{itens.find((item) => item.id === lote.estoque_item_id)?.nome || "Item arquivado"}</td><td>{lote.fabricante || "—"}</td><td>{lote.validade ? new Date(`${lote.validade}T12:00:00`).toLocaleDateString("pt-BR") : "Sem validade"}</td><td><span className={lote.bloqueado ? styles.lowBadge : styles.typeBadge}>{lote.bloqueado ? "Bloqueado" : "Disponível"}</span></td></tr>)}</tbody></table></div> : <div className={styles.empty}>Nenhum lote cadastrado.</div>
          ) : null}

          {!carregando && aba === "reservas" ? (
            reservas.length ? <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Item</th><th>Depósito</th><th>Quantidade</th><th>Origem</th><th>Expira em</th></tr></thead><tbody>{reservas.map((reserva) => <tr key={reserva.id}><td><strong>{itens.find((item) => item.id === reserva.estoque_item_id)?.nome || "Item"}</strong></td><td>{depositos.find((deposito) => deposito.id === reserva.deposito_id)?.nome || "—"}</td><td>{quantidade(Number(reserva.quantidade) - Number(reserva.consumida))}</td><td>{reserva.origem_tipo} · {reserva.origem_id.slice(0, 8)}</td><td>{reserva.expira_em ? dataHora(reserva.expira_em) : "Sem expiração"}</td></tr>)}</tbody></table></div> : <div className={styles.empty}>Nenhuma reserva ativa.</div>
          ) : null}

          {!carregando && aba === "inventarios" ? (
            inventarios.length ? <div className={styles.catalogList}>{inventarios.map((inventario) => <article className={styles.catalogCard} key={inventario.id}><div className={styles.catalogIcon}><ClipboardCheck size={22} /></div><div className={styles.catalogMain}><div className={styles.catalogHeading}><div><span className={styles.typeBadge}>Inventário #{inventario.numero}</span><h3>{inventario.descricao}</h3><p>{depositos.find((deposito) => deposito.id === inventario.deposito_id)?.nome || "Depósito"} · {inventario.itens.length} itens · {dataHora(inventario.created_at)}</p></div><strong>{inventario.status.replaceAll("_", " ")}</strong></div></div>{inventario.status === "aguardando_aprovacao" && podeMovimentar ? <button className={styles.primaryButton} onClick={() => void enviar({ acao: "aprovar_inventario", id: inventario.id })}>Aprovar e ajustar</button> : null}</article>)}</div> : <div className={styles.empty}>Nenhum inventário registrado.</div>
          ) : null}

          {!carregando && aba === "clinico" ? (
            consumosClinicos.length ? <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Data</th><th>Item</th><th>Lote</th><th>Quantidade</th><th>Referência clínica</th><th>Status</th></tr></thead><tbody>{consumosClinicos.map((consumo) => <tr key={consumo.id}><td>{dataHora(consumo.consumido_em)}</td><td><strong>{itens.find((item) => item.id === consumo.estoque_item_id)?.nome || "Item arquivado"}</strong></td><td>{lotes.find((lote) => lote.id === consumo.lote_id)?.codigo || "—"}</td><td>{quantidade(consumo.quantidade)}</td><td>{consumo.dente ? `Dente ${consumo.dente}` : `Agenda ${consumo.agendamento_id.slice(0, 8)}`}</td><td><span className={consumo.status === "estornado" ? styles.lowBadge : styles.typeBadge}>{consumo.status}</span></td></tr>)}</tbody></table></div> : <div className={styles.empty}>Nenhum consumo clínico registrado.</div>
          ) : null}

          {!carregando && aba === "cadastros" ? (
            <div className={styles.managementGrid}>
              <section className={styles.managementCard}><div className={styles.sectionHeading}><div><h3>Categorias</h3><p>Organização dos itens de estoque.</p></div></div><div className={styles.chipList}>{categorias.length ? categorias.map((categoria) => <span className={styles.typeBadge} key={categoria.id}>{categoria.nome}</span>) : <span className={styles.mutedBadge}>Nenhuma categoria</span>}</div></section>
              <section className={styles.managementCard}><div className={styles.sectionHeading}><div><h3>Marcas</h3><p>Fabricantes e marcas comerciais.</p></div></div><div className={styles.chipList}>{marcas.length ? marcas.map((marca) => <span className={styles.typeBadge} key={marca.id}>{marca.nome}</span>) : <span className={styles.mutedBadge}>Nenhuma marca</span>}</div></section>
            </div>
          ) : null}

          {!carregando && aba === "configuracoes" ? <div className={styles.settingsPanel}><div className={styles.sectionHeading}><div><h3>Regras da operação</h3><p>O saldo negativo continua bloqueado por padrão.</p></div></div><div className={styles.formGrid}><label className={styles.field}><span>Modo</span><select value={configuracoes.modo} onChange={(event) => setConfiguracoes((atual) => ({ ...atual, modo: event.target.value as Configuracoes["modo"] }))}><option value="simples">Simples</option><option value="avancado">Avançado</option></select></label><label className={styles.field}><span>Método de custo</span><select value={configuracoes.metodo_custo} onChange={(event) => setConfiguracoes((atual) => ({ ...atual, metodo_custo: event.target.value as Configuracoes["metodo_custo"] }))}><option value="medio">Custo médio</option><option value="fifo">FIFO</option></select></label><label className={`${styles.checkField} ${styles.fullField}`}><input type="checkbox" checked={configuracoes.bloquear_negativo} onChange={(event) => setConfiguracoes((atual) => ({ ...atual, bloquear_negativo: event.target.checked }))} /><span><strong>Bloquear estoque negativo</strong><small>Quando desativado, ainda será necessário liberar individualmente cada depósito.</small></span></label><label className={styles.field}><span>Dias para alerta de validade</span><input type="number" min="0" value={configuracoes.dias_alerta_validade} onChange={(event) => setConfiguracoes((atual) => ({ ...atual, dias_alerta_validade: Number(event.target.value) }))} /></label></div>{podeConfigurar ? <button className={styles.primaryButton} onClick={() => void enviar({ acao: "salvar_configuracoes", ...configuracoes })}>Salvar configurações</button> : null}</div> : null}
          </div>
        </section>
      </main>

      {modal ? (
        <div className={styles.modalOverlay} role="presentation" onMouseDown={() => !salvando && setModal(null)}>
          <section className={styles.modal} role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <header className={styles.modalHeader}>
              <div>
                <span className={styles.eyebrow}>{modalContexto}</span>
                <h2>{modalTitulo}</h2>
              </div>
              <button className={styles.iconButton} aria-label="Fechar" disabled={salvando} onClick={() => setModal(null)}><X size={19} /></button>
            </header>

            {modal === "item" ? (
              <div className={styles.modalBody}>
                <div className={styles.formGrid}>
                  <label className={`${styles.field} ${styles.fullField}`}><span>Nome *</span><input value={itemForm.nome} onChange={(event) => setItemForm((atual) => ({ ...atual, nome: event.target.value }))} placeholder="Ex.: Luva nitrílica" /></label>
                  <label className={styles.field}><span>Código</span><input value={itemForm.codigo} onChange={(event) => setItemForm((atual) => ({ ...atual, codigo: event.target.value }))} placeholder="SKU-001" /></label>
                  <label className={styles.field}><span>SKU</span><input value={itemForm.sku} onChange={(event) => setItemForm((atual) => ({ ...atual, sku: event.target.value }))} /></label>
                  <label className={styles.field}><span>Código de barras</span><input value={itemForm.codigo_barras} onChange={(event) => setItemForm((atual) => ({ ...atual, codigo_barras: event.target.value }))} /></label>
                  <label className={styles.field}><span>Tipo</span><select value={itemForm.tipo} onChange={(event) => setItemForm((atual) => ({ ...atual, tipo: event.target.value as EstoqueItem["tipo"] }))}><option value="produto">Produto</option><option value="material">Material</option><option value="insumo">Insumo</option></select></label>
                  <label className={styles.field}><span>Unidade</span><select value={itemForm.unidade} onChange={(event) => setItemForm((atual) => ({ ...atual, unidade: event.target.value }))}>{[["un", "Unidade"], ["cx", "Caixa"], ["pct", "Pacote"], ["kg", "Quilograma"], ["g", "Grama"], ["l", "Litro"], ["ml", "Mililitro"], ["m", "Metro"], ["cm", "Centímetro"]].map(([valor, label]) => <option key={valor} value={valor}>{label}</option>)}</select></label>
                  <label className={styles.field}><span>Categoria</span><select value={itemForm.categoria_id} onChange={(event) => setItemForm((atual) => ({ ...atual, categoria_id: event.target.value }))}><option value="">Sem categoria</option>{categorias.map((categoria) => <option key={categoria.id} value={categoria.id}>{categoria.nome}</option>)}</select></label>
                  <label className={styles.field}><span>Marca</span><select value={itemForm.marca_id} onChange={(event) => setItemForm((atual) => ({ ...atual, marca_id: event.target.value }))}><option value="">Sem marca</option>{marcas.map((marca) => <option key={marca.id} value={marca.id}>{marca.nome}</option>)}</select></label>
                  {!itemForm.id ? <><label className={styles.field}><span>Saldo inicial</span><input type="number" min="0" step="0.001" value={itemForm.saldo_inicial} onChange={(event) => setItemForm((atual) => ({ ...atual, saldo_inicial: event.target.value }))} /></label><label className={styles.field}><span>Depósito do saldo inicial</span><select value={itemForm.deposito_inicial_id} onChange={(event) => setItemForm((atual) => ({ ...atual, deposito_inicial_id: event.target.value }))}><option value="">Selecione</option>{depositos.map((deposito) => <option key={deposito.id} value={deposito.id}>{deposito.nome}</option>)}</select></label></> : null}
                  <label className={styles.field}><span>Estoque mínimo</span><input type="number" min="0" step="0.001" value={itemForm.estoque_minimo} onChange={(event) => setItemForm((atual) => ({ ...atual, estoque_minimo: event.target.value }))} /></label>
                  <label className={styles.field}><span>Custo unitário</span><input type="number" min="0" step="0.01" value={itemForm.custo_unitario} onChange={(event) => setItemForm((atual) => ({ ...atual, custo_unitario: event.target.value }))} /></label>
                  <label className={styles.field}><span>Preço de venda</span><input type="number" min="0" step="0.01" value={itemForm.preco_venda} onChange={(event) => setItemForm((atual) => ({ ...atual, preco_venda: event.target.value }))} /></label>
                  <label className={`${styles.field} ${styles.fullField}`}><span>Descrição</span><textarea value={itemForm.descricao} onChange={(event) => setItemForm((atual) => ({ ...atual, descricao: event.target.value }))} placeholder="Informações internas sobre o item" /></label>
                  <div className={`${styles.checkGrid} ${styles.fullField}`}><label className={styles.checkField}><input type="checkbox" checked={itemForm.controla_lote} onChange={(event) => setItemForm((atual) => ({ ...atual, controla_lote: event.target.checked }))} /><span><strong>Controlar lote</strong></span></label><label className={styles.checkField}><input type="checkbox" checked={itemForm.controla_validade} onChange={(event) => setItemForm((atual) => ({ ...atual, controla_validade: event.target.checked, controla_lote: event.target.checked || atual.controla_lote }))} /><span><strong>Controlar validade</strong></span></label><label className={styles.checkField}><input type="checkbox" checked={itemForm.controla_serie} onChange={(event) => setItemForm((atual) => ({ ...atual, controla_serie: event.target.checked }))} /><span><strong>Número de série</strong></span></label></div>
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
                  {movimentoTipo !== "entrada" ? <label className={styles.field}><span>Depósito de origem</span><select value={depositoOrigemId} onChange={(event) => setDepositoOrigemId(event.target.value)}><option value="">Selecione</option>{depositos.map((deposito) => <option key={deposito.id} value={deposito.id}>{deposito.nome}</option>)}</select></label> : null}
                  {movimentoTipo === "entrada" ? <label className={styles.field}><span>Depósito de destino</span><select value={depositoDestinoId} onChange={(event) => setDepositoDestinoId(event.target.value)}><option value="">Selecione</option>{depositos.map((deposito) => <option key={deposito.id} value={deposito.id}>{deposito.nome}</option>)}</select></label> : null}
                  <label className={styles.field}><span>Localização</span><select value={localizacaoId} onChange={(event) => setLocalizacaoId(event.target.value)}><option value="">Sem localização</option>{localizacoes.filter((localizacao) => localizacao.deposito_id === depositoMovimentoId).map((localizacao) => <option key={localizacao.id} value={localizacao.id}>{localizacao.codigo} · {localizacao.nome}</option>)}</select></label>
                  <label className={styles.field}><span>Lote</span><select value={loteId} onChange={(event) => setLoteId(event.target.value)}><option value="">Sem lote</option>{lotes.filter((lote) => lote.estoque_item_id === itemSelecionadoId && !lote.bloqueado).map((lote) => <option key={lote.id} value={lote.id}>{lote.codigo}{lote.validade ? ` · ${new Date(`${lote.validade}T12:00:00`).toLocaleDateString("pt-BR")}` : ""}</option>)}</select></label>
                  {itemSelecionado?.controla_serie ? <label className={styles.field}><span>Número de série</span><input value={numeroSerie} onChange={(event) => setNumeroSerie(event.target.value)} /></label> : null}
                  <label className={styles.field}><span>{movimentoTipo === "ajuste" ? "Novo saldo" : "Quantidade"}</span><input type="number" min="0" step="0.001" value={movimentoQuantidade} onChange={(event) => setMovimentoQuantidade(event.target.value)} /></label>
                  <label className={`${styles.field} ${styles.fullField}`}><span>Observação</span><textarea value={observacao} onChange={(event) => setObservacao(event.target.value)} placeholder="Ex.: Compra NF 1234 ou ajuste da contagem física" /></label>
                </div>
                {itemSelecionado ? <div className={styles.infoBox}>Posição selecionada: <strong>{quantidade(saldoPosicao, itemSelecionado.unidade)}</strong> físico · <strong>{quantidade(reservadoPosicao, itemSelecionado.unidade)}</strong> reservado · <strong>{quantidade(saldoPosicao - reservadoPosicao, itemSelecionado.unidade)}</strong> disponível. {movimentoTipo === "ajuste" ? "O novo saldo será aplicado somente a esta posição." : ""}</div> : null}
              </div>
            ) : null}

            {modal === "baixa" ? (
              <div className={styles.modalBody}>
                <div className={styles.saleSummary}><span className={styles.catalogIcon}>{catalogoSelecionado?.tipo === "produto" ? <ShoppingBag size={22} /> : <Wrench size={22} />}</span><div><strong>{catalogoSelecionado?.nome}</strong><span>{catalogoSelecionado ? TIPO_CATALOGO_LABEL[catalogoSelecionado.tipo] : ""}</span></div></div>
                <div className={styles.formGrid}>
                  <label className={styles.field}><span>Quantidade *</span><input type="number" min="0.001" step="0.001" value={baixaQuantidade} onChange={(event) => setBaixaQuantidade(event.target.value)} /></label>
                  <label className={styles.field}><span>Depósito *</span><select value={depositoOrigemId} onChange={(event) => setDepositoOrigemId(event.target.value)}><option value="">Selecione</option>{depositos.map((deposito) => <option key={deposito.id} value={deposito.id}>{deposito.nome}</option>)}</select></label>
                  <label className={styles.field}><span>Referência da venda/agendamento</span><input value={origemId} onChange={(event) => setOrigemId(event.target.value)} placeholder="Opcional" /></label>
                  <label className={`${styles.field} ${styles.fullField}`}><span>Observação</span><textarea value={observacao} onChange={(event) => setObservacao(event.target.value)} /></label>
                </div>
                <div className={styles.infoBox}>A operação valida todos os saldos antes de baixar. Se faltar qualquer insumo, nenhuma movimentação será realizada.</div>
              </div>
            ) : null}

            {modal === "inventario" ? (
              <div className={styles.modalBody}>
                <div className={styles.formGrid}><label className={styles.field}><span>Depósito *</span><select value={inventarioDepositoId} onChange={(event) => setInventarioDepositoId(event.target.value)}><option value="">Selecione</option>{depositos.map((deposito) => <option key={deposito.id} value={deposito.id}>{deposito.nome}</option>)}</select></label><label className={styles.field}><span>Descrição *</span><input value={inventarioDescricao} onChange={(event) => setInventarioDescricao(event.target.value)} placeholder="Ex.: Contagem mensal" /></label></div>
                <div className={styles.inventoryCountList}>{itens.map((item) => <label className={styles.countRow} key={item.id}><span><strong>{item.nome}</strong><small>Saldo esperado no depósito: {quantidade(saldos.filter((saldo) => saldo.estoque_item_id === item.id && saldo.deposito_id === inventarioDepositoId).reduce((total, saldo) => total + Number(saldo.saldo_fisico), 0), item.unidade)}</small></span><input type="number" min="0" step="0.001" placeholder="Contagem" value={inventarioContagens[item.id] ?? ""} onChange={(event) => setInventarioContagens((atual) => ({ ...atual, [item.id]: event.target.value }))} /></label>)}</div>
              </div>
            ) : null}

            {modal === "localizacao" ? (
              <div className={styles.modalBody}>
                <div className={styles.formGrid}>
                  <label className={`${styles.field} ${styles.fullField}`}><span>Depósito *</span><select autoFocus value={localizacaoForm.deposito_id} onChange={(event) => setLocalizacaoForm((atual) => ({ ...atual, deposito_id: event.target.value }))}><option value="">Selecione o depósito</option>{depositos.map((deposito) => <option key={deposito.id} value={deposito.id}>{deposito.nome}{deposito.principal ? " · Principal" : ""}</option>)}</select></label>
                  <label className={styles.field}><span>Código *</span><input value={localizacaoForm.codigo} maxLength={30} onChange={(event) => setLocalizacaoForm((atual) => ({ ...atual, codigo: event.target.value.toUpperCase() }))} placeholder="Ex.: A-01" /></label>
                  <label className={styles.field}><span>Nome *</span><input value={localizacaoForm.nome} maxLength={120} onChange={(event) => setLocalizacaoForm((atual) => ({ ...atual, nome: event.target.value }))} placeholder="Ex.: Prateleira A, nível 1" /></label>
                </div>
                <div className={styles.infoBox}>A localização será vinculada ao depósito selecionado e ficará disponível nas entradas, saídas, inventários e recebimentos de compras.</div>
              </div>
            ) : null}

            {modal === "categoria" || modal === "marca" ? (
              <div className={styles.modalBody}>
                <div className={styles.formGrid}>
                  <label className={`${styles.field} ${styles.fullField}`}><span>Nome da {modal} *</span><input autoFocus value={cadastroNome} maxLength={120} onChange={(event) => setCadastroNome(event.target.value)} placeholder={modal === "categoria" ? "Ex.: Materiais odontológicos" : "Ex.: Fabricante ou marca comercial"} /></label>
                </div>
                <div className={styles.infoBox}>A {modal} ficará disponível imediatamente no cadastro e na edição dos itens de estoque.</div>
              </div>
            ) : null}

            {erro ? <div className={`${styles.error} ${styles.modalError}`}><AlertTriangle size={17} />{erro}</div> : null}

            <footer className={styles.modalFooter}>
              <button className={styles.secondaryButton} disabled={salvando} onClick={() => setModal(null)}>Cancelar</button>
              {modal === "item" ? <button className={styles.primaryButton} disabled={salvando || !itemForm.nome.trim()} onClick={() => void enviar({ acao: "salvar_item", ...itemForm })}>{salvando ? "Salvando..." : "Salvar item"}</button> : null}
              {modal === "catalogo" ? <button className={styles.primaryButton} disabled={salvando || !catalogoForm.nome.trim()} onClick={() => void enviar({ acao: "salvar_catalogo", ...catalogoForm })}>{salvando ? "Salvando..." : "Salvar catálogo"}</button> : null}
              {modal === "movimentacao" ? <button className={styles.primaryButton} disabled={salvando || !itemSelecionadoId || !depositoMovimentoId} onClick={() => void enviar({ acao: "movimentar_documento", estoque_item_id: itemSelecionadoId, tipo: movimentoTipo, quantidade: movimentoQuantidade, deposito_origem_id: depositoOrigemId, deposito_destino_id: depositoDestinoId, localizacao_origem_id: movimentoTipo === "entrada" ? null : localizacaoId, localizacao_destino_id: movimentoTipo === "entrada" ? localizacaoId : null, lote_id: loteId, numero_serie: numeroSerie, custo_unitario: itemSelecionado?.custo_unitario, observacao, idempotency_key: crypto.randomUUID() })}>{salvando ? "Registrando..." : "Registrar movimento"}</button> : null}
              {modal === "baixa" ? <button className={styles.primaryButton} disabled={salvando || !catalogoSelecionadoId || !depositoOrigemId} onClick={() => void enviar({ acao: "registrar_baixa", catalogo_servico_id: catalogoSelecionadoId, deposito_id: depositoOrigemId, quantidade: baixaQuantidade, origem_id: origemId, observacao, idempotency_key: crypto.randomUUID() })}>{salvando ? "Registrando..." : "Confirmar baixa"}</button> : null}
              {modal === "inventario" ? <button className={styles.primaryButton} disabled={salvando || !inventarioDepositoId || !inventarioDescricao.trim() || !Object.values(inventarioContagens).some((valor) => valor !== "")} onClick={() => void enviar({ acao: "salvar_inventario", deposito_id: inventarioDepositoId, descricao: inventarioDescricao, tipo_contagem: "aberta", itens: Object.entries(inventarioContagens).filter(([, valor]) => valor !== "").map(([estoque_item_id, primeira_contagem]) => ({ estoque_item_id, primeira_contagem })) })}>{salvando ? "Salvando..." : "Encerrar contagem"}</button> : null}
              {modal === "localizacao" ? <button className={styles.primaryButton} disabled={salvando || !localizacaoForm.deposito_id || !localizacaoForm.codigo.trim() || !localizacaoForm.nome.trim()} onClick={() => void enviar({ acao: "salvar_localizacao", ...localizacaoForm })}>{salvando ? "Salvando..." : "Salvar localização"}</button> : null}
              {modal === "categoria" ? <button className={styles.primaryButton} disabled={salvando || !cadastroNome.trim()} onClick={() => void enviar({ acao: "salvar_categoria", nome: cadastroNome })}>{salvando ? "Salvando..." : "Salvar categoria"}</button> : null}
              {modal === "marca" ? <button className={styles.primaryButton} disabled={salvando || !cadastroNome.trim()} onClick={() => void enviar({ acao: "salvar_marca", nome: cadastroNome })}>{salvando ? "Salvando..." : "Salvar marca"}</button> : null}
            </footer>
          </section>
        </div>
      ) : null}

      {importandoProdutos ? (
        <ImportacaoProdutosModal
          onClose={() => setImportandoProdutos(false)}
          onImported={async (message) => {
            setSucesso(message);
            await carregar();
          }}
        />
      ) : null}

      {sucesso ? <FeedbackToast success={sucesso} onSuccessDismiss={() => setSucesso("")} /> : null}
    </>
  );
}
