"use client";

import { useMemo, useState } from "react";
import { UserRound } from "lucide-react";
import FeedbackToast from "@/components/FeedbackToast";
import { useHeaderUser } from "@/components/header-user-context";
import PessoaCadastroModal, {
  type CampoCadastroPessoa,
  type ContatoInicialPessoa,
  type PessoaCadastro,
} from "@/components/cadastros/PessoaCadastroModal";
import CadastroPacienteModal from "@/components/pacientes/CadastroPacienteModal";
import type { ContatoDisponivelPaciente } from "@/components/pacientes/CadastroPacienteModalV2";
import PacientesPageClient from "@/components/pacientes/PacientesPageClient";
import { can } from "@/lib/permissoes/frontend";
import { getNichoConfig } from "@/lib/nichos/config";
import styles from "@/app/(private)/conversas/conversas.module.css";

type ContatoConversa = {
  id?: string;
  nome?: string | null;
  whatsapp_profile_name?: string | null;
  telefone?: string | null;
  email?: string | null;
  empresa?: string | null;
  origem?: string | null;
  campanha?: string | null;
  status_lead?: string | null;
  observacoes?: string | null;
};

type ClienteModalState = {
  pessoa: PessoaCadastro | null;
  camposPadrao: CampoCadastroPessoa[];
  camposPersonalizados: CampoCadastroPessoa[];
};

type ContatoCadastroNichoActionProps = {
  contato: ContatoConversa | null;
};

export default function ContatoCadastroNichoAction({
  contato,
}: ContatoCadastroNichoActionProps) {
  const { nichoCodigo, permissoes } = useHeaderUser();
  const nicho = getNichoConfig(nichoCodigo);
  const ehSaude = nicho.grupo === "saude";
  const podeVisualizarPaciente = can(permissoes, "prontuarios.visualizar");
  const podeVisualizarCliente = can(permissoes, "pessoas.visualizar");
  const podeCriarPessoa = can(permissoes, "pessoas.criar");
  const podeEditarPessoa = can(permissoes, "pessoas.editar");
  const [carregando, setCarregando] = useState(false);
  const [pacienteId, setPacienteId] = useState("");
  const [cadastroPacienteAberto, setCadastroPacienteAberto] = useState(false);
  const [contatoPaciente, setContatoPaciente] =
    useState<ContatoDisponivelPaciente | null>(null);
  const [clienteModal, setClienteModal] = useState<ClienteModalState | null>(null);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");

  const contatoId = String(contato?.id ?? "").trim();
  const podeExibir = contatoId && (ehSaude ? podeVisualizarPaciente : podeVisualizarCliente);
  const contatoCliente = useMemo<ContatoInicialPessoa>(() => ({
      id: contatoId,
      nome: contato?.nome ?? null,
      whatsapp_profile_name: contato?.whatsapp_profile_name ?? null,
      telefone: contato?.telefone ?? null,
      email: contato?.email ?? null,
      empresa: contato?.empresa ?? null,
      observacoes: contato?.observacoes ?? null,
    }), [
      contato?.email,
      contato?.empresa,
      contato?.nome,
      contato?.observacoes,
      contato?.telefone,
      contato?.whatsapp_profile_name,
      contatoId,
    ]);

  function contatoInicialPaciente(
    pessoa: ContatoDisponivelPaciente["pessoa"] = null,
  ): ContatoDisponivelPaciente {
    return {
      id: contatoId,
      pessoa_id: pessoa?.id ?? null,
      nome: contato?.nome ?? null,
      whatsapp_profile_name: contato?.whatsapp_profile_name ?? null,
      telefone: String(contato?.telefone ?? ""),
      email: contato?.email ?? null,
      empresa: contato?.empresa ?? null,
      origem: contato?.origem ?? null,
      campanha: contato?.campanha ?? null,
      status_lead: contato?.status_lead ?? null,
      classificacao: null,
      observacoes: contato?.observacoes ?? null,
      ultima_interacao_at: null,
      pessoa,
    };
  }

  async function carregarPessoaDoContato() {
    if (!podeVisualizarCliente) return null;
    const params = new URLSearchParams({ contato_id: contatoId, limite: "1" });
    const response = await fetch(`/api/pessoas?${params}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok || !data?.ok) {
      throw new Error(data?.error || "Erro ao carregar o cadastro do contato.");
    }
    return data;
  }

  async function abrirPaciente() {
    const params = new URLSearchParams({ contato_id: contatoId });
    const response = await fetch(`/api/prontuarios?${params}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok || !data?.ok) {
      throw new Error(data?.error || "Erro ao carregar o paciente.");
    }

    const id = String(data.selecionado?.id ?? "").trim();
    if (id) {
      setPacienteId(id);
      return;
    }

    if (!podeCriarPessoa) {
      throw new Error("Este contato ainda não é paciente e você não possui permissão para cadastrá-lo.");
    }

    const pessoa = (data.pessoa_contato ?? null) as
      | ContatoDisponivelPaciente["pessoa"]
      | null;
    setContatoPaciente(contatoInicialPaciente(pessoa));
    setCadastroPacienteAberto(true);
  }

  async function abrirCliente() {
    const data = await carregarPessoaDoContato();
    const pessoa = (data?.pessoas?.[0] ?? null) as PessoaCadastro | null;

    if (!pessoa && !podeCriarPessoa) {
      throw new Error("Este contato ainda não é cliente e você não possui permissão para cadastrá-lo.");
    }

    setClienteModal({
      pessoa,
      camposPadrao: Array.isArray(data?.campos_padrao) ? data.campos_padrao : [],
      camposPersonalizados: Array.isArray(data?.campos_personalizados)
        ? data.campos_personalizados
        : [],
    });
  }

  async function abrirCadastro() {
    if (!contatoId || carregando) return;
    setCarregando(true);
    setErro("");
    setMensagem("");

    try {
      if (ehSaude) await abrirPaciente();
      else await abrirCliente();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao abrir o cadastro.");
    } finally {
      setCarregando(false);
    }
  }

  if (!podeExibir) return null;

  return (
    <>
      <button
        type="button"
        className={styles.whatsContactActionButton}
        onClick={() => void abrirCadastro()}
        disabled={carregando}
        aria-label={`Abrir ${ehSaude ? "paciente" : "cliente"}`}
      >
        <span className={styles.whatsContactActionIcon}>
          <UserRound size={16} strokeWidth={2} />
        </span>
        <span className={styles.whatsContactActionText}>
          {carregando ? "Abrindo..." : ehSaude ? "Paciente" : "Cliente"}
        </span>
      </button>

      {pacienteId ? (
        <PacientesPageClient
          pacienteIdModal={pacienteId}
          onModalClose={() => setPacienteId("")}
        />
      ) : null}

      <CadastroPacienteModal
        aberto={cadastroPacienteAberto}
        nichoNome={nicho.nome}
        podeCarregarCampos={podeVisualizarCliente}
        contatoInicial={contatoPaciente}
        onClose={() => {
          setCadastroPacienteAberto(false);
          setContatoPaciente(null);
        }}
        onCreated={(id, mensagemSucesso) => {
          setCadastroPacienteAberto(false);
          setContatoPaciente(null);
          setMensagem(mensagemSucesso);
          setPacienteId(id);
        }}
      />

      <PessoaCadastroModal
        aberto={Boolean(clienteModal)}
        pessoa={clienteModal?.pessoa ?? null}
        contatoInicial={clienteModal?.pessoa ? null : contatoCliente}
        tituloSingular="Cliente"
        ehSaude={false}
        camposPadrao={clienteModal?.camposPadrao ?? []}
        camposPersonalizados={clienteModal?.camposPersonalizados ?? []}
        podeSalvar={clienteModal?.pessoa ? podeEditarPessoa : podeCriarPessoa}
        onClose={() => setClienteModal(null)}
        onSaved={(_pessoaId, mensagemSucesso) => {
          setClienteModal(null);
          setMensagem(mensagemSucesso);
        }}
      />

      <FeedbackToast
        error={erro}
        success={mensagem}
        onErrorDismiss={() => setErro("")}
        onSuccessDismiss={() => setMensagem("")}
      />
    </>
  );
}
