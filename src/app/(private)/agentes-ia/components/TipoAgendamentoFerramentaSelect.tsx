"use client";

import { useEffect, useState } from "react";
import styles from "../page.module.css";

type TipoAgendamento = {
  id: string;
  nome: string;
  cor?: string | null;
  padrao?: boolean | null;
};

type Props = {
  value: string;
  onChange: (tipoId: string | null) => void;
};

export default function TipoAgendamentoFerramentaSelect({ value, onChange }: Props) {
  const [tipos, setTipos] = useState<TipoAgendamento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let ativo = true;

    async function carregar() {
      try {
        setCarregando(true);
        setErro("");
        const resposta = await fetch("/api/agentes-ia/tipos-agendamento", {
          cache: "no-store",
        });
        const json = await resposta.json();
        if (!resposta.ok || !json?.ok) {
          throw new Error(json?.error || "Erro ao carregar tipos de agendamento.");
        }
        if (ativo) setTipos(Array.isArray(json.tipos) ? json.tipos : []);
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

    void carregar();
    return () => {
      ativo = false;
    };
  }, []);

  return (
    <div>
      <select
        className={styles.inlineSelect}
        value={value}
        disabled={carregando}
        onChange={(event) => onChange(event.target.value || null)}
        aria-label="Tipo do agendamento criado pelo agente"
      >
        <option value="">
          {carregando ? "Carregando tipos..." : "Sem tipo específico"}
        </option>
        {tipos.map((tipo) => (
          <option key={tipo.id} value={tipo.id}>
            {tipo.nome} · {tipo.padrao ? "Fixo" : "Personalizado"}
          </option>
        ))}
      </select>
      {erro && (
        <small className={styles.fieldHint} style={{ color: "var(--crm-danger-text)" }}>
          {erro}
        </small>
      )}
    </div>
  );
}
