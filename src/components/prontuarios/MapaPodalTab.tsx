"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./MapaClinicoTab.module.css";

type Lado = "esquerdo" | "direito";

type RegistroPodal = {
  id: string;
  lado: Lado;
  regiao: string;
  status: string;
  procedimento: string | null;
  observacoes: string | null;
};

type FormRegiao = {
  status: string;
  procedimento: string;
  observacoes: string;
};

type MapaPodalTabProps = {
  pacienteId: string;
  podeEditar: boolean;
  onFeedback?: (mensagem: string) => void;
};

const REGIOES = [
  { codigo: "halux", label: "Hálux" },
  { codigo: "outros_dedos", label: "Outros dedos" },
  { codigo: "antepe", label: "Antepé" },
  { codigo: "mediape", label: "Mediopé" },
  { codigo: "calcanhar", label: "Calcanhar" },
] as const;

const STATUS_LABELS: Record<string, string> = {
  sem_alteracao: "Sem alteração",
  atencao: "Atenção",
  calosidade: "Calosidade",
  fissura: "Fissura",
  lesao: "Lesão",
  inflamacao: "Inflamação",
  infeccao: "Infecção",
  tratamento: "Em tratamento",
};

const FORM_INICIAL: FormRegiao = {
  status: "sem_alteracao",
  procedimento: "",
  observacoes: "",
};

function chaveRegiao(lado: Lado, regiao: string) {
  return `${lado}:${regiao}`;
}

export default function MapaPodalTab({
  pacienteId,
  podeEditar,
  onFeedback,
}: MapaPodalTabProps) {
  const [registros, setRegistros] = useState<RegistroPodal[]>([]);
  const [ladoSelecionado, setLadoSelecionado] = useState<Lado>("direito");
  const [regiaoSelecionada, setRegiaoSelecionada] = useState("halux");
  const [form, setForm] = useState<FormRegiao>(FORM_INICIAL);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const registrosPorRegiao = useMemo(
    () =>
      new Map(
        registros.map((registro) => [
          chaveRegiao(registro.lado, registro.regiao),
          registro,
        ]),
      ),
    [registros],
  );

  const registroSelecionado = registrosPorRegiao.get(
    chaveRegiao(ladoSelecionado, regiaoSelecionada),
  );

  const carregar = useCallback(async () => {
    if (!pacienteId) return;

    setCarregando(true);
    setErro("");

    try {
      const params = new URLSearchParams({ paciente_id: pacienteId });
      const response = await fetch(`/api/mapa-podal?${params.toString()}`, {
        cache: "no-store",
      });
      const data = await response.json();

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Erro ao carregar mapa podal.");
      }

      setRegistros(data.registros ?? []);
    } catch (error) {
      setErro(
        error instanceof Error ? error.message : "Erro ao carregar mapa podal.",
      );
    } finally {
      setCarregando(false);
    }
  }, [pacienteId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    setForm({
      status: registroSelecionado?.status ?? "sem_alteracao",
      procedimento: registroSelecionado?.procedimento ?? "",
      observacoes: registroSelecionado?.observacoes ?? "",
    });
  }, [registroSelecionado]);

  async function salvarRegiao() {
    if (!podeEditar) return;

    setSalvando(true);
    setErro("");

    try {
      const response = await fetch("/api/mapa-podal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paciente_id: pacienteId,
          lado: ladoSelecionado,
          regiao: regiaoSelecionada,
          ...form,
        }),
      });
      const data = await response.json();

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Erro ao salvar mapa podal.");
      }

      onFeedback?.(data.message || "Mapa podal atualizado.");
      await carregar();
    } catch (error) {
      setErro(
        error instanceof Error ? error.message : "Erro ao salvar mapa podal.",
      );
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) {
    return <div className={styles.loading}>Carregando mapa podal...</div>;
  }

  return (
    <div className={styles.wrapper}>
      {erro ? <div className={styles.error}>{erro}</div> : null}

      <div className={styles.mapGrid}>
        {(["esquerdo", "direito"] as const).map((lado) => (
          <section key={lado} className={styles.mapPanel}>
            <div className={styles.mapPanelHeader}>
              <strong>Pé {lado === "esquerdo" ? "esquerdo" : "direito"}</strong>
              <span>Selecione a região clínica.</span>
            </div>

            <div className={styles.regionGrid}>
              {REGIOES.map((regiao) => {
                const registro = registrosPorRegiao.get(
                  chaveRegiao(lado, regiao.codigo),
                );
                const ativo =
                  lado === ladoSelecionado && regiao.codigo === regiaoSelecionada;

                return (
                  <button
                    key={regiao.codigo}
                    type="button"
                    className={`${styles.mapButton} ${
                      ativo ? styles.mapButtonActive : ""
                    }`}
                    onClick={() => {
                      setLadoSelecionado(lado);
                      setRegiaoSelecionada(regiao.codigo);
                    }}
                  >
                    <strong>{regiao.label}</strong>
                    <small>
                      {STATUS_LABELS[registro?.status ?? "sem_alteracao"] ??
                        registro?.status}
                    </small>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <div className={styles.formCard}>
        <div className={styles.formHeader}>
          <div>
            <span className={styles.eyebrow}>
              Pé {ladoSelecionado} · {REGIOES.find((item) => item.codigo === regiaoSelecionada)?.label}
            </span>
            <h3>
              {registroSelecionado
                ? "Registro da região"
                : "Novo registro podológico"}
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
              placeholder="Ex.: desbaste, órtese, cuidado local"
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
              placeholder="Registre achados, evolução e orientações desta região."
            />
          </label>
        </div>

        {podeEditar ? (
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => void salvarRegiao()}
              disabled={salvando}
            >
              {salvando ? "Salvando..." : "Salvar mapa podal"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
