"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import styles from "./WhatsAppDisparoProgressCard.module.css";

type CampanhaProgresso = {
  id: string;
  status: string | null;
  template_nome?: string | null;
  total: number;
  enviados: number;
  falhas: number;
  cancelados: number;
  pendentes: number;
  processando: number;
  processados: number;
  motivo?: string | null;
};

type ProgressoResponse = {
  ok: boolean;
  usuario_id?: string | null;
  empresa_id?: string | null;
  bloquear_disparos?: boolean;
  campanha?: CampanhaProgresso | null;
};

type RealtimeContexto = {
  usuarioId: string;
  empresaId: string;
};

type CampanhaRealtimeRow = {
  id?: unknown;
  empresa_id?: unknown;
  usuario_id?: unknown;
  status?: unknown;
  template_nome?: unknown;
  total_itens?: unknown;
  total_pendentes?: unknown;
  total_processando?: unknown;
  total_enviados?: unknown;
  total_falhas?: unknown;
  total_cancelados?: unknown;
  pausa_motivo?: unknown;
  erro?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
  started_at?: unknown;
  paused_at?: unknown;
  finished_at?: unknown;
};

const EVENTO_ANDAMENTO = "crm:whatsapp-disparo-andamento";
const EVENTO_REFRESH = "crm:whatsapp-disparo-refresh";
const POLLING_FALLBACK_MS = 2 * 60_000;
const TERMINAL_DISMISS_MS = 8000;

const STATUS_ATIVOS = new Set(["pendente", "enviando"]);

function isStatusAtivo(status?: string | null) {
  return STATUS_ATIVOS.has(String(status || ""));
}

function isStatusSucesso(status?: string | null) {
  return String(status || "") === "concluida";
}

function getDismissKey(campanhaId: string) {
  return `crm-whatsapp-disparo-terminal:${campanhaId}`;
}

function inteiro(valor: unknown) {
  const numero = Number(valor || 0);
  return Number.isFinite(numero) ? Math.max(0, Math.trunc(numero)) : 0;
}

function texto(valor: unknown) {
  return typeof valor === "string" && valor.trim() ? valor : null;
}

function motivoCampanha(row: CampanhaRealtimeRow) {
  const motivo = texto(row.pausa_motivo) || texto(row.erro);

  if (motivo) return motivo;

  switch (texto(row.status)) {
    case "pausada_por_conta_bloqueada":
      return "A Meta bloqueou ou desativou a conta WhatsApp Business durante o disparo.";
    case "pausada_por_lista_invalida":
      return "A lista apresentou muitos numeros invalidos ou indisponiveis.";
    case "pausada_por_erro_meta":
      return "A Meta retornou erros que exigem pausa operacional.";
    case "pausada_por_falhas":
      return "Muitas mensagens falharam no lote processado.";
    case "cancelada":
      return "O disparo foi cancelado antes de concluir todos os envios.";
    case "erro":
      return "O disparo foi interrompido por erro operacional.";
    default:
      return null;
  }
}

function normalizarCampanhaRealtime(row: unknown): CampanhaProgresso | null {
  if (!row || typeof row !== "object") return null;

  const campanha = row as CampanhaRealtimeRow;
  const id = texto(campanha.id);

  if (!id) return null;

  const total = inteiro(campanha.total_itens);
  const enviados = inteiro(campanha.total_enviados);
  const falhas = inteiro(campanha.total_falhas);
  const cancelados = inteiro(campanha.total_cancelados);
  const pendentes = inteiro(campanha.total_pendentes);
  const processando = inteiro(campanha.total_processando);

  return {
    id,
    status: texto(campanha.status),
    template_nome: texto(campanha.template_nome),
    total,
    enviados,
    falhas,
    cancelados,
    pendentes,
    processando,
    processados: Math.min(total, enviados + falhas + cancelados),
    motivo: motivoCampanha(campanha),
  };
}

function percentual(campanha: CampanhaProgresso) {
  if (!campanha.total) return 0;

  const processados = Math.min(
    campanha.total,
    Math.max(campanha.processados, campanha.enviados + campanha.falhas)
  );

  return Math.max(4, Math.min(100, Math.round((processados / campanha.total) * 100)));
}

function rotuloStatus(campanha: CampanhaProgresso) {
  if (isStatusAtivo(campanha.status)) return "Processando";
  if (isStatusSucesso(campanha.status)) return "Concluido";
  return "Interrompido";
}

function descricaoTerminal(campanha: CampanhaProgresso) {
  if (isStatusSucesso(campanha.status)) {
    return "Disparo em massa finalizado com sucesso.";
  }

  return (
    campanha.motivo ||
    "Disparo em massa interrompido pelo sistema de seguranca."
  );
}

function emitirAndamento(data: ProgressoResponse | null) {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent(EVENTO_ANDAMENTO, {
      detail: {
        bloquear_disparos: data?.bloquear_disparos === true,
        campanha: data?.campanha || null,
      },
    })
  );
}

export default function WhatsAppDisparoProgressCard() {
  const [campanha, setCampanha] = useState<CampanhaProgresso | null>(null);
  const [contextoRealtime, setContextoRealtime] =
    useState<RealtimeContexto | null>(null);
  const terminalTimerRef = useRef<number | null>(null);
  const supabaseRealtimeRef = useRef<ReturnType<typeof createClient> | null>(
    null
  );

  function getSupabaseRealtime() {
    if (!supabaseRealtimeRef.current) {
      supabaseRealtimeRef.current = createClient();
    }

    return supabaseRealtimeRef.current;
  }

  const aplicarCampanha = useCallback(
    (campanhaAtual: CampanhaProgresso | null, bloquearDisparos?: boolean) => {
      if (
        campanhaAtual &&
        !isStatusAtivo(campanhaAtual.status) &&
        window.sessionStorage.getItem(getDismissKey(campanhaAtual.id))
      ) {
        setCampanha(null);
        emitirAndamento({
          ok: true,
          bloquear_disparos: false,
          campanha: null,
        });
        return;
      }

      setCampanha(campanhaAtual);
      emitirAndamento({
        ok: true,
        bloquear_disparos:
          bloquearDisparos ?? isStatusAtivo(campanhaAtual?.status),
        campanha: campanhaAtual,
      });
    },
    []
  );

  const carregarStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/whatsapp/disparos/andamento", {
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
        },
      });

      if (response.status === 401 || response.status === 403) {
        setCampanha(null);
        emitirAndamento(null);
        return;
      }

      const json = (await response.json()) as ProgressoResponse;

      if (!response.ok || !json.ok) {
        return;
      }

      if (json.usuario_id && json.empresa_id) {
        setContextoRealtime({
          usuarioId: json.usuario_id,
          empresaId: json.empresa_id,
        });
      }

      aplicarCampanha(json.campanha || null, json.bloquear_disparos);
    } catch {
      return;
    }
  }, [aplicarCampanha]);

  useEffect(() => {
    const initialTimeoutId = window.setTimeout(() => {
      carregarStatus();
    }, 0);

    const refreshHandler = () => carregarStatus();

    window.addEventListener(EVENTO_REFRESH, refreshHandler);

    return () => {
      window.clearTimeout(initialTimeoutId);
      window.removeEventListener(EVENTO_REFRESH, refreshHandler);
    };
  }, [carregarStatus]);

  const statusAtivo = isStatusAtivo(campanha?.status);
  const statusSucesso = isStatusSucesso(campanha?.status);
  const campanhaId = campanha?.id || "";

  useEffect(() => {
    const usuarioId = contextoRealtime?.usuarioId;
    const empresaId = contextoRealtime?.empresaId;

    if (!usuarioId || !empresaId) return;

    const supabase = getSupabaseRealtime();
    const channel = supabase
      .channel(`crm-whatsapp-disparo-progress:${usuarioId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "whatsapp_disparo_campanhas",
          filter: `usuario_id=eq.${usuarioId}`,
        },
        (payload) => {
          const row = payload.new || payload.old;

          if (!row || typeof row !== "object") return;

          const empresaRow = (row as CampanhaRealtimeRow).empresa_id;
          if (String(empresaRow || "") !== empresaId) return;

          aplicarCampanha(normalizarCampanhaRealtime(row));
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [contextoRealtime?.usuarioId, contextoRealtime?.empresaId, aplicarCampanha]);

  useEffect(() => {
    if (!statusAtivo) return;

    const fallbackIntervalId = window.setInterval(
      carregarStatus,
      POLLING_FALLBACK_MS
    );

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void carregarStatus();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(fallbackIntervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [statusAtivo, carregarStatus]);

  useEffect(() => {
    if (terminalTimerRef.current) {
      window.clearTimeout(terminalTimerRef.current);
      terminalTimerRef.current = null;
    }

    if (!campanhaId || statusAtivo) return;

    terminalTimerRef.current = window.setTimeout(() => {
      window.sessionStorage.setItem(getDismissKey(campanhaId), "1");
      setCampanha(null);
      emitirAndamento({ ok: true, bloquear_disparos: false, campanha: null });
    }, TERMINAL_DISMISS_MS);

    return () => {
      if (terminalTimerRef.current) {
        window.clearTimeout(terminalTimerRef.current);
        terminalTimerRef.current = null;
      }
    };
  }, [campanhaId, statusAtivo]);

  const progresso = useMemo(() => {
    return campanha ? percentual(campanha) : 0;
  }, [campanha]);

  if (!campanha) return null;

  return (
    <section
      className={`${styles.card} ${
        statusAtivo
          ? styles.cardActive
          : statusSucesso
          ? styles.cardSuccess
          : styles.cardWarning
      }`}
      role="status"
      aria-live="polite"
    >
      <div className={styles.header}>
        <span className={statusAtivo ? styles.spinner : styles.statusDot} />
        <div>
          <strong>Disparo em massa</strong>
          <small>{rotuloStatus(campanha)}</small>
        </div>
      </div>

      <div className={styles.metrics}>
        <span>
          Enviados <strong>{campanha.enviados}/{campanha.total}</strong>
        </span>
        <span>
          Falhas <strong>{campanha.falhas}</strong>
        </span>
      </div>

      <div className={styles.progressTrack} aria-hidden="true">
        <span style={{ width: `${progresso}%` }} />
      </div>

      {!statusAtivo ? (
        <p className={styles.message}>{descricaoTerminal(campanha)}</p>
      ) : null}
    </section>
  );
}
