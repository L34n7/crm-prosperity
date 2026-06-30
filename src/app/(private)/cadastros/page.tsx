"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  UserRound,
  X,
} from "lucide-react";
import Header from "@/components/Header";
import FeedbackToast from "@/components/FeedbackToast";
import { useHeaderUser } from "@/components/header-user-context";
import { formatarTelefoneExibicao } from "@/lib/contatos/normalizar-telefone";
import styles from "./cadastros.module.css";

type NichoContexto = {
  codigo: "comercio" | "imobiliaria" | "medicina" | "odontologia";
  nome: string;
  grupo: "comercial" | "saude";
  cadastroSingular: "Cliente" | "Paciente";
  cadastroPlural: "Clientes" | "Pacientes";
  modulos: string[];
};

type Campo = {
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

type ContatoPessoa = {
  id: string;
  telefone: string;
  whatsapp_profile_name?: string | null;
};

type Paciente = {
  id: string;
  numero_prontuario: string | null;
  convenio: string | null;
  numero_carteirinha: string | null;
  responsavel_nome: string | null;
  dados_personalizados: Record<string, unknown>;
};

type Pessoa = {
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
  contatos: ContatoPessoa[];
  paciente: Paciente | null;
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

function getIniciais(nome: string) {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "PS";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return `${partes[0][0]}${partes[1][0]}`.toUpperCase();
}

function getValorTexto(valor: unknown) {
  if (typeof valor === "boolean") return valor ? "Sim" : "Não";
  if (valor === null || valor === undefined || valor === "") return "—";
  return String(valor);
}

export default function CadastrosPage() {
  const { permissoes } = useHeaderUser();
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [pessoasArquivadas, setPessoasArquivadas] = useState<Pessoa[]>([]);
  const [nicho, setNicho] = useState<NichoContexto | null>(null);
  const [camposPadrao, setCamposPadrao] = useState<Campo[]>([]);
  const [camposPersonalizados, setCamposPersonalizados] = useState<Campo[]>([]);
  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [total, setTotal] = useState(0);
  const [paginaArquivados, setPaginaArquivados] = useState(1);
  const [totalPaginasArquivados, setTotalPaginasArquivados] = useState(1);
  const [totalArquivados, setTotalArquivados] = useState(0);
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [modalCadastro, setModalCadastro] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(FORM_INICIAL);
  const [modalCampos, setModalCampos] = useState(false);
  const [campoNome, setCampoNome] = useState("");
  const [campoTipo, setCampoTipo] = useState<Campo["tipo"]>("texto");
  const [campoEscopo, setCampoEscopo] =
    useState<Campo["escopo"]>("pessoa");
  const [campoObrigatorio, setCampoObrigatorio] = useState(false);
  const [campoOpcoes, setCampoOpcoes] = useState("");
  const [salvandoCampo, setSalvandoCampo] = useState(false);
  const [pessoaParaArquivar, setPessoaParaArquivar] =
    useState<Pessoa | null>(null);
  const [arquivando, setArquivando] = useState(false);
  const [desarquivandoId, setDesarquivandoId] = useState<string | null>(null);

  const podeCriar = permissoes.includes("pessoas.criar");
  const podeEditar = permissoes.includes("pessoas.editar");
  const podeArquivar = permissoes.includes("pessoas.arquivar");
  const podePersonalizar = permissoes.includes(
    "pessoas.campos_personalizados"
  );
  const ehSaude = nicho?.grupo === "saude";
  const tituloPlural = nicho?.cadastroPlural ?? "Cadastros";
  const tituloSingular = nicho?.cadastroSingular ?? "Cadastro";

  const camposDinamicos = useMemo(
    () => [...camposPadrao, ...camposPersonalizados],
    [camposPadrao, camposPersonalizados]
  );

  const carregar = useCallback(async (
    paginaAtivos = pagina,
    paginaDosArquivados = paginaArquivados
  ) => {
    setCarregando(true);
    setErro("");

    try {
      const paramsAtivos = new URLSearchParams({
        pagina: String(paginaAtivos),
        limite: "25",
      });
      const paramsArquivados = new URLSearchParams({
        pagina: String(paginaDosArquivados),
        limite: "25",
        status: "arquivados",
      });

      if (buscaAplicada) {
        paramsAtivos.set("busca", buscaAplicada);
        paramsArquivados.set("busca", buscaAplicada);
      }

      const [responseAtivos, responseArquivados] = await Promise.all([
        fetch(`/api/pessoas?${paramsAtivos}`, { cache: "no-store" }),
        fetch(`/api/pessoas?${paramsArquivados}`, { cache: "no-store" }),
      ]);
      const [dataAtivos, dataArquivados] = await Promise.all([
        responseAtivos.json(),
        responseArquivados.json(),
      ]);

      if (!responseAtivos.ok) {
        throw new Error(
          dataAtivos?.error || "Erro ao carregar cadastros."
        );
      }

      if (!responseArquivados.ok) {
        throw new Error(
          dataArquivados?.error || "Erro ao carregar cadastros arquivados."
        );
      }

      setPessoas(dataAtivos.pessoas ?? []);
      setPessoasArquivadas(dataArquivados.pessoas ?? []);
      setNicho(dataAtivos.contexto?.nicho ?? null);
      setCamposPadrao(dataAtivos.campos_padrao ?? []);
      setCamposPersonalizados(dataAtivos.campos_personalizados ?? []);
      setTotal(dataAtivos.paginacao?.total ?? 0);
      setTotalPaginas(dataAtivos.paginacao?.total_paginas ?? 1);
      setTotalArquivados(dataArquivados.paginacao?.total ?? 0);
      setTotalPaginasArquivados(
        dataArquivados.paginacao?.total_paginas ?? 1
      );
    } catch (error) {
      setErro(
        error instanceof Error ? error.message : "Erro ao carregar cadastros."
      );
    } finally {
      setCarregando(false);
    }
  }, [buscaAplicada, pagina, paginaArquivados]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function atualizarForm<K extends keyof FormState>(
    chave: K,
    valor: FormState[K]
  ) {
    setForm((atual) => ({ ...atual, [chave]: valor }));
  }

  function abrirNovo() {
    setEditandoId(null);
    setForm(FORM_INICIAL);
    setErro("");
    setModalCadastro(true);
  }

  function abrirEdicao(pessoa: Pessoa) {
    const telefones = [
      ...(pessoa.contatos ?? []).map((contato) => contato.telefone),
      "",
      "",
      "",
    ].slice(0, 3);

    setEditandoId(pessoa.id);
    setForm({
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
      telefones,
      dados_personalizados: pessoa.dados_personalizados ?? {},
      paciente: {
        numero_prontuario: pessoa.paciente?.numero_prontuario ?? "",
        convenio: pessoa.paciente?.convenio ?? "",
        numero_carteirinha: pessoa.paciente?.numero_carteirinha ?? "",
        responsavel_nome: pessoa.paciente?.responsavel_nome ?? "",
        dados_personalizados:
          pessoa.paciente?.dados_personalizados ?? {},
      },
    });
    setErro("");
    setModalCadastro(true);
  }

  function atualizarTelefone(indice: number, valor: string) {
    setForm((atual) => ({
      ...atual,
      telefones: atual.telefones.map((telefone, atualIndice) =>
        atualIndice === indice ? valor : telefone
      ),
    }));
  }

  function atualizarCampoDinamico(campo: Campo, valor: unknown) {
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

  function getValorCampo(campo: Campo) {
    return campo.escopo === "paciente"
      ? form.paciente.dados_personalizados[campo.chave]
      : form.dados_personalizados[campo.chave];
  }

  async function salvarCadastro() {
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
        }
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Erro ao salvar cadastro.");
      }

      setMensagem(data.message || "Cadastro salvo com sucesso.");
      setModalCadastro(false);
      await carregar();
    } catch (error) {
      setErro(
        error instanceof Error ? error.message : "Erro ao salvar cadastro."
      );
    } finally {
      setSalvando(false);
    }
  }

  function solicitarArquivamento(pessoa: Pessoa) {
    setErro("");
    setPessoaParaArquivar(pessoa);
  }

  async function arquivarPessoa() {
    if (!pessoaParaArquivar) return;

    setArquivando(true);
    setErro("");

    try {
      const response = await fetch(`/api/pessoas/${pessoaParaArquivar.id}`, {
        method: "DELETE",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Erro ao arquivar cadastro.");
      }

      setMensagem(data.message || "Cadastro arquivado.");
      setPessoaParaArquivar(null);
      setPagina(1);
      setPaginaArquivados(1);
      await carregar(1, 1);
    } catch (error) {
      setErro(
        error instanceof Error ? error.message : "Erro ao arquivar cadastro."
      );
    } finally {
      setArquivando(false);
    }
  }

  async function desarquivarPessoa(pessoa: Pessoa) {
    setDesarquivandoId(pessoa.id);
    setErro("");

    try {
      const response = await fetch(`/api/pessoas/${pessoa.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "desarquivar" }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Erro ao desarquivar cadastro.");
      }

      setMensagem(data.message || "Cadastro desarquivado.");
      setPagina(1);
      setPaginaArquivados(1);
      await carregar(1, 1);
    } catch (error) {
      setErro(
        error instanceof Error
          ? error.message
          : "Erro ao desarquivar cadastro."
      );
    } finally {
      setDesarquivandoId(null);
    }
  }

  async function criarCampo() {
    if (!campoNome.trim()) {
      setErro("Informe o nome do campo.");
      return;
    }

    setSalvandoCampo(true);
    setErro("");

    try {
      const response = await fetch("/api/campos-personalizados", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: campoNome,
          tipo: campoTipo,
          escopo: campoEscopo,
          obrigatorio: campoObrigatorio,
          opcoes: campoOpcoes.split("\n"),
          ordem: camposPersonalizados.length + 1,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Erro ao criar campo.");
      }

      setCampoNome("");
      setCampoTipo("texto");
      setCampoObrigatorio(false);
      setCampoOpcoes("");
      setMensagem(data.message || "Campo criado.");
      await carregar();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao criar campo.");
    } finally {
      setSalvandoCampo(false);
    }
  }

  async function desativarCampo(campo: Campo) {
    if (!campo.id || !window.confirm(`Remover o campo "${campo.nome}"?`)) {
      return;
    }

    const response = await fetch(`/api/campos-personalizados/${campo.id}`, {
      method: "DELETE",
    });
    const data = await response.json();

    if (!response.ok) {
      setErro(data?.error || "Erro ao remover campo.");
      return;
    }

    setMensagem(data.message || "Campo removido.");
    await carregar();
  }

  function renderCampo(campo: Campo) {
    const valor = getValorCampo(campo);

    if (campo.tipo === "booleano") {
      return (
        <label key={`${campo.escopo}-${campo.chave}`} className={styles.checkField}>
          <input
            type="checkbox"
            checked={valor === true}
            onChange={(event) =>
              atualizarCampoDinamico(campo, event.target.checked)
            }
          />
          <span>
            {campo.nome}
            {campo.obrigatorio ? " *" : ""}
          </span>
        </label>
      );
    }

    return (
      <label key={`${campo.escopo}-${campo.chave}`} className={styles.field}>
        <span>
          {campo.nome}
          {campo.obrigatorio ? " *" : ""}
        </span>
        {campo.tipo === "select" ? (
          <select
            value={getValorTexto(valor) === "—" ? "" : String(valor)}
            onChange={(event) =>
              atualizarCampoDinamico(campo, event.target.value)
            }
          >
            <option value="">Selecione</option>
            {(campo.opcoes ?? []).map((opcao) => (
              <option key={opcao} value={opcao}>
                {opcao}
              </option>
            ))}
          </select>
        ) : campo.tipo === "texto_longo" ? (
          <textarea
            value={valor == null ? "" : String(valor)}
            onChange={(event) =>
              atualizarCampoDinamico(campo, event.target.value)
            }
          />
        ) : (
          <input
            type={
              campo.tipo === "numero"
                ? "number"
                : campo.tipo === "data"
                  ? "date"
                  : "text"
            }
            value={valor == null ? "" : String(valor)}
            onChange={(event) =>
              atualizarCampoDinamico(campo, event.target.value)
            }
          />
        )}
      </label>
    );
  }

  function renderPessoaCard(pessoa: Pessoa, arquivada = false) {
    return (
      <article
        key={pessoa.id}
        className={`${styles.personCard} ${
          arquivada ? styles.archivedCard : ""
        }`}
      >
        <div className={styles.avatar}>{getIniciais(pessoa.nome)}</div>
        <div className={styles.personMain}>
          <div className={styles.personTitle}>
            <h3>{pessoa.nome}</h3>
            {pessoa.paciente?.numero_prontuario ? (
              <span className={styles.recordBadge}>
                {pessoa.paciente.numero_prontuario}
              </span>
            ) : null}
            {arquivada ? (
              <span className={styles.archivedBadge}>Arquivado</span>
            ) : null}
          </div>
          <p>
            {pessoa.cpf_cnpj || "Documento não informado"}
            {pessoa.email ? ` · ${pessoa.email}` : ""}
          </p>
          <div className={styles.contactList}>
            {(pessoa.contatos ?? []).length > 0 ? (
              pessoa.contatos.map((contato) => (
                <span key={contato.id}>
                  {formatarTelefoneExibicao(contato.telefone)}
                </span>
              ))
            ) : (
              <span>Sem contato vinculado</span>
            )}
          </div>
        </div>
        <div className={styles.personActions}>
          {arquivada ? (
            podeArquivar ? (
              <button
                type="button"
                className={styles.restoreButton}
                onClick={() => void desarquivarPessoa(pessoa)}
                disabled={desarquivandoId === pessoa.id}
              >
                <ArchiveRestore size={16} />
                {desarquivandoId === pessoa.id
                  ? "Desarquivando..."
                  : "Desarquivar"}
              </button>
            ) : null
          ) : (
            <>
              {podeEditar ? (
                <button
                  type="button"
                  title="Editar"
                  onClick={() => abrirEdicao(pessoa)}
                >
                  <Pencil size={17} />
                </button>
              ) : null}
              {podeArquivar ? (
                <button
                  type="button"
                  title="Arquivar"
                  onClick={() => solicitarArquivamento(pessoa)}
                >
                  <Archive size={17} />
                </button>
              ) : null}
            </>
          )}
        </div>
      </article>
    );
  }

  return (
    <>
      <Header
        title={tituloPlural}
        subtitle={`Cadastros da empresa adaptados ao segmento ${nicho?.nome ?? "configurado"}.`}
      />

      <main className={styles.page}>
        <section className={styles.toolbar}>
          <div className={styles.searchArea}>
            <input
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  setPagina(1);
                  setPaginaArquivados(1);
                  setBuscaAplicada(busca.trim());
                }
              }}
              placeholder={`Buscar ${tituloSingular.toLowerCase()} por nome, documento ou email`}
            />
            <button
              type="button"
              onClick={() => {
                setPagina(1);
                setPaginaArquivados(1);
                setBuscaAplicada(busca.trim());
              }}
            >
              Buscar
            </button>
          </div>

          <div className={styles.toolbarActions}>
            {podeCriar ? (
              <button
                type="button"
                className={styles.primaryButton}
                onClick={abrirNovo}
              >
                <Plus size={18} />
                Cadastrar {tituloSingular.toLowerCase()}
              </button>
            ) : null}
          </div>
        </section>

        {erro && !modalCadastro && !modalCampos && !pessoaParaArquivar ? (
          <div className={styles.error}>{erro}</div>
        ) : null}

        <section className={styles.listCard}>
          <div className={styles.listHeader}>
            <div>
              <span className={styles.eyebrow}>Base cadastral</span>
              <h2>{tituloPlural}</h2>
            </div>
            <span className={styles.totalBadge}>{total} registros</span>
          </div>

          {carregando ? (
            <div className={styles.empty}>Carregando cadastros...</div>
          ) : pessoas.length === 0 ? (
            <div className={styles.empty}>
              Nenhum {tituloSingular.toLowerCase()} encontrado.
            </div>
          ) : (
            <div className={styles.list}>
              {pessoas.map((pessoa) => renderPessoaCard(pessoa))}
            </div>
          )}

          {total > 0 ? (
            <div className={styles.pagination}>
              <button
                type="button"
                disabled={pagina <= 1}
                onClick={() => setPagina((atual) => Math.max(1, atual - 1))}
              >
                <ChevronLeft size={17} />
              </button>
              <span>
                Página {pagina} de {totalPaginas}
              </span>
              <button
                type="button"
                disabled={pagina >= totalPaginas}
                onClick={() =>
                  setPagina((atual) => Math.min(totalPaginas, atual + 1))
                }
              >
                <ChevronRight size={17} />
              </button>
            </div>
          ) : null}

          {totalArquivados > 0 ? (
            <section className={styles.archivedSection}>
              <div className={styles.archivedDivider}>
                <span>Arquivados</span>
                <small>{totalArquivados} registros</small>
              </div>

              <div className={styles.list}>
                {pessoasArquivadas.map((pessoa) =>
                  renderPessoaCard(pessoa, true)
                )}
              </div>

              {totalPaginasArquivados > 1 ? (
                <div className={styles.pagination}>
                  <button
                    type="button"
                    disabled={paginaArquivados <= 1}
                    onClick={() =>
                      setPaginaArquivados((atual) => Math.max(1, atual - 1))
                    }
                  >
                    <ChevronLeft size={17} />
                  </button>
                  <span>
                    Página {paginaArquivados} de {totalPaginasArquivados}
                  </span>
                  <button
                    type="button"
                    disabled={paginaArquivados >= totalPaginasArquivados}
                    onClick={() =>
                      setPaginaArquivados((atual) =>
                        Math.min(totalPaginasArquivados, atual + 1)
                      )
                    }
                  >
                    <ChevronRight size={17} />
                  </button>
                </div>
              ) : null}
            </section>
          ) : null}
        </section>
      </main>

      {modalCadastro ? (
        <div className={styles.overlay} onMouseDown={() => setModalCadastro(false)}>
          <section
            className={styles.modal}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className={styles.modalHeader}>
              <div>
                <span className={styles.eyebrow}>
                  {editandoId ? "Editar cadastro" : "Novo cadastro"}
                </span>
                <h2>
                  {editandoId ? `Editar ${tituloSingular}` : `Cadastrar ${tituloSingular}`}
                </h2>
              </div>
              <button type="button" onClick={() => setModalCadastro(false)}>
                <X size={20} />
              </button>
            </header>

            <div className={styles.modalBody}>
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
                      onChange={(event) =>
                        atualizarForm(
                          "tipo_pessoa",
                          event.target.value as FormState["tipo_pessoa"]
                        )
                      }
                    >
                      <option value="fisica">Pessoa física</option>
                      <option value="juridica">Pessoa jurídica</option>
                    </select>
                  </label>
                ) : null}
                <label className={styles.field}>
                  <span>Nome *</span>
                  <input
                    value={form.nome}
                    onChange={(event) => atualizarForm("nome", event.target.value)}
                  />
                </label>
                {form.tipo_pessoa === "juridica" && !ehSaude ? (
                  <label className={styles.field}>
                    <span>Razão social</span>
                    <input
                      value={form.razao_social}
                      onChange={(event) =>
                        atualizarForm("razao_social", event.target.value)
                      }
                    />
                  </label>
                ) : (
                  <>
                    <label className={styles.field}>
                      <span>Nome social</span>
                      <input
                        value={form.nome_social}
                        onChange={(event) =>
                          atualizarForm("nome_social", event.target.value)
                        }
                      />
                    </label>
                    <label className={styles.field}>
                      <span>Data de nascimento</span>
                      <input
                        type="date"
                        value={form.data_nascimento}
                        onChange={(event) =>
                          atualizarForm("data_nascimento", event.target.value)
                        }
                      />
                    </label>
                  </>
                )}
                <label className={styles.field}>
                  <span>{form.tipo_pessoa === "juridica" ? "CNPJ" : "CPF"}</span>
                  <input
                    value={form.cpf_cnpj}
                    onChange={(event) =>
                      atualizarForm("cpf_cnpj", event.target.value)
                    }
                  />
                </label>
                <label className={styles.field}>
                  <span>E-mail</span>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(event) => atualizarForm("email", event.target.value)}
                  />
                </label>
                {editandoId ? (
                  <label className={styles.field}>
                    <span>Status</span>
                    <select
                      value={form.status}
                      onChange={(event) =>
                        atualizarForm(
                          "status",
                          event.target.value as FormState["status"]
                        )
                      }
                    >
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
                      onChange={(event) =>
                        atualizarTelefone(indice, event.target.value)
                      }
                      placeholder="(00) 00000-0000"
                    />
                  </label>
                ))}
              </div>

              <div className={styles.sectionTitle}>
                <h3>Endereço</h3>
              </div>
              <div className={styles.formGrid}>
                {(
                  [
                    ["cep", "CEP"],
                    ["logradouro", "Logradouro"],
                    ["numero", "Número"],
                    ["complemento", "Complemento"],
                    ["bairro", "Bairro"],
                    ["cidade", "Cidade"],
                    ["estado", "Estado"],
                  ] as Array<[keyof FormState, string]>
                ).map(([chave, label]) => (
                  <label key={String(chave)} className={styles.field}>
                    <span>{label}</span>
                    <input
                      value={String(form[chave] ?? "")}
                      onChange={(event) =>
                        atualizarForm(chave, event.target.value as never)
                      }
                      maxLength={chave === "estado" ? 2 : undefined}
                    />
                  </label>
                ))}
              </div>

              {ehSaude ? (
                <>
                  <div className={styles.sectionTitle}>
                    <h3>Dados do paciente</h3>
                  </div>
                  <div className={styles.formGrid}>
                    <label className={styles.field}>
                      <span>Número do prontuário</span>
                      <input
                        value={form.paciente.numero_prontuario}
                        placeholder="Gerado automaticamente"
                        onChange={(event) =>
                          setForm((atual) => ({
                            ...atual,
                            paciente: {
                              ...atual.paciente,
                              numero_prontuario: event.target.value,
                            },
                          }))
                        }
                      />
                    </label>
                    {[
                      ["convenio", "Convênio"],
                      ["numero_carteirinha", "Número da carteirinha"],
                      ["responsavel_nome", "Nome do responsável"],
                    ].map(([chave, label]) => (
                      <label key={chave} className={styles.field}>
                        <span>{label}</span>
                        <input
                          value={String(
                            form.paciente[
                              chave as keyof typeof form.paciente
                            ] ?? ""
                          )}
                          onChange={(event) =>
                            setForm((atual) => ({
                              ...atual,
                              paciente: {
                                ...atual.paciente,
                                [chave]: event.target.value,
                              },
                            }))
                          }
                        />
                      </label>
                    ))}
                  </div>
                </>
              ) : null}

              {camposDinamicos.length > 0 ? (
                <>
                  <div className={styles.sectionTitle}>
                    <h3>Informações adicionais</h3>
                  </div>
                  <div className={styles.formGrid}>
                    {camposDinamicos.map(renderCampo)}
                  </div>
                </>
              ) : null}

              <label className={`${styles.field} ${styles.fullField}`}>
                <span>Observações</span>
                <textarea
                  value={form.observacoes}
                  onChange={(event) =>
                    atualizarForm("observacoes", event.target.value)
                  }
                />
              </label>

              {erro ? <div className={styles.error}>{erro}</div> : null}
            </div>

            <footer className={styles.modalFooter}>
              <div className={styles.modalFooterStart}>
                {podePersonalizar ? (
                  <button
                    type="button"
                    className={styles.subtleButton}
                    onClick={() => setModalCampos(true)}
                  >
                    + Campo
                  </button>
                ) : null}
              </div>
              <div className={styles.modalFooterActions}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => setModalCadastro(false)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() => void salvarCadastro()}
                  disabled={salvando}
                >
                  {salvando ? "Salvando..." : "Salvar cadastro"}
                </button>
              </div>
            </footer>
          </section>
        </div>
      ) : null}

      {pessoaParaArquivar ? (
        <div
          className={styles.overlay}
          onMouseDown={() => {
            if (!arquivando) setPessoaParaArquivar(null);
          }}
        >
          <section
            className={`${styles.modal} ${styles.confirmModal}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirmar-arquivamento-titulo"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className={styles.confirmBody}>
              <div className={styles.confirmIcon}>
                <Archive size={22} />
              </div>
              <div>
                <span className={styles.eyebrow}>Confirmar arquivamento</span>
                <h2 id="confirmar-arquivamento-titulo">
                  Arquivar {pessoaParaArquivar.nome}?
                </h2>
                <p>
                  O cadastro será movido para a seção “Arquivados” e poderá ser
                  restaurado depois.
                </p>
              </div>
            </div>

            {erro ? <div className={styles.confirmError}>{erro}</div> : null}

            <footer className={styles.confirmFooter}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setPessoaParaArquivar(null)}
                disabled={arquivando}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={styles.dangerButton}
                onClick={() => void arquivarPessoa()}
                disabled={arquivando}
              >
                {arquivando ? "Arquivando..." : "Arquivar"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {modalCampos ? (
        <div className={styles.overlay} onMouseDown={() => setModalCampos(false)}>
          <section
            className={`${styles.modal} ${styles.fieldsModal}`}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className={styles.modalHeader}>
              <div>
                <span className={styles.eyebrow}>Personalização</span>
                <h2>Campos do cadastro</h2>
              </div>
              <button type="button" onClick={() => setModalCampos(false)}>
                <X size={20} />
              </button>
            </header>
            <div className={styles.modalBody}>
              <div className={styles.formGrid}>
                <label className={styles.field}>
                  <span>Nome do campo</span>
                  <input
                    value={campoNome}
                    onChange={(event) => setCampoNome(event.target.value)}
                  />
                </label>
                <label className={styles.field}>
                  <span>Tipo</span>
                  <select
                    value={campoTipo}
                    onChange={(event) =>
                      setCampoTipo(event.target.value as Campo["tipo"])
                    }
                  >
                    <option value="texto">Texto</option>
                    <option value="texto_longo">Texto longo</option>
                    <option value="numero">Número</option>
                    <option value="data">Data</option>
                    <option value="booleano">Sim ou não</option>
                    <option value="select">Lista de opções</option>
                  </select>
                </label>
                {ehSaude ? (
                  <label className={styles.field}>
                    <span>Seção</span>
                    <select
                      value={campoEscopo}
                      onChange={(event) =>
                        setCampoEscopo(event.target.value as Campo["escopo"])
                      }
                    >
                      <option value="pessoa">Cadastro geral</option>
                      <option value="paciente">Dados do paciente</option>
                    </select>
                  </label>
                ) : null}
                <label className={styles.checkField}>
                  <input
                    type="checkbox"
                    checked={campoObrigatorio}
                    onChange={(event) =>
                      setCampoObrigatorio(event.target.checked)
                    }
                  />
                  <span>Campo obrigatório</span>
                </label>
                {campoTipo === "select" ? (
                  <label className={`${styles.field} ${styles.fullField}`}>
                    <span>Opções, uma por linha</span>
                    <textarea
                      value={campoOpcoes}
                      onChange={(event) => setCampoOpcoes(event.target.value)}
                    />
                  </label>
                ) : null}
              </div>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => void criarCampo()}
                disabled={salvandoCampo}
              >
                <Plus size={17} />
                {salvandoCampo ? "Criando..." : "Adicionar campo"}
              </button>

              <div className={styles.customFieldsList}>
                {camposPersonalizados.length === 0 ? (
                  <p>Nenhum campo personalizado.</p>
                ) : (
                  camposPersonalizados.map((campo) => (
                    <div key={campo.id}>
                      <span>
                        <strong>{campo.nome}</strong>
                        <small>
                          {campo.tipo} ·{" "}
                          {campo.escopo === "paciente"
                            ? "Dados do paciente"
                            : "Cadastro geral"}
                        </small>
                      </span>
                      <button
                        type="button"
                        onClick={() => void desativarCampo(campo)}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))
                )}
              </div>
              {erro ? <div className={styles.error}>{erro}</div> : null}
            </div>
          </section>
        </div>
      ) : null}

      {mensagem ? (
        <FeedbackToast
          success={mensagem}
          onSuccessDismiss={() => setMensagem("")}
        />
      ) : null}
    </>
  );
}
