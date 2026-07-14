"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  isAmbienteConfigurado,
  type IntegracaoWhatsappAmbiente,
} from "@/lib/whatsapp/ambiente-configurado";
import styles from "./AmbienteObrigatorioGuard.module.css";

type ApiResponse = {
  ok: boolean;
  configurado?: boolean;
  possui_integracao_configurada?: boolean;
  integracao?: IntegracaoWhatsappAmbiente | null;
  error?: string;
};

const AMBIENTE_CONFIGURADO_STORAGE_KEY = "crm_ambiente_configurado";

function ambienteConfiguradoEmCache() {
  return (
    typeof window !== "undefined" &&
    window.sessionStorage.getItem(AMBIENTE_CONFIGURADO_STORAGE_KEY) === "true"
  );
}

function salvarAmbienteConfiguradoEmCache(configurado: boolean) {
  if (typeof window === "undefined") return;

  if (configurado) {
    window.sessionStorage.setItem(AMBIENTE_CONFIGURADO_STORAGE_KEY, "true");
    return;
  }

  window.sessionStorage.removeItem(AMBIENTE_CONFIGURADO_STORAGE_KEY);
}

export default function AmbienteObrigatorioGuard() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [carregando, setCarregando] = useState(true);
  const [recarregando, setRecarregando] = useState(false);
  const [integracao, setIntegracao] =
    useState<IntegracaoWhatsappAmbiente | null>(null);

  const estaNaPaginaConfiguracao = pathname === "/configurar-ambiente";
  const fluxoNovoNumero =
    searchParams.get("fluxo") === "novo-numero" ||
    Boolean(searchParams.get("integracao_id"));
  const [ambienteConfiguradoLocal, setAmbienteConfiguradoLocal] = useState(false);

  const ambienteConfigurado = useMemo(() => {
    return ambienteConfiguradoLocal || isAmbienteConfigurado(integracao);
  }, [ambienteConfiguradoLocal, integracao]);

  const verificarAmbiente = useCallback(
    async (modoManual = false, silencioso = false) => {
      try {
        if (modoManual) {
          setRecarregando(true);
        } else if (!silencioso) {
          setCarregando(true);
        }

        const response = await fetch("/api/integracoes-whatsapp/status", {
          method: "GET",
          cache: "no-store",
        });

        const data = (await response.json()) as ApiResponse;

        if (!response.ok || !data.ok) {
          setIntegracao(null);
          return false;
        }

        const proximaIntegracao = data.integracao || null;
        setIntegracao(proximaIntegracao);

        const proximoConfigurado =
          data.possui_integracao_configurada === true ||
          data.configurado === true ||
          isAmbienteConfigurado(proximaIntegracao);

        salvarAmbienteConfiguradoEmCache(proximoConfigurado);
        setAmbienteConfiguradoLocal(proximoConfigurado);
        return proximoConfigurado;
      } catch (error) {
        console.warn("[AMBIENTE GUARD] Erro ao verificar ambiente:", error);
        return false;
      } finally {
        setCarregando(false);
        setRecarregando(false);
      }
    },
    []
  );

  useEffect(() => {
    if (ambienteConfiguradoEmCache()) {
      setAmbienteConfiguradoLocal(true);
      setCarregando(false);
    }

    function marcarComoConfigurado() {
      salvarAmbienteConfiguradoEmCache(true);
      setAmbienteConfiguradoLocal(true);
    }

    window.addEventListener("crm_ambiente_configurado", marcarComoConfigurado);

    return () => {
      window.removeEventListener("crm_ambiente_configurado", marcarComoConfigurado);
    };
  }, []);

  useEffect(() => {
    if (estaNaPaginaConfiguracao) {
      if (fluxoNovoNumero) {
        setCarregando(false);
        return;
      }

      void verificarAmbiente(false, true).then((configurado) => {
        if (configurado) {
          router.replace("/configuracoes/whatsapp/perfil");
        }
      });
      return;
    }

    const ambienteJaConfirmado =
      ambienteConfiguradoLocal || ambienteConfiguradoEmCache();

    if (ambienteJaConfirmado) {
      setAmbienteConfiguradoLocal(true);
      setCarregando(false);
      return;
    }

    void verificarAmbiente(false);
  }, [
    ambienteConfiguradoLocal,
    estaNaPaginaConfiguracao,
    fluxoNovoNumero,
    router,
    verificarAmbiente,
  ]);

  useEffect(() => {
    if (carregando) return;
    if (ambienteConfigurado) return;
    if (estaNaPaginaConfiguracao) return;

    const jaRedirecionouAposLogin = window.sessionStorage.getItem(
      "crm_ambiente_redirect_apos_login"
    );

    if (jaRedirecionouAposLogin) return;

    window.sessionStorage.setItem("crm_ambiente_redirect_apos_login", "true");
    router.replace("/configurar-ambiente");
  }, [carregando, ambienteConfigurado, estaNaPaginaConfiguracao, router]);

  if (carregando) return null;
  if (ambienteConfigurado) return null;
  if (estaNaPaginaConfiguracao) return null;

  return (
    <aside className={styles.popup} aria-label="Configuração do ambiente">
      <div className={styles.icon}>!</div>

      <div className={styles.content}>
        <div className={styles.topRow}>
          <strong>Ambiente pendente</strong>

          <button
            type="button"
            className={styles.refreshButton}
            onClick={() => void verificarAmbiente(true)}
            disabled={recarregando}
            title="Atualizar status"
          >
            {recarregando ? "..." : "↻"}
          </button>
        </div>

        <p>
          Configure o ambiente oficial do WhatsApp para liberar a operação
          completa do CRM.
        </p>

        <button
          type="button"
          className={styles.primaryButton}
          onClick={() => router.push("/configurar-ambiente")}
        >
          Configurar agora
        </button>
      </div>
    </aside>
  );
}
