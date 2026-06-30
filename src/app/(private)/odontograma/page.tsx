"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import FeedbackToast from "@/components/FeedbackToast";
import { useHeaderUser } from "@/components/header-user-context";
import styles from "./odontograma.module.css";

type PacienteLista = {
  id: string;
  pessoa_id: string;
  numero_prontuario: string | null;
  convenio: string | null;
  pessoa: {
    id: string;
    nome: string;
    cpf_cnpj: string | null;
    email: string | null;
  } | null;
};

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

const DENTES_PADRAO = [
  "18",
  "17",
  "16",
  "15",
  "14",
  "13",
  "12",
  "11",
  "21",
  "22",
  "23",
  "24",
  "25",
  "26",
  "27",
  "28",
  "48",
  "47",
  "46",
  "45",
  "44",
  "43",
  "42",
  "41",
  "31",
  "32",
  "33",
  "34",
  "35",
  "36",
  "37",
  "38",
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

export default function OdontogramaPage() {
  const { permissoes } = useHeaderUser();
  const [pacientes, setPacientes] = useState<PacienteLista[]>([]);
  const [selecionadoId, setSelecionadoId] = useState("");
  const [dentes, setDentes] = useState<DenteRegistro[]>([]);
  const [denteSelecionado, setDenteSelecionado] = useState("11");
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [form, setForm] = useState<FormDente>(FORM_INICIAL);

  const podeEditar = permissoes.includes("odontograma.editar");
  const pacienteSelecionado = useMemo(
    () => pacientes.find((paciente) => paciente.id === selecionadoId) ?? null,
    [pacientes, selecionadoId]
  );
  const dentesPorNumero = useMemo(
    () => new Map(dentes.map((dente) => [dente.dente, dente])),
    [dentes]
  );
  const registroSelecionado = dentesPorNumero.get(denteSelecionado) ?? null;

  const carregar = useCallback(
    async (pacienteId = selecionadoId) => {
      setCarregando(true);
      setErro("");

      try {
        const params = new URLSearchParams();

        if (buscaAplicada) params.set("busca", buscaAplicada);
        if (pacienteId) params.set("paciente_id", pacienteId);

        const response = await fetch(`/api/odontograma?${params}`, {
          cache: "no-store",
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.error || "Erro ao carregar odontograma.");
        }

        setPacientes(data.pacientes ?? []);
        setDentes(data.dentes ?? []);

        const novoSelecionado = data.selecionado?.id ?? "";
        if (novoSelecionado && novoSelecionado !== selecionadoId) {
          setSelecionadoId(novoSelecionado);
        }
      } catch (error) {
        setErro(
          error instanceof Error
            ? error.message
            : "Erro ao carregar odontograma."
        );
      } finally {
        setCarregando(false);
      }
    },
    [buscaAplicada, selecionadoId]
  );

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
    if (!pacienteSelecionado) {
      setErro("Selecione um paciente.");
      return;
    }

    setSalvando(true);
    setErro("");

    try {
      const response = await fetch("/api/odontograma", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paciente_id: pacienteSelecionado.id,
          dente: denteSelecionado,
          ...form,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Erro ao salvar odontograma.");
      }

      setMensagem(data.message || "Odontograma atualizado.");
      await carregar(pacienteSelecionado.id);
    } catch (error) {
      setErro(
        error instanceof Error ? error.message : "Erro ao salvar odontograma."
      );
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
      <Header
        title="Odontograma"
        subtitle="Mapa odontológico do paciente, com status e observações por dente."
      />

      <main className={styles.page}>
        <section className={styles.toolbar}>
          <div className={styles.searchArea}>
            <input
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  setSelecionadoId("");
                  setBuscaAplicada(busca.trim());
                }
              }}
              placeholder="Buscar paciente por nome, documento ou email"
            />
            <button
              type="button"
              onClick={() => {
                setSelecionadoId("");
                setBuscaAplicada(busca.trim());
              }}
            >
              Buscar
            </button>
          </div>

          <Link href="/cadastros" className={styles.secondaryButton}>
            Cadastrar paciente
          </Link>
        </section>

        {erro ? <div className={styles.error}>{erro}</div> : null}

        <section className={styles.moduleGrid}>
          <aside className={styles.sideCard}>
            <div className={styles.cardHeader}>
              <div>
                <span className={styles.eyebrow}>Pacientes</span>
                <h2>Selecione o paciente</h2>
                <p>O odontograma fica ligado ao paciente cadastrado.</p>
              </div>
            </div>

            <div className={styles.list}>
              {carregando ? (
                <div className={styles.empty}>Carregando pacientes...</div>
              ) : pacientes.length === 0 ? (
                <div className={styles.empty}>
                  Nenhum paciente encontrado. Cadastre primeiro em Pacientes.
                </div>
              ) : (
                pacientes.map((paciente) => (
                  <button
                    key={paciente.id}
                    type="button"
                    className={`${styles.listItem} ${
                      paciente.id === selecionadoId ? styles.listItemActive : ""
                    }`}
                    onClick={() => {
                      setSelecionadoId(paciente.id);
                      void carregar(paciente.id);
                    }}
                  >
                    <strong>{paciente.pessoa?.nome ?? "Paciente"}</strong>
                    <span>
                      {paciente.numero_prontuario || "Sem número de prontuário"}
                    </span>
                    {paciente.convenio ? <small>{paciente.convenio}</small> : null}
                  </button>
                ))
              )}
            </div>
          </aside>

          <div className={styles.contentCard}>
            <div className={styles.cardHeader}>
              <div>
                <span className={styles.eyebrow}>Mapa odontológico</span>
                <h2>
                  {pacienteSelecionado?.pessoa?.nome ??
                    "Nenhum paciente selecionado"}
                </h2>
                <p>Escolha um dente para registrar a situação clínica.</p>
              </div>
              {pacienteSelecionado?.numero_prontuario ? (
                <span className={styles.badge}>
                  {pacienteSelecionado.numero_prontuario}
                </span>
              ) : null}
            </div>

            {!pacienteSelecionado && !carregando ? (
              <div className={styles.empty}>
                Selecione um paciente para visualizar o odontograma.
              </div>
            ) : (
              <div className={styles.toothGrid}>
                {DENTES_PADRAO.map((dente) => {
                  const registro = dentesPorNumero.get(dente);
                  const status = registro?.status ?? "saudavel";

                  return (
                    <button
                      key={dente}
                      type="button"
                      className={`${styles.toothButton} ${
                        dente === denteSelecionado
                          ? styles.toothButtonActive
                          : ""
                      }`}
                      onClick={() => setDenteSelecionado(dente)}
                    >
                      <span className={styles.toothNumber}>{dente}</span>
                      <span className={styles.toothStatus}>
                        {STATUS_LABELS[status] ?? status}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {pacienteSelecionado ? (
              <div className={styles.formCard}>
                <div className={styles.cardHeader}>
                  <div>
                    <span className={styles.eyebrow}>Dente {denteSelecionado}</span>
                    <h3>
                      {registroSelecionado
                        ? "Atualizar registro"
                        : "Novo registro"}
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
                      onChange={(event) =>
                        setForm((atual) => ({
                          ...atual,
                          status: event.target.value,
                        }))
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
                      onChange={(event) =>
                        setForm((atual) => ({
                          ...atual,
                          observacoes: event.target.value,
                        }))
                      }
                    />
                  </label>
                </div>

                {podeEditar ? (
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={() => void salvarDente()}
                    disabled={salvando}
                  >
                    {salvando ? "Salvando..." : "Salvar dente"}
                  </button>
                ) : (
                  <p className={styles.muted}>
                    Seu usuário pode visualizar, mas não editar o odontograma.
                  </p>
                )}
              </div>
            ) : null}
          </div>
        </section>
      </main>

      {mensagem ? (
        <FeedbackToast
          success={mensagem}
          onSuccessDismiss={() => setMensagem("")}
        />
      ) : null}
    </>
  );
}
