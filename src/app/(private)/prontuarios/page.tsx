"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import FeedbackToast from "@/components/FeedbackToast";
import { useHeaderUser } from "@/components/header-user-context";
import styles from "./prontuarios.module.css";

type PacienteLista = {
  id: string;
  pessoa_id: string;
  numero_prontuario: string | null;
  convenio: string | null;
  responsavel_nome: string | null;
  pessoa: {
    id: string;
    nome: string;
    cpf_cnpj: string | null;
    email: string | null;
    data_nascimento: string | null;
  } | null;
};

type Atendimento = {
  id: string;
  data_atendimento: string;
  tipo: string;
  queixa_principal: string | null;
  anamnese: string | null;
  diagnostico: string | null;
  conduta: string | null;
  prescricao: string | null;
  observacoes: string | null;
};

type FormAtendimento = {
  data_atendimento: string;
  tipo: string;
  queixa_principal: string;
  anamnese: string;
  diagnostico: string;
  conduta: string;
  prescricao: string;
  observacoes: string;
};

function dataHoraLocalInicial() {
  const data = new Date();
  data.setMinutes(data.getMinutes() - data.getTimezoneOffset());
  return data.toISOString().slice(0, 16);
}

const FORM_INICIAL: FormAtendimento = {
  data_atendimento: dataHoraLocalInicial(),
  tipo: "consulta",
  queixa_principal: "",
  anamnese: "",
  diagnostico: "",
  conduta: "",
  prescricao: "",
  observacoes: "",
};

function formatarData(valor: string) {
  const data = new Date(valor);

  if (Number.isNaN(data.getTime())) return "Data não informada";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(data);
}

function labelTipo(tipo: string) {
  const labels: Record<string, string> = {
    consulta: "Consulta",
    retorno: "Retorno",
    procedimento: "Procedimento",
    avaliacao: "Avaliação",
    emergencia: "Emergência",
  };

  return labels[tipo] ?? tipo;
}

export default function ProntuariosPage() {
  const { permissoes } = useHeaderUser();
  const [pacientes, setPacientes] = useState<PacienteLista[]>([]);
  const [selecionadoId, setSelecionadoId] = useState("");
  const [atendimentos, setAtendimentos] = useState<Atendimento[]>([]);
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [form, setForm] = useState<FormAtendimento>(FORM_INICIAL);

  const podeCriar = permissoes.includes("prontuarios.criar");
  const pacienteSelecionado = useMemo(
    () => pacientes.find((paciente) => paciente.id === selecionadoId) ?? null,
    [pacientes, selecionadoId]
  );

  const carregar = useCallback(
    async (pacienteId = selecionadoId) => {
      setCarregando(true);
      setErro("");

      try {
        const params = new URLSearchParams();

        if (buscaAplicada) params.set("busca", buscaAplicada);
        if (pacienteId) params.set("paciente_id", pacienteId);

        const response = await fetch(`/api/prontuarios?${params}`, {
          cache: "no-store",
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.error || "Erro ao carregar prontuários.");
        }

        setPacientes(data.pacientes ?? []);
        setAtendimentos(data.atendimentos ?? []);

        const novoSelecionado = data.selecionado?.id ?? "";
        if (novoSelecionado && novoSelecionado !== selecionadoId) {
          setSelecionadoId(novoSelecionado);
        }
      } catch (error) {
        setErro(
          error instanceof Error
            ? error.message
            : "Erro ao carregar prontuários."
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

  async function salvarAtendimento() {
    if (!pacienteSelecionado) {
      setErro("Selecione um paciente.");
      return;
    }

    setSalvando(true);
    setErro("");

    try {
      const response = await fetch("/api/prontuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          paciente_id: pacienteSelecionado.id,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Erro ao salvar atendimento.");
      }

      setMensagem(data.message || "Atendimento registrado.");
      setForm({ ...FORM_INICIAL, data_atendimento: dataHoraLocalInicial() });
      await carregar(pacienteSelecionado.id);
    } catch (error) {
      setErro(
        error instanceof Error ? error.message : "Erro ao salvar atendimento."
      );
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
      <Header
        title="Prontuários"
        subtitle="Histórico de atendimentos, anamnese, diagnóstico, conduta e observações clínicas por paciente."
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
                <p>O prontuário sempre fica ligado ao cadastro do paciente.</p>
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
                <span className={styles.eyebrow}>Histórico clínico</span>
                <h2>
                  {pacienteSelecionado?.pessoa?.nome ??
                    "Nenhum paciente selecionado"}
                </h2>
                <p>
                  Cada registro abaixo representa um atendimento/evolução no
                  prontuário.
                </p>
              </div>

              {pacienteSelecionado?.numero_prontuario ? (
                <span className={styles.badge}>
                  {pacienteSelecionado.numero_prontuario}
                </span>
              ) : null}
            </div>

            {pacienteSelecionado && podeCriar ? (
              <div className={styles.formCard}>
                <div className={styles.cardHeader}>
                  <div>
                    <span className={styles.eyebrow}>Novo atendimento</span>
                    <h3>Registrar evolução</h3>
                  </div>
                </div>

                <div className={styles.formGrid}>
                  <label className={styles.field}>
                    <span>Data e hora</span>
                    <input
                      type="datetime-local"
                      value={form.data_atendimento}
                      onChange={(event) =>
                        setForm((atual) => ({
                          ...atual,
                          data_atendimento: event.target.value,
                        }))
                      }
                    />
                  </label>

                  <label className={styles.field}>
                    <span>Tipo</span>
                    <select
                      value={form.tipo}
                      onChange={(event) =>
                        setForm((atual) => ({
                          ...atual,
                          tipo: event.target.value,
                        }))
                      }
                    >
                      <option value="consulta">Consulta</option>
                      <option value="retorno">Retorno</option>
                      <option value="procedimento">Procedimento</option>
                      <option value="avaliacao">Avaliação</option>
                      <option value="emergencia">Emergência</option>
                    </select>
                  </label>

                  {(
                    [
                      ["queixa_principal", "Queixa principal"],
                      ["anamnese", "Anamnese"],
                      ["diagnostico", "Diagnóstico"],
                      ["conduta", "Conduta / plano"],
                      ["prescricao", "Prescrição"],
                      ["observacoes", "Observações"],
                    ] as Array<[keyof FormAtendimento, string]>
                  ).map(([chave, label]) => (
                    <label
                      key={chave}
                      className={`${styles.field} ${styles.fullField}`}
                    >
                      <span>{label}</span>
                      <textarea
                        value={form[chave]}
                        onChange={(event) =>
                          setForm((atual) => ({
                            ...atual,
                            [chave]: event.target.value,
                          }))
                        }
                      />
                    </label>
                  ))}
                </div>

                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() => void salvarAtendimento()}
                  disabled={salvando}
                >
                  {salvando ? "Salvando..." : "Salvar atendimento"}
                </button>
              </div>
            ) : null}

            <div className={styles.timeline}>
              {carregando ? (
                <div className={styles.empty}>Carregando histórico...</div>
              ) : !pacienteSelecionado ? (
                <div className={styles.empty}>
                  Selecione um paciente para visualizar o prontuário.
                </div>
              ) : atendimentos.length === 0 ? (
                <div className={styles.empty}>
                  Este paciente ainda não possui atendimentos registrados.
                </div>
              ) : (
                atendimentos.map((atendimento) => (
                  <article key={atendimento.id} className={styles.timelineItem}>
                    <div className={styles.timelineHeader}>
                      <div>
                        <h3>{labelTipo(atendimento.tipo)}</h3>
                        <p className={styles.muted}>
                          {formatarData(atendimento.data_atendimento)}
                        </p>
                      </div>
                      <span className={styles.statusBadge}>
                        {atendimento.tipo}
                      </span>
                    </div>

                    <div className={styles.timelineBody}>
                      {(
                        [
                          ["queixa_principal", "Queixa"],
                          ["anamnese", "Anamnese"],
                          ["diagnostico", "Diagnóstico"],
                          ["conduta", "Conduta"],
                          ["prescricao", "Prescrição"],
                          ["observacoes", "Observações"],
                        ] as Array<[keyof Atendimento, string]>
                      ).map(([chave, label]) =>
                        atendimento[chave] ? (
                          <p key={chave}>
                            <strong>{label}:</strong>{" "}
                            {String(atendimento[chave])}
                          </p>
                        ) : null
                      )}
                    </div>
                  </article>
                ))
              )}
            </div>
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
