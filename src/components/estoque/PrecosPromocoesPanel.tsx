"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgePercent,
  CalendarClock,
  Check,
  ChevronDown,
  CircleDollarSign,
  CreditCard,
  Edit3,
  Search,
  Sparkles,
  Tags,
  Trash2,
  X,
} from "lucide-react";
import FeedbackToast from "@/components/FeedbackToast";
import styles from "./PrecosPromocoesPanel.module.css";

type Subaba = "produtos" | "promocoes" | "pagamentos";
type Canal = "balcao" | "online" | "whatsapp";
type Forma = "pix" | "dinheiro" | "debito" | "credito";
type Modal = "produto" | "massa" | "promocao" | "regra" | null;

type PrecosResolvidos = {
  base: number | null;
  balcao: number | null;
  online: number | null;
  whatsapp: number | null;
  promocional: number | null;
  pix: number | null;
  dinheiro: number | null;
  debito: number | null;
  credito: number | null;
  formatados: Record<string, string>;
  promocao: { id: string; nome: string; inicio_em: string; fim_em: string; canais: Canal[] } | null;
};

type Produto = {
  id: string;
  codigo: string | null;
  sku: string | null;
  nome: string;
  unidade: string;
  custo_unitario: number | string;
  preco_venda: number | string | null;
  categoria_id: string | null;
  marca_id: string | null;
  precos: PrecosResolvidos | null;
  canais_config: Partial<Record<Canal, number>>;
  pagamentos_config: Partial<Record<Forma, number>>;
};

type Promocao = {
  id: string;
  nome: string;
  tipo_ajuste: "preco_fixo" | "desconto_percentual" | "desconto_valor";
  valor: number | string;
  inicio_em: string;
  fim_em: string;
  canais: Canal[];
  ativo: boolean;
  produto_ids: string[];
};

type RegraPagamento = {
  id: string;
  canal: Canal | null;
  forma: Forma;
  parcelas_min: number;
  parcelas_max: number;
  tipo_ajuste: "nenhum" | "desconto_percentual" | "acrescimo_percentual";
  valor: number | string;
};

type Opcao = { id: string; nome: string };

type Dados = {
  produtos: Produto[];
  promocoes: Promocao[];
  regras_pagamento: RegraPagamento[];
  categorias: Opcao[];
  marcas: Opcao[];
};

type ProdutoForm = {
  id: string;
  preco_base: string;
  balcao: string;
  online: string;
  whatsapp: string;
  pix: string;
  dinheiro: string;
  debito: string;
  credito: string;
};

type MassaForm = {
  alvo: "preco_base" | Canal | Forma;
  operacao: "definir" | "aumentar_percentual" | "reduzir_percentual" | "aumentar_valor" | "reduzir_valor" | "herdar";
  valor: string;
};

type PromocaoForm = {
  id: string;
  nome: string;
  tipo_ajuste: Promocao["tipo_ajuste"];
  valor: string;
  inicio_local: string;
  fim_local: string;
  canais: Canal[];
  produto_ids: string[];
};

type RegraForm = {
  id: string;
  canal: "" | Canal;
  forma: Forma;
  parcelas_min: string;
  parcelas_max: string;
  tipo_ajuste: RegraPagamento["tipo_ajuste"];
  valor: string;
};

const DADOS_VAZIOS: Dados = { produtos: [], promocoes: [], regras_pagamento: [], categorias: [], marcas: [] };
const CANAIS: Array<{ id: Canal; nome: string }> = [
  { id: "balcao", nome: "Balcão / PDV" },
  { id: "online", nome: "Online" },
  { id: "whatsapp", nome: "WhatsApp" },
];
const FORMAS: Array<{ id: Forma; nome: string }> = [
  { id: "pix", nome: "PIX" },
  { id: "dinheiro", nome: "Dinheiro" },
  { id: "debito", nome: "Débito" },
  { id: "credito", nome: "Crédito" },
];

function moeda(valor: unknown) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(numero);
}

function numero(valor: unknown) {
  if (valor === null || valor === undefined || String(valor).trim() === "") return null;
  const n = Number(String(valor).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function dataHora(valor: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(valor));
}

function datetimeLocal(valor?: string | null) {
  const data = valor ? new Date(valor) : new Date();
  if (Number.isNaN(data.getTime())) return "";
  const deslocamento = data.getTimezoneOffset() * 60_000;
  return new Date(data.getTime() - deslocamento).toISOString().slice(0, 16);
}

function adicionarHorasLocal(horas: number) {
  return datetimeLocal(new Date(Date.now() + horas * 60 * 60 * 1000).toISOString());
}

function statusPromocao(promocao: Promocao) {
  if (!promocao.ativo) return { label: "Pausada", classe: styles.statusMuted };
  const agora = Date.now();
  if (new Date(promocao.inicio_em).getTime() > agora) return { label: "Agendada", classe: styles.statusScheduled };
  if (new Date(promocao.fim_em).getTime() <= agora) return { label: "Encerrada", classe: styles.statusMuted };
  return { label: "Ativa", classe: styles.statusActive };
}

function descricaoAjuste(tipo: string, valor: unknown) {
  if (tipo === "preco_fixo") return `Preço ${moeda(valor)}`;
  if (tipo === "desconto_percentual") return `${Number(valor || 0)}% de desconto`;
  if (tipo === "desconto_valor") return `${moeda(valor)} de desconto`;
  if (tipo === "acrescimo_percentual") return `${Number(valor || 0)}% de acréscimo`;
  return "Sem ajuste";
}

export default function PrecosPromocoesPanel({ permissoes }: { permissoes: string[] }) {
  const [dados, setDados] = useState<Dados>(DADOS_VAZIOS);
  const [subaba, setSubaba] = useState<Subaba>("produtos");
  const [busca, setBusca] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [marcaId, setMarcaId] = useState("");
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [modal, setModal] = useState<Modal>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [produtoForm, setProdutoForm] = useState<ProdutoForm | null>(null);
  const [massaForm, setMassaForm] = useState<MassaForm>({ alvo: "preco_base", operacao: "aumentar_percentual", valor: "5" });
  const [promocaoForm, setPromocaoForm] = useState<PromocaoForm>({ id: "", nome: "", tipo_ajuste: "desconto_percentual", valor: "10", inicio_local: datetimeLocal(), fim_local: adicionarHorasLocal(24), canais: ["balcao", "online", "whatsapp"], produto_ids: [] });
  const [regraForm, setRegraForm] = useState<RegraForm>({ id: "", canal: "", forma: "pix", parcelas_min: "1", parcelas_max: "1", tipo_ajuste: "desconto_percentual", valor: "3" });
  const [buscaPromocaoProduto, setBuscaPromocaoProduto] = useState("");

  const podeGerenciar = permissoes.includes("estoque.gerenciar") || permissoes.includes("estoque.configurar");

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const response = await fetch("/api/estoque/precos", { cache: "no-store" });
      const json = await response.json();
      if (!response.ok || !json.ok) throw new Error(json.error || "Erro ao carregar preços.");
      setDados({
        produtos: Array.isArray(json.produtos) ? json.produtos : [],
        promocoes: Array.isArray(json.promocoes) ? json.promocoes : [],
        regras_pagamento: Array.isArray(json.regras_pagamento) ? json.regras_pagamento : [],
        categorias: Array.isArray(json.categorias) ? json.categorias : [],
        marcas: Array.isArray(json.marcas) ? json.marcas : [],
      });
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao carregar preços.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  const produtosFiltrados = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    return dados.produtos.filter((produto) => {
      if (categoriaId && produto.categoria_id !== categoriaId) return false;
      if (marcaId && produto.marca_id !== marcaId) return false;
      if (!termo) return true;
      return [produto.nome, produto.codigo, produto.sku].filter(Boolean).some((valor) => String(valor).toLocaleLowerCase("pt-BR").includes(termo));
    });
  }, [busca, categoriaId, dados.produtos, marcaId]);

  const produtosPromocaoFiltrados = useMemo(() => {
    const termo = buscaPromocaoProduto.trim().toLocaleLowerCase("pt-BR");
    if (!termo) return dados.produtos;
    return dados.produtos.filter((produto) => [produto.nome, produto.codigo, produto.sku].filter(Boolean).some((valor) => String(valor).toLocaleLowerCase("pt-BR").includes(termo)));
  }, [buscaPromocaoProduto, dados.produtos]);

  async function enviar(payload: Record<string, unknown>, fechar = true) {
    setSalvando(true);
    setErro("");
    try {
      const response = await fetch("/api/estoque/precos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await response.json();
      if (!response.ok || !json.ok) throw new Error(json.error || "Não foi possível salvar.");
      setSucesso(json.message || "Alteração salva.");
      if (fechar) setModal(null);
      setSelecionados([]);
      await carregar();
      return true;
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível salvar.");
      return false;
    } finally {
      setSalvando(false);
    }
  }

  function abrirProduto(produto: Produto) {
    setProdutoForm({
      id: produto.id,
      preco_base: produto.preco_venda == null ? "" : String(produto.preco_venda),
      balcao: produto.canais_config?.balcao == null ? "" : String(produto.canais_config.balcao),
      online: produto.canais_config?.online == null ? "" : String(produto.canais_config.online),
      whatsapp: produto.canais_config?.whatsapp == null ? "" : String(produto.canais_config.whatsapp),
      pix: produto.pagamentos_config?.pix == null ? "" : String(produto.pagamentos_config.pix),
      dinheiro: produto.pagamentos_config?.dinheiro == null ? "" : String(produto.pagamentos_config.dinheiro),
      debito: produto.pagamentos_config?.debito == null ? "" : String(produto.pagamentos_config.debito),
      credito: produto.pagamentos_config?.credito == null ? "" : String(produto.pagamentos_config.credito),
    });
    setErro("");
    setModal("produto");
  }

  function abrirMassa() {
    setMassaForm({ alvo: "preco_base", operacao: "aumentar_percentual", valor: "5" });
    setErro("");
    setModal("massa");
  }

  function abrirPromocao(promocao?: Promocao) {
    setPromocaoForm(promocao ? {
      id: promocao.id,
      nome: promocao.nome,
      tipo_ajuste: promocao.tipo_ajuste,
      valor: String(promocao.valor),
      inicio_local: datetimeLocal(promocao.inicio_em),
      fim_local: datetimeLocal(promocao.fim_em),
      canais: Array.isArray(promocao.canais) ? promocao.canais : [],
      produto_ids: Array.isArray(promocao.produto_ids) ? promocao.produto_ids : [],
    } : {
      id: "",
      nome: "",
      tipo_ajuste: "desconto_percentual",
      valor: "10",
      inicio_local: datetimeLocal(),
      fim_local: adicionarHorasLocal(24),
      canais: ["balcao", "online", "whatsapp"],
      produto_ids: selecionados.length ? selecionados : [],
    });
    setBuscaPromocaoProduto("");
    setErro("");
    setModal("promocao");
  }

  function abrirRegra(regra?: RegraPagamento) {
    setRegraForm(regra ? {
      id: regra.id,
      canal: regra.canal || "",
      forma: regra.forma,
      parcelas_min: String(regra.parcelas_min),
      parcelas_max: String(regra.parcelas_max),
      tipo_ajuste: regra.tipo_ajuste,
      valor: String(regra.valor),
    } : { id: "", canal: "", forma: "pix", parcelas_min: "1", parcelas_max: "1", tipo_ajuste: "desconto_percentual", valor: "3" });
    setErro("");
    setModal("regra");
  }

  function alternarSelecionado(id: string) {
    setSelecionados((atuais) => atuais.includes(id) ? atuais.filter((item) => item !== id) : [...atuais, id]);
  }

  function alternarTodosFiltrados() {
    const ids = produtosFiltrados.map((produto) => produto.id);
    const todos = ids.length > 0 && ids.every((id) => selecionados.includes(id));
    setSelecionados((atuais) => todos ? atuais.filter((id) => !ids.includes(id)) : Array.from(new Set([...atuais, ...ids])));
  }

  function alternarCanalPromocao(canal: Canal) {
    setPromocaoForm((atual) => ({ ...atual, canais: atual.canais.includes(canal) ? atual.canais.filter((item) => item !== canal) : [...atual.canais, canal] }));
  }

  function alternarProdutoPromocao(id: string) {
    setPromocaoForm((atual) => ({ ...atual, produto_ids: atual.produto_ids.includes(id) ? atual.produto_ids.filter((item) => item !== id) : [...atual.produto_ids, id] }));
  }

  const todosFiltradosSelecionados = produtosFiltrados.length > 0 && produtosFiltrados.every((produto) => selecionados.includes(produto.id));
  const produtoEditado = produtoForm ? dados.produtos.find((produto) => produto.id === produtoForm.id) || null : null;
  const alvoPagamento = ["pix", "dinheiro", "debito", "credito"].includes(massaForm.alvo);
  const promocoesAtivas = dados.promocoes.filter((promocao) => statusPromocao(promocao).label === "Ativa").length;

  return (
    <div className={styles.root}>
      <section className={styles.summaryGrid}>
        <article><CircleDollarSign size={20} /><div><strong>{dados.produtos.length}</strong><span>Produtos precificados</span></div></article>
        <article><BadgePercent size={20} /><div><strong>{promocoesAtivas}</strong><span>Promoções ativas</span></div></article>
        <article><CreditCard size={20} /><div><strong>{dados.regras_pagamento.length}</strong><span>Regras de pagamento</span></div></article>
      </section>

      <section className={styles.ruleFlow}>
        <Sparkles size={18} />
        <div><strong>Ordem do preço</strong><span>Preço-base → canal → promoção vigente → condição de pagamento. Uma regra mais específica do produto prevalece sobre a regra geral.</span></div>
      </section>

      <div className={styles.tabs} role="tablist">
        <button className={subaba === "produtos" ? styles.tabActive : ""} onClick={() => setSubaba("produtos")}><Tags size={16} />Produtos e preços</button>
        <button className={subaba === "promocoes" ? styles.tabActive : ""} onClick={() => setSubaba("promocoes")}><BadgePercent size={16} />Promoções</button>
        <button className={subaba === "pagamentos" ? styles.tabActive : ""} onClick={() => setSubaba("pagamentos")}><CreditCard size={16} />Regras de pagamento</button>
      </div>

      {erro && !modal ? <div className={styles.error}>{erro}</div> : null}
      {carregando ? <div className={styles.empty}>Carregando preços e promoções...</div> : null}

      {!carregando && subaba === "produtos" ? (
        <>
          <div className={styles.toolbar}>
            <label className={styles.search}><Search size={17} /><input value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Buscar produto, código ou SKU" /></label>
            <select value={categoriaId} onChange={(event) => setCategoriaId(event.target.value)}><option value="">Todas as categorias</option>{dados.categorias.map((item) => <option value={item.id} key={item.id}>{item.nome}</option>)}</select>
            <select value={marcaId} onChange={(event) => setMarcaId(event.target.value)}><option value="">Todas as marcas</option>{dados.marcas.map((item) => <option value={item.id} key={item.id}>{item.nome}</option>)}</select>
          </div>

          {selecionados.length > 0 ? <div className={styles.selectionBar}><strong>{selecionados.length} produto(s) selecionado(s)</strong><div><button onClick={() => abrirPromocao()}><BadgePercent size={16} />Criar promoção</button>{podeGerenciar ? <button className={styles.primary} onClick={abrirMassa}><Edit3 size={16} />Alterar preços em massa</button> : null}</div></div> : null}

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th className={styles.checkCol}><input type="checkbox" checked={todosFiltradosSelecionados} onChange={alternarTodosFiltrados} aria-label="Selecionar produtos filtrados" /></th><th>Produto</th><th>Base</th><th>Balcão</th><th>Online</th><th>WhatsApp</th><th>PIX</th><th>Débito</th><th>Crédito</th><th>Promoção</th><th /></tr></thead>
              <tbody>{produtosFiltrados.map((produto) => {
                const categoria = dados.categorias.find((item) => item.id === produto.categoria_id)?.nome;
                const marca = dados.marcas.find((item) => item.id === produto.marca_id)?.nome;
                return <tr key={produto.id}>
                  <td><input type="checkbox" checked={selecionados.includes(produto.id)} onChange={() => alternarSelecionado(produto.id)} aria-label={`Selecionar ${produto.nome}`} /></td>
                  <td><strong>{produto.nome}</strong><small>{[produto.codigo || produto.sku, marca, categoria].filter(Boolean).join(" · ") || produto.unidade}</small></td>
                  <td>{moeda(produto.precos?.base)}</td>
                  <td>{moeda(produto.precos?.balcao)}</td>
                  <td>{moeda(produto.precos?.online)}</td>
                  <td><strong>{moeda(produto.precos?.whatsapp)}</strong></td>
                  <td>{moeda(produto.precos?.pix)}</td>
                  <td>{moeda(produto.precos?.debito)}</td>
                  <td>{moeda(produto.precos?.credito)}</td>
                  <td>{produto.precos?.promocao ? <span className={styles.promoBadge}>{produto.precos.promocao.nome}</span> : <span className={styles.muted}>—</span>}</td>
                  <td>{podeGerenciar ? <button className={styles.iconButton} onClick={() => abrirProduto(produto)} aria-label={`Editar preços de ${produto.nome}`}><Edit3 size={16} /></button> : null}</td>
                </tr>;
              })}</tbody>
            </table>
          </div>
          {!produtosFiltrados.length ? <div className={styles.empty}>Nenhum produto encontrado.</div> : null}
        </>
      ) : null}

      {!carregando && subaba === "promocoes" ? (
        <>
          <div className={styles.sectionHeader}><div><h3>Promoções programadas</h3><p>O preço promocional entra e sai automaticamente no dia e hora configurados.</p></div>{podeGerenciar ? <button className={styles.primary} onClick={() => abrirPromocao()}><BadgePercent size={16} />Nova promoção</button> : null}</div>
          <div className={styles.cardList}>{dados.promocoes.length ? dados.promocoes.map((promocao) => {
            const status = statusPromocao(promocao);
            return <article className={styles.promoCard} key={promocao.id}>
              <div className={styles.promoCardTop}><div><span className={`${styles.status} ${status.classe}`}>{status.label}</span><h3>{promocao.nome}</h3><p>{descricaoAjuste(promocao.tipo_ajuste, promocao.valor)}</p></div><div className={styles.cardActions}>{podeGerenciar ? <button className={styles.iconButton} onClick={() => abrirPromocao(promocao)}><Edit3 size={16} /></button> : null}{podeGerenciar && promocao.ativo ? <button className={`${styles.iconButton} ${styles.danger}`} onClick={() => void enviar({ acao: "arquivar_promocao", id: promocao.id }, false)}><Trash2 size={16} /></button> : null}</div></div>
              <div className={styles.promoMeta}><span><CalendarClock size={15} />{dataHora(promocao.inicio_em)} → {dataHora(promocao.fim_em)}</span><span>{promocao.produto_ids.length} produto(s)</span><span>{promocao.canais.map((canal) => CANAIS.find((item) => item.id === canal)?.nome || canal).join(" · ")}</span></div>
            </article>;
          }) : <div className={styles.empty}>Nenhuma promoção cadastrada.</div>}</div>
        </>
      ) : null}

      {!carregando && subaba === "pagamentos" ? (
        <>
          <div className={styles.sectionHeader}><div><h3>Regras gerais de pagamento</h3><p>Configure descontos ou acréscimos que serão herdados pelos produtos, com exceções individuais quando necessário.</p></div>{podeGerenciar ? <button className={styles.primary} onClick={() => abrirRegra()}><CreditCard size={16} />Nova regra</button> : null}</div>
          <div className={styles.rulesGrid}>{dados.regras_pagamento.length ? dados.regras_pagamento.map((regra) => <article className={styles.ruleCard} key={regra.id}><div><span className={styles.typePill}>{FORMAS.find((item) => item.id === regra.forma)?.nome || regra.forma}</span><h3>{descricaoAjuste(regra.tipo_ajuste, regra.valor)}</h3><p>{regra.canal ? CANAIS.find((item) => item.id === regra.canal)?.nome : "Todos os canais"}{regra.forma === "credito" ? ` · ${regra.parcelas_min}x a ${regra.parcelas_max}x` : ""}</p></div><div className={styles.cardActions}>{podeGerenciar ? <button className={styles.iconButton} onClick={() => abrirRegra(regra)}><Edit3 size={16} /></button> : null}{podeGerenciar ? <button className={`${styles.iconButton} ${styles.danger}`} onClick={() => void enviar({ acao: "arquivar_regra_pagamento", id: regra.id }, false)}><Trash2 size={16} /></button> : null}</div></article>) : <div className={styles.empty}>Nenhuma regra geral. Sem regras, o sistema usa o preço do canal.</div>}</div>
        </>
      ) : null}

      {modal ? <div className={styles.modalOverlay} onMouseDown={() => !salvando && setModal(null)}><section className={styles.modal} onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true"><header className={styles.modalHeader}><div><span>Preços e promoções</span><h2>{modal === "produto" ? `Preços de ${produtoEditado?.nome || "produto"}` : modal === "massa" ? "Alteração em massa" : modal === "promocao" ? (promocaoForm.id ? "Editar promoção" : "Nova promoção") : (regraForm.id ? "Editar regra" : "Nova regra de pagamento")}</h2></div><button className={styles.iconButton} onClick={() => setModal(null)} disabled={salvando}><X size={18} /></button></header>
        <div className={styles.modalBody}>
          {modal === "produto" && produtoForm && produtoEditado ? <>
            <div className={styles.productInfo}><div><strong>{produtoEditado.nome}</strong><span>Custo: {moeda(produtoEditado.custo_unitario)}</span></div><span>Campos vazios herdam a regra anterior.</span></div>
            <h4>Preço-base</h4><div className={styles.formGrid}><label><span>Preço-base</span><input type="number" min="0" step="0.01" value={produtoForm.preco_base} onChange={(event) => setProdutoForm({ ...produtoForm, preco_base: event.target.value })} /></label></div>
            <h4>Preço por canal</h4><div className={styles.formGrid}>{CANAIS.map((canal) => <label key={canal.id}><span>{canal.nome}</span><input type="number" min="0" step="0.01" value={produtoForm[canal.id]} placeholder={`Herdar ${moeda(produtoForm.preco_base)}`} onChange={(event) => setProdutoForm({ ...produtoForm, [canal.id]: event.target.value })} /></label>)}</div>
            <h4>Exceções por pagamento</h4><p className={styles.help}>Se deixar vazio, será aplicada a regra geral de pagamento sobre o preço do WhatsApp/promoção.</p><div className={styles.formGrid}>{FORMAS.map((forma) => <label key={forma.id}><span>{forma.nome}</span><input type="number" min="0" step="0.01" value={produtoForm[forma.id]} placeholder="Herdar regra geral" onChange={(event) => setProdutoForm({ ...produtoForm, [forma.id]: event.target.value })} /></label>)}</div>
          </> : null}

          {modal === "massa" ? <><div className={styles.selectionSummary}><strong>{selecionados.length} produto(s)</strong><span>Revise o alvo antes de aplicar. A operação fica registrada no histórico de preços.</span></div><div className={styles.formGrid}><label><span>O que alterar</span><select value={massaForm.alvo} onChange={(event) => { const alvo = event.target.value as MassaForm["alvo"]; setMassaForm({ alvo, operacao: ["pix","dinheiro","debito","credito"].includes(alvo) ? "definir" : "aumentar_percentual", valor: "" }); }}><option value="preco_base">Preço-base</option><option value="balcao">Preço Balcão</option><option value="online">Preço Online</option><option value="whatsapp">Preço WhatsApp</option><option value="pix">Preço PIX</option><option value="dinheiro">Preço Dinheiro</option><option value="debito">Preço Débito</option><option value="credito">Preço Crédito</option></select></label><label><span>Operação</span><select value={massaForm.operacao} onChange={(event) => setMassaForm({ ...massaForm, operacao: event.target.value as MassaForm["operacao"] })}>{alvoPagamento ? <><option value="definir">Definir preço fixo</option><option value="herdar">Herdar regra geral</option></> : <><option value="definir">Definir valor</option>{massaForm.alvo !== "preco_base" ? <option value="herdar">Herdar preço-base</option> : null}<option value="aumentar_percentual">Aumentar %</option><option value="reduzir_percentual">Reduzir %</option><option value="aumentar_valor">Aumentar R$</option><option value="reduzir_valor">Reduzir R$</option></>}</select></label>{massaForm.operacao !== "herdar" ? <label><span>Valor</span><input type="number" min="0" step="0.01" value={massaForm.valor} onChange={(event) => setMassaForm({ ...massaForm, valor: event.target.value })} /></label> : null}</div></> : null}

          {modal === "promocao" ? <><div className={styles.formGrid}><label className={styles.full}><span>Nome da promoção</span><input value={promocaoForm.nome} onChange={(event) => setPromocaoForm({ ...promocaoForm, nome: event.target.value })} placeholder="Ex.: Semana do Pet" /></label><label><span>Tipo</span><select value={promocaoForm.tipo_ajuste} onChange={(event) => setPromocaoForm({ ...promocaoForm, tipo_ajuste: event.target.value as PromocaoForm["tipo_ajuste"] })}><option value="desconto_percentual">Desconto em %</option><option value="desconto_valor">Desconto em R$</option><option value="preco_fixo">Preço promocional fixo</option></select></label><label><span>Valor</span><input type="number" min="0" step="0.01" value={promocaoForm.valor} onChange={(event) => setPromocaoForm({ ...promocaoForm, valor: event.target.value })} /></label><label><span>Início — data e hora</span><input type="datetime-local" value={promocaoForm.inicio_local} onChange={(event) => setPromocaoForm({ ...promocaoForm, inicio_local: event.target.value })} /></label><label><span>Fim — data e hora</span><input type="datetime-local" value={promocaoForm.fim_local} onChange={(event) => setPromocaoForm({ ...promocaoForm, fim_local: event.target.value })} /></label></div><h4>Canais</h4><div className={styles.checkGroup}>{CANAIS.map((canal) => <label key={canal.id}><input type="checkbox" checked={promocaoForm.canais.includes(canal.id)} onChange={() => alternarCanalPromocao(canal.id)} /><span>{canal.nome}</span></label>)}</div><h4>Produtos da promoção <small>{promocaoForm.produto_ids.length} selecionado(s)</small></h4><label className={styles.search}><Search size={16} /><input value={buscaPromocaoProduto} onChange={(event) => setBuscaPromocaoProduto(event.target.value)} placeholder="Buscar produtos" /></label><div className={styles.productPicker}><button type="button" className={styles.selectAllMini} onClick={() => setPromocaoForm((atual) => ({ ...atual, produto_ids: produtosPromocaoFiltrados.every((produto) => atual.produto_ids.includes(produto.id)) ? atual.produto_ids.filter((id) => !produtosPromocaoFiltrados.some((produto) => produto.id === id)) : Array.from(new Set([...atual.produto_ids, ...produtosPromocaoFiltrados.map((produto) => produto.id)])) }))}>Selecionar/limpar resultados</button>{produtosPromocaoFiltrados.map((produto) => <label key={produto.id}><input type="checkbox" checked={promocaoForm.produto_ids.includes(produto.id)} onChange={() => alternarProdutoPromocao(produto.id)} /><span><strong>{produto.nome}</strong><small>{produto.codigo || produto.sku || produto.unidade}</small></span></label>)}</div></> : null}

          {modal === "regra" ? <><div className={styles.formGrid}><label><span>Forma</span><select value={regraForm.forma} onChange={(event) => { const forma = event.target.value as Forma; setRegraForm({ ...regraForm, forma, parcelas_min: "1", parcelas_max: "1" }); }}>{FORMAS.map((forma) => <option key={forma.id} value={forma.id}>{forma.nome}</option>)}</select></label><label><span>Canal</span><select value={regraForm.canal} onChange={(event) => setRegraForm({ ...regraForm, canal: event.target.value as RegraForm["canal"] })}><option value="">Todos os canais</option>{CANAIS.map((canal) => <option value={canal.id} key={canal.id}>{canal.nome}</option>)}</select></label>{regraForm.forma === "credito" ? <><label><span>Parcela mínima</span><input type="number" min="1" max="24" value={regraForm.parcelas_min} onChange={(event) => setRegraForm({ ...regraForm, parcelas_min: event.target.value })} /></label><label><span>Parcela máxima</span><input type="number" min="1" max="24" value={regraForm.parcelas_max} onChange={(event) => setRegraForm({ ...regraForm, parcelas_max: event.target.value })} /></label></> : null}<label><span>Ajuste</span><select value={regraForm.tipo_ajuste} onChange={(event) => setRegraForm({ ...regraForm, tipo_ajuste: event.target.value as RegraForm["tipo_ajuste"] })}><option value="nenhum">Sem alteração</option><option value="desconto_percentual">Desconto %</option><option value="acrescimo_percentual">Acréscimo %</option></select></label><label><span>Percentual</span><input type="number" min="0" max="100" step="0.01" disabled={regraForm.tipo_ajuste === "nenhum"} value={regraForm.valor} onChange={(event) => setRegraForm({ ...regraForm, valor: event.target.value })} /></label></div></> : null}
          {erro ? <div className={styles.error}>{erro}</div> : null}
        </div><footer className={styles.modalFooter}><button disabled={salvando} onClick={() => setModal(null)}>Cancelar</button>{modal === "produto" && produtoForm ? <button className={styles.primary} disabled={salvando} onClick={() => void enviar({ acao: "salvar_produto", estoque_item_id: produtoForm.id, preco_base: produtoForm.preco_base === "" ? null : numero(produtoForm.preco_base), canais: { balcao: produtoForm.balcao, online: produtoForm.online, whatsapp: produtoForm.whatsapp }, pagamentos: { pix: produtoForm.pix, dinheiro: produtoForm.dinheiro, debito: produtoForm.debito, credito: produtoForm.credito } })}>{salvando ? "Salvando..." : "Salvar preços"}</button> : null}{modal === "massa" ? <button className={styles.primary} disabled={salvando || !selecionados.length || (massaForm.operacao !== "herdar" && numero(massaForm.valor) === null)} onClick={() => void enviar({ acao: "aplicar_massa", item_ids: selecionados, alvo: massaForm.alvo, operacao: massaForm.operacao, valor: massaForm.valor })}>{salvando ? "Aplicando..." : `Aplicar em ${selecionados.length} produto(s)`}</button> : null}{modal === "promocao" ? <button className={styles.primary} disabled={salvando || !promocaoForm.nome.trim() || !promocaoForm.inicio_local || !promocaoForm.fim_local || !promocaoForm.canais.length || !promocaoForm.produto_ids.length || numero(promocaoForm.valor) === null} onClick={() => void enviar({ acao: "salvar_promocao", id: promocaoForm.id || null, nome: promocaoForm.nome, tipo_ajuste: promocaoForm.tipo_ajuste, valor: promocaoForm.valor, inicio_em: new Date(promocaoForm.inicio_local).toISOString(), fim_em: new Date(promocaoForm.fim_local).toISOString(), canais: promocaoForm.canais, produto_ids: promocaoForm.produto_ids })}>{salvando ? "Salvando..." : "Salvar promoção"}</button> : null}{modal === "regra" ? <button className={styles.primary} disabled={salvando} onClick={() => void enviar({ acao: "salvar_regra_pagamento", id: regraForm.id || null, canal: regraForm.canal || null, forma: regraForm.forma, parcelas_min: regraForm.forma === "credito" ? regraForm.parcelas_min : 1, parcelas_max: regraForm.forma === "credito" ? regraForm.parcelas_max : 1, tipo_ajuste: regraForm.tipo_ajuste, valor: regraForm.tipo_ajuste === "nenhum" ? 0 : regraForm.valor })}>{salvando ? "Salvando..." : "Salvar regra"}</button> : null}</footer></section></div> : null}
      {sucesso ? <FeedbackToast success={sucesso} onSuccessDismiss={() => setSucesso("")} /> : null}
    </div>
  );
}
