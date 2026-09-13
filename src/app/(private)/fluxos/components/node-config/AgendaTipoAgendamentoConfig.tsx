"use client";

import { useContext, useEffect, useState } from "react";
import {
  atualizarDraftTipoAgendamento,
  definirDraftTipoAgendamento,
  limparDraftTipoAgendamento,
} from "../../agenda-tipo-draft";
import { PropertiesPanelNodeContext } from "../PropertiesPanel";
import styles from "../../fluxos.module.css";

type TipoAgendamentoOpcao = {
  id: string;
  nome: string;
  cor?: string | null;
  padrao?: boolean | null;
};

export default function AgendaTipoAgendamentoConfig() {
  const nodeEditado = useContext(PropertiesPanelNodeContext);
  const noId = nodeEditado?.id || "";
  const configuracao =
    (nodeEditado?.data?.configuracao_json || {}) as Record<string, unknown>;
  const [tipoId, setTipoId] = useState("");
  const [tipos, setTipos] = useState<TipoAgendamentoOpcao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (!noId) return;

    let ativo = true;
    const tipoIdInicial = String(configuracao.tipo_id || "").trim();

    setTipoId(tipoIdInicial);
    definirDraftTipoAgendamento(noId, tipoIdInicial || null);

    async function carregarTipos() {
      try {
        setCarregando(true);
        setErro("");

        const resposta = await fetch("/api/agendas/tipos/opcoes", {
          cache: "no-store",
        });
        const json = await resposta.json();

        if (!resposta.ok || !json?.ok) {
          throw new Error(
            json?.error || "Erro ao carregar tipos de agendamento."
          );
        }

        if (ativo) {
          setTipos(Array.isArray(json.tipos) ? json.tipos : []);
        }
      } catch (error) {
        if (ativo) {
          setErro(
            error instanceof Error
              ? error.message
              : "Erro ao carregar tipos de agendamento."
          );
        }
      } finally {
        if (ativo) setCarregando(false);
      }
    }

    void carregarTipos();

    return () => {
      ativo = false;
      limparDraftTipoAgendamento(noId);
    };
    // O ID do bloco identifica uma nova sessão de edição. A configuração
    // seguinte é sincronizada pelos handlers sem reinicializar o seletor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noId]);

  const tipoAtualDisponivel =
    !tipoId || tipos.some((tipo) => tipo.id === tipoId);

  function alterarTipo(valor: string) {
    const proximoTipoId = String(valor || "").trim();
    setTipoId(proximoTipoId);
    atualizarDraftTipoAgendamento(noId, proximoTipoId || null);
  }

  return (
    <label className={styles.field}>
      <span className={styles.label}>Tipo do agendamento</span>
      <select
        className={styles.input}
        value={tipoId}
        disabled={carregando}
        onChange={(event) => alterarTipo(event.target.value)}
      >
        <option value="">
          {carregando ? "Carregando tipos..." : "Sem tipo específico"}
        </option>
        {!tipoAtualDisponivel && tipoId && (
          <option value={tipoId}>Tipo atual indisponível</option>
        )}
        {tipos.map((tipo) => (
          <option key={tipo.id} value={tipo.id}>
            {tipo.nome} · {tipo.padrao ? "Fixo" : "Personalizado"}
          </option>
        ))}
      </select>
      <span className={styles.help}>
        Define o tipo aplicado ao novo agendamento criado por este bloco. A
        seleção é opcional e não altera fluxos antigos sem tipo configurado.
      </span>
      {erro && (
        <span
          className={styles.help}
          style={{ color: "var(--crm-ui-private-content-hex-dc2626)" }}
        >
          {erro}
        </span>
      )}
    </label>
  );
}
