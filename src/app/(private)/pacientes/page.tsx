"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardList, FileText, Search, UserPlus, X } from "lucide-react";
import Header from "@/components/Header";
import FeedbackToast from "@/components/FeedbackToast";
import { useHeaderUser } from "@/components/header-user-context";
import CadastroPacienteModal from "@/components/pacientes/CadastroPacienteModal";
import OdontogramaTab from "@/components/prontuarios/OdontogramaTab";
import PodogramaTab from "@/components/prontuarios/PodogramaTab";
import {
  getNichoConfig,
  isNichoCodigo,
  isProntuarioAbaCodigo,
  type NichoCodigo,
  type ProntuarioAbaCodigo,
} from "@/lib/nichos/config";
import styles from "../prontuarios/prontuarios.module.css";

type PacienteLista = {
  id: string;
  pessoa_id: string;
  numero_prontuario: string | null;
  convenio: string | null;
  responsavel_nome: string | null;
  created_at?: string | null;
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

type CarregarOpcoes = {
  pacienteId?: string;
  buscaTermo?: string;
  abrirModal?: boolean;
};

const ABA_LABELS: Record<ProntuarioAbaCodigo, string> = {
  resumo: "Resumo",
  dados: "Dados do paciente",
  prontuario: "Prontuário",
  atendimento: "Novo atendimento",
  evolucoes: "Evoluções",
  odontograma: "Odontograma",
  podograma: "Podograma",
};

function dataHoraLocalInicial() {
  const data = new Date();
  data.setMinutes(data.getMinutes() - data.getTimezoneOffset());
  return data.toISOString().slice(0, 16);
}

function criarFormInicial(): FormAtendimento {
  return {
    data_atendimento: dataHoraLocalInicial(),
    tipo: "consulta",
    queixa_principal: "",
    anamnese: "",
    diagnostico: "",
    conduta: "",
    prescricao: "",
    observacoes: "",
  };
}

function formatarDataHora(valor: string | null | undefined) {
  if (!valor) return "Não informado";

  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "Não informado";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(data);
}

function formatarData(valor: string | null | undefined) {
  if (!valor) return "Não informado";

  const data = new Date(`${valor}T12:00:00`);
  if (Number.isNaN(data.getTime())) return "Não informado";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
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

function atualizarUrlPaciente(
  pacienteId: string | null,
  aba: ProntuarioAbaCodigo | null,
) {
  if (typeof window === "undefined") return;

  const params = new URLSearchParams(window.location.search);

  if (pacienteId) params.set("paciente_id", pacienteId);
  else params.delete("paciente_id");

  if (pacienteId && aba) params.set("aba", aba);
  else params.delete("aba");

  const query = params.toString();
  const destino = query
    ? `${window.location.pathname}?${query}`
    : window.location.pathname;
  window.history.replaceState(window.history.state, "", destino);
}

export default function PacientesPage() {
  const { permissoes } = useHeaderUser();
  const [pacientes, setPacientes] = useState<PacienteLista[]>([]);
  const [selecionadoId, setSelecionadoId] = useState("");
  const [atendimentos, setAtendimentos] = useState<Atendimento[]>([]);
  const [nichoCodigo, setNichoCodigo] = useState<NichoCodigo>("medicina");
  const [busca, setBusca] = useState("");
  const [carregandoLista, setCarregandoLista] = useState(true);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [modalCadastroAberto, setModalCadastroAberto] = useState(false);
  const [abaAtiva, setAbaAtiva] = useState<ProntuarioAbaCodigo>("resumo");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [form, setForm] = useState<FormAtendimento>(() => criarFormInicial());

  const podeCriarAtendimento = permissoes.includes("prontuarios.criar");
  const podeEditarProntuario = permissoes.includes("prontuarios.editar");
  const podeVisualizarOdontograma = permissoes.includes("odontograma.visualizar");
  const podeEditarOdontograma = permissoes.includes("odontograma.editar");
  const podeCadastrarPaciente = permissoes.includes("pessoas.criar");
  const podeVisualizarPessoas = permissoes.includes("pessoas.visualizar");

  const nichoConfig = useMemo(() => getNichoConfig(nichoCodigo), [nichoCodigo]);
  const pacienteSelecionado = useMemo(
    () => pacientes.find((paciente) => paciente.id === selecionadoId) ?? null,
    [pacientes, selecionadoId],
  );

  const abasDisponiveis = useMemo(() => {
    const abas = nichoConfig.prontuarioAbas ?? ["resumo", "dados", "prontuario", "evolucoes"];

    return abas.filter((aba) => {
      if (aba === "atendimento") return podeCriarAtendimento;
      if (aba === "odontograma") return podeVisualizarOdontograma;
      return true;
    });
  }, [nichoConfig.prontuarioAbas, podeCriarAtendimento, podeVisualizarOdontograma]);

  const ultimoAtendimento = atendimentos[0] ?? null;

  const carregar = useCallback(async ({
    pacienteId = "",
    buscaTermo = "",
    abrirModal = false,
  }: CarregarOpcoes = {}) => {
    if (pacienteId) setCarregandoDetalhe(true);
    else setCarregandoLista(true);

    setErro("");

    try {
      const params = new URLSearchParams();
      if (buscaTermo.trim()) params.set("busca", buscaTermo.trim());
      if (pacienteId) params.set("paciente_id", pacienteId);

      const response = await fetch(`/api/prontuarios?${params.toString()}`, {
        cache: "no-store",
      });
      const data = await response.json();

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Erro ao carregar pacientes.");
      }

      setPacientes(data.pacientes ?? []);

      const codigoRecebido = data.contexto?.nicho?.codigo;
      if (isNichoCodigo(codigoRecebido)) setNichoCodigo(codigoRecebido);

      if (pacienteId) {
        const novoSelecionado = data.selecionado?.id ?? "";
        setSelecionadoId(novoSelecionado);
        setAtendimentos(data.atendimentos ?? []);
        setModalAberto(Boolean(novoSelecionado) && abrirModal);
      }
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao carregar pacientes.");
    } finally {
      setCarregandoLista(false);
      setCarregandoDetalhe(false);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pacienteId = params.get("paciente_id") ?? "";
    const abaUrl = params.get("aba");

    if (isProntuarioAbaCodigo(abaUrl)) setAbaAtiva(abaUrl);
    void carregar({ pacienteId, abrirModal: Boolean(pacienteId) });
  }, [carregar]);

  useEffect(() => {
    if (!modalAberto) return;

    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setModalAberto(false);
      setSelecionadoId("");
      setAtendimentos([]);
      atualizarUrlPaciente(null, null);
    }

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = overflowAnterior;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [modalAberto]);

  useEffect(() => {
    if (!modalAberto || carregandoDetalhe) return;
    if (abasDisponiveis.includes(abaAtiva)) return;
    setAbaAtiva(abasDisponiveis[0] ?? "resumo");
  }, [abaAtiva, abasDisponiveis, carregandoDetalhe, modalAberto]);

  async function abrirPaciente(pacienteId: string, abaInicial: ProntuarioAbaCodigo = "resumo") {
    setSelecionadoId(pacienteId);
    setAbaAtiva(abaInicial);
    setModalAberto(true);
    atualizarUrlPaciente(pacienteId, abaInicial);
    await carregar({ pacienteId, abrirModal: true });
  }

  function fecharPaciente() {
    setModalAberto(false);
    setSelecionadoId("");
    setAtendimentos([]);
    setAbaAtiva("resumo");
    atualizarUrlPaciente(null, null);
  }

  const fecharCadastro = useCallback(() => {
    setModalCadastroAberto(false);
  }, []);

  function trocarAba(aba: ProntuarioAbaCodigo) {
    setAbaAtiva(aba);
    if (selecionadoId) atualizarUrlPaciente(selecionadoId, aba);
  }

  async function pacienteCriado(pacienteId: string, mensagemSucesso: string) {
    setModalCadastroAberto(false);
    setBusca("");
    setMensagem(mensagemSucesso);
    await abrirPaciente(pacienteId, "resumo");
  }

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

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Erro ao salvar atendimento.");
      }

      setMensagem(data.message || "Atendimento registrado.");
      setForm(criarFormInicial());
      await carregar({ pacienteId: pacienteSelecionado.id, abrirModal: true });
      trocarAba("evolucoes");
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao salvar atendimento.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
      <Header
        title="Pacientes"
        subtitle="Cadastre pacientes e acesse prontuário, evoluções e recursos clínicos da especialidade sem sair da mesma tela."
      />

      <main className={styles.page}>
        <section className={styles.heroCard}>
          <div>
            <span className={styles.eyebrow}>Gestão clínica</span>
            <h1>Pacientes e histórico clínico</h1>
            <p>
              Contatos continuam em um módulo independente. Aqui ficam os pacientes da clínica e,
              dentro de cada paciente, o prontuário e as ferramentas específicas do nicho.
            </p>
          </div>
          <div className={styles.heroBadge}>{nichoConfig.nome}</div>
        </section>

        <section className={styles.toolbar}>
          <form
            className={styles.searchArea}
            onSubmit={(event) => {
              event.preventDefault();
              void carregar({ buscaTermo: busca });
            }}
          >
            <Search size={18} strokeWidth={2.1} />
            <input
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
              placeholder="Buscar paciente por nome, documento ou e-mail"
              aria-label="Buscar paciente"
            />
            <button type="submit">Buscar</button>
          </form>

          {podeCadastrarPaciente ? (
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => setModalCadastroAberto(true)}
            >
              <UserPlus size={17} strokeWidth={2.2} />
              Cadastrar paciente
            </button>
          ) : null}
        </section>

        {erro && !modalAberto ? <div className={styles.error}>{erro}</div> : null}

        <section className={styles.patientSection}>
          <div className={styles.sectionHeader}>
            <div>
              <span className={styles.eyebrow}>Pacientes</span>
              <h2>Pacientes cadastrados</h2>
            </div>
            <span className={styles.counter}>{pacientes.length}</span>
          </div>

          {carregandoLista ? (
            <div className={styles.empty}>Carregando pacientes...</div>
          ) : pacientes.length === 0 ? (
            <div className={styles.empty}>
              Nenhum paciente encontrado. Cadastre um paciente para iniciar o acompanhamento clínico.
            </div>
          ) : (
            <div className={styles.patientGrid}>
              {pacientes.map((paciente) => (
                <button
                  key={paciente.id}
                  type="button"
                  className={styles.patientCard}
                  onClick={() => void abrirPaciente(paciente.id)}
                >
                  <div className={styles.patientAvatar}>
                    {(paciente.pessoa?.nome ?? "P").trim().charAt(0).toUpperCase()}
                  </div>
                  <div className={styles.patientCardContent}>
                    <strong>{paciente.pessoa?.nome ?? "Paciente"}</strong>
                    <span>{paciente.numero_prontuario || "Prontuário ainda sem número"}</span>
                    <small>
                      {paciente.convenio || paciente.pessoa?.email || "Sem convênio informado"}
                    </small>
                  </div>
                  <div className={styles.openHint}>
                    <FileText size={17} strokeWidth={2.1} />
                    Abrir paciente
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </main>

      {modalAberto ? (
        <div className={styles.modalOverlay} onMouseDown={fecharPaciente}>
          <section
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="paciente-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className={styles.modalHeader}>
              <div className={styles.modalIdentity}>
                <span className={styles.eyebrow}>Paciente</span>
                <div className={styles.modalTitleRow}>
                  <h2 id="paciente-modal-title">
                    {pacienteSelecionado?.pessoa?.nome ?? "Carregando paciente..."}
                  </h2>
                  {pacienteSelecionado?.numero_prontuario ? (
                    <span className={styles.recordBadge}>{pacienteSelecionado.numero_prontuario}</span>
                  ) : null}
                </div>
                <p>
                  {nichoConfig.nome}
                  {pacienteSelecionado?.convenio ? ` · ${pacienteSelecionado.convenio}` : ""}
                </p>
              </div>

              <button
                type="button"
                className={styles.closeButton}
                onClick={fecharPaciente}
                aria-label="Fechar paciente"
              >
                <X size={20} strokeWidth={2.2} />
              </button>
            </header>

            <nav className={styles.tabs} aria-label="Seções do paciente">
              {abasDisponiveis.map((aba) => (
                <button
                  key={aba}
                  type="button"
                  className={`${styles.tabButton} ${abaAtiva === aba ? styles.tabButtonActive : ""}`}
                  onClick={() => trocarAba(aba)}
                >
                  {ABA_LABELS[aba]}
                </button>
              ))}
            </nav>

            <div className={styles.modalBody}>
              {erro ? <div className={styles.error}>{erro}</div> : null}

              {carregandoDetalhe || !pacienteSelecionado ? (
                <div className={styles.empty}>Carregando paciente...</div>
              ) : null}

              {!carregandoDetalhe && pacienteSelecionado && abaAtiva === "resumo" ? (
                <div className={styles.summaryContent}>
                  <div className={styles.summaryGrid}>
                    <article className={styles.summaryCard}>
                      <span>Prontuário</span>
                      <strong>{pacienteSelecionado.numero_prontuario || "Não definido"}</strong>
                    </article>
                    <article className={styles.summaryCard}>
                      <span>Convênio</span>
                      <strong>{pacienteSelecionado.convenio || "Particular / não informado"}</strong>
                    </article>
                    <article className={styles.summaryCard}>
                      <span>Data de nascimento</span>
                      <strong>{formatarData(pacienteSelecionado.pessoa?.data_nascimento)}</strong>
                    </article>
                    <article className={styles.summaryCard}>
                      <span>Evoluções</span>
                      <strong>{atendimentos.length}</strong>
                    </article>
                  </div>

                  <section className={styles.detailCard}>
                    <div className={styles.sectionHeaderCompact}>
                      <div>
                        <span className={styles.eyebrow}>Última evolução</span>
                        <h3>{ultimoAtendimento ? labelTipo(ultimoAtendimento.tipo) : "Sem atendimentos"}</h3>
                      </div>
                      {ultimoAtendimento ? (
                        <span className={styles.muted}>{formatarDataHora(ultimoAtendimento.data_atendimento)}</span>
                      ) : null}
                    </div>
                    <p className={styles.summaryText}>
                      {ultimoAtendimento?.conduta ||
                        ultimoAtendimento?.observacoes ||
                        "Ainda não há evolução registrada para este paciente."}
                    </p>
                  </section>
                </div>
              ) : null}

              {!carregandoDetalhe && pacienteSelecionado && abaAtiva === "dados" ? (
                <div className={styles.summaryContent}>
                  <section className={styles.detailCard}>
                    <div className={styles.sectionHeaderCompact}>
                      <div>
                        <span className={styles.eyebrow}>Identificação</span>
                        <h3>Dados do paciente</h3>
                      </div>
                    </div>
                    <dl className={styles.detailList}>
                      <div><dt>Nome</dt><dd>{pacienteSelecionado.pessoa?.nome || "Não informado"}</dd></div>
                      <div><dt>E-mail</dt><dd>{pacienteSelecionado.pessoa?.email || "Não informado"}</dd></div>
                      <div><dt>Documento</dt><dd>{pacienteSelecionado.pessoa?.cpf_cnpj || "Não informado"}</dd></div>
                      <div><dt>Nascimento</dt><dd>{formatarData(pacienteSelecionado.pessoa?.data_nascimento)}</dd></div>
                      <div><dt>Convênio</dt><dd>{pacienteSelecionado.convenio || "Não informado"}</dd></div>
                      <div><dt>Responsável</dt><dd>{pacienteSelecionado.responsavel_nome || "Não informado"}</dd></div>
                      <div><dt>Cadastrado em</dt><dd>{formatarDataHora(pacienteSelecionado.created_at)}</dd></div>
                    </dl>
                  </section>
                </div>
              ) : null}

              {!carregandoDetalhe && pacienteSelecionado && abaAtiva === "prontuario" ? (
                <div className={styles.summaryContent}>
                  <div className={styles.summaryGrid}>
                    <article className={styles.summaryCard}>
                      <span>Número do prontuário</span>
                      <strong>{pacienteSelecionado.numero_prontuario || "Não definido"}</strong>
                    </article>
                    <article className={styles.summaryCard}>
                      <span>Atendimentos registrados</span>
                      <strong>{atendimentos.length}</strong>
                    </article>
                    <article className={styles.summaryCard}>
                      <span>Último atendimento</span>
                      <strong>{ultimoAtendimento ? formatarDataHora(ultimoAtendimento.data_atendimento) : "Nenhum"}</strong>
                    </article>
                    <article className={styles.summaryCard}>
                      <span>Último tipo</span>
                      <strong>{ultimoAtendimento ? labelTipo(ultimoAtendimento.tipo) : "Sem registro"}</strong>
                    </article>
                  </div>

                  <section className={styles.detailCard}>
                    <div className={styles.sectionHeaderCompact}>
                      <div>
                        <span className={styles.eyebrow}>Prontuário clínico</span>
                        <h3>Histórico central do paciente</h3>
                      </div>
                    </div>
                    <p className={styles.summaryText}>
                      O prontuário reúne atendimentos, anamnese, diagnóstico, conduta, prescrições e observações clínicas.
                      Use as abas de atendimento e evoluções para registrar e consultar o histórico.
                    </p>
                    {podeCriarAtendimento ? (
                      <div className={styles.formActions}>
                        <button type="button" className={styles.primaryButton} onClick={() => trocarAba("atendimento")}>
                          <ClipboardList size={17} strokeWidth={2.2} />
                          Registrar novo atendimento
                        </button>
                      </div>
                    ) : null}
                  </section>
                </div>
              ) : null}

              {!carregandoDetalhe && pacienteSelecionado && abaAtiva === "atendimento" ? (
                <section className={styles.formCard}>
                  <div className={styles.sectionHeaderCompact}>
                    <div>
                      <span className={styles.eyebrow}>Prontuário</span>
                      <h3>Registrar novo atendimento</h3>
                    </div>
                  </div>

                  <div className={styles.formGrid}>
                    <label className={styles.field}>
                      <span>Data e hora</span>
                      <input
                        type="datetime-local"
                        value={form.data_atendimento}
                        onChange={(event) => setForm((atual) => ({ ...atual, data_atendimento: event.target.value }))}
                      />
                    </label>

                    <label className={styles.field}>
                      <span>Tipo</span>
                      <select value={form.tipo} onChange={(event) => setForm((atual) => ({ ...atual, tipo: event.target.value }))}>
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
                      ] as Array<[
                        Exclude<keyof FormAtendimento, "data_atendimento" | "tipo">,
                        string,
                      ]>
                    ).map(([chave, label]) => (
                      <label key={chave} className={`${styles.field} ${styles.fullField}`}>
                        <span>{label}</span>
                        <textarea
                          value={form[chave]}
                          onChange={(event) => setForm((atual) => ({ ...atual, [chave]: event.target.value }))}
                        />
                      </label>
                    ))}
                  </div>

                  <div className={styles.formActions}>
                    <button
                      type="button"
                      className={styles.primaryButton}
                      onClick={() => void salvarAtendimento()}
                      disabled={salvando}
                    >
                      {salvando ? "Salvando..." : "Salvar atendimento"}
                    </button>
                  </div>
                </section>
              ) : null}

              {!carregandoDetalhe && pacienteSelecionado && abaAtiva === "evolucoes" ? (
                <div className={styles.timeline}>
                  {atendimentos.length === 0 ? (
                    <div className={styles.empty}>Este paciente ainda não possui atendimentos registrados.</div>
                  ) : (
                    atendimentos.map((atendimento) => (
                      <article key={atendimento.id} className={styles.timelineItem}>
                        <div className={styles.timelineHeader}>
                          <div>
                            <h3>{labelTipo(atendimento.tipo)}</h3>
                            <p className={styles.muted}>{formatarDataHora(atendimento.data_atendimento)}</p>
                          </div>
                          <span className={styles.statusBadge}>{labelTipo(atendimento.tipo)}</span>
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
                                <strong>{label}:</strong> {String(atendimento[chave])}
                              </p>
                            ) : null,
                          )}
                        </div>
                      </article>
                    ))
                  )}
                </div>
              ) : null}

              {!carregandoDetalhe && pacienteSelecionado && abaAtiva === "odontograma" ? (
                <OdontogramaTab
                  pacienteId={pacienteSelecionado.id}
                  podeEditar={podeEditarOdontograma}
                  onFeedback={setMensagem}
                />
              ) : null}

              {!carregandoDetalhe && pacienteSelecionado && abaAtiva === "podograma" ? (
                <PodogramaTab
                  pacienteId={pacienteSelecionado.id}
                  podeEditar={podeEditarProntuario}
                  onFeedback={setMensagem}
                />
              ) : null}
            </div>
          </section>
        </div>
      ) : null}

      <CadastroPacienteModal
        aberto={modalCadastroAberto}
        nichoNome={nichoConfig.nome}
        podeCarregarCampos={podeVisualizarPessoas}
        onClose={fecharCadastro}
        onCreated={pacienteCriado}
      />

      {mensagem ? (
        <FeedbackToast success={mensagem} onSuccessDismiss={() => setMensagem("")} />
      ) : null}
    </>
  );
}
