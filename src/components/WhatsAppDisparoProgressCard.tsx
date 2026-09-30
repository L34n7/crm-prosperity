"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import styles from "./WhatsAppDisparoProgressCard.module.css";

type CampanhaProgresso = {
  id: string;
  nome?: string | null;
  integracao_whatsapp_id?: string | null;
  integracao_nome?: string | null;
  integracao_numero?: string | null;
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
  created_at?: string | null;
  updated_at?: string | null;
};

type ProgressoResponse = {
  ok: boolean;
  usuario_id?: string | null;
  empresa_id?: string | null;
  bloquear_disparos?: boolean;
  campanha?: CampanhaProgresso | null;
  campanhas?: CampanhaProgresso[];
};

type RealtimeContexto = {
  empresaId: string;
};

type PreparacaoLocal = {
  integracao_whatsapp_id: string;
  integracao_nome?: string | null;
  total: number;
  nome?: string | null;
  created_at: string;
};

const EVENTO_ANDAMENTO = "crm:whatsapp-disparo-andamento";
const EVENTO_REFRESH = "crm:whatsapp-disparo-refresh";
const EVENTO_PREPARANDO = "crm:whatsapp-disparo-preparando";
const POLLING_ATIVO_MS = 6000;
const TERMINAL_DISMISS_MS = 8000;
const STATUS_ATIVOS = new Set(["preparando", "pendente", "enviando"]);

function inteiro(valor: unknown) {
  const numero = Number(valor || 0);
  return Number.isFinite(numero) ? Math.max(0, Math.trunc(numero)) : 0;
}

function isStatusAtivo(status?: string | null) {
  return STATUS_ATIVOS.has(String(status || ""));
}

function isCampanhaSucesso(campanha?: CampanhaProgresso | null) {
  return (
    String(campanha?.status || "") === "concluida" &&
    inteiro(campanha?.falhas) === 0 &&
    inteiro(campanha?.cancelados) === 0
  );
}

function percentual(campanha: CampanhaProgresso) {
  if (!campanha.total) return 0;

  const processados = Math.min(
    campanha.total,
    Math.max(
      inteiro(campanha.processados),
      inteiro(campanha.enviados) +
        inteiro(campanha.falhas) +
        inteiro(campanha.cancelados)
    )
  );

  return Math.max(
    4,
    Math.min(100, Math.round((processados / campanha.total) * 100))
  );
}

function rotuloStatus(campanha: CampanhaProgresso) {
  if (String(campanha.status || "") === "preparando") return "Preparando fila";
  if (String(campanha.status || "") === "pendente") return "Preparando fila";
  if (String(campanha.status || "") === "enviando") return "Processando";
  if (isCampanhaSucesso(campanha)) return "Concluído";
  if (String(campanha.status || "") === "concluida") {
    return "Concluído com falhas";
  }
  return "Interrompido";
}

function emitirAndamento(campanhas: CampanhaProgresso[]) {
  if (typeof window === "undefined") return;

  const ativas = campanhas.filter((campanha) =>
    isStatusAtivo(campanha.status)
  );

  window.dispatchEvent(
    new CustomEvent(EVENTO_ANDAMENTO, {
      detail: {
        bloquear_disparos: ativas.length > 0,
        campanha: campanhas[0] || null,
        campanhas,
      },
    })
  );
}

function labelIntegracao(campanha: CampanhaProgresso) {
  return (
    campanha.integracao_nome ||
    campanha.integracao_numero ||
    "Integração WhatsApp"
  );
}

export default function WhatsAppDisparoProgressCard() {
  const [campanhas, setCampanhas] = useState<CampanhaProgresso[]>([]);
  const [expandido, setExpandido] = useState(false);
  const [contextoRealtime, setContextoRealtime] =
    useState<RealtimeContexto | null>(null);
  const [preparacoesLocais, setPreparacoesLocais] = useState<PreparacaoLocal[]>(
    []
  );
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

  const aplicarCampanhas = useCallback((lista: CampanhaProgresso[]) => {
    const ordenadas = [...lista].sort((a, b) => {
      const criadaA = String(a.created_at || "");
      const criadaB = String(b.created_at || "");
      const criadaAMs = Date.parse(criadaA);
      const criadaBMs = Date.parse(criadaB);

      if (Number.isFinite(criadaAMs) && Number.isFinite(criadaBMs)) {
        const diferenca = criadaAMs - criadaBMs;

        if (diferenca !== 0) return diferenca;

        if (criadaA !== criadaB) {
          return criadaA.localeCompare(criadaB, "pt-BR");
        }
      } else if (Number.isFinite(criadaAMs)) {
        return -1;
      } else if (Number.isFinite(criadaBMs)) {
        return 1;
      }

      return String(a.id || "").localeCompare(String(b.id || ""), "pt-BR");
    });

    setCampanhas(ordenadas);
    setPreparacoesLocais((atuais) =>
      atuais.filter(
        (preparacao) =>
          !ordenadas.some(
            (campanha) =>
              campanha.integracao_whatsapp_id ===
              preparacao.integracao_whatsapp_id
          )
      )
    );
    emitirAndamento(ordenadas);
  }, []);

  const carregarStatus = useCallback(async () => {
    try {
      const response = await fetch(
        "/api/whatsapp/disparos/andamento?escopo=empresa",
        {
          cache: "no-store",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        }
      );

      if (response.status === 401 || response.status === 403) {
        aplicarCampanhas([]);
        return;
      }

      const json = (await response.json()) as ProgressoResponse;

      if (!response.ok || !json.ok) return;

      if (json.empresa_id) {
        setContextoRealtime({ empresaId: json.empresa_id });
      }

      const lista = Array.isArray(json.campanhas)
        ? json.campanhas
        : json.campanha
        ? [json.campanha]
        : [];

      aplicarCampanhas(lista);
    } catch {
      return;
    }
  }, [aplicarCampanhas]);

  useEffect(() => {
    const initialTimeoutId = window.setTimeout(() => {
      void carregarStatus();
    }, 0);

    const refreshHandler = () => void carregarStatus();
    window.addEventListener(EVENTO_REFRESH, refreshHandler);

    return () => {
      window.clearTimeout(initialTimeoutId);
      window.removeEventListener(EVENTO_REFRESH, refreshHandler);
    };
  }, [carregarStatus]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detalhe = (
        event as CustomEvent<{
          ativo?: boolean;
          integracao_whatsapp_id?: string;
          integracao_nome?: string | null;
          total?: number;
          nome?: string | null;
        }>
      ).detail;

      const integracaoWhatsappId = String(
        detalhe?.integracao_whatsapp_id || ""
      ).trim();

      if (!integracaoWhatsappId) return;

      setPreparacoesLocais((atuais) => {
        const semAtual = atuais.filter(
          (item) => item.integracao_whatsapp_id !== integracaoWhatsappId
        );

        if (detalhe?.ativo === false) return semAtual;

        return [
          ...semAtual,
          {
            integracao_whatsapp_id: integracaoWhatsappId,
            integracao_nome: detalhe?.integracao_nome || null,
            total: inteiro(detalhe?.total),
            nome: detalhe?.nome || "Disparo em massa",
            created_at: new Date().toISOString(),
          },
        ];
      });
    };

    window.addEventListener(EVENTO_PREPARANDO, handler);

    return () => {
      window.removeEventListener(EVENTO_PREPARANDO, handler);
    };
  }, []);

  useEffect(() => {
    const empresaId = contextoRealtime?.empresaId;
    if (!empresaId) return;

    const supabase = getSupabaseRealtime();
    const channel = supabase
      .channel(`crm-whatsapp-disparos-central:${empresaId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "whatsapp_disparo_campanhas",
          filter: `empresa_id=eq.${empresaId}`,
        },
        () => {
          void carregarStatus();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [contextoRealtime?.empresaId, carregarStatus]);

  const campanhasAtivas = useMemo(
    () => campanhas.filter((campanha) => isStatusAtivo(campanha.status)),
    [campanhas]
  );
  const campanhasPreparando = useMemo<CampanhaProgresso[]>(
    () =>
      preparacoesLocais.map((preparacao) => ({
        id: `preparando:${preparacao.integracao_whatsapp_id}`,
        nome: preparacao.nome || "Disparo em massa",
        integracao_whatsapp_id: preparacao.integracao_whatsapp_id,
        integracao_nome: preparacao.integracao_nome || "Integração WhatsApp",
        status: "preparando",
        template_nome: null,
        total: preparacao.total,
        enviados: 0,
        falhas: 0,
        cancelados: 0,
        pendentes: preparacao.total,
        processando: 0,
        processados: 0,
        created_at: preparacao.created_at,
        updated_at: preparacao.created_at,
      })),
    [preparacoesLocais]
  );
  const campanhasAtivasVisiveis = useMemo(
    () => [...campanhasAtivas, ...campanhasPreparando],
    [campanhasAtivas, campanhasPreparando]
  );
  const possuiAtivas = campanhasAtivasVisiveis.length > 0;

  useEffect(() => {
    if (!possuiAtivas) return;

    const atualizar = () => {
      if (document.visibilityState === "visible") {
        void carregarStatus();
      }
    };

    const timer = window.setInterval(atualizar, POLLING_ATIVO_MS);
    document.addEventListener("visibilitychange", atualizar);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", atualizar);
    };
  }, [possuiAtivas, carregarStatus]);

  useEffect(() => {
    if (terminalTimerRef.current) {
      window.clearTimeout(terminalTimerRef.current);
      terminalTimerRef.current = null;
    }

    if (campanhas.length === 0 || possuiAtivas) return;

    terminalTimerRef.current = window.setTimeout(() => {
      setCampanhas([]);
      setExpandido(false);
      emitirAndamento([]);
    }, TERMINAL_DISMISS_MS);

    return () => {
      if (terminalTimerRef.current) {
        window.clearTimeout(terminalTimerRef.current);
        terminalTimerRef.current = null;
      }
    };
  }, [campanhas.length, possuiAtivas]);

  const listaVisivel = possuiAtivas ? campanhasAtivasVisiveis : campanhas;
  const total = listaVisivel.reduce(
    (soma, campanha) => soma + inteiro(campanha.total),
    0
  );
  const enviados = listaVisivel.reduce(
    (soma, campanha) => soma + inteiro(campanha.enviados),
    0
  );
  const falhas = listaVisivel.reduce(
    (soma, campanha) => soma + inteiro(campanha.falhas),
    0
  );
  const processados = listaVisivel.reduce(
    (soma, campanha) =>
      soma +
      Math.min(
        inteiro(campanha.total),
        inteiro(campanha.enviados) +
          inteiro(campanha.falhas) +
          inteiro(campanha.cancelados)
      ),
    0
  );
  const progressoGeral =
    total > 0 ? Math.max(4, Math.min(100, Math.round((processados / total) * 100))) : 0;

  function abrirCampanha(campanhaId: string) {
    if (typeof window === "undefined") return;
    if (campanhaId.startsWith("preparando:")) return;

    if (window.location.pathname === "/disparos-whatsapp") {
      window.dispatchEvent(
        new CustomEvent("crm:whatsapp-disparo-abrir", {
          detail: { campanhaId },
        })
      );
      setExpandido(false);
      return;
    }

    window.location.assign(
      `/disparos-whatsapp?campanha=${encodeURIComponent(campanhaId)}`
    );
  }

  if (listaVisivel.length === 0) return null;

  if (expandido) {
    return (
      <section className={styles.center} aria-label="Disparos em andamento">
        <div className={styles.centerHeader}>
          <div>
            <strong>Disparos em massa</strong>
            <small>
              {possuiAtivas
                ? `${campanhasAtivasVisiveis.length} ${campanhasAtivasVisiveis.length === 1 ? "ativo" : "ativos"}`
                : "Últimos disparos"}
            </small>
          </div>

          <button
            type="button"
            className={styles.minimizeButton}
            onClick={() => setExpandido(false)}
          >
            Minimizar
          </button>
        </div>

        <div className={styles.centerSummary}>
          <span>
            Enviados <strong>{enviados}/{total}</strong>
          </span>
          <span>
            Falhas <strong>{falhas}</strong>
          </span>
          <span>
            Progresso <strong>{progressoGeral}%</strong>
          </span>
        </div>

        <div className={styles.campaignList}>
          {listaVisivel.map((campanha) => (
            <article
              key={campanha.id}
              className={`${styles.campaignRow} ${
                isStatusAtivo(campanha.status)
                  ? styles.rowActive
                  : isCampanhaSucesso(campanha)
                  ? styles.rowSuccess
                  : styles.rowWarning
              }`}
            >
              <div className={styles.rowTop}>
                <div className={styles.rowIdentity}>
                  <span
                    className={
                      isStatusAtivo(campanha.status)
                        ? styles.spinner
                        : styles.statusDot
                    }
                  />
                  <div>
                    <strong>{labelIntegracao(campanha)}</strong>
                    <small>{campanha.nome || campanha.template_nome || "Disparo em massa"}</small>
                  </div>
                </div>

                {campanha.id.startsWith("preparando:") ? (
                  <span className={styles.rowStatus}>Preparando fila</span>
                ) : (
                  <button
                    type="button"
                    className={styles.openButton}
                    onClick={() => abrirCampanha(campanha.id)}
                  >
                    Abrir
                  </button>
                )}
              </div>

              <div className={styles.rowMetrics}>
                <span>
                  Enviados <strong>{campanha.enviados}/{campanha.total}</strong>
                </span>
                <span>
                  Falhas <strong>{campanha.falhas}</strong>
                </span>
                <span className={styles.rowStatus}>{rotuloStatus(campanha)}</span>
              </div>

              <div className={styles.progressTrack} aria-hidden="true">
                <span style={{ width: `${percentual(campanha)}%` }} />
              </div>
            </article>
          ))}
        </div>
      </section>
    );
  }

  return (
    <button
      type="button"
      className={`${styles.card} ${
        possuiAtivas
          ? styles.cardActive
          : listaVisivel.every(isCampanhaSucesso)
          ? styles.cardSuccess
          : styles.cardWarning
      }`}
      onClick={() => {
        if (
          listaVisivel.length === 1 &&
          !listaVisivel[0].id.startsWith("preparando:")
        ) {
          abrirCampanha(listaVisivel[0].id);
          return;
        }

        setExpandido(true);
      }}
      aria-label={
        listaVisivel.length === 1
          ? "Abrir detalhes do disparo em massa"
          : "Abrir central de disparos em massa"
      }
    >
      <div className={styles.header}>
        <span className={possuiAtivas ? styles.spinner : styles.statusDot} />
        <div>
          <strong>
            Disparos em massa
            {campanhasAtivasVisiveis.length > 1
              ? ` · ${campanhasAtivasVisiveis.length} ativos`
              : ""}
          </strong>
          <small>{possuiAtivas ? "Processando" : rotuloStatus(listaVisivel[0])}</small>
        </div>
      </div>

      <div className={styles.metrics}>
        <span>
          Enviados <strong>{enviados}/{total}</strong>
        </span>
        <span>
          Falhas <strong>{falhas}</strong>
        </span>
      </div>

      <div className={styles.progressTrack} aria-hidden="true">
        <span style={{ width: `${progressoGeral}%` }} />
      </div>
    </button>
  );
}
