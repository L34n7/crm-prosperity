"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  BadgeCheck,
  Banknote,
  Building2,
  FileDown,
  FileUp,
  PackageCheck,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShoppingCart,
  Truck,
  X,
} from "lucide-react";
import styles from "./ComprasPanel.module.css";

type ItemEstoque = {
  id: string;
  codigo: string | null;
  sku: string | null;
  codigo_barras: string | null;
  nome: string;
  unidade: string;
  controla_lote: boolean;
  controla_validade: boolean;
  controla_serie: boolean;
};
type Deposito = { id: string; nome: string; codigo: string };
type Localizacao = { id: string; deposito_id: string; codigo: string; nome: string };
type Classificacao = { id: string; nome: string };
type Fornecedor = {
  id: string; nome: string; nome_fantasia: string | null; tipo_pessoa: "fisica" | "juridica";
  documento: string | null; inscricao_estadual: string | null; email: string | null;
  telefone: string | null; cep: string | null; endereco: string | null; numero: string | null;
  complemento: string | null; bairro: string | null; cidade: string | null; estado: string | null;
  prazo_entrega_dias: number; observacao: string | null; ativo: boolean; versao: number;
};
type PedidoItem = {
  id: string; estoque_item_id: string; descricao: string; unidade: string;
  quantidade: number | string; quantidade_atendida: number | string;
  valor_unitario: number | string; desconto: number | string;
};
type Pagamento = {
  id: string; status: string; forma: string; valor: number | string; vencimento_em: string | null;
  confirmado_em: string | null; referencia: string | null; created_at: string;
};
type Recebimento = {
  id: string; numero: number | string; origem: "manual" | "xml_nfe"; nfe_numero: string | null;
  nfe_chave: string | null; total: number | string; recebido_em: string;
};
type Pedido = {
  id: string; numero: number | string; status: string; parceiro_id: string; deposito_id: string;
  data_emissao: string; previsao_em: string | null; subtotal: number | string; desconto: number | string;
  acrescimo: number | string; frete: number | string; total: number | string; valor_pago: number | string;
  observacao: string | null; itens: PedidoItem[]; pagamentos: Pagamento[]; recebimentos: Recebimento[];
};
type LinhaPedidoForm = { estoque_item_id: string; quantidade: string; valor_unitario: string; desconto: string };
type LinhaRecebimento = {
  pedido_item_id: string; quantidade: string; custo_unitario: string; localizacao_id: string;
  lote_codigo: string; fabricado_em: string; validade: string; numero_serie: string;
};
type XmlItem = {
  numero_item: number; codigo_fornecedor: string; ean: string; descricao: string; unidade: string;
  quantidade: number; custo_unitario: number; lote_codigo: string; fabricado_em: string; validade: string;
  numero_serie: string; estoque_item_id: string; correspondencia: "automatica" | "pendente";
  criar_item: boolean; categoria_id: string; categoria_nome: string; categoria_nova: boolean;
  marca_id: string; marca_nome: string; marca_nova: boolean;
  novo_nome: string; controla_lote: boolean; controla_validade: boolean;
};
type Nfe = {
  chave: string; numero: string; serie: string; emissao: string; frete: number; total: number;
  fornecedor: { id: string; nome: string; nome_fantasia: string; documento: string };
  itens: XmlItem[];
};

const FORNECEDOR_INICIAL = {
  id: "", versao: 1, tipo_pessoa: "juridica", nome: "", nome_fantasia: "", documento: "",
  inscricao_estadual: "", email: "", telefone: "", cep: "", endereco: "", numero: "",
  complemento: "", bairro: "", cidade: "", estado: "", prazo_entrega_dias: "0", observacao: "",
};
const LINHA_PEDIDO_INICIAL: LinhaPedidoForm = { estoque_item_id: "", quantidade: "1", valor_unitario: "0", desconto: "0" };

function moeda(valor: unknown) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(valor ?? 0));
}
function quantidade(valor: unknown) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(Number(valor ?? 0));
}
function dataHora(valor: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(valor));
}
function hoje() { return new Date().toISOString().slice(0, 10); }

export default function ComprasPanel({
  itens,
  depositos,
  localizacoes,
  categorias,
  marcas,
  permissoes,
  onAtualizarEstoque,
}: {
  itens: ItemEstoque[];
  depositos: Deposito[];
  localizacoes: Localizacao[];
  categorias: Classificacao[];
  marcas: Classificacao[];
  permissoes: string[];
  onAtualizarEstoque: () => void;
}) {
  const [secao, setSecao] = useState<"pedidos" | "fornecedores">("pedidos");
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [busca, setBusca] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [modal, setModal] = useState<"fornecedor" | "pedido" | "recebimento" | "xml" | "pagamento" | "detalhes" | null>(null);
  const [fornecedorForm, setFornecedorForm] = useState({ ...FORNECEDOR_INICIAL });
  const [pedidoForm, setPedidoForm] = useState({ id: "", parceiro_id: "", deposito_id: "", data_emissao: hoje(), previsao_em: "", desconto: "0", acrescimo: "0", frete: "0", observacao: "", itens: [{ ...LINHA_PEDIDO_INICIAL }] });
  const [pedidoSelecionado, setPedidoSelecionado] = useState<Pedido | null>(null);
  const [recebimentoItens, setRecebimentoItens] = useState<LinhaRecebimento[]>([]);
  const [observacaoRecebimento, setObservacaoRecebimento] = useState("");
  const [pagamentoForm, setPagamentoForm] = useState({ valor: "", forma: "pix", vencimento_em: hoje(), referencia: "", observacao: "" });
  const [xml, setXml] = useState("");
  const [nfe, setNfe] = useState<Nfe | null>(null);
  const [xmlDepositoId, setXmlDepositoId] = useState("");
  const [xmlLocalizacoes, setXmlLocalizacoes] = useState<Record<number, string>>({});
  const arquivoRef = useRef<HTMLInputElement>(null);

  const podeGerenciar = permissoes.includes("compras.gerenciar");
  const podeAprovar = permissoes.includes("compras.aprovar");
  const podeFinanceiro = permissoes.includes("financeiro.operacional");

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const resposta = await fetch("/api/compras", { cache: "no-store" });
      const dados = await resposta.json();
      if (!resposta.ok) throw new Error(dados.error || "Erro ao carregar compras.");
      setFornecedores(dados.fornecedores ?? []);
      setPedidos(dados.pedidos ?? []);
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao carregar compras.");
    } finally { setCarregando(false); }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  async function enviar(payload: Record<string, unknown>, sucesso: string) {
    setSalvando(true); setErro(""); setMensagem("");
    try {
      const resposta = await fetch("/api/compras", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const dados = await resposta.json();
      if (!resposta.ok) throw new Error(dados.error || "Não foi possível concluir a operação.");
      setMensagem(dados.message || sucesso);
      await carregar();
      return dados;
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro inesperado.");
      return null;
    } finally { setSalvando(false); }
  }

  const fornecedoresFiltrados = useMemo(() => fornecedores.filter((fornecedor) =>
    `${fornecedor.nome} ${fornecedor.nome_fantasia || ""} ${fornecedor.documento || ""}`.toLowerCase().includes(busca.toLowerCase())), [fornecedores, busca]);
  const pedidosFiltrados = useMemo(() => pedidos.filter((pedido) => {
    const fornecedor = fornecedores.find((item) => item.id === pedido.parceiro_id);
    return `#${pedido.numero} ${pedido.status} ${fornecedor?.nome || ""}`.toLowerCase().includes(busca.toLowerCase());
  }), [pedidos, fornecedores, busca]);

  function abrirFornecedor(fornecedor?: Fornecedor) {
    setFornecedorForm(fornecedor ? {
      id: fornecedor.id, versao: fornecedor.versao, tipo_pessoa: fornecedor.tipo_pessoa,
      nome: fornecedor.nome, nome_fantasia: fornecedor.nome_fantasia || "", documento: fornecedor.documento || "",
      inscricao_estadual: fornecedor.inscricao_estadual || "", email: fornecedor.email || "", telefone: fornecedor.telefone || "",
      cep: fornecedor.cep || "", endereco: fornecedor.endereco || "", numero: fornecedor.numero || "",
      complemento: fornecedor.complemento || "", bairro: fornecedor.bairro || "", cidade: fornecedor.cidade || "",
      estado: fornecedor.estado || "", prazo_entrega_dias: String(fornecedor.prazo_entrega_dias || 0), observacao: fornecedor.observacao || "",
    } : { ...FORNECEDOR_INICIAL });
    setModal("fornecedor");
  }

  function abrirPedido(pedido?: Pedido) {
    setPedidoForm(pedido ? {
      id: pedido.id, parceiro_id: pedido.parceiro_id, deposito_id: pedido.deposito_id,
      data_emissao: pedido.data_emissao, previsao_em: pedido.previsao_em || "", desconto: String(pedido.desconto),
      acrescimo: String(pedido.acrescimo), frete: String(pedido.frete), observacao: pedido.observacao || "",
      itens: pedido.itens.map((item) => ({ estoque_item_id: item.estoque_item_id, quantidade: String(item.quantidade), valor_unitario: String(item.valor_unitario), desconto: String(item.desconto) })),
    } : { id: "", parceiro_id: "", deposito_id: depositos[0]?.id || "", data_emissao: hoje(), previsao_em: "", desconto: "0", acrescimo: "0", frete: "0", observacao: "", itens: [{ ...LINHA_PEDIDO_INICIAL }] });
    setModal("pedido");
  }

  function abrirRecebimento(pedido: Pedido) {
    setPedidoSelecionado(pedido);
    setObservacaoRecebimento("");
    setRecebimentoItens(pedido.itens.filter((item) => Number(item.quantidade_atendida) < Number(item.quantidade)).map((item) => ({
      pedido_item_id: item.id,
      quantidade: String(Number(item.quantidade) - Number(item.quantidade_atendida)),
      custo_unitario: String(item.valor_unitario), localizacao_id: "", lote_codigo: "", fabricado_em: "", validade: "", numero_serie: "",
    })));
    setModal("recebimento");
  }

  async function analisarArquivo(arquivo?: File) {
    if (!arquivo) return;
    if (!arquivo.name.toLowerCase().endsWith(".xml") || arquivo.size > 5_000_000) { setErro("Selecione um XML de NF-e com até 5 MB."); return; }
    const conteudo = await arquivo.text();
    setXml(conteudo); setSalvando(true); setErro(""); setNfe(null);
    try {
      const resposta = await fetch("/api/compras", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "analisar_xml", xml: conteudo }) });
      const dados = await resposta.json();
      if (!resposta.ok) throw new Error(dados.error || "XML inválido.");
      setNfe({
        ...dados.nfe,
        itens: (dados.nfe.itens ?? []).map((item: XmlItem) => ({
          ...item,
          criar_item: false,
          categoria_id: "",
          categoria_nome: "",
          categoria_nova: false,
          marca_id: "",
          marca_nome: "",
          marca_nova: false,
          novo_nome: item.descricao,
          controla_lote: Boolean(item.lote_codigo || item.validade),
          controla_validade: Boolean(item.validade),
        })),
      }); setXmlDepositoId(depositos[0]?.id || ""); setXmlLocalizacoes({}); setModal("xml");
    } catch (error) { setErro(error instanceof Error ? error.message : "Erro ao analisar XML."); }
    finally { setSalvando(false); if (arquivoRef.current) arquivoRef.current.value = ""; }
  }

  function atualizarLinhaPedido(indice: number, campo: keyof LinhaPedidoForm, valor: string) {
    setPedidoForm((atual) => ({ ...atual, itens: atual.itens.map((linha, posicao) => posicao === indice ? { ...linha, [campo]: valor } : linha) }));
  }
  function atualizarRecebimento(indice: number, campo: keyof LinhaRecebimento, valor: string) {
    setRecebimentoItens((atual) => atual.map((linha, posicao) => posicao === indice ? { ...linha, [campo]: valor } : linha));
  }
  function atualizarItemNfe(indice: number, alteracoes: Partial<XmlItem>) {
    setNfe((atual) => atual ? ({
      ...atual,
      itens: atual.itens.map((linha, posicao) => posicao === indice ? { ...linha, ...alteracoes } : linha),
    }) : atual);
  }

  const totalPedidoForm = pedidoForm.itens.reduce((total, linha) => total + Math.max(0, Number(linha.quantidade)) * Math.max(0, Number(linha.valor_unitario)) - Math.max(0, Number(linha.desconto)), 0) - Math.max(0, Number(pedidoForm.desconto)) + Math.max(0, Number(pedidoForm.acrescimo)) + Math.max(0, Number(pedidoForm.frete));

  return <div className={styles.root}>
    <div className={styles.topbar}>
      <div className={styles.switcher}>
        <button className={secao === "pedidos" ? styles.active : ""} onClick={() => setSecao("pedidos")}><ShoppingCart size={17} /> Pedidos</button>
        <button className={secao === "fornecedores" ? styles.active : ""} onClick={() => setSecao("fornecedores")}><Building2 size={17} /> Fornecedores</button>
      </div>
      <div className={styles.actions}>
        <label className={styles.search}><Search size={17} /><input value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Buscar" /></label>
        <button className={styles.secondary} onClick={() => void carregar()}><RefreshCw size={16} /> Atualizar</button>
        {podeAprovar ? <><input ref={arquivoRef} hidden type="file" accept=".xml,text/xml,application/xml" onChange={(event) => void analisarArquivo(event.target.files?.[0])} /><button className={styles.secondary} onClick={() => arquivoRef.current?.click()}><FileUp size={16} /> Importar NF-e</button></> : null}
        {secao === "pedidos" && podeGerenciar ? <button className={styles.primary} onClick={() => abrirPedido()}><Plus size={16} /> Novo pedido</button> : null}
        {secao === "fornecedores" && podeGerenciar ? <button className={styles.primary} onClick={() => abrirFornecedor()}><Plus size={16} /> Novo fornecedor</button> : null}
      </div>
    </div>
    {erro ? <div className={styles.error}>{erro}</div> : null}
    {mensagem ? <div className={styles.success}>{mensagem}</div> : null}
    {carregando ? <div className={styles.empty}>Carregando compras...</div> : null}

    {!carregando && secao === "fornecedores" ? <div className={styles.grid}>
      {fornecedoresFiltrados.map((fornecedor) => <article className={styles.card} key={fornecedor.id}>
        <div className={styles.cardIcon}><Building2 size={21} /></div>
        <div className={styles.cardMain}><span className={styles.badge}>{fornecedor.tipo_pessoa === "juridica" ? "Pessoa jurídica" : "Pessoa física"}</span><h3>{fornecedor.nome_fantasia || fornecedor.nome}</h3><p>{fornecedor.nome_fantasia ? fornecedor.nome : fornecedor.documento || "Documento não informado"}</p><small>{[fornecedor.cidade, fornecedor.estado].filter(Boolean).join("/") || "Endereço não informado"} · prazo de {fornecedor.prazo_entrega_dias} dias</small></div>
        {podeGerenciar ? <div className={styles.cardButtons}><button onClick={() => abrirFornecedor(fornecedor)}><Pencil size={15} /> Editar</button><button className={styles.danger} onClick={() => void enviar({ acao: "arquivar_fornecedor", id: fornecedor.id }, "Fornecedor arquivado.")}><Archive size={15} /></button></div> : null}
      </article>)}
      {!fornecedoresFiltrados.length ? <div className={styles.empty}>Nenhum fornecedor encontrado.</div> : null}
    </div> : null}

    {!carregando && secao === "pedidos" ? <div className={styles.list}>
      {pedidosFiltrados.map((pedido) => {
        const fornecedor = fornecedores.find((item) => item.id === pedido.parceiro_id);
        const pendentes = pedido.itens.reduce((total, item) => total + Math.max(0, Number(item.quantidade) - Number(item.quantidade_atendida)), 0);
        return <article className={styles.order} key={pedido.id}>
          <div className={styles.orderHead}><div><span className={`${styles.status} ${styles[`status_${pedido.status}`] || ""}`}>{pedido.status.replaceAll("_", " ")}</span><h3>Pedido #{pedido.numero} · {fornecedor?.nome_fantasia || fornecedor?.nome || "Fornecedor"}</h3><p>Emissão {new Date(`${pedido.data_emissao}T12:00:00`).toLocaleDateString("pt-BR")} · {pedido.itens.length} itens · pendência {quantidade(pendentes)}</p></div><strong>{moeda(pedido.total)}</strong></div>
          <div className={styles.progress}><span style={{ width: `${Math.min(100, pedido.itens.reduce((a, i) => a + Number(i.quantidade_atendida), 0) / Math.max(1, pedido.itens.reduce((a, i) => a + Number(i.quantidade), 0)) * 100)}%` }} /></div>
          <div className={styles.orderMeta}><span>Recebimentos: <strong>{pedido.recebimentos.length}</strong></span><span>Pago: <strong>{moeda(pedido.valor_pago)}</strong></span><span>Saldo: <strong>{moeda(Math.max(0, Number(pedido.total) - Number(pedido.valor_pago)))}</strong></span></div>
          <div className={styles.orderActions}>
            <button onClick={() => { setPedidoSelecionado(pedido); setModal("detalhes"); }}>Detalhes</button>
            {pedido.status === "rascunho" && podeGerenciar ? <button onClick={() => abrirPedido(pedido)}><Pencil size={15} /> Editar</button> : null}
            {pedido.status === "rascunho" && podeAprovar ? <button className={styles.primary} onClick={() => void enviar({ acao: "aprovar_pedido", id: pedido.id }, "Pedido aprovado.")}><BadgeCheck size={15} /> Aprovar</button> : null}
            {["aprovado", "parcial"].includes(pedido.status) && podeAprovar ? <button className={styles.primary} onClick={() => abrirRecebimento(pedido)}><PackageCheck size={15} /> Receber</button> : null}
            {pedido.status !== "cancelado" && Number(pedido.valor_pago) < Number(pedido.total) && podeFinanceiro ? <button onClick={() => { setPedidoSelecionado(pedido); setPagamentoForm({ valor: String(Math.max(0, Number(pedido.total) - Number(pedido.valor_pago))), forma: "pix", vencimento_em: hoje(), referencia: "", observacao: "" }); setModal("pagamento"); }}><Banknote size={15} /> Pagamento</button> : null}
          </div>
        </article>;
      })}
      {!pedidosFiltrados.length ? <div className={styles.empty}>Nenhum pedido de compra registrado.</div> : null}
    </div> : null}

    {modal ? <div className={styles.overlay} onMouseDown={() => !salvando && setModal(null)}><section className={styles.modal} onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
      <header><div><span>Compras e suprimentos</span><h2>{modal === "fornecedor" ? (fornecedorForm.id ? "Editar fornecedor" : "Novo fornecedor") : modal === "pedido" ? (pedidoForm.id ? "Editar pedido" : "Novo pedido") : modal === "recebimento" ? `Receber pedido #${pedidoSelecionado?.numero}` : modal === "xml" ? `Conferir NF-e ${nfe?.numero || ""}` : modal === "pagamento" ? "Registrar pagamento" : `Pedido #${pedidoSelecionado?.numero}`}</h2></div><button className={styles.close} onClick={() => setModal(null)}><X size={19} /></button></header>

      {modal === "fornecedor" ? <form className={styles.body} onSubmit={(event) => { event.preventDefault(); void enviar({ acao: "salvar_fornecedor", ...fornecedorForm }, "Fornecedor salvo.").then((ok) => ok && setModal(null)); }}><div className={styles.formGrid}>
        <label><span>Tipo de pessoa</span><select value={fornecedorForm.tipo_pessoa} onChange={(e) => setFornecedorForm((a) => ({ ...a, tipo_pessoa: e.target.value }))}><option value="juridica">Pessoa jurídica</option><option value="fisica">Pessoa física</option></select></label>
        <label><span>{fornecedorForm.tipo_pessoa === "juridica" ? "Razão social" : "Nome"} *</span><input required value={fornecedorForm.nome} onChange={(e) => setFornecedorForm((a) => ({ ...a, nome: e.target.value }))} /></label>
        <label><span>Nome fantasia</span><input value={fornecedorForm.nome_fantasia} onChange={(e) => setFornecedorForm((a) => ({ ...a, nome_fantasia: e.target.value }))} /></label>
        <label><span>CPF/CNPJ</span><input value={fornecedorForm.documento} onChange={(e) => setFornecedorForm((a) => ({ ...a, documento: e.target.value }))} /></label>
        <label><span>Inscrição estadual</span><input value={fornecedorForm.inscricao_estadual} onChange={(e) => setFornecedorForm((a) => ({ ...a, inscricao_estadual: e.target.value }))} /></label>
        <label><span>E-mail</span><input type="email" value={fornecedorForm.email} onChange={(e) => setFornecedorForm((a) => ({ ...a, email: e.target.value }))} /></label>
        <label><span>Telefone</span><input value={fornecedorForm.telefone} onChange={(e) => setFornecedorForm((a) => ({ ...a, telefone: e.target.value }))} /></label>
        <label><span>CEP</span><input value={fornecedorForm.cep} onChange={(e) => setFornecedorForm((a) => ({ ...a, cep: e.target.value }))} /></label>
        <label className={styles.wide}><span>Endereço</span><input value={fornecedorForm.endereco} onChange={(e) => setFornecedorForm((a) => ({ ...a, endereco: e.target.value }))} /></label>
        <label><span>Número</span><input value={fornecedorForm.numero} onChange={(e) => setFornecedorForm((a) => ({ ...a, numero: e.target.value }))} /></label>
        <label><span>Bairro</span><input value={fornecedorForm.bairro} onChange={(e) => setFornecedorForm((a) => ({ ...a, bairro: e.target.value }))} /></label>
        <label><span>Cidade</span><input value={fornecedorForm.cidade} onChange={(e) => setFornecedorForm((a) => ({ ...a, cidade: e.target.value }))} /></label>
        <label><span>UF</span><input maxLength={2} value={fornecedorForm.estado} onChange={(e) => setFornecedorForm((a) => ({ ...a, estado: e.target.value.toUpperCase() }))} /></label>
        <label><span>Prazo de entrega (dias)</span><input type="number" min="0" value={fornecedorForm.prazo_entrega_dias} onChange={(e) => setFornecedorForm((a) => ({ ...a, prazo_entrega_dias: e.target.value }))} /></label>
        <label className={styles.full}><span>Observações</span><textarea value={fornecedorForm.observacao} onChange={(e) => setFornecedorForm((a) => ({ ...a, observacao: e.target.value }))} /></label>
      </div><footer><button type="button" onClick={() => setModal(null)}>Cancelar</button><button className={styles.primary} disabled={salvando}>{salvando ? "Salvando..." : "Salvar fornecedor"}</button></footer></form> : null}

      {modal === "pedido" ? <form className={styles.body} onSubmit={(event) => { event.preventDefault(); void enviar({ acao: "salvar_pedido", ...pedidoForm, itens: pedidoForm.itens.map((linha) => ({ ...linha, descricao: itens.find((item) => item.id === linha.estoque_item_id)?.nome, unidade: itens.find((item) => item.id === linha.estoque_item_id)?.unidade })) }, "Pedido salvo.").then((ok) => ok && setModal(null)); }}>
        <div className={styles.formGrid}><label><span>Fornecedor *</span><select required value={pedidoForm.parceiro_id} onChange={(e) => setPedidoForm((a) => ({ ...a, parceiro_id: e.target.value }))}><option value="">Selecione</option>{fornecedores.filter((f) => f.ativo).map((f) => <option key={f.id} value={f.id}>{f.nome_fantasia || f.nome}</option>)}</select></label><label><span>Depósito *</span><select required value={pedidoForm.deposito_id} onChange={(e) => setPedidoForm((a) => ({ ...a, deposito_id: e.target.value }))}><option value="">Selecione</option>{depositos.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}</select></label><label><span>Emissão</span><input type="date" value={pedidoForm.data_emissao} onChange={(e) => setPedidoForm((a) => ({ ...a, data_emissao: e.target.value }))} /></label><label><span>Previsão</span><input type="date" value={pedidoForm.previsao_em} onChange={(e) => setPedidoForm((a) => ({ ...a, previsao_em: e.target.value }))} /></label></div>
        <div className={styles.lines}><div className={styles.linesHead}><h3>Itens do pedido</h3><button type="button" onClick={() => setPedidoForm((a) => ({ ...a, itens: [...a.itens, { ...LINHA_PEDIDO_INICIAL }] }))}><Plus size={15} /> Item</button></div>{pedidoForm.itens.map((linha, indice) => <div className={styles.line} key={indice}><label><span>Item</span><select required value={linha.estoque_item_id} onChange={(e) => atualizarLinhaPedido(indice, "estoque_item_id", e.target.value)}><option value="">Selecione</option>{itens.map((item) => <option key={item.id} value={item.id}>{item.nome} · {item.codigo || item.sku || "sem código"}</option>)}</select></label><label><span>Quantidade</span><input required type="number" min="0.001" step="0.001" value={linha.quantidade} onChange={(e) => atualizarLinhaPedido(indice, "quantidade", e.target.value)} /></label><label><span>Custo unitário</span><input required type="number" min="0" step="0.01" value={linha.valor_unitario} onChange={(e) => atualizarLinhaPedido(indice, "valor_unitario", e.target.value)} /></label><label><span>Desconto</span><input type="number" min="0" step="0.01" value={linha.desconto} onChange={(e) => atualizarLinhaPedido(indice, "desconto", e.target.value)} /></label><button className={styles.remove} type="button" disabled={pedidoForm.itens.length === 1} onClick={() => setPedidoForm((a) => ({ ...a, itens: a.itens.filter((_, posicao) => posicao !== indice) }))}><X size={16} /></button></div>)}</div>
        <div className={styles.formGrid}><label><span>Desconto geral</span><input type="number" min="0" step="0.01" value={pedidoForm.desconto} onChange={(e) => setPedidoForm((a) => ({ ...a, desconto: e.target.value }))} /></label><label><span>Acréscimo</span><input type="number" min="0" step="0.01" value={pedidoForm.acrescimo} onChange={(e) => setPedidoForm((a) => ({ ...a, acrescimo: e.target.value }))} /></label><label><span>Frete</span><input type="number" min="0" step="0.01" value={pedidoForm.frete} onChange={(e) => setPedidoForm((a) => ({ ...a, frete: e.target.value }))} /></label><div className={styles.totalBox}><span>Total estimado</span><strong>{moeda(totalPedidoForm)}</strong></div><label className={styles.full}><span>Observações</span><textarea value={pedidoForm.observacao} onChange={(e) => setPedidoForm((a) => ({ ...a, observacao: e.target.value }))} /></label></div>
        <footer><button type="button" onClick={() => setModal(null)}>Cancelar</button><button className={styles.primary} disabled={salvando}>{salvando ? "Salvando..." : "Salvar pedido"}</button></footer>
      </form> : null}

      {modal === "recebimento" && pedidoSelecionado ? <form className={styles.body} onSubmit={(event) => { event.preventDefault(); const itensRecebidos = recebimentoItens.filter((item) => Number(item.quantidade) > 0); if (!itensRecebidos.length) { setErro("Informe uma quantidade recebida em ao menos um item."); return; } void enviar({ acao: "receber_pedido", id: pedidoSelecionado.id, deposito_id: pedidoSelecionado.deposito_id, itens: itensRecebidos, observacao: observacaoRecebimento, idempotency_key: crypto.randomUUID() }, "Compra recebida.").then((ok) => { if (ok) { setModal(null); onAtualizarEstoque(); } }); }}><div className={styles.notice}><Truck size={18} /><span>O recebimento criará uma entrada confirmada no depósito <strong>{depositos.find((d) => d.id === pedidoSelecionado.deposito_id)?.nome}</strong>. Use quantidade zero para deixar um item pendente.</span></div><div className={styles.lines}>{recebimentoItens.map((linha, indice) => { const pedidoItem = pedidoSelecionado.itens.find((item) => item.id === linha.pedido_item_id)!; const item = itens.find((registro) => registro.id === pedidoItem.estoque_item_id); const vaiReceber = Number(linha.quantidade) > 0; return <div className={styles.receiveLine} key={linha.pedido_item_id}><div className={styles.receiveTitle}><strong>{item?.nome}</strong><span>Pendente: {quantidade(Number(pedidoItem.quantidade) - Number(pedidoItem.quantidade_atendida))} {item?.unidade}</span></div><div className={styles.formGrid}><label><span>Receber</span><input required type="number" min="0" max={Number(pedidoItem.quantidade) - Number(pedidoItem.quantidade_atendida)} step="0.001" value={linha.quantidade} onChange={(e) => atualizarRecebimento(indice, "quantidade", e.target.value)} /></label><label><span>Custo unitário</span><input required={vaiReceber} type="number" min="0" step="0.01" value={linha.custo_unitario} onChange={(e) => atualizarRecebimento(indice, "custo_unitario", e.target.value)} /></label><label><span>Localização</span><select disabled={!vaiReceber} value={linha.localizacao_id} onChange={(e) => atualizarRecebimento(indice, "localizacao_id", e.target.value)}><option value="">Sem localização</option>{localizacoes.filter((l) => l.deposito_id === pedidoSelecionado.deposito_id).map((l) => <option key={l.id} value={l.id}>{l.codigo} · {l.nome}</option>)}</select></label>{vaiReceber && (item?.controla_lote || item?.controla_validade) ? <><label><span>Lote *</span><input required value={linha.lote_codigo} onChange={(e) => atualizarRecebimento(indice, "lote_codigo", e.target.value)} /></label><label><span>Fabricação</span><input type="date" value={linha.fabricado_em} onChange={(e) => atualizarRecebimento(indice, "fabricado_em", e.target.value)} /></label><label><span>Validade {item.controla_validade ? "*" : ""}</span><input required={item.controla_validade} type="date" value={linha.validade} onChange={(e) => atualizarRecebimento(indice, "validade", e.target.value)} /></label></> : null}{vaiReceber && item?.controla_serie ? <label><span>Número de série *</span><input required value={linha.numero_serie} onChange={(e) => atualizarRecebimento(indice, "numero_serie", e.target.value)} /></label> : null}</div></div>; })}</div><label className={styles.full}><span>Observações do recebimento</span><textarea value={observacaoRecebimento} onChange={(e) => setObservacaoRecebimento(e.target.value)} /></label><footer><button type="button" onClick={() => setModal(null)}>Cancelar</button><button className={styles.primary} disabled={salvando}>{salvando ? "Confirmando..." : "Confirmar recebimento"}</button></footer></form> : null}

      {modal === "xml" && nfe ? <form className={styles.body} onSubmit={(event) => {
        event.preventDefault();
        void enviar({
          acao: "receber_xml",
          xml,
          fornecedor_id: nfe.fornecedor.id,
          deposito_id: xmlDepositoId,
          itens: nfe.itens.map((item) => ({
            estoque_item_id: item.criar_item ? "" : item.estoque_item_id,
            criar_item: item.criar_item,
            novo_item: item.criar_item ? {
              nome: item.novo_nome,
              codigo: item.codigo_fornecedor,
              sku: item.codigo_fornecedor,
              codigo_barras: item.ean,
              unidade: item.unidade,
              custo_unitario: item.custo_unitario,
              categoria_id: item.categoria_nova ? "" : item.categoria_id,
              categoria_nome: item.categoria_nova ? item.categoria_nome : "",
              marca_id: item.marca_nova ? "" : item.marca_id,
              marca_nome: item.marca_nova ? item.marca_nome : "",
              controla_lote: item.controla_lote,
              controla_validade: item.controla_validade,
            } : null,
            localizacao_id: xmlLocalizacoes[item.numero_item] || "",
            lote_codigo: item.lote_codigo,
            fabricado_em: item.fabricado_em,
            validade: item.validade,
            numero_serie: item.numero_serie || "",
          })),
        }, "NF-e importada.").then((ok) => {
          if (ok) {
            setModal(null);
            setNfe(null);
            setXml("");
            onAtualizarEstoque();
          }
        });
      }}>
        <div className={styles.xmlSummary}>
          <div><span>Fornecedor</span><strong>{nfe.fornecedor.nome_fantasia || nfe.fornecedor.nome}</strong><small>{nfe.fornecedor.documento}</small></div>
          <div><span>Chave</span><strong>NF-e {nfe.numero} / Série {nfe.serie}</strong><small>{nfe.chave}</small></div>
          <div><span>Total</span><strong>{moeda(nfe.total)}</strong><small>{nfe.itens.length} produtos</small></div>
        </div>
        <label><span>Depósito de entrada *</span><select required value={xmlDepositoId} onChange={(e) => { setXmlDepositoId(e.target.value); setXmlLocalizacoes({}); }}><option value="">Selecione</option>{depositos.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}</select></label>
        <div className={styles.lines}>{nfe.itens.map((item, indice) => {
          const itemVinculado = itens.find((estoqueItem) => estoqueItem.id === item.estoque_item_id);
          const controlaLote = item.criar_item ? item.controla_lote : Boolean(itemVinculado?.controla_lote);
          const controlaValidade = item.criar_item ? item.controla_validade : Boolean(itemVinculado?.controla_validade);
          return <div className={`${styles.xmlLine} ${item.criar_item ? styles.xmlLineCreating : ""}`} key={item.numero_item}>
            <div className={styles.xmlProductInfo}>
              <span className={item.criar_item || item.correspondencia !== "automatica" ? styles.warning : styles.badge}>#{item.numero_item} {item.criar_item ? "Novo produto" : item.correspondencia === "automatica" ? "Correspondência automática" : "Vínculo obrigatório"}</span>
              <strong>{item.descricao}</strong>
              <small>{item.codigo_fornecedor || "Sem código do fornecedor"} · EAN {item.ean || "não informado"} · {quantidade(item.quantidade)} {item.unidade} · {moeda(item.custo_unitario)}</small>
            </div>
            <label><span>Tratamento do produto *</span><select value={item.criar_item ? "__criar__" : item.estoque_item_id} onChange={(e) => atualizarItemNfe(indice, { criar_item: e.target.value === "__criar__", estoque_item_id: e.target.value === "__criar__" ? "" : e.target.value, correspondencia: e.target.value === "__criar__" ? "pendente" : "automatica" })}><option value="">Selecione um item existente</option>{itens.map((estoqueItem) => <option key={estoqueItem.id} value={estoqueItem.id}>{estoqueItem.nome} · {estoqueItem.codigo || estoqueItem.sku || "sem código"}</option>)}<option value="__criar__">+ Criar produto com os dados da NF-e</option></select></label>
            <label><span>Localização</span><select value={xmlLocalizacoes[item.numero_item] || ""} onChange={(e) => setXmlLocalizacoes((a) => ({ ...a, [item.numero_item]: e.target.value }))}><option value="">Sem localização</option>{localizacoes.filter((l) => l.deposito_id === xmlDepositoId).map((l) => <option key={l.id} value={l.id}>{l.codigo} · {l.nome}</option>)}</select></label>

            {item.criar_item ? <div className={styles.xmlNewProduct}>
              <div className={styles.xmlNewProductTitle}><PackageCheck size={18} /><div><strong>Cadastro do novo produto</strong><small>Os dados fiscais vieram do XML. Complete a classificação antes de receber.</small></div></div>
              <label><span>Nome do produto *</span><input required value={item.novo_nome} onChange={(e) => atualizarItemNfe(indice, { novo_nome: e.target.value })} /></label>
              <label><span>Categoria</span><select value={item.categoria_nova ? "__nova__" : item.categoria_id} onChange={(e) => atualizarItemNfe(indice, { categoria_nova: e.target.value === "__nova__", categoria_id: e.target.value === "__nova__" ? "" : e.target.value, categoria_nome: "" })}><option value="">Sem categoria</option>{categorias.map((categoria) => <option key={categoria.id} value={categoria.id}>{categoria.nome}</option>)}<option value="__nova__">+ Nova categoria</option></select></label>
              {item.categoria_nova ? <label><span>Nome da nova categoria *</span><input required value={item.categoria_nome} onChange={(e) => atualizarItemNfe(indice, { categoria_nome: e.target.value })} placeholder="Se já existir, será reutilizada" /></label> : null}
              <label><span>Marca</span><select value={item.marca_nova ? "__nova__" : item.marca_id} onChange={(e) => atualizarItemNfe(indice, { marca_nova: e.target.value === "__nova__", marca_id: e.target.value === "__nova__" ? "" : e.target.value, marca_nome: "" })}><option value="">Sem marca</option>{marcas.map((marca) => <option key={marca.id} value={marca.id}>{marca.nome}</option>)}<option value="__nova__">+ Nova marca</option></select></label>
              {item.marca_nova ? <label><span>Nome da nova marca *</span><input required value={item.marca_nome} onChange={(e) => atualizarItemNfe(indice, { marca_nome: e.target.value })} placeholder="Se já existir, será reutilizada" /></label> : null}
              <label className={styles.xmlCheck}><input type="checkbox" checked={item.controla_lote} onChange={(e) => atualizarItemNfe(indice, { controla_lote: e.target.checked, controla_validade: e.target.checked ? item.controla_validade : false })} /><span>Controlar lote</span></label>
              <label className={styles.xmlCheck}><input type="checkbox" checked={item.controla_validade} onChange={(e) => atualizarItemNfe(indice, { controla_validade: e.target.checked, controla_lote: e.target.checked || item.controla_lote })} /><span>Controlar validade</span></label>
            </div> : null}

            {controlaLote || controlaValidade ? <>
              <label><span>Lote *</span><input required value={item.lote_codigo || ""} onChange={(e) => atualizarItemNfe(indice, { lote_codigo: e.target.value })} /></label>
              <label><span>Fabricação</span><input type="date" value={item.fabricado_em || ""} onChange={(e) => atualizarItemNfe(indice, { fabricado_em: e.target.value })} /></label>
              <label><span>Validade {controlaValidade ? "*" : ""}</span><input required={controlaValidade} type="date" value={item.validade || ""} onChange={(e) => atualizarItemNfe(indice, { validade: e.target.value })} /></label>
            </> : null}
            {!item.criar_item && itemVinculado?.controla_serie ? <label><span>Número de série *</span><input required value={item.numero_serie || ""} onChange={(e) => atualizarItemNfe(indice, { numero_serie: e.target.value })} /></label> : null}
          </div>;
        })}</div>
        <div className={styles.notice}><FileUp size={18} /><span>Produtos novos, categorias, marcas, fornecedor, pedido, recebimento e entrada no estoque serão gravados juntos. Se alguma etapa falhar, nada será recebido parcialmente.</span></div>
        <footer><button type="button" onClick={() => setModal(null)}>Cancelar</button><button className={styles.primary} disabled={salvando}>{salvando ? "Importando..." : "Importar e receber NF-e"}</button></footer>
      </form> : null}

      {modal === "pagamento" && pedidoSelecionado ? <form className={styles.body} onSubmit={(event) => { event.preventDefault(); void enviar({ acao: "registrar_pagamento", id: pedidoSelecionado.id, ...pagamentoForm, confirmar: true, idempotency_key: crypto.randomUUID() }, "Pagamento registrado.").then((ok) => ok && setModal(null)); }}><div className={styles.notice}><Banknote size={18} /><span>Saldo do pedido: <strong>{moeda(Math.max(0, Number(pedidoSelecionado.total) - Number(pedidoSelecionado.valor_pago)))}</strong></span></div><div className={styles.formGrid}><label><span>Valor *</span><input required type="number" min="0.01" max={Math.max(0, Number(pedidoSelecionado.total) - Number(pedidoSelecionado.valor_pago))} step="0.01" value={pagamentoForm.valor} onChange={(e) => setPagamentoForm((a) => ({ ...a, valor: e.target.value }))} /></label><label><span>Forma</span><select value={pagamentoForm.forma} onChange={(e) => setPagamentoForm((a) => ({ ...a, forma: e.target.value }))}>{[["pix","Pix"],["dinheiro","Dinheiro"],["boleto","Boleto"],["transferencia","Transferência"],["cartao_credito","Cartão de crédito"],["cartao_debito","Cartão de débito"],["outro","Outro"]].map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label><label><span>Data</span><input type="date" value={pagamentoForm.vencimento_em} onChange={(e) => setPagamentoForm((a) => ({ ...a, vencimento_em: e.target.value }))} /></label><label><span>Referência</span><input value={pagamentoForm.referencia} onChange={(e) => setPagamentoForm((a) => ({ ...a, referencia: e.target.value }))} placeholder="NSU, autenticação ou identificação" /></label><label className={styles.full}><span>Observações</span><textarea value={pagamentoForm.observacao} onChange={(e) => setPagamentoForm((a) => ({ ...a, observacao: e.target.value }))} /></label></div><footer><button type="button" onClick={() => setModal(null)}>Cancelar</button><button className={styles.primary} disabled={salvando}>{salvando ? "Registrando..." : "Confirmar pagamento"}</button></footer></form> : null}

      {modal === "detalhes" && pedidoSelecionado ? <div className={styles.body}><div className={styles.detailGrid}><section><h3>Itens</h3>{pedidoSelecionado.itens.map((linha) => <div className={styles.detailRow} key={linha.id}><span>{linha.descricao}<small>{quantidade(linha.quantidade_atendida)} de {quantidade(linha.quantidade)} recebidos</small></span><strong>{moeda(Number(linha.quantidade) * Number(linha.valor_unitario) - Number(linha.desconto))}</strong></div>)}</section><section><h3>Recebimentos</h3>{pedidoSelecionado.recebimentos.map((recebimento) => <div className={styles.detailRow} key={recebimento.id}><span>Recebimento #{recebimento.numero}<small>{recebimento.origem === "xml_nfe" ? `NF-e ${recebimento.nfe_numero}` : "Entrada manual"} · {dataHora(recebimento.recebido_em)}</small></span><strong>{moeda(recebimento.total)}</strong></div>)}{!pedidoSelecionado.recebimentos.length ? <p>Nenhum recebimento.</p> : null}</section><section><h3>Pagamentos e comprovantes</h3>{pedidoSelecionado.pagamentos.map((pagamento) => <div className={styles.detailRow} key={pagamento.id}><span>{pagamento.forma.replaceAll("_", " ")}<small>{pagamento.status} · {dataHora(pagamento.confirmado_em || pagamento.created_at)}</small></span><div><strong>{moeda(pagamento.valor)}</strong>{pagamento.status === "confirmado" ? <a href={`/api/compras/comprovante/${pagamento.id}`} target="_blank" rel="noreferrer"><FileDown size={14} /> PDF</a> : null}</div></div>)}{!pedidoSelecionado.pagamentos.length ? <p>Nenhum pagamento.</p> : null}</section></div><footer><button onClick={() => setModal(null)}>Fechar</button></footer></div> : null}
    </section></div> : null}
  </div>;
}
