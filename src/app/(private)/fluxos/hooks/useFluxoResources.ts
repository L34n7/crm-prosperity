"use client";

import { useCallback, useState } from "react";
import type {
  AgendaOpcao,
  AtendenteOpcao,
  IntegracaoWhatsappOpcao,
  SetorOpcao,
  TemplateWhatsappOpcao,
} from "../types";

type UseFluxoResourcesOptions = {
  onError: (mensagem: string) => void;
};

function templateWhatsappAprovado(template?: TemplateWhatsappOpcao | null) {
  return String(template?.status || "").trim().toUpperCase() === "APPROVED";
}

export default function useFluxoResources({
  onError,
}: UseFluxoResourcesOptions) {
  const [templatesWhatsapp, setTemplatesWhatsapp] = useState<
    TemplateWhatsappOpcao[]
  >([]);
  const [carregandoTemplatesWhatsapp, setCarregandoTemplatesWhatsapp] =
    useState(false);

  const [integracoesWhatsapp, setIntegracoesWhatsapp] = useState<
    IntegracaoWhatsappOpcao[]
  >([]);
  const [limiteIntegracoesWhatsappFluxos, setLimiteIntegracoesWhatsappFluxos] =
    useState(1);
  const [carregandoIntegracoesWhatsapp, setCarregandoIntegracoesWhatsapp] =
    useState(false);

  const [agendasOpcoes, setAgendasOpcoes] = useState<AgendaOpcao[]>([]);
  const [carregandoAgendasOpcoes, setCarregandoAgendasOpcoes] = useState(false);

  const [setores, setSetores] = useState<SetorOpcao[]>([]);
  const [atendentes, setAtendentes] = useState<AtendenteOpcao[]>([]);
  const [carregandoSetores, setCarregandoSetores] = useState(false);

  const carregarTemplatesWhatsapp = useCallback(async () => {
    try {
      setCarregandoTemplatesWhatsapp(true);

      const res = await fetch("/api/whatsapp/templates?status=APPROVED", {
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao carregar templates.");
      }

      const templatesRecebidos = Array.isArray(json.templates)
        ? json.templates
        : Array.isArray(json.data)
        ? json.data
        : [];

      setTemplatesWhatsapp(
        templatesRecebidos.filter((template: TemplateWhatsappOpcao) =>
          templateWhatsappAprovado(template)
        )
      );
    } catch (error: unknown) {
      onError(
        error instanceof Error
          ? error.message
          : "Erro ao carregar templates."
      );
    } finally {
      setCarregandoTemplatesWhatsapp(false);
    }
  }, [onError]);

  const carregarIntegracoesWhatsapp = useCallback(async () => {
    try {
      setCarregandoIntegracoesWhatsapp(true);

      const res = await fetch("/api/integracoes-whatsapp/listar", {
        cache: "no-store",
      });
      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao carregar integrações WhatsApp.");
      }

      const lista = Array.isArray(json.data)
        ? json.data
        : Array.isArray(json.integracoes)
        ? json.integracoes
        : [];

      setIntegracoesWhatsapp(lista);
      setLimiteIntegracoesWhatsappFluxos(
        Math.max(1, Number(json.limite_integracoes_whatsapp || 1))
      );
    } catch (error: unknown) {
      onError(
        error instanceof Error
          ? error.message
          : "Erro ao carregar integrações WhatsApp."
      );
    } finally {
      setCarregandoIntegracoesWhatsapp(false);
    }
  }, [onError]);

  const carregarAgendasOpcoes = useCallback(async () => {
    try {
      setCarregandoAgendasOpcoes(true);

      const res = await fetch("/api/agendas/opcoes", {
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao carregar agendas.");
      }

      setAgendasOpcoes(json.agendas || []);
    } catch (error: unknown) {
      onError(
        error instanceof Error ? error.message : "Erro ao carregar agendas."
      );
    } finally {
      setCarregandoAgendasOpcoes(false);
    }
  }, [onError]);

  const carregarSetores = useCallback(async () => {
    try {
      setCarregandoSetores(true);

      const res = await fetch("/api/setores/opcoes", {
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao carregar setores.");
      }

      setSetores(json.setores || []);
      setAtendentes(json.atendentes || []);
    } catch (error: unknown) {
      onError(
        error instanceof Error ? error.message : "Erro ao carregar setores."
      );
    } finally {
      setCarregandoSetores(false);
    }
  }, [onError]);

  return {
    templatesWhatsapp,
    carregandoTemplatesWhatsapp,
    carregarTemplatesWhatsapp,
    integracoesWhatsapp,
    limiteIntegracoesWhatsappFluxos,
    carregandoIntegracoesWhatsapp,
    carregarIntegracoesWhatsapp,
    agendasOpcoes,
    carregandoAgendasOpcoes,
    carregarAgendasOpcoes,
    setores,
    atendentes,
    carregandoSetores,
    carregarSetores,
  };
}
