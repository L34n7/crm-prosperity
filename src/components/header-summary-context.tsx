"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  IA_TOKENS_REFRESH_EVENT,
  type IaTokensRefreshEventDetail,
} from "@/lib/ia/tokens-client-events";
import { createClient } from "@/lib/supabase/client";

export type HeaderSummaryNotificacao = {
  id: string;
  titulo: string;
  mensagem: string;
  lida: boolean;
  conversa_id: string | null;
  created_at: string;
  metadata_json?: Record<string, unknown>;
};

export type HeaderSummarySaldoTokensIa = {
  limite_mensal: number | null;
  tokens_usados: number;
  tokens_restantes: number | null;
  saldo_mensal_restante: number | null;
  saldo_avulso_restante: number;
  periodo_inicio?: string;
};

type HeaderSummaryContextValue = {
  notificacoes: HeaderSummaryNotificacao[];
  notificacoesNaoLidas: number;
  conversasNaoLidas: number;
  disparosPendentes: number;
  saldoTokensIa: HeaderSummarySaldoTokensIa | null;
  refreshResumo: (forcarAtualizacao?: boolean) => Promise<void>;
  marcarNotificacaoLidaLocal: (id: string) => void;
  marcarTodasNotificacoesLidasLocal: () => void;
};

const HeaderSummaryContext = createContext<HeaderSummaryContextValue>({
  notificacoes: [],
  notificacoesNaoLidas: 0,
  conversasNaoLidas: 0,
  disparosPendentes: 0,
  saldoTokensIa: null,
  refreshResumo: async () => {},
  marcarNotificacaoLidaLocal: () => {},
  marcarTodasNotificacoesLidasLocal: () => {},
});

const POLL_HEADER_RESUMO_MS = 60_000;

function blocoOk<T>(
  bloco: unknown
): bloco is {
  ok: true;
  data: T;
} {
  return (
    typeof bloco === "object" &&
    bloco !== null &&
    "ok" in bloco &&
    (bloco as { ok?: unknown }).ok === true &&
    "data" in bloco
  );
}

function blocoSemPermissao(bloco: unknown) {
  return (
    typeof bloco === "object" &&
    bloco !== null &&
    "reason" in bloco &&
    (bloco as { reason?: unknown }).reason === "sem_permissao"
  );
}

export function HeaderSummaryProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const carregandoRef = useRef(false);
  const supabaseRealtimeRef = useRef<ReturnType<typeof createClient> | null>(
    null
  );
  const [notificacoes, setNotificacoes] = useState<HeaderSummaryNotificacao[]>(
    []
  );
  const notificacoesRef = useRef<HeaderSummaryNotificacao[]>([]);
  const [notificacoesNaoLidas, setNotificacoesNaoLidas] = useState(0);
  const [conversasNaoLidas, setConversasNaoLidas] = useState(0);
  const [disparosPendentes, setDisparosPendentes] = useState(0);
  const [saldoTokensIa, setSaldoTokensIa] =
    useState<HeaderSummarySaldoTokensIa | null>(null);

  const refreshResumo = useCallback(async (forcarAtualizacao = false) => {
    if (carregandoRef.current) return;
    if (!forcarAtualizacao && document.visibilityState !== "visible") return;

    try {
      carregandoRef.current = true;

      const res = await fetch("/api/header/resumo", {
        cache: forcarAtualizacao ? "no-store" : "default",
      });
      const json = await res.json();

      if (!res.ok || !json.ok) return;

      if (
        blocoOk<{
          notificacoes: HeaderSummaryNotificacao[];
          nao_lidas: number;
        }>(json.notificacoes)
      ) {
        setNotificacoes(json.notificacoes.data.notificacoes || []);
        setNotificacoesNaoLidas(Number(json.notificacoes.data.nao_lidas || 0));
      }

      if (blocoOk<{ quantidade: number }>(json.conversas_nao_lidas)) {
        setConversasNaoLidas(
          Number(json.conversas_nao_lidas.data.quantidade || 0)
        );
      } else if (blocoSemPermissao(json.conversas_nao_lidas)) {
        setConversasNaoLidas(0);
      }

      if (blocoOk<{ quantidade: number }>(json.disparos_pendentes)) {
        setDisparosPendentes(
          Number(json.disparos_pendentes.data.quantidade || 0)
        );
      }

      if (blocoOk<{ saldo: HeaderSummarySaldoTokensIa | null }>(json.tokens_ia)) {
        setSaldoTokensIa(json.tokens_ia.data.saldo || null);
      } else if (blocoSemPermissao(json.tokens_ia)) {
        setSaldoTokensIa(null);
      }
    } catch {
      // Mantem os ultimos dados bons para nao zerar o header em falhas pontuais.
    } finally {
      carregandoRef.current = false;
    }
  }, []);

  useEffect(() => {
    notificacoesRef.current = notificacoes;
  }, [notificacoes]);

  function getSupabaseRealtime() {
    if (!supabaseRealtimeRef.current) {
      supabaseRealtimeRef.current = createClient();
    }

    return supabaseRealtimeRef.current;
  }

  function normalizarNotificacaoRealtime(
    valor: unknown
  ): HeaderSummaryNotificacao | null {
    if (!valor || typeof valor !== "object") return null;

    const row = valor as Partial<HeaderSummaryNotificacao>;

    if (!row.id || !row.titulo || !row.created_at) return null;

    return {
      id: String(row.id),
      titulo: String(row.titulo),
      mensagem: String(row.mensagem || ""),
      lida: row.lida === true,
      conversa_id: row.conversa_id ? String(row.conversa_id) : null,
      created_at: String(row.created_at),
      metadata_json:
        row.metadata_json && typeof row.metadata_json === "object"
          ? row.metadata_json
          : undefined,
    };
  }

  function aplicarNotificacaoRealtime(payload: {
    eventType?: string;
    new?: unknown;
    old?: unknown;
  }) {
    if (document.visibilityState !== "visible") return;

    const notificacao = normalizarNotificacaoRealtime(payload.new);
    if (!notificacao) return;

    const mapa = new Map<string, HeaderSummaryNotificacao>();

    [notificacao, ...notificacoesRef.current].forEach((item) => {
      mapa.set(item.id, item);
    });

    const lista = Array.from(mapa.values())
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
      .slice(0, 20);

    notificacoesRef.current = lista;
    setNotificacoes(lista);
    setNotificacoesNaoLidas(lista.filter((item) => !item.lida).length);
  }

  function marcarNotificacaoLidaLocal(id: string) {
    setNotificacoes((atuais) =>
      atuais.map((notificacao) =>
        notificacao.id === id ? { ...notificacao, lida: true } : notificacao
      )
    );
    setNotificacoesNaoLidas((atual) => Math.max(0, atual - 1));
  }

  function marcarTodasNotificacoesLidasLocal() {
    setNotificacoes((atuais) =>
      atuais.map((notificacao) => ({ ...notificacao, lida: true }))
    );
    setNotificacoesNaoLidas(0);
  }

  useEffect(() => {
    void refreshResumo(true);

    const interval = window.setInterval(() => {
      void refreshResumo();
    }, POLL_HEADER_RESUMO_MS);

    function atualizarAoVoltarParaAba() {
      if (document.visibilityState === "visible") {
        void refreshResumo(true);
      }
    }

    function atualizarPorEventoTokens(event: Event) {
      const customEvent = event as CustomEvent<IaTokensRefreshEventDetail>;

      if (customEvent.detail?.saldo) {
        setSaldoTokensIa(
          customEvent.detail.saldo as HeaderSummarySaldoTokensIa | null
        );
        return;
      }

      void refreshResumo(true);
    }

    document.addEventListener("visibilitychange", atualizarAoVoltarParaAba);
    window.addEventListener(IA_TOKENS_REFRESH_EVENT, atualizarPorEventoTokens);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", atualizarAoVoltarParaAba);
      window.removeEventListener(
        IA_TOKENS_REFRESH_EVENT,
        atualizarPorEventoTokens
      );
    };
  }, [refreshResumo]);

  useEffect(() => {
    const supabase = getSupabaseRealtime();
    const channel = supabase
      .channel("crm-header-notificacoes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notificacoes",
        },
        aplicarNotificacaoRealtime
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  return (
    <HeaderSummaryContext.Provider
      value={{
        notificacoes,
        notificacoesNaoLidas,
        conversasNaoLidas,
        disparosPendentes,
        saldoTokensIa,
        refreshResumo,
        marcarNotificacaoLidaLocal,
        marcarTodasNotificacoesLidasLocal,
      }}
    >
      {children}
    </HeaderSummaryContext.Provider>
  );
}

export function useHeaderSummary() {
  return useContext(HeaderSummaryContext);
}
