"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  X,
} from "lucide-react";
import Header from "@/components/Header";
import FeedbackToast from "@/components/FeedbackToast";
import { useHeaderUser } from "@/components/header-user-context";
import PessoaCadastroModal, {
  type CampoCadastroPessoa,
  type PessoaCadastro,
} from "@/components/cadastros/PessoaCadastroModal";
import { formatarTelefoneExibicao } from "@/lib/contatos/normalizar-telefone";
import type { NichoCodigo } from "@/lib/nichos/config";
import styles from "./cadastros.module.css";

type NichoContexto = {
  codigo: NichoCodigo;
  nome: string;
  grupo: "comercial" | "saude";
  cadastroSingular: "Cliente" | "Paciente";
  cadastroPlural: "Clientes" | "Pacientes";
  modulos: string[];
};

type Campo = CampoCadastroPessoa;
type Pessoa = PessoaCadastro;

function getIniciais(nome: string) {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "PS";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return `${partes[0][0]}${partes[1][0]}`.toUpperCase();
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
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [modalCadastro, setModalCadastro] = useState(false);
  const [pessoaEditando, setPessoaEditando] = useState<Pessoa | null>(null);
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
      const pessoaIdSolicitada = new URLSearchParams(
        window.location.search
      ).get("pessoa_id");
      const contatoIdSolicitado = new URLSearchParams(
        window.location.search
      ).get("contato_id");

      if (pessoaIdSolicitada) {
        paramsAtivos.set("pessoa_id", pessoaIdSolicitada);
        paramsArquivados.set("pessoa_id", pessoaIdSolicitada);
      }
      if (contatoIdSolicitado) {
        paramsAtivos.set("contato_id", contatoIdSolicitado);
        paramsArquivados.set("contato_id", contatoIdSolicitado);
      }

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

  function abrirNovo() {
    setPessoaEditando(null);
    setErro("");
    setModalCadastro(true);
  }

  function abrirEdicao(pessoa: Pessoa) {
    setPessoaEditando(pessoa);
    setErro("");
    setModalCadastro(true);
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
            {ehSaude && pessoa.paciente?.numero_prontuario ? (
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

      <PessoaCadastroModal
        aberto={modalCadastro}
        pessoa={pessoaEditando}
        tituloSingular={tituloSingular}
        ehSaude={ehSaude}
        camposPadrao={camposPadrao}
        camposPersonalizados={camposPersonalizados}
        podeSalvar={pessoaEditando ? podeEditar : podeCriar}
        podePersonalizar={podePersonalizar}
        onOpenCampos={() => setModalCampos(true)}
        onClose={() => setModalCadastro(false)}
        onSaved={async (_pessoaId, mensagemSucesso) => {
          setMensagem(mensagemSucesso);
          setModalCadastro(false);
          await carregar();
        }}
      />

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
