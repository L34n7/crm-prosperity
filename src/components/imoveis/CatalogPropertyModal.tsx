"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Bath,
  BedDouble,
  Building2,
  CalendarDays,
  CarFront,
  ExternalLink,
  House,
  Images,
  MapPin,
  MessageSquareText,
  Ruler,
  X,
} from "lucide-react";
import CatalogImageLightbox from "@/components/imoveis/CatalogImageLightbox";
import LeadPortalModal from "@/components/imoveis/LeadPortalModal";
import { bloquearScrollBody } from "@/lib/ui/body-scroll-lock";
import leadStyles from "@/app/(private)/imoveis/imoveis-leads.module.css";
import styles from "@/app/(private)/imoveis/imoveis.module.css";

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
  proprietario?: {
    nome: string | null;
    email: string | null;
    telefone: string | null;
  } | null;
};
type Props = { catalogoId: string; onClose: () => void };
function formatarMoeda(valor: number | string | null) {
  const numero = Number(valor ?? 0);
  if (!Number.isFinite(numero) || numero <= 0) return "Valor sob consulta";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(numero);
}
function formatarMoedaDetalhada(valor: number | string | null) {
  const numero = Number(valor ?? 0);
  if (!Number.isFinite(numero) || numero <= 0) return "Não informado";
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
function statusImovelClass(status: string | null) {
  const normalizado = status?.toLowerCase();
  if (normalizado === "disponivel") return styles.catalogStatusSuccess;
  if (normalizado === "reservado" || normalizado === "novo")
    return styles.catalogStatusWarning;
  if (normalizado === "vendido" || normalizado === "alugado")
    return styles.catalogStatusInfo;
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
      imovel.origem_tipo === "externo" &&
      chave.toLocaleLowerCase("pt-BR") === "andar"
    )
      return [];
    if (
      valor === false ||
      valor === null ||
      valor === undefined ||
      valor === ""
    )
      return [];
    if (valor === true) return [formatarChave(chave)];
    if (["string", "number"].includes(typeof valor))
      return [`${formatarChave(chave)}: ${String(valor)}`];
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
  if (typeof valor === "number")
    return Number.isFinite(valor) && valor > 0 ? String(valor) : null;
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
  if (areaNasCaracteristicas)
    return (
      extrairArea(areaNasCaracteristicas[1]) ??
      extrairArea(`${String(areaNasCaracteristicas[1])} m²`)
    );
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
export default function CatalogPropertyModal({ catalogoId, onClose }: Props) {
  const [imovel, setImovel] = useState<CatalogoImovel | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [fotoAtiva, setFotoAtiva] = useState(0);
  const [galeriaAberta, setGaleriaAberta] = useState(false);
  const [leadsAbertos, setLeadsAbertos] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setCarregando(true);
    setErro("");
    setImovel(null);
    setFotoAtiva(0);
    setGaleriaAberta(false);
    setLeadsAbertos(false);
    fetch(
      `/api/imoveis/catalogo?imovel=${encodeURIComponent(catalogoId)}&limite=1`,
      { cache: "no-store", signal: controller.signal },
    )
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || !data?.ok)
          throw new Error(data?.error || "Erro ao carregar o imóvel.");
        const encontrado = (data.imoveis?.[0] ?? null) as CatalogoImovel | null;
        if (!encontrado) throw new Error("Imóvel não encontrado no catálogo.");
        setImovel(encontrado);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setErro(
          error instanceof Error ? error.message : "Erro ao carregar o imóvel.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setCarregando(false);
      });
    return () => controller.abort();
  }, [catalogoId]);
  useEffect(() => bloquearScrollBody(), []);
  const fotos = useMemo(() => (imovel ? fotosDoImovel(imovel) : []), [imovel]);
  const caracteristicas = useMemo(
    () => (imovel ? caracteristicasDoImovel(imovel) : []),
    [imovel],
  );
  const area = useMemo(() => (imovel ? areaDoImovel(imovel) : null), [imovel]);
  const urlMapa = useMemo(
    () => (imovel ? urlMapaDoImovel(imovel) : null),
    [imovel],
  );
  useEffect(() => {
    function aoPressionarTecla(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (leadsAbertos) return;
        if (galeriaAberta) setGaleriaAberta(false);
        else onClose();
      }
      if (galeriaAberta && event.key === "ArrowLeft" && fotos.length > 1)
        setFotoAtiva((atual) => (atual === 0 ? fotos.length - 1 : atual - 1));
      if (galeriaAberta && event.key === "ArrowRight" && fotos.length > 1)
        setFotoAtiva((atual) => (atual + 1) % fotos.length);
    }
    document.addEventListener("keydown", aoPressionarTecla);
    return () => document.removeEventListener("keydown", aoPressionarTecla);
  }, [fotos.length, galeriaAberta, leadsAbertos, onClose]);
  function abrirGaleria(indice = 0) {
    setFotoAtiva(indice);
    setGaleriaAberta(true);
  }
  return (
    <>
      <div
        className={styles.catalogModalOverlay}
        role="presentation"
        onMouseDown={onClose}
      >
        <section
          className={styles.catalogDetailModal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="titulo-catalogo-imovel-compartilhado"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button
            className={styles.catalogDetailClose}
            type="button"
            onClick={onClose}
            aria-label="Fechar detalhes do imóvel"
            autoFocus
          >
            <X size={20} />
          </button>
          {carregando || erro || !imovel ? (
            <div className={styles.catalogDetailScroll}>
              <div className={styles.catalogDetailPlaceholder}>
                <Building2 size={55} />
                <strong>
                  {carregando
                    ? "Carregando imóvel..."
                    : erro || "Imóvel não encontrado"}
                </strong>
                <span>
                  {carregando
                    ? "Buscando os dados mais recentes do catálogo."
                    : "Feche esta janela e tente novamente."}
                </span>
              </div>
            </div>
          ) : (
            <div className={styles.catalogDetailScroll}>
              <div
                className={`${styles.catalogAlbum} ${fotos.length <= 1 ? styles.catalogAlbumSingle : ""}`}
                aria-label="Prévia das fotos do imóvel"
              >
                {fotos.length > 0 ? (
                  <>
                    <button
                      className={styles.catalogAlbumMain}
                      type="button"
                      onClick={() => abrirGaleria(0)}
                      aria-label="Ampliar foto principal"
                    >
                      <img
                        src={fotos[0]}
                        alt={`${tituloDoImovel(imovel)} — foto 1`}
                        referrerPolicy="no-referrer"
                      />
                    </button>
                    {fotos.length > 1 ? (
                      <div
                        className={styles.catalogAlbumSide}
                        data-count={Math.min(fotos.length - 1, 4)}
                      >
                        {fotos.slice(1, 5).map((foto, indice) => {
                          const indiceReal = indice + 1;
                          const ultimaPrevia =
                            indiceReal === Math.min(fotos.length - 1, 4);
                          const restantes = Math.max(fotos.length - 5, 0);
                          return (
                            <button
                              type="button"
                              key={`${foto}-${indiceReal}`}
                              onClick={() => abrirGaleria(indiceReal)}
                              aria-label={`Ampliar foto ${indiceReal + 1}`}
                            >
                              <img
                                src={foto}
                                alt={`${tituloDoImovel(imovel)} — foto ${indiceReal + 1}`}
                                referrerPolicy="no-referrer"
                              />
                              {ultimaPrevia && restantes > 0 ? (
                                <span className={styles.catalogAlbumMore}>
                                  <strong>+{restantes}</strong>Ver todas
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
                      <Images size={15} /> Ver {fotos.length}{" "}
                      {fotos.length === 1 ? "foto" : "fotos"}
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
                    <div
                      className={`${styles.catalogTitleRow} ${leadStyles.detailTitleRow}`}
                    >
                      <div className={styles.catalogDetailBadges}>
                        <span
                          className={`${styles.catalogDetailBadge} ${styles.catalogStatusBadge} ${statusImovelClass(imovel.status)}`}
                        >
                          {rotuloStatus(imovel.status)}
                        </span>
                        <span
                          className={`${styles.catalogDetailBadge} ${styles.badge}`}
                        >
                          {rotuloFinalidade(imovel.finalidade)}
                        </span>
                        <span
                          className={`${styles.catalogDetailBadge} ${styles.catalogNeutralBadge}`}
                        >
                          {rotuloTipo(imovel.tipo)}
                        </span>
                      </div>
                      {imovel.total_leads_portal > 0 ? (
                        <button
                          className={`${styles.catalogSourceLink} ${leadStyles.detailLeadButton}`}
                          type="button"
                          onClick={() => setLeadsAbertos(true)}
                          aria-label={`Abrir leads de ${tituloDoImovel(imovel)}`}
                        >
                          <MessageSquareText size={15} /> Lead
                        </button>
                      ) : null}
                    </div>
                    <h2 id="titulo-catalogo-imovel-compartilhado">
                      {tituloDoImovel(imovel)}
                    </h2>
                    <p className={styles.catalogDetailLocation}>
                      <MapPin size={17} /> {enderecoDoImovel(imovel)}
                    </p>
                    {imovel.codigo ? (
                      <span className={styles.catalogPropertyCode}>
                        Código #{imovel.codigo}
                      </span>
                    ) : null}
                  </div>
                  <div className={styles.catalogDetailPrice}>
                    <span>Valor do imóvel</span>
                    <strong>{formatarMoeda(imovel.valor)}</strong>
                  </div>
                  <div className={styles.catalogDetailSpecs}>
                    <div>
                      <BedDouble size={20} />
                      <strong>{imovel.quartos ?? "—"}</strong>
                      <span>Quartos</span>
                    </div>
                    <div>
                      <BedDouble size={20} />
                      <strong>{imovel.suites ?? "—"}</strong>
                      <span>Suítes</span>
                    </div>
                    <div>
                      <Bath size={20} />
                      <strong>{imovel.banheiros ?? "—"}</strong>
                      <span>Banheiros</span>
                    </div>
                    <div>
                      <CarFront size={20} />
                      <strong>{imovel.vagas ?? "—"}</strong>
                      <span>Vagas</span>
                    </div>
                    <div>
                      <Ruler size={20} />
                      <strong>{area ? `${area} m²` : "—"}</strong>
                      <span>Área</span>
                    </div>
                  </div>
                  <div
                    className={`${styles.catalogSourceBar} ${imovel.origem_tipo === "externo" ? styles.catalogSourcePartner : ""}`}
                  >
                    <div className={styles.catalogSourceIdentity}>
                      {imovel.origem_tipo === "externo" ? (
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
                          {imovel.origem_tipo === "externo"
                            ? "Rede Inova"
                            : imovel.empresa_nome}
                        </strong>
                      </span>
                    </div>
                    {imovel.external_url ? (
                      <a
                        href={imovel.external_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        referrerPolicy="no-referrer"
                        className={styles.catalogSourceLink}
                        aria-label="Abrir este imóvel no portal da Rede Inova"
                      >
                        Abrir <ExternalLink size={14} />
                      </a>
                    ) : imovel.pertence_empresa_atual ? (
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
                          {formatarMoedaDetalhada(imovel.valor_condominio)}
                        </dd>
                      </div>
                      <div>
                        <dt>IPTU</dt>
                        <dd>{formatarMoedaDetalhada(imovel.valor_iptu)}</dd>
                      </div>
                    </dl>
                  </section>
                  {imovel.proprietario ? (
                    <section className={styles.catalogDetailSection}>
                      <h3>Proprietário</h3>
                      <dl className={styles.catalogValueList}>
                        {imovel.proprietario.nome ? (
                          <div>
                            <dt>Nome</dt>
                            <dd>{imovel.proprietario.nome}</dd>
                          </div>
                        ) : null}
                        {imovel.proprietario.email ? (
                          <div>
                            <dt>E-mail</dt>
                            <dd>{imovel.proprietario.email}</dd>
                          </div>
                        ) : null}
                        {imovel.proprietario.telefone ? (
                          <div>
                            <dt>Telefone</dt>
                            <dd>{imovel.proprietario.telefone}</dd>
                          </div>
                        ) : null}
                      </dl>
                    </section>
                  ) : null}
                  {caracteristicas.length > 0 ? (
                    <section className={styles.catalogDetailSection}>
                      <h3>Características e comodidades</h3>
                      <div className={styles.catalogAmenitiesGrid}>
                        {caracteristicas.map((caracteristica) => (
                          <span key={caracteristica}>{caracteristica}</span>
                        ))}
                      </div>
                    </section>
                  ) : null}
                  <section className={styles.catalogDates}>
                    <CalendarDays size={18} />
                    <div>
                      <span>
                        Criado em{" "}
                        <strong>{formatarDataImovel(imovel.created_at)}</strong>
                      </span>
                      <span>
                        Atualizado em{" "}
                        <strong>{formatarDataImovel(imovel.updated_at)}</strong>
                      </span>
                    </div>
                  </section>
                </div>
                <aside className={styles.catalogDetailAside}>
                  <section className={styles.catalogDetailSection}>
                    <h3>Sobre o imóvel</h3>
                    <p>
                      {imovel.descricao?.trim() ||
                        "Nenhuma descrição foi informada para este imóvel."}
                    </p>
                  </section>
                  {urlMapa ? (
                    <section className={styles.catalogDetailSection}>
                      <div className={styles.catalogSectionHeading}>
                        <h3>Localização</h3>
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(enderecoParaMapa(imovel))}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Abrir no Maps <ExternalLink size={13} />
                        </a>
                      </div>
                      <div className={styles.catalogMapCard}>
                        <iframe
                          src={urlMapa}
                          title={`Mapa de ${tituloDoImovel(imovel)}`}
                          loading="lazy"
                          referrerPolicy="no-referrer-when-downgrade"
                        />
                      </div>
                    </section>
                  ) : null}
                </aside>
              </div>
            </div>
          )}
        </section>
      </div>
      {imovel && galeriaAberta && fotos[fotoAtiva] ? (
        <CatalogImageLightbox
          catalogoId={catalogoId}
          fotos={fotos}
          fotoAtiva={fotoAtiva}
          titulo={tituloDoImovel(imovel)}
          onFotoAtivaChange={setFotoAtiva}
          onClose={() => setGaleriaAberta(false)}
        />
      ) : null}
      {imovel && leadsAbertos ? (
        <LeadPortalModal
          onClose={() => setLeadsAbertos(false)}
          scope={{
            imovelId: imovel.origem_tipo === "crm" ? imovel.origem_id : null,
            imovelExternoId:
              imovel.origem_tipo === "externo" ? imovel.origem_id : null,
            titulo: tituloDoImovel(imovel),
            codigo: imovel.codigo,
          }}
        />
      ) : null}
    </>
  );
}