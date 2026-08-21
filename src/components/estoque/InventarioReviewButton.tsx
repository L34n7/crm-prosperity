"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, CheckCircle2, ClipboardCheck, X } from "lucide-react";
import styles from "./InventarioReviewButton.module.css";

type EstoqueItem = { id: string; nome: string; unidade: string };
type InventarioItem = {
  id: string;
  estoque_item_id: string;
  saldo_esperado: number | string;
  primeira_contagem: number | string | null;
  segunda_contagem: number | string | null;
  quantidade_aprovada: number | string | null;
  divergencia: number | string | null;
  justificativa: string | null;
};
type Inventario = {
  id: string;
  numero: number | string;
  deposito_id: string;
  descricao: string;
  itens: InventarioItem[];
};
type Revisao = { quantidade_aprovada: string; justificativa: string };

const EPSILON = 0.000001;

function numeroFinal(item: InventarioItem) {
  const valor = item.quantidade_aprovada ?? item.segunda_contagem ?? item.primeira_contagem;
  return valor === null ? null : Number(valor);
}

function quantidade(valor: number, unidade?: string) {
  const formatado = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(valor);
  return unidade ? `${formatado} ${unidade}` : formatado;
}

export default function InventarioReviewButton({
  inventario,
  itens,
  onApproved,
}: {
  inventario: Inventario;
  itens: EstoqueItem[];
  onApproved: (message: string) => Promise<void> | void;
}) {
  const [aberto, setAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [revisao, setRevisao] = useState<Record<string, Revisao>>({});

  const linhas = useMemo(() => inventario.itens.map((linha) => {
    const item = itens.find((registro) => registro.id === linha.estoque_item_id);
    const aprovado = Number(revisao[linha.id]?.quantidade_aprovada ?? numeroFinal(linha) ?? 0);
    const esperado = Number(linha.saldo_esperado);
    return { linha, item, aprovado, esperado, divergencia: aprovado - esperado };
  }), [inventario.itens, itens, revisao]);

  function abrir() {
    const inicial: Record<string, Revisao> = {};
    for (const item of inventario.itens) {
      const final = numeroFinal(item);
      inicial[item.id] = {
        quantidade_aprovada: final === null ? "" : String(final),
        justificativa: item.justificativa ?? "",
      };
    }
    setRevisao(inicial);
    setErro("");
    setAberto(true);
  }

  async function aprovar() {
    const itensRevisados = linhas.map(({ linha, aprovado, divergencia }) => ({
      item_id: linha.id,
      quantidade_aprovada: aprovado,
      justificativa: Math.abs(divergencia) > EPSILON ? revisao[linha.id]?.justificativa?.trim() ?? "" : "",
    }));
    if (itensRevisados.some((item) => !Number.isFinite(item.quantidade_aprovada) || item.quantidade_aprovada < 0)) {
      setErro("Informe uma quantidade aprovada válida em todas as linhas.");
      return;
    }
    const semJustificativa = itensRevisados.some((item, indice) => Math.abs(linhas[indice].divergencia) > EPSILON && !item.justificativa);
    if (semJustificativa) {
      setErro("Informe a justificativa de todas as linhas com divergência.");
      return;
    }

    setSalvando(true);
    setErro("");
    try {
      const response = await fetch("/api/estoque/inventarios/aprovar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inventario_id: inventario.id, itens: itensRevisados }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Não foi possível aprovar o inventário.");
      setAberto(false);
      await onApproved(data.message || "Inventário aprovado e ajuste documentado.");
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível aprovar o inventário.");
    } finally {
      setSalvando(false);
    }
  }

  return <>
    <button className={styles.trigger} onClick={abrir}><ClipboardCheck size={16} /> Aprovar e ajustar</button>
    {aberto ? <div className={styles.overlay} onMouseDown={() => !salvando && setAberto(false)}>
      <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby={`inventario-${inventario.id}`} onMouseDown={(event) => event.stopPropagation()}>
        <header className={styles.header}>
          <div><span>Revisão do inventário #{inventario.numero}</span><h2 id={`inventario-${inventario.id}`}>Conferir divergências antes do ajuste</h2><p>{inventario.descricao}</p></div>
          <button className={styles.close} disabled={salvando} aria-label="Fechar" onClick={() => setAberto(false)}><X size={20} /></button>
        </header>
        <div className={styles.body}>
          <div className={styles.head}><span>Produto</span><span>Esperado</span><span>Contado</span><span>Aprovado</span><span>Ajuste</span></div>
          {linhas.map(({ linha, item, aprovado, esperado, divergencia }) => {
            const contado = numeroFinal({ ...linha, quantidade_aprovada: null });
            const divergente = Math.abs(divergencia) > EPSILON;
            return <div className={styles.row} key={linha.id}>
              <div className={styles.product}><strong>{item?.nome || "Produto"}</strong><small>{item?.unidade || "un"}</small></div>
              <span data-label="Esperado">{quantidade(esperado, item?.unidade)}</span>
              <span data-label="Contado">{contado === null ? "—" : quantidade(contado, item?.unidade)}</span>
              <label data-label="Aprovado"><input type="number" min="0" step="0.001" value={revisao[linha.id]?.quantidade_aprovada ?? ""} onChange={(event) => setRevisao((atual) => ({ ...atual, [linha.id]: { ...atual[linha.id], quantidade_aprovada: event.target.value } }))} /></label>
              <div className={styles.adjustment} data-label="Ajuste">
                {!divergente ? <span className={styles.equal}><CheckCircle2 size={15} /> Sem ajuste</span> : divergencia > 0 ? <span className={styles.entry}><ArrowDownToLine size={15} /> Entrada {quantidade(divergencia, item?.unidade)}</span> : <span className={styles.exit}><ArrowUpFromLine size={15} /> Saída {quantidade(Math.abs(divergencia), item?.unidade)}</span>}
              </div>
              {divergente ? <label className={styles.reason}><span>Justificativa *</span><textarea required value={revisao[linha.id]?.justificativa ?? ""} onChange={(event) => setRevisao((atual) => ({ ...atual, [linha.id]: { ...atual[linha.id], justificativa: event.target.value } }))} placeholder="Informe o motivo da divergência" /></label> : null}
            </div>;
          })}
          {erro ? <div className={styles.error}><AlertTriangle size={17} /> {erro}</div> : null}
        </div>
        <footer className={styles.footer}><button disabled={salvando} onClick={() => setAberto(false)}>Cancelar</button><button className={styles.confirm} disabled={salvando} onClick={() => void aprovar()}>{salvando ? "Aprovando..." : "Confirmar e ajustar estoque"}</button></footer>
      </section>
    </div> : null}
  </>;
}
