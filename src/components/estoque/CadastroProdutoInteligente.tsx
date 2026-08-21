"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Barcode,
  Box,
  CheckCircle2,
  ChevronDown,
  Layers3,
  PackagePlus,
  ScanBarcode,
  Warehouse,
  X,
} from "lucide-react";
import CodigoBarrasScannerModal from "./CodigoBarrasScannerModal";
import styles from "./CadastroProdutoInteligente.module.css";

type Deposito = { id: string; codigo: string; nome: string; principal: boolean };
type Localizacao = { id: string; deposito_id: string; codigo: string; nome: string };
type Classificacao = { id: string; nome: string };
type Unidade = "un" | "cx" | "pct" | "kg" | "g" | "l" | "ml" | "m" | "cm";
type Tipo = "produto" | "material" | "insumo";
type ScannerAlvo = "produto" | "embalagem" | null;

type ProdutoForm = {
  nome: string;
  codigo: string;
  sku: string;
  codigo_barras: string;
  tipo: Tipo;
  unidade: Unidade;
  categoria_id: string;
  categoria_nome: string;
  categoria_nova: boolean;
  marca_id: string;
  marca_nome: string;
  marca_nova: boolean;
  descricao: string;
  estoque_minimo: string;
  custo_unitario: string;
  preco_venda: string;
  controla_validade: boolean;
  controla_lote: boolean;
  controla_serie: boolean;
};

type EmbalagemForm = {
  ativa: boolean;
  nome: string;
  sigla: string;
  fator_conversao: string;
  codigo_barras: string;
  permite_compra: boolean;
  permite_venda: boolean;
  padrao_compra: boolean;
  padrao_venda: boolean;
  preco_venda: string;
};

type EstoqueInicialForm = {
  registrar: boolean;
  deposito_id: string;
  localizacao_id: string;
  quantidade: string;
  unidade_quantidade: "base" | "embalagem";
  lote_codigo: string;
  fabricado_em: string;
  validade: string;
  fabricante: string;
  numeros_serie: string;
};

const UNIDADES: Array<[Unidade, string]> = [
  ["un", "Unidade (UN)"], ["cx", "Caixa (CX)"], ["pct", "Pacote (PCT)"],
  ["kg", "Quilograma (KG)"], ["g", "Grama (G)"], ["l", "Litro (L)"],
  ["ml", "Mililitro (ML)"], ["m", "Metro (M)"], ["cm", "Centímetro (CM)"],
];

const TIPOS: Array<[Tipo, string]> = [["produto", "Produto"], ["material", "Material"], ["insumo", "Insumo"]];

const PRODUTO_INICIAL: ProdutoForm = {
  nome: "", codigo: "", sku: "", codigo_barras: "", tipo: "produto", unidade: "un",
  categoria_id: "", categoria_nome: "", categoria_nova: false,
  marca_id: "", marca_nome: "", marca_nova: false, descricao: "",
  estoque_minimo: "0", custo_unitario: "0", preco_venda: "",
  controla_validade: false, controla_lote: false, controla_serie: false,
};

const EMBALAGEM_INICIAL: EmbalagemForm = {
  ativa: false, nome: "", sigla: "", fator_conversao: "", codigo_barras: "",
  permite_compra: true, permite_venda: true, padrao_compra: true, padrao_venda: false,
  preco_venda: "",
};

function numero(valor: string) {
  const resultado = Number(valor.replace(",", "."));
  return Number.isFinite(resultado) ? resultado : 0;
}

function formatarQuantidade(valor: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 6 }).format(valor);
}

function formatarData(valor: string) {
  if (!valor) return "—";
  return new Intl.DateTimeFormat("pt-BR").format(new Date(`${valor}T12:00:00`));
}

function listaSeriais(valor: string) {
  return valor.split(/[\n,;]+/).map((item) => item.trim()).filter(Boolean);
}

export default function CadastroProdutoInteligente({
  className,
  depositos,
  localizacoes,
  categorias,
  marcas,
  podeEmbalagens,
  onCreated,
}: {
  className?: string;
  depositos: Deposito[];
  localizacoes: Localizacao[];
  categorias: Classificacao[];
  marcas: Classificacao[];
  podeEmbalagens: boolean;
  onCreated: (message: string) => Promise<void> | void;
}) {
  const [aberto, setAberto] = useState(false);
  const [produto, setProduto] = useState<ProdutoForm>(PRODUTO_INICIAL);
  const [embalagem, setEmbalagem] = useState<EmbalagemForm>(EMBALAGEM_INICIAL);
  const depositoPadrao = depositos.find((item) => item.principal)?.id || depositos[0]?.id || "";
  const [estoque, setEstoque] = useState<EstoqueInicialForm>({
    registrar: false, deposito_id: depositoPadrao, localizacao_id: "", quantidade: "",
    unidade_quantidade: "base", lote_codigo: "", fabricado_em: "", validade: "",
    fabricante: "", numeros_serie: "",
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [scannerAlvo, setScannerAlvo] = useState<ScannerAlvo>(null);

  const fator = embalagem.ativa ? numero(embalagem.fator_conversao) : 1;
  const quantidadeInformada = numero(estoque.quantidade);
  const quantidadeBase = estoque.registrar
    ? quantidadeInformada * (estoque.unidade_quantidade === "embalagem" && embalagem.ativa ? fator : 1)
    : 0;
  const seriais = useMemo(() => listaSeriais(estoque.numeros_serie), [estoque.numeros_serie]);
  const localizacoesDisponiveis = localizacoes.filter((item) => item.deposito_id === estoque.deposito_id);
  const depositoSelecionado = depositos.find((item) => item.id === estoque.deposito_id);
  const localizacaoSelecionada = localizacoes.find((item) => item.id === estoque.localizacao_id);

  function resetar() {
    setProduto(PRODUTO_INICIAL);
    setEmbalagem(EMBALAGEM_INICIAL);
    setEstoque({
      registrar: false,
      deposito_id: depositos.find((item) => item.principal)?.id || depositos[0]?.id || "",
      localizacao_id: "",
      quantidade: "",
      unidade_quantidade: "base",
      lote_codigo: "",
      fabricado_em: "",
      validade: "",
      fabricante: "",
      numeros_serie: "",
    });
    setErro("");
  }

  function abrir() {
    resetar();
    setAberto(true);
  }

  function fechar() {
    if (salvando) return;
    setAberto(false);
    setScannerAlvo(null);
  }

  function validar() {
    if (!produto.nome.trim()) return "Informe o nome do produto.";
    if (numero(produto.estoque_minimo) < 0 || numero(produto.custo_unitario) < 0 || (produto.preco_venda && numero(produto.preco_venda) < 0)) {
      return "Estoque mínimo, custo e preço não podem ser negativos.";
    }
    if (produto.categoria_nova && !produto.categoria_nome.trim()) return "Informe o nome da nova categoria.";
    if (produto.marca_nova && !produto.marca_nome.trim()) return "Informe o nome da nova marca.";

    if (embalagem.ativa) {
      if (!podeEmbalagens) return "Seu perfil não possui permissão para cadastrar conversões de embalagem.";
      if (!embalagem.nome.trim() || !embalagem.sigla.trim()) return "Informe o nome e a sigla da embalagem.";
      if (fator <= 0) return "O fator da embalagem deve ser maior que zero.";
      if (embalagem.padrao_compra && !embalagem.permite_compra) return "A embalagem padrão de compra precisa estar habilitada para compras.";
      if (embalagem.padrao_venda && !embalagem.permite_venda) return "A embalagem padrão de venda precisa estar habilitada para vendas.";
      if (embalagem.preco_venda && numero(embalagem.preco_venda) < 0) return "O preço da embalagem não pode ser negativo.";
    }

    if (estoque.registrar) {
      if (!estoque.deposito_id) return "Selecione o depósito do estoque inicial.";
      if (quantidadeInformada <= 0) return "A quantidade inicial deve ser maior que zero.";
      if (estoque.unidade_quantidade === "embalagem" && !embalagem.ativa) return "Configure a embalagem antes de informar o estoque nessa unidade.";
      if (estoque.localizacao_id && !localizacoesDisponiveis.some((item) => item.id === estoque.localizacao_id)) return "A localização selecionada não pertence ao depósito.";
      if (produto.controla_lote && !estoque.lote_codigo.trim()) return "Informe o lote do estoque inicial.";
      if (produto.controla_validade && !estoque.validade) return "Informe a validade do estoque inicial.";
      if (estoque.fabricado_em && estoque.validade && estoque.fabricado_em > estoque.validade) return "A fabricação não pode ser posterior à validade.";
      if (produto.controla_serie) {
        if (!Number.isInteger(quantidadeBase)) return "Produto serializado precisa resultar em uma quantidade inteira de unidades-base.";
        if (seriais.length !== quantidadeBase) return `Informe ${formatarQuantidade(quantidadeBase)} número(s) de série, um para cada unidade-base.`;
        if (new Set(seriais.map((item) => item.toLocaleLowerCase("pt-BR"))).size !== seriais.length) return "Os números de série não podem se repetir.";
      }
    }
    return "";
  }

  async function cadastrar() {
    const validacao = validar();
    if (validacao) { setErro(validacao); return; }
    setSalvando(true);
    setErro("");
    try {
      const response = await fetch("/api/estoque/produtos/cadastrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          produto: {
            ...produto,
            controla_lote: produto.controla_lote || produto.controla_validade,
            categoria_id: produto.categoria_nova ? "" : produto.categoria_id,
            marca_id: produto.marca_nova ? "" : produto.marca_id,
          },
          embalagem: embalagem.ativa ? embalagem : null,
          estoque_inicial: estoque.registrar ? {
            registrar: true,
            deposito_id: estoque.deposito_id,
            localizacao_id: estoque.localizacao_id || null,
            quantidade: quantidadeInformada,
            unidade_quantidade: estoque.unidade_quantidade,
            lote: produto.controla_lote || produto.controla_validade ? {
              codigo: estoque.lote_codigo,
              fabricado_em: estoque.fabricado_em || null,
              validade: estoque.validade || null,
              fabricante: estoque.fabricante || null,
            } : null,
            numeros_serie: produto.controla_serie ? seriais : [],
          } : null,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Não foi possível cadastrar o produto.");
      setAberto(false);
      await onCreated(data.message || "Produto cadastrado com sucesso.");
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível cadastrar o produto.");
    } finally {
      setSalvando(false);
    }
  }

  const resumoQuantidade = estoque.registrar
    ? estoque.unidade_quantidade === "embalagem" && embalagem.ativa
      ? `${formatarQuantidade(quantidadeInformada)} ${embalagem.sigla || "emb."} × ${formatarQuantidade(fator)} = ${formatarQuantidade(quantidadeBase)} ${produto.unidade}`
      : `${formatarQuantidade(quantidadeBase)} ${produto.unidade}`
    : "Sem estoque inicial";

  return <>
    <button className={className} onClick={abrir}><PackagePlus size={17} /> Novo produto</button>

    {aberto ? <div className={styles.overlay} onMouseDown={fechar}>
      <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="cadastro-produto-titulo" onMouseDown={(event) => event.stopPropagation()}>
        <header className={styles.header}>
          <div><span>Cadastro inteligente</span><h2 id="cadastro-produto-titulo">Novo produto</h2><p>Informe o que você possui. O estoque, lote e embalagem serão registrados nas estruturas oficiais do sistema.</p></div>
          <button className={styles.close} disabled={salvando} onClick={fechar} aria-label="Fechar"><X size={20} /></button>
        </header>

        <div className={styles.body}>
          <div className={styles.steps}><span>1 Produto</span><span>2 Controle</span><span>3 Embalagem</span><span>4 Estoque inicial</span><span>5 Revisão</span></div>

          <section className={styles.card}>
            <div className={styles.cardTitle}><span><Box size={18} /></span><div><strong>1. Produto</strong><small>Dados básicos e identificação</small></div></div>
            <div className={styles.grid}>
              <label className={styles.wide}><span>Nome *</span><input autoFocus value={produto.nome} onChange={(e) => setProduto((a) => ({ ...a, nome: e.target.value }))} placeholder="Ex.: Sachê Whiskas Frango 85g" /></label>
              <label><span>Código</span><input value={produto.codigo} onChange={(e) => setProduto((a) => ({ ...a, codigo: e.target.value }))} placeholder="SKU-001" /></label>
              <label><span>SKU</span><input value={produto.sku} onChange={(e) => setProduto((a) => ({ ...a, sku: e.target.value }))} /></label>
              <label className={styles.wide}><span>Código de barras</span><div className={styles.withButton}><input inputMode="numeric" value={produto.codigo_barras} onChange={(e) => setProduto((a) => ({ ...a, codigo_barras: e.target.value }))} /><button type="button" onClick={() => setScannerAlvo("produto")}><ScanBarcode size={18} /> Ler</button></div></label>
              <label><span>Tipo</span><select value={produto.tipo} onChange={(e) => setProduto((a) => ({ ...a, tipo: e.target.value as Tipo }))}>{TIPOS.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
              <label><span>Unidade-base</span><select value={produto.unidade} onChange={(e) => setProduto((a) => ({ ...a, unidade: e.target.value as Unidade }))}>{UNIDADES.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
              <div><span className={styles.label}>Categoria</span><select value={produto.categoria_nova ? "__nova__" : produto.categoria_id} onChange={(e) => setProduto((a) => ({ ...a, categoria_nova: e.target.value === "__nova__", categoria_id: e.target.value === "__nova__" ? "" : e.target.value, categoria_nome: "" }))}><option value="">Sem categoria</option>{categorias.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}<option value="__nova__">+ Nova categoria</option></select>{produto.categoria_nova ? <input className={styles.inlineInput} value={produto.categoria_nome} onChange={(e) => setProduto((a) => ({ ...a, categoria_nome: e.target.value }))} placeholder="Nome da nova categoria" /> : null}</div>
              <div><span className={styles.label}>Marca</span><select value={produto.marca_nova ? "__nova__" : produto.marca_id} onChange={(e) => setProduto((a) => ({ ...a, marca_nova: e.target.value === "__nova__", marca_id: e.target.value === "__nova__" ? "" : e.target.value, marca_nome: "" }))}><option value="">Sem marca</option>{marcas.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}<option value="__nova__">+ Nova marca</option></select>{produto.marca_nova ? <input className={styles.inlineInput} value={produto.marca_nome} onChange={(e) => setProduto((a) => ({ ...a, marca_nome: e.target.value }))} placeholder="Nome da nova marca" /> : null}</div>
              <label><span>Estoque mínimo</span><input type="number" min="0" step="0.001" value={produto.estoque_minimo} onChange={(e) => setProduto((a) => ({ ...a, estoque_minimo: e.target.value }))} /></label>
              <label><span>Custo unitário</span><input type="number" min="0" step="0.01" value={produto.custo_unitario} onChange={(e) => setProduto((a) => ({ ...a, custo_unitario: e.target.value }))} /></label>
              <label><span>Preço de venda</span><input type="number" min="0" step="0.01" value={produto.preco_venda} onChange={(e) => setProduto((a) => ({ ...a, preco_venda: e.target.value }))} /></label>
              <label className={styles.full}><span>Descrição</span><textarea value={produto.descricao} onChange={(e) => setProduto((a) => ({ ...a, descricao: e.target.value }))} placeholder="Informações internas opcionais" /></label>
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.cardTitle}><span><Layers3 size={18} /></span><div><strong>2. Controle do produto</strong><small>Mostramos detalhes somente quando forem necessários</small></div></div>
            <div className={styles.choiceGrid}>
              <label className={styles.choice}><input type="checkbox" checked={produto.controla_validade} onChange={(e) => setProduto((a) => ({ ...a, controla_validade: e.target.checked, controla_lote: e.target.checked || a.controla_lote }))} /><span><strong>Controlar validade</strong><small>Para produtos que vencem.</small></span></label>
              <label className={styles.choice}><input type="checkbox" checked={produto.controla_lote} disabled={produto.controla_validade} onChange={(e) => setProduto((a) => ({ ...a, controla_lote: e.target.checked }))} /><span><strong>Controlar lote</strong><small>{produto.controla_validade ? "Ativado porque validade exige lote." : "Rastreie entradas por lote."}</small></span></label>
              <label className={styles.choice}><input type="checkbox" checked={produto.controla_serie} onChange={(e) => setProduto((a) => ({ ...a, controla_serie: e.target.checked }))} /><span><strong>Controlar número de série</strong><small>Uma identificação para cada unidade física.</small></span></label>
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.cardTitle}><span><Barcode size={18} /></span><div><strong>3. Como este produto é comprado?</strong><small>O saldo interno sempre permanece na unidade-base</small></div></div>
            <div className={styles.segmented}><button className={!embalagem.ativa ? styles.selected : ""} type="button" onClick={() => { setEmbalagem((a) => ({ ...a, ativa: false })); setEstoque((a) => ({ ...a, unidade_quantidade: "base" })); }}>Unidade individual</button><button className={embalagem.ativa ? styles.selected : ""} type="button" disabled={!podeEmbalagens} onClick={() => setEmbalagem((a) => ({ ...a, ativa: true }))}>Caixa, pacote ou embalagem</button></div>
            {!podeEmbalagens ? <p className={styles.hint}>Seu perfil pode cadastrar o produto, mas não possui permissão para criar conversões de embalagem.</p> : null}
            {embalagem.ativa ? <div className={styles.grid}>
              <label><span>Nome da embalagem *</span><input value={embalagem.nome} onChange={(e) => setEmbalagem((a) => ({ ...a, nome: e.target.value }))} placeholder="Caixa com 12" /></label>
              <label><span>Sigla *</span><input maxLength={12} value={embalagem.sigla} onChange={(e) => setEmbalagem((a) => ({ ...a, sigla: e.target.value.toUpperCase() }))} placeholder="CX" /></label>
              <label><span>Unidades-base por embalagem *</span><input type="number" min="0.000001" step="0.000001" value={embalagem.fator_conversao} onChange={(e) => setEmbalagem((a) => ({ ...a, fator_conversao: e.target.value }))} placeholder="12" /></label>
              <label><span>Preço de venda da embalagem</span><input type="number" min="0" step="0.01" value={embalagem.preco_venda} onChange={(e) => setEmbalagem((a) => ({ ...a, preco_venda: e.target.value }))} /></label>
              <label className={styles.wide}><span>Código de barras da embalagem</span><div className={styles.withButton}><input inputMode="numeric" value={embalagem.codigo_barras} onChange={(e) => setEmbalagem((a) => ({ ...a, codigo_barras: e.target.value }))} /><button type="button" onClick={() => setScannerAlvo("embalagem")}><ScanBarcode size={18} /> Ler</button></div></label>
              <div className={`${styles.choiceGrid} ${styles.full}`}>
                <label className={styles.choice}><input type="checkbox" checked={embalagem.permite_compra} onChange={(e) => setEmbalagem((a) => ({ ...a, permite_compra: e.target.checked, padrao_compra: e.target.checked ? a.padrao_compra : false }))} /><span><strong>Usar em compras</strong></span></label>
                <label className={styles.choice}><input type="checkbox" checked={embalagem.permite_venda} onChange={(e) => setEmbalagem((a) => ({ ...a, permite_venda: e.target.checked, padrao_venda: e.target.checked ? a.padrao_venda : false }))} /><span><strong>Usar em vendas</strong></span></label>
                <label className={styles.choice}><input type="checkbox" checked={embalagem.padrao_compra} onChange={(e) => setEmbalagem((a) => ({ ...a, padrao_compra: e.target.checked, permite_compra: e.target.checked || a.permite_compra }))} /><span><strong>Padrão de compra</strong></span></label>
                <label className={styles.choice}><input type="checkbox" checked={embalagem.padrao_venda} onChange={(e) => setEmbalagem((a) => ({ ...a, padrao_venda: e.target.checked, permite_venda: e.target.checked || a.permite_venda }))} /><span><strong>Padrão de venda</strong></span></label>
              </div>
            </div> : null}
          </section>

          <section className={styles.card}>
            <div className={styles.cardTitle}><span><Warehouse size={18} /></span><div><strong>4. Deseja registrar estoque inicial?</strong><small>Você também pode deixar o produto com saldo zero e receber depois</small></div></div>
            <div className={styles.segmented}><button type="button" className={!estoque.registrar ? styles.selected : ""} onClick={() => setEstoque((a) => ({ ...a, registrar: false }))}>Não registrar agora</button><button type="button" className={estoque.registrar ? styles.selected : ""} onClick={() => setEstoque((a) => ({ ...a, registrar: true, deposito_id: a.deposito_id || depositoPadrao }))}>Sim, tenho estoque agora</button></div>
            {estoque.registrar ? <div className={styles.grid}>
              <label><span>Depósito *</span><select value={estoque.deposito_id} onChange={(e) => setEstoque((a) => ({ ...a, deposito_id: e.target.value, localizacao_id: "" }))}><option value="">Selecione</option>{depositos.map((item) => <option key={item.id} value={item.id}>{item.nome}{item.principal ? " · Principal" : ""}</option>)}</select></label>
              <label><span>Localização</span><select value={estoque.localizacao_id} onChange={(e) => setEstoque((a) => ({ ...a, localizacao_id: e.target.value }))}><option value="">Sem localização</option>{localizacoesDisponiveis.map((item) => <option key={item.id} value={item.id}>{item.codigo} · {item.nome}</option>)}</select></label>
              <label><span>Quantidade *</span><input type="number" min="0.000001" step="0.001" value={estoque.quantidade} onChange={(e) => setEstoque((a) => ({ ...a, quantidade: e.target.value }))} /></label>
              {embalagem.ativa ? <label><span>Quantidade informada em</span><select value={estoque.unidade_quantidade} onChange={(e) => setEstoque((a) => ({ ...a, unidade_quantidade: e.target.value as "base" | "embalagem" }))}><option value="base">{produto.unidade.toUpperCase()} · unidade-base</option><option value="embalagem">{embalagem.sigla || "Embalagem"} · {embalagem.nome || "embalagem configurada"}</option></select></label> : null}
              {embalagem.ativa && estoque.unidade_quantidade === "embalagem" && quantidadeInformada > 0 && fator > 0 ? <div className={`${styles.conversion} ${styles.full}`}><CheckCircle2 size={18} /><span><strong>{formatarQuantidade(quantidadeInformada)} {embalagem.sigla || "embalagens"} × {formatarQuantidade(fator)}</strong> = {formatarQuantidade(quantidadeBase)} {produto.unidade} no estoque.</span></div> : null}

              {produto.controla_lote || produto.controla_validade ? <>
                <div className={`${styles.subheading} ${styles.full}`}><strong>Lote e validade</strong><span>Estes dados acompanharão a posição do estoque inicial.</span></div>
                <label><span>Lote *</span><input value={estoque.lote_codigo} onChange={(e) => setEstoque((a) => ({ ...a, lote_codigo: e.target.value }))} placeholder="ABC123" /></label>
                <label><span>Fabricação</span><input type="date" value={estoque.fabricado_em} onChange={(e) => setEstoque((a) => ({ ...a, fabricado_em: e.target.value }))} /></label>
                <label><span>Validade {produto.controla_validade ? "*" : ""}</span><input required={produto.controla_validade} type="date" value={estoque.validade} onChange={(e) => setEstoque((a) => ({ ...a, validade: e.target.value }))} /></label>
                <label><span>Fabricante</span><input value={estoque.fabricante} onChange={(e) => setEstoque((a) => ({ ...a, fabricante: e.target.value }))} /></label>
              </> : null}

              {produto.controla_serie ? <label className={styles.full}><span>Números de série *</span><textarea className={styles.serials} value={estoque.numeros_serie} onChange={(e) => setEstoque((a) => ({ ...a, numeros_serie: e.target.value }))} placeholder="Um número de série por linha\nSN0001\nSN0002" /><small>{quantidadeBase > 0 ? `${seriais.length} de ${Number.isInteger(quantidadeBase) ? quantidadeBase : formatarQuantidade(quantidadeBase)} informados` : "Informe a quantidade para saber quantos números de série serão necessários."}</small></label> : null}
            </div> : null}
          </section>

          <section className={`${styles.card} ${styles.review}`}>
            <div className={styles.cardTitle}><span><CheckCircle2 size={18} /></span><div><strong>5. Revisão</strong><small>Confira o que será criado em uma única operação</small></div></div>
            <div className={styles.reviewGrid}>
              <div><span>Produto</span><strong>{produto.nome || "Nome não informado"}</strong><small>Base: {produto.unidade.toUpperCase()} · {TIPOS.find(([v]) => v === produto.tipo)?.[1]}</small></div>
              <div><span>Embalagem</span><strong>{embalagem.ativa ? embalagem.nome || "Embalagem" : "Unidade individual"}</strong><small>{embalagem.ativa && fator > 0 ? `1 ${embalagem.sigla || "emb."} = ${formatarQuantidade(fator)} ${produto.unidade}` : "Sem conversão"}</small></div>
              <div><span>Estoque inicial</span><strong>{resumoQuantidade}</strong><small>{estoque.registrar ? [depositoSelecionado?.nome, localizacaoSelecionada?.nome].filter(Boolean).join(" · ") || "Destino pendente" : "Pode receber estoque depois"}</small></div>
              <div><span>Rastreabilidade</span><strong>{produto.controla_lote ? `Lote ${estoque.registrar ? estoque.lote_codigo || "pendente" : "no recebimento"}` : produto.controla_serie ? "Número de série" : "Sem controle adicional"}</strong><small>{produto.controla_validade ? `Validade ${estoque.registrar ? formatarData(estoque.validade) : "no recebimento"}` : produto.controla_serie && estoque.registrar ? `${seriais.length} série(s)` : ""}</small></div>
            </div>
            <div className={styles.pipeline}><span>Produto</span><ChevronDown size={14} /><span>{embalagem.ativa ? "Embalagem" : "Sem embalagem"}</span><ChevronDown size={14} /><span>{produto.controla_lote && estoque.registrar ? "Lote" : "Sem lote inicial"}</span><ChevronDown size={14} /><span>{estoque.registrar ? "Documento de entrada → saldo → histórico" : "Saldo zero"}</span></div>
          </section>

          {erro ? <div className={styles.error}><AlertTriangle size={18} /> {erro}</div> : null}
        </div>

        <footer className={styles.footer}><button disabled={salvando} onClick={fechar}>Cancelar</button><button className={styles.primary} disabled={salvando} onClick={() => void cadastrar()}><CheckCircle2 size={18} />{salvando ? "Cadastrando..." : "Cadastrar produto"}</button></footer>
      </section>
    </div> : null}

    {scannerAlvo ? <CodigoBarrasScannerModal
      title={scannerAlvo === "produto" ? "Ler código do produto" : "Ler código da embalagem"}
      description="Aponte a câmera para o código de barras."
      continuous={false}
      onDetected={(codigo) => {
        if (scannerAlvo === "produto") setProduto((a) => ({ ...a, codigo_barras: codigo }));
        else setEmbalagem((a) => ({ ...a, codigo_barras: codigo }));
        setScannerAlvo(null);
        return { ok: true };
      }}
      onClose={() => setScannerAlvo(null)}
    /> : null}
  </>;
}
