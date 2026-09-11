"use client";

import { useEffect, useState } from "react";
import {
  FUSOS_HORARIOS_AMERICA_LATINA,
  HORARIO_ATENDIMENTO_PADRAO,
  normalizarHorarioAtendimento,
  type HorarioAtendimentoAgente,
} from "@/lib/agentes-ia/horario-atendimento";

type AgenteResumo = {
  id: string;
  nome: string;
  status: string;
  horarios?: unknown;
};

type RespostaLista = {
  ok: boolean;
  agentes?: AgenteResumo[];
  error?: string;
};

const DIAS = [
  [1, "Seg"], [2, "Ter"], [3, "Qua"], [4, "Qui"],
  [5, "Sex"], [6, "Sáb"], [7, "Dom"],
] as const;

const campo = {
  minHeight: 40,
  borderRadius: 10,
  border: "1px solid var(--crm-border)",
  background: "var(--crm-surface-2)",
  color: "var(--crm-text)",
  padding: "0 12px",
} as const;

export default function HorarioAtendimentoAgentes() {
  const [agentes, setAgentes] = useState<AgenteResumo[]>([]);
  const [agenteId, setAgenteId] = useState("");
  const [horario, setHorario] = useState<HorarioAtendimentoAgente>({
    ...HORARIO_ATENDIMENTO_PADRAO,
    dias: [...HORARIO_ATENDIMENTO_PADRAO.dias],
  });
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/agentes-ia", { cache: "no-store" });
        const json = (await res.json()) as RespostaLista;
        if (!res.ok || !json.ok) throw new Error(json.error || "Erro ao carregar agentes.");
        const lista = json.agentes || [];
        setAgentes(lista);
        if (lista[0]) {
          setAgenteId(lista[0].id);
          setHorario(normalizarHorarioAtendimento(lista[0].horarios));
        }
      } catch (error) {
        setAviso(error instanceof Error ? error.message : "Erro ao carregar horários.");
      } finally {
        setCarregando(false);
      }
    })();
  }, []);

  function selecionarAgente(id: string) {
    setAgenteId(id);
    const agente = agentes.find((item) => item.id === id);
    setHorario(normalizarHorarioAtendimento(agente?.horarios));
    setAviso("");
  }

  function alternarDia(dia: number) {
    setHorario((atual) => ({
      ...atual,
      dias: atual.dias.includes(dia)
        ? atual.dias.filter((item) => item !== dia)
        : [...atual.dias, dia].sort((a, b) => a - b),
    }));
  }

  async function salvar() {
    if (!agenteId) return;
    setSalvando(true);
    setAviso("");
    try {
      const res = await fetch("/api/agentes-ia/horario", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: agenteId, horarios: horario }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Erro ao salvar horário.");
      const normalizado = normalizarHorarioAtendimento(json.agente?.horarios || horario);
      setHorario(normalizado);
      setAgentes((atuais) =>
        atuais.map((item) => item.id === agenteId ? { ...item, horarios: normalizado } : item)
      );
      setAviso("Horário de atendimento salvo.");
    } catch (error) {
      setAviso(error instanceof Error ? error.message : "Erro ao salvar horário.");
    } finally {
      setSalvando(false);
    }
  }

  if (carregando || agentes.length === 0) return null;

  return (
    <section style={{ margin: "0 24px 18px", padding: 18, borderRadius: 16, border: "1px solid var(--crm-border)", background: "var(--crm-surface)" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <strong style={{ fontSize: 16 }}>Horário de atendimento da IA</strong>
          <p style={{ margin: "6px 0 0", color: "var(--crm-text-muted)", fontSize: 13 }}>
            Fora deste horário a mensagem fica agendada para a próxima abertura. Antes de responder, o sistema verifica se a conversa continua sem atendimento.
          </p>
        </div>
        <select value={agenteId} onChange={(event) => selecionarAgente(event.target.value)} style={campo}>
          {agentes.map((agente) => (
            <option key={agente.id} value={agente.id}>
              {agente.nome}{agente.status === "ativo" ? "" : " (inativo)"}
            </option>
          ))}
        </select>
      </div>

      <label style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 16, fontWeight: 600 }}>
        <input
          type="checkbox"
          checked={horario.ativo}
          onChange={(event) => setHorario((atual) => ({ ...atual, ativo: event.target.checked }))}
        />
        Limitar horário de atendimento deste agente
      </label>

      {horario.ativo && (
        <div style={{ display: "grid", gap: 14, marginTop: 14 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {DIAS.map(([dia, label]) => {
              const selecionado = horario.dias.includes(dia);
              return (
                <button
                  key={dia}
                  type="button"
                  onClick={() => alternarDia(dia)}
                  style={{ minWidth: 52, minHeight: 36, borderRadius: 9, border: "1px solid var(--crm-border)", background: selecionado ? "#2563eb" : "var(--crm-surface-2)", color: selecionado ? "#fff" : "var(--crm-text)", cursor: "pointer" }}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
              Início
              <input type="time" value={horario.inicio} onChange={(event) => setHorario((atual) => ({ ...atual, inicio: event.target.value }))} style={campo} />
            </label>
            <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
              Fim
              <input type="time" value={horario.fim} onChange={(event) => setHorario((atual) => ({ ...atual, fim: event.target.value }))} style={campo} />
            </label>
            <label style={{ display: "grid", gap: 6, fontSize: 13, minWidth: 280 }}>
              Fuso horário
              <select
                value={horario.timezone}
                onChange={(event) =>
                  setHorario((atual) => ({ ...atual, timezone: event.target.value }))
                }
                style={campo}
              >
                {FUSOS_HORARIOS_AMERICA_LATINA.map((fuso) => (
                  <option key={fuso.value} value={fuso.value}>
                    {fuso.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 16, flexWrap: "wrap" }}>
        <button type="button" disabled={salvando} onClick={salvar} style={{ minHeight: 40, border: 0, borderRadius: 10, padding: "0 16px", background: "#2563eb", color: "#fff", fontWeight: 700, cursor: salvando ? "wait" : "pointer" }}>
          {salvando ? "Salvando..." : "Salvar horário"}
        </button>
        {aviso && <small style={{ color: "var(--crm-text-muted)" }}>{aviso}</small>}
      </div>
    </section>
  );
}
