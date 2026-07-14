"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, KeyRound, Power, RefreshCw } from "lucide-react";
import styles from "./configuracoes.module.css";

type IntegracaoWebhook = {
  id: string;
  nome: string;
  canal_codigo: string;
  status: "ativo" | "inativo";
  token_hint: string;
  ultimo_evento_em: string | null;
  webhook_url: string;
};

type CredencialWebhook = { integracaoId: string; secret: string };

type Props = {
  ativo: boolean;
  onError: (mensagem: string) => void;
  onSuccess: (mensagem: string) => void;
};

function formatarData(valor?: string | null) {
  if (!valor) return "Nenhum evento recebido";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "Nenhum evento recebido";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(data);
}

export default function IntegracaoEntradaImoveis({ ativo, onError, onSuccess }: Props) {
  const [integracoes, setIntegracoes] = useState<IntegracaoWebhook[]>([]);
  const [nomeParceiro, setNomeParceiro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [processando, setProcessando] = useState("");
  const [credencial, setCredencial] = useState<CredencialWebhook | null>(null);

  const carregar = useCallback(async () => {
    if (!ativo) return;
    setCarregando(true);
    try {
      const response = await fetch("/api/imoveis/integracoes-webhook", {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Erro ao carregar integrações de entrada.");
      }
      setIntegracoes(data.integracoes ?? []);
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : "Erro ao carregar integrações de entrada."
      );
    } finally {
      setCarregando(false);
    }
  }, [ativo, onError]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function copiar(valor: string, nome: string) {
    try {
      await navigator.clipboard.writeText(valor);
      onSuccess(`${nome} copiado.`);
    } catch {
      onError(`Não foi possível copiar ${nome.toLowerCase()}.`);
    }
  }

  async function configurar(integracao?: IntegracaoWebhook) {
    const nome = nomeParceiro.trim();
    if (!integracao && nome.length < 2) {
      onError("Informe o nome da empresa ou sistema de origem.");
      return;
    }

    if (
      integracao &&
      !window.confirm(
        `Gerar um novo segredo para “${integracao.nome}”? O segredo atual deixará de funcionar.`
      )
    ) {
      return;
    }

    setProcessando(integracao?.id ?? "novo");
    setCredencial(null);
    try {
      const response = await fetch("/api/imoveis/integracoes-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          integracao_id: integracao?.id,
          nome: integracao?.nome ?? nome,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Erro ao configurar webhook.");

      setCredencial({ integracaoId: data.integracao.id, secret: data.secret });
      setNomeParceiro("");
      onSuccess(
        integracao
          ? "Novo segredo gerado. Copie antes de sair da página."
          : "Integração criada. Copie a URL e o segredo."
      );
      await carregar();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Erro ao configurar webhook.");
    } finally {
      setProcessando("");
    }
  }

  async function desativar(integracao: IntegracaoWebhook) {
    if (!window.confirm(`Desativar a integração “${integracao.nome}”?`)) return;
    setProcessando(integracao.id);
    try {
      const response = await fetch("/api/imoveis/integracoes-webhook", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ integracao_id: integracao.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Erro ao desativar integração.");
      if (credencial?.integracaoId === integracao.id) setCredencial(null);
      onSuccess(data.message || "Integração desativada.");
      await carregar();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Erro ao desativar integração.");
    } finally {
      setProcessando("");
    }
  }

  if (!ativo) return null;

  return (
    <section id="integracao-imobiliaria" className={styles.configCard}>
      <div className={styles.sectionHeader}>
        <div>
          <span className={styles.eyebrow}>Integração de entrada</span>
          <h2>API e webhook imobiliário</h2>
          <p>
            Receba imóveis de parceiros e sistemas externos. Os registros recebidos
            entram no catálogo global e não são adicionados automaticamente à carteira.
          </p>
        </div>
        <span className={styles.integrationIcon}><KeyRound size={22} /></span>
      </div>

      <div className={styles.integrationCreate}>
        <label className={styles.integrationField}>
          <span>Empresa ou sistema de origem</span>
          <input
            value={nomeParceiro}
            onChange={(event) => setNomeParceiro(event.target.value)}
            placeholder="Ex.: Site institucional, parceiro ou ERP"
          />
        </label>
        <button
          type="button"
          className={styles.primaryButton}
          disabled={processando === "novo"}
          onClick={() => void configurar()}
        >
          {processando === "novo" ? "Criando..." : "Criar integração API"}
        </button>
      </div>

      {carregando ? (
        <div className={styles.loadingCard}>Carregando integrações...</div>
      ) : integracoes.length === 0 ? (
        <div className={styles.integrationEmpty}>
          Nenhuma integração de entrada foi criada para esta empresa.
        </div>
      ) : (
        <div className={styles.integrationList}>
          {integracoes.map((integracao) => (
            <article key={integracao.id} className={styles.integrationItem}>
              <div className={styles.integrationTitle}>
                <div>
                  <strong>{integracao.nome}</strong>
                  <small>Último evento: {formatarData(integracao.ultimo_evento_em)}</small>
                </div>
                <span
                  className={`${styles.integrationStatus} ${
                    integracao.status === "ativo"
                      ? styles.integrationStatusActive
                      : styles.integrationStatusInactive
                  }`}
                >
                  {integracao.status === "ativo" ? "Ativo" : "Inativo"}
                </span>
              </div>

              <label className={styles.integrationField}>
                <span>URL do webhook</span>
                <div className={styles.copyField}>
                  <input readOnly value={integracao.webhook_url} />
                  <button
                    type="button"
                    className={styles.copyButton}
                    onClick={() => void copiar(integracao.webhook_url, "URL do webhook")}
                    aria-label="Copiar URL"
                  >
                    <Copy size={17} />
                  </button>
                </div>
              </label>

              {credencial?.integracaoId === integracao.id ? (
                <label className={styles.integrationField}>
                  <span>Segredo — exibido somente agora</span>
                  <div className={styles.copyField}>
                    <input readOnly value={credencial.secret} />
                    <button
                      type="button"
                      className={styles.copyButton}
                      onClick={() => void copiar(credencial.secret, "Segredo")}
                      aria-label="Copiar segredo"
                    >
                      <Copy size={17} />
                    </button>
                  </div>
                </label>
              ) : null}

              <div className={styles.integrationFooter}>
                <small>Identificação do token: {integracao.token_hint}</small>
                <div className={styles.integrationActions}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    disabled={processando === integracao.id}
                    onClick={() => void configurar(integracao)}
                  >
                    <RefreshCw size={16} /> Regenerar segredo
                  </button>
                  {integracao.status === "ativo" ? (
                    <button
                      type="button"
                      className={styles.dangerButton}
                      disabled={processando === integracao.id}
                      onClick={() => void desativar(integracao)}
                    >
                      <Power size={16} /> Desativar
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
