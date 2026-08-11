"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bath,
  BedDouble,
  Building2,
  CalendarDays,
  CarFront,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Eye,
  House,
  Images,
  MapPin,
  Ruler,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import Header from "@/components/Header";
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

const TIPOS_IMOVEL = [
  ["apartamento", "Apartamento"],
  ["casa", "Casa"],
  ["terreno", "Terreno"],
  ["sala_comercial", "Sala comercial"],
  ["galpao", "Galpão"],
  ["outro", "Outro"],
] as const;

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

function formatarMoedaDetalhada(valor: number | string | null) {
  const numero = Number(valor ?? 0);

  if (!Number.isFinite(numero) || numero <= 0) {
    return "Não informado";
  }

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
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
        inativo: "Inativo",
        novo: "Novo",
      } as Record<string, string>
    )[valor.toLowerCase()] ??
    valor.replace(/_/g, " ").replace(/^\w/, (letra) => letra.toUpperCase())
  );
}

function rotuloTipo(valor: string | null) {
  if (!valor) return "Tipo não informado";
  return (
    TIPOS_IMOVEL.find(([codigo]) => codigo === valor)?.[1] ??
    valor.replace(/_/g, " ").replace(/^\w/, (letra) => letra.toUpperCase())
  );
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

function formatarChave(valor: string) {
  const texto = valor.replace(/[_-]+/g, " ").trim();
  return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : valor;
}

function caracteristicasDoImovel(imovel: CatalogoImovel) {
  if (!imovel.caracteristicas) return [];

  return Object.entries(imovel.caracteristicas).flatMap(([chave, valor]) => {
    if (
      valor === false ||
      valor === null ||
      valor === undefined ||
      valor === ""
    ) {
      return [];
    }
    if (valor === true) return [formatarChave(chave)];
    if (["string", "number"].includes(typeof valor)) {
      return [`${formatarChave(chave)}: ${String(valor)}`];
    }
    return [];
  });
}

function enderecoDoImovel(imovel: CatalogoImovel) {
  const endereco = [imovel.logradouro, imovel.numero]
    .filter(Boolean)
    .join(", ");
  const localidade = [imovel.bairro, imovel.cidade, imovel.estado]
    .filter(Boolean)
    .join(" · ");
  return (
    [endereco, localidade].filter(Boolean).join(" — ") ||
    "Localização não informada"
  );
}

function enderecoParaMapa(imovel: CatalogoImovel) {
  return [
    [imovel.logradouro, imovel.numero].filter(Boolean).join(", "),
    imovel.bairro,
    imovel.cidade,
    imovel.estado,
    imovel.cep,
  ]
    .filter(Boolean)
    .join(", ");
}

function urlMapaDoImovel(imovel: CatalogoImovel) {
  const endereco = enderecoParaMapa(imovel);
  return endereco
    ? `https://www.google.com/maps?q=${encodeURIComponent(endereco)}&output=embed`
    : null;
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

function formatarDataImovel(valor: string | null | undefined) {
  if (!valor) return "Não informada";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "Não informada";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(data);
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
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [imovelDetalhe, setImovelDetalhe] = useState<CatalogoImovel | null>(
    null,
  );
  const [fotoAtiva, setFotoAtiva] = useState(0);
  const [galeriaAberta, setGaleriaAberta] = useState(false);

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
      if (filtrosAplicados.status)
        params.set("status", filtrosAplicados.status);
      if (filtrosAplicados.cidade)
        params.set("cidade", filtrosAplicados.cidade);
      if (filtrosAplicados.estado)
        params.set("estado", filtrosAplicados.estado);
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

  const fotosDetalhe = useMemo(
    () => (imovelDetalhe ? fotosDoImovel(imovelDetalhe) : []),
    [imovelDetalhe],
  );

  const caracteristicasDetalhe = useMemo(
    () => (imovelDetalhe ? caracteristicasDoImovel(imovelDetalhe) : []),
    [imovelDetalhe],
  );

  const areaDetalhe = useMemo(
    () => (imovelDetalhe ? areaDoImovel(imovelDetalhe) : null),
    [imovelDetalhe],
  );

  const urlMapaDetalhe = useMemo(
    () => (imovelDetalhe ? urlMapaDoImovel(imovelDetalhe) : null),
    [imovelDetalhe],
  );

  useEffect(() => {
    if (!imovelDetalhe) return;

    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function aoPressionarTecla(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (galeriaAberta) setGaleriaAberta(false);
        else setImovelDetalhe(null);
      }
      if (
        galeriaAberta &&
        event.key === "ArrowLeft" &&
        fotosDetalhe.length > 1
      ) {
        setFotoAtiva((atual) =>
          atual === 0 ? fotosDetalhe.length - 1 : atual - 1,
        );
      }
      if (
        galeriaAberta &&
        event.key === "ArrowRight" &&
        fotosDetalhe.length > 1
      ) {
        setFotoAtiva((atual) => (atual + 1) % fotosDetalhe.length);
      }
    }

    document.addEventListener("keydown", aoPressionarTecla);
    return () => {
      document.body.style.overflow = overflowAnterior;
      document.removeEventListener("keydown", aoPressionarTecla);
    };
  }, [fotosDetalhe.length, galeriaAberta, imovelDetalhe]);

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
    if (filtrosAplicados.areaMax)
      chips.push(`Até ${filtrosAplicados.areaMax} m²`);
    return chips;
  }, [buscaAplicada, filtrosAplicados]);

  function atualizarFiltro<K extends keyof FiltrosCatalogo>(
    chave: K,
    valor: string,
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

  function abrirDetalhes(imovel: CatalogoImovel) {
    setFotoAtiva(0);
    setGaleriaAberta(false);
    setImovelDetalhe(imovel);
  }

  function fecharDetalhes() {
    setGaleriaAberta(false);
    setImovelDetalhe(null);
  }

  function abrirGaleria(indice = 0) {
    setFotoAtiva(indice);
    setGaleriaAberta(true);
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
        <section className={styles.catalogOverview}>
          <div className={styles.catalogOverviewCopy}>
            <span className={styles.eyebrow}>Ecossistema imobiliário</span>
            <h2>Encontre oportunidades com uma busca completa.</h2>
            <p>
              Compare imóveis próprios e de parceiros, abra a apresentação com
              fotos grandes e consulte todos os detalhes sem sair do CRM.
            </p>
          </div>
          <div className={styles.catalogOverviewStats}>
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
                    <option value="crm">Imóveis do CRM</option>
                    <option value="externo">Parceiros externos</option>
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
                    <option value="venda">Venda</option>
                    <option value="locacao">Locação</option>
                    <option value="venda_locacao">Venda ou locação</option>
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
                    {TIPOS_IMOVEL.map(([codigo, label]) => (
                      <option key={codigo} value={codigo}>
                        {label}
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
                    <option value="disponivel">Disponível</option>
                    <option value="reservado">Reservado</option>
                    <option value="vendido">Vendido</option>
                    <option value="alugado">Alugado</option>
                    <option value="inativo">Inativo</option>
                  </select>
                </label>
                <label className={styles.catalogField}>
                  <span>Cidade</span>
                  <input
                    value={filtros.cidade}
                    onChange={(event) =>
                      atualizarFiltro("cidade", event.target.value)
                    }
                    placeholder="Ex.: Belo Horizonte"
                  />
                </label>
                <label className={styles.catalogField}>
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

                      <div className={styles.catalogCardActions}>
                        <span
                          className={`${styles.catalogStatusBadge} ${statusImovelClass(
                            imovel.status,
                          )}`}
                        >
                          {rotuloStatus(imovel.status)}
                        </span>
                        <button
                          className={styles.primaryButton}
                          type="button"
                          onClick={() => abrirDetalhes(imovel)}
                        >
                          <Eye size={16} /> Ver detalhes
                        </button>
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

      {imovelDetalhe ? (
        <div
          className={styles.catalogModalOverlay}
          role="presentation"
          onMouseDown={fecharDetalhes}
        >
          <section
            className={styles.catalogDetailModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-catalogo-imovel"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className={styles.catalogDetailClose}
              type="button"
              onClick={fecharDetalhes}
              aria-label="Fechar detalhes do imóvel"
              autoFocus
            >
              <X size={20} />
            </button>

            <div className={styles.catalogDetailScroll}>
              <div
                className={`${styles.catalogAlbum} ${
                  fotosDetalhe.length <= 1 ? styles.catalogAlbumSingle : ""
                }`}
                aria-label="Prévia das fotos do imóvel"
              >
                {fotosDetalhe.length > 0 ? (
                  <>
                    <button
                      className={styles.catalogAlbumMain}
                      type="button"
                      onClick={() => abrirGaleria(0)}
                      aria-label="Ampliar foto principal"
                    >
                      <img
                        src={fotosDetalhe[0]}
                        alt={`${tituloDoImovel(imovelDetalhe)} — foto 1`}
                        referrerPolicy="no-referrer"
                      />
                    </button>

                    {fotosDetalhe.length > 1 ? (
                      <div
                        className={styles.catalogAlbumSide}
                        data-count={Math.min(fotosDetalhe.length - 1, 4)}
                      >
                        {fotosDetalhe.slice(1, 5).map((foto, indice) => {
                          const indiceReal = indice + 1;
                          const ultimaPrevia =
                            indiceReal === Math.min(fotosDetalhe.length - 1, 4);
                          const restantes = Math.max(
                            fotosDetalhe.length - 5,
                            0,
                          );

                          return (
                            <button
                              type="button"
                              key={`${foto}-${indiceReal}`}
                              onClick={() => abrirGaleria(indiceReal)}
                              aria-label={`Ampliar foto ${indiceReal + 1}`}
                            >
                              <img
                                src={foto}
                                alt={`${tituloDoImovel(imovelDetalhe)} — foto ${indiceReal + 1}`}
                                referrerPolicy="no-referrer"
                              />
                              {ultimaPrevia && restantes > 0 ? (
                                <span className={styles.catalogAlbumMore}>
                                  <strong>+{restantes}</strong>
                                  Ver todas
                                </span>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}

                    <button
                      className={styles.catalogAlbumCount}
                      type="button"
                      onClick={() => abrirGaleria(0)}
                    >
                      <Images size={15} /> Ver {fotosDetalhe.length}{" "}
                      {fotosDetalhe.length === 1 ? "foto" : "fotos"}
                    </button>
                  </>
                ) : (
                  <div className={styles.catalogDetailPlaceholder}>
                    <Building2 size={55} />
                    <strong>Este imóvel ainda não possui fotos</strong>
                    <span>Confira abaixo as informações disponíveis.</span>
                  </div>
                )}
              </div>

              <div className={styles.catalogDetailBody}>
                <div className={styles.catalogDetailContent}>
                  <div className={styles.catalogDetailHeading}>
                    <div className={styles.catalogDetailBadges}>
                      <span
                        className={`${styles.catalogStatusBadge} ${statusImovelClass(
                          imovelDetalhe.status,
                        )}`}
                      >
                        {rotuloStatus(imovelDetalhe.status)}
                      </span>
                      <span className={styles.badge}>
                        {rotuloFinalidade(imovelDetalhe.finalidade)}
                      </span>
                      <span className={styles.catalogNeutralBadge}>
                        {rotuloTipo(imovelDetalhe.tipo)}
                      </span>
                    </div>

                    <h2 id="titulo-catalogo-imovel">
                      {tituloDoImovel(imovelDetalhe)}
                    </h2>
                    <p className={styles.catalogDetailLocation}>
                      <MapPin size={17} /> {enderecoDoImovel(imovelDetalhe)}
                    </p>
                    {imovelDetalhe.codigo ? (
                      <span className={styles.catalogPropertyCode}>
                        Código #{imovelDetalhe.codigo}
                      </span>
                    ) : null}
                  </div>

                  <div className={styles.catalogDetailPrice}>
                    <span>Valor do imóvel</span>
                    <strong>{formatarMoeda(imovelDetalhe.valor)}</strong>
                  </div>

                  <div className={styles.catalogDetailSpecs}>
                    <div>
                      <BedDouble size={20} />
                      <strong>{imovelDetalhe.quartos ?? "—"}</strong>
                      <span>Quartos</span>
                    </div>
                    <div>
                      <BedDouble size={20} />
                      <strong>{imovelDetalhe.suites ?? "—"}</strong>
                      <span>Suítes</span>
                    </div>
                    <div>
                      <Bath size={20} />
                      <strong>{imovelDetalhe.banheiros ?? "—"}</strong>
                      <span>Banheiros</span>
                    </div>
                    <div>
                      <CarFront size={20} />
                      <strong>{imovelDetalhe.vagas ?? "—"}</strong>
                      <span>Vagas</span>
                    </div>
                    <div>
                      <Ruler size={20} />
                      <strong>{areaDetalhe ? `${areaDetalhe} m²` : "—"}</strong>
                      <span>Área</span>
                    </div>
                  </div>

                  <div
                    className={`${styles.catalogSourceBar} ${
                      imovelDetalhe.origem_tipo === "externo"
                        ? styles.catalogSourcePartner
                        : ""
                    }`}
                  >
                    <div className={styles.catalogSourceIdentity}>
                      {imovelDetalhe.origem_tipo === "externo" ? (
                        <img
                          src="/images/partners/rede-inova.png"
                          alt="Logo Rede Inova"
                        />
                      ) : (
                        <span className={styles.catalogSourceIcon}>
                          <Building2 size={18} />
                        </span>
                      )}
                      <span>
                        <small>Portal de origem</small>
                        <strong>
                          {imovelDetalhe.origem_tipo === "externo"
                            ? "Rede Inova"
                            : imovelDetalhe.empresa_nome}
                        </strong>
                      </span>
                    </div>

                    {imovelDetalhe.external_url ? (
                      <a
                        href={imovelDetalhe.external_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        referrerPolicy="no-referrer"
                        className={styles.primaryButton}
                      >
                        Abrir no portal de origem <ExternalLink size={16} />
                      </a>
                    ) : imovelDetalhe.pertence_empresa_atual ? (
                      <Link
                        href="/meus-imoveis"
                        className={styles.secondaryButton}
                      >
                        <House size={16} /> Gerenciar imóvel
                      </Link>
                    ) : null}
                  </div>

                  <section className={styles.catalogDetailSection}>
                    <h3>Valores adicionais</h3>
                    <dl className={styles.catalogValueList}>
                      <div>
                        <dt>Condomínio</dt>
                        <dd>
                          {formatarMoedaDetalhada(
                            imovelDetalhe.valor_condominio,
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>IPTU</dt>
                        <dd>
                          {formatarMoedaDetalhada(imovelDetalhe.valor_iptu)}
                        </dd>
                      </div>
                    </dl>
                  </section>
                </div>

                <aside className={styles.catalogDetailAside}>
                  <section className={styles.catalogDetailSection}>
                    <h3>Sobre o imóvel</h3>
                    <p>
                      {imovelDetalhe.descricao?.trim() ||
                        "Nenhuma descrição foi informada para este imóvel."}
                    </p>
                  </section>

                  {caracteristicasDetalhe.length > 0 ? (
                    <section className={styles.catalogDetailSection}>
                      <h3>Características e comodidades</h3>
                      <div className={styles.catalogAmenitiesGrid}>
                        {caracteristicasDetalhe.map((caracteristica) => (
                          <span key={caracteristica}>{caracteristica}</span>
                        ))}
                      </div>
                    </section>
                  ) : null}

                  {urlMapaDetalhe ? (
                    <section className={styles.catalogDetailSection}>
                      <div className={styles.catalogSectionHeading}>
                        <h3>Localização</h3>
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                            enderecoParaMapa(imovelDetalhe),
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Abrir no Maps <ExternalLink size={13} />
                        </a>
                      </div>
                      <div className={styles.catalogMapCard}>
                        <iframe
                          src={urlMapaDetalhe}
                          title={`Mapa de ${tituloDoImovel(imovelDetalhe)}`}
                          loading="lazy"
                          referrerPolicy="no-referrer-when-downgrade"
                        />
                      </div>
                    </section>
                  ) : null}

                  <section className={styles.catalogDates}>
                    <CalendarDays size={17} />
                    <div>
                      <span>
                        Criado em{" "}
                        <strong>
                          {formatarDataImovel(imovelDetalhe.created_at)}
                        </strong>
                      </span>
                      <span>
                        Atualizado em{" "}
                        <strong>
                          {formatarDataImovel(imovelDetalhe.updated_at)}
                        </strong>
                      </span>
                    </div>
                  </section>
                </aside>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {imovelDetalhe && galeriaAberta && fotosDetalhe[fotoAtiva] ? (
        <div
          className={styles.catalogLightbox}
          role="dialog"
          aria-modal="true"
          aria-label="Galeria de fotos do imóvel"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setGaleriaAberta(false);
            }
          }}
        >
          <button
            className={styles.catalogLightboxClose}
            type="button"
            onClick={() => setGaleriaAberta(false)}
            aria-label="Fechar galeria"
            autoFocus
          >
            <X size={24} />
          </button>

          <div
            className={styles.catalogLightboxStage}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <img
              src={fotosDetalhe[fotoAtiva]}
              alt={`${tituloDoImovel(imovelDetalhe)} — foto ${fotoAtiva + 1}`}
              referrerPolicy="no-referrer"
            />
          </div>

          {fotosDetalhe.length > 1 ? (
            <>
              <button
                className={`${styles.catalogLightboxArrow} ${styles.catalogLightboxArrowLeft}`}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setFotoAtiva((atual) =>
                    atual === 0 ? fotosDetalhe.length - 1 : atual - 1,
                  );
                }}
                aria-label="Foto anterior"
              >
                <ChevronLeft size={30} />
              </button>
              <button
                className={`${styles.catalogLightboxArrow} ${styles.catalogLightboxArrowRight}`}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setFotoAtiva((atual) => (atual + 1) % fotosDetalhe.length);
                }}
                aria-label="Próxima foto"
              >
                <ChevronRight size={30} />
              </button>
            </>
          ) : null}

          <span className={styles.catalogLightboxCounter}>
            {fotoAtiva + 1} / {fotosDetalhe.length}
          </span>
        </div>
      ) : null}
    </>
  );
}
