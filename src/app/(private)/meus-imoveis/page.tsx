"use client";

import { useCallback, useEffect, useState } from "react";
import Header from "@/components/Header";
import FeedbackToast from "@/components/FeedbackToast";
import { useHeaderUser } from "@/components/header-user-context";
import styles from "../imoveis/imoveis.module.css";
import IntegracoesImobiliarias, {
  type PublicacaoImovelResumo,
} from "../imoveis/IntegracoesImobiliarias";

type PessoaOpcao = {
  id: string;
  nome: string;
  cpf_cnpj: string | null;
  email: string | null;
};

type Imovel = {
  id: string;
  proprietario_pessoa_id: string | null;
  titulo: string;
  codigo: string | null;
  tipo: string;
  finalidade: string;
  status: string;
  valor: number | string | null;
  valor_condominio: number | string | null;
  valor_iptu: number | string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  quartos: number | null;
  suites: number | null;
  banheiros: number | null;
  vagas: number | null;
  area_m2: number | string | null;
  descricao: string | null;
  proprietario?: PessoaOpcao | null;
  publicacoes?: PublicacaoImovelResumo[];
  total_leads_portal?: number;
};

type FormImovel = {
  proprietario_pessoa_id: string;
  titulo: string;
  codigo: string;
  tipo: string;
  finalidade: string;
  status: string;
  valor: string;
  valor_condominio: string;
  valor_iptu: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
  quartos: string;
  suites: string;
  banheiros: string;
  vagas: string;
  area_m2: string;
  descricao: string;
};

const FORM_INICIAL: FormImovel = {
  proprietario_pessoa_id: "",
  titulo: "",
  codigo: "",
  tipo: "apartamento",
  finalidade: "venda",
  status: "disponivel",
  valor: "",
  valor_condominio: "",
  valor_iptu: "",
  cep: "",
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  estado: "",
  quartos: "",
  suites: "",
  banheiros: "",
  vagas: "",
  area_m2: "",
  descricao: "",
};

function valorTexto(valor: unknown) {
  if (valor === null || valor === undefined) return "";
  return String(valor);
}

function formFromImovel(imovel: Imovel): FormImovel {
  return {
    proprietario_pessoa_id: imovel.proprietario_pessoa_id ?? "",
    titulo: imovel.titulo ?? "",
    codigo: imovel.codigo ?? "",
    tipo: imovel.tipo ?? "apartamento",
    finalidade: imovel.finalidade ?? "venda",
    status: imovel.status ?? "disponivel",
    valor: valorTexto(imovel.valor),
    valor_condominio: valorTexto(imovel.valor_condominio),
    valor_iptu: valorTexto(imovel.valor_iptu),
    cep: imovel.cep ?? "",
    logradouro: imovel.logradouro ?? "",
    numero: imovel.numero ?? "",
    complemento: imovel.complemento ?? "",
    bairro: imovel.bairro ?? "",
    cidade: imovel.cidade ?? "",
    estado: imovel.estado ?? "",
    quartos: valorTexto(imovel.quartos),
    suites: valorTexto(imovel.suites),
    banheiros: valorTexto(imovel.banheiros),
    vagas: valorTexto(imovel.vagas),
    area_m2: valorTexto(imovel.area_m2),
    descricao: imovel.descricao ?? "",
  };
}

function formatarMoeda(valor: number | string | null) {
  const numero = Number(valor ?? 0);

  if (!Number.isFinite(numero) || numero <= 0) return "Valor não informado";

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(numero);
}

function labelFinalidade(valor: string) {
  const labels: Record<string, string> = {
    venda: "Venda",
    locacao: "Locação",
    venda_locacao: "Venda ou locação",
  };

  return labels[valor] ?? valor;
}

function labelStatus(valor: string) {
  const labels: Record<string, string> = {
    disponivel: "Disponível",
    reservado: "Reservado",
    vendido: "Vendido",
    alugado: "Alugado",
    inativo: "Inativo",
  };

  return labels[valor] ?? valor;
}

export default function MeusImoveisPage() {
  const { permissoes } = useHeaderUser();
  const [imoveis, setImoveis] = useState<Imovel[]>([]);
  const [pessoas, setPessoas] = useState<PessoaOpcao[]>([]);
  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [total, setTotal] = useState(0);
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [form, setForm] = useState<FormImovel>(FORM_INICIAL);

  const podeCriar = permissoes.includes("imoveis.criar");
  const podeEditar = permissoes.includes("imoveis.editar");
  const podeArquivar = permissoes.includes("imoveis.arquivar");
  const podeSalvar = editandoId ? podeEditar : podeCriar;

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");

    try {
      const params = new URLSearchParams({
        pagina: String(pagina),
        limite: "24",
      });

      if (buscaAplicada) params.set("busca", buscaAplicada);

      const response = await fetch(`/api/imoveis?${params}`, {
        cache: "no-store",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Erro ao carregar imóveis.");
      }

      setImoveis(data.imoveis ?? []);
      setPessoas(data.pessoas ?? []);
      setTotal(data.paginacao?.total ?? 0);
      setTotalPaginas(data.paginacao?.total_paginas ?? 1);
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao carregar imóveis.");
    } finally {
      setCarregando(false);
    }
  }, [buscaAplicada, pagina]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function atualizarForm<K extends keyof FormImovel>(chave: K, valor: string) {
    setForm((atual) => ({ ...atual, [chave]: valor }));
  }

  function novoImovel() {
    setEditandoId(null);
    setForm(FORM_INICIAL);
    setErro("");
  }

  function editarImovel(imovel: Imovel) {
    setEditandoId(imovel.id);
    setForm(formFromImovel(imovel));
    setErro("");
  }

  async function salvarImovel() {
    if (!form.titulo.trim()) {
      setErro("Informe o título do imóvel.");
      return;
    }

    setSalvando(true);
    setErro("");

    try {
      const response = await fetch(
        editandoId ? `/api/imoveis/${editandoId}` : "/api/imoveis",
        {
          method: editandoId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        }
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Erro ao salvar imóvel.");
      }

      setMensagem(data.message || "Imóvel salvo com sucesso.");
      setEditandoId(null);
      setForm(FORM_INICIAL);
      await carregar();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao salvar imóvel.");
    } finally {
      setSalvando(false);
    }
  }

  async function arquivarImovel(imovel: Imovel) {
    if (!window.confirm(`Arquivar o imóvel "${imovel.titulo}"?`)) return;

    setErro("");

    try {
      const response = await fetch(`/api/imoveis/${imovel.id}`, {
        method: "DELETE",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Erro ao arquivar imóvel.");
      }

      setMensagem(data.message || "Imóvel arquivado.");
      if (editandoId === imovel.id) novoImovel();
      await carregar();
    } catch (error) {
      setErro(
        error instanceof Error ? error.message : "Erro ao arquivar imóvel."
      );
    }
  }

  return (
    <>
      <Header
        title="Meus imóveis"
        subtitle="Cadastre, gerencie e publique os imóveis da sua empresa."
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
                  setBuscaAplicada(busca.trim());
                }
              }}
              placeholder="Buscar imóvel por título, código, bairro ou cidade"
            />
            <button
              type="button"
              onClick={() => {
                setPagina(1);
                setBuscaAplicada(busca.trim());
              }}
            >
              Buscar
            </button>
          </div>

          {podeCriar ? (
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={novoImovel}
            >
              Novo imóvel
            </button>
          ) : null}
        </section>

        {erro ? <div className={styles.error}>{erro}</div> : null}

        <section className={styles.twoColumns}>
          <div className={styles.contentCard}>
            <div className={styles.cardHeader}>
              <div>
                <span className={styles.eyebrow}>Carteira imobiliária</span>
                <h2>Imóveis cadastrados</h2>
                <p>{total} registros encontrados.</p>
              </div>
              <span className={styles.badge}>
                Página {pagina} de {totalPaginas}
              </span>
            </div>

            {carregando ? (
              <div className={styles.empty}>Carregando imóveis...</div>
            ) : imoveis.length === 0 ? (
              <div className={styles.empty}>
                Nenhum imóvel encontrado. Cadastre o primeiro imóvel à direita.
              </div>
            ) : (
              <div className={styles.propertyGrid}>
                {imoveis.map((imovel) => (
                  <article key={imovel.id} className={styles.itemCard}>
                    <div className={styles.itemHeader}>
                      <div>
                        <h3>{imovel.titulo}</h3>
                        <p className={styles.muted}>
                          {imovel.bairro || "Bairro não informado"}
                          {imovel.cidade ? ` · ${imovel.cidade}` : ""}
                        </p>
                      </div>
                      <span className={styles.statusBadge}>
                        {labelStatus(imovel.status)}
                      </span>
                    </div>

                    <div className={styles.itemMeta}>
                      <span>{labelFinalidade(imovel.finalidade)}</span>
                      <span>{formatarMoeda(imovel.valor)}</span>
                      {imovel.quartos ? <span>{imovel.quartos} quartos</span> : null}
                      {imovel.vagas ? <span>{imovel.vagas} vagas</span> : null}
                      {imovel.area_m2 ? <span>{imovel.area_m2} m²</span> : null}
                      {imovel.total_leads_portal ? (
                        <span>{imovel.total_leads_portal} leads de portal</span>
                      ) : null}
                    </div>

                    <p className={styles.muted}>
                      Proprietário: {imovel.proprietario?.nome ?? "Não vinculado"}
                    </p>

                    <div className={styles.itemActions}>
                      {podeEditar ? (
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          onClick={() => editarImovel(imovel)}
                        >
                          Editar
                        </button>
                      ) : null}
                      {podeArquivar ? (
                        <button
                          type="button"
                          className={styles.dangerButton}
                          onClick={() => void arquivarImovel(imovel)}
                        >
                          Arquivar
                        </button>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            )}

            <div className={styles.itemActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={pagina <= 1}
                onClick={() => setPagina((atual) => Math.max(1, atual - 1))}
              >
                Anterior
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={pagina >= totalPaginas}
                onClick={() =>
                  setPagina((atual) => Math.min(totalPaginas, atual + 1))
                }
              >
                Próxima
              </button>
            </div>
          </div>

          <aside className={styles.formCard}>
            <div className={styles.cardHeader}>
              <div>
                <span className={styles.eyebrow}>
                  {editandoId ? "Editar imóvel" : "Novo imóvel"}
                </span>
                <h2>{editandoId ? "Atualizar cadastro" : "Cadastrar imóvel"}</h2>
                <p>
                  O proprietário é uma pessoa cadastrada em Clientes. O imóvel
                  fica em tabela própria do nicho imobiliário.
                </p>
              </div>
            </div>

            <div className={styles.formGrid}>
              <label className={`${styles.field} ${styles.fullField}`}>
                <span>Título *</span>
                <input
                  value={form.titulo}
                  onChange={(event) => atualizarForm("titulo", event.target.value)}
                  placeholder="Ex.: Apartamento 2 quartos no Centro"
                />
              </label>

              <label className={styles.field}>
                <span>Código interno</span>
                <input
                  value={form.codigo}
                  onChange={(event) => atualizarForm("codigo", event.target.value)}
                />
              </label>

              <label className={styles.field}>
                <span>Proprietário</span>
                <select
                  value={form.proprietario_pessoa_id}
                  onChange={(event) =>
                    atualizarForm("proprietario_pessoa_id", event.target.value)
                  }
                >
                  <option value="">Não vinculado</option>
                  {pessoas.map((pessoa) => (
                    <option key={pessoa.id} value={pessoa.id}>
                      {pessoa.nome}
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.field}>
                <span>Tipo</span>
                <select
                  value={form.tipo}
                  onChange={(event) => atualizarForm("tipo", event.target.value)}
                >
                  <option value="apartamento">Apartamento</option>
                  <option value="casa">Casa</option>
                  <option value="terreno">Terreno</option>
                  <option value="sala_comercial">Sala comercial</option>
                  <option value="galpao">Galpão</option>
                  <option value="outro">Outro</option>
                </select>
              </label>

              <label className={styles.field}>
                <span>Finalidade</span>
                <select
                  value={form.finalidade}
                  onChange={(event) =>
                    atualizarForm("finalidade", event.target.value)
                  }
                >
                  <option value="venda">Venda</option>
                  <option value="locacao">Locação</option>
                  <option value="venda_locacao">Venda ou locação</option>
                </select>
              </label>

              <label className={styles.field}>
                <span>Status</span>
                <select
                  value={form.status}
                  onChange={(event) => atualizarForm("status", event.target.value)}
                >
                  <option value="disponivel">Disponível</option>
                  <option value="reservado">Reservado</option>
                  <option value="vendido">Vendido</option>
                  <option value="alugado">Alugado</option>
                  <option value="inativo">Inativo</option>
                </select>
              </label>

              {(
                [
                  ["valor", "Valor"],
                  ["valor_condominio", "Condomínio"],
                  ["valor_iptu", "IPTU"],
                  ["area_m2", "Área m²"],
                  ["quartos", "Quartos"],
                  ["suites", "Suítes"],
                  ["banheiros", "Banheiros"],
                  ["vagas", "Vagas"],
                ] as Array<[keyof FormImovel, string]>
              ).map(([chave, label]) => (
                <label key={chave} className={styles.field}>
                  <span>{label}</span>
                  <input
                    value={form[chave]}
                    onChange={(event) => atualizarForm(chave, event.target.value)}
                  />
                </label>
              ))}

              {(
                [
                  ["cep", "CEP"],
                  ["logradouro", "Logradouro"],
                  ["numero", "Número"],
                  ["complemento", "Complemento"],
                  ["bairro", "Bairro"],
                  ["cidade", "Cidade"],
                  ["estado", "Estado"],
                ] as Array<[keyof FormImovel, string]>
              ).map(([chave, label]) => (
                <label key={chave} className={styles.field}>
                  <span>{label}</span>
                  <input
                    value={form[chave]}
                    maxLength={chave === "estado" ? 2 : undefined}
                    onChange={(event) => atualizarForm(chave, event.target.value)}
                  />
                </label>
              ))}

              <label className={`${styles.field} ${styles.fullField}`}>
                <span>Descrição</span>
                <textarea
                  value={form.descricao}
                  onChange={(event) =>
                    atualizarForm("descricao", event.target.value)
                  }
                />
              </label>
            </div>

            <div className={styles.itemActions}>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => void salvarImovel()}
                disabled={salvando || !podeSalvar}
              >
                {salvando ? "Salvando..." : "Salvar imóvel"}
              </button>
              {editandoId ? (
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={novoImovel}
                >
                  Cancelar edição
                </button>
              ) : null}
            </div>

            {!podeSalvar ? (
              <p className={styles.muted}>
                Seu usuário não possui permissão para salvar imóveis.
              </p>
            ) : null}
          </aside>
        </section>

        <IntegracoesImobiliarias
          imoveis={imoveis}
          permissoes={permissoes}
          onChanged={carregar}
          onError={setErro}
          onMessage={setMensagem}
        />
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
