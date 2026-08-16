"use client";

import { useEffect, useMemo, useState } from "react";
import { UserPlus, X } from "lucide-react";
import styles from "./CadastroPacienteModal.module.css";

type Campo = {
  id?: string;
  chave: string;
  nome: string;
  tipo: "texto" | "texto_longo" | "numero" | "data" | "booleano" | "select";
  escopo: "pessoa" | "paciente";
  obrigatorio?: boolean;
  opcoes?: string[];
  ativo?: boolean;
};

type FormPaciente = {
  nome: string;
  telefone: string;
  email: string;
  cpf_cnpj: string;
  data_nascimento: string;
  observacoes: string;
  convenio: string;
  numero_carteirinha: string;
  responsavel_nome: string;
  numero_prontuario: string;
  dados_pessoa: Record<string, unknown>;
  dados_paciente: Record<string, unknown>;
};

type CadastroPacienteModalProps = {
  aberto: boolean;
  nichoNome: string;
  podeCarregarCampos: boolean;
  onClose: () => void;
  onCreated: (pacienteId: string, mensagem: string) => void | Promise<void>;
};

const FORM_INICIAL: FormPaciente = {
  nome: "",
  telefone: "",
  email: "",
  cpf_cnpj: "",
  data_nascimento: "",
  observacoes: "",
  convenio: "",
  numero_carteirinha: "",
  responsavel_nome: "",
  numero_prontuario: "",
  dados_pessoa: {},
  dados_paciente: {},
};

function normalizarCampos(campos: Campo[]) {
  const unicos = new Map<string, Campo>();

  campos.forEach((campo) => {
    if (campo?.ativo === false) return;
    if (!campo?.chave || !campo?.nome || !campo?.escopo) return;
    unicos.set(`${campo.escopo}:${campo.chave}`, campo);
  });

  return Array.from(unicos.values());
}

export default function CadastroPacienteModal({
  aberto,
  nichoNome,
  podeCarregarCampos,
  onClose,
  onCreated,
}: CadastroPacienteModalProps) {
  const [form, setForm] = useState<FormPaciente>(FORM_INICIAL);
  const [campos, setCampos] = useState<Campo[]>([]);
  const [carregandoCampos, setCarregandoCampos] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const camposPessoa = useMemo(
    () => campos.filter((campo) => campo.escopo === "pessoa"),
    [campos],
  );
  const camposPaciente = useMemo(
    () => campos.filter((campo) => campo.escopo === "paciente"),
    [campos],
  );

  useEffect(() => {
    if (!aberto) return;

    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !salvando) onClose();
    }

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = overflowAnterior;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [aberto, onClose, salvando]);

  useEffect(() => {
    if (!aberto) return;

    setForm(FORM_INICIAL);
    setErro("");

    if (!podeCarregarCampos) {
      setCampos([]);
      return;
    }

    let ativo = true;
    setCarregandoCampos(true);

    void fetch("/api/pessoas?limite=1", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || !data?.ok) return [] as Campo[];

        const padrao = Array.isArray(data.campos_padrao) ? data.campos_padrao : [];
        const personalizados = Array.isArray(data.campos_personalizados)
          ? data.campos_personalizados
          : [];

        return normalizarCampos([...padrao, ...personalizados] as Campo[]);
      })
      .then((resultado) => {
        if (ativo) setCampos(resultado);
      })
      .catch(() => {
        if (ativo) setCampos([]);
      })
      .finally(() => {
        if (ativo) setCarregandoCampos(false);
      });

    return () => {
      ativo = false;
    };
  }, [aberto, podeCarregarCampos]);

  function atualizarCampoDinamico(campo: Campo, valor: unknown) {
    if (campo.escopo === "paciente") {
      setForm((atual) => ({
        ...atual,
        dados_paciente: {
          ...atual.dados_paciente,
          [campo.chave]: valor,
        },
      }));
      return;
    }

    setForm((atual) => ({
      ...atual,
      dados_pessoa: {
        ...atual.dados_pessoa,
        [campo.chave]: valor,
      },
    }));
  }

  function valorCampo(campo: Campo) {
    const fonte = campo.escopo === "paciente" ? form.dados_paciente : form.dados_pessoa;
    return fonte[campo.chave];
  }

  function renderCampo(campo: Campo) {
    const valor = valorCampo(campo);
    const label = (
      <span>
        {campo.nome}
        {campo.obrigatorio ? <em> *</em> : null}
      </span>
    );

    if (campo.tipo === "booleano") {
      return (
        <label key={`${campo.escopo}:${campo.chave}`} className={styles.checkboxField}>
          <input
            type="checkbox"
            checked={Boolean(valor)}
            onChange={(event) => atualizarCampoDinamico(campo, event.target.checked)}
          />
          {label}
        </label>
      );
    }

    if (campo.tipo === "texto_longo") {
      return (
        <label key={`${campo.escopo}:${campo.chave}`} className={`${styles.field} ${styles.fullField}`}>
          {label}
          <textarea
            value={String(valor ?? "")}
            required={campo.obrigatorio}
            onChange={(event) => atualizarCampoDinamico(campo, event.target.value)}
          />
        </label>
      );
    }

    if (campo.tipo === "select") {
      return (
        <label key={`${campo.escopo}:${campo.chave}`} className={styles.field}>
          {label}
          <select
            value={String(valor ?? "")}
            required={campo.obrigatorio}
            onChange={(event) => atualizarCampoDinamico(campo, event.target.value)}
          >
            <option value="">Selecione</option>
            {(campo.opcoes ?? []).map((opcao) => (
              <option key={opcao} value={opcao}>
                {opcao}
              </option>
            ))}
          </select>
        </label>
      );
    }

    return (
      <label key={`${campo.escopo}:${campo.chave}`} className={styles.field}>
        {label}
        <input
          type={campo.tipo === "data" ? "date" : campo.tipo === "numero" ? "number" : "text"}
          value={String(valor ?? "")}
          required={campo.obrigatorio}
          onChange={(event) => atualizarCampoDinamico(campo, event.target.value)}
        />
      </label>
    );
  }

  async function salvar(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.nome.trim()) {
      setErro("Informe o nome do paciente.");
      return;
    }

    setSalvando(true);
    setErro("");

    try {
      const response = await fetch("/api/pessoas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo_pessoa: "fisica",
          nome: form.nome,
          email: form.email,
          cpf_cnpj: form.cpf_cnpj,
          data_nascimento: form.data_nascimento,
          observacoes: form.observacoes,
          telefones: form.telefone.trim() ? [form.telefone] : [],
          dados_personalizados: form.dados_pessoa,
          paciente: {
            numero_prontuario: form.numero_prontuario,
            convenio: form.convenio,
            numero_carteirinha: form.numero_carteirinha,
            responsavel_nome: form.responsavel_nome,
            dados_personalizados: form.dados_paciente,
          },
        }),
      });
      const data = await response.json();

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Erro ao cadastrar paciente.");
      }

      const pacienteId = String(data.paciente_id ?? "").trim();
      if (!pacienteId) {
        throw new Error("Paciente cadastrado, mas o vínculo clínico não foi retornado.");
      }

      setForm(FORM_INICIAL);
      await onCreated(
        pacienteId,
        data.message || "Paciente cadastrado com sucesso.",
      );
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao cadastrar paciente.");
    } finally {
      setSalvando(false);
    }
  }

  if (!aberto) return null;

  return (
    <div className={styles.overlay} onMouseDown={() => !salvando && onClose()}>
      <section
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cadastro-paciente-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className={styles.header}>
          <div className={styles.headerIdentity}>
            <span className={styles.iconWrap}>
              <UserPlus size={20} strokeWidth={2.2} />
            </span>
            <div>
              <span className={styles.eyebrow}>Novo paciente · {nichoNome}</span>
              <h2 id="cadastro-paciente-title">Cadastrar paciente</h2>
              <p>Cadastre os dados essenciais sem sair da gestão clínica.</p>
            </div>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            disabled={salvando}
            aria-label="Fechar cadastro de paciente"
          >
            <X size={20} strokeWidth={2.2} />
          </button>
        </header>

        <form className={styles.form} onSubmit={salvar}>
          <div className={styles.body}>
            {erro ? <div className={styles.error}>{erro}</div> : null}

            <section className={styles.section}>
              <div className={styles.sectionTitle}>
                <span>01</span>
                <div>
                  <h3>Identificação e contato</h3>
                  <p>Informações principais usadas no CRM e no relacionamento com o paciente.</p>
                </div>
              </div>
              <div className={styles.grid}>
                <label className={`${styles.field} ${styles.fullField}`}>
                  <span>Nome completo <em>*</em></span>
                  <input
                    autoFocus
                    value={form.nome}
                    required
                    onChange={(event) => setForm((atual) => ({ ...atual, nome: event.target.value }))}
                    placeholder="Nome do paciente"
                  />
                </label>
                <label className={styles.field}>
                  <span>Telefone / WhatsApp</span>
                  <input
                    value={form.telefone}
                    onChange={(event) => setForm((atual) => ({ ...atual, telefone: event.target.value }))}
                    placeholder="(31) 99999-9999"
                    inputMode="tel"
                  />
                </label>
                <label className={styles.field}>
                  <span>E-mail</span>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(event) => setForm((atual) => ({ ...atual, email: event.target.value }))}
                    placeholder="paciente@email.com"
                  />
                </label>
                <label className={styles.field}>
                  <span>CPF / documento</span>
                  <input
                    value={form.cpf_cnpj}
                    onChange={(event) => setForm((atual) => ({ ...atual, cpf_cnpj: event.target.value }))}
                  />
                </label>
                <label className={styles.field}>
                  <span>Data de nascimento</span>
                  <input
                    type="date"
                    value={form.data_nascimento}
                    onChange={(event) => setForm((atual) => ({ ...atual, data_nascimento: event.target.value }))}
                  />
                </label>
                {camposPessoa.map(renderCampo)}
              </div>
            </section>

            <section className={styles.section}>
              <div className={styles.sectionTitle}>
                <span>02</span>
                <div>
                  <h3>Dados do paciente</h3>
                  <p>Informações administrativas vinculadas à extensão clínica do cadastro.</p>
                </div>
              </div>
              <div className={styles.grid}>
                <label className={styles.field}>
                  <span>Convênio</span>
                  <input
                    value={form.convenio}
                    onChange={(event) => setForm((atual) => ({ ...atual, convenio: event.target.value }))}
                  />
                </label>
                <label className={styles.field}>
                  <span>Nº da carteirinha</span>
                  <input
                    value={form.numero_carteirinha}
                    onChange={(event) => setForm((atual) => ({ ...atual, numero_carteirinha: event.target.value }))}
                  />
                </label>
                <label className={styles.field}>
                  <span>Responsável</span>
                  <input
                    value={form.responsavel_nome}
                    onChange={(event) => setForm((atual) => ({ ...atual, responsavel_nome: event.target.value }))}
                    placeholder="Quando aplicável"
                  />
                </label>
                <label className={styles.field}>
                  <span>Nº do prontuário</span>
                  <input
                    value={form.numero_prontuario}
                    onChange={(event) => setForm((atual) => ({ ...atual, numero_prontuario: event.target.value }))}
                    placeholder="Deixe em branco para gerar automaticamente"
                  />
                </label>
                {camposPaciente.map(renderCampo)}
              </div>
              {carregandoCampos ? (
                <p className={styles.loadingFields}>Carregando campos configurados para a clínica...</p>
              ) : null}
            </section>

            <section className={styles.section}>
              <div className={styles.sectionTitle}>
                <span>03</span>
                <div>
                  <h3>Observações gerais</h3>
                  <p>Anotações administrativas do cadastro. Evoluções clínicas ficam no prontuário.</p>
                </div>
              </div>
              <label className={`${styles.field} ${styles.fullField}`}>
                <span>Observações</span>
                <textarea
                  value={form.observacoes}
                  onChange={(event) => setForm((atual) => ({ ...atual, observacoes: event.target.value }))}
                  placeholder="Informações úteis para a equipe"
                />
              </label>
            </section>
          </div>

          <footer className={styles.footer}>
            <button type="button" className={styles.cancelButton} onClick={onClose} disabled={salvando}>
              Cancelar
            </button>
            <button type="submit" className={styles.saveButton} disabled={salvando}>
              <UserPlus size={17} strokeWidth={2.2} />
              {salvando ? "Cadastrando..." : "Cadastrar paciente"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
