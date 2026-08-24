"use client";

import { useCallback, useState } from "react";
import type { Fluxo, GatilhoFluxo } from "../types";

type GatilhoNovoFluxo = {
  valor: string;
  condicao: GatilhoFluxo["condicao"];
  ativo?: boolean;
};

type UseFluxoGatilhosOptions = {
  podeGerenciarGatilhos: boolean;
  onErroEdicao: (message: string) => void;
  onErroCriacao: (message: string) => void;
  onSuccess: (message: string) => void;
};

export default function useFluxoGatilhos({
  podeGerenciarGatilhos,
  onErroEdicao,
  onErroCriacao,
  onSuccess,
}: UseFluxoGatilhosOptions) {
  const [gatilhosFluxo, setGatilhosFluxo] = useState<GatilhoFluxo[]>([]);
  const [novoGatilhoValor, setNovoGatilhoValor] = useState("");
  const [novoGatilhoCondicao, setNovoGatilhoCondicao] =
    useState<GatilhoFluxo["condicao"]>("contem");
  const [gatilhosNovoFluxo, setGatilhosNovoFluxo] = useState<
    GatilhoNovoFluxo[]
  >([]);

  const carregarGatilhosFluxo = useCallback(
    async (fluxoId: string) => {
      try {
        const res = await fetch(`/api/automacoes/${fluxoId}/gatilhos`, {
          cache: "no-store",
        });

        const json = await res.json();

        if (!res.ok || !json.ok) {
          throw new Error(json.error || "Erro ao carregar gatilhos.");
        }

        setGatilhosFluxo(json.gatilhos || []);
      } catch (error: unknown) {
        onErroEdicao(
          error instanceof Error
            ? error.message
            : "Erro ao carregar gatilhos."
        );
      }
    },
    [onErroEdicao]
  );

  const criarGatilhoFluxo = useCallback(
    async (fluxoAlvoEdicao: Fluxo | null) => {
    if (!podeGerenciarGatilhos) {
      onErroEdicao("Você não tem permissão para gerenciar gatilhos.");
      return;
    }

    if (!fluxoAlvoEdicao) return;

    try {
      onErroEdicao("");

      const valor = novoGatilhoValor.trim();

      if (!valor) {
        onErroEdicao("Informe a palavra-chave do gatilho.");
        return;
      }

      const res = await fetch(
        `/api/automacoes/${fluxoAlvoEdicao.id}/gatilhos`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            tipo_gatilho: "palavra_chave",
            valor,
            condicao: novoGatilhoCondicao,
          }),
        }
      );

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao criar gatilho.");
      }

      setNovoGatilhoValor("");
      setNovoGatilhoCondicao("contem");
      onSuccess("Gatilho criado com sucesso.");
      await carregarGatilhosFluxo(fluxoAlvoEdicao.id);
    } catch (error: unknown) {
      onErroEdicao(
        error instanceof Error ? error.message : "Erro ao criar gatilho."
      );
    }
  }, [
    carregarGatilhosFluxo,
    novoGatilhoCondicao,
    novoGatilhoValor,
    onErroEdicao,
    onSuccess,
    podeGerenciarGatilhos,
  ]);

  const removerGatilhoFluxo = useCallback(
    async (
      gatilhoId: string,
      fluxoAlvoEdicao: Fluxo | null
    ) => {
      if (!podeGerenciarGatilhos) {
        onErroEdicao("Você não tem permissão para gerenciar gatilhos.");
        return;
      }

      if (!fluxoAlvoEdicao) return;

      try {
        onErroEdicao("");

        const res = await fetch(
          `/api/automacoes/${fluxoAlvoEdicao.id}/gatilhos`,
          {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              id: gatilhoId,
            }),
          }
        );

        const json = await res.json();

        if (!res.ok || !json.ok) {
          throw new Error(json.error || "Erro ao remover gatilho.");
        }

        onSuccess("Gatilho removido com sucesso.");
        await carregarGatilhosFluxo(fluxoAlvoEdicao.id);
      } catch (error: unknown) {
        onErroEdicao(
          error instanceof Error ? error.message : "Erro ao remover gatilho."
        );
      }
    },
    [
      carregarGatilhosFluxo,
      onErroEdicao,
      onSuccess,
      podeGerenciarGatilhos,
    ]
  );

  const alternarGatilhoFluxo = useCallback(
    async (
      gatilho: GatilhoFluxo,
      fluxoAlvoEdicao: Fluxo | null
    ) => {
      if (!podeGerenciarGatilhos) {
        onErroEdicao("Você não tem permissão para gerenciar gatilhos.");
        return;
      }

      if (!fluxoAlvoEdicao) return;

      try {
        onErroEdicao("");

        const res = await fetch(
          `/api/automacoes/${fluxoAlvoEdicao.id}/gatilhos`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              id: gatilho.id,
              ativo: !gatilho.ativo,
            }),
          }
        );

        const json = await res.json();

        if (!res.ok || !json.ok) {
          throw new Error(json.error || "Erro ao atualizar gatilho.");
        }

        await carregarGatilhosFluxo(fluxoAlvoEdicao.id);
      } catch (error: unknown) {
        onErroEdicao(
          error instanceof Error ? error.message : "Erro ao atualizar gatilho."
        );
      }
    },
    [
      carregarGatilhosFluxo,
      onErroEdicao,
      podeGerenciarGatilhos,
    ]
  );

  const adicionarGatilhoNovoFluxo = useCallback(() => {
    const valor = novoGatilhoValor.trim().toLowerCase();

    if (!valor) {
      onErroCriacao("Informe a palavra-chave do gatilho.");
      return;
    }

    const jaExiste = gatilhosNovoFluxo.some(
      (gatilho) => gatilho.valor === valor
    );

    if (jaExiste) {
      onErroCriacao("Essa palavra-chave já foi adicionada.");
      return;
    }

    onErroCriacao("");
    setGatilhosNovoFluxo((atuais) => [
      ...atuais,
      {
        valor,
        condicao: novoGatilhoCondicao,
        ativo: true,
      },
    ]);

    setNovoGatilhoValor("");
    setNovoGatilhoCondicao("contem");
  }, [
    gatilhosNovoFluxo,
    novoGatilhoCondicao,
    novoGatilhoValor,
    onErroCriacao,
  ]);

  return {
    gatilhosFluxo,
    setGatilhosFluxo,
    novoGatilhoValor,
    setNovoGatilhoValor,
    novoGatilhoCondicao,
    setNovoGatilhoCondicao,
    gatilhosNovoFluxo,
    setGatilhosNovoFluxo,
    carregarGatilhosFluxo,
    criarGatilhoFluxo,
    removerGatilhoFluxo,
    alternarGatilhoFluxo,
    adicionarGatilhoNovoFluxo,
  };
}
