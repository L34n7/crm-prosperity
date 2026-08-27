"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CircleAlert,
  Link2,
  RefreshCw,
  Unplug,
  WalletCards,
} from "lucide-react";
import styles from "./configuracoes.module.css";
import mpStyles from "./mercado-pago.module.css";

type MercadoPagoIntegracao = {
  id: string;
  mercado_pago_user_id: string;
  status: "ativa" | "erro" | "revogada";
  live_mode: boolean;
  expires_at: string;
  conectado_em: string;
  ultimo_refresh_em: string | null;
  ultimo_erro: string | null;
};

type MercadoPagoStatus = {
  configurado_servidor: boolean;
  conectado: boolean;
  integracao: MercadoPagoIntegracao | null;
};

type Props = {
  onError: (mensagem: string) => void;
  onSuccess: (mensagem: string) => void;
};

function formatarData(valor?: string | null) {
  if (!valor) return "—";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "—";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(data);
}

export default function IntegracaoMercadoPago({ onError, onSuccess }: Props) {
  const [estado, setEstado] = useState<MercadoPagoStatus | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [processando, setProcessando] = useState(false);
  const [confirmandoDesconexao, setConfirmandoDesconexao] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const response = await fetch("/api/integracoes/mercado-pago", {
        cache: "no-store",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Erro ao consultar o Mercado Pago.");
      }

      setEstado({
        configurado_servidor: Boolean(data.configurado_servidor),
        conectado: Boolean(data.conectado),
        integracao: data.integracao ?? null,
      });
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : "Erro ao consultar a integração com Mercado Pago."
      );
    } finally {
      setCarregando(false);
    }
  }, [onError]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function conectar() {
    onError("");
    onSuccess("");
    window.location.assign("/api/integracoes/mercado-pago/conectar");
  }

  async function desconectar() {
    try {
      setProcessando(true);
      onError("");
      onSuccess("");

      const response = await fetch("/api/integracoes/mercado-pago", {
        method: "DELETE",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Erro ao desconectar o Mercado Pago.");
      }

      setConfirmandoDesconexao(false);
      onSuccess(data.message || "Mercado Pago desconectado com sucesso.");
      await carregar();
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : "Erro ao desconectar o Mercado Pago."
      );
    } finally {
      setProcessando(false);
    }
  }

  const conectado = Boolean(estado?.conectado && estado.integracao);
  const configurado = Boolean(estado?.configurado_servidor);

  return (
    <section id="integracao-mercado-pago" className={styles.configCard}>
      <div className={styles.sectionHeader}>
        <div>
          <span className={styles.eyebrow}>Pagamentos</span>
          <h2>Mercado Pago</h2>
          <p>
            Conecte a conta da empresa para gerar cobranças e receber pagamentos
            pelo Checkout Pro diretamente nos fluxos do CRM.
          </p>
        </div>
        <span className={styles.integrationIcon}>
          <WalletCards size={22} />
        </span>
      </div>

      <article className={styles.integrationItem}>
        <div className={styles.integrationTitle}>
          <div>
            <strong>Conta Mercado Pago</strong>
            <small>
              {carregando
                ? "Verificando conexão..."
                : conectado
                  ? `Conectada em ${formatarData(estado?.integracao?.conectado_em)}`
                  : configurado
                    ? "Nenhuma conta foi vinculada a esta empresa."
                    : "A integração ainda precisa das credenciais no servidor."}
            </small>
          </div>
          <span
            className={`${styles.integrationStatus} ${
              conectado
                ? styles.integrationStatusActive
                : styles.integrationStatusInactive
            }`}
          >
            {carregando
              ? "Verificando"
              : conectado
                ? "Conectado"
                : configurado
                  ? "Não conectado"
                  : "Configuração pendente"}
          </span>
        </div>

        {conectado && estado?.integracao ? (
          <div className={mpStyles.details}>
            <span>
              <strong>Conta Mercado Pago</strong>
              <small>ID {estado.integracao.mercado_pago_user_id}</small>
            </span>
            <span>
              <strong>Ambiente</strong>
              <small>{estado.integracao.live_mode ? "Produção" : "Teste"}</small>
            </span>
            <span>
              <strong>Acesso</strong>
              <small>Renovável via OAuth</small>
            </span>
          </div>
        ) : null}

        <div className={mpStyles.warning}>
          <CircleAlert size={18} />
          <div>
            <strong>Tarifas sobre os recebimentos</strong>
            <p>
              O Mercado Pago pode descontar tarifas do valor recebido pela empresa,
              conforme o meio de pagamento e as condições da própria conta. O valor
              do checkout é cobrado do cliente sem acréscimo automático da Prosperity.
              Se quiser considerar esse custo no preço de venda, ajuste o preço do
              produto em Estoque → Preços e promoções. Nos fluxos de venda pelo
              WhatsApp, o checkout usa o preço do canal WhatsApp.
            </p>
          </div>
        </div>

        {!configurado && !carregando ? (
          <div className={mpStyles.warning}>
            <CircleAlert size={18} />
            <div>
              <strong>Configuração do servidor pendente</strong>
              <p>
                Cadastre MERCADOPAGO_CLIENT_ID, MERCADOPAGO_CLIENT_SECRET e
                MERCADOPAGO_REDIRECT_URI na Vercel antes de conectar uma conta.
              </p>
            </div>
          </div>
        ) : null}

        {confirmandoDesconexao ? (
          <div className={mpStyles.warning}>
            <CircleAlert size={18} />
            <div>
              <strong>Desconectar esta conta?</strong>
              <p>
                As credenciais armazenadas no CRM serão removidas e novas cobranças
                não poderão ser criadas até uma conta ser conectada novamente.
              </p>
            </div>
          </div>
        ) : null}

        <div className={styles.integrationFooter}>
          <small>
            A autorização é feita pelo OAuth do Mercado Pago. O CRM não solicita
            senha nem expõe o Access Token no navegador.
          </small>
          <div className={styles.integrationActions}>
            {confirmandoDesconexao ? (
              <>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={processando}
                  onClick={() => setConfirmandoDesconexao(false)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className={styles.dangerButton}
                  disabled={processando}
                  onClick={() => void desconectar()}
                >
                  <Unplug size={16} />
                  {processando ? "Desconectando..." : "Confirmar desconexão"}
                </button>
              </>
            ) : conectado ? (
              <>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={processando || !configurado}
                  onClick={conectar}
                >
                  <RefreshCw size={16} /> Reconectar
                </button>
                <button
                  type="button"
                  className={styles.dangerButton}
                  disabled={processando}
                  onClick={() => setConfirmandoDesconexao(true)}
                >
                  <Unplug size={16} /> Desconectar
                </button>
              </>
            ) : (
              <button
                type="button"
                className={styles.primaryButton}
                disabled={carregando || !configurado}
                onClick={conectar}
              >
                <Link2 size={16} /> Conectar Mercado Pago
              </button>
            )}
          </div>
        </div>
      </article>
    </section>
  );
}
