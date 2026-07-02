"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Bath,
  BedDouble,
  Building2,
  CarFront,
  ExternalLink,
  House,
  MapPin,
  Ruler,
  Search,
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
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  quartos: number | null;
  suites: number | null;
  banheiros: number | null;
  vagas: number | null;
  area_m2: number | string | null;
  descricao: string | null;
  imagem_url: string | null;
  external_url: string | null;
  pertence_empresa_atual: boolean;
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
  if (valor === "venda") return "Venda";
  if (valor === "locacao") return "Locação";
  if (valor === "venda_locacao") return "Venda ou locação";
  return valor || "Finalidade não informada";
}

function rotuloStatus(valor: string | null) {
  if (!valor) return "Status não informado";

  return valor
    .replace(/_/g, " ")
    .replace(/^\w/, (letra) => letra.toUpperCase());
}

export default function ImoveisPage() {
  const [imoveis, setImoveis] = useState<CatalogoImovel[]>([]);
  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [total, setTotal] = useState(0);
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [origem, setOrigem] = useState("todos");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");

    try {
      const params = new URLSearchParams({
        pagina: String(pagina),
        limite: "24",
      });

      if (buscaAplicada) params.set("busca", buscaAplicada);
      if (origem !== "todos") params.set("origem", origem);

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
          : "Erro ao carregar o catálogo de imóveis."
      );
    } finally {
      setCarregando(false);
    }
  }, [buscaAplicada, origem, pagina]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function aplicarBusca() {
    setPagina(1);
    setBuscaAplicada(busca.trim());
  }

  return (
    <>
      <Header
        title="Imóveis"
        subtitle="Catálogo compartilhado entre todas as empresas do nicho imobiliário."
      />

      <main className={styles.page}>
        <section className={`${styles.toolbar} ${styles.catalogToolbar}`}>
          <div className={styles.searchArea}>
            <Search size={19} aria-hidden="true" />
            <input
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") aplicarBusca();
              }}
              placeholder="Buscar por imóvel, empresa, código, bairro ou cidade"
            />
            <button type="button" onClick={aplicarBusca}>
              Buscar
            </button>
          </div>

          <select
            className={styles.catalogFilter}
            value={origem}
            onChange={(event) => {
              setPagina(1);
              setOrigem(event.target.value);
            }}
            aria-label="Filtrar origem dos imóveis"
          >
            <option value="todos">Todas as origens</option>
            <option value="crm">Empresas do CRM</option>
            <option value="externo">Parceiros externos</option>
          </select>

          <Link href="/meus-imoveis" className={styles.primaryButton}>
            <House size={17} />
            Meus imóveis
          </Link>
        </section>

        {erro ? <div className={styles.error}>{erro}</div> : null}

        <section className={styles.contentCard}>
          <div className={styles.cardHeader}>
            <div>
              <span className={styles.eyebrow}>Catálogo imobiliário</span>
              <h2>Imóveis disponíveis no ecossistema</h2>
              <p>
                {total} {total === 1 ? "imóvel encontrado" : "imóveis encontrados"}.
              </p>
            </div>
            <span className={styles.badge}>
              Página {pagina} de {totalPaginas}
            </span>
          </div>

          {carregando ? (
            <div className={styles.empty}>Carregando imóveis...</div>
          ) : imoveis.length === 0 ? (
            <div className={styles.empty}>
              Nenhum imóvel corresponde aos filtros informados.
            </div>
          ) : (
            <div className={styles.catalogGrid}>
              {imoveis.map((imovel) => (
                <article
                  key={imovel.catalogo_id}
                  className={styles.catalogCard}
                >
                  <div className={styles.catalogImage}>
                    <div className={styles.catalogImageFallback}>
                      <Building2 size={30} />
                      <span>Imagem não informada</span>
                    </div>
                    {imovel.imagem_url ? (
                      // A imagem permanece hospedada na empresa de origem.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={imovel.imagem_url}
                        alt=""
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onError={(event) => {
                          event.currentTarget.hidden = true;
                        }}
                      />
                    ) : null}
                    <span className={styles.catalogOriginBadge}>
                      {imovel.origem_tipo === "externo"
                        ? "Parceiro externo"
                        : "Empresa do CRM"}
                    </span>
                  </div>

                  <div className={styles.catalogCardBody}>
                    <div className={styles.catalogCompany}>
                      <Building2 size={16} />
                      <strong>{imovel.empresa_nome}</strong>
                      {imovel.pertence_empresa_atual ? (
                        <span>Minha empresa</span>
                      ) : null}
                    </div>

                    <div className={styles.catalogTitleRow}>
                      <div>
                        <h3>{imovel.titulo}</h3>
                        <p>
                          {imovel.codigo ? `Cód. ${imovel.codigo} · ` : ""}
                          {imovel.tipo || "Tipo não informado"}
                        </p>
                      </div>
                      <span className={styles.statusBadge}>
                        {rotuloStatus(imovel.status)}
                      </span>
                    </div>

                    <div className={styles.catalogLocation}>
                      <MapPin size={16} />
                      <span>
                        {[imovel.bairro, imovel.cidade, imovel.estado]
                          .filter(Boolean)
                          .join(" · ") || "Localização não informada"}
                      </span>
                    </div>

                    <div className={styles.catalogFeatures}>
                      {imovel.quartos ? (
                        <span>
                          <BedDouble size={16} />
                          {imovel.quartos}
                        </span>
                      ) : null}
                      {imovel.banheiros ? (
                        <span>
                          <Bath size={16} />
                          {imovel.banheiros}
                        </span>
                      ) : null}
                      {imovel.vagas ? (
                        <span>
                          <CarFront size={16} />
                          {imovel.vagas}
                        </span>
                      ) : null}
                      {imovel.area_m2 ? (
                        <span>
                          <Ruler size={16} />
                          {imovel.area_m2} m²
                        </span>
                      ) : null}
                    </div>

                    {imovel.descricao ? (
                      <p className={styles.catalogDescription}>
                        {imovel.descricao}
                      </p>
                    ) : null}

                    <div className={styles.catalogCardFooter}>
                      <div>
                        <small>{rotuloFinalidade(imovel.finalidade)}</small>
                        <strong>{formatarMoeda(imovel.valor)}</strong>
                      </div>
                      {imovel.external_url ? (
                        <a
                          href={imovel.external_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          referrerPolicy="no-referrer"
                          className={styles.secondaryButton}
                        >
                          Ver anúncio
                          <ExternalLink size={15} />
                        </a>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          <div className={styles.catalogPagination}>
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={pagina <= 1}
              onClick={() => setPagina((atual) => Math.max(1, atual - 1))}
            >
              Anterior
            </button>
            <span>
              Página {pagina} de {totalPaginas}
            </span>
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
        </section>
      </main>
    </>
  );
}
