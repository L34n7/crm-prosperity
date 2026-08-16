"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./MapaClinicoTab.module.css";

type DenteRegistro = {
  id: string;
  dente: string;
  status: string;
  procedimento: string | null;
  observacoes: string | null;
};

type FormDente = {
  status: string;
  procedimento: string;
  observacoes: string;
};

type OdontogramaTabProps = {
  pacienteId: string;
  podeEditar: boolean;
  onFeedback?: (mensagem: string) => void;
};

const DENTES_PADRAO = [
  "18", "17", "16", "15", "14", "13", "12", "11",
  "21", "22", "23", "24", "25", "26", "27", "28",
  "48", "47", "46", "45", "44", "43", "42", "41",
  "31", "32", "33", "34", "35", "36", "37", "38",
];

const STATUS_LABELS: Record<string, string> = {
  saudavel: "Saudável",
  atencao: "Atenção",
  carie: "Cárie",
  restauracao: "Restauração",
  canal: "Canal",
  extraido: "Extraído",
  implante: "Implante",
  planejado: "Planejado",
  realizado: "Realizado",
};

const FORM_INICIAL: FormDente = {
  status: "saudavel",
  procedimento: "",
  observacoes: "",
};

export default function OdontogramaTab({
  pacienteId,
  podeEditar,
  onFeedback,
}: OdontogramaTabProps) {
  const [dentes, setDentes] = useState<DenteRegistro[]>([]);
  const [denteSelecionado, setDenteSelecionado] = useState("11");
  const [form, setForm] = useState<FormDente>(FORM_INICIAL);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const dentesPorNumero = useMemo(
    () => new Map(dentes.map((dente) => [dente.dente, dente])),
    [dentes],
  );

  const carregar = useCallback(async () => {
    if (!pacienteId) return;

    setCarregando(true);
    setErro("");

    try {
      const params = new URLSearchParams({ paciente_id: pacienteId });
      const response = await fetch(`/api/odontograma?${params.toString()}`, {
        cache: "no-store",
      });
      const data = await response.json();

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Erro ao carregar odontograma.");
      }

      setDentes(data.dentes ?? []);
    } catch (error) {
      setErro(
        error instanceof Error
          ? error.message
          : "Erro ao carregar odontograma.",
      );
    } finally {
      setCarregando(false);
    }
  }, [pacienteId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    const registro = dentesPorNumero.get(denteSelecionado);

    setForm({
      status: registro?.status ?? "saudavel",
      procedimento: registro?.procedimento ?? "",
      observacoes: registro?.observacoes ?? "",
    });
  }, [denteSelecionado, dentesPorNumero]);

  async function salvarDente() {
    if (!podeEditar) return;

    setSalvando(true);
    setErro("");

    try {
      const response = await fetch("/api/odontograma", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paciente_id: pacienteId,
          dente: denteSelecionado,
          ...form,
        }),
      });
      const data = await response.json();

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Erro ao salvar odontograma.");
      }

      onFeedback?.(data.message || "Odontograma atualizado.");
      await carregar();
    } catch (error) {
      setErro(
        error instanceof Error ? error.message : "Erro ao salvar odontograma.",
      );
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) {
    return <div className={styles.loading}>Carregando odontograma...</div>;
  }

  return (
    <div className={styles.wrapper}>
      {erro ? <div className={styles.error}>{erro}</div> : null}

      <div className={styles.mapPanel}>
        <div className={styles.mapPanelHeader}>
          <strong>Mapa odontológico</strong>
          <span>Selecione um dente para consultar ou atualizar o registro.</span>
        </div>

        <div className={styles.toothGrid}>
          {DENTES_PADRAO.map((dente) => {
            const registro = dentesPorNumero.get(dente);
            const status = registro?.status ?? "saudavel";

            return (
              <button
                key={dente}
                type="button"
                className={`${styles.mapButton} ${
                  dente === denteSelecionado ? styles.mapButtonActive : ""
                }`}
                onClick={() => setDenteSelecionado(dente)}
              >
                <strong>{dente}</strong>
                <small>{STATUS_LABELS[status] ?? status}</small>
              </button>
            );
          })}
        </div>
      </div>

      <div className={styles.formCard}>
        <div className={styles.formHeader}>
          <div>
            <span className={styles.eyebrow}>Dente {denteSelecionado}</span>
            <h3>
              {dentesPorNumero.has(denteSelecionado)
                ? "Registro odontológico"
                : "Novo registro odontológico"}
            </h3>
          </div>
          <span className={styles.statusBadge}>
            {STATUS_LABELS[form.status] ?? form.status}
          </span>
        </div>

        <div className={styles.formGrid}>
          <label className={styles.field}>
            <span>Status</span>
            <select
              value={form.status}
              disabled={!podeEditar}
              onChange={(event) =>
                setForm((atual) => ({ ...atual, status: event.target.value }))
              }
            >
              {Object.entries(STATUS_LABELS).map(([valor, label]) => (
                <option key={valor} value={valor}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span>Procedimento</span>
            <input
              value={form.procedimento}
              disabled={!podeEditar}
              onChange={(event) =>
                setForm((atual) => ({
                  ...atual,
                  procedimento: event.target.value,
                }))
              }
              placeholder="Ex.: restauração, canal, extração"
            />
          </label>

          <label className={`${styles.field} ${styles.fullField}`}>
            <span>Observações</span>
            <textarea
              value={form.observacoes}
              disabled={!podeEditar}
              onChange={(event) =>
                setForm((atual) => ({
                  ...atual,
                  observacoes: event.target.value,
                }))
              }
              placeholder="Registre informações clínicas deste dente."
            />
          </label>
        </div>

        {podeEditar ? (
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => void salvarDente()}
              disabled={salvando}
            >
              {salvando ? "Salvando..." : "Salvar odontograma"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
