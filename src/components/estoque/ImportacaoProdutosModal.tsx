"use client";

import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  RefreshCw,
  Upload,
  X,
} from "lucide-react";
import styles from "./ImportacaoProdutosModal.module.css";

type LinhaPreview = {
  linha: number;
  codigo: string | null;
  nome: string;
  tipo: string | null;
  unidade: string | null;
  saldo_inicial: number;
  acao: "criar" | "atualizar" | "erro";
  deposito_nome: string | null;
  localizacao_nome: string | null;
  erros: string[];
  alertas: string[];
  [campo: string]: unknown;
};

type Preview = {
  arquivo: string;
  linhas: LinhaPreview[];
  resumo: {
    total: number;
    novos: number;
    atualizacoes: number;
    erros: number;
    alertas: number;
  };
};

type Props = {
  onClose: () => void;
  onImported: (message: string) => void | Promise<void>;
};

function quantidade(valor: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(valor);
}

export default function ImportacaoProdutosModal({ onClose, onImported }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [atualizarExistentes, setAtualizarExistentes] = useState(true);
  const [processando, setProcessando] = useState(false);
  const [baixando, setBaixando] = useState(false);
  const [erro, setErro] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState("");

  const linhasExibidas = useMemo(() => {
    if (!preview) return [];
    return [...preview.linhas]
      .sort((a, b) => Number(b.acao === "erro") - Number(a.acao === "erro") || a.linha - b.linha)
      .slice(0, 200);
  }, [preview]);

  async function baixarModelo() {
    setBaixando(true);
    setErro("");
    try {
      const response = await fetch("/api/estoque/importar/modelo");
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.error || "Não foi possível baixar o modelo.");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = "modelo-importacao-produtos.xlsx";
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível baixar o modelo.");
    } finally {
      setBaixando(false);
    }
  }

  async function gerarPreview(file: File) {
    setProcessando(true);
    setErro("");
    setPreview(null);
    setArquivo(file);
    setIdempotencyKey(crypto.randomUUID());
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/estoque/importar/preview", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Não foi possível validar a planilha.");
      setPreview({ arquivo: data.arquivo, linhas: data.linhas, resumo: data.resumo });
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível validar a planilha.");
    } finally {
      setProcessando(false);
    }
  }

  async function importar() {
    if (!preview || preview.resumo.erros > 0 || !idempotencyKey) return;
    setProcessando(true);
    setErro("");
    try {
      const response = await fetch("/api/estoque/importar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          arquivo: preview.arquivo,
          linhas: preview.linhas,
          atualizar_existentes: atualizarExistentes,
          idempotency_key: idempotencyKey,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Não foi possível importar os produtos.");
      await onImported(data.message || "Produtos importados com sucesso.");
      onClose();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível importar os produtos.");
    } finally {
      setProcessando(false);
    }
  }

  return (
    <div className={styles.overlay} role="presentation" onMouseDown={() => !processando && onClose()}>
      <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="importacao-produtos-titulo" onMouseDown={(event) => event.stopPropagation()}>
        <header className={styles.header}>
          <div className={styles.titleIcon}><FileSpreadsheet size={22} /></div>
          <div>
            <span>Cadastro em lote</span>
            <h2 id="importacao-produtos-titulo">Importar produtos</h2>
            <p>Cadastre ou atualize produtos com validação antes de gravar.</p>
          </div>
          <button className={styles.iconButton} aria-label="Fechar" disabled={processando} onClick={onClose}><X size={19} /></button>
        </header>

        <div className={styles.body}>
          <div className={styles.steps}>
            <div className={styles.step}><strong>1</strong><span><b>Baixe o modelo</b><small>Use as colunas e formatos indicados.</small></span></div>
            <div className={styles.step}><strong>2</strong><span><b>Envie a planilha</b><small>CSV, XLS ou XLSX com até 5 MB.</small></span></div>
            <div className={styles.step}><strong>3</strong><span><b>Revise e confirme</b><small>Nada é gravado antes da confirmação.</small></span></div>
          </div>

          <div className={styles.actions}>
            <button className={styles.secondaryButton} disabled={baixando || processando} onClick={() => void baixarModelo()}>
              <Download size={17} /> {baixando ? "Preparando..." : "Baixar modelo Excel"}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.xls,.xlsx"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void gerarPreview(file);
                event.target.value = "";
              }}
            />
            <button className={styles.primaryButton} disabled={processando} onClick={() => inputRef.current?.click()}>
              {processando && !preview ? <RefreshCw className={styles.spin} size={17} /> : <Upload size={17} />}
              {arquivo ? "Trocar planilha" : "Selecionar planilha"}
            </button>
          </div>

          {arquivo ? <div className={styles.fileLine}><FileSpreadsheet size={18} /><span><strong>{arquivo.name}</strong><small>{(arquivo.size / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} KB</small></span></div> : null}

          {erro ? <div className={styles.error}><AlertTriangle size={18} /><span>{erro}</span></div> : null}

          {preview ? (
            <>
              <div className={styles.summary}>
                <div><span>Total</span><strong>{preview.resumo.total}</strong></div>
                <div className={styles.successMetric}><span>Novos</span><strong>{preview.resumo.novos}</strong></div>
                <div><span>Atualizações</span><strong>{preview.resumo.atualizacoes}</strong></div>
                <div className={preview.resumo.erros ? styles.errorMetric : ""}><span>Com erro</span><strong>{preview.resumo.erros}</strong></div>
              </div>

              <label className={styles.updateOption}>
                <input type="checkbox" checked={atualizarExistentes} onChange={(event) => setAtualizarExistentes(event.target.checked)} />
                <span><strong>Atualizar produtos encontrados</strong><small>Correspondência por código, SKU ou código de barras. Campos vazios preservam os dados atuais; o custo existente continua calculado pelas entradas.</small></span>
              </label>

              {preview.resumo.erros ? (
                <div className={styles.warning}><AlertTriangle size={18} /><span>Corrija as linhas indicadas na planilha e envie o arquivo novamente. A importação inteira fica bloqueada enquanto houver erros.</span></div>
              ) : (
                <div className={styles.ready}><CheckCircle2 size={18} /><span>Planilha validada. Os saldos iniciais dos produtos novos serão registrados por documento no depósito indicado.</span></div>
              )}

              <div className={styles.tableWrap}>
                <table>
                  <thead><tr><th>Linha</th><th>Ação</th><th>Produto</th><th>Tipo</th><th>Saldo inicial</th><th>Destino</th><th>Validação</th></tr></thead>
                  <tbody>
                    {linhasExibidas.map((linha) => (
                      <tr key={linha.linha}>
                        <td>{linha.linha}</td>
                        <td><span className={`${styles.badge} ${styles[`badge_${linha.acao}`]}`}>{linha.acao === "criar" ? "Novo" : linha.acao === "atualizar" ? (atualizarExistentes ? "Atualizar" : "Ignorar") : "Erro"}</span></td>
                        <td><strong>{linha.nome}</strong><small>{linha.codigo || "Sem código"}</small></td>
                        <td>{linha.tipo || "produto"} · {linha.unidade || "un"}</td>
                        <td>{linha.acao === "atualizar" ? "—" : quantidade(linha.saldo_inicial)}</td>
                        <td>{linha.deposito_nome ? <><strong>{linha.deposito_nome}</strong><small>{linha.localizacao_nome || "Sem localização"}</small></> : "—"}</td>
                        <td>{linha.erros.length ? <span className={styles.validationError}>{linha.erros.join(" ")}</span> : linha.alertas.length ? <span className={styles.validationWarning}>{linha.alertas.join(" ")}</span> : <span className={styles.validationOk}>Pronto</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.linhas.length > linhasExibidas.length ? <p className={styles.tableNote}>Exibindo 200 de {preview.linhas.length} linhas. Todas serão processadas na confirmação.</p> : null}
            </>
          ) : null}
        </div>

        <footer className={styles.footer}>
          <button className={styles.secondaryButton} disabled={processando} onClick={onClose}>Cancelar</button>
          <button className={styles.primaryButton} disabled={!preview || preview.resumo.erros > 0 || processando} onClick={() => void importar()}>
            {processando && preview ? <RefreshCw className={styles.spin} size={17} /> : <Upload size={17} />}
            {processando && preview ? "Importando..." : "Confirmar importação"}
          </button>
        </footer>
      </section>
    </div>
  );
}
