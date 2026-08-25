"use client";

import { useCallback, useState } from "react";
import type {
  AlvoVariavelFluxo,
  VariavelPersonalizada,
} from "../types";

type UseFluxoVariaveisOptions = {
  onAplicarMensagemToken: (token: string) => void;
  onAplicarAgendarDisparo: (chave: string) => void;
  onAplicarAgendaLembrete: (chave: string) => void;
  onError: (message: string) => void;
  onClearError: () => void;
  onSuccess: (message: string) => void;
  onClearSuccess: () => void;
};

function normalizarEntradaVariavelTemplate(valor: string) {
  return String(valor || "")
    .replace(/[{}]/g, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+/g, "");
}

export default function useFluxoVariaveis({
  onAplicarMensagemToken,
  onAplicarAgendarDisparo,
  onAplicarAgendaLembrete,
  onError,
  onClearError,
  onSuccess,
  onClearSuccess,
}: UseFluxoVariaveisOptions) {
  const [modalVariaveisAberto, setModalVariaveisAberto] = useState(false);
  const [variaveisPersonalizadas, setVariaveisPersonalizadas] = useState<
    VariavelPersonalizada[]
  >([]);
  const [loadingVariaveis, setLoadingVariaveis] = useState(false);
  const [salvandoVariavel, setSalvandoVariavel] = useState(false);
  const [erroVariavelModal, setErroVariavelModal] = useState("");
  const [novaVariavelChave, setNovaVariavelChave] = useState("");
  const [novaVariavelValor, setNovaVariavelValor] = useState("");
  const [novaVariavelDescricao, setNovaVariavelDescricao] = useState("");
  const [alvoVariavelFluxo, setAlvoVariavelFluxo] =
    useState<AlvoVariavelFluxo>("mensagem");

  const carregarVariaveisPersonalizadas = useCallback(
    async (options: { erroNoModal?: boolean } = {}) => {
      try {
        setLoadingVariaveis(true);

        const res = await fetch("/api/variaveis", {
          cache: "no-store",
        });

        const json = await res.json();

        if (!res.ok || !json.ok) {
          throw new Error(json.error || "Erro ao carregar variaveis.");
        }

        setVariaveisPersonalizadas(
          Array.isArray(json.variaveis) ? json.variaveis : []
        );
      } catch (error: unknown) {
        const mensagem =
          error instanceof Error
            ? error.message
            : "Erro ao carregar variaveis.";

        if (options.erroNoModal) {
          setErroVariavelModal(mensagem);
        } else {
          onError(mensagem);
        }
      } finally {
        setLoadingVariaveis(false);
      }
    },
    [onError]
  );

  const abrirModalGerenciarVariaveis = useCallback(
    async (alvo: AlvoVariavelFluxo = "mensagem") => {
      setAlvoVariavelFluxo(alvo);
      setNovaVariavelChave("");
      setNovaVariavelValor("");
      setNovaVariavelDescricao("");
      setErroVariavelModal("");
      setModalVariaveisAberto(true);
      await carregarVariaveisPersonalizadas({ erroNoModal: true });
    },
    [carregarVariaveisPersonalizadas]
  );

  const fecharModalGerenciarVariaveis = useCallback(() => {
    setModalVariaveisAberto(false);
    setNovaVariavelChave("");
    setNovaVariavelValor("");
    setNovaVariavelDescricao("");
    setErroVariavelModal("");
  }, []);

  const salvarVariavelPersonalizada = useCallback(async () => {
    try {
      onClearError();
      setErroVariavelModal("");
      onClearSuccess();

      const chave = normalizarEntradaVariavelTemplate(novaVariavelChave);
      const valor = novaVariavelValor.trim();

      if (!chave) {
        setErroVariavelModal("Informe o nome da variavel.");
        return;
      }

      if (!valor) {
        setErroVariavelModal("Informe o valor da variavel.");
        return;
      }

      setSalvandoVariavel(true);

      const res = await fetch("/api/variaveis", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chave,
          valor,
          descricao: novaVariavelDescricao.trim(),
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao salvar variavel.");
      }

      setNovaVariavelChave("");
      setNovaVariavelValor("");
      setNovaVariavelDescricao("");

      onSuccess("Variavel salva com sucesso.");
      await carregarVariaveisPersonalizadas({ erroNoModal: true });
    } catch (error: unknown) {
      setErroVariavelModal(
        error instanceof Error ? error.message : "Erro ao salvar variavel."
      );
    } finally {
      setSalvandoVariavel(false);
    }
  }, [
    carregarVariaveisPersonalizadas,
    novaVariavelChave,
    novaVariavelDescricao,
    novaVariavelValor,
    onClearError,
    onClearSuccess,
    onSuccess,
  ]);

  const removerVariavelPersonalizada = useCallback(
    async (id: string) => {
      try {
        onClearError();
        setErroVariavelModal("");
        onClearSuccess();

        const res = await fetch("/api/variaveis", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ id }),
        });

        const json = await res.json();

        if (!res.ok || !json.ok) {
          throw new Error(json.error || "Erro ao remover variavel.");
        }

        onSuccess("Variavel removida com sucesso.");
        await carregarVariaveisPersonalizadas({ erroNoModal: true });
      } catch (error: unknown) {
        setErroVariavelModal(
          error instanceof Error ? error.message : "Erro ao remover variavel."
        );
      }
    },
    [
      carregarVariaveisPersonalizadas,
      onClearError,
      onClearSuccess,
      onSuccess,
    ]
  );

  const aplicarVariavelNoBloco = useCallback(
    (chave: string) => {
      const valor = normalizarEntradaVariavelTemplate(chave);

      if (!valor) return;

      if (alvoVariavelFluxo === "agendar_disparo") {
        onAplicarAgendarDisparo(valor);
        return;
      }

      if (alvoVariavelFluxo === "agenda_lembrete") {
        onAplicarAgendaLembrete(valor);
        return;
      }

      onAplicarMensagemToken(`{{${valor}}}`);
    },
    [
      alvoVariavelFluxo,
      onAplicarAgendaLembrete,
      onAplicarAgendarDisparo,
      onAplicarMensagemToken,
    ]
  );

  return {
    modalVariaveisAberto,
    variaveisPersonalizadas,
    loadingVariaveis,
    salvandoVariavel,
    erroVariavelModal,
    novaVariavelChave,
    setNovaVariavelChave,
    novaVariavelValor,
    setNovaVariavelValor,
    novaVariavelDescricao,
    setNovaVariavelDescricao,
    carregarVariaveisPersonalizadas,
    abrirModalGerenciarVariaveis,
    fecharModalGerenciarVariaveis,
    salvarVariavelPersonalizada,
    removerVariavelPersonalizada,
    aplicarVariavelNoBloco,
  };
}
