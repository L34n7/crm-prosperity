"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowDownToLine,
  Boxes,
  CalendarClock,
  CircleOff,
  Pencil,
  Plus,
  Warehouse,
  X,
} from "lucide-react";
import styles from "./EstruturaEstoquePanel.module.css";

type Modo = "depositos" | "lotes";

export type EstruturaItem = {
  id: string;
  nome: string;
  unidade: string;
  controla_lote: boolean;
  controla_validade: boolean;
};

export type EstruturaDeposito = {
  id: string;
  codigo: string;
  nome: string;
  descricao: string | null;
  principal: boolean;
  permite_saldo_negativo: boolean;
};

export type EstruturaLocalizacao = {
  id: string;
  deposito_id: string;
  codigo: string;
  nome: string;
};

export type EstruturaLote = {
  id: string;
  estoque_item_id: string;
  codigo: string;
  fabricado_em: string | null;
  validade: string | null;
  fabricante: string | null;
  bloqueado: boolean;
};

export type EstruturaSaldo = {
  id: string;
  estoque_item_id: string;
  deposito_id: string;
  localizacao_id: string | null;
  lote_id: string | null;
  numero_serie: string | null;
  saldo_fisico: number | string;
  saldo_reservado: number | string;
  custo_medio: number | string;
};

type MovimentacaoInicial = {
  tipo: "entrada" | "transferencia";
  itemId?: string;
  depositoOrigemId?: string;
  depositoDestinoId?: string;
  localizacaoOrigemId?: string;
  loteId?: string;
};

type Props = {
  modo: Modo;
  itens: EstruturaItem[];
  depositos: EstruturaDeposito[];
  localizacoes: EstruturaLocalizacao[];
  lotes: EstruturaLote[];
  saldos: EstruturaSaldo[];
  busca: string;
  diasAlertaValidade: number;
  bloquearNegativo: boolean;
  podeConfigurar: boolean;
  podeMovimentar: boolean;
  onAtualizar: () => Promise<void> | void;
  onMovimentar: (dados: MovimentacaoInicial) => void;
};

type Modal = "deposito" | "lote" | "posicoes" | null;

const DEPOSITO_INICIAL = {
  id: "",
  codigo: "",
  nome: "",
  descricao: "",
  principal: false,
  permite_saldo_negativo: false,
};

const LOTE_INICIAL = {
  id: "",
  estoque_item_id: "",
  codigo: "",
  fabricado_em: "",
  validade: "",
  fabricante: "",
};

function quantidade(valor: number | string, unidade?: string) {
  const formatado = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(Number(valor));
  return unidade ? `${formatado} ${unidade}` : formatado;
}

function moeda(valor: number | string) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(valor));
}

function data(valor: string | null) {
  return valor ? new Date(`${valor}T12:00:00`).toLocaleDateString("pt-BR") : "Não informada";
}

function inicioDoDia(dataBase = new Date()) {
  return new Date(dataBase.getFullYear(), dataBase.getMonth(), dataBase.getDate()).getTime();
}

function diasAte(valor: string | null) {
  if (!valor) return null;
  return Math.ceil((new Date(`${valor}T00:00:00`).getTime() - inicioDoDia()) / 86_400_000);
}

export default function EstruturaEstoquePanel({
  modo,
  itens,
  depositos,
  localizacoes,
  lotes,
  saldos,
  busca,
  diasAlertaValidade,
  bloquearNegativo,
  podeConfigurar,
  podeMovimentar,
  onAtualizar,
  onMovimentar,
}: Props) {
  const [modal, setModal] = useState<Modal>(null);
  const [depositoForm, setDepositoForm] = useState(DEPOSITO_INICIAL);
  const [loteForm, setLoteForm] = useState(LOTE_INICIAL);
  const [filtroPosicoes, setFiltroPosicoes] = useState<{ depositoId?: string; loteId?: string; titulo: string }>({ titulo: "Posições" });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const termo = busca.trim().toLocaleLowerCase("pt-BR");
  const itensPorId = useMemo(() => new Map(itens.map((item) => [item.id, item])), [itens]);
  const depositosPorId = useMemo(() => new Map(depositos.map((deposito) => [deposito.id, deposito])), [depositos]);
  const localizacoesPorId = useMemo(() => new Map(localizacoes.map((localizacao) => [localizacao.id, localizacao])), [localizacoes]);
  const lotesPorId = useMemo(() => new Map(lotes.map((lote) => [lote.id, lote])), [lotes]);

  const depositosFiltrados = depositos.filter((deposito) =>
    [deposito.codigo, deposito.nome, deposito.descricao].filter(Boolean).some((valor) => String(valor).toLocaleLowerCase("pt-BR").includes(termo)),
  );
  const lotesFiltrados = lotes.filter((lote) => {
    const item = itensPorId.get(lote.estoque_item_id);
    return [lote.codigo, lote.fabricante, item?.nome].filter(Boolean).some((valor) => String(valor).toLocaleLowerCase("pt-BR").includes(termo));
  });
  const posicoes = saldos.filter((saldo) =>
    (!filtroPosicoes.depositoId || saldo.deposito_id === filtroPosicoes.depositoId)
    && (!filtroPosicoes.loteId || saldo.lote_id === filtroPosicoes.loteId),
  );

  const lotesVencidos = lotes.filter((lote) => (diasAte(lote.validade) ?? 1) < 0);
  const lotesProximos = lotes.filter((lote) => {
    const dias = diasAte(lote.validade);
    return dias !== null && dias >= 0 && dias <= diasAlertaValidade;
  });
  const lotesSemValidade = lotes.filter((lote) => !lote.validade);

  async function salvar(payload: Record<string, unknown>) {
    setSalvando(true);
    setErro("");
    try {
      const response = await fetch("/api/estoque", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const resultado = await response.json();
      if (!response.ok) throw new Error(resultado?.error || "Não foi possível salvar.");
      setModal(null);
      await onAtualizar();
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  function abrirNovoDeposito() {
    setDepositoForm({ ...DEPOSITO_INICIAL, principal: depositos.length === 0 });
    setErro("");
    setModal("deposito");
  }

  function abrirEditarDeposito(deposito: EstruturaDeposito) {
    setDepositoForm({
      id: deposito.id,
      codigo: deposito.codigo,
      nome: deposito.nome,
      descricao: deposito.descricao ?? "",
      principal: deposito.principal,
      permite_saldo_negativo: deposito.permite_saldo_negativo,
    });
    setErro("");
    setModal("deposito");
  }

  function abrirNovoLote() {
    const primeiroItem = itens.find((item) => item.controla_lote || item.controla_validade);
    setLoteForm({ ...LOTE_INICIAL, estoque_item_id: primeiroItem?.id ?? "" });
    setErro("");
    setModal("lote");
  }

  function abrirEditarLote(lote: EstruturaLote) {
    setLoteForm({
      id: lote.id,
      estoque_item_id: lote.estoque_item_id,
      codigo: lote.codigo,
      fabricado_em: lote.fabricado_em ?? "",
      validade: lote.validade ?? "",
      fabricante: lote.fabricante ?? "",
    });
    setErro("");
    setModal("lote");
  }

  function abrirPosicoes(titulo: string, filtro: { depositoId?: string; loteId?: string }) {
    setFiltroPosicoes({ ...filtro, titulo });
    setErro("");
    setModal("posicoes");
  }

  if (modo === "depositos") {
    return <>
      <section className={styles.panelHeader}>
        <div><strong>Unidades de armazenagem</strong><span>Organize a operação e consulte o saldo por posição.</span></div>
        {podeConfigurar ? <button className={styles.primaryButton} onClick={abrirNovoDeposito}><Plus size={18} /> Novo depósito</button> : null}
      </section>

      {depositosFiltrados.length ? <div className={styles.depositGrid}>{depositosFiltrados.map((deposito) => {
        const posicoesDeposito = saldos.filter((saldo) => saldo.deposito_id === deposito.id);
        const fisico = posicoesDeposito.reduce((total, saldo) => total + Number(saldo.saldo_fisico), 0);
        const disponivel = posicoesDeposito.reduce((total, saldo) => total + Number(saldo.saldo_fisico) - Number(saldo.saldo_reservado), 0);
        const primeiroSaldo = posicoesDeposito.find((saldo) => Number(saldo.saldo_fisico) > 0);
        return <article className={styles.depositCard} key={deposito.id}>
          <header><span className={styles.icon}><Warehouse size={22} /></span><div><div className={styles.badges}><span>{deposito.codigo}</span>{deposito.principal ? <strong>Principal</strong> : null}</div><h3>{deposito.nome}</h3><p>{deposito.descricao || "Sem descrição informada"}</p></div></header>
          <div className={styles.depositMetrics}><span><small>Saldo físico</small><strong>{quantidade(fisico)}</strong></span><span><small>Disponível</small><strong>{quantidade(disponivel)}</strong></span><span><small>Posições</small><strong>{posicoesDeposito.length}</strong></span></div>
          <div className={styles.policy}>{deposito.permite_saldo_negativo ? <AlertTriangle size={16} /> : <CircleOff size={16} />}<span>{deposito.permite_saldo_negativo ? "Saldo negativo permitido" : "Saldo negativo bloqueado"}</span></div>
          <footer>
            {podeConfigurar ? <button onClick={() => abrirEditarDeposito(deposito)}><Pencil size={16} /> Editar</button> : null}
            <button onClick={() => abrirPosicoes(`Posições de ${deposito.nome}`, { depositoId: deposito.id })}><Boxes size={16} /> Ver posições</button>
            {podeMovimentar ? <button disabled={!primeiroSaldo} onClick={() => onMovimentar({ tipo: "transferencia", itemId: primeiroSaldo?.estoque_item_id, depositoOrigemId: deposito.id, localizacaoOrigemId: primeiroSaldo?.localizacao_id ?? undefined, loteId: primeiroSaldo?.lote_id ?? undefined })}><ArrowLeftRight size={16} /> Transferir</button> : null}
          </footer>
        </article>;
      })}</div> : <div className={styles.empty}>Nenhum depósito encontrado.</div>}

      {renderModal()}
    </>;
  }

  return <>
    <section className={styles.panelHeader}>
      <div><strong>Rastreabilidade por lote</strong><span>O cadastro identifica a mercadoria; somente uma entrada altera o saldo.</span></div>
      {podeConfigurar ? <button className={styles.primaryButton} onClick={abrirNovoLote}><Plus size={18} /> Novo lote</button> : null}
    </section>

    <section className={styles.expirySummary} aria-label="Resumo de validade">
      <article><span className={styles.summaryIcon}><Boxes size={19} /></span><div><strong>{lotes.length}</strong><small>Lotes cadastrados</small></div></article>
      <article className={lotesVencidos.length ? styles.dangerSummary : ""}><span className={styles.summaryIcon}><AlertTriangle size={19} /></span><div><strong>{lotesVencidos.length}</strong><small>Vencidos</small></div></article>
      <article className={lotesProximos.length ? styles.warningSummary : ""}><span className={styles.summaryIcon}><CalendarClock size={19} /></span><div><strong>{lotesProximos.length}</strong><small>Vencem em até {diasAlertaValidade} dias</small></div></article>
      <article><span className={styles.summaryIcon}><CircleOff size={19} /></span><div><strong>{lotesSemValidade.length}</strong><small>Sem validade informada</small></div></article>
    </section>

    {lotesFiltrados.length ? <div className={styles.tableWrap}><table className={styles.table}>
      <thead><tr><th>Lote e produto</th><th>Fabricação</th><th>Validade</th><th>Posições / saldo</th><th>Situação</th><th>Ações</th></tr></thead>
      <tbody>{lotesFiltrados.map((lote) => {
        const item = itensPorId.get(lote.estoque_item_id);
        const posicoesLote = saldos.filter((saldo) => saldo.lote_id === lote.id);
        const saldoLote = posicoesLote.reduce((total, saldo) => total + Number(saldo.saldo_fisico), 0);
        const dias = diasAte(lote.validade);
        const vencido = dias !== null && dias < 0;
        const proximo = dias !== null && dias >= 0 && dias <= diasAlertaValidade;
        const situacao = lote.bloqueado ? "Bloqueado" : vencido ? "Vencido" : proximo ? `Vence em ${dias} dias` : lote.validade ? "Regular" : "Sem validade";
        return <tr key={lote.id} className={vencido ? styles.expiredRow : proximo ? styles.warningRow : ""}>
          <td><strong>{lote.codigo}</strong><small>{item?.nome || "Produto arquivado"}{lote.fabricante ? ` · ${lote.fabricante}` : ""}</small></td>
          <td>{data(lote.fabricado_em)}</td>
          <td>{data(lote.validade)}</td>
          <td><strong>{quantidade(saldoLote, item?.unidade)}</strong><small>{posicoesLote.length} posição(ões)</small></td>
          <td><span className={`${styles.statusBadge} ${vencido || lote.bloqueado ? styles.statusDanger : proximo ? styles.statusWarning : ""}`}>{situacao}</span></td>
          <td><div className={styles.actions}>
            {podeMovimentar && item ? <button title="Registrar entrada" onClick={() => onMovimentar({ tipo: "entrada", itemId: item.id, loteId: lote.id })}><ArrowDownToLine size={16} /><span>Entrada</span></button> : null}
            <button title="Ver posições" onClick={() => abrirPosicoes(`Posições do lote ${lote.codigo}`, { loteId: lote.id })}><Boxes size={16} /><span>Posições</span></button>
            {podeConfigurar ? <button title="Editar identificação" onClick={() => abrirEditarLote(lote)}><Pencil size={16} /><span>Editar</span></button> : null}
          </div></td>
        </tr>;
      })}</tbody>
    </table></div> : <div className={styles.empty}>Nenhum lote encontrado.</div>}

    {renderModal()}
  </>;

  function renderModal() {
    if (!modal) return null;
    return <div className={styles.modalOverlay} role="presentation" onMouseDown={() => !salvando && setModal(null)}>
      <section className={`${styles.modal} ${modal === "posicoes" ? styles.positionsModal : ""}`} role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <header className={styles.modalHeader}>
          <div><span>Estrutura do estoque</span><h2>{modal === "deposito" ? (depositoForm.id ? "Editar depósito" : "Novo depósito") : modal === "lote" ? (loteForm.id ? "Editar lote" : "Novo lote") : filtroPosicoes.titulo}</h2></div>
          <button aria-label="Fechar" onClick={() => setModal(null)} disabled={salvando}><X size={20} /></button>
        </header>

        {modal === "deposito" ? <div className={styles.modalBody}><div className={styles.formGrid}>
          <label><span>Código *</span><input autoFocus maxLength={30} value={depositoForm.codigo} onChange={(event) => setDepositoForm((atual) => ({ ...atual, codigo: event.target.value.toUpperCase() }))} placeholder="Ex.: LOJA" /></label>
          <label><span>Nome *</span><input maxLength={120} value={depositoForm.nome} onChange={(event) => setDepositoForm((atual) => ({ ...atual, nome: event.target.value }))} placeholder="Ex.: Loja principal" /></label>
          <label className={styles.fullField}><span>Descrição</span><textarea value={depositoForm.descricao} onChange={(event) => setDepositoForm((atual) => ({ ...atual, descricao: event.target.value }))} placeholder="Ex.: Estoque da loja da Av. Brasil" /></label>
          <label className={styles.checkField}><input type="checkbox" checked={depositoForm.principal} disabled={depositoForm.principal && Boolean(depositoForm.id)} onChange={(event) => setDepositoForm((atual) => ({ ...atual, principal: event.target.checked }))} /><span><strong>Depósito principal</strong><small>Será sugerido nas entradas e recebimentos.</small></span></label>
          <label className={styles.checkField}><input type="checkbox" checked={depositoForm.permite_saldo_negativo} disabled={bloquearNegativo} onChange={(event) => setDepositoForm((atual) => ({ ...atual, permite_saldo_negativo: event.target.checked }))} /><span><strong>Permitir saldo negativo</strong><small>{bloquearNegativo ? "Desative o bloqueio global nas configurações primeiro." : "Use somente em operações que realmente exigem esta exceção."}</small></span></label>
        </div></div> : null}

        {modal === "lote" ? <div className={styles.modalBody}><div className={styles.formGrid}>
          <label className={styles.fullField}><span>Produto *</span><select autoFocus disabled={Boolean(loteForm.id)} value={loteForm.estoque_item_id} onChange={(event) => setLoteForm((atual) => ({ ...atual, estoque_item_id: event.target.value }))}><option value="">Selecione um produto com controle de lote</option>{itens.filter((item) => item.controla_lote || item.controla_validade).map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>
          <label><span>Código do lote *</span><input maxLength={80} value={loteForm.codigo} onChange={(event) => setLoteForm((atual) => ({ ...atual, codigo: event.target.value.toUpperCase() }))} placeholder="Ex.: GOLD2608B" /></label>
          <label><span>Fabricante</span><input maxLength={120} value={loteForm.fabricante} onChange={(event) => setLoteForm((atual) => ({ ...atual, fabricante: event.target.value }))} placeholder="Ex.: Premier Pet" /></label>
          <label><span>Fabricação</span><input type="date" value={loteForm.fabricado_em} onChange={(event) => setLoteForm((atual) => ({ ...atual, fabricado_em: event.target.value }))} /></label>
          <label><span>Validade</span><input type="date" min={loteForm.fabricado_em || undefined} value={loteForm.validade} onChange={(event) => setLoteForm((atual) => ({ ...atual, validade: event.target.value }))} /></label>
        </div><div className={styles.notice}><AlertTriangle size={18} /><span>Cadastrar ou editar o lote <strong>não altera o estoque</strong>. Depois, use “Registrar entrada” ou faça o recebimento da compra/NF-e.</span></div></div> : null}

        {modal === "posicoes" ? <div className={styles.positionsBody}>{posicoes.length ? <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Produto</th><th>Depósito</th><th>Localização</th><th>Lote / série</th><th>Físico</th><th>Reservado</th><th>Disponível</th><th>Custo médio</th></tr></thead><tbody>{posicoes.map((saldo) => {
          const item = itensPorId.get(saldo.estoque_item_id);
          const lote = saldo.lote_id ? lotesPorId.get(saldo.lote_id) : null;
          return <tr key={saldo.id}><td><strong>{item?.nome || "Produto arquivado"}</strong></td><td>{depositosPorId.get(saldo.deposito_id)?.nome || "—"}</td><td>{saldo.localizacao_id ? `${localizacoesPorId.get(saldo.localizacao_id)?.codigo || "—"} · ${localizacoesPorId.get(saldo.localizacao_id)?.nome || ""}` : "Sem localização"}</td><td>{lote?.codigo || saldo.numero_serie || "—"}</td><td>{quantidade(saldo.saldo_fisico, item?.unidade)}</td><td>{quantidade(saldo.saldo_reservado, item?.unidade)}</td><td><strong>{quantidade(Number(saldo.saldo_fisico) - Number(saldo.saldo_reservado), item?.unidade)}</strong></td><td>{moeda(saldo.custo_medio)}</td></tr>;
        })}</tbody></table></div> : <div className={styles.empty}>Ainda não existe nenhuma posição para este registro.</div>}</div> : null}

        {erro ? <div className={styles.error}><AlertTriangle size={17} />{erro}</div> : null}
        {modal !== "posicoes" ? <footer className={styles.modalFooter}><button disabled={salvando} onClick={() => setModal(null)}>Cancelar</button>{modal === "deposito" ? <button className={styles.primaryButton} disabled={salvando || !depositoForm.codigo.trim() || !depositoForm.nome.trim()} onClick={() => void salvar({ acao: "salvar_deposito", ...depositoForm })}>{salvando ? "Salvando..." : "Salvar depósito"}</button> : null}{modal === "lote" ? <button className={styles.primaryButton} disabled={salvando || !loteForm.estoque_item_id || !loteForm.codigo.trim()} onClick={() => void salvar({ acao: "salvar_lote", ...loteForm })}>{salvando ? "Salvando..." : "Salvar lote"}</button> : null}</footer> : null}
      </section>
    </div>;
  }
}
