"use client";

import { useEffect, useMemo, useState } from "react";
import { UserRound, X } from "lucide-react";
import styles from "@/app/(private)/cadastros/cadastros.module.css";

export type CampoCadastroPessoa = {
  id?: string;
  chave: string;
  nome: string;
  tipo:
    | "texto"
    | "texto_longo"
    | "numero"
    | "data"
    | "booleano"
    | "select";
  escopo: "pessoa" | "paciente";
  obrigatorio?: boolean;
  opcoes?: string[];
  ativo?: boolean;
};

export type PessoaCadastro = {
  id: string;
  tipo_pessoa: "fisica" | "juridica";
  nome: string;
  nome_social: string | null;
  razao_social: string | null;
  cpf_cnpj: string | null;
  data_nascimento: string | null;
  email: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  observacoes: string | null;
  dados_personalizados: Record<string, unknown>;
  status: "ativo" | "inativo" | "arquivado";
  contatos: Array<{
    id: string;
    telefone: string;
    whatsapp_profile_name?: string | null;
  }>;
  paciente: {
    id: string;
    numero_prontuario: string | null;
    convenio: string | null;
    numero_carteirinha: string | null;
    responsavel_nome: string | null;
    dados_personalizados: Record<string, unknown>;
  } | null;
};

export type ContatoInicialPessoa = {
  id: string;
  nome?: string | null;
  whatsapp_profile_name?: string | null;
  telefone?: string | null;
  email?: string | null;
  empresa?: string | null;
  observacoes?: string | null;
};

type FormState = {
  tipo_pessoa: "fisica" | "juridica";
  nome: string;
  nome_social: string;
  razao_social: string;
  cpf_cnpj: string;
  data_nascimento: string;
  email: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
  observacoes: string;
  status: "ativo" | "inativo";
  telefones: string[];
  dados_personalizados: Record<string, unknown>;
  paciente: {
    numero_prontuario: string;
    convenio: string;
    numero_carteirinha: string;
    responsavel_nome: string;
    dados_personalizados: Record<string, unknown>;
  };
};

type PessoaCadastroModalProps = {
  aberto: boolean;
  pessoa?: PessoaCadastro | null;
  contatoInicial?: ContatoInicialPessoa | null;
  tituloSingular: string;
  ehSaude: boolean;
  camposPadrao?: CampoCadastroPessoa[];
  camposPersonalizados?: CampoCadastroPessoa[];
  podeSalvar: boolean;
  podePersonalizar?: boolean;
  onClose: () => void;
  onSaved: (pessoaId: string, mensagem: string) => void | Promise<void>;
  onOpenCampos?: () => void;
};

const FORM_INICIAL: FormState = {
  tipo_pessoa: "fisica",
  nome: "",
  nome_social: "",
  razao_social: "",
  cpf_cnpj: "",
  data_nascimento: "",
  email: "",
  cep: "",
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  estado: "",
  observacoes: "",
  status: "ativo",
  telefones: ["", "", ""],
  dados_personalizados: {},
  paciente: {
    numero_prontuario: "",
    convenio: "",
    numero_carteirinha: "",
    responsavel_nome: "",
    dados_personalizados: {},
  },
};

function criarFormPessoa(pessoa?: PessoaCadastro | null): FormState {
  if (!pessoa) return { ...FORM_INICIAL, telefones: [...FORM_INICIAL.telefones] };

  return {
    tipo_pessoa: pessoa.tipo_pessoa,
    nome: pessoa.nome,
    nome_social: pessoa.nome_social ?? "",
    razao_social: pessoa.razao_social ?? "",
    cpf_cnpj: pessoa.cpf_cnpj ?? "",
    data_nascimento: pessoa.data_nascimento ?? "",
    email: pessoa.email ?? "",
    cep: pessoa.cep ?? "",
    logradouro: pessoa.logradouro ?? "",
    numero: pessoa.numero ?? "",
    complemento: pessoa.complemento ?? "",
    bairro: pessoa.bairro ?? "",
    cidade: pessoa.cidade ?? "",
    estado: pessoa.estado ?? "",
    observacoes: pessoa.observacoes ?? "",
    status: pessoa.status === "inativo" ? "inativo" : "ativo",
    telefones: [
      ...(pessoa.contatos ?? []).map((contato) => contato.telefone),
      "",
      "",
      "",
    ].slice(0, 3),
    dados_personalizados: pessoa.dados_personalizados ?? {},
    paciente: {
      numero_prontuario: pessoa.paciente?.numero_prontuario ?? "",
      convenio: pessoa.paciente?.convenio ?? "",
      numero_carteirinha: pessoa.paciente?.numero_carteirinha ?? "",
      responsavel_nome: pessoa.paciente?.responsavel_nome ?? "",
      dados_personalizados: pessoa.paciente?.dados_personalizados ?? {},
    },
  };
}

function criarFormContato(contato?: ContatoInicialPessoa | null): FormState {
  const inicial = criarFormPessoa();
  if (!contato) return inicial;

  const nomeWhatsApp = String(contato.whatsapp_profile_name ?? "").trim();
  const empresa = String(contato.empresa ?? "").trim();
  const observacoes = [
    String(contato.observacoes ?? "").trim(),
    empresa ? `Empresa informada no contato: ${empresa}` : "",
  ].filter(Boolean);

  return {
    ...inicial,
    nome: String(contato.nome ?? "").trim() || nomeWhatsApp,
    nome_social: nomeWhatsApp,
    email: String(contato.email ?? "").trim(),
    observacoes: observacoes.join("\n\n"),
    telefones: [String(contato.telefone ?? "").trim(), "", ""],
  };
}

function valorExibicao(valor: unknown) {
  if (valor === null || valor === undefined) return "";
  return String(valor);
}

export default function PessoaCadastroModal({
  aberto,
  pessoa = null,
  contatoInicial = null,
  tituloSingular,
  ehSaude,
  camposPadrao = [],
  camposPersonalizados = [],
  podeSalvar,
  podePersonalizar = false,
  onClose,
  onSaved,
  onOpenCampos,
}: PessoaCadastroModalProps) {
  const [form, setForm] = useState<FormState>(FORM_INICIAL);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const editandoId = pessoa?.id ?? null;
  const camposDinamicos = useMemo(
    () => [...camposPadrao, ...camposPersonalizados],
    [camposPadrao, camposPersonalizados],
  );

  useEffect(() => {
    if (!aberto) return;
    setForm(pessoa ? criarFormPessoa(pessoa) : criarFormContato(contatoInicial));
    setErro("");
  }, [aberto, contatoInicial, pessoa]);

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

  function atualizarForm<K extends keyof FormState>(chave: K, valor: FormState[K]) {
    setForm((atual) => ({ ...atual, [chave]: valor }));
  }

  function atualizarTelefone(indice: number, valor: string) {
    setForm((atual) => ({
      ...atual,
      telefones: atual.telefones.map((telefone, atualIndice) =>
        atualIndice === indice ? valor : telefone,
      ),
    }));
  }

  function atualizarCampoDinamico(campo: CampoCadastroPessoa, valor: unknown) {
    setForm((atual) => {
      if (campo.escopo === "paciente") {
        return {
          ...atual,
          paciente: {
            ...atual.paciente,
            dados_personalizados: {
              ...atual.paciente.dados_personalizados,
              [campo.chave]: valor,
            },
          },
        };
      }

      return {
        ...atual,
        dados_personalizados: {
          ...atual.dados_personalizados,
          [campo.chave]: valor,
        },
      };
    });
  }

  function getValorCampo(campo: CampoCadastroPessoa) {
    return campo.escopo === "paciente"
      ? form.paciente.dados_personalizados[campo.chave]
      : form.dados_personalizados[campo.chave];
  }

  function renderCampo(campo: CampoCadastroPessoa) {
    const valor = getValorCampo(campo);

    if (campo.tipo === "booleano") {
      return (
        <label key={`${campo.escopo}-${campo.chave}`} className={styles.checkField}>
          <input
            type="checkbox"
            checked={valor === true}
            onChange={(event) => atualizarCampoDinamico(campo, event.target.checked)}
          />
          <span>{campo.nome}{campo.obrigatorio ? " *" : ""}</span>
        </label>
      );
    }

    return (
      <label key={`${campo.escopo}-${campo.chave}`} className={styles.field}>
        <span>{campo.nome}{campo.obrigatorio ? " *" : ""}</span>
        {campo.tipo === "select" ? (
          <select
            value={valorExibicao(valor)}
            onChange={(event) => atualizarCampoDinamico(campo, event.target.value)}
          >
            <option value="">Selecione</option>
            {(campo.opcoes ?? []).map((opcao) => (
              <option key={opcao} value={opcao}>{opcao}</option>
            ))}
          </select>
        ) : campo.tipo === "texto_longo" ? (
          <textarea
            value={valorExibicao(valor)}
            onChange={(event) => atualizarCampoDinamico(campo, event.target.value)}
          />
        ) : (
          <input
            type={campo.tipo === "numero" ? "number" : campo.tipo === "data" ? "date" : "text"}
            value={valorExibicao(valor)}
            onChange={(event) => atualizarCampoDinamico(campo, event.target.value)}
          />
        )}
      </label>
    );
  }

  async function salvarCadastro() {
    if (!podeSalvar) return;
    if (!form.nome.trim()) {
      setErro("Informe o nome.");
      return;
    }

    setSalvando(true);
    setErro("");

    try {
      const response = await fetch(
        editandoId ? `/api/pessoas/${editandoId}` : "/api/pessoas",
        {
          method: editandoId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        },
      );
      const data = await response.json();
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Erro ao salvar cadastro.");
      }

      const pessoaId = String(data.pessoa_id ?? editandoId ?? "").trim();
      await onSaved(pessoaId, data.message || "Cadastro salvo com sucesso.");
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao salvar cadastro.");
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
        aria-labelledby="cadastro-pessoa-modal-titulo"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className={styles.modalHeader}>
          <div>
            <span className={styles.eyebrow}>
              {editandoId ? (podeSalvar ? "Editar cadastro" : "Visualizar cadastro") : "Novo cadastro"}
            </span>
            <h2 id="cadastro-pessoa-modal-titulo">
              {editandoId
                ? `${podeSalvar ? "Editar" : "Visualizar"} ${tituloSingular}`
                : `Cadastrar ${tituloSingular}`}
            </h2>
          </div>
          <button type="button" onClick={onClose} disabled={salvando} aria-label="Fechar cadastro">
            <X size={20} />
          </button>
        </header>

        <fieldset
          className={`${styles.modalBody} ${styles.modalFieldset}`}
          disabled={!podeSalvar || salvando}
        >
          <div className={styles.sectionTitle}>
            <UserRound size={18} />
            <h3>Identificação</h3>
          </div>
          <div className={styles.formGrid}>
            {!ehSaude ? (
              <label className={styles.field}>
                <span>Tipo de pessoa</span>
                <select
                  value={form.tipo_pessoa}
                  onChange={(event) => atualizarForm("tipo_pessoa", event.target.value as FormState["tipo_pessoa"])}
                >
                  <option value="fisica">Pessoa física</option>
                  <option value="juridica">Pessoa jurídica</option>
                </select>
              </label>
            ) : null}
            <label className={styles.field}>
              <span>Nome *</span>
              <input value={form.nome} onChange={(event) => atualizarForm("nome", event.target.value)} />
            </label>
            {form.tipo_pessoa === "juridica" && !ehSaude ? (
              <label className={styles.field}>
                <span>Razão social</span>
                <input value={form.razao_social} onChange={(event) => atualizarForm("razao_social", event.target.value)} />
              </label>
            ) : (
              <>
                <label className={styles.field}>
                  <span>Nome social</span>
                  <input value={form.nome_social} onChange={(event) => atualizarForm("nome_social", event.target.value)} />
                </label>
                <label className={styles.field}>
                  <span>Data de nascimento</span>
                  <input type="date" value={form.data_nascimento} onChange={(event) => atualizarForm("data_nascimento", event.target.value)} />
                </label>
              </>
            )}
            <label className={styles.field}>
              <span>{form.tipo_pessoa === "juridica" ? "CNPJ" : "CPF"}</span>
              <input value={form.cpf_cnpj} onChange={(event) => atualizarForm("cpf_cnpj", event.target.value)} />
            </label>
            <label className={styles.field}>
              <span>E-mail</span>
              <input type="email" value={form.email} onChange={(event) => atualizarForm("email", event.target.value)} />
            </label>
            {editandoId ? (
              <label className={styles.field}>
                <span>Status</span>
                <select value={form.status} onChange={(event) => atualizarForm("status", event.target.value as FormState["status"])}>
                  <option value="ativo">Ativo</option>
                  <option value="inativo">Inativo</option>
                </select>
              </label>
            ) : null}
          </div>

          <div className={styles.sectionTitle}>
            <h3>Contatos vinculados</h3>
            <small>Até três números; contatos existentes serão reaproveitados.</small>
          </div>
          <div className={styles.formGrid}>
            {form.telefones.map((telefone, indice) => (
              <label key={indice} className={styles.field}>
                <span>Telefone {indice + 1}</span>
                <input
                  value={telefone}
                  onChange={(event) => atualizarTelefone(indice, event.target.value)}
                  placeholder="(00) 00000-0000"
                />
              </label>
            ))}
          </div>

          <div className={styles.sectionTitle}><h3>Endereço</h3></div>
          <div className={styles.formGrid}>
            {([
              ["cep", "CEP"],
              ["logradouro", "Logradouro"],
              ["numero", "Número"],
              ["complemento", "Complemento"],
              ["bairro", "Bairro"],
              ["cidade", "Cidade"],
              ["estado", "Estado"],
            ] as Array<[keyof FormState, string]>).map(([chave, label]) => (
              <label key={String(chave)} className={styles.field}>
                <span>{label}</span>
                <input
                  value={String(form[chave] ?? "")}
                  onChange={(event) => atualizarForm(chave, event.target.value as never)}
                  maxLength={chave === "estado" ? 2 : undefined}
                />
              </label>
            ))}
          </div>

          {ehSaude ? (
            <>
              <div className={styles.sectionTitle}><h3>Dados do paciente</h3></div>
              <div className={styles.formGrid}>
                <label className={styles.field}>
                  <span>Número do prontuário</span>
                  <input
                    value={form.paciente.numero_prontuario}
                    placeholder="Gerado automaticamente"
                    onChange={(event) => setForm((atual) => ({
                      ...atual,
                      paciente: { ...atual.paciente, numero_prontuario: event.target.value },
                    }))}
                  />
                </label>
                {([
                  ["convenio", "Convênio"],
                  ["numero_carteirinha", "Número da carteirinha"],
                  ["responsavel_nome", "Nome do responsável"],
                ] as const).map(([chave, label]) => (
                  <label key={chave} className={styles.field}>
                    <span>{label}</span>
                    <input
                      value={form.paciente[chave]}
                      onChange={(event) => setForm((atual) => ({
                        ...atual,
                        paciente: { ...atual.paciente, [chave]: event.target.value },
                      }))}
                    />
                  </label>
                ))}
              </div>
            </>
          ) : null}

          {camposDinamicos.length > 0 ? (
            <>
              <div className={styles.sectionTitle}><h3>Informações adicionais</h3></div>
              <div className={styles.formGrid}>{camposDinamicos.map(renderCampo)}</div>
            </>
          ) : null}

          <label className={`${styles.field} ${styles.fullField}`}>
            <span>Observações</span>
            <textarea value={form.observacoes} onChange={(event) => atualizarForm("observacoes", event.target.value)} />
          </label>

          {erro ? <div className={styles.error}>{erro}</div> : null}
        </fieldset>

        <footer className={styles.modalFooter}>
          <div className={styles.modalFooterStart}>
            {podeSalvar && podePersonalizar && onOpenCampos ? (
              <button type="button" className={styles.subtleButton} onClick={onOpenCampos}>+ Campo</button>
            ) : null}
          </div>
          <div className={styles.modalFooterActions}>
            <button type="button" className={styles.secondaryButton} onClick={onClose} disabled={salvando}>
              {podeSalvar ? "Cancelar" : "Fechar"}
            </button>
            {podeSalvar ? (
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => void salvarCadastro()}
                disabled={salvando}
              >
                {salvando ? "Salvando..." : "Salvar cadastro"}
              </button>
            ) : null}
          </div>
        </footer>
      </section>
    </div>
  );
}
