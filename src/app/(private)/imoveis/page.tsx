"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bath,
  BedDouble,
  Building2,
  CarFront,
  ChevronLeft,
  ChevronRight,
  Eye,
  House,
  Images,
  MapPin,
  MessageSquareText,
  Ruler,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import Header from "@/components/Header";
import CatalogPropertyModal from "@/components/imoveis/CatalogPropertyModal";
import LeadPortalModal from "@/components/imoveis/LeadPortalModal";
import {
  normalizarIntervalo,
  type OpcaoFiltroCatalogo,
  type OpcoesFiltrosCatalogo,
} from "@/lib/imoveis/catalogo-filtros";
import leadStyles from "./imoveis-leads.module.css";
import styles from "./imoveis.module.css";

type CatalogoImovel = {
  catalogo_id: string;
  origem_tipo: "crm" | "externo";
  origem_id: string;
  empresa_id: string | null;
  empresa_nome: string;
  titulo: string;
  codigo: string | null;
  tipo: string | null;
  finalidade: string | null;
  status: string | null;
  valor: number | string | null;
  valor_condominio: number | string | null;
  valor_iptu: number | string | null;
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
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
  imagens?: string[] | null;
  imagem_url: string | null;
  external_url: string | null;
  created_at: string;
  updated_at: string;
  pertence_empresa_atual: boolean;
  total_leads_portal: number;
};

type FiltrosCatalogo = {
  origem: string;
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

const FILTROS_INICIAIS: FiltrosCatalogo = {
  origem: "todos",
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

const OPCOES_FILTROS_INICIAIS: OpcoesFiltrosCatalogo = {
  origens: [],
  tipos: [],
  finalidades: [],
  status: [],
  cidades: [],
  estados: [],
};

function formatarMoeda(valor: number | string | null) {
  const numero = Number(valor ?? 0);

  if (!Number.isFinite(numero) || numero <= 0) {
    return "Valor sob consulta";
  }

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(numero);
}

function rotuloFinalidade(valor: string | null) {
  return (
    (
      {
        venda: "Venda",
        locacao: "Locação",
        venda_locacao: "Venda ou locação",
      } as Record<string, string>
    )[valor ?? ""] ??
    valor ??
    "Finalidade não informada"
  );
}

function rotuloStatus(valor: string | null) {
  if (!valor) return "Status não informado";

  return (
    (
      {
        disponivel: "Disponível",
        reservado: "Reservado",
        vendido: "Vendido",
        alugado: "Alugado",
        indisponivel: "Indisponível",
        novo: "Novo",
      } as Record<string, string>
    )[valor.toLowerCase()] ??
    valor.replace(/_/g, " ").replace(/^\w/, (letra) => letra.toUpperCase())
  );
}

function rotuloTipo(valor: string | null) {
  if (!valor) return "Tipo não informado";
  return valor
    .replace(/_/g, " ")
    .replace(/^\w/, (letra) => letra.toUpperCase());
}

function rotuloOpcaoComTotal(
  opcao: OpcaoFiltroCatalogo,
  rotulo: (valor: string) => string = (valor) => valor,
) {
  return `${rotulo(opcao.valor)} (${opcao.total})`;
}

function normalizarFaixaFormulario(minimo: string, maximo: string) {
  const faixa = normalizarIntervalo(
    minimo ? Number(minimo) : null,
    maximo ? Number(maximo) : null,
  );
  return {
    minimo: faixa.minimo === null ? "" : String(faixa.minimo),
    maximo: faixa.maximo === null ? "" : String(faixa.maximo),
  };
}

function rotuloOrigem(valor: string) {
  if (valor === "crm") return "Imóveis do CRM";
  if (valor === "externo") return "Parceiros externos";
  return "Todas as origens";
}

function statusImovelClass(status: string | null) {
  const normalizado = status?.toLowerCase();
  if (normalizado === "disponivel") return styles.catalogStatusSuccess;
  if (normalizado === "reservado" || normalizado === "novo") {
    return styles.catalogStatusWarning;
  }
  if (normalizado === "vendido" || normalizado === "alugado") {
    return styles.catalogStatusInfo;
  }
  return styles.catalogStatusMuted;
}

function fotosDoImovel(imovel: CatalogoImovel) {
  const imagens = Array.isArray(imovel.imagens) ? imovel.imagens : [];
  return Array.from(
    new Set([...(imovel.imagem_url ? [imovel.imagem_url] : []), ...imagens]),
  );
}

function extrairArea(valor: unknown) {
  if (typeof valor === "number") {
    return Number.isFinite(valor) && valor > 0 ? String(valor) : null;
  }
  if (typeof valor !== "string") return null;

  const texto = valor.trim();
  const correspondencia = texto.match(
    /(\d{1,6}(?:[.,]\d{1,2})?)\s*(?:m(?:²|2)|metros?\s+quadrados?)/i,
  );
  const numero =
    correspondencia?.[1] ?? (/^\d+(?:[.,]\d+)?$/.test(texto) ? texto : null);
  return numero?.replace(".", ",") ?? null;
}

function areaDoImovel(imovel: CatalogoImovel) {
  const areaInformada = extrairArea(imovel.area_m2);
  if (areaInformada) return areaInformada;

  const areaNasCaracteristicas = Object.entries(
    imovel.caracteristicas ?? {},
  ).find(([chave, valor]) => {
    const chaveNormalizada = chave.toLocaleLowerCase("pt-BR");
    return (
      /area|área|metragem|m2|m²/.test(chaveNormalizada) &&
      Boolean(extrairArea(valor) ?? extrairArea(`${String(valor)} m²`))
    );
  });
  if (areaNasCaracteristicas) {
    return (
      extrairArea(areaNasCaracteristicas[1]) ??
      extrairArea(`${String(areaNasCaracteristicas[1])} m²`)
    );
  }

  return extrairArea(
    [imovel.titulo, imovel.descricao].filter(Boolean).join(" "),
  );
}

function tituloDoImovel(imovel: CatalogoImovel) {
  const titulo = imovel.titulo?.replace(/\s+/g, " ").trim() ?? "";
  const descricao = imovel.descricao?.replace(/\s+/g, " ").trim() ?? "";
  const tituloPareceDescricao =
    titulo.length > 90 ||
    titulo.split(" ").filter(Boolean).length > 14 ||
    Boolean(
      descricao &&
        titulo.toLocaleLowerCase("pt-BR") ===
          descricao.toLocaleLowerCase("pt-BR"),
    );

  if (titulo && !tituloPareceDescricao) return titulo;

  const tipo =
    rotuloTipo(imovel.tipo) === "Tipo não informado"
      ? "Imóvel"
      : rotuloTipo(imovel.tipo);
  const local = imovel.bairro || imovel.cidade;

  if (local) return `${tipo} em ${local}`;
  if (imovel.codigo) return `${tipo} #${imovel.codigo}`;
  return `${tipo} disponível`;
}

export default function ImoveisPage() {
  const [imoveis, setImoveis] = useState<CatalogoImovel[]>([]);
  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [total, setTotal] = useState(0);
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [filtros, setFiltros] = useState<FiltrosCatalogo>(FILTROS_INICIAIS);
  const [filtrosAplicados, setFiltrosAplicados] =
    useState<FiltrosCatalogo>(FILTROS_INICIAIS);
  const [opcoesFiltros, setOpcoesFiltros] = useState<OpcoesFiltrosCatalogo>(
    OPCOES_FILTROS_INICIAIS,
  );
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [catalogoIdDetalhe, setCatalogoIdDetalhe] = useState<string | null>(null);
  const [imovelLeads, setImovelLeads] = useState<CatalogoImovel | null>(null);
  const [leadsAbertos, setLeadsAbertos] = useState(false);

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
      if (filtrosAplicados.origem !== "todos") {
        params.set("origem", filtrosAplicados.origem);
      }
      if (filtrosAplicados.tipo) params.set("tipo", filtrosAplicados.tipo);
      if (filtrosAplicados.finalidade) {
        params.set("finalidade", filtrosAplicados.finalidade);
      }
      if (filtrosAplicados.status) {
        params.set("status", filtrosAplicados.status);
      }
      if (filtrosAplicados.cidade) {
        params.set("cidade", filtrosAplicados.cidade);
      }
      if (filtrosAplicados.estado) {
        params.set("estado", filtrosAplicados.estado);
      }
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

      const response = await fetch(`/api/imoveis/catalogo?${params}`, {
        cache: "no-store",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Erro ao carregar o catálogo.");
      }

      setImoveis(data.imoveis ?? []);
      setOpcoesFiltros(data.opcoes_filtros ?? OPCOES_FILTROS_INICIAIS);
      setTotal(data.paginacao?.total ?? 0);
      setTotalPaginas(data.paginacao?.total_paginas ?? 1);
    } catch (error) {
      setErro(
        error instanceof Error
          ? error.message
          : "Erro ao carregar o catálogo de imóveis.",
      );
    } finally {
      setCarregando(false);
    }
  }, [buscaAplicada, filtrosAplicados, pagina]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    const imovelParam = new URLSearchParams(window.location.search)
      .get("imovel")
      ?.trim();
    if (imovelParam) setCatalogoIdDetalhe(imovelParam);
  }, []);

  const quantidadeFiltrosAtivos = useMemo(() => {
    const filtrosAtivos = Object.entries(filtrosAplicados).filter(
      ([chave, valor]) =>
        chave !== "ordenacao" &&
        !(chave === "origem" && valor === "todos") &&
        Boolean(valor),
    ).length;
    return filtrosAtivos + (buscaAplicada ? 1 : 0);
  }, [buscaAplicada, filtrosAplicados]);

  const chipsFiltros = useMemo(() => {
    const chips: string[] = [];
    if (buscaAplicada) chips.push(`Busca: ${buscaAplicada}`);
    if (filtrosAplicados.origem !== "todos") {
      chips.push(rotuloOrigem(filtrosAplicados.origem));
    }
    if (filtrosAplicados.tipo) chips.push(rotuloTipo(filtrosAplicados.tipo));
    if (filtrosAplicados.finalidade) {
      chips.push(rotuloFinalidade(filtrosAplicados.finalidade));
    }
    if (filtrosAplicados.status) {
      chips.push(rotuloStatus(filtrosAplicados.status));
    }
    if (filtrosAplicados.cidade) chips.push(filtrosAplicados.cidade);
    if (filtrosAplicados.estado) chips.push(filtrosAplicados.estado);
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
    if (filtrosAplicados.areaMax) {
      chips.push(`Até ${filtrosAplicados.areaMax} m²`);
    }
    return chips;
  }, [buscaAplicada, filtrosAplicados]);

  function atualizarFiltro<K extends keyof FiltrosCatalogo>(
    chave: K,
    valor: string,
  ) {
    setFiltros((atual) => ({ ...atual, [chave]: valor }));
  }

  function aplicarFiltros() {
    const faixaValor = normalizarFaixaFormulario(
      filtros.valorMin,
      filtros.valorMax,
    );
    const faixaArea = normalizarFaixaFormulario(
      filtros.areaMin,
      filtros.areaMax,
    );
    const filtrosNormalizados = {
      ...filtros,
      cidade: filtros.cidade.trim(),
      estado: filtros.estado.trim().toUpperCase(),
      valorMin: faixaValor.minimo,
      valorMax: faixaValor.maximo,
      areaMin: faixaArea.minimo,
      areaMax: faixaArea.maximo,
    };

    setPagina(1);
    setBuscaAplicada(busca.trim());
    setFiltros(filtrosNormalizados);
    setFiltrosAplicados(filtrosNormalizados);
  }

  function limparFiltros() {
    setBusca("");
    setBuscaAplicada("");
    setFiltros(FILTROS_INICIAIS);
    setFiltrosAplicados(FILTROS_INICIAIS);
    setPagina(1);
  }

  function abrirDetalhes(imovel: CatalogoImovel) {
    setCatalogoIdDetalhe(imovel.catalogo_id);
  }

  function abrirLeads(imovel: CatalogoImovel) {
    if (imovel.total_leads_portal <= 0) return;
    setImovelLeads(imovel);
  }

  function mudarPagina(proximaPagina: number) {
    setPagina(proximaPagina);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <>
      <Header
        title="Imóveis"
        subtitle="Catálogo compartilhado entre todas as empresas do nicho imobiliário."
      />

      <main className={styles.page}>
        <section className={`${styles.toolbar} ${styles.catalogSearchPanel}`}>
          <form
            className={styles.catalogSearchForm}
            onSubmit={(event) => {
              event.preventDefault();
              aplicarFiltros();
            }}
          >
            <div className={styles.catalogSearchInput}>
              <Search size={19} aria-hidden="true" />
              <input
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
                placeholder="Busque por imóvel, empresa, código, bairro ou cidade"
                aria-label="Buscar imóveis"
              />
            </div>
            <button className={styles.catalogSearchButton} type="submit">
              Buscar
            </button>
            <div className={styles.itemActions}>
              <button
                className={`${styles.secondaryButton} ${styles.catalogFilterButton} ${
                  filtrosAbertos || quantidadeFiltrosAtivos > 0
                    ? styles.catalogFilterButtonActive
                    : ""
                }`}
                type="button"
                onClick={() => setFiltrosAbertos((aberto) => !aberto)}
                aria-expanded={filtrosAbertos}
              >
                <SlidersHorizontal size={17} />
                Filtros
                {quantidadeFiltrosAtivos > 0 ? (
                  <span className={styles.catalogFilterCount}>
                    {quantidadeFiltrosAtivos}
                  </span>
                ) : null}
              </button>
              <button
                className={`${styles.secondaryButton} ${styles.catalogFilterButton}`}
                type="button"
                onClick={() => setLeadsAbertos(true)}
              >
                <MessageSquareText size={17} />
                Leads
              </button>
            </div>
          </form>

          <Link href="/meus-imoveis" className={styles.primaryButton}>
            <House size={17} />
            Meus imóveis
          </Link>

          {filtrosAbertos ? (
            <div className={styles.catalogAdvancedFilters}>
              <div className={styles.catalogFiltersHeader}>
                <div>
                  <strong>Busca avançada</strong>
                  <span>
                    Combine os critérios para encontrar o imóvel ideal.
                  </span>
                </div>
                <button type="button" onClick={limparFiltros}>
                  Limpar tudo
                </button>
              </div>

              <div className={styles.catalogFiltersGrid}>
                <label className={styles.catalogField}>
                  <span>Origem</span>
                  <select
                    value={filtros.origem}
                    onChange={(event) =>
                      atualizarFiltro("origem", event.target.value)
                    }
                  >
                    <option value="todos">Todas as origens</option>
                    {opcoesFiltros.origens.map((opcao) => (
                      <option key={opcao.valor} value={opcao.valor}>
                        {rotuloOpcaoComTotal(opcao, rotuloOrigem)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.catalogField}>
                  <span>Finalidade</span>
                  <select
                    value={filtros.finalidade}
                    onChange={(event) =>
                      atualizarFiltro("finalidade", event.target.value)
                    }
                  >
                    <option value="">Todas</option>
                    {opcoesFiltros.finalidades.map((opcao) => (
                      <option key={opcao.valor} value={opcao.valor}>
                        {rotuloOpcaoComTotal(opcao, rotuloFinalidade)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.catalogField}>
                  <span>Tipo do imóvel</span>
                  <select
                    value={filtros.tipo}
                    onChange={(event) =>
                      atualizarFiltro("tipo", event.target.value)
                    }
                  >
                    <option value="">Todos</option>
                    {opcoesFiltros.tipos.map((opcao) => (
                      <option key={opcao.valor} value={opcao.valor}>
                        {rotuloOpcaoComTotal(opcao, rotuloTipo)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.catalogField}>
                  <span>Status</span>
                  <select
                    value={filtros.status}
                    onChange={(event) =>
                      atualizarFiltro("status", event.target.value)
                    }
                  >
                    <option value="">Todos</option>
                    {opcoesFiltros.status.map((opcao) => (
                      <option key={opcao.valor} value={opcao.valor}>
                        {rotuloOpcaoComTotal(opcao, rotuloStatus)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.catalogField}>
                  <span>Cidade</span>
                  <select
                    value={filtros.cidade}
                    onChange={(event) =>
                      atualizarFiltro("cidade", event.target.value)
                    }
                  >
                    <option value="">Todas</option>
                    {opcoesFiltros.cidades.map((opcao) => (
                      <option key={opcao.valor} value={opcao.valor}>
                        {rotuloOpcaoComTotal(opcao)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.catalogField}>
                  <span>UF</span>
                  <select
                    value={filtros.estado}
                    onChange={(event) =>
                      atualizarFiltro("estado", event.target.value)
                    }
                  >
                    <option value="">Todas</option>
                    {opcoesFiltros.estados.map((opcao) => (
                      <option key={opcao.valor} value={opcao.valor}>
                        {rotuloOpcaoComTotal(opcao)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.catalogField}>
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
                <label className={styles.catalogField}>
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
                <label className={styles.catalogField}>
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
                <label className={styles.catalogField}>
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
                <label className={styles.catalogField}>
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
                <label className={styles.catalogField}>
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

              <div className={styles.catalogFiltersFooter}>
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

        <section className={`${styles.contentCard} ${styles.catalogResults}`}>
          <div className={styles.catalogResultsHeader}>
            <div>
              <span className={styles.eyebrow}>Catálogo imobiliário</span>
              <h2>
                {total === 1
                  ? "1 imóvel encontrado"
                  : `${total} imóveis encontrados`}
              </h2>
              <p>
                Clique em “Ver detalhes” para abrir a apresentação completa.
              </p>
            </div>
            <span className={styles.badge}>
              Página {pagina} de {totalPaginas}
            </span>
          </div>

          {chipsFiltros.length > 0 ? (
            <div
              className={styles.catalogActiveFilters}
              aria-label="Filtros aplicados"
            >
              {chipsFiltros.map((chip, indice) => (
                <span key={`${chip}-${indice}`}>{chip}</span>
              ))}
              <button type="button" onClick={limparFiltros}>
                Limpar filtros
              </button>
            </div>
          ) : null}

          {carregando ? (
            <div
              className={styles.catalogSkeletonGrid}
              aria-label="Carregando imóveis"
            >
              {Array.from({ length: 6 }).map((_, indice) => (
                <div className={styles.catalogSkeletonCard} key={indice}>
                  <div />
                  <span />
                  <span />
                  <span />
                </div>
              ))}
            </div>
          ) : imoveis.length === 0 ? (
            <div className={styles.catalogEmptyState}>
              <div>
                <Building2 size={31} />
              </div>
              <h3>Nenhum imóvel encontrado</h3>
              <p>Ajuste os filtros para ampliar os resultados do catálogo.</p>
              {quantidadeFiltrosAtivos > 0 ? (
                <button
                  className={styles.secondaryButton}
                  type="button"
                  onClick={limparFiltros}
                >
                  Limpar filtros
                </button>
              ) : null}
            </div>
          ) : (
            <div className={styles.catalogPremiumGrid}>
              {imoveis.map((imovel) => {
                const fotos = fotosDoImovel(imovel);
                const tituloExibicao = tituloDoImovel(imovel);
                const areaExibicao = areaDoImovel(imovel);
                const temLeads = imovel.total_leads_portal > 0;

                return (
                  <article
                    key={imovel.catalogo_id}
                    className={styles.catalogPremiumCard}
                  >
                    <button
                      className={styles.catalogMediaButton}
                      type="button"
                      onClick={() => abrirDetalhes(imovel)}
                      aria-label={`Ver detalhes de ${tituloExibicao}`}
                    >
                      <div className={styles.catalogPremiumMedia}>
                        {fotos[0] ? (
                          <img
                            src={fotos[0]}
                            alt={tituloExibicao}
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            onError={(event) => {
                              event.currentTarget.hidden = true;
                            }}
                          />
                        ) : (
                          <div className={styles.catalogPremiumPlaceholder}>
                            <Building2 size={38} />
                            <span>Imagem não informada</span>
                          </div>
                        )}
                        <div className={styles.catalogMediaTopbar}>
                          {fotos.length > 0 ? (
                            <span className={styles.catalogPhotoCount}>
                              <Images size={14} />
                              <span>1 / {fotos.length}</span>
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </button>

                    <div className={styles.catalogPremiumBody}>
                      <div className={styles.catalogPropertyLabels}>
                        <span>{rotuloFinalidade(imovel.finalidade)}</span>
                        <span>{rotuloTipo(imovel.tipo)}</span>
                        {imovel.codigo ? <small>#{imovel.codigo}</small> : null}
                      </div>

                      <button
                        className={styles.catalogCardTitle}
                        type="button"
                        onClick={() => abrirDetalhes(imovel)}
                      >
                        {tituloExibicao}
                      </button>

                      <p className={styles.catalogLocationLine}>
                        <MapPin size={15} />
                        {[imovel.bairro, imovel.cidade, imovel.estado]
                          .filter(Boolean)
                          .join(" · ") || "Localização não informada"}
                      </p>

                      <strong className={styles.catalogPropertyPrice}>
                        {formatarMoeda(imovel.valor)}
                      </strong>

                      <div className={styles.catalogSpecList}>
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
                            <CarFront size={17} /> {imovel.vagas}
                          </span>
                        ) : null}
                        {areaExibicao ? (
                          <span title="Área">
                            <Ruler size={17} /> {areaExibicao} m²
                          </span>
                        ) : null}
                      </div>

                      <div className={styles.catalogCardSummary}>
                        <span>Descrição</span>
                        <p className={styles.catalogCardDescription}>
                          {imovel.descricao?.trim() ||
                            "Consulte a apresentação completa para ver as informações deste imóvel."}
                        </p>
                      </div>

                      <div
                        className={`${styles.catalogCompanyRow} ${
                          imovel.origem_tipo === "externo"
                            ? styles.catalogPartnerRow
                            : ""
                        }`}
                      >
                        {imovel.origem_tipo === "externo" ? (
                          <>
                            <img
                              src="/images/partners/rede-inova.png"
                              alt="Logo Rede Inova"
                            />
                            <strong>Rede Inova</strong>
                          </>
                        ) : (
                          <>
                            <Building2 size={15} />
                            <strong>{imovel.empresa_nome}</strong>
                            {imovel.pertence_empresa_atual ? (
                              <span>Minha empresa</span>
                            ) : null}
                          </>
                        )}
                      </div>

                      <div
                        className={`${styles.catalogCardActions} ${
                          temLeads ? leadStyles.cardActionsWithLead : ""
                        }`}
                      >
                        <span
                          className={`${styles.catalogStatusBadge} ${statusImovelClass(
                            imovel.status,
                          )}`}
                        >
                          {rotuloStatus(imovel.status)}
                        </span>
                        <div
                          className={`${styles.itemActions} ${leadStyles.cardLeadActions}`}
                        >
                          {temLeads ? (
                            <button
                              className={`${styles.secondaryButton} ${leadStyles.cardActionButton}`}
                              type="button"
                              onClick={() => abrirLeads(imovel)}
                              aria-label={`Abrir leads de ${tituloExibicao}`}
                            >
                              <MessageSquareText size={16} /> Lead
                            </button>
                          ) : null}
                          <button
                            className={`${styles.primaryButton} ${leadStyles.cardActionButton}`}
                            type="button"
                            onClick={() => abrirDetalhes(imovel)}
                          >
                            <Eye size={16} /> Ver detalhes
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {totalPaginas > 1 ? (
            <div className={styles.catalogPagination}>
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={pagina <= 1}
                onClick={() => mudarPagina(Math.max(1, pagina - 1))}
              >
                <ChevronLeft size={16} /> Anterior
              </button>
              <span>
                Página {pagina} de {totalPaginas}
              </span>
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={pagina >= totalPaginas}
                onClick={() => mudarPagina(Math.min(totalPaginas, pagina + 1))}
              >
                Próxima <ChevronRight size={16} />
              </button>
            </div>
          ) : null}
        </section>
      </main>

      {catalogoIdDetalhe ? (
        <CatalogPropertyModal
          catalogoId={catalogoIdDetalhe}
          onClose={() => setCatalogoIdDetalhe(null)}
        />
      ) : null}

      {leadsAbertos ? (
        <LeadPortalModal onClose={() => setLeadsAbertos(false)} />
      ) : null}

      {imovelLeads ? (
        <LeadPortalModal
          onClose={() => setImovelLeads(null)}
          scope={{
            imovelId:
              imovelLeads.origem_tipo === "crm" ? imovelLeads.origem_id : null,
            imovelExternoId:
              imovelLeads.origem_tipo === "externo"
                ? imovelLeads.origem_id
                : null,
            titulo: tituloDoImovel(imovelLeads),
            codigo: imovelLeads.codigo,
          }}
        />
      ) : null}
    </>
  );
}
