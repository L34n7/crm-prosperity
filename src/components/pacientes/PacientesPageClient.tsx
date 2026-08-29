"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  ClipboardList,
  FileText,
  Link2,
  Pencil,
  Search,
  TriangleAlert,
  UserPlus,
  X,
} from "lucide-react";
import Header from "@/components/Header";
import FeedbackToast from "@/components/FeedbackToast";
import { useHeaderUser } from "@/components/header-user-context";
import CadastroPacienteModal from "@/components/pacientes/CadastroPacienteModal";
import OdontogramaTab, {
  type OdontogramaAlteracaoDraft,
} from "@/components/prontuarios/OdontogramaTab";
import PodogramaTab from "@/components/prontuarios/PodogramaTab";
import {
  getNichoConfig,
  isNichoCodigo,
  isProntuarioAbaCodigo,
  type NichoCodigo,
  type ProntuarioAbaCodigo,
} from "@/lib/nichos/config";
import styles from "@/app/(private)/prontuarios/prontuarios.module.css";
import modalStyles from "./PacienteModalEnhancements.module.css";
import vinculoStyles from "./PacienteVinculo.module.css";

type ContatoVinculado = {
  id: string;
  pessoa_id: string;
  nome: string | null;
  telefone: string;
  email: string | null;
  origem: string | null;
  ultima_interacao_at: string | null;
  updated_at: string | null;
};

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
  contatos_vinculados?: ContatoVinculado[];
};

type OdontogramaEvolucaoAtendimento = {
  id: string;
  dente: string;
  status_anterior: string;
  status_novo: string;
  procedimento: string | null;
  observacoes: string | null;
  created_at: string;
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
  odontograma_evolucoes?: OdontogramaEvolucaoAtendimento[];
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

type PacientesPageClientProps = {
  pacienteIdModal?: string | null;
  onModalClose?: () => void;
};

const ABA_LABELS: Record<ProntuarioAbaCodigo, string> = {
  resumo: "Visão geral",
  dados: "Visão geral",
  prontuario: "Prontuário",
  atendimento: "Registrar atendimento",
  evolucoes: "Evoluções",
  odontograma: "Odontograma",
  podograma: "Podograma",
};

const CAMPOS_ATENDIMENTO: Array<[
  Exclude<keyof FormAtendimento, "data_atendimento" | "tipo">,
  string,
]> = [
  ["queixa_principal", "Queixa principal"],
  ["anamnese", "Anamnese"],
  ["diagnostico", "Diagnóstico"],
  ["conduta", "Conduta / plano"],
  ["prescricao", "Prescrição"],
  ["observacoes", "Observações"],
];

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

function dataHoraLocalDoAtendimento(valor: string) {
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return dataHoraLocalInicial();
  data.setMinutes(data.getMinutes() - data.getTimezoneOffset());
  return data.toISOString().slice(0, 16);
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
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(data);
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

function labelStatusOdontograma(status: string) {
  const labels: Record<string, string> = {
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
  return labels[status] ?? status;
}

function normalizarAbaPaciente(aba: ProntuarioAbaCodigo): ProntuarioAbaCodigo {
  if (aba === "dados") return "resumo";
  return aba === "evolucoes" ? "prontuario" : aba;
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
  window.history.replaceState(
    window.history.state,
    "",
    query ? `${window.location.pathname}?${query}` : window.location.pathname,
  );
}

async function carregarVinculosContato(pacientes: PacienteLista[]) {
  if (pacientes.length === 0) return pacientes;

  try {
    const pessoaIds = Array.from(
      new Set(pacientes.map((paciente) => paciente.pessoa_id).filter(Boolean)),
    );
    const response = await fetch("/api/pacientes/vinculos-contato", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pessoa_ids: pessoaIds }),
      cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok || !data?.ok) return pacientes;

    const vinculos = data.vinculos && typeof data.vinculos === "object"
      ? (data.vinculos as Record<string, ContatoVinculado[]>)
      : {};

    return pacientes.map((paciente) => ({
      ...paciente,
      contatos_vinculados: Array.isArray(vinculos[paciente.pessoa_id])
        ? vinculos[paciente.pessoa_id]
        : [],
    }));
  } catch {
    return pacientes;
  }
}

export default function PacientesPageClient({
  pacienteIdModal = null,
  onModalClose,
}: PacientesPageClientProps = {}) {
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
  const [atendimentoEditandoId, setAtendimentoEditandoId] = useState("");
  const [atendimentoExpandidoId, setAtendimentoExpandidoId] = useState("");
  const [filtroTipoAtendimento, setFiltroTipoAtendimento] = useState("todos");
  const [odontogramaAlteracoes, setOdontogramaAlteracoes] = useState<OdontogramaAlteracaoDraft[]>([]);
  const [odontogramaAtendimentoAberto, setOdontogramaAtendimentoAberto] = useState(false);
  const [odontogramaDenteInicial, setOdontogramaDenteInicial] = useState("");
  const modoModal = Boolean(pacienteIdModal);

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
  const contatoPrincipal = pacienteSelecionado?.contatos_vinculados?.[0] ?? null;

  const abasDisponiveis = useMemo(() => {
    const abas = nichoConfig.prontuarioAbas ?? ["resumo", "dados", "prontuario", "atendimento"];
    return abas.filter((aba) => {
      if (aba === "dados" || aba === "evolucoes") return false;
      if (aba === "atendimento") return podeCriarAtendimento;
      if (aba === "odontograma") return podeVisualizarOdontograma;
      return true;
    });
  }, [nichoConfig.prontuarioAbas, podeCriarAtendimento, podeVisualizarOdontograma]);

  const ultimoAtendimento = atendimentos[0] ?? null;
  const atendimentosFiltrados = useMemo(
    () => filtroTipoAtendimento === "todos"
      ? atendimentos
      : atendimentos.filter((atendimento) => atendimento.tipo === filtroTipoAtendimento),
    [atendimentos, filtroTipoAtendimento],
  );

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

      const lista = await carregarVinculosContato(
        (Array.isArray(data.pacientes) ? data.pacientes : []) as PacienteLista[],
      );
      setPacientes(lista);

      const codigoRecebido = data.contexto?.nicho?.codigo;
      if (isNichoCodigo(codigoRecebido)) setNichoCodigo(codigoRecebido);

      if (pacienteId) {
        const novoSelecionado = String(data.selecionado?.id ?? "");
        const listaAtendimentos = Array.isArray(data.atendimentos)
          ? data.atendimentos as Atendimento[]
          : [];
        setSelecionadoId(novoSelecionado);
        setAtendimentos(listaAtendimentos);
        setAtendimentoExpandidoId((atual) =>
          atual && listaAtendimentos.some((atendimento) => atendimento.id === atual)
            ? atual
            : listaAtendimentos[0]?.id ?? "",
        );
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
    if (pacienteIdModal) {
      setSelecionadoId(pacienteIdModal);
      setAbaAtiva("resumo");
      setAtendimentoEditandoId("");
      setFiltroTipoAtendimento("todos");
      setModalAberto(true);
      void carregar({ pacienteId: pacienteIdModal, abrirModal: true });
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const pacienteId = params.get("paciente_id") ?? "";
    const abaUrl = params.get("aba");
    if (isProntuarioAbaCodigo(abaUrl)) {
      setAbaAtiva(normalizarAbaPaciente(abaUrl));
    }
    void carregar({ pacienteId, abrirModal: Boolean(pacienteId) });
  }, [carregar, pacienteIdModal]);

  useEffect(() => {
    if (!modalAberto) return;
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setModalAberto(false);
      setSelecionadoId("");
      setAtendimentos([]);
      if (modoModal) onModalClose?.();
      else atualizarUrlPaciente(null, null);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = overflowAnterior;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [modalAberto, modoModal, onModalClose]);

  useEffect(() => {
    if (!modalAberto || carregandoDetalhe) return;
    if (abasDisponiveis.includes(abaAtiva)) return;
    setAbaAtiva(abasDisponiveis[0] ?? "resumo");
  }, [abaAtiva, abasDisponiveis, carregandoDetalhe, modalAberto]);

  async function abrirPaciente(
    pacienteId: string,
    abaInicial: ProntuarioAbaCodigo = "resumo",
  ) {
    const abaNormalizada = normalizarAbaPaciente(abaInicial);
    setSelecionadoId(pacienteId);
    setAbaAtiva(abaNormalizada);
    setForm(criarFormInicial());
    setAtendimentoEditandoId("");
    setFiltroTipoAtendimento("todos");
    setOdontogramaAlteracoes([]);
    setOdontogramaAtendimentoAberto(false);
    setOdontogramaDenteInicial("");
    setModalAberto(true);
    if (!modoModal) atualizarUrlPaciente(pacienteId, abaNormalizada);
    await carregar({ pacienteId, abrirModal: true });
  }

  function fecharPaciente() {
    setModalAberto(false);
    setSelecionadoId("");
    setAtendimentos([]);
    setAbaAtiva("resumo");
    setAtendimentoEditandoId("");
    setAtendimentoExpandidoId("");
    setFiltroTipoAtendimento("todos");
    setOdontogramaAlteracoes([]);
    setOdontogramaAtendimentoAberto(false);
    setOdontogramaDenteInicial("");
    if (modoModal) onModalClose?.();
    else atualizarUrlPaciente(null, null);
  }

  const fecharCadastro = useCallback(() => setModalCadastroAberto(false), []);

  function trocarAba(aba: ProntuarioAbaCodigo) {
    const abaNormalizada = normalizarAbaPaciente(aba);
    setAbaAtiva(abaNormalizada);
    if (selecionadoId && !modoModal) {
      atualizarUrlPaciente(selecionadoId, abaNormalizada);
    }
  }

  async function pacienteCriado(pacienteId: string, mensagemSucesso: string) {
    setModalCadastroAberto(false);
    setBusca("");
    setMensagem(mensagemSucesso);
    await abrirPaciente(pacienteId, "resumo");
  }

  function abrirNovoAtendimento(denteInicial = "") {
    setAtendimentoEditandoId("");
    setForm(criarFormInicial());
    setOdontogramaAlteracoes([]);
    setOdontogramaAtendimentoAberto(Boolean(denteInicial));
    setOdontogramaDenteInicial(denteInicial);
    trocarAba("atendimento");
  }

  function editarAtendimento(atendimento: Atendimento) {
    setAtendimentoEditandoId(atendimento.id);
    setOdontogramaAlteracoes([]);
    setOdontogramaAtendimentoAberto(false);
    setOdontogramaDenteInicial("");
    setForm({
      data_atendimento: dataHoraLocalDoAtendimento(atendimento.data_atendimento),
      tipo: atendimento.tipo,
      queixa_principal: atendimento.queixa_principal ?? "",
      anamnese: atendimento.anamnese ?? "",
      diagnostico: atendimento.diagnostico ?? "",
      conduta: atendimento.conduta ?? "",
      prescricao: atendimento.prescricao ?? "",
      observacoes: atendimento.observacoes ?? "",
    });
    setAtendimentoExpandidoId(atendimento.id);
    trocarAba("atendimento");
  }

  function cancelarFormularioAtendimento() {
    setForm(criarFormInicial());
    setAtendimentoEditandoId("");
    setOdontogramaAlteracoes([]);
    setOdontogramaAtendimentoAberto(false);
    setOdontogramaDenteInicial("");
    trocarAba("prontuario");
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
        method: atendimentoEditandoId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          paciente_id: pacienteSelecionado.id,
          atendimento_id: atendimentoEditandoId || undefined,
          odontograma_alteracoes: odontogramaAlteracoes,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Erro ao salvar atendimento.");
      }
      setMensagem(data.message || "Atendimento registrado.");
      setForm(criarFormInicial());
      setOdontogramaAlteracoes([]);
      setOdontogramaAtendimentoAberto(false);
      setOdontogramaDenteInicial("");
      await carregar({ pacienteId: pacienteSelecionado.id, abrirModal: true });
      setAtendimentoEditandoId("");
      setFiltroTipoAtendimento("todos");
      setAtendimentoExpandidoId(String(data.atendimento?.id ?? ""));
      trocarAba("prontuario");
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao salvar atendimento.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
      {!modoModal ? (
        <>
          <Header
            title="Pacientes"
            subtitle="Cadastre pacientes e acesse o histórico completo do prontuário e os recursos clínicos da especialidade sem sair da mesma tela."
          />

          <main className={styles.page}>
            <section className={styles.heroCard}>
              <div>
                <span className={styles.eyebrow}>Gestão clínica</span>
                <h1>Pacientes e histórico clínico</h1>
                <p>
                  Contatos continuam independentes, mas o vínculo com o paciente conecta conversa,
                  agenda, automações e histórico clínico em uma única identidade.
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
                  {pacientes.map((paciente) => {
                    const contato = paciente.contatos_vinculados?.[0] ?? null;
                    return (
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
                          <small>{paciente.convenio || paciente.pessoa?.email || "Sem convênio informado"}</small>
                          {contato ? (
                            <span className={vinculoStyles.badge} title={`Contato vinculado: ${contato.telefone}`}>
                              <Link2 size={12} /> Contato vinculado · {contato.telefone}
                            </span>
                          ) : (
                            <span className={vinculoStyles.warning} title="Vincule este paciente a um contato para conectar conversas, agenda e automações.">
                              <TriangleAlert size={12} /> Sem vínculo com contato
                            </span>
                          )}
                        </div>
                        <div className={styles.openHint}>
                          <FileText size={17} strokeWidth={2.1} />
                          Abrir paciente
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          </main>
        </>
      ) : null}

      {modalAberto ? (
        <div className={styles.modalOverlay} onMouseDown={fecharPaciente}>
          <section
            className={[
              styles.modal,
              abaAtiva === "prontuario" || abaAtiva === "atendimento"
                ? modalStyles.modalTall
                : modalStyles.modalAdaptive,
            ].join(" ")}
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
                  <div className={styles.modalBadges}>
                    {pacienteSelecionado?.numero_prontuario ? (
                      <span className={styles.recordBadge}>{pacienteSelecionado.numero_prontuario}</span>
                    ) : null}
                    {pacienteSelecionado ? (
                      contatoPrincipal ? (
                        <span className={`${vinculoStyles.badge} ${styles.modalHeaderBadge}`}>
                          <Link2 size={12} /> {contatoPrincipal.telefone}
                        </span>
                      ) : (
                        <span className={`${vinculoStyles.warning} ${styles.modalHeaderBadge}`}>
                          <TriangleAlert size={12} /> Sem vínculo com contato
                              </span>
                      )
                    ) : null}
                  </div>
                </div>
              </div>

              <button type="button" className={styles.closeButton} onClick={fecharPaciente} aria-label="Fechar paciente">
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

            <div
              className={[
                styles.modalBody,
                abaAtiva === "prontuario" || abaAtiva === "atendimento"
                  ? ""
                  : modalStyles.modalBodyAdaptive,
              ].join(" ")}
            >
              {erro ? <div className={styles.error}>{erro}</div> : null}
              {carregandoDetalhe || !pacienteSelecionado ? (
                <div className={styles.empty}>Carregando paciente...</div>
              ) : null}

              {!carregandoDetalhe && pacienteSelecionado && !contatoPrincipal && abaAtiva === "resumo" ? (
                <div className={`${vinculoStyles.warningPanel} ${styles.modalLinkedPanel}`}>
                  <TriangleAlert size={18} />
                  <div>
                    <strong>Paciente sem vínculo com contato</strong>
                    Vincule um contato para conectar conversas, agenda, automações e histórico do relacionamento a este paciente.
                  </div>
                </div>
              ) : null}

              {!carregandoDetalhe && pacienteSelecionado && abaAtiva === "resumo" ? (
                <div className={styles.summaryContent}>
                  <div className={styles.summaryGrid}>
                    <article className={styles.summaryCard}>
                      <span>Número do prontuário</span>
                      <strong>{pacienteSelecionado.numero_prontuario || "Não definido"}</strong>
                    </article>
                    <article className={styles.summaryCard}>
                      <span>Último atendimento</span>
                      <strong>{ultimoAtendimento ? formatarDataHora(ultimoAtendimento.data_atendimento) : "Nenhum"}</strong>
                    </article>
                    <article className={styles.summaryCard}>
                      <span>Atendimentos registrados</span>
                      <strong>{atendimentos.length}</strong>
                    </article>
                    <article className={styles.summaryCard}>
                      <span>Convênio</span>
                      <strong>{pacienteSelecionado.convenio || "Particular / não informado"}</strong>
                    </article>
                  </div>

                  <section className={styles.detailCard}>
                    <div className={styles.sectionHeaderCompact}>
                      <div className={modalStyles.overviewSectionTitle}>
                        <span className={styles.eyebrow}>Identificação e contato</span>
                        <h3>Dados do paciente</h3>
                        <p>Informações cadastrais e de relacionamento reunidas no mesmo panorama.</p>
                      </div>
                    </div>
                    <dl className={styles.detailList}>
                      <div><dt>Nome</dt><dd>{pacienteSelecionado.pessoa?.nome || "Não informado"}</dd></div>
                      <div><dt>E-mail</dt><dd>{pacienteSelecionado.pessoa?.email || "Não informado"}</dd></div>
                      <div><dt>Documento</dt><dd>{pacienteSelecionado.pessoa?.cpf_cnpj || "Não informado"}</dd></div>
                      <div><dt>Nascimento</dt><dd>{formatarData(pacienteSelecionado.pessoa?.data_nascimento)}</dd></div>
                      <div><dt>Convênio</dt><dd>{pacienteSelecionado.convenio || "Não informado"}</dd></div>
                      <div><dt>Responsável</dt><dd>{pacienteSelecionado.responsavel_nome || "Não informado"}</dd></div>
                      <div><dt>Contato vinculado</dt><dd>{contatoPrincipal?.telefone || "Não vinculado"}</dd></div>
                      <div><dt>Cadastrado em</dt><dd>{formatarDataHora(pacienteSelecionado.created_at)}</dd></div>
                    </dl>
                  </section>

                  {nichoCodigo === "odontologia" && podeVisualizarOdontograma ? (
                    <OdontogramaTab
                      pacienteId={pacienteSelecionado.id}
                      podeEditar={false}
                      modoPreview
                      onVerOdontogramaCompleto={() => trocarAba("odontograma")}
                    />
                  ) : null}

                  <section className={styles.detailCard}>
                    <div className={styles.sectionHeaderCompact}>
                      <div>
                        <span className={styles.eyebrow}>Última evolução</span>
                        <h3>{ultimoAtendimento ? labelTipo(ultimoAtendimento.tipo) : "Sem atendimentos"}</h3>
                      </div>
                      {ultimoAtendimento ? <span className={styles.muted}>{formatarDataHora(ultimoAtendimento.data_atendimento)}</span> : null}
                    </div>
                    <p className={styles.summaryText}>
                      {ultimoAtendimento?.conduta || ultimoAtendimento?.observacoes || "Ainda não há evolução registrada para este paciente."}
                    </p>
                  </section>

                  <section className={`${styles.detailCard} ${modalStyles.alertCard}`}>
                    <div className={styles.sectionHeaderCompact}>
                      <div>
                        <span className={styles.eyebrow}>Atenção clínica</span>
                        <h3>Alertas e observações importantes</h3>
                      </div>
                    </div>
                    <p className={modalStyles.alertText}>
                      {ultimoAtendimento?.observacoes || "Nenhum alerta ou observação importante registrado no último atendimento."}
                    </p>
                  </section>
                </div>
              ) : null}

              {!carregandoDetalhe && pacienteSelecionado && abaAtiva === "prontuario" ? (
                <div className={styles.summaryContent}>
                  <div className={styles.summaryGrid}>
                    <article className={styles.summaryCard}><span>Número do prontuário</span><strong>{pacienteSelecionado.numero_prontuario || "Não definido"}</strong></article>
                    <article className={styles.summaryCard}><span>Atendimentos registrados</span><strong>{atendimentos.length}</strong></article>
                    <article className={styles.summaryCard}><span>Último atendimento</span><strong>{ultimoAtendimento ? formatarDataHora(ultimoAtendimento.data_atendimento) : "Nenhum"}</strong></article>
                    <article className={styles.summaryCard}><span>Último tipo</span><strong>{ultimoAtendimento ? labelTipo(ultimoAtendimento.tipo) : "Sem registro"}</strong></article>
                  </div>
                  <section className={[styles.detailCard, styles.prontuarioQuickAction].join(" ")}>
                    <div>
                      <span className={styles.eyebrow}>Prontuário clínico</span>
                      <h3>Histórico central do paciente</h3>
                      <p className={styles.summaryText}>Atendimentos, diagnósticos, condutas e prescrições em uma única linha do tempo.</p>
                    </div>
                    {podeCriarAtendimento ? (
                      <button
                        type="button"
                        className={styles.primaryButton}
                        onClick={() => abrirNovoAtendimento()}
                      >
                        <ClipboardList size={17} strokeWidth={2.2} />
                        Registrar novo atendimento
                      </button>
                    ) : null}
                  </section>
                </div>
              ) : null}

              {!carregandoDetalhe && pacienteSelecionado && abaAtiva === "atendimento" ? (
                <section id="form-novo-atendimento" className={`${styles.formCard} ${modalStyles.attendanceFormCard}`}>
                  <div className={`${styles.sectionHeaderCompact} ${modalStyles.attendanceFormHeader}`}>
                    <div>
                      <span className={styles.eyebrow}>{atendimentoEditandoId ? "Editar registro" : "Novo registro"}</span>
                      <h3>{atendimentoEditandoId ? "Editar atendimento" : "Registrar atendimento"}</h3>
                    </div>
                    <span className={modalStyles.draftBadge}>
                      {atendimentoEditandoId ? "Edição em andamento" : "Rascunho"}
                    </span>
                  </div>

                  <section className={modalStyles.formSection}>
                    <div className={modalStyles.formSectionHeader}>
                      <span className={styles.eyebrow}>Atendimento</span>
                      <h4>Identificação do atendimento</h4>
                      <p>Defina quando ocorreu e qual é o tipo do registro clínico.</p>
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
                    </div>
                  </section>

                  <section className={modalStyles.formSection}>
                    <div className={modalStyles.formSectionHeader}>
                      <span className={styles.eyebrow}>Registro clínico</span>
                      <h4>Evolução do paciente</h4>
                      <p>Registre queixa, avaliação, diagnóstico, conduta e demais informações da consulta.</p>
                    </div>
                    <div className={styles.formGrid}>
                      {CAMPOS_ATENDIMENTO.map(([chave, label]) => (
                        <label key={chave} className={`${styles.field} ${styles.fullField}`}>
                          <span>{label}</span>
                          <textarea
                            value={form[chave]}
                            onChange={(event) => setForm((atual) => ({ ...atual, [chave]: event.target.value }))}
                          />
                        </label>
                      ))}
                    </div>
                  </section>

                  {nichoCodigo === "odontologia" && podeVisualizarOdontograma ? (
                    <section className={`${styles.attendanceOdontogramSection} ${modalStyles.attendanceOdontogramSpacing}`}>
                      <div className={styles.attendanceOdontogramHeader}>
                        <div>
                          <span className={styles.eyebrow}>Avaliação odontológica</span>
                          <h4>Situação dos dentes neste atendimento</h4>
                          <p>
                            Registre achados e procedimentos no mesmo contexto clínico da {labelTipo(form.tipo).toLowerCase()}.
                          </p>
                        </div>
                        <div className={styles.attendanceOdontogramActions}>
                          {odontogramaAlteracoes.length > 0 ? (
                            <span className={styles.pendingDentalBadge}>
                              {odontogramaAlteracoes.length} {odontogramaAlteracoes.length === 1 ? "dente alterado" : "dentes alterados"}
                            </span>
                          ) : null}
                          <button
                            type="button"
                            className={styles.secondaryButton}
                            onClick={() => setOdontogramaAtendimentoAberto((aberto) => !aberto)}
                          >
                            {odontogramaAtendimentoAberto ? "Recolher odontograma" : "Adicionar situação do dente"}
                          </button>
                        </div>
                      </div>
                      {odontogramaAtendimentoAberto ? (
                        <OdontogramaTab
                          pacienteId={pacienteSelecionado.id}
                          podeEditar={podeEditarOdontograma}
                          modoAtendimento
                          alteracoesPendentes={odontogramaAlteracoes}
                          onAlteracoesPendentesChange={setOdontogramaAlteracoes}
                          denteInicial={odontogramaDenteInicial}
                          onFeedback={setMensagem}
                        />
                      ) : null}
                    </section>
                  ) : null}

                  {odontogramaAlteracoes.length > 0 ? (
                    <section className={modalStyles.dentalSummary}>
                      <div className={modalStyles.dentalSummaryHeader}>
                        <strong>Dentes adicionados ao atendimento</strong>
                        <span>Revise as alterações antes de salvar.</span>
                      </div>
                      <div className={modalStyles.dentalSummaryList}>
                        {odontogramaAlteracoes.map((alteracao) => (
                          <article key={alteracao.dente} className={modalStyles.dentalSummaryItem}>
                            <strong>Dente {alteracao.dente}</strong>
                            <span>
                              {labelStatusOdontograma(alteracao.status)}
                              {alteracao.procedimento ? ` · ${alteracao.procedimento}` : ""}
                            </span>
                          </article>
                        ))}
                      </div>
                    </section>
                  ) : null}

                  <div className={`${styles.formActions} ${modalStyles.stickyFooter}`}>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={cancelarFormularioAtendimento}
                      disabled={salvando}
                    >
                      Cancelar
                    </button>
                    <button type="button" className={styles.primaryButton} onClick={() => void salvarAtendimento()} disabled={salvando}>
                      {salvando
                        ? "Salvando..."
                        : atendimentoEditandoId
                          ? "Salvar alterações"
                          : "Salvar atendimento"}
                    </button>
                  </div>
                </section>
              ) : null}

              {!carregandoDetalhe && pacienteSelecionado && abaAtiva === "prontuario" ? (
                <div className={styles.historySection}>
                  <div className={styles.historyToolbar}>
                    <div>
                      <strong>{atendimentos.length} {atendimentos.length === 1 ? "atendimento" : "atendimentos"}</strong>
                      <span>Mais recentes primeiro</span>
                    </div>
                    <label className={styles.historyFilter}>
                      <span>Filtrar por tipo</span>
                      <select value={filtroTipoAtendimento} onChange={(event) => setFiltroTipoAtendimento(event.target.value)}>
                        <option value="todos">Todos os tipos</option>
                        <option value="consulta">Consulta</option>
                        <option value="retorno">Retorno</option>
                        <option value="procedimento">Procedimento</option>
                        <option value="avaliacao">Avaliação</option>
                        <option value="emergencia">Emergência</option>
                      </select>
                    </label>
                  </div>
                  <div className={styles.timeline}>
                    {atendimentosFiltrados.length === 0 ? (
                      <div className={styles.empty}>
                        {atendimentos.length === 0
                          ? "Este paciente ainda não possui atendimentos registrados."
                       : "Nenhum atendimento corresponde ao filtro selecionado."}
                      </div>
                    ) : (
                      atendimentosFiltrados.map((atendimento) => {
                        const expandido = atendimentoExpandidoId === atendimento.id;
                        return (
                          <article key={atendimento.id} className={styles.timelineItem}>
                            <button
                              type="button"
                              className={styles.timelineHeader}
                              onClick={() => setAtendimentoExpandidoId(expandido ? "" : atendimento.id)}
                              aria-expanded={expandido}
                            >
                              <div>
                                <h3>{labelTipo(atendimento.tipo)}</h3>
                                <p className={styles.muted}>{formatarDataHora(atendimento.data_atendimento)}</p>
                              </div>
                              <span className={styles.timelineHeaderEnd}>
                                <span className={styles.statusBadge}>{labelTipo(atendimento.tipo)}</span>
                                {expandido ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                              </span>
                            </button>
                            {expandido ? (
                              <div className={styles.timelineBody}>
                                {([
                                  ["queixa_principal", "Queixa"],
                                  ["anamnese", "Anamnese"],
                                  ["diagnostico", "Diagnóstico"],
                                  ["conduta", "Conduta"],
                                  ["prescricao", "Prescrição"],
                                  ["observacoes", "Observações"],
                                ] as Array<[keyof Atendimento, string]>).map(([chave, label]) =>
                                  atendimento[chave] ? (
                                    <p key={chave}><strong>{label}:</strong> {String(atendimento[chave])}</p>
                                  ) : null,
                                )}
                                {!atendimento.queixa_principal && !atendimento.anamnese && !atendimento.diagnostico && !atendimento.conduta && !atendimento.prescricao && !atendimento.observacoes ? (
                                  <p>Atendimento registrado sem detalhes clínicos adicionais.</p>
                                ) : null}
                                {atendimento.odontograma_evolucoes?.length ? (
                                  <section className={styles.timelineDentalChanges}>
                                    <strong>Alterações odontológicas</strong>
                                    <div>
                                      {atendimento.odontograma_evolucoes.map((evolucao) => (
                                        <article key={evolucao.id}>
                                          <span>Dente {evolucao.dente}</span>
                                          <p>
                                            {labelStatusOdontograma(evolucao.status_anterior)} → {labelStatusOdontograma(evolucao.status_novo)}
                                            {evolucao.procedimento ? " · " + evolucao.procedimento : ""}
                                          </p>
                                        </article>
                                      ))}
                                    </div>
                                  </section>
                                ) : null}
                                {podeEditarProntuario ? (
                                  <div className={styles.timelineActions}>
                                    <button type="button" className={styles.secondaryButton} onClick={() => editarAtendimento(atendimento)}>
                                      <Pencil size={15} /> Editar atendimento
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                          </article>
                        );
                      })
                    )}
                  </div>
                </div>
              ) : null}

              {!carregandoDetalhe && pacienteSelecionado && abaAtiva === "odontograma" ? (
                <OdontogramaTab
                  pacienteId={pacienteSelecionado.id}
                  podeEditar={podeEditarOdontograma}
                  podeRegistrarAtendimento={podeCriarAtendimento}
                  onRegistrarAtendimento={(dente) => abrirNovoAtendimento(dente)}
                  onFeedback={setMensagem}
                />
              ) : null}

              {!carregandoDetalhe && pacienteSelecionado && abaAtiva === "podograma" ? (
                <PodogramaTab pacienteId={pacienteSelecionado.id} podeEditar={podeEditarProntuario} onFeedback={setMensagem} />
              ) : null}
            </div>
          </section>
        </div>
      ) : null}

      {!modoModal ? (
        <CadastroPacienteModal
          aberto={modalCadastroAberto}
          nichoNome={nichoConfig.nome}
          podeCarregarCampos={podeVisualizarPessoas}
          onClose={fecharCadastro}
          onCreated={pacienteCriado}
        />
      ) : null}

      {mensagem ? <FeedbackToast success={mensagem} onSuccessDismiss={() => setMensagem("")} /> : null}
    </>
  );
}
