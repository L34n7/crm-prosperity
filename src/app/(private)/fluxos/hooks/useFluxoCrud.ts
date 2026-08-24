"use client";

import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { Fluxo } from "../types";

type UseFluxoCrudOptions = {
  fluxoSelecionado: Fluxo | null;
  setFluxoSelecionado: Dispatch<SetStateAction<Fluxo | null>>;
  carregarFluxos: () => Promise<void>;
  onLimparEditorSelecionado: () => void;
  onError: (message: string) => void;
  onClearError: () => void;
  onSuccess: (message: string) => void;
  onClearSuccess: () => void;
};

function fluxoEhSistemaCalendario(fluxo?: Fluxo | null) {
  return Boolean(
    fluxo?.configuracao_json?.fluxo_sistema_calendario === true &&
      fluxo?.configuracao_json?.protegido_sistema === true
  );
}

export default function useFluxoCrud({
  fluxoSelecionado,
  setFluxoSelecionado,
  carregarFluxos,
  onLimparEditorSelecionado,
  onError,
  onClearError,
  onSuccess,
  onClearSuccess,
}: UseFluxoCrudOptions) {
  const [modalArquivarAberto, setModalArquivarAberto] = useState(false);
  const [fluxoParaArquivar, setFluxoParaArquivar] = useState<Fluxo | null>(
    null
  );
  const [
    modalApagarDefinitivoAberto,
    setModalApagarDefinitivoAberto,
  ] = useState(false);
  const [
    fluxoParaApagarDefinitivo,
    setFluxoParaApagarDefinitivo,
  ] = useState<Fluxo | null>(null);
  const [apagandoFluxoDefinitivo, setApagandoFluxoDefinitivo] =
    useState(false);
  const apagandoFluxoDefinitivoRef = useRef(false);

  const duplicarFluxo = useCallback(
    async (fluxo: Fluxo) => {
      try {
        onClearError();
        onClearSuccess();

        const res = await fetch("/api/automacoes", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: fluxo.id }),
        });

        const json = await res.json();

        if (!res.ok || !json.ok) {
          throw new Error(json.error || "Erro ao duplicar fluxo.");
        }

        onSuccess("Fluxo duplicado com sucesso.");
        await carregarFluxos();
        setFluxoSelecionado(json.fluxo);
      } catch (error: unknown) {
        onError(
          error instanceof Error ? error.message : "Erro ao duplicar fluxo."
        );
      }
    },
    [
      carregarFluxos,
      onClearError,
      onClearSuccess,
      onError,
      onSuccess,
      setFluxoSelecionado,
    ]
  );

  const restaurarFluxo = useCallback(
    async (fluxo: Fluxo) => {
      try {
        onClearError();
        onClearSuccess();

        const res = await fetch("/api/automacoes", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: fluxo.id,
            status: "rascunho",
          }),
        });

        const text = await res.text();
        const json = text ? JSON.parse(text) : {};

        if (!res.ok || !json.ok) {
          throw new Error(json.error || "Erro ao restaurar fluxo.");
        }

        onSuccess("Fluxo restaurado como rascunho.");
        await carregarFluxos();
        setFluxoSelecionado(json.fluxo);
      } catch (error: unknown) {
        onError(
          error instanceof Error ? error.message : "Erro ao restaurar fluxo."
        );
      }
    },
    [
      carregarFluxos,
      onClearError,
      onClearSuccess,
      onError,
      onSuccess,
      setFluxoSelecionado,
    ]
  );

  const abrirModalArquivarFluxo = useCallback(
    (fluxo: Fluxo) => {
      if (fluxoEhSistemaCalendario(fluxo)) {
        onError("Fluxos fixos do sistema não podem ser arquivados.");
        return;
      }

      setFluxoParaArquivar(fluxo);
      setModalArquivarAberto(true);
    },
    [onError]
  );

  const fecharModalArquivarFluxo = useCallback(() => {
    setModalArquivarAberto(false);
    setFluxoParaArquivar(null);
  }, []);

  const confirmarArquivarFluxo = useCallback(async () => {
    if (!fluxoParaArquivar) return;

    try {
      onClearError();
      onClearSuccess();

      const res = await fetch("/api/automacoes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: fluxoParaArquivar.id,
          definitivo: false,
        }),
      });

      const text = await res.text();
      const json = text ? JSON.parse(text) : {};

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao arquivar fluxo.");
      }

      onSuccess("Fluxo arquivado com sucesso.");
      setModalArquivarAberto(false);

      if (fluxoSelecionado?.id === fluxoParaArquivar.id) {
        setFluxoSelecionado(null);
        onLimparEditorSelecionado();
      }

      setFluxoParaArquivar(null);
      await carregarFluxos();
    } catch (error: unknown) {
      onError(
        error instanceof Error ? error.message : "Erro ao arquivar fluxo."
      );
    }
  }, [
    carregarFluxos,
    fluxoParaArquivar,
    fluxoSelecionado?.id,
    onClearError,
    onClearSuccess,
    onError,
    onLimparEditorSelecionado,
    onSuccess,
    setFluxoSelecionado,
  ]);

  const abrirModalApagarDefinitivo = useCallback(
    (fluxo: Fluxo) => {
      if (fluxoEhSistemaCalendario(fluxo)) {
        onError("Fluxos fixos do sistema não podem ser excluídos.");
        return;
      }

      if (apagandoFluxoDefinitivoRef.current) return;

      setFluxoParaApagarDefinitivo(fluxo);
      setModalApagarDefinitivoAberto(true);
    },
    [onError]
  );

  const fecharModalApagarDefinitivo = useCallback(() => {
    if (apagandoFluxoDefinitivoRef.current) return;

    setModalApagarDefinitivoAberto(false);
    setFluxoParaApagarDefinitivo(null);
  }, []);

  const confirmarApagarDefinitivo = useCallback(async () => {
    if (
      !fluxoParaApagarDefinitivo ||
      apagandoFluxoDefinitivoRef.current
    ) {
      return;
    }

    const fluxoAlvo = fluxoParaApagarDefinitivo;
    apagandoFluxoDefinitivoRef.current = true;
    setApagandoFluxoDefinitivo(true);

    try {
      onClearError();
      onClearSuccess();

      const res = await fetch("/api/automacoes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: fluxoAlvo.id,
          definitivo: true,
        }),
      });

      const text = await res.text();
      const json = text ? JSON.parse(text) : {};

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao apagar definitivamente.");
      }

      onSuccess("Fluxo apagado definitivamente.");
      setModalApagarDefinitivoAberto(false);

      if (fluxoSelecionado?.id === fluxoAlvo.id) {
        setFluxoSelecionado(null);
        onLimparEditorSelecionado();
      }

      setFluxoParaApagarDefinitivo(null);
      await carregarFluxos();
    } catch (error: unknown) {
      onError(
        error instanceof Error
          ? error.message
          : "Erro ao apagar definitivamente."
      );
    } finally {
      apagandoFluxoDefinitivoRef.current = false;
      setApagandoFluxoDefinitivo(false);
    }
  }, [
    carregarFluxos,
    fluxoParaApagarDefinitivo,
    fluxoSelecionado?.id,
    onClearError,
    onClearSuccess,
    onError,
    onLimparEditorSelecionado,
    onSuccess,
    setFluxoSelecionado,
  ]);

  return {
    duplicarFluxo,
    restaurarFluxo,
    modalArquivarAberto,
    fluxoParaArquivar,
    abrirModalArquivarFluxo,
    fecharModalArquivarFluxo,
    confirmarArquivarFluxo,
    modalApagarDefinitivoAberto,
    fluxoParaApagarDefinitivo,
    apagandoFluxoDefinitivo,
    abrirModalApagarDefinitivo,
    fecharModalApagarDefinitivo,
    confirmarApagarDefinitivo,
  };
}
