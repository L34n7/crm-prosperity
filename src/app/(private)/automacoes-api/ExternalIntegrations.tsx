"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Archive,
  CheckCircle2,
  Database,
  Loader2,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import styles from "./automacoes-api.module.css";
import type { IntegracaoApi } from "./automation-catalog";

type Props = {
  podeGerenciar: boolean;
  onFeedback: (mensagem: string) => void;
  onError: (mensagem: string) => void;
};

function statusLabel(status: string) {
  if (status === "ativa") return "Conectada";
  if (status === "erro") return "Com erro";
  if (status === "inativa") return "Arquivada";
  return "Não testada";
}

export default function ExternalIntegrations({ podeGerenciar, onFeedback, onError }: Props) {
  const [integracoes, setIntegracoes] = useState<IntegracaoApi[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [codigoEmpresa, setCodigoEmpresa] = useState("");
  const [token, setToken] = useState("");
  const [testando, setTestando] = useState(false);
  const [conexaoTestada, setConexaoTestada] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const response = await fetch("/api/automacoes-api", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Não foi possível carregar as conexões.");
      setIntegracoes(data.integracoes || []);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Erro ao carregar conexões.");
    } finally {
      setCarregando(false);
    }
  }, [onError]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function abrirNova() {
    setNome("");
    setBaseUrl("");
    setCodigoEmpresa("");
    setToken("");
    setConexaoTestada(false);
    onError("");
    setModalAberto(true);
  }

  async function testarConexao() {
    if (!baseUrl.trim()) return;
    setTestando(true);
    setConexaoTestada(false);
    onError("");
    try {
      const response = await fetch("/api/automacoes-api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "testar_conexao", base_url: baseUrl, token }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Falha ao testar conexão.");
      setConexaoTestada(true);
      onFeedback("Servidor externo alcançado com sucesso.");
    } catch (error) {
      onError(error instanceof Error ? error.message : "Erro ao testar conexão.");
    } finally {
      setTestando(false);
    }
  }

  async function salvar() {
    setSalvando(true);
    onError("");
    try {
      const response = await fetch("/api/automacoes-api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acao: "criar_integracao",
          nome,
          base_url: baseUrl,
          codigo_empresa: codigoEmpresa,
          token,
          conexao_testada: conexaoTestada,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Não foi possível salvar a conexão.");
      setModalAberto(false);
      await carregar();
      onFeedback("Conexão cadastrada com sucesso.");
    } catch (error) {
      onError(error instanceof Error ? error.message : "Erro ao salvar conexão.");
    } finally {
      setSalvando(false);
    }
  }

  async function alterarStatus(integracao: IntegracaoApi, status: "inativa" | "nao_testada") {
    setSalvando(true);
    onError("");
    try {
      const response = await fetch("/api/automacoes-api", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entidade: "integracao", id: integracao.id, status }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Não foi possível atualizar a conexão.");
      await carregar();
      onFeedback(status === "inativa" ? "Conexão arquivada." : "Conexão reaberta para novo teste.");
    } catch (error) {
      onError(error instanceof Error ? error.message : "Erro ao atualizar conexão.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(integracao: IntegracaoApi) {
    if (!window.confirm(`Excluir permanentemente a conexão “${integracao.nome}”?`)) return;
    setSalvando(true);
    onError("");
    try {
      const response = await fetch("/api/automacoes-api", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: integracao.id }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Não foi possível excluir a conexão.");
      await carregar();
      onFeedback("Conexão excluída permanentemente.");
    } catch (error) {
      onError(error instanceof Error ? error.message : "Erro ao excluir conexão.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
      <div className={styles.sectionHeader} style={{ marginTop: 20 }}>
        <div><span className={styles.sectionLabel}>CONEXÕES</span><h2>Integrações externas</h2><p>Conecte APIs reais e use-as como origem ou ação dentro das automações.</p></div>
        <button className={styles.primaryButton} onClick={abrirNova} disabled={!podeGerenciar}><Plus size={17} /> Nova conexão</button>
      </div>
      {carregando ? <div style={{ padding: 40, textAlign: "center" }}><Loader2 className={styles.spinning} /> Carregando conexões...</div> : null}
      <div className={styles.catalogGrid}>
        {integracoes.map((integracao) => (
          <article className={styles.queryCard} key={integracao.id}>
            <div className={styles.queryTop}><div className={styles.queryIcon}><Database size={20} /></div><span>{integracao.tipo || "API REST"}</span></div>
            <h3>{integracao.nome}</h3>
            <p>{integracao.base_url || "Conexão externa cadastrada"}</p>
            <div className={styles.fieldPreview}><span>{statusLabel(integracao.status)}</span>{integracao.codigo_empresa ? <span>empresa: {integracao.codigo_empresa}</span> : null}</div>
            <div className={styles.routineActions}>
              {integracao.status === "inativa" ? <button title="Reabrir" onClick={() => void alterarStatus(integracao, "nao_testada")} disabled={!podeGerenciar || salvando}><RotateCcw size={16} /></button> : <button title="Arquivar" onClick={() => void alterarStatus(integracao, "inativa")} disabled={!podeGerenciar || salvando}><Archive size={16} /></button>}
              <button title="Excluir permanentemente" onClick={() => void excluir(integracao)} disabled={!podeGerenciar || salvando}><Trash2 size={16} /></button>
            </div>
          </article>
        ))}
        {!carregando && !integracoes.length ? <div style={{ padding: 28, color: "var(--crm-text-muted)" }}><Database size={30} /><h3>Nenhuma conexão cadastrada</h3><p>Adicione uma API externa quando uma automação precisar consultar outro sistema.</p></div> : null}
      </div>

      {modalAberto ? (
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModalAberto(false); }}>
          <section className={`${styles.modal} ${styles.integrationModal}`} role="dialog" aria-modal="true" aria-label="Nova integração externa">
            <header className={styles.modalHeader}><div><span className={styles.modalBadge}><Database size={14} /> Nova conexão</span><h2>Conectar sistema externo</h2><p>Cadastre uma API REST para usar como origem ou ação das automações.</p></div><button className={styles.closeButton} onClick={() => setModalAberto(false)} aria-label="Fechar"><X size={20} /></button></header>
            <div className={styles.modalBody}><div className={styles.integrationContent}>
              <div className={styles.integrationFormGrid}>
                <label className={styles.formField}><span>Nome da conexão *</span><input value={nome} onChange={(event) => setNome(event.target.value)} placeholder="Ex.: ERP principal" /></label>
                <label className={styles.formField}><span>Código da empresa</span><input value={codigoEmpresa} onChange={(event) => setCodigoEmpresa(event.target.value)} placeholder="Ex.: 001" /></label>
                <label className={`${styles.formField} ${styles.formFieldWide}`}><span>URL base HTTPS *</span><input value={baseUrl} onChange={(event) => { setBaseUrl(event.target.value); setConexaoTestada(false); }} placeholder="https://api.sistema.com.br/v1" /></label>
                <label className={`${styles.formField} ${styles.formFieldWide}`}><span>Token de acesso</span><input type="password" value={token} onChange={(event) => { setToken(event.target.value); setConexaoTestada(false); }} placeholder="Token fornecido pelo sistema" /></label>
              </div>
              {conexaoTestada ? <div className={styles.connectionSuccess}><CheckCircle2 size={18} /><div><b>Servidor alcançado</b><small>A conexão respondeu ao teste.</small></div></div> : null}
              <div className={styles.connectorFormActions}>
                <button className={styles.ghostButton} onClick={() => void testarConexao()} disabled={!baseUrl.trim() || testando}>{testando ? <Loader2 size={17} className={styles.spinning} /> : <Database size={17} />} Testar conexão</button>
                <button className={styles.primaryButton} onClick={() => void salvar()} disabled={!nome.trim() || !baseUrl.trim() || salvando}>{salvando ? <Loader2 size={17} className={styles.spinning} /> : <CheckCircle2 size={17} />} Salvar conexão</button>
              </div>
            </div></div>
          </section>
        </div>
      ) : null}
    </>
  );
}
