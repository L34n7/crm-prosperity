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
  paused_at?: string | null;
  finished_at?: string | null;
  exibir_ate_ms?: number;
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
const POLLING_ATIVO_MS = 30_000;
const TEMPO_EXIBICAO_FINALIZADA_MS = 25_000;
const CHAVE_FINALIZADAS_EXIBIDAS_PREFIX =
  "crm:whatsapp-disparo-finalizado-exibido:";
const STATUS_ATIVOS = new Set(["preparando", "pendente", "enviando"]);
const STATUS_TERMINAIS = new Set([
  "concluida",
  "pausada_por_falhas",
  "pausada_por_lista_invalida",
  "pausada_por_erro_meta",
  "pausada_por_conta_bloqueada",
  "cancelada",
  "erro",
]);

function inteiro(valor: unknown) {
  const numero = Number(valor || 0);
  return Number.isFinite(numero) ? Math.max(0, Math.trunc(numero)) : 0;
}

function isStatusAtivo(status?: string | null) {
  return STATUS_ATIVOS.has(String(status || ""));
}

function isStatusTerminal(status?: string | null) {
  return STATUS_TERMINAIS.has(String(status || ""));
}

function timestampFinalizacao(campanha: CampanhaProgresso) {
  const valor =
    campanha.finished_at ||
    campanha.paused_at ||
    campanha.updated_at ||
    "";

  const timestamp = Date.parse(String(valor));
  return Number.isFinite(timestamp) ? timestamp : 0;
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
  const [campanhasFinalizadasVisiveis, setCampanhasFinalizadasVisiveis] =
    useState<CampanhaProgresso[]>([]);
  const [expandido, setExpandido] = useState(false);
  const [contextoRealtime, setContextoRealtime] =
    useState<RealtimeContexto | null>(null);
  const [preparacoesLocais, setPreparacoesLocais] = useState<PreparacaoLocal[]>(
    []
  );
  const supabaseRealtimeRef = useRef<ReturnType<typeof createClient> | null>(
    null
  );
  const usuarioIdRef = useRef("");
  const finalizadasExibidasRef = useRef<Set<string>>(new Set());

  function getSupabaseRealtime() {
    if (!supabaseRealtimeRef.current) {
      supabaseRealtimeRef.current = createClient();
    }

    return supabaseRealtimeRef.current;
  }

  function carregarFinalizadasJaExibidas(usuarioId: string) {
    if (typeof window === "undefined" || !usuarioId) return;

    try {
      const bruto = window.localStorage.getItem(
        `${CHAVE_FINALIZADAS_EXIBIDAS_PREFIX}${usuarioId}`
      );
      const ids = bruto ? JSON.parse(bruto) : [];

      finalizadasExibidasRef.current = new Set(
        Array.isArray(ids)
          ? ids.map((id) => String(id || "").trim()).filter(Boolean)
          : []
      );
    } catch {
      finalizadasExibidasRef.current = new Set();
    }
  }

  function registrarFinalizadaComoExibida(campanhaId: string) {
    const id = String(campanhaId || "").trim();
    const usuarioId = usuarioIdRef.current;

    if (!id || !usuarioId || finalizadasExibidasRef.current.has(id)) {
      return;
    }

    finalizadasExibidasRef.current.add(id);

    if (typeof window === "undefined") return;

    try {
      const ids = Array.from(finalizadasExibidasRef.current).slice(-120);
      finalizadasExibidasRef.current = new Set(ids);
      window.localStorage.setItem(
        `${CHAVE_FINALIZADAS_EXIBIDAS_PREFIX}${usuarioId}`,
        JSON.stringify(ids)
      );
    } catch {
      return;
    }
  }

  const aplicarCampanhas = useCallback((lista: CampanhaProgresso[]) => {
    const agora = Date.now();
    const ordenadasAtivas = [...lista]
      .filter((campanha) => isStatusAtivo(campanha.status))
      .sort((a, b) => {
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

    const finalizadasElegiveis = lista
      .filter((campanha) => isStatusTerminal(campanha.status))
      .map((campanha) => {
        const finalizadaEm = timestampFinalizacao(campanha);
        const exibirAte = finalizadaEm + TEMPO_EXIBICAO_FINALIZADA_MS;

        if (!finalizadaEm || exibirAte <= agora) return null;

        return {
          ...campanha,
          exibir_ate_ms: exibirAte,
        };
      })
      .filter(
        (
          campanha
        ): campanha is CampanhaProgresso & { exibir_ate_ms: number } =>
          campanha !== null
      );

    setCampanhasFinalizadasVisiveis((atuais) => {
      const porId = new Map(
        atuais
          .filter(
            (campanha) =>
              inteiro(campanha.exibir_ate_ms) > agora
          )
          .map((campanha) => [campanha.id, campanha])
      );

      finalizadasElegiveis.forEach((campanha) => {
        const existente = porId.get(campanha.id);

        if (existente) {
          porId.set(campanha.id, {
            ...campanha,
            exibir_ate_ms: existente.exibir_ate_ms,
          });
          return;
        }

        if (finalizadasExibidasRef.current.has(campanha.id)) {
          return;
        }

        registrarFinalizadaComoExibida(campanha.id);
        porId.set(campanha.id, campanha);
      });

      return Array.from(porId.values()).sort(
        (a, b) => timestampFinalizacao(b) - timestampFinalizacao(a)
      );
    });

    setCampanhas(ordenadasAtivas);
    setPreparacoesLocais((atuais) =>
      atuais.filter(
        (preparacao) =>
          !lista.some(
            (campanha) =>
              campanha.integracao_whatsapp_id ===
              preparacao.integracao_whatsapp_id
          )
      )
    );
    emitirAndamento(ordenadasAtivas);
  }, []);

  const carregarStatus = useCallback(async () => {
    try {
      const response = await fetch(
        "/api/whatsapp/disparos/andamento?escopo=empresa&incluir_finalizadas_recentes=1",
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

      const usuarioId = String(json.usuario_id || "").trim();

      if (usuarioId && usuarioIdRef.current !== usuarioId) {
        usuarioIdRef.current = usuarioId;
        carregarFinalizadasJaExibidas(usuarioId);
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

  useEffect(() => {
    if (campanhasFinalizadasVisiveis.length === 0) return;

    const agora = Date.now();
    const proximaExpiracao = Math.min(
      ...campanhasFinalizadasVisiveis.map(
        (campanha) => inteiro(campanha.exibir_ate_ms) || agora
      )
    );
    const espera = Math.max(50, proximaExpiracao - agora + 50);

    const timer = window.setTimeout(() => {
      const instante = Date.now();

      setCampanhasFinalizadasVisiveis((atuais) =>
        atuais.filter(
          (campanha) => inteiro(campanha.exibir_ate_ms) > instante
        )
      );
    }, espera);

    return () => {
      window.clearTimeout(timer);
    };
  }, [campanhasFinalizadasVisiveis]);

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
  const quantidadeFinalizadas = campanhasFinalizadasVisiveis.length;

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

  const listaVisivel = useMemo(
    () => [
      ...campanhasFinalizadasVisiveis,
      ...campanhasAtivasVisiveis,
    ],
    [campanhasFinalizadasVisiveis, campanhasAtivasVisiveis]
  );
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
              {quantidadeFinalizadas > 0
                ? `${quantidadeFinalizadas} ${
                    quantidadeFinalizadas === 1 ? "finalizado" : "finalizados"
                  }${
                    campanhasAtivasVisiveis.length > 0
                      ? ` · ${campanhasAtivasVisiveis.length} em andamento`
                      : ""
                  }`
                : `${campanhasAtivasVisiveis.length} ${
                    campanhasAtivasVisiveis.length === 1 ? "ativo" : "ativos"
                  }`}
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
          : isCampanhaSucesso(listaVisivel[0])
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
            {listaVisivel.length > 1
              ? ` · ${listaVisivel.length} campanhas`
              : ""}
          </strong>
          <small>
            {quantidadeFinalizadas > 0
              ? `${quantidadeFinalizadas} ${
                  quantidadeFinalizadas === 1 ? "finalizado" : "finalizados"
                }${
                  campanhasAtivasVisiveis.length > 0
                    ? ` · ${campanhasAtivasVisiveis.length} em andamento`
                    : " · fecha automaticamente"
                }`
              : "Processando"}
          </small>
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
