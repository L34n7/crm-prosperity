"use client";

import { useCallback, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Fluxo } from "../types";

type UseFluxosOptions = {
  fluxoParam?: string | null;
  onClearError?: () => void;
  onError: (mensagem: string) => void;
};

type UseFluxosResult = {
  fluxos: Fluxo[];
  setFluxos: Dispatch<SetStateAction<Fluxo[]>>;
  fluxoSelecionado: Fluxo | null;
  setFluxoSelecionado: Dispatch<SetStateAction<Fluxo | null>>;
  carregandoFluxos: boolean;
  carregarFluxos: () => Promise<void>;
};

export default function useFluxos({
  fluxoParam,
  onClearError,
  onError,
}: UseFluxosOptions): UseFluxosResult {
  const [fluxos, setFluxos] = useState<Fluxo[]>([]);
  const [fluxoSelecionado, setFluxoSelecionado] = useState<Fluxo | null>(null);
  const [carregandoFluxos, setCarregandoFluxos] = useState(true);

  const carregarFluxos = useCallback(async () => {
    try {
      setCarregandoFluxos(true);
      onClearError?.();

      const res = await fetch("/api/automacoes", {
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao carregar fluxos.");
      }

      const listaFluxos: Fluxo[] = Array.isArray(json.fluxos)
        ? json.fluxos
        : [];
      setFluxos(listaFluxos);

      const fluxoDaUrl = fluxoParam
        ? listaFluxos.find((item) => item.id === fluxoParam)
        : null;

      setFluxoSelecionado((atual) => {
        if (fluxoDaUrl) return fluxoDaUrl;
        if (!atual && listaFluxos.length > 0) return listaFluxos[0];
        return atual;
      });
    } catch (error: unknown) {
      onError(
        error instanceof Error ? error.message : "Erro ao carregar fluxos."
      );
    } finally {
      setCarregandoFluxos(false);
    }
  }, [fluxoParam, onClearError, onError]);

  return {
    fluxos,
    setFluxos,
    fluxoSelecionado,
    setFluxoSelecionado,
    carregandoFluxos,
    carregarFluxos,
  };
}
