"use client";

import {
  useCallback,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { Fluxo } from "../types";

type UseFluxoCompartilhamentoOptions = {
  carregarFluxos: () => Promise<void>;
  setFluxoSelecionado: Dispatch<SetStateAction<Fluxo | null>>;
  onClearError: () => void;
  onClearSuccess: () => void;
  onSuccess: (message: string) => void;
};

function mensagemErroFluxo(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function useFluxoCompartilhamento({
  carregarFluxos,
  setFluxoSelecionado,
  onClearError,
  onClearSuccess,
  onSuccess,
}: UseFluxoCompartilhamentoOptions) {
  const [modalCompartilharAberto, setModalCompartilharAberto] = useState(false);
  const [fluxoParaCompartilhar, setFluxoParaCompartilhar] =
    useState<Fluxo | null>(null);
  const [codigoCompartilhamento, setCodigoCompartilhamento] = useState("");
  const [carregandoCodigoCompartilhamento, setCarregandoCodigoCompartilhamento] =
    useState(false);
  const [erroCompartilhamento, setErroCompartilhamento] = useState("");
  const [modalImportarAberto, setModalImportarAberto] = useState(false);
  const [codigoImportacao, setCodigoImportacao] = useState("");
  const [importandoFluxo, setImportandoFluxo] = useState(false);
  const [erroImportacao, setErroImportacao] = useState("");

  const gerarCodigoCompartilhamento = useCallback(async (fluxo: Fluxo) => {
    try {
      setCarregandoCodigoCompartilhamento(true);
      setErroCompartilhamento("");
      setCodigoCompartilhamento("");

      const res = await fetch("/api/automacoes/compartilhamentos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fluxo_id: fluxo.id,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao gerar codigo.");
      }

      setCodigoCompartilhamento(json.codigo || "");
    } catch (error: unknown) {
      setErroCompartilhamento(
        mensagemErroFluxo(error, "Erro ao gerar codigo.")
      );
    } finally {
      setCarregandoCodigoCompartilhamento(false);
    }
  }, []);

  const abrirCompartilhamentoFluxo = useCallback(
    (fluxo: Fluxo) => {
      setFluxoParaCompartilhar(fluxo);
      setModalCompartilharAberto(true);
      void gerarCodigoCompartilhamento(fluxo);
    },
    [gerarCodigoCompartilhamento]
  );

  const fecharCompartilhamentoFluxo = useCallback(() => {
    setModalCompartilharAberto(false);
    setFluxoParaCompartilhar(null);
    setCodigoCompartilhamento("");
    setErroCompartilhamento("");
  }, []);

  const copiarCodigoCompartilhamento = useCallback(async () => {
    try {
      if (!codigoCompartilhamento) return;

      await navigator.clipboard.writeText(codigoCompartilhamento);
      onSuccess("Codigo copiado com sucesso.");
    } catch {
      setErroCompartilhamento(
        "Nao foi possivel copiar automaticamente. Selecione e copie o codigo."
      );
    }
  }, [codigoCompartilhamento, onSuccess]);

  const abrirImportacaoFluxo = useCallback(() => {
    setErroImportacao("");
    setCodigoImportacao("");
    setModalImportarAberto(true);
  }, []);

  const fecharImportacaoFluxo = useCallback(() => {
    setModalImportarAberto(false);
    setCodigoImportacao("");
    setErroImportacao("");
  }, []);

  const importarFluxoCompartilhado = useCallback(async () => {
    try {
      setErroImportacao("");
      onClearError();
      onClearSuccess();

      const codigo = codigoImportacao.trim();

      if (!codigo) {
        setErroImportacao("Cole o codigo do fluxo.");
        return;
      }

      setImportandoFluxo(true);

      const res = await fetch("/api/automacoes/compartilhamentos", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ codigo }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao importar fluxo.");
      }

      setCodigoImportacao("");
      setModalImportarAberto(false);
      onSuccess("Fluxo importado como rascunho.");
      await carregarFluxos();
      setFluxoSelecionado(json.fluxo);
    } catch (error: unknown) {
      setErroImportacao(
        mensagemErroFluxo(error, "Erro ao importar fluxo.")
      );
    } finally {
      setImportandoFluxo(false);
    }
  }, [
    carregarFluxos,
    codigoImportacao,
    onClearError,
    onClearSuccess,
    onSuccess,
    setFluxoSelecionado,
  ]);

  return {
    modalCompartilharAberto,
    fluxoParaCompartilhar,
    codigoCompartilhamento,
    carregandoCodigoCompartilhamento,
    erroCompartilhamento,
    gerarCodigoCompartilhamento,
    abrirCompartilhamentoFluxo,
    fecharCompartilhamentoFluxo,
    copiarCodigoCompartilhamento,
    modalImportarAberto,
    codigoImportacao,
    setCodigoImportacao,
    importandoFluxo,
    erroImportacao,
    abrirImportacaoFluxo,
    fecharImportacaoFluxo,
    importarFluxoCompartilhado,
  };
}
