"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bath,
  BedDouble,
  Building2,
  Cable,
  Car,
  ChevronLeft,
  ChevronRight,
  Eye,
  Images,
  ListChecks,
  MapPin,
  MessageSquareText,
  Pencil,
  Plus,
  Ruler,
  Search,
  SlidersHorizontal,
  UploadCloud,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import FeedbackToast from "@/components/FeedbackToast";
import { useHeaderUser } from "@/components/header-user-context";
import type { PublicacaoImovelResumo } from "../imoveis/IntegracoesImobiliarias";
import { getStatusPublicacaoLabel } from "@/lib/imoveis/publicacao";
import ImoveisOperacoesModais from "./ImoveisOperacoesModais";
import styles from "./meus-imoveis.module.css";

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
  caracteristicas?: Record<string, unknown> | null;
  fotos?: unknown[] | null;
  imagem_url?: string | null;
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
  fotos: string;
};

type FiltrosImoveis = {
  tipo: string;
  finalidade: string;
  status: string;
  cidade: string;
  estado: string;
  quartosMin: string;
  valorMin: string;
  valorMax: string;
  areaMin: string;
  areaMax: string;
  ordenacao: string;
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
  fotos: "",
};

const FILTROS_INICIAIS: FiltrosImoveis = {
  tipo: "",
  finalidade: "",
  status: "",
  cidade: "",
  estado: "",
  quartosMin: "",
  valorMin: "",
  valorMax: "",
  areaMin: "",
  areaMax: "",
  ordenacao: "recentes",
};

const TIPOS_IMOVEL = [
  ["apartamento", "Apartamento"],
  ["casa", "Casa"],
  ["terreno", "Terreno"],
  ["sala_comercial", "Sala comercial"],
  ["galpao", "Galpão"],
  ["outro", "Outro"],
] as const;

const loaderImagem = ({ src }: { src: string }) => src;

function valorTexto(valor: unknown) {
  return valor === null || valor === undefined ? "" : String(valor);
}

function normalizarUrlFoto(valor: unknown) {
  const texto = String(valor ?? "").trim();
  if (!texto) return null;

  try {
    const url = new URL(texto);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function fotosDoImovel(imovel: Imovel) {
  const fotos = Array.isArray(imovel.fotos)
    ? imovel.fotos
        .map((foto) => {
          if (typeof foto === "string") return normalizarUrlFoto(foto);
          if (!foto || typeof foto !== "object") return null;
          const item = foto as Record<string, unknown>;
          return normalizarUrlFoto(item.url ?? item.src ?? item.original);
        })
        .filter((url): url is string => Boolean(url))
    : [];
  const capa = normalizarUrlFoto(imovel.imagem_url);
  return Array.from(new Set([...(capa ? [capa] : []), ...fotos]));
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
    fotos: fotosDoImovel(imovel).join("\n"),
  };
}

function formatarMoeda(valor: number | string | null) {
  const numero = Number(valor ?? 0);
  return !Number.isFinite(numero) || numero <= 0
    ? "Valor não informado"
    : new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
        maximumFractionDigits: 0,
      }).format(numero);
}

function formatarMoedaDetalhada(valor: number | string | null) {
  const numero = Number(valor ?? 0);
  return !Number.isFinite(numero) || numero <= 0
    ? "Não informado"
    : new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(numero);
}

function labelFinalidade(valor: string) {
  return (
    {
      venda: "Venda",
      locacao: "Locação",
      venda_locacao: "Venda ou locação",
    } as Record<string, string>
  )[valor] ?? valor;
}

function labelStatus(valor: string) {
  return (
    {
      disponivel: "Disponível",
      reservado: "Reservado",
      vendido: "Vendido",
      alugado: "Alugado",
      inativo: "Inativo",
    } as Record<string, string>
  )[valor] ?? valor;
}

function labelTipo(valor: string) {
  return TIPOS_IMOVEL.find(([codigo]) => codigo === valor)?.[1] ?? valor;
}

function formatarChave(valor: string) {
  const texto = valor.replace(/[_-]+/g, " ").trim();
  return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : valor;
}

function caracteristicasDoImovel(imovel: Imovel) {
  if (!imovel.caracteristicas) return [];

  return Object.entries(imovel.caracteristicas).flatMap(([chave, valor]) => {
    if (valor === false || valor === null || valor === undefined || valor === "") {
      return [];
    }
    if (valor === true) return [formatarChave(chave)];
    if (["string", "number"].includes(typeof valor)) {
      return [`${formatarChave(chave)}: ${String(valor)}`];
    }
    return [];
  });
}

function enderecoDoImovel(imovel: Imovel) {
  const linha = [imovel.logradouro, imovel.numero].filter(Boolean).join(", ");
  const localidade = [imovel.bairro, imovel.cidade, imovel.estado]
    .filter(Boolean)
    .join(" · ");
  return [linha, localidade].filter(Boolean).join(" — ") || "Endereço não informado";
}

function statusPublicacaoClass(status?: string | null) {
  if (status === "publicado") return styles.statusSuccess;
  if (status === "rejeitado") return styles.statusDanger;
  if (status === "pendente" || status === "em_analise") {
    return styles.statusWarning;
  }
  return styles.statusMuted;
}

function statusImovelClass(status?: string | null) {
  if (status === "disponivel") return styles.statusSuccess;
  if (status === "reservado") return styles.statusWarning;
  if (status === "vendido" || status === "alugado") return styles.statusInfo;
  return styles.statusMuted;
}

export default function MeusImoveisPage() {
  const router = useRouter();
  const { permissoes } = useHeaderUser();
  const [imoveis, setImoveis] = useState<Imovel[]>([]);
  const [pessoas, setPessoas] = useState<PessoaOpcao[]>([]);
  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [total, setTotal] = useState(0);
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [filtros, setFiltros] = useState<FiltrosImoveis>(FILTROS_INICIAIS);
  const [filtrosAplicados, setFiltrosAplicados] =
    useState<FiltrosImoveis>(FILTROS_INICIAIS);
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [form, setForm] = useState<FormImovel>(FORM_INICIAL);
  const [modalCadastro, setModalCadastro] = useState(false);
  const [modalOperacao, setModalOperacao] = useState<
    "publicacao" | "fila" | "leads" | null
  >(null);
  const [imovelOperacaoId, setImovelOperacaoId] = useState<string | null>(null);
  const [imovelDetalhe, setImovelDetalhe] = useState<Imovel | null>(null);
  const [fotoAtiva, setFotoAtiva] = useState(0);

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
        ordenacao: filtrosAplicados.ordenacao,
      });
      if (buscaAplicada) params.set("busca", buscaAplicada);
      if (filtrosAplicados.tipo) params.set("tipo", filtrosAplicados.tipo);
      if (filtrosAplicados.finalidade) {
        params.set("finalidade", filtrosAplicados.finalidade);
      }
      if (filtrosAplicados.status) params.set("status", filtrosAplicados.status);
      if (filtrosAplicados.cidade) params.set("cidade", filtrosAplicados.cidade);
      if (filtrosAplicados.estado) params.set("estado", filtrosAplicados.estado);
      if (filtrosAplicados.quartosMin) {
        params.set("quartos_min", filtrosAplicados.quartosMin);
      }
      if (filtrosAplicados.valorMin) {
        params.set("valor_min", filtrosAplicados.valorMin);
      }
      if (filtrosAplicados.valorMax) {
        params.set("valor_max", filtrosAplicados.valorMax);
      }
      if (filtrosAplicados.areaMin) {
        params.set("area_min", filtrosAplicados.areaMin);
      }
      if (filtrosAplicados.areaMax) {
        params.set("area_max", filtrosAplicados.areaMax);
      }

      const response = await fetch(`/api/imoveis?${params}`, {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Erro ao carregar imóveis.");

      setImoveis(data.imoveis ?? []);
      setPessoas(data.pessoas ?? []);
      setTotal(data.paginacao?.total ?? 0);
      setTotalPaginas(data.paginacao?.total_paginas ?? 1);
    } catch (error) {
      setErro(
        error instanceof Error ? error.message : "Erro ao carregar imóveis."
      );
    } finally {
      setCarregando(false);
    }
  }, [buscaAplicada, filtrosAplicados, pagina]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const fotosDetalhe = imovelDetalhe ? fotosDoImovel(imovelDetalhe) : [];

  useEffect(() => {
    if (!imovelDetalhe) return;

    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function aoPressionarTecla(event: KeyboardEvent) {
      if (event.key === "Escape") setImovelDetalhe(null);
      if (event.key === "ArrowLeft" && fotosDetalhe.length > 1) {
        setFotoAtiva((atual) =>
          atual === 0 ? fotosDetalhe.length - 1 : atual - 1
        );
      }
      if (event.key === "ArrowRight" && fotosDetalhe.length > 1) {
        setFotoAtiva((atual) => (atual + 1) % fotosDetalhe.length);
      }
    }

    document.addEventListener("keydown", aoPressionarTecla);
    return () => {
      document.body.style.overflow = overflowAnterior;
      document.removeEventListener("keydown", aoPressionarTecla);
    };
  }, [fotosDetalhe.length, imovelDetalhe]);

  const quantidadeFiltrosAtivos = useMemo(
    () =>
      Object.entries(filtrosAplicados).filter(
        ([chave, valor]) => chave !== "ordenacao" && Boolean(valor)
      ).length + (buscaAplicada ? 1 : 0),
    [buscaAplicada, filtrosAplicados]
  );

  const chipsFiltros = useMemo(() => {
    const chips: string[] = [];
    if (buscaAplicada) chips.push(`Busca: ${buscaAplicada}`);
    if (filtrosAplicados.tipo) chips.push(labelTipo(filtrosAplicados.tipo));
    if (filtrosAplicados.finalidade) {
      chips.push(labelFinalidade(filtrosAplicados.finalidade));
    }
    if (filtrosAplicados.status) chips.push(labelStatus(filtrosAplicados.status));
    if (filtrosAplicados.cidade) chips.push(filtrosAplicados.cidade);
    if (filtrosAplicados.estado) chips.push(filtrosAplicados.estado.toUpperCase());
    if (filtrosAplicados.quartosMin) {
      chips.push(`${filtrosAplicados.quartosMin}+ quartos`);
    }
    if (filtrosAplicados.valorMin) {
      chips.push(`A partir de R$ ${filtrosAplicados.valorMin}`);
    }
    if (filtrosAplicados.valorMax) {
      chips.push(`Até R$ ${filtrosAplicados.valorMax}`);
    }
    if (filtrosAplicados.areaMin) chips.push(`${filtrosAplicados.areaMin}+ m²`);
    if (filtrosAplicados.areaMax) chips.push(`Até ${filtrosAplicados.areaMax} m²`);
    return chips;
  }, [buscaAplicada, filtrosAplicados]);

  function atualizarForm<K extends keyof FormImovel>(chave: K, valor: string) {
    setForm((atual) => ({ ...atual, [chave]: valor }));
  }

  function atualizarFiltro<K extends keyof FiltrosImoveis>(
    chave: K,
    valor: string
  ) {
    setFiltros((atual) => ({ ...atual, [chave]: valor }));
  }

  function aplicarFiltros() {
    setPagina(1);
    setBuscaAplicada(busca.trim());
    setFiltrosAplicados({
      ...filtros,
      cidade: filtros.cidade.trim(),
      estado: filtros.estado.trim().toUpperCase(),
    });
  }

  function limparFiltros() {
    setBusca("");
    setBuscaAplicada("");
    setFiltros(FILTROS_INICIAIS);
    setFiltrosAplicados(FILTROS_INICIAIS);
    setPagina(1);
  }

  function abrirNovo() {
    setEditandoId(null);
    setForm(FORM_INICIAL);
    setErro("");
    setModalCadastro(true);
  }

  function editarImovel(imovel: Imovel) {
    setImovelDetalhe(null);
    setEditandoId(imovel.id);
    setForm(formFromImovel(imovel));
    setErro("");
    setModalCadastro(true);
  }

  function abrirDetalhes(imovel: Imovel) {
    setFotoAtiva(0);
    setImovelDetalhe(imovel);
  }

  async function salvarImovel() {
    if (!form.titulo.trim()) {
      setErro("Informe o título do imóvel.");
      return;
    }

    setSalvando(true);
    setErro("");

    try {
      const fotos = form.fotos
        .split(/\r?\n/)
        .map((url) => url.trim())
        .filter(Boolean);
      const response = await fetch(
        editandoId ? `/api/imoveis/${editandoId}` : "/api/imoveis",
        {
          method: editandoId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, fotos }),
        }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Erro ao salvar imóvel.");

      setMensagem(data.message || "Imóvel salvo com sucesso.");
      setModalCadastro(false);
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

    try {
      const response = await fetch(`/api/imoveis/${imovel.id}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Erro ao arquivar imóvel.");

      setImovelDetalhe(null);
      setMensagem(data.message || "Imóvel arquivado.");
      await carregar();
    } catch (error) {
      setErro(
        error instanceof Error ? error.message : "Erro ao arquivar imóvel."
      );
    }
  }

  function abrirOperacao(
    tipo: "publicacao" | "fila" | "leads",
    imovelId?: string
  ) {
    setImovelDetalhe(null);
    setImovelOperacaoId(imovelId ?? null);
    setModalOperacao(tipo);
  }

  const camposNumericos = useMemo(
    () =>
      [
        ["valor", "Valor"],
        ["valor_condominio", "Condomínio"],
        ["valor_iptu", "IPTU"],
        ["area_m2", "Área m²"],
        ["quartos", "Quartos"],
        ["suites", "Suítes"],
        ["banheiros", "Banheiros"],
        ["vagas", "Vagas"],
      ] as Array<[keyof FormImovel, string]>,
    []
  );
  const camposEndereco = useMemo(
    () =>
      [
        ["cep", "CEP"],
        ["logradouro", "Logradouro"],
        ["numero", "Número"],
        ["complemento", "Complemento"],
        ["bairro", "Bairro"],
        ["cidade", "Cidade"],
        ["estado", "Estado"],
      ] as Array<[keyof FormImovel, string]>,
    []
  );

  const caracteristicasDetalhe = imovelDetalhe
    ? caracteristicasDoImovel(imovelDetalhe)
    : [];

  return (
    <>
      <Header
        title="Meus imóveis"
        subtitle="Gerencie sua carteira, encontre oportunidades e publique nos principais portais."
      />
      <main className={styles.page}>
        <section className={styles.portfolioOverview}>
          <div className={styles.overviewCopy}>
            <span className={styles.eyebrow}>Carteira imobiliária</span>
            <h2>Encontre o imóvel certo em poucos segundos.</h2>
            <p>
              Consulte fotos, valores, localização, proprietário, leads e situação
              de publicação em uma única experiência.
            </p>
          </div>
          <div className={styles.overviewStats}>
            <div>
              <strong>{total}</strong>
              <span>resultados</span>
            </div>
            <div>
              <strong>{imoveis.length}</strong>
              <span>nesta página</span>
            </div>
            <div>
              <strong>{quantidadeFiltrosAtivos}</strong>
              <span>filtros ativos</span>
            </div>
          </div>
        </section>

        <section className={styles.toolbar}>
          <form
            className={styles.searchArea}
            onSubmit={(event) => {
              event.preventDefault();
              aplicarFiltros();
            }}
          >
            <div className={styles.searchInputWrap}>
              <Search size={18} aria-hidden="true" />
              <input
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
                placeholder="Buscar por título, código, rua, bairro ou cidade"
                aria-label="Buscar imóveis"
              />
            </div>
            <button className={styles.searchButton} type="submit">
              Buscar
            </button>
            <button
              className={`${styles.secondaryButton} ${
                filtrosAbertos || quantidadeFiltrosAtivos > 0
                  ? styles.filterButtonActive
                  : ""
              }`}
              type="button"
              onClick={() => setFiltrosAbertos((aberto) => !aberto)}
              aria-expanded={filtrosAbertos}
            >
              <SlidersHorizontal size={17} />
              Filtros
              {quantidadeFiltrosAtivos > 0 ? (
                <span className={styles.filterCount}>{quantidadeFiltrosAtivos}</span>
              ) : null}
            </button>
          </form>

          <div className={styles.toolbarActions}>
            <button
              className={`${styles.secondaryButton} ${styles.integrationButton}`}
              type="button"
              onClick={() =>
                router.push("/configuracoes-gerais#integracao-imobiliaria")
              }
            >
              <Cable size={17} />
              Integração API
            </button>
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={() => abrirOperacao("leads")}
            >
              <MessageSquareText size={17} />
              Leads
            </button>
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={() => abrirOperacao("fila")}
            >
              <ListChecks size={17} />
              Fila
            </button>
            {podeCriar ? (
              <button
                className={`${styles.primaryButton} ${styles.newPropertyButton}`}
                type="button"
                onClick={abrirNovo}
              >
                <Plus size={17} />
                Novo imóvel
              </button>
            ) : null}
          </div>

          {filtrosAbertos ? (
            <div className={styles.filterPanel}>
              <div className={styles.filterPanelHeader}>
                <div>
                  <strong>Busca avançada</strong>
                  <span>Combine critérios para refinar sua carteira.</span>
                </div>
                <button type="button" onClick={limparFiltros}>
                  Limpar tudo
                </button>
              </div>
              <div className={styles.filterGrid}>
                <label className={styles.field}>
                  <span>Finalidade</span>
                  <select
                    value={filtros.finalidade}
                    onChange={(event) =>
                      atualizarFiltro("finalidade", event.target.value)
                    }
                  >
                    <option value="">Todas</option>
                    <option value="venda">Venda</option>
                    <option value="locacao">Locação</option>
                    <option value="venda_locacao">Venda ou locação</option>
                  </select>
                </label>
                <label className={styles.field}>
                  <span>Tipo do imóvel</span>
                  <select
                    value={filtros.tipo}
                    onChange={(event) => atualizarFiltro("tipo", event.target.value)}
                  >
                    <option value="">Todos</option>
                    {TIPOS_IMOVEL.map(([codigo, label]) => (
                      <option key={codigo} value={codigo}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  <span>Status</span>
                  <select
                    value={filtros.status}
                    onChange={(event) =>
                      atualizarFiltro("status", event.target.value)
                    }
                  >
                    <option value="">Todos</option>
                    <option value="disponivel">Disponível</option>
                    <option value="reservado">Reservado</option>
                    <option value="vendido">Vendido</option>
                    <option value="alugado">Alugado</option>
                    <option value="inativo">Inativo</option>
                  </select>
                </label>
                <label className={styles.field}>
                  <span>Cidade</span>
                  <input
                    value={filtros.cidade}
                    onChange={(event) =>
                      atualizarFiltro("cidade", event.target.value)
                    }
                    placeholder="Ex.: Belo Horizonte"
                  />
                </label>
                <label className={styles.field}>
                  <span>UF</span>
                  <input
                    value={filtros.estado}
                    onChange={(event) =>
                      atualizarFiltro("estado", event.target.value.slice(0, 2))
                    }
                    maxLength={2}
                    placeholder="MG"
                  />
                </label>
                <label className={styles.field}>
                  <span>Quartos (mín.)</span>
                  <select
                    value={filtros.quartosMin}
                    onChange={(event) =>
                      atualizarFiltro("quartosMin", event.target.value)
                    }
                  >
                    <option value="">Qualquer</option>
                    <option value="1">1+</option>
                    <option value="2">2+</option>
                    <option value="3">3+</option>
                    <option value="4">4+</option>
                    <option value="5">5+</option>
                  </select>
                </label>
                <label className={styles.field}>
                  <span>Valor mínimo</span>
                  <input
                    type="number"
                    min="0"
                    inputMode="decimal"
                    value={filtros.valorMin}
                    onChange={(event) =>
                      atualizarFiltro("valorMin", event.target.value)
                    }
                    placeholder="R$ 0"
                  />
                </label>
                <label className={styles.field}>
                  <span>Valor máximo</span>
                  <input
                    type="number"
                    min="0"
                    inputMode="decimal"
                    value={filtros.valorMax}
                    onChange={(event) =>
                      atualizarFiltro("valorMax", event.target.value)
                    }
                    placeholder="Sem limite"
                  />
                </label>
                <label className={styles.field}>
                  <span>Área mínima</span>
                  <input
                    type="number"
                    min="0"
                    inputMode="decimal"
                    value={filtros.areaMin}
                    onChange={(event) =>
                      atualizarFiltro("areaMin", event.target.value)
                    }
                    placeholder="m²"
                  />
                </label>
                <label className={styles.field}>
                  <span>Área máxima</span>
                  <input
                    type="number"
                    min="0"
                    inputMode="decimal"
                    value={filtros.areaMax}
                    onChange={(event) =>
                      atualizarFiltro("areaMax", event.target.value)
                    }
                    placeholder="m²"
                  />
                </label>
                <label className={styles.field}>
                  <span>Ordenar por</span>
                  <select
                    value={filtros.ordenacao}
                    onChange={(event) =>
                      atualizarFiltro("ordenacao", event.target.value)
                    }
                  >
                    <option value="recentes">Mais recentes</option>
                    <option value="valor_asc">Menor valor</option>
                    <option value="valor_desc">Maior valor</option>
                    <option value="area_desc">Maior área</option>
                    <option value="titulo_asc">Título (A–Z)</option>
                  </select>
                </label>
              </div>
              <div className={styles.filterFooter}>
                <button
                  className={styles.secondaryButton}
                  type="button"
                  onClick={() => setFiltrosAbertos(false)}
                >
                  Fechar
                </button>
                <button
                  className={styles.primaryButton}
                  type="button"
                  onClick={aplicarFiltros}
                >
                  Ver imóveis
                </button>
              </div>
            </div>
          ) : null}
        </section>

        {erro ? <div className={styles.error}>{erro}</div> : null}

        <section className={styles.contentCard} aria-busy={carregando}>
          <div className={styles.cardHeader}>
            <div>
              <span className={styles.eyebrow}>Catálogo interno</span>
              <h2>{total === 1 ? "1 imóvel encontrado" : `${total} imóveis encontrados`}</h2>
              <p>Clique em “Ver detalhes” para abrir a apresentação completa.</p>
            </div>
            <span className={styles.badge}>
              Página {pagina} de {totalPaginas}
            </span>
          </div>

          {chipsFiltros.length > 0 ? (
            <div className={styles.activeFilters} aria-label="Filtros aplicados">
              {chipsFiltros.map((chip) => (
                <span key={chip}>{chip}</span>
              ))}
              <button type="button" onClick={limparFiltros}>
                Limpar filtros
              </button>
            </div>
          ) : null}

          {carregando ? (
            <div className={styles.propertyGrid} aria-label="Carregando imóveis">
              {Array.from({ length: 6 }).map((_, indice) => (
                <div className={styles.skeletonCard} key={indice}>
                  <div />
                  <span />
                  <span />
                  <span />
                </div>
              ))}
            </div>
          ) : imoveis.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>
                <Building2 size={30} />
              </div>
              <h3>Nenhum imóvel encontrado</h3>
              <p>Ajuste os filtros ou cadastre um novo imóvel na sua carteira.</p>
              <div>
                {quantidadeFiltrosAtivos > 0 ? (
                  <button
                    className={styles.secondaryButton}
                    type="button"
                    onClick={limparFiltros}
                  >
                    Limpar filtros
                  </button>
                ) : null}
                {podeCriar ? (
                  <button
                    className={styles.primaryButton}
                    type="button"
                    onClick={abrirNovo}
                  >
                    <Plus size={17} /> Novo imóvel
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <div className={styles.propertyGrid}>
              {imoveis.map((imovel) => {
                const publicacoes = imovel.publicacoes ?? [];
                const fotos = fotosDoImovel(imovel);
                return (
                  <article key={imovel.id} className={styles.itemCard}>
                    <button
                      className={styles.propertyImageButton}
                      type="button"
                      onClick={() => abrirDetalhes(imovel)}
                      aria-label={`Ver detalhes de ${imovel.titulo}`}
                    >
                      <div className={styles.propertyImage}>
                        {fotos[0] ? (
                          <Image
                            loader={loaderImagem}
                            unoptimized
                            src={fotos[0]}
                            alt={imovel.titulo}
                            fill
                            sizes="(max-width: 720px) 100vw, (max-width: 1050px) 50vw, 33vw"
                          />
                        ) : (
                          <div className={styles.imagePlaceholder}>
                            <Building2 size={36} />
                            <span>Adicione fotos ao imóvel</span>
                          </div>
                        )}
                        <div className={styles.imageTopbar}>
                          <span
                            className={`${styles.statusBadge} ${statusImovelClass(
                              imovel.status
                            )}`}
                          >
                            {labelStatus(imovel.status)}
                          </span>
                          {fotos.length > 0 ? (
                            <span className={styles.photoCount}>
                              <Images size={14} /> {fotos.length}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </button>

                    <div className={styles.itemBody}>
                      <div className={styles.propertyLabels}>
                        <span>{labelFinalidade(imovel.finalidade)}</span>
                        <span>{labelTipo(imovel.tipo)}</span>
                        {imovel.codigo ? <small>#{imovel.codigo}</small> : null}
                      </div>
                      <button
                        className={styles.cardTitleButton}
                        type="button"
                        onClick={() => abrirDetalhes(imovel)}
                      >
                        {imovel.titulo}
                      </button>
                      <p className={styles.locationLine}>
                        <MapPin size={15} />
                        {[imovel.bairro, imovel.cidade, imovel.estado]
                          .filter(Boolean)
                          .join(" · ") || "Localização não informada"}
                      </p>
                      <strong className={styles.propertyPrice}>
                        {formatarMoeda(imovel.valor)}
                      </strong>

                      <div className={styles.specList}>
                        {imovel.quartos !== null ? (
                          <span title="Quartos">
                            <BedDouble size={17} /> {imovel.quartos}
                          </span>
                        ) : null}
                        {imovel.banheiros !== null ? (
                          <span title="Banheiros">
                            <Bath size={17} /> {imovel.banheiros}
                          </span>
                        ) : null}
                        {imovel.vagas !== null ? (
                          <span title="Vagas">
                            <Car size={17} /> {imovel.vagas}
                          </span>
                        ) : null}
                        {imovel.area_m2 ? (
                          <span title="Área">
                            <Ruler size={17} /> {valorTexto(imovel.area_m2)} m²
                          </span>
                        ) : null}
                      </div>

                      <div className={styles.commercialSummary}>
                        <span>
                          <strong>{imovel.total_leads_portal ?? 0}</strong> leads
                        </span>
                        <span>
                          <strong>{publicacoes.length}</strong> canais
                        </span>
                        <span title={imovel.proprietario?.nome ?? "Não vinculado"}>
                          {imovel.proprietario?.nome ?? "Sem proprietário"}
                        </span>
                      </div>

                      <div className={styles.publicationSummary}>
                        {publicacoes.length === 0 ? (
                          <span
                            className={`${styles.statusBadge} ${styles.statusMuted}`}
                          >
                            Ainda não publicado
                          </span>
                        ) : (
                          publicacoes.slice(0, 2).map((publicacao) => (
                            <span
                              key={publicacao.id}
                              className={`${styles.statusBadge} ${statusPublicacaoClass(
                                publicacao.status
                              )}`}
                            >
                              {publicacao.canal_nome}: {getStatusPublicacaoLabel(publicacao.status)}
                            </span>
                          ))
                        )}
                      </div>

                      <div className={styles.itemActions}>
                        <button
                          className={styles.primaryButton}
                          type="button"
                          onClick={() => abrirDetalhes(imovel)}
                        >
                          <Eye size={16} /> Ver detalhes
                        </button>
                        <button
                          className={styles.secondaryButton}
                          type="button"
                          onClick={() => abrirOperacao("publicacao", imovel.id)}
                          aria-label={`Publicar ${imovel.titulo}`}
                          title="Publicar imóvel"
                        >
                          <UploadCloud size={16} />
                        </button>
                        {podeEditar ? (
                          <button
                            className={styles.secondaryButton}
                            type="button"
                            onClick={() => editarImovel(imovel)}
                            aria-label={`Editar ${imovel.titulo}`}
                            title="Editar imóvel"
                          >
                            <Pencil size={16} />
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {totalPaginas > 1 ? (
            <div className={styles.pagination}>
              <button
                className={styles.secondaryButton}
                type="button"
                disabled={pagina <= 1}
                onClick={() => setPagina((atual) => Math.max(1, atual - 1))}
              >
                <ChevronLeft size={16} /> Anterior
              </button>
              <span>
                {pagina} de {totalPaginas}
              </span>
              <button
                className={styles.secondaryButton}
                type="button"
                disabled={pagina >= totalPaginas}
                onClick={() =>
                  setPagina((atual) => Math.min(totalPaginas, atual + 1))
                }
              >
                Próxima <ChevronRight size={16} />
              </button>
            </div>
          ) : null}
        </section>
      </main>

      {imovelDetalhe ? (
        <div
          className={styles.modalOverlay}
          role="presentation"
          onMouseDown={() => setImovelDetalhe(null)}
        >
          <section
            className={styles.detailModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-detalhe-imovel"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className={styles.detailClose}
              type="button"
              onClick={() => setImovelDetalhe(null)}
              aria-label="Fechar detalhes do imóvel"
              autoFocus
            >
              <X size={20} />
            </button>

            <div className={styles.detailLayout}>
              <div className={styles.detailGallery}>
                <div className={styles.carouselStage}>
                  {fotosDetalhe[fotoAtiva] ? (
                    <Image
                      loader={loaderImagem}
                      unoptimized
                      src={fotosDetalhe[fotoAtiva]}
                      alt={`${imovelDetalhe.titulo} — foto ${fotoAtiva + 1}`}
                      fill
                      sizes="(max-width: 900px) 100vw, 62vw"
                      priority
                    />
                  ) : (
                    <div className={styles.detailPlaceholder}>
                      <Building2 size={54} />
                      <strong>Este imóvel ainda não possui fotos</strong>
                      <span>Edite o cadastro para adicionar a galeria.</span>
                    </div>
                  )}

                  {fotosDetalhe.length > 1 ? (
                    <>
                      <button
                        className={`${styles.carouselArrow} ${styles.carouselArrowLeft}`}
                        type="button"
                        onClick={() =>
                          setFotoAtiva((atual) =>
                            atual === 0 ? fotosDetalhe.length - 1 : atual - 1
                          )
                        }
                        aria-label="Foto anterior"
                      >
                        <ChevronLeft size={22} />
                      </button>
                      <button
                        className={`${styles.carouselArrow} ${styles.carouselArrowRight}`}
                        type="button"
                        onClick={() =>
                          setFotoAtiva((atual) =>
                            (atual + 1) % fotosDetalhe.length
                          )
                        }
                        aria-label="Próxima foto"
                      >
                        <ChevronRight size={22} />
                      </button>
                      <span className={styles.carouselCounter}>
                        <Images size={14} /> {fotoAtiva + 1} / {fotosDetalhe.length}
                      </span>
                    </>
                  ) : null}
                </div>

                {fotosDetalhe.length > 1 ? (
                  <div className={styles.thumbnailGrid} aria-label="Miniaturas das fotos">
                    {fotosDetalhe.map((foto, indice) => (
                      <button
                        className={indice === fotoAtiva ? styles.thumbnailActive : ""}
                        type="button"
                        key={`${foto}-${indice}`}
                        onClick={() => setFotoAtiva(indice)}
                        aria-label={`Abrir foto ${indice + 1}`}
                        aria-current={indice === fotoAtiva}
                      >
                        <Image
                          loader={loaderImagem}
                          unoptimized
                          src={foto}
                          alt=""
                          fill
                          sizes="120px"
                        />
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className={styles.detailContent}>
                <div className={styles.detailHeading}>
                  <div className={styles.detailBadges}>
                    <span
                      className={`${styles.statusBadge} ${statusImovelClass(
                        imovelDetalhe.status
                      )}`}
                    >
                      {labelStatus(imovelDetalhe.status)}
                    </span>
                    <span className={styles.badge}>
                      {labelFinalidade(imovelDetalhe.finalidade)}
                    </span>
                    <span className={styles.neutralBadge}>
                      {labelTipo(imovelDetalhe.tipo)}
                    </span>
                  </div>
                  <h2 id="titulo-detalhe-imovel">{imovelDetalhe.titulo}</h2>
                  <p className={styles.detailLocation}>
                    <MapPin size={17} /> {enderecoDoImovel(imovelDetalhe)}
                  </p>
                  {imovelDetalhe.codigo ? (
                    <span className={styles.propertyCode}>
                      Código #{imovelDetalhe.codigo}
                    </span>
                  ) : null}
                </div>

                <div className={styles.detailPrice}>
                  <span>Valor do imóvel</span>
                  <strong>{formatarMoeda(imovelDetalhe.valor)}</strong>
                </div>

                <div className={styles.detailSpecs}>
                  <div>
                    <BedDouble size={20} />
                    <strong>{imovelDetalhe.quartos ?? "—"}</strong>
                    <span>Quartos</span>
                  </div>
                  <div>
                    <Bath size={20} />
                    <strong>{imovelDetalhe.banheiros ?? "—"}</strong>
                    <span>Banheiros</span>
                  </div>
                  <div>
                    <Car size={20} />
                    <strong>{imovelDetalhe.vagas ?? "—"}</strong>
                    <span>Vagas</span>
                  </div>
                  <div>
                    <Ruler size={20} />
                    <strong>
                      {imovelDetalhe.area_m2
                        ? `${valorTexto(imovelDetalhe.area_m2)} m²`
                        : "—"}
                    </strong>
                    <span>Área</span>
                  </div>
                </div>

                <section className={styles.detailSection}>
                  <h3>Sobre o imóvel</h3>
                  <p>
                    {imovelDetalhe.descricao?.trim() ||
                      "Nenhuma descrição foi adicionada a este imóvel."}
                  </p>
                </section>

                {caracteristicasDetalhe.length > 0 ? (
                  <section className={styles.detailSection}>
                    <h3>Características e comodidades</h3>
                    <div className={styles.amenitiesGrid}>
                      {caracteristicasDetalhe.map((caracteristica) => (
                        <span key={caracteristica}>{caracteristica}</span>
                      ))}
                    </div>
                  </section>
                ) : null}

                <section className={styles.detailSection}>
                  <h3>Valores adicionais</h3>
                  <dl className={styles.valueList}>
                    <div>
                      <dt>Condomínio</dt>
                      <dd>{formatarMoedaDetalhada(imovelDetalhe.valor_condominio)}</dd>
                    </div>
                    <div>
                      <dt>IPTU</dt>
                      <dd>{formatarMoedaDetalhada(imovelDetalhe.valor_iptu)}</dd>
                    </div>
                  </dl>
                </section>

                <section className={styles.detailSection}>
                  <h3>Gestão comercial</h3>
                  <div className={styles.managementGrid}>
                    <div>
                      <span>Proprietário</span>
                      <strong>
                        {imovelDetalhe.proprietario?.nome ?? "Não vinculado"}
                      </strong>
                    </div>
                    <div>
                      <span>Leads dos portais</span>
                      <strong>{imovelDetalhe.total_leads_portal ?? 0}</strong>
                    </div>
                    <div>
                      <span>Publicações</span>
                      <strong>{imovelDetalhe.publicacoes?.length ?? 0}</strong>
                    </div>
                  </div>
                </section>
              </div>
            </div>

            <footer className={styles.detailFooter}>
              <div>
                {podeArquivar ? (
                  <button
                    className={styles.dangerButton}
                    type="button"
                    onClick={() => void arquivarImovel(imovelDetalhe)}
                  >
                    Arquivar
                  </button>
                ) : null}
              </div>
              <div>
                {podeEditar ? (
                  <button
                    className={styles.secondaryButton}
                    type="button"
                    onClick={() => editarImovel(imovelDetalhe)}
                  >
                    <Pencil size={16} /> Editar
                  </button>
                ) : null}
                <button
                  className={styles.primaryButton}
                  type="button"
                  onClick={() => abrirOperacao("publicacao", imovelDetalhe.id)}
                >
                  <UploadCloud size={16} /> Publicar imóvel
                </button>
              </div>
            </footer>
          </section>
        </div>
      ) : null}

      {modalCadastro ? (
        <div
          className={styles.modalOverlay}
          role="presentation"
          onMouseDown={() => setModalCadastro(false)}
        >
          <section
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-cadastro-imovel"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className={styles.modalHeader}>
              <div>
                <span className={styles.eyebrow}>
                  {editandoId ? "Editar imóvel" : "Novo imóvel"}
                </span>
                <h2 id="titulo-cadastro-imovel">
                  {editandoId ? "Atualizar cadastro" : "Cadastrar imóvel"}
                </h2>
                <p>Preencha os dados usados na carteira e nas publicações.</p>
              </div>
              <button
                className={styles.iconButton}
                type="button"
                onClick={() => setModalCadastro(false)}
                aria-label="Fechar"
              >
                <X size={20} />
              </button>
            </header>
            <div className={styles.modalBody}>
              <div className={styles.formGrid}>
                <label className={`${styles.field} ${styles.fullField}`}>
                  <span>Título *</span>
                  <input
                    value={form.titulo}
                    onChange={(event) =>
                      atualizarForm("titulo", event.target.value)
                    }
                    placeholder="Ex.: Apartamento 2 quartos no Centro"
                  />
                </label>
                <label className={styles.field}>
                  <span>Código interno</span>
                  <input
                    value={form.codigo}
                    onChange={(event) =>
                      atualizarForm("codigo", event.target.value)
                    }
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
                    {TIPOS_IMOVEL.map(([codigo, label]) => (
                      <option key={codigo} value={codigo}>
                        {label}
                      </option>
                    ))}
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
                    onChange={(event) =>
                      atualizarForm("status", event.target.value)
                    }
                  >
                    <option value="disponivel">Disponível</option>
                    <option value="reservado">Reservado</option>
                    <option value="vendido">Vendido</option>
                    <option value="alugado">Alugado</option>
                    <option value="inativo">Inativo</option>
                  </select>
                </label>
                {camposNumericos.map(([chave, label]) => (
                  <label key={chave} className={styles.field}>
                    <span>{label}</span>
                    <input
                      value={form[chave]}
                      inputMode="decimal"
                      onChange={(event) => atualizarForm(chave, event.target.value)}
                    />
                  </label>
                ))}
                {camposEndereco.map(([chave, label]) => (
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
                  <span>Fotos do imóvel</span>
                  <textarea
                    className={styles.photoTextarea}
                    value={form.fotos}
                    onChange={(event) => atualizarForm("fotos", event.target.value)}
                    placeholder={"Cole uma URL de imagem por linha\nhttps://.../sala.jpg\nhttps://.../quarto.jpg"}
                  />
                  <small>Adicione até 50 links de imagens, um por linha.</small>
                </label>
                <label className={`${styles.field} ${styles.fullField}`}>
                  <span>Descrição</span>
                  <textarea
                    value={form.descricao}
                    onChange={(event) =>
                      atualizarForm("descricao", event.target.value)
                    }
                    placeholder="Apresente os diferenciais, acabamento, localização e condições do imóvel."
                  />
                </label>
              </div>
            </div>
            <footer className={styles.modalFooter}>
              <button
                className={styles.secondaryButton}
                type="button"
                onClick={() => setModalCadastro(false)}
              >
                Cancelar
              </button>
              <button
                className={styles.primaryButton}
                type="button"
                disabled={salvando || !podeSalvar}
                onClick={() => void salvarImovel()}
              >
                {salvando ? "Salvando..." : "Salvar imóvel"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      <ImoveisOperacoesModais
        imoveis={imoveis}
        permissoes={permissoes}
        modal={modalOperacao}
        imovelInicialId={imovelOperacaoId}
        onClose={() => setModalOperacao(null)}
        onChanged={carregar}
        onError={setErro}
        onMessage={setMensagem}
      />
      {mensagem ? (
        <FeedbackToast
          success={mensagem}
          onSuccessDismiss={() => setMensagem("")}
        />
      ) : null}
    </>
  );
}
